/**
 * TypeScript mirror of backend/app/schema.py.
 * No codegen — keep these two files in sync by hand when the schema changes.
 */

export type Cell = [number, number]; // [x, y] grid coordinate

export type RobotStateEnum = "idle" | "navigating" | "replanning" | "arrived";

export interface ShelfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WarehouseLayout {
  width: number;
  height: number;
  cell_size: number;
  shelves: ShelfRect[];
  chargers: Cell[];
  start: Cell;
  target: Cell;
}

// The types the obstacle picker sends — see backend/app/schema.py's
// Obstacle docstring for their blocking/moving behavior.
export type ObstacleType = "pallet" | "person";

export interface Obstacle {
  id: string;
  type: string; // ObstacleType in practice; free-form on the wire
  cell: Cell;
}

export interface RobotState {
  id: string;
  position: [number, number];
  heading: number; // radians
  state: RobotStateEnum;
  path: Cell[];
  target: Cell | null; // current leg's destination
  task_queue: Cell[]; // remaining stops after `target`
  distance_traveled: number;
  replans: number;
}

export interface TaskLeg {
  target: Cell;
  distance_traveled: number;
  duration_s: number;
  replans_triggered: number;
}

export interface RunReport {
  run_id: string;
  duration_s: number;
  distance_traveled: number;
  replans_triggered: number;
  obstacles_hit: number; // count of individual obstacles that actually blocked the path
  obstacles_encountered: string[]; // distinct obstacle *types* hit
  start_time: string; // ISO 8601
  end_time: string; // ISO 8601
  status: "completed" | "stopped";
  legs: TaskLeg[]; // one entry per stop actually reached
}

export type WSMessageType =
  | "full"
  | "patch"
  | "place_obstacle"
  | "report"
  | "start_run"
  | "reset"
  | "obstacles";

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  data: T;
}

export interface FullSnapshot {
  layout: WarehouseLayout;
  robot: RobotState;
  obstacles: Obstacle[];
}

export interface ObstaclesMessage {
  obstacles: Obstacle[];
}

// REST-only (not part of the WS protocol) — see backend/app/main.py's /layouts routes.
export interface LayoutSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  created_at: string;
}

export interface SavedLayout extends LayoutSummary {
  layout: WarehouseLayout;
}