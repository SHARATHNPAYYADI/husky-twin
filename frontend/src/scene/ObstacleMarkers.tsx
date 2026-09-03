import type { Obstacle, WarehouseLayout } from "../schema/types";
import { cellToWorld } from "./coords";

// Visuals per obstacle type — see backend/app/schema.py's Obstacle
// docstring for the matching blocking/moving behavior.
const TYPE_COLOR: Record<string, string> = {
  pallet: "#a1662f", // wood brown
  person: "#3b82f6", // hi-vis blue
};

function ObstacleMesh({ obstacle }: { obstacle: Obstacle }) {
  const color = TYPE_COLOR[obstacle.type] ?? "#a1662f";

  switch (obstacle.type) {
    case "person":
      return (
        <mesh position={[0, 0.45, 0]} castShadow>
          <capsuleGeometry args={[0.18, 0.6, 4, 8]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      );
    case "pallet":
    default:
      return (
        <mesh position={[0, 0.15, 0]} castShadow>
          <boxGeometry args={[0.7, 0.3, 0.7]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      );
  }
}

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
          <group key={o.id} position={[wx, 0, wz]}>
            <ObstacleMesh obstacle={o} />
          </group>
        );
      })}
    </group>
  );
}
