"""
Phase 1 verification.

Run from backend/:
    python3 verify_phase1.py

Checks:
  - layout loads and is the expected size
  - A* finds a path from start to target
  - that path never crosses a shelf
  - that path never cuts a shelf corner
  - dropping an obstacle mid-path forces a valid reroute around it
"""

import json
import sys
from pathlib import Path

from app.schema import Obstacle, WarehouseLayout
from app.sim.pathfinding import build_blocked_set, find_path, path_length


def main() -> None:
    layout_path = Path(__file__).parent / "app" / "layout" / "warehouse_layout.json"
    layout = WarehouseLayout(**json.loads(layout_path.read_text()))
    start = tuple(layout.start)
    goal = tuple(layout.target)

    checks: list[tuple[str, bool]] = []

    checks.append((f"grid is {layout.width}x{layout.height}", layout.width == 40 and layout.height == 40))
    checks.append((f"{len(layout.shelves)} shelves defined", len(layout.shelves) > 0))

    path = find_path(layout, start, goal)
    checks.append(("baseline path found", path is not None))
    if path is None:
        _report(checks)

    checks.append(("path starts at layout.start", path[0] == start))
    checks.append(("path ends at layout.target", path[-1] == goal))

    blocked = build_blocked_set(layout)
    checks.append(("path avoids all shelves", all(cell not in blocked for cell in path)))

    no_corner_cut = True
    for (x1, y1), (x2, y2) in zip(path, path[1:]):
        dx, dy = x2 - x1, y2 - y1
        if dx != 0 and dy != 0 and (x1 + dx, y1) in blocked and (x1, y1 + dy) in blocked:
            no_corner_cut = False
    checks.append(("no illegal corner-cutting", no_corner_cut))

    mid_cell = path[len(path) // 2]
    obstacle = Obstacle(id="fire_extinguisher_test", type="fire_extinguisher", cell=mid_cell)
    rerouted = find_path(layout, start, goal, obstacles=[obstacle])
    checks.append(("reroute finds a path around a dropped obstacle", rerouted is not None))
    if rerouted:
        checks.append(("rerouted path avoids the obstacle cell", mid_cell not in rerouted))

    print(f"baseline: {len(path)} waypoints, {round(path_length(path), 2)} cells")
    if rerouted:
        print(f"rerouted: {len(rerouted)} waypoints, {round(path_length(rerouted), 2)} cells")

    _report(checks)


def _report(checks: list[tuple[str, bool]]) -> None:
    print()
    all_pass = True
    for name, ok in checks:
        print(f"[{'PASS' if ok else 'FAIL'}] {name}")
        all_pass = all_pass and ok
    print()
    print("ALL CHECKS PASSED" if all_pass else "SOME CHECKS FAILED")
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()