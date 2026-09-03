"""
Real-time sim engine: one Husky, one warehouse, driven tick by tick.

State machine: idle -> navigating -> (replanning -> navigating)* -> arrived
                                    \\-> (replanning -> idle, if truly stuck)

This module has no FastAPI/WebSocket dependency on purpose — it's a
small, directly testable core. Phase 3 wires an instance of
SimulationEngine into the WebSocket endpoint and a periodic tick timer.
"""

from __future__ import annotations

import math
import random
import uuid
from datetime import datetime, timezone

from app.schema import (
    Cell,
    Obstacle,
    RobotState,
    RobotStateEnum,
    RunReport,
    TaskLeg,
    WarehouseLayout,
)
from app.sim.pathfinding import build_blocked_set, find_path, path_length

DEFAULT_SPEED = 3.0  # cells per second
DEFAULT_TICK_DT = 0.1  # seconds — matches the ~100ms tick from the checklist

# Obstacle type behavior (see Obstacle in app/schema.py for the list).
BLOCKING_OBSTACLE_TYPES = {"pallet", "person"}
MOVING_OBSTACLE_TYPES = {"person"}
_MOVE_CHANCE_PER_TICK = 0.03  # ~1 step every ~3s at the default 100ms tick
_CARDINAL_STEPS: list[Cell] = [(1, 0), (-1, 0), (0, 1), (0, -1)]


def _segment_lengths(path: list[Cell]) -> list[float]:
    return [math.hypot(x2 - x1, y2 - y1) for (x1, y1), (x2, y2) in zip(path, path[1:])]


def _position_at_progress(path: list[Cell], progress: float) -> tuple[tuple[float, float], float]:
    """(x, y) position and heading (radians) at `progress` distance along `path`."""
    if len(path) == 1:
        x, y = path[0]
        return (float(x), float(y)), 0.0

    seg_lengths = _segment_lengths(path)
    total = sum(seg_lengths)

    if progress <= 0:
        x1, y1 = path[0]
        x2, y2 = path[1]
        return (float(x1), float(y1)), math.atan2(y2 - y1, x2 - x1)

    if progress >= total:
        x1, y1 = path[-2]
        x2, y2 = path[-1]
        return (float(x2), float(y2)), math.atan2(y2 - y1, x2 - x1)

    remaining = progress
    for i, seg_len in enumerate(seg_lengths):
        if remaining <= seg_len:
            x1, y1 = path[i]
            x2, y2 = path[i + 1]
            t = remaining / seg_len if seg_len > 0 else 0.0
            x = x1 + (x2 - x1) * t
            y = y1 + (y2 - y1) * t
            return (x, y), math.atan2(y2 - y1, x2 - x1)
        remaining -= seg_len

    x, y = path[-1]
    return (float(x), float(y)), 0.0


