import type { Obstacle, WarehouseLayout } from "../schema/types";
import { cellToWorld } from "./coords";

const OBSTACLE_COLOR = "#ef4444"; // hazard red

export function ObstacleMarkers({
  layout,
  obstacles,
}: {
  layout: WarehouseLayout;
  obstacles: Obstacle[];
}) {
  return (
    <group>
      {obstacles.map((o) => {
        const [wx, wz] = cellToWorld(o.cell[0] + 0.5, o.cell[1] + 0.5, layout);
        return (
          <mesh key={o.id} position={[wx, 0.3, wz]} castShadow>
            <cylinderGeometry args={[0.18, 0.22, 0.6, 12]} />
            <meshStandardMaterial color={OBSTACLE_COLOR} roughness={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}
