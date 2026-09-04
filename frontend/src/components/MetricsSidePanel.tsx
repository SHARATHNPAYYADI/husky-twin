import { useEffect, useState } from "react";
import type { RunRecord, RunStats } from "../schema/types";
import { fetchRunStats } from "../api/runs";
import { useSimStore } from "../store/simStore";
import { ReportPanel } from "./ReportPanel";

// Categorical slots 1 & 2 from the validated dark palette (see the dataviz
// skill) — order is the CVD-safety mechanism, not cosmetic, so obstacle
// types always map to these same two slots in this fixed order.
const OBSTACLE_COLORS: Record<string, string> = {
  pallet: "#3987e5",
  person: "#d95926",
};
const FALLBACK_SERIES_COLOR = "#9085e9"; // violet (slot 7) — only used for an unrecognized type
const SEQUENTIAL_BLUE = "#3987e5";
const STATUS_GOOD = "#0ca30c";
const STATUS_CRITICAL = "#e66767";

/** Always-docked right-side panel — refetches whenever a run finishes, not just on mount. */
export function MetricsSidePanel() {
  const report = useSimStore((s) => s.report);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRunStats()
      .then((s) => !cancelled && setStats(s))
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [report?.run_id]);

  return (
    <>
      <div className="metrics-panel">
        <div className="metrics-panel-title">Metrics</div>

        {error && <div style={{ color: "#ef4444", fontSize: 11 }}>{error}</div>}

        {!error && !stats && <div style={{ color: "#8b929a", fontSize: 11 }}>loading run history…</div>}

        {stats && stats.total_runs === 0 && (
          <div style={{ color: "#8b929a", fontSize: 11, lineHeight: 1.5 }}>
            No runs recorded yet — finish a run to see stats here.
          </div>
        )}

        {stats && stats.total_runs > 0 && <DashboardBody stats={stats} onSelectRun={setSelectedRun} />}
      </div>

      {selectedRun && <ReportPanel report={selectedRun} onClose={() => setSelectedRun(null)} />}
    </>
  );
}

function DashboardBody({ stats, onSelectRun }: { stats: RunStats; onSelectRun: (run: RunRecord) => void }) {
  const replanRate = stats.total_runs > 0 ? Math.round((stats.runs_with_replans / stats.total_runs) * 100) : 0;

  return (
    <div>
      <div className="hud-section-title">Overview</div>
      <div style={statGridStyle}>
        <StatTile label="total runs" value={String(stats.total_runs)} />
        <StatTile label="avg duration" value={`${stats.avg_duration_s}s`} />
        <StatTile label="avg distance" value={`${stats.avg_distance_traveled}`} />
        <StatTile label="avg replans" value={String(stats.avg_replans)} />
        <StatTile label="completed" value={String(stats.completed_runs)} dotColor={STATUS_GOOD} />
        <StatTile label="stopped" value={String(stats.stopped_runs)} dotColor={STATUS_CRITICAL} />
      </div>
      <div style={{ marginTop: 6, fontSize: 10.5, color: "#767c83" }}>
        {stats.runs_with_replans} of {stats.total_runs} runs hit a replan ({replanRate}%)
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="hud-section-title">Runs per day</div>
        <BarChart
          data={stats.runs_per_day.map((d) => ({
            label: d.date.slice(5), // MM-DD — the year rarely matters day to day
            value: d.count,
            color: SEQUENTIAL_BLUE,
          }))}
          formatValue={(v) => `${v} run${v === 1 ? "" : "s"}`}
        />
      </div>

      {Object.keys(stats.obstacle_type_counts).length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="hud-section-title">Obstacles by type</div>
          <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
            {Object.keys(stats.obstacle_type_counts).map((type) => (
              <Legend key={type} color={OBSTACLE_COLORS[type] ?? FALLBACK_SERIES_COLOR} label={type} />
            ))}
          </div>
          <BarChart
            data={Object.entries(stats.obstacle_type_counts).map(([type, count]) => ({
              label: type,
              value: count,
              color: OBSTACLE_COLORS[type] ?? FALLBACK_SERIES_COLOR,
            }))}
            formatValue={(v) => `${v} run${v === 1 ? "" : "s"}`}
          />
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <div className="hud-section-title">Recent runs</div>
        <RunsTable runs={stats.recent_runs} onSelectRun={onSelectRun} />
      </div>
    </div>
  );
}

function StatTile({ label, value, dotColor }: { label: string; value: string; dotColor?: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {dotColor && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
        )}
        <div style={{ fontSize: 10, color: "#8b929a" }}>{label}</div>
      </div>
      <div style={{ fontSize: 15, color: "#fff", marginTop: 1 }}>{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "#c7ccd1" }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />
      {label}
    </div>
  );
}

