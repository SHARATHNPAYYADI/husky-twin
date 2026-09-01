"""
Phase 3 verification — talks to a REAL running server over a REAL WebSocket.

Start the server first, in one terminal:
    cd backend
    uvicorn app.main:app --port 8000

Then, in another terminal:
    cd backend
    python3 verify_phase3.py

Checks: FULL snapshot on connect, start_run -> navigating, an obstacle
dropped ahead on the path drives replanning -> navigating again, the
run reaches 'arrived' and a matching report is broadcast, and reset
returns the robot to idle.

Takes about 20-25s — this is a real robot moving at real tick speed,
not a sped-up simulation.
"""

import asyncio
import json
import sys

import websockets

WS_URL = "ws://localhost:8000/ws"


async def run_checks(checks: list[tuple[str, bool]]) -> None:
    async with websockets.connect(WS_URL) as ws:
        # 1. FULL snapshot on connect
        full = json.loads(await ws.recv())
        checks.append(("full snapshot received on connect", full["type"] == "full"))
        layout = full["data"]["layout"]
        robot = full["data"]["robot"]
        checks.append(("layout is 40x40", layout["width"] == 40 and layout["height"] == 40))
        checks.append(("robot starts idle", robot["state"] == "idle"))

        # 2. start_run
        await ws.send(json.dumps({"type": "start_run", "data": {}}))
        msg = json.loads(await ws.recv())
        checks.append(("start_run -> navigating", msg["data"].get("state") == "navigating"))
        path = msg["data"].get("path", [])
        checks.append(("path assigned", len(path) > 1))

        # 3. let it move, then drop an obstacle well ahead on the path
        for _ in range(5):
            await ws.recv()

        ahead_cell = path[int(len(path) * 0.6)] if path else None
        if ahead_cell:
            await ws.send(json.dumps({
                "type": "place_obstacle",
                "data": {"id": "fx_verify", "type": "fire_extinguisher", "cell": ahead_cell},
            }))

        saw_replanning = False
        saw_navigating_after = False
        report = None

        for _ in range(400):  # ~40s of headroom at 100ms/tick
            msg = json.loads(await ws.recv())
            if msg["type"] == "patch":
                state = msg["data"]["state"]
                if state == "replanning":
                    saw_replanning = True
                if saw_replanning and state == "navigating":
                    saw_navigating_after = True
            elif msg["type"] == "report":
                report = msg["data"]
                break

        checks.append(("obstacle triggered replanning", saw_replanning))
        checks.append(("resumed navigating after replan", saw_navigating_after))
        checks.append(("report received", report is not None))
        if report:
            checks.append(("report status completed", report["status"] == "completed"))
            checks.append(("report shows >=1 replan", report["replans_triggered"] >= 1))
            checks.append((
                "report lists the obstacle type",
                "fire_extinguisher" in report["obstacles_encountered"],
            ))

        # 4. reset
        await ws.send(json.dumps({"type": "reset", "data": {}}))
        msg = json.loads(await ws.recv())
        checks.append(("reset -> idle", msg["data"].get("state") == "idle"))


async def main() -> None:
    checks: list[tuple[str, bool]] = []

    try:
        await run_checks(checks)
    except OSError:
        print(f"Could not connect to {WS_URL}")
        print("Is the server running? (uvicorn app.main:app --port 8000)")
        sys.exit(1)

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
    asyncio.run(main())