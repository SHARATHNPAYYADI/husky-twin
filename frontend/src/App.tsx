import { useEffect, useState } from "react";
import { Scene } from "./scene/Scene";
import { ReportPanel } from "./components/ReportPanel";
import { useSimStore } from "./store/simStore";
import { connect, resetRun, sendPlaceObstacle, startRun } from "./ws/client";
import type { Cell } from "./schema/types";

const RUNNING_STATES = new Set(["navigating", "replanning"]);

export default function App() {
  useEffect(() => {
    connect();
  }, []);

  const status = useSimStore((s) => s.status);
  const layout = useSimStore((s) => s.layout);
  const robot = useSimStore((s) => s.robot);
  const report = useSimStore((s) => s.report);
  const obstacles = useSimStore((s) => s.obstacles);
  const addLocalObstacle = useSimStore((s) => s.addLocalObstacle);

  const [dismissedReportId, setDismissedReportId] = useState<string | null>(null);

  const handleFloorClick = (cell: Cell) => {
    if (!layout) return;

    const onShelf = layout.shelves.some(
      (s) => cell[0] >= s.x && cell[0] < s.x + s.w && cell[1] >= s.y && cell[1] < s.y + s.h,
    );
    if (onShelf) return; // placing inside a shelf isn't meaningful — already blocked

    const obstacle = { id: crypto.randomUUID(), type: "fire_extinguisher", cell };
    sendPlaceObstacle(obstacle);
    addLocalObstacle(obstacle);
  };

  if (!layout || !robot) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#14171a",
          color: "#c7ccd1",
          fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', monospace",
          fontSize: 13,
        }}
      >
        connecting to backend ({status})…
      </div>
    );
  }

  const isRunning = RUNNING_STATES.has(robot.state);
  const showReportModal = !!report && report.run_id !== dismissedReportId && !isRunning;

  const handleReset = () => {
    if (report) setDismissedReportId(report.run_id);
    resetRun();
  };

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <Scene
        layout={layout}
        robotPosition={robot.position}
        robotHeading={robot.heading}
        path={robot.path}
        obstacles={obstacles}
        onFloorClick={handleFloorClick}
      />

      <div style={hudStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 6 }}>
          Husky Digital Twin
        </div>
        <div>ws: {status}</div>
        <div>state: {robot.state}</div>
        <div>
          pos: [{robot.position[0].toFixed(1)}, {robot.position[1].toFixed(1)}]
        </div>
        <div>replans: {robot.replans}</div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, pointerEvents: "auto" }}>
          <button onClick={() => startRun()} disabled={isRunning} style={btnStyle}>
            Start Run
          </button>
          <button onClick={handleReset} style={btnStyle}>
            Reset
          </button>
        </div>

        <div style={{ marginTop: 6, fontSize: 11, color: "#8b929a" }}>
          click the floor to drop a fire extinguisher
        </div>
      </div>

      {showReportModal && report && (
        <ReportPanel report={report} onClose={() => setDismissedReportId(report.run_id)} />
      )}
    </div>
  );
}

const hudStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  left: 16,
  fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', monospace",
  fontSize: 12,
  color: "#c7ccd1",
  background: "rgba(20, 23, 26, 0.78)",
  padding: "10px 14px",
  borderRadius: 4,
  lineHeight: 1.6,
  pointerEvents: "none",
};

const btnStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: 12,
  padding: "5px 10px",
  background: "#2a2f34",
  color: "#e5e8eb",
  border: "1px solid #454b52",
  borderRadius: 3,
  cursor: "pointer",
};
