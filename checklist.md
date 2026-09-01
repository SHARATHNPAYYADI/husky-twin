# Husky Digital Twin — Build Checklist

Single-robot, browser-only digital twin (no ROS), inspired by WareTwin.
Scope: complex environment, simple box+wheels robot, real-time tracking, post-run report.

Order matters — each phase depends on the one before it. Schema comes first because both frontend and backend build against it.

---

## Phase 0 — Foundation
- [ ] Repo + folder structure (`frontend/`, `backend/`)
- [ ] Backend: Python venv, FastAPI + Pydantic installed
- [ ] Frontend: Vite + React + TS + React Three Fiber + zustand scaffolded
- [ ] Define shared schema (do this before writing logic):
  - [ ] `warehouse_layout.json` format (grid size, shelves, chargers, start/target)
  - [ ] `robot_state` shape (position, heading, state, path, distance, replans)
  - [ ] `obstacle` shape (id, type, grid cell)
  - [ ] `run_report` shape (duration, distance, replans, obstacles hit)
  - [ ] WebSocket message format (`FULL` vs `PATCH`)

## Phase 1 — Backend: environment & pathfinding
- [ ] Write `warehouse_layout.json` (aisles, shelves, chargers) — this is the "complex" part
- [ ] Layout loader → occupancy grid
- [ ] A* pathfinder on the grid
- [ ] Test: generate a path between two points with static obstacles, no engine yet

## Phase 2 — Backend: sim engine
- [ ] Robot state machine: idle → navigating → replanning → arrived
- [ ] Tick loop (~100ms) moving robot along its path
- [ ] Distance-traveled / elapsed-time tracking
- [ ] Manual obstacle placement (e.g. fire extinguisher) triggers replan mid-path
- [ ] Replan counter increments correctly

## Phase 3 — Backend: sync & report
- [ ] WebSocket endpoint: send `FULL` state on connect, `PATCH` diffs per tick
- [ ] Handle incoming messages: place obstacle, start run, reset
- [ ] On arrival, generate `run_report` (duration, distance, replans, obstacles hit)

## Phase 4 — Frontend: scene
- [ ] R3F canvas, camera, lighting
- [ ] Render warehouse from `warehouse_layout.json` (shelves, chargers, aisles)
- [ ] Render box+wheels Husky placeholder

## Phase 5 — Frontend: live sync & interaction
- [ ] WebSocket client + zustand store (apply `FULL` then `PATCH`)
- [ ] Live robot position/heading updates each tick
- [ ] Live path line rendering
- [ ] Click-to-place obstacle → sends message to backend

## Phase 6 — Frontend: report
- [ ] Report panel/modal shown when a run completes

## Phase 7 — End-to-end test
- [ ] Full flow: start run → place obstacle mid-path → verify replan → robot arrives → report shown
- [ ] Edge cases: no obstacles, multiple obstacles, obstacle placed on an already-passed cell

## Phase 8 — Deploy
- [ ] Backend → Render/Fly.io (Dockerfile or `render.yaml`, WebSocket-capable host)
- [ ] Frontend → Vercel (static build, `VITE_WS_URL` pointed at backend)
- [ ] Deploy backend first, confirm WS URL, then deploy frontend

---
**Rule of thumb while building:** if a task doesn't serve real-time tracking or the report, cut it for v1.
