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
import uuid
from datetime import datetime, timezone

from app.schema import (
    Cell,
    Obstacle,
    RobotState,
    RobotStateEnum,
    RunReport,
    WarehouseLayout,
)
from app.sim.pathfinding import find_path, path_length

DEFAULT_SPEED = 3.0  # cells per second
DEFAULT_TICK_DT = 0.1  # seconds — matches the ~100ms tick from the checklist


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
        self._path: list[Cell] = [tuple(layout.start)]
        self._progress: float = 0.0

        self._run_id: str | None = None
        self._run_start: datetime | None = None
        self._obstacle_ids_hit: set[str] = set()  # individual obstacles that actually blocked the path
        self.last_report: RunReport | None = None

        self.robot = RobotState(
            position=(float(layout.start[0]), float(layout.start[1])),
            target=tuple(layout.target),
            state=RobotStateEnum.IDLE,
        )

    # ---- public API ---------------------------------------------------

    def start_run(self, target: Cell | None = None) -> None:
        target = tuple(target) if target is not None else tuple(self.layout.target)
        start_cell = self._current_cell()

        path = find_path(self.layout, start_cell, target, obstacles=list(self.obstacles.values()))
        if path is None:
            raise ValueError(f"no path from {start_cell} to {target}")

        self._path = path
        self._progress = 0.0
        self._run_id = str(uuid.uuid4())
        self._run_start = datetime.now(timezone.utc)
        self._obstacle_ids_hit = set()
        self.last_report = None

        self.robot.path = path
        self.robot.target = target
        self.robot.distance_traveled = 0.0
        self.robot.replans = 0
        self.robot.state = RobotStateEnum.NAVIGATING
        self.robot.position = (float(start_cell[0]), float(start_cell[1]))

    def place_obstacle(self, obstacle: Obstacle) -> None:
        """Add a manually placed obstacle. If it's on the robot's remaining
        path, count it toward this run's obstacle-hit tally — even if the
        robot is already REPLANNING from a different obstacle placed a
        moment earlier — and flag REPLANNING if it isn't already. The
        actual replan runs on the next tick()."""
        self.obstacles[obstacle.id] = obstacle

        if self.robot.state not in (RobotStateEnum.NAVIGATING, RobotStateEnum.REPLANNING):
            return

        if tuple(obstacle.cell) in self._remaining_cells():
            self._obstacle_ids_hit.add(obstacle.id)
            if self.robot.state == RobotStateEnum.NAVIGATING:
                self.robot.state = RobotStateEnum.REPLANNING

    def tick(self) -> None:
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
            self.robot.state = RobotStateEnum.ARRIVED
            self._finish_run(status="completed")

    def reset(self) -> None:
        self._path = [tuple(self.layout.start)]
        self._progress = 0.0
        self._run_id = None
        self._run_start = None
        self._obstacle_ids_hit = set()
        self.last_report = None

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

    def _perform_replan(self) -> None:
        current_cell = self._current_cell()
        new_path = find_path(
            self.layout,
            current_cell,
            tuple(self.robot.target),
            obstacles=list(self.obstacles.values()),
        )

        if new_path is None:
            self._finish_run(status="stopped")
            return

        self._path = new_path
        self._progress = 0.0
        self.robot.path = new_path
        self.robot.replans += 1
        self.robot.state = RobotStateEnum.NAVIGATING
        self.robot.position = (float(current_cell[0]), float(current_cell[1]))

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
        )

        if status == "stopped":
            self.robot.state = RobotStateEnum.IDLE