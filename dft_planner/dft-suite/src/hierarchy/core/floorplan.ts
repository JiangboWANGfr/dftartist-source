// Pure floorplan layout math: real-world (DEF micron) coordinates -> screen-space boxes/lines,
// fit to a view with a uniform scale (never distorts the die's aspect ratio) and Y flipped (DEF
// Y goes up; canvas Y goes down). No React/Konva here — see FloorplanView.tsx for the drawing
// (which also owns user pan/zoom, applied as a Stage-level transform on TOP of this base layout).

export interface FpBox { x: number; y: number; w: number; h: number; }
export interface FpLine { x1: number; y1: number; x2: number; y2: number; }
export interface FpMemory extends FpBox { path: string; placed: boolean; controller: number; }
export interface FpController extends FpBox { name: string; memberPaths: string[]; }
export interface FloorplanLayout {
  die: FpBox;
  memories: FpMemory[];
  controllers: FpController[];
  links: FpLine[];
  /** No DIEAREA / no placed memories at all — nothing to draw, and the view should say why. */
  empty: boolean;
}

const MEM_SIZE = 8;          // screen px, a memory box's side length
const CTRL_PAD = 10;         // screen px margin around a controller's member bounding box

/** die = memoryMap's `die` (micron space, may be all-zero when the DEF has no DIEAREA — in
 *  which case the placed memories' own bounding box is used, same fallback `groupMemories`
 *  applies server-side). memories/controllers come straight off an MbistPlanResult: `x`/`y`/
 *  `placed` per memory, and `memories: number[]` (indices into that same array) per controller. */
export function buildFloorplan(
  die: { x0: number; y0: number; x1: number; y1: number },
  memories: Array<{ path: string; x: number; y: number; placed: boolean }>,
  controllers: Array<{ name: string; memories: number[] }>,
  viewW: number, viewH: number, pad = 24,
): FloorplanLayout {
  const placed = memories.filter((m) => m.placed);
  let { x0, y0, x1, y1 } = die;
  if (x1 <= x0 || y1 <= y0) {
    if (placed.length === 0) return { die: { x: 0, y: 0, w: 0, h: 0 }, memories: [], controllers: [], links: [], empty: true };
    x0 = Math.min(...placed.map((m) => m.x)); x1 = Math.max(...placed.map((m) => m.x));
    y0 = Math.min(...placed.map((m) => m.y)); y1 = Math.max(...placed.map((m) => m.y));
    if (x1 <= x0) x1 = x0 + 1;
    if (y1 <= y0) y1 = y0 + 1;
  }
  const dieW = x1 - x0, dieH = y1 - y0;
  const availW = Math.max(1, viewW - 2 * pad), availH = Math.max(1, viewH - 2 * pad);
  const scale = Math.min(availW / dieW, availH / dieH);
  // center the scaled die inside the view
  const offX = pad + (availW - dieW * scale) / 2;
  const offY = pad + (availH - dieH * scale) / 2;
  const toScreen = (wx: number, wy: number): { x: number; y: number } => ({
    x: offX + (wx - x0) * scale,
    y: offY + (y1 - wy) * scale,   // Y flip: world-up -> screen-down
  });

  const memBoxes: FpMemory[] = memories.map((m) => {
    const p = toScreen(m.x, m.y);
    return { x: p.x - MEM_SIZE / 2, y: p.y - MEM_SIZE / 2, w: MEM_SIZE, h: MEM_SIZE,
             path: m.path, placed: m.placed, controller: -1 };
  });

  const ctrlBoxes: FpController[] = [];
  const links: FpLine[] = [];
  controllers.forEach((c, ci) => {
    const members = c.memories.map((i) => memories[i]).filter((m): m is typeof memories[number] => !!m && m.placed);
    for (const i of c.memories) if (memBoxes[i]) memBoxes[i].controller = ci;
    if (members.length === 0) return;   // nothing placed -> nowhere to draw this controller
    // The controller's region is the BOUNDING BOX of its members' screen positions, padded —
    // not a fixed-size box at the centroid, which used to sit smaller than (or misaligned with)
    // the memories it supposedly encloses the moment a controller had more than one member.
    const pts = members.map((m) => toScreen(m.x, m.y));
    const bx0 = Math.min(...pts.map((p) => p.x)) - MEM_SIZE / 2 - CTRL_PAD;
    const bx1 = Math.max(...pts.map((p) => p.x)) + MEM_SIZE / 2 + CTRL_PAD;
    const by0 = Math.min(...pts.map((p) => p.y)) - MEM_SIZE / 2 - CTRL_PAD;
    const by1 = Math.max(...pts.map((p) => p.y)) + MEM_SIZE / 2 + CTRL_PAD;
    ctrlBoxes.push({ x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0,
                      name: c.name, memberPaths: members.map((m) => m.path) });
    // Links radiate from the controller's CENTER to each member — still useful when a
    // controller has 3+ spatially-spread members, not just the common 1-2 member case.
    const ccx = (bx0 + bx1) / 2, ccy = (by0 + by1) / 2;
    for (const p of pts) links.push({ x1: ccx, y1: ccy, x2: p.x, y2: p.y });
  });

  return {
    die: { x: offX, y: offY, w: dieW * scale, h: dieH * scale },
    memories: memBoxes, controllers: ctrlBoxes, links,
    empty: placed.length === 0,
  };
}
