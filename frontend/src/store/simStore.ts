import { create } from "zustand";
import type { FullSnapshot, Obstacle, RobotState, RunReport, WarehouseLayout } from "../schema/types";

export type ConnectionStatus = "connecting" | "open" | "closed";

interface SimState {
  status: ConnectionStatus;
  layout: WarehouseLayout | null;
  robot: RobotState | null;
  report: RunReport | null;
  obstacles: Obstacle[]; // tracked locally — the backend doesn't broadcast this list separately

  setStatus: (status: ConnectionStatus) => void;
  applyFull: (snapshot: FullSnapshot) => void;
  applyPatch: (robot: RobotState) => void;
  applyReport: (report: RunReport) => void;
  addLocalObstacle: (obstacle: Obstacle) => void;
}

export const useSimStore = create<SimState>((set) => ({
  status: "connecting",
  layout: null,
  robot: null,
  report: null,
  obstacles: [],

  setStatus: (status) => set({ status }),
  applyFull: (snapshot) => set({ layout: snapshot.layout, robot: snapshot.robot }),
  applyPatch: (robot) => set({ robot }),
  applyReport: (report) => set({ report }),
  addLocalObstacle: (obstacle) => set((s) => ({ obstacles: [...s.obstacles, obstacle] })),
}));
