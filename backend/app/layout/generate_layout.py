"""
Generates backend/app/layout/warehouse_layout.json.

Layout design (40x40 grid):
  y  0- 7  Staging area — open, chargers along the left wall, robot start point
  y  8- 9  Cross-aisle — separates staging from racking
  y 10-21  Racking zone A — 12 shelf rows (dense)
  y 22-23  Cross-aisle — splits racking into two zones
  y 24-35  Racking zone B — 12 shelf rows (dense)
  y 36-39  Back area — open, run target lives here

Shelf columns run at x = 2, 5, 8, ... 35 (12 columns), each 1 cell wide with
a 2-cell aisle on either side — dense enough to force real routing decisions,
wide enough for a single robot to pass.

Run directly to (re)write app/layout/warehouse_layout.json:
    python3 -m app.layout.generate_layout
"""

import json
from pathlib import Path

WIDTH = 40
HEIGHT = 40

SHELF_X_START = 2
SHELF_X_STEP = 3
SHELF_COLS = 12  # x = 2, 5, 8, ..., 35

ZONE_A_Y = 10
ZONE_B_Y = 24
SHELF_H = 12  # zone A: y 10-21, zone B: y 24-35

CHARGER_X = 1
CHARGER_YS = [1, 3, 5]

START = [2, 2]
TARGET = [35, 37]


def build_layout() -> dict:
    shelves = []
    for col in range(SHELF_COLS):
        x = SHELF_X_START + col * SHELF_X_STEP
        shelves.append({"x": x, "y": ZONE_A_Y, "w": 1, "h": SHELF_H})  # zone A
        shelves.append({"x": x, "y": ZONE_B_Y, "w": 1, "h": SHELF_H})  # zone B

    chargers = [[CHARGER_X, y] for y in CHARGER_YS]

    return {
        "width": WIDTH,
        "height": HEIGHT,
        "cell_size": 1.0,
        "shelves": shelves,
        "chargers": chargers,
        "start": START,
        "target": TARGET,
    }


if __name__ == "__main__":
    layout = build_layout()
    out_path = Path(__file__).parent / "warehouse_layout.json"
    out_path.write_text(json.dumps(layout, indent=2))
    print(f"Wrote {out_path} — {len(layout['shelves'])} shelves")