import { useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Grid } from "@react-three/drei";
import type { Cell, WarehouseLayout } from "../schema/types";
import { cellToWorld, worldToCell } from "./coords";
import { RackUnit } from "./RackUnit";

const KICKPLATE_HEIGHT = 0.06;

const COLORS = {
  floorMain: "#3a3e42",
  floorZone: "#33393f",
  shelfKick: "#f2c14e", // safety yellow — real racking uprights are painted this for visibility
  charger: "#22c55e",
};

// First/last 4 rows read as distinct zones (staging / back area). Purely a
// visual cue for now — the layout itself doesn't tag zones explicitly.
const ZONE_BAND_ROWS = 4;

// A camera-orbit drag starts and ends on the floor mesh just like a real
// click does — three.js/R3F don't distinguish them. Only treat a
// pointerdown->pointerup pair as a click if the pointer barely moved.
const CLICK_DRAG_THRESHOLD_PX = 6;

export function Warehouse({
  layout,
  onFloorClick,
}: {
  layout: WarehouseLayout;
  onFloorClick?: (cell: Cell) => void;
}) {
  const { width, height, shelves, chargers } = layout;
  const pointerDownAt = useRef<{ x: number; y: number } | null>(null);

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
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          pointerDownAt.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e: ThreeEvent<PointerEvent>) => {
          const start = pointerDownAt.current;
          pointerDownAt.current = null;
          if (!onFloorClick || !start) return;
          const dragDistance = Math.hypot(e.clientX - start.x, e.clientY - start.y);
          if (dragDistance > CLICK_DRAG_THRESHOLD_PX) return; // was a camera-orbit drag, not a click
          e.stopPropagation();
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
            <mesh position={[0, KICKPLATE_HEIGHT / 2, 0]} receiveShadow>
              <boxGeometry args={[s.w * 0.96, KICKPLATE_HEIGHT, s.h * 0.96]} />
              <meshStandardMaterial color={COLORS.shelfKick} />
            </mesh>
            <RackUnit shelf={s} index={i} />
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
