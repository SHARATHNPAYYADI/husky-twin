import { useEffect, useState } from "react";
import { Scene } from "./scene/Scene";
import { ReportPanel } from "./components/ReportPanel";
import { LayoutEditor } from "./components/LayoutEditor";
import { MetricsDashboard } from "./components/MetricsDashboard";
import { useSimStore } from "./store/simStore";
import { connect, resetRun, sendPlaceObstacle, startRun } from "./ws/client";
import type { Cell, ObstacleType } from "./schema/types";

const RUNNING_STATES = new Set(["navigating", "replanning"]);

const OBSTACLE_TYPES: { type: ObstacleType; label: string }[] = [
  { type: "pallet", label: "Pallet" },
  { type: "person", label: "Person" },
];

type ClickMode = "obstacle" | "queue";

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
  const [selectedType, setSelectedType] = useState<ObstacleType>("pallet");
  const [clickMode, setClickMode] = useState<ClickMode>("obstacle");
  const [queuedTargets, setQueuedTargets] = useState<Cell[]>([]);
  // The full stop list for the run currently in progress (or just finished) —
  // kept fixed for the whole run so markers don't disappear/renumber as
  // stops are reached; cleared on Reset.
  const [activeRunTargets, setActiveRunTargets] = useState<Cell[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);

  const handleFloorClick = (cell: Cell) => {
    if (!layout) return;

    const onShelf = layout.shelves.some(
      (s) => cell[0] >= s.x && cell[0] < s.x + s.w && cell[1] >= s.y && cell[1] < s.y + s.h,
    );
    if (onShelf) return; // placing inside a shelf isn't meaningful — already blocked

    if (clickMode === "queue") {
      setQueuedTargets((q) => [...q, cell]);
      return;
    }

    const obstacle = { id: crypto.randomUUID(), type: selectedType, cell };
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
  // Before a run starts, show the queue being built. Once a run has been
  // started, show the fixed activeRunTargets list instead — its length and
  // order never change mid-run, so a stop's number stays put after it's
  // reached (see targetsReachedCount below) rather than the list shrinking
  // and renumbering as robot.task_queue drains.
  const targetMarkers = activeRunTargets.length > 0 ? activeRunTargets : queuedTargets;
  const remainingStops = robot.state === "arrived" ? 0 : robot.target ? 1 + robot.task_queue.length : 0;
  const targetsReachedCount =
    activeRunTargets.length > 0 ? Math.max(0, activeRunTargets.length - remainingStops) : 0;
  const showReportModal = !!report && report.run_id !== dismissedReportId && !isRunning;

  const handleReset = () => {
    if (report) setDismissedReportId(report.run_id);
    setActiveRunTargets([]);
    resetRun();
  };

  const handleStartRun = () => {
    setActiveRunTargets(queuedTargets.length > 0 ? queuedTargets : [layout.target]);
    startRun(queuedTargets.length > 0 ? queuedTargets : undefined);
    setQueuedTargets([]);
  };

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <Scene
        layout={layout}
        robotPosition={robot.position}
        robotHeading={robot.heading}
        path={robot.path}
        obstacles={obstacles}
        targets={targetMarkers}
        targetsReachedCount={targetsReachedCount}
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
        {robot.task_queue.length > 0 && <div>stops remaining: {robot.task_queue.length}</div>}

        <div style={{ marginTop: 10, display: "flex", gap: 8, pointerEvents: "auto" }}>
          <button onClick={handleStartRun} disabled={isRunning} style={btnStyle}>
            Start Run{queuedTargets.length > 0 ? ` (${queuedTargets.length} stops)` : ""}
          </button>
          <button onClick={handleReset} style={btnStyle}>
            Reset
          </button>
          <button onClick={() => setEditorOpen(true)} style={btnStyle}>
            Edit Layout
          </button>
          <button onClick={() => setDashboardOpen(true)} style={btnStyle}>
            Metrics
          </button>
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: "#8b929a" }}>click mode</div>
        <div style={{ marginTop: 4, display: "flex", gap: 6, pointerEvents: "auto" }}>
          <button
            onClick={() => setClickMode("obstacle")}
            style={{
              ...btnStyle,
              borderColor: clickMode === "obstacle" ? "#e5e8eb" : "#454b52",
              color: clickMode === "obstacle" ? "#fff" : "#c7ccd1",
            }}
          >
            Place Obstacle
          </button>
          <button
            onClick={() => setClickMode("queue")}
            style={{
              ...btnStyle,
              borderColor: clickMode === "queue" ? "#e5e8eb" : "#454b52",
              color: clickMode === "queue" ? "#fff" : "#c7ccd1",
            }}
          >
            Queue Stop
          </button>
        </div>

        {clickMode === "obstacle" && (
          <>
            <div style={{ marginTop: 10, display: "flex", gap: 6, pointerEvents: "auto" }}>
              {OBSTACLE_TYPES.map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  style={{
                    ...btnStyle,
                    borderColor: selectedType === type ? "#e5e8eb" : "#454b52",
                    color: selectedType === type ? "#fff" : "#c7ccd1",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: "#8b929a" }}>
              click the floor to drop a {OBSTACLE_TYPES.find((o) => o.type === selectedType)?.label.toLowerCase()}
            </div>
          </>
        )}

        {clickMode === "queue" && (
          <>
            <div style={{ marginTop: 6, fontSize: 11, color: "#8b929a" }}>
              click the floor to queue a stop (visited in order)
            </div>
            {queuedTargets.length > 0 && (
              <div style={{ marginTop: 6, pointerEvents: "auto" }}>
                <div style={{ fontSize: 11, color: "#8b929a" }}>
                  queue: {queuedTargets.map((c) => `(${c[0]}, ${c[1]})`).join(" → ")}
                </div>
                <button
                  onClick={() => setQueuedTargets([])}
                  style={{ ...btnStyle, marginTop: 6, padding: "3px 8px" }}
                >
                  Clear queue
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showReportModal && report && (
        <ReportPanel report={report} onClose={() => setDismissedReportId(report.run_id)} />
      )}

      {dashboardOpen && <MetricsDashboard onClose={() => setDashboardOpen(false)} />}

      {editorOpen && (
        <LayoutEditor
          onClose={() => {
            // Activating a layout replaces the engine/robot entirely, so any
            // queued/in-flight target state from the old layout is stale.
            setQueuedTargets([]);
            setActiveRunTargets([]);
            setDismissedReportId(null);
            setEditorOpen(false);
          }}
        />
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
