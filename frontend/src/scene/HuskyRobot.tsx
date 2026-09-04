import { useMemo } from "react";
import { RoundedBox } from "@react-three/drei";
import type { WarehouseLayout } from "../schema/types";
import { cellToWorld } from "./coords";

// Clearpath-style UGV — yellow deck over a black skirt, big chunky wheels.
const DECK_COLOR = "#f2c14e";
const SKIRT_COLOR = "#1c1c1c";
const WHEEL_COLOR = "#17181a";
const WHEEL_TREAD_COLOR = "#0d0e0f";
const HUB_COLOR = "#3a3d42";
const LIGHT_COLOR = "#f5f0dc";
const ESTOP_COLOR = "#e0342b";

const BODY_W = 0.72;
const BODY_L = 1.0;
const DECK_H = 0.28;
const SKIRT_H = 0.14;
const WHEEL_RADIUS = 0.32;
const WHEEL_WIDTH = 0.2;
// Wheels sit proud of the body, like real ATV-wheeled UGVs.
const WHEEL_X = BODY_W / 2 + WHEEL_WIDTH * 0.3;
const GROUND_CLEARANCE = WHEEL_RADIUS * 0.55;

const WHEEL_OFFSETS: [number, number][] = [
  [WHEEL_X, BODY_L / 2 - 0.2],
  [-WHEEL_X, BODY_L / 2 - 0.2],
  [WHEEL_X, -BODY_L / 2 + 0.2],
  [-WHEEL_X, -BODY_L / 2 + 0.2],
];

// Angular "lug" blocks around each wheel's rim suggest a knobby tread
// without modeling real tire geometry.
const TREAD_LUGS = 10;

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

  const skirtY = GROUND_CLEARANCE + SKIRT_H / 2;
  const deckY = GROUND_CLEARANCE + SKIRT_H + DECK_H / 2;
  const deckTop = GROUND_CLEARANCE + SKIRT_H + DECK_H;

  return (
    <group position={[worldX, 0, worldZ]} rotation={[0, rotationY, 0]}>
      {/* black lower skirt/chassis */}
      <mesh position={[0, skirtY, 0]} castShadow>
        <boxGeometry args={[BODY_W * 1.08, SKIRT_H, BODY_L * 1.02]} />
        <meshStandardMaterial color={SKIRT_COLOR} roughness={0.7} />
      </mesh>

      {/* yellow deck */}
      <RoundedBox args={[BODY_W, DECK_H, BODY_L]} radius={0.04} smoothness={2} position={[0, deckY, 0]} castShadow>
        <meshStandardMaterial color={DECK_COLOR} roughness={0.45} metalness={0.1} />
      </RoundedBox>

      {/* twin light slits, front-facing */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * BODY_W * 0.22, deckTop - 0.06, BODY_L / 2 - 0.01]}
          rotation={[0, 0, 0]}
        >
          <boxGeometry args={[0.16, 0.03, 0.02]} />
          <meshStandardMaterial color={LIGHT_COLOR} emissive={LIGHT_COLOR} emissiveIntensity={0.6} />
        </mesh>
      ))}

      {/* e-stop button accent */}
      <mesh position={[0, deckTop + 0.02, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.03, 16]} />
        <meshStandardMaterial color={ESTOP_COLOR} emissive={ESTOP_COLOR} emissiveIntensity={0.5} />
      </mesh>

      {WHEEL_OFFSETS.map(([wx, wz], i) => (
        <group key={i} position={[wx, WHEEL_RADIUS, wz]} rotation={[0, 0, Math.PI / 2]}>
          <mesh castShadow>
            <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 20]} />
            <meshStandardMaterial color={WHEEL_COLOR} roughness={0.95} />
          </mesh>
          {Array.from({ length: TREAD_LUGS }, (_, li) => {
            const angle = (li / TREAD_LUGS) * Math.PI * 2;
            return (
              <mesh
                key={li}
                position={[Math.cos(angle) * WHEEL_RADIUS, Math.sin(angle) * WHEEL_RADIUS, 0]}
                rotation={[0, 0, angle]}
              >
                <boxGeometry args={[0.05, 0.04, WHEEL_WIDTH * 1.04]} />
                <meshStandardMaterial color={WHEEL_TREAD_COLOR} roughness={1} />
              </mesh>
            );
          })}
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[WHEEL_RADIUS * 0.4, WHEEL_RADIUS * 0.4, WHEEL_WIDTH * 1.03, 12]} />
            <meshStandardMaterial color={HUB_COLOR} roughness={0.6} metalness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
