import type { RunStats } from "../schema/types";
import { request } from "./base";

export function fetchRunStats(): Promise<RunStats> {
  return request("/runs/stats");
}
