import { useEffect, useState } from "react";

const CONNECTION_COLOR: Record<string, string> = {
  open: "#0ca30c",
  connecting: "#fab219",
  closed: "#e66767",
};

const ROBOT_STATE_COLOR: Record<string, string> = {
  idle: "#767c83",
  navigating: "#3987e5",
  replanning: "#eda100",
  arrived: "#0ca30c",
};

export function TopBar({
  connectionStatus,
  robotState,
}: {
  connectionStatus: string;
  robotState?: string;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="topbar">
      <div className="topbar-brand">
        <span className="topbar-brand-mark" />
        <div>
          <div className="topbar-brand-name">Husky Twin</div>
          <div className="topbar-brand-sub">Warehouse Digital Twin</div>
        </div>
      </div>

      <div className="topbar-right">
        {robotState && (
          <div className="topbar-chip">
            <span className="topbar-chip-dot" style={{ background: ROBOT_STATE_COLOR[robotState] ?? "#767c83" }} />
            {robotState}
          </div>
        )}

        <div className="topbar-clock">
          {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>

        <div className="topbar-chip">
          <span
            className="topbar-chip-dot"
            style={{ background: CONNECTION_COLOR[connectionStatus] ?? "#767c83" }}
          />
          {connectionStatus}
        </div>
      </div>
    </div>
  );
}
