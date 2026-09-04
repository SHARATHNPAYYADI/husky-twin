import { useMemo } from "react";
import type { ShelfRect } from "../schema/types";

const SHELF_HEIGHT = 2.2;
const POST_COLOR = "#f2c14e"; // safety yellow — real racking uprights are painted this for visibility
const DECK_COLOR = "#e0ab2e"; // slightly darker yellow deck, reads distinct from the posts
const DECK_THICKNESS = 0.05;
const BOX_COLORS = ["#c98a4b", "#8a6a4a", "#5b7a9e", "#7a8f5b", "#a85c5c", "#6b6b8f", "#c2a25c"];

// Cheap deterministic hash — same shelf index always renders the same
// "random" boxes, so nothing jitters on re-render.
function hash(...nums: number[]): number {
  let h = 2166136261;
  for (const n of nums) {
    h ^= n;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A section of warehouse racking: a yellow-post steel frame with 3 beam
 * levels, the bottom two carrying a scattering of stacked cartons/pallets —
 * a stand-in for real inventory rather than one flat gray box.
 */
export function RackUnit({ shelf, index }: { shelf: ShelfRect; index: number }) {
  const footW = shelf.w * 0.9;
  const footH = shelf.h * 0.9;

  const { posts, levels, boxes } = useMemo(() => {
    const isXLong = footW >= footH;
    const long = Math.max(footW, footH);

    const postOffsets: [number, number][] = [
      [footW / 2 - 0.05, footH / 2 - 0.05],
      [-(footW / 2 - 0.05), footH / 2 - 0.05],
      [footW / 2 - 0.05, -(footH / 2 - 0.05)],
      [-(footW / 2 - 0.05), -(footH / 2 - 0.05)],
    ];

    // Levels 1 & 2 carry boxes up to 0.28 tall (see bh below) on top of a
    // 0.05-thick deck — 0.74 leaves ~0.27 of headroom under SHELF_HEIGHT so
    // the tallest box never pokes out above the posts.
    const levelYs = [SHELF_HEIGHT * 0.05, SHELF_HEIGHT * 0.42, SHELF_HEIGHT * 0.74];
    // Denser packing along the shelf's length, plus a second row across its
    // depth (short axis) wherever there's room for one — a sparse single
    // line reads as empty shelving, not stocked racking.
    const boxCount = Math.min(14, Math.max(2, Math.round(long / 0.6)));
    const shortDim = Math.min(footW, footH);
    const rowOffsets = shortDim >= 0.6 ? [-shortDim * 0.22, shortDim * 0.22] : [0];

    const boxMeshes = [levelYs[1], levelYs[2]].flatMap((ly, li) =>
      Array.from({ length: boxCount }, (_, bi) => {
        const t = boxCount === 1 ? 0.5 : bi / (boxCount - 1);
        return rowOffsets.map((rowOffset, ri) => {
          const seed = hash(index, li, bi, ri);
          const color = BOX_COLORS[seed % BOX_COLORS.length];
          const bw = 0.26 + ((seed >> 3) % 4) * 0.04;
          const bh = 0.2 + ((seed >> 5) % 3) * 0.04;
          const along = (t - 0.5) * Math.max(0, long - bw);
          const jitter = rowOffset + ((seed >> 7) % 3 - 1) * 0.015;
          const x = isXLong ? along : jitter;
          const z = isXLong ? jitter : along;
          const w = isXLong ? bw : 0.24;
          const d = isXLong ? 0.24 : bw;
          // Flush with the deck's top face (ly + half its thickness) — no
          // gap, so the box visibly rests on the shelf instead of floating.
          return { key: `${li}-${bi}-${ri}`, x, y: ly + DECK_THICKNESS / 2 + bh / 2, z, w, h: bh, d, color };
        });
      }),
    ).flat();

    return { posts: postOffsets, levels: levelYs, boxes: boxMeshes };
  }, [footW, footH, index]);

  return (
    <group>
      {posts.map(([px, pz], i) => (
        <mesh key={i} position={[px, SHELF_HEIGHT / 2, pz]} castShadow>
          <boxGeometry args={[0.06, SHELF_HEIGHT, 0.06]} />
          <meshStandardMaterial color={POST_COLOR} />
        </mesh>
      ))}

      {levels.map((ly, li) =>
        li === 0 ? (
          // Base level carries no boxes — just a thin rail pair near the floor.
          <group key={li}>
            <mesh position={[0, ly, footH / 2 - 0.03]} castShadow>
              <boxGeometry args={[footW, 0.05, 0.06]} />
              <meshStandardMaterial color={POST_COLOR} />
            </mesh>
            <mesh position={[0, ly, -(footH / 2 - 0.03)]} castShadow>
              <boxGeometry args={[footW, 0.05, 0.06]} />
              <meshStandardMaterial color={POST_COLOR} />
            </mesh>
          </group>
        ) : (
          // A full deck under the box-bearing levels — boxes rest flush on
          // top of this, wherever they land, instead of floating over a gap
          // between two edge rails.
          <mesh key={li} position={[0, ly, 0]} castShadow receiveShadow>
            <boxGeometry args={[footW, DECK_THICKNESS, footH]} />
            <meshStandardMaterial color={DECK_COLOR} />
          </mesh>
        ),
      )}

      {boxes.map((b) => (
        <mesh key={b.key} position={[b.x, b.y, b.z]} castShadow>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color={b.color} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}
