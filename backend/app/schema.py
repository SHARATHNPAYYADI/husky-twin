"""
Shared data schema for the Husky digital twin backend.

These models are the single source of truth for the sim engine and the
WebSocket wire format. The frontend TS types in
frontend/src/schema/types.ts must be kept in sync with this file by hand
(no ROS/codegen involved — this is intentionally simple).
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field

Cell = tuple[int, int]  # (x, y) grid coordinate


class RobotStateEnum(str, Enum):
    IDLE = "idle"
    NAVIGATING = "navigating"
    REPLANNING = "replanning"
    ARRIVED = "arrived"


class ShelfRect(BaseModel):
    """Axis-aligned rectangle occupying grid cells (x, y) to (x + w, y + h)."""

    x: int
    y: int
    w: int
    h: int


class WarehouseLayout(BaseModel):
    """Static environment definition, loaded once at startup."""

    width: int
    height: int
    cell_size: float = 1.0
    shelves: list[ShelfRect] = Field(default_factory=list)
    chargers: list[Cell] = Field(default_factory=list)
    start: Cell
    target: Cell


class Obstacle(BaseModel):
    """A manually placed dynamic obstacle (e.g. a fire extinguisher)."""

    id: str
    type: str  # "fire_extinguisher" | "box" | ... (free-form for v1)
    cell: Cell


class RobotState(BaseModel):
    """Live state of the single Husky, broadcast every tick."""

    id: str = "husky_01"
    position: tuple[float, float]
    heading: float = 0.0  # radians
    state: RobotStateEnum = RobotStateEnum.IDLE
    path: list[Cell] = Field(default_factory=list)
    target: Cell | None = None
    distance_traveled: float = 0.0
    replans: int = 0


class RunReport(BaseModel):
    """Summary generated once the robot reaches its target (or the run is stopped)."""

    run_id: str
    duration_s: float
    distance_traveled: float
    replans_triggered: int
    obstacles_hit: int = 0  # count of individual obstacles that actually blocked the path
    obstacles_encountered: list[str] = Field(default_factory=list)  # distinct obstacle *types* hit
    start_time: str  # ISO 8601
    end_time: str  # ISO 8601
    status: Literal["completed", "stopped"]


class WSMessage(BaseModel):
    """Envelope for every WebSocket message, in both directions.

    type="full"  -> data is the entire { layout, robot } snapshot (sent once on connect)
    type="patch" -> data is a partial RobotState-shaped dict (sent per tick)
    type="place_obstacle" -> client -> server, data is an Obstacle
    type="report" -> server -> client, data is a RunReport
    """

    type: Literal["full", "patch", "place_obstacle", "report", "start_run", "reset"]
    data: dict