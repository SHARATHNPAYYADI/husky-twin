import { useMemo } from "react";
import { Grid } from "@react-three/drei";
import type { Cell, WarehouseLayout } from "../schema/types";
import { cellToWorld, worldToCell } from "./coords";

const SHELF_HEIGHT = 2.2;
const KICKPLATE_HEIGHT = 0.18;

const COLORS = {
  floorMain: "#3a3e42",
  floorZone: "#33393f",
  shelfBody: "#6b7280",
  shelfKick: "#f2c14e", // safety yellow — real racking uprights are painted this for visibility
  charger: "#22c55e",
};

// First/last 4 rows read as distinct zones (staging / back area). Purely a
// visual cue for now — the layout itself doesn't tag zones explicitly.
const ZONE_BAND_ROWS = 4;

export function Warehouse({
  layout,
  onFloorClick,
}: {
  layout: WarehouseLayout;
  onFloorClick?: (cell: Cell) => void;
}) {
  const { width, height, shelves, chargers } = layout;

  const zoneBands = useMemo(
    () => [
      { y0: 0, y1: ZONE_BAND_ROWS },
      { y0: height - ZONE_BAND_ROWS, y1: height },
    ],
    [height],
  );

  return (
    <group>
      {/* main floor — click target for placing obstacles */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          if (!onFloorClick) return;
          onFloorClick(worldToCell(e.point.x, e.point.z, layout));
        }}
        onPointerOver={() => {
          if (onFloorClick) document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color={COLORS.floorMain} />
      </mesh>

      {/* zone shading (staging / back area) */}
      {zoneBands.map((band, i) => {
        const bandHeight = band.y1 - band.y0;
        const [, worldZ] = cellToWorld(0, band.y0 + bandHeight / 2, layout);
        return (
          <mesh
            key={i}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.01, worldZ]}
            receiveShadow
          >
            <planeGeometry args={[width, bandHeight]} />
            <meshStandardMaterial color={COLORS.floorZone} />
          </mesh>
        );
      })}

      {/* reference grid, like a sim/CAD viewport */}
      <Grid
        position={[0, 0.02, 0]}
        args={[width, height]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#4b5158"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#5b6572"
        fadeDistance={70}
        infiniteGrid={false}
      />

      {/* racking */}
      {shelves.map((s, i) => {
        const [worldX, worldZ] = cellToWorld(s.x + s.w / 2, s.y + s.h / 2, layout);
        return (
          <group key={i} position={[worldX, 0, worldZ]}>
            <mesh position={[0, SHELF_HEIGHT / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[s.w * 0.9, SHELF_HEIGHT, s.h * 0.9]} />
              <meshStandardMaterial color={COLORS.shelfBody} />
            </mesh>
            <mesh position={[0, KICKPLATE_HEIGHT / 2, 0]}>
              <boxGeometry args={[s.w * 0.96, KICKPLATE_HEIGHT, s.h * 0.96]} />
              <meshStandardMaterial color={COLORS.shelfKick} />
            </mesh>
          </group>
        );
      })}

      {/* chargers */}
      {chargers.map(([cx, cy], i) => {
        const [worldX, worldZ] = cellToWorld(cx + 0.5, cy + 0.5, layout);
        return (
          <mesh
            key={i}
            position={[worldX, 0.03, worldZ]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[0.35, 24]} />
            <meshStandardMaterial
              color={COLORS.charger}
              emissive={COLORS.charger}
              emissiveIntensity={0.4}
            />
          </mesh>
        );
      })}
    </group>
  );
}
