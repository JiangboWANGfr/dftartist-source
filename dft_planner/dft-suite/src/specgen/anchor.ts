// 浮动锚点（drawio 式盒级连线）：float 端在渲染时选"面向对端"的边，同盒同边多线沿边错开。
// 纯函数、无 Konva 依赖；MUX M/S/out 与接口块脚走 fixed 端，不参与浮动。
import type { Side } from "../genconn/layout.ts";

export interface ARect { x: number; y: number; w: number; h: number; }
export type AVec = { dx: number; dy: number };
export interface AnchorPt { x: number; y: number; dir: AVec }
export type AnchorEnd =
  | { kind: "float"; key: string; box: ARect }
  | { kind: "fixed"; key: string; at: AnchorPt };

const GRID = 20;

const sideDir = (s: Side): AVec =>
  s === "left" ? { dx: -1, dy: 0 } : s === "right" ? { dx: 1, dy: 0 } : s === "top" ? { dx: 0, dy: -1 } : { dx: 0, dy: 1 };
const center = (r: ARect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** 盒面向目标点的边：|dx|>=|dy| 取左右，否则取上下。 */
export function sideToward(box: ARect, target: { x: number; y: number }): Side {
  const c = center(box);
  const dx = target.x - c.x, dy = target.y - c.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
}

/** 边上第 k/n 个锚点。
 *  n===1（单线）：锚点 = 边中点，正好落在 IP 悬停显示的 4 个连接点之一（哪怕中点不在 20 网格上，
 *    如 100 宽边中点 50——moveSegment 已支持端口锚点离网格，共享轴保持精确不出斜线）。
 *  n>1（多线）：在**排除两端角槽**的内网格槽 [1, slots-1] 居中连续错开（floor 取整偏上/左）；
 *    短边(40)内槽只剩中点 → 多线汇于连接点。锚点因此永不落盒角（杜绝“线擦着角点、看似脱离 IP”）。 */
export function anchorOnSide(box: ARect, side: Side, k = 0, n = 1): AnchorPt {
  const d = sideDir(side);
  const edge = side === "left" || side === "right" ? box.h : box.w;
  let off: number;
  if (n <= 1) {
    off = edge / 2;                                         // 单线：边中点 = 连接点
  } else {
    const slots = Math.floor(edge / GRID);                  // 网格槽下标 0..slots；角槽 = 0 与 slots
    const start = Math.floor(slots / 2 - (n - 1) / 2);
    const idx = Math.min(slots - 1, Math.max(1, start + k)); // 夹在内槽 [1, slots-1]，永不落角
    off = idx * GRID;
  }
  if (side === "left") return { x: box.x, y: box.y + off, dir: d };
  if (side === "right") return { x: box.x + box.w, y: box.y + off, dir: d };
  if (side === "top") return { x: box.x + off, y: box.y, dir: d };
  return { x: box.x + off, y: box.y + box.h, dir: d };
}

/** 一批线的两端锚点：float 端定边（对端参考点 = fixed 点或对端盒中心），同 key+边分组、按对端沿边坐标排序错开。 */
export function computeWireAnchors(wires: { id: string; a: AnchorEnd; b: AnchorEnd }[]): Map<string, { a: AnchorPt; b: AnchorPt }> {
  const refPt = (e: AnchorEnd) => (e.kind === "fixed" ? { x: e.at.x, y: e.at.y } : center(e.box));
  type Slot = { wid: string; end: "a" | "b"; key: string; box: ARect; side: Side; ref: number };
  const slots: Slot[] = [];
  for (const w of wires) {
    for (const end of ["a", "b"] as const) {
      const e = w[end];
      if (e.kind !== "float") continue;
      const other = refPt(end === "a" ? w.b : w.a);
      const side = sideToward(e.box, other);
      slots.push({ wid: w.id, end, key: e.key, box: e.box, side, ref: side === "left" || side === "right" ? other.y : other.x });
    }
  }
  const groups = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = `${s.key}|${s.side}`;
    const g = groups.get(k) ?? [];
    g.push(s); groups.set(k, g);
  }
  const placed = new Map<string, AnchorPt>();
  for (const g of groups.values()) {
    g.sort((p, q) => p.ref - q.ref);
    g.forEach((s, i) => placed.set(`${s.wid}|${s.end}`, anchorOnSide(s.box, s.side, i, g.length)));
  }
  const out = new Map<string, { a: AnchorPt; b: AnchorPt }>();
  for (const w of wires) {
    const at = (end: "a" | "b"): AnchorPt => {
      const e = w[end];
      return e.kind === "fixed" ? e.at : placed.get(`${w.id}|${end}`)!;
    };
    out.set(w.id, { a: at("a"), b: at("b") });
  }
  return out;
}
