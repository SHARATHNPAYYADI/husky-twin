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

export interface Obstacle {
  id: string;
  type: string; // "fire_extinguisher" | "box" | ...
  cell: Cell;
}

export interface RobotState {
  id: string;
  position: [number, number];
  heading: number; // radians
  state: RobotStateEnum;
  path: Cell[];
  target: Cell | null;
  distance_traveled: number;
  replans: number;
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
}

export type WSMessageType =
  | "full"
  | "patch"
  | "place_obstacle"
  | "report"
  | "start_run"
  | "reset";

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  data: T;
}

export interface FullSnapshot {
  layout: WarehouseLayout;
  robot: RobotState;
}