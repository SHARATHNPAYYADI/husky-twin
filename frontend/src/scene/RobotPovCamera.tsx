import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type PerspectiveCamera } from "three";

// Mounted on a mast above the sensor pod, looking forward along the robot's
// heading — see backend-independent HuskyRobot.tsx for the matching
// local-forward convention ("+Z is forward", rotationY = pi/2 - heading in
// world space). Mounted low (near deck height) it reads as pinned inside
// nearby racking — the aisle floor barely shows and shelf geometry fills
// the frame — so this sits above the two shelf-deck levels (0.92/1.63,
// see RackUnit.tsx) with clearance on both sides.
const MOUNT_HEIGHT = 1.15;
const MOUNT_FORWARD = 0.3;
const LOOK_AHEAD = 5;
const LOOK_DROP = 0.35; // aim down enough to keep the path ahead in frame

const POV_FOV = 62;
const POV_NEAR = 0.05;
const DEFAULT_FOV = 45; // matches Scene.tsx's <Canvas camera={{ fov: 45 }}>
const DEFAULT_NEAR = 0.1; // three.js's own PerspectiveCamera default

/**
 * Drives its Canvas's single default camera directly (no OrbitControls, no
 * second camera object) — an onboard/CCTV-style view riding the robot. Used
 * by RobotCamPanel's own dedicated Canvas, kept separate from the main
 * interactive Scene (which has its own OrbitControls) so this never
 * competes for the same camera transform.
 */
export function RobotPovCamera({
  worldX,
  worldZ,
  heading,
}: {
  worldX: number;
  worldZ: number;
  heading: number;
}) {
  const { camera } = useThree();
  const lookTarget = useRef(new Vector3());

  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    cam.fov = POV_FOV;
    cam.near = POV_NEAR;
    cam.updateProjectionMatrix();
    return () => {
      cam.fov = DEFAULT_FOV;
      cam.near = DEFAULT_NEAR;
      cam.updateProjectionMatrix();
    };
  }, [camera]);

  useFrame(() => {
    const fx = Math.cos(heading);
    const fz = Math.sin(heading);
    camera.position.set(worldX + fx * MOUNT_FORWARD, MOUNT_HEIGHT, worldZ + fz * MOUNT_FORWARD);
    lookTarget.current.set(
      worldX + fx * (MOUNT_FORWARD + LOOK_AHEAD),
      MOUNT_HEIGHT - LOOK_DROP,
      worldZ + fz * (MOUNT_FORWARD + LOOK_AHEAD),
    );
    camera.lookAt(lookTarget.current);
  });

  return null;
}
