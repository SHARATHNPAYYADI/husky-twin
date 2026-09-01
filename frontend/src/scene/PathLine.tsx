import { Line } from "@react-three/drei";
import type { Cell, WarehouseLayout } from "../schema/types";
import { cellToWorld } from "./coords";

const PATH_COLOR = "#00d4ff"; // matches robotics-viz convention (RViz/Foxglove path color)
const PATH_HEIGHT = 0.05;

export function PathLine({ layout, path }: { layout: WarehouseLayout; path: Cell[] }) {
  if (path.length < 2) return null;

  const points: [number, number, number][] = path.map(([x, y]) => {
    // +0.5: render at the cell's center, matching how shelves/chargers are drawn
    const [wx, wz] = cellToWorld(x + 0.5, y + 0.5, layout);
    return [wx, PATH_HEIGHT, wz];
  });

  return <Line points={points} color={PATH_COLOR} lineWidth={2.5} />;
}
