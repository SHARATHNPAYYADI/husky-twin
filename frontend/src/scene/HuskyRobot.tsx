import { useMemo } from "react";
import type { WarehouseLayout } from "../schema/types";
import { cellToWorld } from "./coords";

// Husky UGV's real color scheme — burnt orange body, black chassis/wheels.
const BODY_COLOR = "#d6531f";
const CHASSIS_COLOR = "#1c1c1c";
const WHEEL_COLOR = "#111214";

const BODY_W = 0.75;
const BODY_L = 0.98;
const BODY_H = 0.35;
const WHEEL_RADIUS = 0.22;
const WHEEL_WIDTH = 0.12;
const GROUND_CLEARANCE = WHEEL_RADIUS;

const WHEEL_OFFSETS: [number, number][] = [
  [BODY_W / 2, BODY_L / 2 - 0.15],
  [-BODY_W / 2, BODY_L / 2 - 0.15],
  [BODY_W / 2, -BODY_L / 2 + 0.15],
  [-BODY_W / 2, -BODY_L / 2 + 0.15],
];

export function HuskyRobot({
  layout,
  position,
  heading = 0,
}: {
  layout: WarehouseLayout;
  position: [number, number]; // grid (x, y), fractional while moving
  heading?: number; // radians, atan2(dy, dx) in grid space
}) {
  const [worldX, worldZ] = useMemo(
    // +0.5: render at the cell's center, matching how shelves/chargers are drawn
    () => cellToWorld(position[0] + 0.5, position[1] + 0.5, layout),
    [position, layout],
  );

  // Local +Z is "forward". Rotating by (pi/2 - heading) around Y aligns it
  // with the grid-space direction vector (cos(heading), sin(heading)).
  const rotationY = Math.PI / 2 - heading;

  return (
    <group position={[worldX, 0, worldZ]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, GROUND_CLEARANCE * 0.6, 0]} castShadow>
        <boxGeometry args={[BODY_W * 1.05, GROUND_CLEARANCE * 0.5, BODY_L * 1.05]} />
        <meshStandardMaterial color={CHASSIS_COLOR} />
      </mesh>

      <mesh position={[0, GROUND_CLEARANCE + BODY_H / 2, 0]} castShadow>
        <boxGeometry args={[BODY_W, BODY_H, BODY_L]} />
        <meshStandardMaterial color={BODY_COLOR} roughness={0.6} metalness={0.1} />
      </mesh>

      {WHEEL_OFFSETS.map(([wx, wz], i) => (
        <mesh key={i} position={[wx, WHEEL_RADIUS, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 20]} />
          <meshStandardMaterial color={WHEEL_COLOR} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
