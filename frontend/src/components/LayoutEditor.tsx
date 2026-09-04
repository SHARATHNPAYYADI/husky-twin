import { useEffect, useRef, useState } from "react";
import type { Cell, LayoutSummary, ShelfRect, WarehouseLayout } from "../schema/types";
import { activateLayout, fetchLayouts, fetchStarterLayout, saveLayout } from "../api/layouts";

type PaintMode = "shelf" | "charger" | "start" | "target" | "erase";

const PAINT_MODES: PaintMode[] = ["shelf", "charger", "start", "target", "erase"];
const CELL_PX = 12;

const MODE_HINTS: Record<PaintMode, string> = {
  shelf: "click/drag to paint shelves",
  charger: "click/drag to paint chargers",
  start: "click to set the robot's start cell",
  target: "click to set the default target cell",
  erase: "click/drag to clear shelves/chargers",
};

export function LayoutEditor({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintingRef = useRef(false);

  const [width, setWidth] = useState(40);
  const [height, setHeight] = useState(40);
  const [shelves, setShelves] = useState<Set<string>>(new Set());
  const [chargers, setChargers] = useState<Set<string>>(new Set());
  const [start, setStart] = useState<Cell>([1, 1]);
  const [target, setTarget] = useState<Cell>([2, 2]);
  const [mode, setMode] = useState<PaintMode>("shelf");
  const [name, setName] = useState("My Layout");
  const [savedLayouts, setSavedLayouts] = useState<LayoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchStarterLayout(), fetchLayouts()])
      .then(([starter, list]) => {
        if (cancelled) return;
        applyLayout(starter);
        setSavedLayouts(list);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setInitError(
          `Failed to load: ${String(e)}. If this is the deployed site, the backend's ` +
            "FRONTEND_ORIGINS may not include this origin yet (CORS) — check the Render logs/env vars.",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function applyLayout(layout: WarehouseLayout) {
    setWidth(layout.width);
    setHeight(layout.height);
    const shelfCells = new Set<string>();
    for (const r of layout.shelves) {
      for (let dx = 0; dx < r.w; dx++) {
        for (let dy = 0; dy < r.h; dy++) {
          shelfCells.add(`${r.x + dx},${r.y + dy}`);
        }
      }
    }
    setShelves(shelfCells);
    setChargers(new Set(layout.chargers.map((c) => `${c[0]},${c[1]}`)));
    setStart(layout.start);
    setTarget(layout.target);
  }

  function cellFromEvent(e: React.MouseEvent<HTMLCanvasElement>): Cell | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * height);
    if (x < 0 || x >= width || y < 0 || y >= height) return null;
    return [x, y];
  }

  function paintCell(cell: Cell) {
    const key = `${cell[0]},${cell[1]}`;
    if (mode === "shelf") {
      setShelves((s) => new Set(s).add(key));
      setChargers((c) => (c.has(key) ? without(c, key) : c));
    } else if (mode === "charger") {
      setChargers((c) => new Set(c).add(key));
      setShelves((s) => (s.has(key) ? without(s, key) : s));
    } else if (mode === "erase") {
      setShelves((s) => (s.has(key) ? without(s, key) : s));
      setChargers((c) => (c.has(key) ? without(c, key) : c));
    } else if (mode === "start") {
      setStart(cell);
    } else if (mode === "target") {
      setTarget(cell);
    }
  }

  function without(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    next.delete(key);
    return next;
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const cell = cellFromEvent(e);
    if (!cell) return;
    paintCell(cell);
    if (mode === "shelf" || mode === "charger" || mode === "erase") {
      paintingRef.current = true;
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!paintingRef.current) return;
    const cell = cellFromEvent(e);
    if (cell) paintCell(cell);
  }

  function stopPainting() {
    paintingRef.current = false;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width * CELL_PX;
    canvas.height = height * CELL_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#1c2024";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#2a2f34";
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL_PX + 0.5, 0);
      ctx.lineTo(x * CELL_PX + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL_PX + 0.5);
      ctx.lineTo(canvas.width, y * CELL_PX + 0.5);
      ctx.stroke();
    }

    ctx.fillStyle = "#6b7280";
    for (const key of shelves) {
      const [x, y] = key.split(",").map(Number);
      ctx.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
    }

    ctx.fillStyle = "#3b82f6";
    for (const key of chargers) {
      const [x, y] = key.split(",").map(Number);
      ctx.fillRect(x * CELL_PX + 2, y * CELL_PX + 2, CELL_PX - 4, CELL_PX - 4);
    }

    ctx.fillStyle = "#22c55e";
    ctx.fillRect(start[0] * CELL_PX + 1, start[1] * CELL_PX + 1, CELL_PX - 2, CELL_PX - 2);

    ctx.fillStyle = "#ef4444";
    ctx.fillRect(target[0] * CELL_PX + 1, target[1] * CELL_PX + 1, CELL_PX - 2, CELL_PX - 2);
  }, [width, height, shelves, chargers, start, target]);

  function buildLayout(): WarehouseLayout {
    const shelfRects: ShelfRect[] = Array.from(shelves).map((key) => {
      const [x, y] = key.split(",").map(Number);
      return { x, y, w: 1, h: 1 };
    });
    const chargerCells: Cell[] = Array.from(chargers).map((key) => {
      const [x, y] = key.split(",").map(Number);
      return [x, y] as Cell;
    });
    return { width, height, cell_size: 1.0, shelves: shelfRects, chargers: chargerCells, start, target };
  }

  async function handleSaveAndActivate() {
    setSaving(true);
    setError(null);
    try {
      const { id } = await saveLayout(name.trim() || "Untitled layout", buildLayout());
      await activateLayout(id);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleLoad(id: string) {
    setError(null);
    try {
      await activateLayout(id);
      onClose();
    } catch (e) {
      setError(String(e));
    }
  }

  function handleClearGrid() {
    setShelves(new Set());
    setChargers(new Set());
    setStart([1, 1]);
    setTarget([Math.max(0, width - 2), Math.max(0, height - 2)]);
  }

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Layout Editor</div>

        {loading ? (
          <div style={{ marginTop: 20, color: "#8b929a" }}>loading starter layout…</div>
        ) : initError ? (
          <div style={{ marginTop: 20, maxWidth: 360 }}>
            <div style={{ color: "#ef4444", fontSize: 12, lineHeight: 1.5 }}>{initError}</div>
            <button onClick={onClose} style={{ ...btnStyle, marginTop: 14 }}>
              Close
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 14, display: "flex", gap: 16 }}>
            <canvas
              ref={canvasRef}
              style={{ border: "1px solid #3a3f45", cursor: "crosshair" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={stopPainting}
              onMouseLeave={stopPainting}
            />

            <div style={{ minWidth: 220, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={labelStyle}>grid size</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <input
                    type="number"
                    value={width}
                    min={5}
                    max={100}
                    onChange={(e) => setWidth(Number(e.target.value) || 5)}
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    value={height}
                    min={5}
                    max={100}
                    onChange={(e) => setHeight(Number(e.target.value) || 5)}
                    style={inputStyle}
                  />
                </div>
                <button onClick={handleClearGrid} style={{ ...btnStyle, marginTop: 6 }}>
                  Clear grid
                </button>
              </div>

              <div>
                <div style={labelStyle}>paint mode</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  {PAINT_MODES.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      style={{
                        ...btnStyle,
                        borderColor: mode === m ? "#e5e8eb" : "#454b52",
                        color: mode === m ? "#fff" : "#c7ccd1",
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: "#8b929a" }}>{MODE_HINTS[mode]}</div>
              </div>

              <div>
                <div style={labelStyle}>save as</div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ ...inputStyle, width: "100%", marginTop: 4 }}
                />
                <button
                  onClick={handleSaveAndActivate}
                  disabled={saving}
                  style={{ ...btnStyle, marginTop: 8, width: "100%" }}
                >
                  {saving ? "Saving…" : "Save & Activate"}
                </button>
              </div>

              {savedLayouts.length > 0 && (
                <div>
                  <div style={labelStyle}>saved layouts</div>
                  <div
                    style={{
                      marginTop: 4,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      maxHeight: 140,
                      overflowY: "auto",
                    }}
                  >
                    {savedLayouts.map((l) => (
                      <div
                        key={l.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: 11,
                          gap: 8,
                        }}
                      >
                        <span style={{ color: "#c7ccd1" }}>
                          {l.name} ({l.width}×{l.height})
                        </span>
                        <button onClick={() => handleLoad(l.id)} style={{ ...btnStyle, padding: "2px 8px" }}>
                          Load
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && <div style={{ color: "#ef4444", fontSize: 11 }}>{error}</div>}

              <button onClick={onClose} style={{ ...btnStyle, marginTop: "auto" }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
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

const labelStyle: React.CSSProperties = { fontSize: 11, color: "#8b929a" };

const inputStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: 12,
  padding: "4px 6px",
  background: "#2a2f34",
  color: "#e5e8eb",
  border: "1px solid #454b52",
  borderRadius: 3,
  width: 60,
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