class SimulationEngine:
    """Owns the robot's live state and drives it forward one tick at a time."""

    def __init__(
        self,
        layout: WarehouseLayout,
        speed: float = DEFAULT_SPEED,
        tick_dt: float = DEFAULT_TICK_DT,
    ) -> None:
        self.layout = layout
        self.speed = speed
        self.tick_dt = tick_dt

        self.obstacles: dict[str, Obstacle] = {}
        self.obstacles_dirty: bool = False  # set on placement/movement, cleared once broadcast
        self._path: list[Cell] = [tuple(layout.start)]
        self._progress: float = 0.0

        self._run_id: str | None = None
        self._run_start: datetime | None = None
        self._obstacle_ids_hit: set[str] = set()  # individual obstacles that actually blocked the path
        self.last_report: RunReport | None = None

        self._queue: list[Cell] = []  # stops after the current target
        self._legs: list[TaskLeg] = []
        self._leg_start_distance: float = 0.0
        self._leg_start_time: datetime | None = None
        self._leg_replans_start: int = 0

        self.robot = RobotState(
            position=(float(layout.start[0]), float(layout.start[1])),
            target=tuple(layout.target),
            state=RobotStateEnum.IDLE,
        )

    # ---- public API ---------------------------------------------------

    def start_run(self, targets: list[Cell] | None = None) -> None:
        """`targets` is an ordered list of stops (a task queue). A single
        point-to-point run is just a one-item queue — the default when
        `targets` is omitted matches the original single-target behavior."""
        queue = [tuple(t) for t in targets] if targets else [tuple(self.layout.target)]
        first_target = queue[0]
        start_cell = self._current_cell()

        path = find_path(self.layout, start_cell, first_target, obstacles=self._blocking_obstacles())
        if path is None:
            raise ValueError(f"no path from {start_cell} to {first_target}")

        self._path = path
        self._progress = 0.0
        self._run_id = str(uuid.uuid4())
        self._run_start = datetime.now(timezone.utc)
        self._obstacle_ids_hit = set()
        self.last_report = None

        self._queue = queue[1:]
        self._legs = []
        self._leg_start_distance = 0.0
        self._leg_start_time = self._run_start
        self._leg_replans_start = 0

        self.robot.path = path
        self.robot.target = first_target
        self.robot.task_queue = list(self._queue)
        self.robot.distance_traveled = 0.0
        self.robot.replans = 0
        self.robot.state = RobotStateEnum.NAVIGATING
        self.robot.position = (float(start_cell[0]), float(start_cell[1]))

    def place_obstacle(self, obstacle: Obstacle) -> None:
        """Add a manually placed obstacle and check whether it affects the
        robot's current path — see _check_obstacle_impact()."""
        self.obstacles[obstacle.id] = obstacle
        self.obstacles_dirty = True
        self._check_obstacle_impact(obstacle)

    def tick(self) -> None:
        self._step_moving_obstacles()

        if self.robot.state == RobotStateEnum.REPLANNING:
            self._perform_replan()
            return

        if self.robot.state != RobotStateEnum.NAVIGATING:
            return

        total_len = path_length(self._path)
        remaining = max(0.0, total_len - self._progress)
        step = min(self.speed * self.tick_dt, remaining)

        self._progress += step
        self.robot.distance_traveled += step

        pos, heading = _position_at_progress(self._path, self._progress)
        self.robot.position = pos
        self.robot.heading = heading

        if self._progress >= total_len - 1e-9:
            self._close_current_leg()
            if self._queue:
                self._advance_to_next_leg()
            else:
                self.robot.state = RobotStateEnum.ARRIVED
                self._finish_run(status="completed")

    def reset(self) -> None:
        self._path = [tuple(self.layout.start)]
        self._progress = 0.0
        self._run_id = None
        self._run_start = None
        self._obstacle_ids_hit = set()
        self.last_report = None
        self._queue = []
        self._legs = []

        self.robot = RobotState(
            position=(float(self.layout.start[0]), float(self.layout.start[1])),
            target=tuple(self.layout.target),
            state=RobotStateEnum.IDLE,
        )

    # ---- internal -------------------------------------------------------

    def _current_cell(self) -> Cell:
        x, y = self.robot.position
        return (round(x), round(y))

    def _remaining_cells(self) -> set[Cell]:
        """Path cells at or after the robot's current segment — i.e. not yet passed."""
        seg_lengths = _segment_lengths(self._path)
        remaining = self._progress
        idx = len(self._path) - 1
        for i, seg_len in enumerate(seg_lengths):
            if remaining <= seg_len:
                idx = i
                break
            remaining -= seg_len
        return set(self._path[idx:])

    def _blocking_obstacles(self, exclude_id: str | None = None) -> list[Obstacle]:
        return [
            o for o in self.obstacles.values()
            if o.type in BLOCKING_OBSTACLE_TYPES and o.id != exclude_id
        ]

    def _check_obstacle_impact(self, obstacle: Obstacle) -> None:
        """If `obstacle` sits on the robot's remaining path: always count it
        toward this run's tally, but only flip the robot into REPLANNING
        for a blocking type. The actual replan runs on the next tick()."""
        if self.robot.state not in (RobotStateEnum.NAVIGATING, RobotStateEnum.REPLANNING):
            return

        if tuple(obstacle.cell) not in self._remaining_cells():
            return

        self._obstacle_ids_hit.add(obstacle.id)
        if obstacle.type in BLOCKING_OBSTACLE_TYPES and self.robot.state == RobotStateEnum.NAVIGATING:
            self.robot.state = RobotStateEnum.REPLANNING

    def _step_moving_obstacles(self) -> None:
        """"person" obstacles take one random cardinal step roughly every
        few seconds. Movement is skipped this tick for any obstacle whose
        only free neighbors would collide with another blocking obstacle."""
        for obstacle in list(self.obstacles.values()):
            if obstacle.type not in MOVING_OBSTACLE_TYPES:
                continue
            if random.random() > _MOVE_CHANCE_PER_TICK:
                continue

            cell = tuple(obstacle.cell)
            blocked = build_blocked_set(self.layout, self._blocking_obstacles(exclude_id=obstacle.id))
            candidates = [
                (cell[0] + dx, cell[1] + dy)
                for dx, dy in _CARDINAL_STEPS
                if 0 <= cell[0] + dx < self.layout.width and 0 <= cell[1] + dy < self.layout.height
            ]
            candidates = [c for c in candidates if c not in blocked]
            if not candidates:
                continue

            obstacle.cell = random.choice(candidates)
            self.obstacles_dirty = True
            self._check_obstacle_impact(obstacle)

    def _perform_replan(self) -> None:
        current_cell = self._current_cell()
        new_path = find_path(
            self.layout,
            current_cell,
            tuple(self.robot.target),
            obstacles=self._blocking_obstacles(),
        )

        if new_path is None:
            self._close_current_leg()
            self._finish_run(status="stopped")
            return

        self._path = new_path
        self._progress = 0.0
        self.robot.path = new_path
        self.robot.replans += 1
        self.robot.state = RobotStateEnum.NAVIGATING
        self.robot.position = (float(current_cell[0]), float(current_cell[1]))

    def _close_current_leg(self) -> None:
        """Record stats for the leg that just ended (arrived, or stopped
        because a replan couldn't find a path) before moving on."""
        now = datetime.now(timezone.utc)
        start_time = self._leg_start_time or now
        self._legs.append(
            TaskLeg(
                target=tuple(self.robot.target) if self.robot.target else self._current_cell(),
                distance_traveled=round(self.robot.distance_traveled - self._leg_start_distance, 2),
                duration_s=round((now - start_time).total_seconds(), 2),
                replans_triggered=self.robot.replans - self._leg_replans_start,
            )
        )

    def _advance_to_next_leg(self) -> None:
        """Called after arriving at the current target when more stops are
        queued — starts navigating toward the next one without ending the
        run or generating a report."""
        next_target = self._queue.pop(0)
        current_cell = self._current_cell()
        path = find_path(self.layout, current_cell, next_target, obstacles=self._blocking_obstacles())

        if path is None:
            self._finish_run(status="stopped")
            return

        self._path = path
        self._progress = 0.0
        self.robot.path = path
        self.robot.target = next_target
        self.robot.task_queue = list(self._queue)
        self.robot.state = RobotStateEnum.NAVIGATING
        self.robot.position = (float(current_cell[0]), float(current_cell[1]))

        self._leg_start_distance = self.robot.distance_traveled
        self._leg_start_time = datetime.now(timezone.utc)
        self._leg_replans_start = self.robot.replans

    def _finish_run(self, status: str) -> None:
        end_time = datetime.now(timezone.utc)
        start_time = self._run_start or end_time

        hit_types = sorted({
            self.obstacles[oid].type for oid in self._obstacle_ids_hit if oid in self.obstacles
        })

        self.last_report = RunReport(
            run_id=self._run_id or str(uuid.uuid4()),
            duration_s=round((end_time - start_time).total_seconds(), 2),
            distance_traveled=round(self.robot.distance_traveled, 2),
            replans_triggered=self.robot.replans,
            obstacles_hit=len(self._obstacle_ids_hit),
            obstacles_encountered=hit_types,
            start_time=start_time.isoformat(),
            end_time=end_time.isoformat(),
            status="completed" if status == "completed" else "stopped",
            legs=list(self._legs),
        )

        if status == "stopped":
            self.robot.state = RobotStateEnum.IDLE