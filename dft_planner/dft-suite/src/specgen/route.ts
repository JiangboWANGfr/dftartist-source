// 正交连线避障布线：Hanan 网格 + A*（业界 orthogonal connector routing 的常见做法，参考 libavoid/Adaptagrams、mxGraph）。
// 网格线 = 各障碍矩形的边 + 端口引出点坐标；A* 在网格交点间走正交边、带转弯惩罚、绕开障碍矩形内部。纯函数、零依赖。
export interface Rect { x: number; y: number; w: number; h: number; }
export interface Pt { x: number; y: number }
export interface Dir { dx: number; dy: number }

const uniqSort = (xs: number[]): number[] => [...new Set(xs.map((v) => Math.round(v)))].sort((a, b) => a - b);
const inside = (px: number, py: number, r: Rect): boolean => px > r.x + 0.5 && px < r.x + r.w - 0.5 && py > r.y + 0.5 && py < r.y + r.h - 0.5;

/** 简单 HVH 兜底折线（A* 失败时用）。 */
function hvh(a: Pt, b: Pt): number[] {
  const midX = Math.round((a.x + b.x) / 2);
  return [a.x, a.y, midX, a.y, midX, b.y, b.x, b.y];
}

/** 去掉共线冗余点。 */
function simplify(pts: number[]): number[] {
  const p: Pt[] = [];
  for (let i = 0; i < pts.length; i += 2) p.push({ x: pts[i], y: pts[i + 1] });
  const out: Pt[] = [];
  for (let i = 0; i < p.length; i++) {
    if (i > 0 && i < p.length - 1) {
      const a = out[out.length - 1], c = p[i + 1], b = p[i];
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) continue; // 共线，丢中点
    }
    if (out.length && out[out.length - 1].x === p[i].x && out[out.length - 1].y === p[i].y) continue; // 重复点
    out.push(p[i]);
  }
  return out.flatMap((q) => [q.x, q.y]);
}

/** 段拥塞代价：给一条候选正交段（世界坐标）返回额外代价（0 = 不拥塞）。用于让后布的线避开先布线路，减少重叠。 */
export type SegCost = (x1: number, y1: number, x2: number, y2: number) => number;

/** 拥塞跟踪器：记录已布线路的水平/竖直段，为后续布线提供“与已用走廊重叠 → 加价”的 cost 函数。
 *  只惩罚**真正区间重叠**（重叠长度 > 2*tol）的同轴段，避免仅在拐角处相碰也被误判。 */
export interface Congestion { cost: SegCost; add(pts: number[]): void; }
export function makeCongestion(penalty = 26, tol = 6): Congestion {
  const hor: { y: number; a: number; b: number }[] = []; // 已用水平段：y 固定，x∈[a,b]
  const ver: { x: number; a: number; b: number }[] = []; // 已用竖直段：x 固定，y∈[a,b]
  const cost: SegCost = (x1, y1, x2, y2) => {
    if (Math.abs(y1 - y2) < 1e-6) {
      const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
      for (const s of hor) if (Math.abs(s.y - y1) <= tol && s.b > lo + tol && s.a < hi - tol) return penalty;
    } else if (Math.abs(x1 - x2) < 1e-6) {
      const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
      for (const s of ver) if (Math.abs(s.x - x1) <= tol && s.b > lo + tol && s.a < hi - tol) return penalty;
    }
    return 0;
  };
  const add = (pts: number[]) => {
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x1 = pts[i], y1 = pts[i + 1], x2 = pts[i + 2], y2 = pts[i + 3];
      if (Math.abs(y1 - y2) < 1e-6) hor.push({ y: y1, a: Math.min(x1, x2), b: Math.max(x1, x2) });
      else if (Math.abs(x1 - x2) < 1e-6) ver.push({ x: x1, a: Math.min(y1, y2), b: Math.max(y1, y2) });
    }
  };
  return { cost, add };
}

/**
 * 从 from（沿 fromDir 引出）到 to（沿 toDir 引出）的正交避障折线点数组 [x0,y0,x1,y1,...]。
 * obstacles = 需要绕开的矩形（IP 盒）；margin = 障碍外扩；stub = 端口垂直引出长度；
 * congestion = 可选段拥塞代价（让后布线路避开已用走廊，减少多线重叠）。
 */
