"""
Wires SimulationEngine into a WebSocket endpoint.

Message protocol (matches app.schema.WSMessage):

  server -> client
    {"type": "full",      "data": {"layout": ..., "robot": ..., "obstacles": [...]}}  once, on connect
    {"type": "patch",     "data": <RobotState>}                 every tick (~100ms)
    {"type": "report",    "data": <RunReport>}                  once, when a run finishes
    {"type": "obstacles", "data": {"obstacles": [...]}}         whenever the obstacle list changes

  client -> server
    {"type": "start_run",      "data": {}}                      or {"target": [x, y]} or {"targets": [[x, y], ...]}
    {"type": "place_obstacle", "data": {"id": ..., "type": ..., "cell": [x, y]}}
    {"type": "reset",          "data": {}}

REST (app/db.py backs these with SQLite — see that module for caveats):
  GET /health
  GET /runs?limit=50          -> list of past RunReports, newest first
  GET /runs/stats             -> aggregate stats across all stored runs (for the metrics dashboard)
  GET /runs/{run_id}          -> single RunReport
  GET /layouts                -> list of saved layout summaries (no cell data)
  GET /layouts/starter        -> a freshly generated layout, as a starting point for the editor
  GET /layouts/{layout_id}    -> a saved layout's full data
  POST /layouts               -> {"name": ..., "layout": WarehouseLayout} -> save, returns {"id": ...}
  POST /layouts/{layout_id}/activate -> swap the running sim onto this layout (resets the run)

Kept deliberately simple: one shared engine, one warehouse, one robot.
"patch" sends the full robot state every tick rather than a real diff —
the payload is tiny (a handful of floats + a path list), so there's no
need for WareTwin's FULL/PATCH-diffing machinery here.
"""

import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app import db
from app.layout.generate_layout import build_layout as generate_starter_layout
from app.schema import LayoutCreateRequest, Obstacle, RobotStateEnum, WarehouseLayout, WSMessage
from app.sim.engine import SimulationEngine

LAYOUT_PATH = Path(__file__).parent / "layout" / "warehouse_layout.json"

# Local dev always works; production origins (e.g. the Vercel URL) are added
# via the FRONTEND_ORIGINS env var (comma-separated) — set on Render.
_DEFAULT_ORIGINS = ["http://localhost:5173"]


def _load_allowed_origins() -> list[str]:
    extra = [o.strip() for o in os.environ.get("FRONTEND_ORIGINS", "").split(",") if o.strip()]
    seen: set[str] = set()
    combined: list[str] = []
    for origin in _DEFAULT_ORIGINS + extra:
        if origin not in seen:
            seen.add(origin)
            combined.append(origin)
    return combined


def load_layout() -> WarehouseLayout:
    raw = json.loads(LAYOUT_PATH.read_text())
    return WarehouseLayout(**raw)


layout = load_layout()
engine = SimulationEngine(layout)
connected: set[WebSocket] = set()
_last_sent_report_id: str | None = None


def _full_snapshot() -> WSMessage:
    return WSMessage(
        type="full",
        data={
            "layout": engine.layout.model_dump(mode="json"),
            "robot": engine.robot.model_dump(mode="json"),
            "obstacles": [o.model_dump(mode="json") for o in engine.obstacles.values()],
        },
    )


async def _broadcast(message: WSMessage) -> None:
    if not connected:
        return
    payload = message.model_dump(mode="json")
    dead: list[WebSocket] = []
    for ws in connected:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        connected.discard(ws)


