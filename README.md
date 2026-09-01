# Husky Digital Twin

Single-robot, browser-only digital twin (no ROS), inspired by
[WareTwin](https://github.com/WayneChou-bot/WareTwin). Complex environment,
simple box-and-wheels Husky, real-time tracking, post-run report.

Phase 0 status: backend serves `/health` and a WebSocket `full` snapshot;
frontend confirms it can reach the backend. No sim logic or 3D scene yet —
that's Phase 1 onward. See `checklist.md` for the full build order.

## Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Check it's alive: `curl http://localhost:8000/health` → `{"status": "ok"}`

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — it should show "Backend status: ok" once the
backend is running (CORS is pre-configured for this origin).

## Layout

`backend/app/layout/warehouse_layout.json` is currently a 10x10 placeholder.
Phase 1 replaces it with the real (more complex) warehouse layout.

## Schema

`backend/app/schema.py` (Pydantic) and `frontend/src/schema/types.ts` (TS)
mirror each other by hand — no codegen. Update both when the schema changes.
