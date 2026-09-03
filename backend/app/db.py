"""
Run history persistence.

SQLite via stdlib `sqlite3` — no ORM, matches the rest of this project's
"deliberately simple" style (see app/main.py). One `runs` table, one row
per finished run (completed or stopped).

Note: on Render's free tier the filesystem is ephemeral, so the DB resets
on every deploy/restart. That's an accepted tradeoff for now — see
render.yaml for the upgrade path (a paid persistent disk, or an external
hosted Postgres) if run history needs to survive restarts.
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

from app.schema import RunReport

DB_PATH = Path(os.environ.get("HUSKY_DB_PATH", Path(__file__).parent / "data" / "runs.db"))


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                duration_s REAL NOT NULL,
                distance_traveled REAL NOT NULL,
                replans_triggered INTEGER NOT NULL,
                obstacles_hit INTEGER NOT NULL,
                obstacles_encountered TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                status TEXT NOT NULL,
                legs TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )


def save_run(report: RunReport) -> None:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO runs (
                run_id, duration_s, distance_traveled, replans_triggered,
                obstacles_hit, obstacles_encountered, start_time, end_time, status, legs
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO NOTHING
            """,
            (
                report.run_id,
                report.duration_s,
                report.distance_traveled,
                report.replans_triggered,
                report.obstacles_hit,
                json.dumps(report.obstacles_encountered),
                report.start_time,
                report.end_time,
                report.status,
                json.dumps([leg.model_dump(mode="json") for leg in report.legs]),
            ),
        )


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["obstacles_encountered"] = json.loads(d["obstacles_encountered"])
    d["legs"] = json.loads(d["legs"])
    return d


def list_runs(limit: int = 50) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_run(run_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
    return _row_to_dict(row) if row else None