async def _tick_loop() -> None:
    """Broadcast only when something actually changed — staying idle sends
    nothing. This matters: broadcasting on every tick regardless of state
    would queue stray idle-state patches on every connected socket, which
    can race ahead of a client's next real command response."""
    global _last_sent_report_id
    while True:
        await asyncio.sleep(engine.tick_dt)

        state_before = engine.robot.state
        engine.tick()
        state_after = engine.robot.state

        report_ready = (
            engine.last_report is not None
            and engine.last_report.run_id != _last_sent_report_id
        )

        if state_after != RobotStateEnum.IDLE or state_before != state_after or report_ready:
            await _broadcast(WSMessage(type="patch", data=engine.robot.model_dump(mode="json")))

        if engine.obstacles_dirty:
            engine.obstacles_dirty = False
            await _broadcast(
                WSMessage(
                    type="obstacles",
                    data={"obstacles": [o.model_dump(mode="json") for o in engine.obstacles.values()]},
                )
            )

        if report_ready:
            _last_sent_report_id = engine.last_report.run_id
            db.save_run(engine.last_report)
            await _broadcast(WSMessage(type="report", data=engine.last_report.model_dump(mode="json")))


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    task = asyncio.create_task(_tick_loop())
    yield
    task.cancel()


app = FastAPI(title="Husky Digital Twin — backend", lifespan=lifespan)

# Vite's default dev server port, plus whatever FRONTEND_ORIGINS adds in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_load_allowed_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/runs")
def list_runs(limit: int = 50) -> list[dict]:
    return db.list_runs(limit=limit)


@app.get("/runs/stats")
def get_run_stats() -> dict:
    return db.get_stats()


@app.get("/runs/{run_id}")
def get_run(run_id: str):
    run = db.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    return run


@app.get("/layouts")
def list_layouts() -> list[dict]:
    return db.list_layouts()


@app.get("/layouts/starter")
def get_starter_layout() -> dict:
    """A freshly generated layout for the editor to prefill — the same
    procedural generator that produced the built-in warehouse_layout.json."""
    return generate_starter_layout()


@app.get("/layouts/{layout_id}")
def get_layout(layout_id: str) -> dict:
    saved = db.get_layout(layout_id)
    if saved is None:
        raise HTTPException(status_code=404, detail="layout not found")
    return saved


@app.post("/layouts")
def create_layout(body: LayoutCreateRequest) -> dict:
    layout_id = str(uuid.uuid4())
    db.save_layout(layout_id, body.name, body.layout)
    return {"id": layout_id}


@app.post("/layouts/{layout_id}/activate")
async def activate_layout(layout_id: str) -> dict:
    """Swaps the running sim onto a saved layout. This replaces the global
    engine outright (a fresh robot, empty obstacles) rather than trying to
    reconcile in-flight state against a different-shaped warehouse."""
    saved = db.get_layout(layout_id)
    if saved is None:
        raise HTTPException(status_code=404, detail="layout not found")

    global engine, layout, _last_sent_report_id
    layout = WarehouseLayout(**saved["layout"])
    engine = SimulationEngine(layout)
    _last_sent_report_id = None

    await _broadcast(_full_snapshot())
    return {"status": "ok"}


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    connected.add(websocket)

    await websocket.send_json(_full_snapshot().model_dump(mode="json"))

    try:
        while True:
            raw = await websocket.receive_json()
            await _handle_message(raw)
    except WebSocketDisconnect:
        pass
    finally:
        connected.discard(websocket)


async def _handle_message(raw: dict) -> None:
    global _last_sent_report_id
    try:
        msg = WSMessage(**raw)
    except Exception:
        return  # malformed message — ignore for v1

    if msg.type == "start_run":
        # "targets" (a queue of stops) takes precedence; "target" (a single
        # stop) is kept for backward compatibility — both become a queue.
        if msg.data.get("targets"):
            targets = [tuple(t) for t in msg.data["targets"]]
        elif msg.data.get("target"):
            targets = [tuple(msg.data["target"])]
        else:
            targets = None
        try:
            engine.start_run(targets=targets)
        except ValueError:
            pass  # no path from the current position — nothing to do for v1
        await _broadcast(WSMessage(type="patch", data=engine.robot.model_dump(mode="json")))

    elif msg.type == "place_obstacle":
        obstacle = Obstacle(**msg.data)
        engine.place_obstacle(obstacle)
        await _broadcast(WSMessage(type="patch", data=engine.robot.model_dump(mode="json")))

    elif msg.type == "reset":
        engine.reset()
        _last_sent_report_id = None
        await _broadcast(WSMessage(type="patch", data=engine.robot.model_dump(mode="json")))