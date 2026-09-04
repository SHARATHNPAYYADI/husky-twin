import { useEffect, useState } from "react";
import "./App.css";
import { Scene } from "./scene/Scene";
import { ReportPanel } from "./components/ReportPanel";
import { LayoutEditor } from "./components/LayoutEditor";
import { MetricsSidePanel } from "./components/MetricsSidePanel";
import { RobotCamPanel } from "./components/RobotCamPanel";
import { TopBar } from "./components/TopBar";
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

  const handleFloorClick = (cell: Cell) => {
    if (!layout) return;

    const onShelf = layout.shelves.some(
      (s) => cell[0] >= s.x && cell[0] < s.x + s.w && cell[1] >= s.y && cell[1] < s.y + s.h,
    );
    if (onShelf) return; // placing inside a shelf isn't meaningful — already blocked

    if (clickMode === "queue") {
      setQueuedTargets((q) => [...q, cell]);
      // Once the previous run isn't actively in progress, its activeRunTargets
      // is stale — clear it so these new stops show up as markers instead of
      // being shadowed by the just-finished route (see targetMarkers below).
      if (!robot || !RUNNING_STATES.has(robot.state)) {
        setActiveRunTargets([]);
      }
      return;
    }

    const obstacle = { id: crypto.randomUUID(), type: selectedType, cell };
    sendPlaceObstacle(obstacle);
    addLocalObstacle(obstacle);
  };

  if (!layout || !robot) {
    return (
      <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
        <TopBar connectionStatus={status} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            background: "#14171a",
            color: "#c7ccd1",
            fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', monospace",
            fontSize: 13,
          }}
        >
          connecting to backend ({status})…
        </div>
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

  const removeQueuedTarget = (index: number) => {
    setQueuedTargets((q) => q.filter((_, i) => i !== index));
  };

  const handleStartRun = () => {
    const targets = queuedTargets.length > 0 ? queuedTargets : [layout.target];
    // After a run, the robot sits exactly on its last stop — re-running
    // straight to that same default target (or a queued stop that happens
    // to match it) has zero distance to cover, so the backend reports it
    // "completed" instantly with no visible movement. Skip that no-op.
    const currentCell: Cell = [Math.round(robot.position[0]), Math.round(robot.position[1])];
    if (targets[0][0] === currentCell[0] && targets[0][1] === currentCell[1]) return;

    setActiveRunTargets(targets);
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

      <TopBar connectionStatus={status} robotState={robot.state} />

      <div className="left-column">
        <div className="hud">
          <div className="hud-header">
            <div className="hud-title">Husky Digital Twin</div>
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
            <div className="hud-section-title">Obstacles</div>
            <div className="btn-row">
              {OBSTACLE_TYPES.map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => {
                    setSelectedType(type);
                    setClickMode("obstacle");
                  }}
                  className={`btn btn-toggle${
                    clickMode === "obstacle" && selectedType === type ? " selected" : ""
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {clickMode === "obstacle" && (
              <div className="hud-hint">
                click the floor to drop a {OBSTACLE_TYPES.find((o) => o.type === selectedType)?.label.toLowerCase()}
              </div>
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

        <div className="route-panel">
          <div className="route-panel-header">
            <div className="route-panel-title">Route</div>
            <button
              onClick={() => setClickMode("queue")}
              className={`btn btn-toggle btn-small${clickMode === "queue" ? " selected" : ""}`}
            >
              Add Stop
            </button>
          </div>

          {clickMode === "queue" && (
            <div className="hud-hint" style={{ marginTop: 0, marginBottom: 10 }}>
              click the floor to add a stop — add as many as you like, in order
            </div>
          )}

          {queuedTargets.length === 0 ? (
            <div className="hud-hint" style={{ marginTop: 0 }}>
              {clickMode === "queue" ? (
                "No stops yet — click the floor to add your first one."
              ) : (
                <>
                  No stops planned. Click <strong>Add Stop</strong> above, then click the floor to build a route —
                  otherwise Start Run sends the robot straight to the default target.
                </>
              )}
            </div>
          ) : (
            <>
              <div className="route-list">
                {queuedTargets.map((c, i) => (
                  <div key={i} className="route-item">
                    <span className="route-item-index">{i + 1}</span>
                    <span className="route-item-coord">
                      ({c[0]}, {c[1]})
                    </span>
                    <button
                      onClick={() => removeQueuedTarget(i)}
                      className="route-item-remove"
                      aria-label={`Remove stop ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => setQueuedTargets([])} className="btn btn-small" style={{ marginTop: 8 }}>
                Clear all
              </button>
            </>
          )}
        </div>
      </div>

      <div className="right-column">
        <MetricsSidePanel />
        <RobotCamPanel
          layout={layout}
          robotPosition={robot.position}
          robotHeading={robot.heading}
          obstacles={obstacles}
          path={robot.path}
        />
      </div>

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

