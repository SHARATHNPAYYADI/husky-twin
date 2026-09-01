import type { WarehouseLayout } from "../schema/types";

/**
 * Converts a grid cell (or fractional grid position) to Three.js world
 * (x, z), centering the warehouse on the origin. Y (up) is handled
 * separately by each mesh — this only ever returns the ground-plane pair.
 */
export function cellToWorld(gx: number, gy: number, layout: WarehouseLayout): [number, number] {
  return [gx - layout.width / 2, gy - layout.height / 2];
}

/** Inverse of cellToWorld — a click's world (x, z) back to the grid cell it
 * falls in. Cell (cx, cy)'s footprint is [worldX, worldX+1) x [worldZ, worldZ+1),
 * so this floors rather than rounds. */
export function worldToCell(worldX: number, worldZ: number, layout: WarehouseLayout): [number, number] {
  return [Math.floor(worldX + layout.width / 2), Math.floor(worldZ + layout.height / 2)];
}
