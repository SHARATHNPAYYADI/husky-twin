# Husky Digital Twin

A single-robot, browser-native 3D digital twin of a warehouse Husky — real-time
tracking, obstacle-triggered replanning, and a post-run report. No ROS, no
physics simulator: a deterministic Python tick loop synced live to a React
Three Fiber scene over WebSocket.

Architecture pattern (FULL snapshot + live PATCH sync, explainable real-time
robot state) inspired by [WareTwin](https://github.com/WayneChou-bot/WareTwin),
scoped down from a 20-robot fleet manager to a single robot with no ROS
dependency.

**Live demo:** https://husky-twin.vercel.app

> The backend runs on Render's free tier, kept warm by a scheduled GitHub
> Action pinging `/health` every 14 minutes. If it's ever gone unusually
> quiet, the first load may take a few extra seconds while it wakes up.

![Husky Digital Twin — warehouse overview](docs/preview.png)
![Run report panel](docs/report-panel.png)

## What it does

- **Environment**: 40×40 warehouse grid — dense racking split into two zones
  by a cross-aisle, an open staging area with chargers up front, an open back
  area behind the racking
- **Pathfinding**: 8-directional A*, corner-cut-safe, replans live around
  manually placed obstacles
- **Interaction**: click anywhere on the floor to drop a fire extinguisher —
  if it lands on the robot's current path, the robot detects it, replans
  around it, and continues, all in real time
- **Live sync**: WebSocket connection between backend and browser; robot
  position, heading, and path update every ~100ms tick
- **Report**: pops up when a run finishes — duration, distance traveled,
  replans triggered, obstacles hit, and which obstacle types were involved

## Stack

**Backend** — FastAPI, Pydantic, `websockets`, a hand-rolled A* pathfinder.
No ROS, no simulator — just a deterministic asyncio tick loop driving a
small state machine (`idle → navigating → replanning → arrived`).

**Frontend** — React, TypeScript, React Three Fiber (Three.js), zustand, Vite.

## Architecture

```
backend/
  app/
    schema.py        Pydantic models — single source of truth for the WS wire format
    layout/           warehouse layout (generator script + generated JSON)
    sim/
      pathfinding.py   A*
      engine.py         state machine + tick loop
    main.py             FastAPI app, WebSocket endpoint (FULL on connect, PATCH per tick)
frontend/
  src/
    scene/             React Three Fiber components (Warehouse, HuskyRobot, PathLine, ObstacleMarkers)
    store/              zustand store, updated by the WS client
    ws/                  WebSocket client
    components/           ReportPanel
    schema/                TS mirror of the backend schema (kept in sync by hand)
```

`backend/app/schema.py` and `frontend/src/schema/types.ts` mirror each other
by hand — no codegen. Update both when the schema changes.

## Running locally

**Backend**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Check it's alive: `curl http://localhost:8000/health` → `{"status": "ok"}`

**Frontend**
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 — click **Start Run** and the Husky should move.

## Deployment

- **Backend** → Render, deployed via the `render.yaml` Blueprint at the repo
  root. Python version is pinned to 3.12 (Render's newer default Python
  versions don't have prebuilt wheels for every pinned dependency, which
  forces a from-source build that fails in Render's sandbox). CORS origins
  are read from the `FRONTEND_ORIGINS` env var — though note this only
  governs plain HTTP requests; it doesn't gate the WebSocket connection,
  since Starlette's CORS middleware doesn't apply to WebSocket routes.
- **Frontend** → Vercel, with the project root directory set to `frontend/`
  (required in a monorepo) and `VITE_WS_URL` set to the deployed backend's
  `wss://` URL.
- **Keep-alive** → `.github/workflows/keep-alive.yml` pings the backend
  every 14 minutes using the `RENDER_BACKEND_URL` repo secret, so Render's
  free tier never sees 15 minutes of inactivity and never spins down.

## Build log

`checklist.md` has the full phase-by-phase build order this project was
built against, start to finish.