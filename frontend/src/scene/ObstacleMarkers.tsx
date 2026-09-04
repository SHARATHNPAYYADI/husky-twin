import type { Obstacle, WarehouseLayout } from "../schema/types";
import { cellToWorld } from "./coords";

// Visuals per obstacle type — see backend/app/schema.py's Obstacle
// docstring for the matching blocking/moving behavior.
const TYPE_COLOR: Record<string, string> = {
  pallet: "#a1662f", // wood brown
  person: "#3b82f6", // hi-vis blue — also the hard hat below, for the same identity at a glance
};

const PERSON_COLORS = {
  skin: "#d9a373",
  vest: "#ff8c1a",
  vestStripe: "#e9e9e9",
  pants: "#2b2f33",
  hardHat: TYPE_COLOR.person,
};

function PersonMesh() {
  const legH = 0.72;
  const legY = legH / 2;
  const torsoH = 0.5;
  const torsoY = legH + torsoH / 2;
  const headY = legH + torsoH + 0.13;

  return (
    <group>
      {/* legs */}
      {[-0.08, 0.08].map((x) => (
        <mesh key={x} position={[x, legY, 0]} castShadow>
          <capsuleGeometry args={[0.06, legH - 0.12, 4, 8]} />
          <meshStandardMaterial color={PERSON_COLORS.pants} roughness={0.7} />
        </mesh>
      ))}

      {/* torso — hi-vis vest */}
      <mesh position={[0, torsoY, 0]} castShadow>
        <capsuleGeometry args={[0.15, torsoH - 0.3, 4, 8]} />
        <meshStandardMaterial color={PERSON_COLORS.vest} roughness={0.65} />
      </mesh>
      {/* reflective stripe */}
      <mesh position={[0, torsoY + 0.02, 0]}>
        <torusGeometry args={[0.155, 0.02, 6, 16]} />
        <meshStandardMaterial color={PERSON_COLORS.vestStripe} roughness={0.3} />
      </mesh>

      {/* arms */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.21, torsoY + 0.02, 0]}
          rotation={[0, 0, side * 0.18]}
          castShadow
        >
          <capsuleGeometry args={[0.045, 0.34, 4, 8]} />
          <meshStandardMaterial color={PERSON_COLORS.vest} roughness={0.65} />
        </mesh>
      ))}

      {/* head */}
      <mesh position={[0, headY, 0]} castShadow>
        <sphereGeometry args={[0.11, 12, 12]} />
        <meshStandardMaterial color={PERSON_COLORS.skin} roughness={0.8} />
      </mesh>

      {/* hard hat */}
      <mesh position={[0, headY + 0.09, 0]} castShadow>
        <sphereGeometry args={[0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={PERSON_COLORS.hardHat} roughness={0.4} />
      </mesh>
      <mesh position={[0, headY + 0.1, 0]}>
        <cylinderGeometry args={[0.135, 0.135, 0.02, 16]} />
        <meshStandardMaterial color={PERSON_COLORS.hardHat} roughness={0.4} />
      </mesh>
    </group>
  );
}

function ObstacleMesh({ obstacle }: { obstacle: Obstacle }) {
  switch (obstacle.type) {
    case "person":
      return <PersonMesh />;
    case "pallet":
    default:
      return (
        <mesh position={[0, 0.15, 0]} castShadow>
          <boxGeometry args={[0.7, 0.3, 0.7]} />
          <meshStandardMaterial color={TYPE_COLOR[obstacle.type] ?? "#a1662f"} roughness={0.8} />
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
