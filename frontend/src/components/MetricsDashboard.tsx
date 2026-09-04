import { useEffect, useState } from "react";
import type { RunStats } from "../schema/types";
import { fetchRunStats } from "../api/runs";

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

export function MetricsDashboard({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<RunStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRunStats()
      .then((s) => !cancelled && setStats(s))
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Metrics Dashboard</div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">
            ×
          </button>
        </div>

        {error && <div style={{ marginTop: 20, color: "#ef4444", fontSize: 12 }}>{error}</div>}

        {!error && !stats && <div style={{ marginTop: 20, color: "#8b929a" }}>loading run history…</div>}

        {stats && stats.total_runs === 0 && (
          <div style={{ marginTop: 20, color: "#8b929a", fontSize: 12 }}>
            No runs recorded yet — finish a run in the sim to see stats here.
          </div>
        )}

        {stats && stats.total_runs > 0 && <DashboardBody stats={stats} />}
      </div>
    </div>
  );
}

function DashboardBody({ stats }: { stats: RunStats }) {
  const replanRate = stats.total_runs > 0 ? Math.round((stats.runs_with_replans / stats.total_runs) * 100) : 0;

  return (
    <div style={{ marginTop: 16, width: 640 }}>
      <div style={statGridStyle}>
        <StatTile label="total runs" value={String(stats.total_runs)} />
        <StatTile label="avg duration" value={`${stats.avg_duration_s}s`} />
        <StatTile label="avg distance" value={`${stats.avg_distance_traveled} cells`} />
        <StatTile label="avg replans" value={String(stats.avg_replans)} />
      </div>

      <div style={{ ...statGridStyle, marginTop: 12 }}>
        <StatTile label="completed" value={String(stats.completed_runs)} dotColor={STATUS_GOOD} />
        <StatTile label="stopped" value={String(stats.stopped_runs)} dotColor={STATUS_CRITICAL} />
        <StatTile label="runs with replans" value={`${stats.runs_with_replans} (${replanRate}%)`} />
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={sectionTitleStyle}>runs per day</div>
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
        <div style={{ marginTop: 22 }}>
          <div style={sectionTitleStyle}>obstacles encountered, by type</div>
          <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
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

      <div style={{ marginTop: 22 }}>
        <div style={sectionTitleStyle}>recent runs</div>
        <RunsTable runs={stats.recent_runs} />
      </div>
    </div>
  );
}

function StatTile({ label, value, dotColor }: { label: string; value: string; dotColor?: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {dotColor && (
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
        )}
        <div style={{ fontSize: 11, color: "#8b929a" }}>{label}</div>
      </div>
      <div style={{ fontSize: 18, color: "#fff", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#c7ccd1" }}>
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
  const height = 90;
  const barWidth = 20;
  const gap = 12;
  const width = Math.max(1, data.length) * (barWidth + gap) + gap;
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <div style={{ fontSize: 11, color: "#8b929a" }}>no data yet</div>;
  }

  return (
    <div style={{ position: "relative", overflowX: "auto" }}>
      <svg width={width} height={height + 20}>
        <line x1={0} y1={height} x2={width} y2={height} stroke="#383835" strokeWidth={1} />
        {data.map((d, i) => {
          const x = gap + i * (barWidth + gap);
          const h = Math.max(2, (d.value / max) * (height - 8));
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
              <text x={x + barWidth / 2} y={height + 13} textAnchor="middle" fontSize={9} fill="#898781">
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

function RunsTable({ runs }: { runs: RunStats["recent_runs"] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ color: "#8b929a", textAlign: "left" }}>
            <th style={thStyle}>when</th>
            <th style={thStyle}>status</th>
            <th style={thStyle}>duration</th>
            <th style={thStyle}>distance</th>
            <th style={thStyle}>replans</th>
            <th style={thStyle}>stops</th>
            <th style={thStyle}>obstacles</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.run_id} style={{ borderTop: "1px solid #2a2f34" }}>
              <td style={{ ...tdStyle, color: "#8b929a", whiteSpace: "nowrap" }} title={r.start_time}>
                {formatRunTime(r.start_time)}
              </td>
              <td style={tdStyle}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    color: r.status === "completed" ? undefined : "#c7ccd1",
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
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
              <td style={tdStyle}>{r.legs.length}</td>
              <td style={tdStyle}>{r.obstacles_encountered.join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0, 0, 0, 0.6)",
  zIndex: 20,
};

const panelStyle: React.CSSProperties = {
  background: "rgba(20, 23, 26, 0.98)",
  border: "1px solid #3a3f45",
  borderRadius: 6,
  padding: 18,
  fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', monospace",
  color: "#c7ccd1",
  boxShadow: "0 8px 30px rgba(0, 0, 0, 0.6)",
  maxHeight: "90vh",
  overflowY: "auto",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const closeBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#8b929a",
  fontSize: 18,
  cursor: "pointer",
  lineHeight: 1,
  padding: 4,
};

const statGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 14,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#8b929a",
  marginBottom: 8,
};

const thStyle: React.CSSProperties = { padding: "4px 10px 4px 0", fontWeight: 400 };
const tdStyle: React.CSSProperties = { padding: "5px 10px 5px 0", color: "#e5e8eb" };
