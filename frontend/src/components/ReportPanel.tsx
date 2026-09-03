import type { RunReport } from "../schema/types";

const STATUS_COLORS: Record<RunReport["status"], string> = {
  completed: "#22c55e",
  stopped: "#ef4444",
};

const STATUS_LABELS: Record<RunReport["status"], string> = {
  completed: "Run complete",
  stopped: "Run stopped",
};

export function ReportPanel({ report, onClose }: { report: RunReport; onClose: () => void }) {
  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={headerRowStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...dotStyle, background: STATUS_COLORS[report.status] }} />
            <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
              {STATUS_LABELS[report.status]}
            </span>
          </div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">
            ×
          </button>
        </div>

        <div style={statGridStyle}>
          <Stat label="duration" value={`${report.duration_s}s`} />
          <Stat label="distance" value={`${report.distance_traveled} cells`} />
          <Stat label="replans" value={String(report.replans_triggered)} />
          <Stat label="obstacles hit" value={String(report.obstacles_hit)} />
        </div>

        {report.obstacles_encountered.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={sectionLabelStyle}>obstacle types</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {report.obstacles_encountered.map((type) => (
                <span key={type} style={tagStyle}>
                  {type}
                </span>
              ))}
            </div>
          </div>
        )}

        {report.legs.length > 1 && (
          <div style={{ marginTop: 14 }}>
            <div style={sectionLabelStyle}>stops ({report.legs.length})</div>
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {report.legs.map((leg, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    color: "#c7ccd1",
                    borderBottom: i < report.legs.length - 1 ? "1px solid #2a2f34" : undefined,
                    paddingBottom: 4,
                  }}
                >
                  <span>
                    #{i + 1} ({leg.target[0]}, {leg.target[1]})
                  </span>
                  <span>
                    {leg.distance_traveled} cells · {leg.duration_s}s
                    {leg.replans_triggered > 0 ? ` · ${leg.replans_triggered} replans` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={sectionLabelStyle}>{label}</div>
      <div style={{ fontSize: 18, color: "#fff", marginTop: 2 }}>{value}</div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
};

const panelStyle: React.CSSProperties = {
  pointerEvents: "auto",
  minWidth: 300,
  background: "rgba(20, 23, 26, 0.94)",
  border: "1px solid #3a3f45",
  borderRadius: 6,
  padding: "16px 18px",
  fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', monospace",
  color: "#c7ccd1",
  boxShadow: "0 8px 30px rgba(0, 0, 0, 0.5)",
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 14,
};

const dotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  display: "inline-block",
};

const statGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#8b929a",
};

const tagStyle: React.CSSProperties = {
  fontSize: 11,
  background: "#2a2f34",
  border: "1px solid #454b52",
  borderRadius: 3,
  padding: "2px 8px",
  color: "#e5e8eb",
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
