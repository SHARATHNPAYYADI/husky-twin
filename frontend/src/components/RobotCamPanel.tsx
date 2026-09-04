import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import type { Cell, Obstacle, WarehouseLayout } from "../schema/types";
import { Warehouse } from "../scene/Warehouse";
import { HuskyRobot } from "../scene/HuskyRobot";
import { PathLine } from "../scene/PathLine";
import { ObstacleMarkers } from "../scene/ObstacleMarkers";
import { RobotPovCamera } from "../scene/RobotPovCamera";
import { cellToWorld } from "../scene/coords";

/**
 * A second, independent Canvas — an always-streaming onboard/CCTV-style
 * feed riding the robot, docked separately from the main interactive view
 * so it never gets in the way of clicking the floor to place obstacles or
 * queue stops (see RobotPovCamera for why it can't share a Canvas with
 * OrbitControls). Read-only: no click handling, no orbit.
 */
export function RobotCamPanel({
  layout,
  robotPosition,
  robotHeading,
  obstacles,
  path,
}: {
  layout: WarehouseLayout;
  robotPosition: [number, number];
  robotHeading: number;
  obstacles: Obstacle[];
  path: Cell[];
}) {
  const [worldX, worldZ] = useMemo(
    () => cellToWorld(robotPosition[0] + 0.5, robotPosition[1] + 0.5, layout),
    [robotPosition, layout],
  );

  return (
    <div className="robot-cam-panel">
      <div className="robot-cam-title">Robot Cam</div>
      <Canvas shadows camera={{ fov: 62, near: 0.05 }} style={{ background: "#0d0f11" }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[20, 30, 10]} intensity={1.1} castShadow />
        <Warehouse layout={layout} />
        <PathLine layout={layout} path={path} />
        <ObstacleMarkers layout={layout} obstacles={obstacles} />
        <HuskyRobot layout={layout} position={robotPosition} heading={robotHeading} />
        <RobotPovCamera worldX={worldX} worldZ={worldZ} heading={robotHeading} />
      </Canvas>
    </div>
  );
}
