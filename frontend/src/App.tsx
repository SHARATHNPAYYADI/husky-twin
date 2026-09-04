import { useEffect, useState } from "react";
import "./App.css";
import { Scene } from "./scene/Scene";
import { ReportPanel } from "./components/ReportPanel";
import { LayoutEditor } from "./components/LayoutEditor";
import { MetricsSidePanel } from "./components/MetricsSidePanel";
import { useSimStore } from "./store/simStore";
import { connect, resetRun, sendPlaceObstacle, startRun } from "./ws/client";
import type { Cell, ObstacleType } from "./schema/types";

const RUNNING_STATES = new Set(["navigating", "replanning"]);

const OBSTACLE_TYPES: { type: ObstacleType; label: string }[] = [
  { type: "pallet", label: "Pallet" },
  { type: "person", label: "Person" },
];

type ClickMode = "obstacle" | "queue";

const STATUS_DOT_COLOR: Record<string, string> = {
  open: "#0ca30c",
  connecting: "#fab219",
  closed: "#e66767",
};

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

      <div className="hud">
        <div className="hud-header">
          <div className="hud-title">Husky Digital Twin</div>
          <div className="hud-status">
            <span className="hud-status-dot" style={{ background: STATUS_DOT_COLOR[status] ?? "#8b929a" }} />
            {status}
          </div>
        </div>

        <div className="hud-section">
          <div className="hud-section-title">Status</div>
          <div className="hud-stat-grid">
            <div className="hud-stat">
              <span className="hud-stat-label">state</span>
              <span className="hud-stat-value">{robot.state}</span>
            </div>
            <div className="hud-stat">
              <span className="hud-stat-label">replans</span>
              <span className="hud-stat-value">{robot.replans}</span>
            </div>
            <div className="hud-stat">
              <span className="hud-stat-label">pos x</span>
              <span className="hud-stat-value">{robot.position[0].toFixed(1)}</span>
            </div>
            <div className="hud-stat">
              <span className="hud-stat-label">pos y</span>
              <span className="hud-stat-value">{robot.position[1].toFixed(1)}</span>
            </div>
            {robot.task_queue.length > 0 && (
              <div className="hud-stat">
                <span className="hud-stat-label">stops left</span>
                <span className="hud-stat-value">{robot.task_queue.length}</span>
              </div>
            )}
          </div>
        </div>

        <div className="hud-section">
          <div className="hud-section-title">Run</div>
          <div className="btn-row">
            <button onClick={handleStartRun} disabled={isRunning} className="btn btn-primary">
              Start Run{queuedTargets.length > 0 ? ` (${queuedTargets.length})` : ""}
            </button>
            <button onClick={handleReset} className="btn">
              Reset
            </button>
          </div>
        </div>

        <div className="hud-section">
          <div className="hud-section-title">Click Mode</div>
          <div className="btn-row">
            <button
              onClick={() => setClickMode("obstacle")}
              className={`btn btn-toggle${clickMode === "obstacle" ? " selected" : ""}`}
            >
              Place Obstacle
            </button>
            <button
              onClick={() => setClickMode("queue")}
              className={`btn btn-toggle${clickMode === "queue" ? " selected" : ""}`}
            >
              Queue Stop
            </button>
          </div>

          {clickMode === "obstacle" && (
            <>
              <div className="btn-row" style={{ marginTop: 8 }}>
                {OBSTACLE_TYPES.map(({ type, label }) => (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className={`btn btn-toggle btn-small${selectedType === type ? " selected" : ""}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="hud-hint">
                click the floor to drop a {OBSTACLE_TYPES.find((o) => o.type === selectedType)?.label.toLowerCase()}
              </div>
            </>
          )}

          {clickMode === "queue" && (
            <>
              <div className="hud-hint">click the floor to queue a stop (visited in order)</div>
              {queuedTargets.length > 0 && (
                <>
                  <div className="hud-queue">
                    queue: {queuedTargets.map((c) => `(${c[0]}, ${c[1]})`).join(" → ")}
                  </div>
                  <button onClick={() => setQueuedTargets([])} className="btn btn-small" style={{ marginTop: 6 }}>
                    Clear queue
                  </button>
                </>
              )}
            </>
          )}
        </div>

        <div className="hud-section">
          <div className="hud-section-title">World</div>
          <div className="btn-row">
            <button onClick={() => setEditorOpen(true)} className="btn">
              Edit Layout
            </button>
          </div>
        </div>
      </div>

      <MetricsSidePanel />

      {showReportModal && report && (
        <ReportPanel report={report} onClose={() => setDismissedReportId(report.run_id)} />
      )}

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

