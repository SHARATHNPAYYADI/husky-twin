import type { LayoutSummary, SavedLayout, WarehouseLayout } from "../schema/types";

// No separate VITE_API_URL needed in Vercel — derive the REST base from the
// same VITE_WS_URL already configured for the WebSocket (ws->http, drop /ws).
function apiBase(): string {
  const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws";
  return wsUrl.replace(/^ws/, "http").replace(/\/ws$/, "");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

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
