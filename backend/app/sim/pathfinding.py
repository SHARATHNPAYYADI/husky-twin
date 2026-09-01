"""
8-directional A* over the warehouse grid.

Occupancy = shelves (static, from the layout) + any dynamic obstacles
passed in (manually placed at runtime — that's Phase 2/frontend).
This module only knows about a snapshot of blocked cells; it has no
notion of the tick loop or robot state.
"""

from __future__ import annotations

import heapq
import math

from app.schema import Cell, Obstacle, WarehouseLayout

# (dx, dy) for the 8 neighbor directions
_NEIGHBORS: list[Cell] = [
    (-1, 0), (1, 0), (0, -1), (0, 1),
    (-1, -1), (-1, 1), (1, -1), (1, 1),
]


def build_blocked_set(
    layout: WarehouseLayout, obstacles: list[Obstacle] | None = None
) -> set[Cell]:
    """All cells occupied by shelves or manually placed obstacles."""
    blocked: set[Cell] = set()
    for shelf in layout.shelves:
        for dx in range(shelf.w):
            for dy in range(shelf.h):
                blocked.add((shelf.x + dx, shelf.y + dy))
    if obstacles:
        for obs in obstacles:
            blocked.add(tuple(obs.cell))
    return blocked


def _octile(a: Cell, b: Cell) -> float:
    """Admissible heuristic for 8-directional movement."""
    dx, dy = abs(a[0] - b[0]), abs(a[1] - b[1])
    return (dx + dy) + (math.sqrt(2) - 2) * min(dx, dy)


def find_path(
    layout: WarehouseLayout,
    start: Cell,
    goal: Cell,
    obstacles: list[Obstacle] | None = None,
) -> list[Cell] | None:
    """Returns the cell-by-cell path from start to goal, or None if unreachable."""
    blocked = build_blocked_set(layout, obstacles)
    if start in blocked or goal in blocked:
        return None
    if not (0 <= goal[0] < layout.width and 0 <= goal[1] < layout.height):
        return None

    open_heap: list[tuple[float, Cell]] = [(0.0, start)]
    came_from: dict[Cell, Cell] = {}
    g_score: dict[Cell, float] = {start: 0.0}
    closed: set[Cell] = set()

    while open_heap:
        _, current = heapq.heappop(open_heap)
        if current == goal:
            return _reconstruct(came_from, current)
        if current in closed:
            continue
        closed.add(current)

        for dx, dy in _NEIGHBORS:
            nx, ny = current[0] + dx, current[1] + dy
            neighbor = (nx, ny)

            if not (0 <= nx < layout.width and 0 <= ny < layout.height):
                continue
            if neighbor in blocked:
                continue

            # Disallow cutting a diagonal past a blocked orthogonal cell —
            # the robot has physical width and can't squeeze through a
            # shelf corner.
            if dx != 0 and dy != 0:
                if (current[0] + dx, current[1]) in blocked or (
                    current[0], current[1] + dy
                ) in blocked:
                    continue

            step_cost = math.sqrt(2) if dx != 0 and dy != 0 else 1.0
            tentative = g_score[current] + step_cost

            if tentative < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative
                f_score = tentative + _octile(neighbor, goal)
                heapq.heappush(open_heap, (f_score, neighbor))

    return None


def _reconstruct(came_from: dict[Cell, Cell], current: Cell) -> list[Cell]:
    path = [current]
    while current in came_from:
        current = came_from[current]
        path.append(current)
    path.reverse()
    return path


def path_length(path: list[Cell]) -> float:
    """Sum of Euclidean distances between consecutive path cells."""
    total = 0.0
    for (x1, y1), (x2, y2) in zip(path, path[1:]):
        total += math.hypot(x2 - x1, y2 - y1)
    return total