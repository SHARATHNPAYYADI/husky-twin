import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Cell, Obstacle, WarehouseLayout } from "../schema/types";
import { Warehouse } from "./Warehouse";
import { HuskyRobot } from "./HuskyRobot";
import { PathLine } from "./PathLine";
import { ObstacleMarkers } from "./ObstacleMarkers";
import { TargetMarkers } from "./TargetMarkers";

export function Scene({
  layout,
  robotPosition,
  robotHeading = 0,
  path = [],
  obstacles = [],
  targets = [],
  targetsReachedCount = 0,
  onFloorClick,
}: {
  layout: WarehouseLayout;
  robotPosition: [number, number];
  robotHeading?: number;
  path?: Cell[];
  obstacles?: Obstacle[];
  targets?: Cell[];
  targetsReachedCount?: number;
  onFloorClick?: (cell: Cell) => void;
}) {
  const span = Math.max(layout.width, layout.height);

  return (
    <Canvas
      shadows
      camera={{ position: [span * 0.45, span * 0.7, span * 0.55], fov: 45 }}
      style={{ background: "#14171a" }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[20, 30, 10]}
        intensity={1.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />

      <Warehouse layout={layout} onFloorClick={onFloorClick} />
      <PathLine layout={layout} path={path} />
      <ObstacleMarkers layout={layout} obstacles={obstacles} />
      <TargetMarkers layout={layout} targets={targets} reachedCount={targetsReachedCount} />
      <HuskyRobot layout={layout} position={robotPosition} heading={robotHeading} />

      <OrbitControls makeDefault minDistance={8} maxDistance={80} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}
