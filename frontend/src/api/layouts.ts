import type { LayoutSummary, SavedLayout, WarehouseLayout } from "../schema/types";
import { request } from "./base";

export function fetchLayouts(): Promise<LayoutSummary[]> {
  return request("/layouts");
}

export function fetchStarterLayout(): Promise<WarehouseLayout> {
  return request("/layouts/starter");
}

export function fetchLayout(id: string): Promise<SavedLayout> {
  return request(`/layouts/${id}`);
}

export function saveLayout(name: string, layout: WarehouseLayout): Promise<{ id: string }> {
  return request("/layouts", { method: "POST", body: JSON.stringify({ name, layout }) });
}

export function activateLayout(id: string): Promise<{ status: string }> {
  return request(`/layouts/${id}/activate`, { method: "POST" });
}
