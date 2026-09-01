"""
Phase 2 verification.

Run from backend/:
    python3 verify_phase2.py
"""

import json
import sys
from pathlib import Path

from app.schema import Obstacle, RobotStateEnum, WarehouseLayout
from app.sim.engine import SimulationEngine


def load_real_layout() -> WarehouseLayout:
    layout_path = Path(__file__).parent / "app" / "layout" / "warehouse_layout.json"
    return WarehouseLayout(**json.loads(layout_path.read_text()))


def run_to_completion(engine: SimulationEngine, max_ticks: int = 2000) -> None:
    ticks = 0
    while engine.robot.state not in (RobotStateEnum.ARRIVED, RobotStateEnum.IDLE) and ticks < max_ticks:
        engine.tick()
        ticks += 1
    if ticks >= max_ticks:
        raise RuntimeError("run did not finish within max_ticks — possible stuck loop")


def main() -> None:
    checks: list[tuple[str, bool]] = []
    layout = load_real_layout()

    # --- 1. clean run, no obstacles ---
    engine = SimulationEngine(layout)
    checks.append(("initial state is idle", engine.robot.state == RobotStateEnum.IDLE))

    engine.start_run()
    checks.append(("start_run -> navigating", engine.robot.state == RobotStateEnum.NAVIGATING))
    checks.append(("path assigned", len(engine.robot.path) > 1))

    pos_before = engine.robot.position
    engine.tick()
    checks.append(("tick moves the robot", engine.robot.position != pos_before))
    checks.append(("distance_traveled increases", engine.robot.distance_traveled > 0))

    run_to_completion(engine)
    checks.append(("reaches arrived", engine.robot.state == RobotStateEnum.ARRIVED))
    checks.append(("report generated", engine.last_report is not None))
    if engine.last_report:
        checks.append(("report status completed", engine.last_report.status == "completed"))
        checks.append(("report distance > 0", engine.last_report.distance_traveled > 0))
        checks.append(("report duration >= 0", engine.last_report.duration_s >= 0))
        checks.append(("no replans on clean run", engine.last_report.replans_triggered == 0))

    # --- 2. obstacle dropped ahead on the path triggers a replan ---
    engine2 = SimulationEngine(layout)
    engine2.start_run()

    for _ in range(50):  # move partway in
        engine2.tick()

    ahead_cell = engine2.robot.path[-2]  # still ahead, near the target
    engine2.place_obstacle(Obstacle(id="fx_1", type="fire_extinguisher", cell=ahead_cell))
    checks.append(("obstacle ahead -> replanning", engine2.robot.state == RobotStateEnum.REPLANNING))

    engine2.tick()  # this tick performs the actual replan
    checks.append(("replanning -> navigating after tick", engine2.robot.state == RobotStateEnum.NAVIGATING))
    checks.append(("replans counter incremented", engine2.robot.replans == 1))
    checks.append(("new path avoids the obstacle", tuple(ahead_cell) not in engine2.robot.path))

    run_to_completion(engine2)
    checks.append(("run 2 still arrives", engine2.robot.state == RobotStateEnum.ARRIVED))
    if engine2.last_report:
        checks.append(("report reflects 1 replan", engine2.last_report.replans_triggered == 1))
        checks.append((
            "report lists obstacle type",
            "fire_extinguisher" in engine2.last_report.obstacles_encountered,
        ))

    # --- 3. obstacle placed behind the robot must NOT trigger a replan ---
    engine3 = SimulationEngine(layout)
    engine3.start_run()
    for _ in range(80):
        engine3.tick()
    behind_cell = engine3.robot.path[0]  # the very start — long since passed
    engine3.place_obstacle(Obstacle(id="fx_2", type="box", cell=behind_cell))
    checks.append(("obstacle behind -> no replan", engine3.robot.state == RobotStateEnum.NAVIGATING))
    checks.append(("replans stay at 0", engine3.robot.replans == 0))

    # --- 4. target fully blocked -> engine reports 'stopped', doesn't crash ---
    small_layout = WarehouseLayout(
        width=5, height=5, cell_size=1.0, shelves=[], chargers=[], start=(0, 0), target=(4, 4)
    )
    engine4 = SimulationEngine(small_layout, speed=10.0)
    engine4.start_run()
    engine4.place_obstacle(Obstacle(id="fx_3", type="fire_extinguisher", cell=(4, 4)))
    checks.append(("obstacle on target -> replanning", engine4.robot.state == RobotStateEnum.REPLANNING))
    engine4.tick()
    checks.append(("no path found -> state resets to idle", engine4.robot.state == RobotStateEnum.IDLE))
    checks.append((
        "report status is stopped",
        engine4.last_report is not None and engine4.last_report.status == "stopped",
    ))

    # --- 5. multiple obstacles hit across a run -> each counted individually ---
    engine5 = SimulationEngine(layout)
    engine5.start_run()

    for _ in range(30):
        engine5.tick()
    engine5.place_obstacle(Obstacle(id="fx_a", type="fire_extinguisher", cell=engine5.robot.path[-3]))
    engine5.tick()  # resolves the first replan

    for _ in range(30):
        engine5.tick()
    engine5.place_obstacle(Obstacle(id="fx_b", type="fire_extinguisher", cell=engine5.robot.path[-3]))
    engine5.tick()  # resolves the second replan

    run_to_completion(engine5)
    if engine5.last_report:
        checks.append(("two spaced-out obstacles -> obstacles_hit == 2", engine5.last_report.obstacles_hit == 2))
        checks.append(("two spaced-out obstacles -> replans == 2", engine5.last_report.replans_triggered == 2))

    # --- 6. two obstacles placed back-to-back, before the engine ticks in
    #        between -> both must still be counted even though only one
    #        replan cycle actually runs (this is the exact bug that was fixed:
    #        obstacles_hit used to silently undercount in this scenario) ---
    engine6 = SimulationEngine(layout)
    engine6.start_run()
    for _ in range(30):
        engine6.tick()

    ahead = engine6.robot.path[-3]
    further_ahead = engine6.robot.path[-2]
    engine6.place_obstacle(Obstacle(id="fx_c", type="fire_extinguisher", cell=ahead))
    # engine6.robot.state is now REPLANNING — no tick() has run yet, so the
    # second obstacle arrives while still "mid-replan" from the first
    engine6.place_obstacle(Obstacle(id="fx_d", type="box", cell=further_ahead))
    checks.append(("second obstacle while replanning -> still counted", len(engine6._obstacle_ids_hit) == 2))

    engine6.tick()  # single tick resolves both at once
    checks.append(("one tick resolves both -> replans == 1", engine6.robot.replans == 1))

    run_to_completion(engine6)
    if engine6.last_report:
        checks.append(("back-to-back obstacles -> obstacles_hit == 2", engine6.last_report.obstacles_hit == 2))
        checks.append(("back-to-back obstacles -> replans == 1", engine6.last_report.replans_triggered == 1))
        checks.append((
            "back-to-back obstacles -> both types listed",
            set(engine6.last_report.obstacles_encountered) == {"fire_extinguisher", "box"},
        ))

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