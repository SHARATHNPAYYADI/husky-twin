import { Text } from "@react-three/drei";
import type { Cell, WarehouseLayout } from "../schema/types";
import { cellToWorld } from "./coords";

const PENDING_COLOR = "#22c55e";
const REACHED_COLOR = "#5b6167";

/**
 * Numbered rings marking every stop in the current queue, in visit order.
 * Numbering is stable for the whole run — a stop that's already been
 * reached stays in place (dimmed, checkmarked) instead of disappearing and
 * shifting the remaining numbers down.
 */
export function TargetMarkers({
  layout,
  targets,
  reachedCount = 0,
}: {
  layout: WarehouseLayout;
  targets: Cell[];
  reachedCount?: number;
}) {
  return (
    <group>
      {targets.map((cell, i) => {
        const reached = i < reachedCount;
        const color = reached ? REACHED_COLOR : PENDING_COLOR;
        const [wx, wz] = cellToWorld(cell[0] + 0.5, cell[1] + 0.5, layout);
        return (
          <group key={`${cell[0]}-${cell[1]}-${i}`} position={[wx, 0, wz]}>
            <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.28, 0.4, 24]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={reached ? 0.2 : 0.7}
                transparent
                opacity={reached ? 0.5 : 1}
              />
            </mesh>
            <Text
              position={[0, 1.1, 0]}
              fontSize={0.55}
              color={color}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.03}
              outlineColor="#14171a"
            >
              {reached ? "✓" : String(i + 1)}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