function BarChart({
  data,
  formatValue,
}: {
  data: { label: string; value: number; color: string }[];
  formatValue: (v: number) => string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const height = 74;
  const barWidth = 16;
  const gap = 9;
  const width = Math.max(1, data.length) * (barWidth + gap) + gap;
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <div style={{ fontSize: 11, color: "#8b929a" }}>no data yet</div>;
  }

  return (
    <div style={{ position: "relative", overflowX: "auto" }}>
      <svg width={width} height={height + 18}>
        <line x1={0} y1={height} x2={width} y2={height} stroke="#383835" strokeWidth={1} />
        {data.map((d, i) => {
          const x = gap + i * (barWidth + gap);
          const h = Math.max(2, (d.value / max) * (height - 6));
          const y = height - h;
          const isHovered = hoverIdx === i;
          return (
            <g key={`${d.label}-${i}`} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
              <rect x={x - 2} y={0} width={barWidth + 4} height={height} fill="transparent" />
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={h}
                rx={3}
                fill={d.color}
                opacity={hoverIdx === null || isHovered ? 1 : 0.55}
              />
              <text x={x + barWidth / 2} y={height + 12} textAnchor="middle" fontSize={8.5} fill="#898781">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hoverIdx !== null && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: gap + hoverIdx * (barWidth + gap) - 10,
            background: "#0d0d0d",
            border: "1px solid #383835",
            borderRadius: 3,
            padding: "3px 6px",
            fontSize: 11,
            color: "#fff",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            transform: "translateY(-100%)",
          }}
        >
          {data[hoverIdx].label}: {formatValue(data[hoverIdx].value)}
        </div>
      )}
    </div>
  );
}

function formatRunTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${date}, ${time}`;
}

function RunsTable({
  runs,
  onSelectRun,
}: {
  runs: RunStats["recent_runs"];
  onSelectRun: (run: RunRecord) => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
        <thead>
          <tr style={{ color: "#8b929a", textAlign: "left" }}>
            <th style={thStyle}>when</th>
            <th style={thStyle}>status</th>
            <th style={thStyle}>dur</th>
            <th style={thStyle}>dist</th>
            <th style={thStyle}>replans</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr
              key={r.run_id}
              onClick={() => onSelectRun(r)}
              style={{ borderTop: "1px solid #2a2f34", cursor: "pointer" }}
              className="metrics-run-row"
            >
              <td style={{ ...tdStyle, color: "#8b929a", whiteSpace: "nowrap" }} title={r.start_time}>
                {formatRunTime(r.start_time)}
              </td>
              <td style={tdStyle}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: r.status === "completed" ? STATUS_GOOD : STATUS_CRITICAL,
                      display: "inline-block",
                    }}
                  />
                  {r.status}
                </span>
              </td>
              <td style={tdStyle}>{r.duration_s}s</td>
              <td style={tdStyle}>{r.distance_traveled}</td>
              <td style={tdStyle}>{r.replans_triggered}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const statGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px 12px",
};

const thStyle: React.CSSProperties = { padding: "3px 8px 3px 0", fontWeight: 400 };
const tdStyle: React.CSSProperties = { padding: "4px 8px 4px 0", color: "#e5e8eb" };