export function routeOrtho(from: Pt, fromDir: Dir, to: Pt, toDir: Dir, obstacles: Rect[], margin = 14, stub = 18, congestion?: SegCost): number[] {
  const obs = obstacles.map((r) => ({ x: r.x - margin, y: r.y - margin, w: r.w + 2 * margin, h: r.h + 2 * margin }));
  const fromS: Pt = { x: from.x + fromDir.dx * stub, y: from.y + fromDir.dy * stub };
  const toS: Pt = { x: to.x + toDir.dx * stub, y: to.y + toDir.dy * stub };

  const xs = uniqSort([fromS.x, toS.x, ...obs.flatMap((r) => [r.x, r.x + r.w])]);
  const ys = uniqSort([fromS.y, toS.y, ...obs.flatMap((r) => [r.y, r.y + r.h])]);
  const xIdx = new Map(xs.map((v, i) => [v, i]));
  const yIdx = new Map(ys.map((v, i) => [v, i]));
  const si = xIdx.get(Math.round(fromS.x)), sj = yIdx.get(Math.round(fromS.y));
  const gi = xIdx.get(Math.round(toS.x)), gj = yIdx.get(Math.round(toS.y));
  if (si === undefined || sj === undefined || gi === undefined || gj === undefined) return simplify([from.x, from.y, ...hvh(fromS, toS), to.x, to.y]);

  const segClear = (i1: number, j1: number, i2: number, j2: number): boolean => {
    const mx = (xs[i1] + xs[i2]) / 2, my = (ys[j1] + ys[j2]) / 2;
    return !obs.some((r) => inside(mx, my, r));
  };
  const nodeFree = (i: number, j: number): boolean => !obs.some((r) => inside(xs[i], ys[j], r));

  // A*：状态 = (i, j, 进入方向 d)；d: 0=起点,1=水平,2=竖直。转弯加惩罚，鼓励直线。
  const TURN = 40;
  const H = (i: number, j: number) => Math.abs(xs[i] - toS.x) + Math.abs(ys[j] - toS.y);
  type S = { i: number; j: number; d: number; g: number; f: number; px: number; py: number; pd: number };
  const startD = fromDir.dx !== 0 ? 1 : 2;
  const open: S[] = [{ i: si, j: sj, d: startD, g: 0, f: H(si, sj), px: -1, py: -1, pd: -1 }];
  const best = new Map<string, number>();
  const cameFrom = new Map<string, { px: number; py: number; pd: number }>();
  const k = (i: number, j: number, d: number) => `${i},${j},${d}`;
  best.set(k(si, sj, startD), 0);
  let goal: S | null = null;
  let iter = 0;
  while (open.length && iter++ < 20000) {
    let bi = 0; for (let x = 1; x < open.length; x++) if (open[x].f < open[bi].f) bi = x;
    const cur = open.splice(bi, 1)[0];
    if (cur.i === gi && cur.j === gj) { goal = cur; break; }
    if ((best.get(k(cur.i, cur.j, cur.d)) ?? Infinity) < cur.g) continue;
    const moves: [number, number, number][] = [[cur.i + 1, cur.j, 1], [cur.i - 1, cur.j, 1], [cur.i, cur.j + 1, 2], [cur.i, cur.j - 1, 2]];
    for (const [ni, nj, nd] of moves) {
      if (ni < 0 || ni >= xs.length || nj < 0 || nj >= ys.length) continue;
      if (!nodeFree(ni, nj) || !segClear(cur.i, cur.j, ni, nj)) continue;
      const step = Math.abs(xs[ni] - xs[cur.i]) + Math.abs(ys[nj] - ys[cur.j]);
      const cong = congestion ? congestion(xs[cur.i], ys[cur.j], xs[ni], ys[nj]) : 0;
      const g2 = cur.g + step + (cur.d !== 0 && cur.d !== nd ? TURN : 0) + cong;
      const kk = k(ni, nj, nd);
      if (g2 < (best.get(kk) ?? Infinity)) {
        best.set(kk, g2);
        cameFrom.set(kk, { px: cur.i, py: cur.j, pd: cur.d });
        open.push({ i: ni, j: nj, d: nd, g: g2, f: g2 + H(ni, nj), px: cur.i, py: cur.j, pd: cur.d });
      }
    }
  }
  if (!goal) return simplify([from.x, from.y, ...hvh(fromS, toS), to.x, to.y]);

  // 回溯
  const path: Pt[] = [];
  let ci = goal.i, cj = goal.j, cd = goal.d;
  while (ci !== -1) {
    path.unshift({ x: xs[ci], y: ys[cj] });
    const prev = cameFrom.get(k(ci, cj, cd));
    if (!prev) break;
    ci = prev.px; cj = prev.py; cd = prev.pd;
  }
  const flat = [from.x, from.y, ...path.flatMap((p) => [p.x, p.y]), to.x, to.y];
  return simplify(flat);
}

/** 折线正交化护栏：相邻两点两轴都变时插直角过渡点（先沿当前行进轴），保证输出逐段水平/竖直。
 *  startHoriz = 首段行进轴是否水平（取源端口朝向）。手动折点因锚点移动而失配时兜底，画布永不出斜线。 */
export function orthogonalize(pts: Pt[], startHoriz: boolean): Pt[] {
  if (!pts.length) return pts;
  const out: Pt[] = [pts[0]];
  let horiz = startHoriz;
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1], b = pts[i];
    const dx = Math.abs(a.x - b.x) > 1e-6, dy = Math.abs(a.y - b.y) > 1e-6;
    if (dx && dy) {
      out.push(horiz ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
      horiz = !horiz;
    } else if (dx) horiz = true;
    else if (dy) horiz = false;
    else continue; // 重复点丢弃
    out.push(b);
  }
  return out;
}
