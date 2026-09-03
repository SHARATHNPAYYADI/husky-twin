import { create } from "zustand";
import type { FullSnapshot, Obstacle, RobotState, RunReport, WarehouseLayout } from "../schema/types";

export type ConnectionStatus = "connecting" | "open" | "closed";

interface SimState {
  status: ConnectionStatus;
  layout: WarehouseLayout | null;
  robot: RobotState | null;
  report: RunReport | null;
  obstacles: Obstacle[]; // authoritative list, synced from the backend's "obstacles" broadcasts

  setStatus: (status: ConnectionStatus) => void;
  applyFull: (snapshot: FullSnapshot) => void;
  applyPatch: (robot: RobotState) => void;
  applyReport: (report: RunReport) => void;
  setObstacles: (obstacles: Obstacle[]) => void;
  addLocalObstacle: (obstacle: Obstacle) => void;
}

export const useSimStore = create<SimState>((set) => ({
  status: "connecting",
  layout: null,
  robot: null,
  report: null,
  obstacles: [],

  setStatus: (status) => set({ status }),
  applyFull: (snapshot) =>
    set({ layout: snapshot.layout, robot: snapshot.robot, obstacles: snapshot.obstacles }),
  applyPatch: (robot) => set({ robot }),
  applyReport: (report) => set({ report }),
  setObstacles: (obstacles) => set({ obstacles }),
  // Optimistic add so a freshly placed obstacle appears before the next
  // tick's authoritative "obstacles" broadcast arrives; that broadcast
  // then replaces this via setObstacles.
  addLocalObstacle: (obstacle) => set((s) => ({ obstacles: [...s.obstacles, obstacle] })),
}));
