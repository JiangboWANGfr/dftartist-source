import { test } from "node:test";
import assert from "node:assert/strict";
import { routeOrtho, orthogonalize, makeCongestion, type Rect } from "../../src/specgen/route.ts";

const inside = (px: number, py: number, r: Rect): boolean => px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h;
function crossesAny(pts: number[], rects: Rect[]): boolean {
  for (let i = 0; i < pts.length - 2; i += 2) {
    const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
    for (let t = 0; t <= 1; t += 0.05) {
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      if (rects.some((r) => inside(x, y, r))) return true;
    }
  }
  return false;
}

test("障碍正好在直线路径上 → 绕开、不穿过盒", () => {
  const box: Rect = { x: 80, y: 20, w: 60, h: 60 }; // 挡在 y=50 的直线上
  const pts = routeOrtho({ x: 0, y: 50 }, { dx: 1, dy: 0 }, { x: 220, y: 50 }, { dx: -1, dy: 0 }, [box]);
  assert.ok(pts.length >= 4);
  assert.ok(!crossesAny(pts, [box]), "路径穿过了障碍盒");
  const ys: number[] = []; for (let i = 1; i < pts.length; i += 2) ys.push(pts[i]);
  assert.ok(ys.some((y) => y < 20 || y > 80), "应绕到盒的上方或下方");
});

test("多个障碍 → 仍不穿过任何盒", () => {
  const boxes: Rect[] = [{ x: 60, y: 0, w: 50, h: 60 }, { x: 60, y: 90, w: 50, h: 60 }];
  const pts = routeOrtho({ x: 0, y: 75 }, { dx: 1, dy: 0 }, { x: 200, y: 75 }, { dx: -1, dy: 0 }, boxes);
  assert.ok(!crossesAny(pts, boxes), "路径穿过了某个障碍盒");
});

test("无障碍 → 正常连通", () => {
  const pts = routeOrtho({ x: 0, y: 50 }, { dx: 1, dy: 0 }, { x: 200, y: 50 }, { dx: -1, dy: 0 }, []);
  assert.ok(pts.length >= 4);
  assert.equal(pts[0], 0); assert.equal(pts[1], 50);
  assert.equal(pts[pts.length - 2], 200); assert.equal(pts[pts.length - 1], 50);
});

test("拥塞感知：两条同源同目标的线绕到障碍两侧、不叠在同一条走廊", () => {
  const box: Rect = { x: 80, y: 20, w: 60, h: 60 }; // 挡在 y=50 直线上 → 单线必绕上或下
  const cong = makeCongestion();
  const from = { x: 0, y: 50 }, to = { x: 220, y: 50 };
  const w1 = routeOrtho(from, { dx: 1, dy: 0 }, to, { dx: -1, dy: 0 }, [box], 14, 18, cong.cost);
  cong.add(w1);
  const w2 = routeOrtho(from, { dx: 1, dy: 0 }, to, { dx: -1, dy: 0 }, [box], 14, 18, cong.cost);
  const ysOf = (p: number[]) => { const a: number[] = []; for (let i = 1; i < p.length; i += 2) a.push(p[i]); return a; };
  const y1 = ysOf(w1), y2 = ysOf(w2);
  const top = (ys: number[]) => ys.some((y) => y < 20), bot = (ys: number[]) => ys.some((y) => y > 80);
  assert.ok((top(y1) && bot(y2)) || (bot(y1) && top(y2)), "第二条线应避开第一条、绕到障碍另一侧");
});

test("拥塞跟踪器不影响单条线：无已用线路时路由与不传 cost 一致", () => {
  const box: Rect = { x: 80, y: 20, w: 60, h: 60 };
  const cong = makeCongestion();
  const base = routeOrtho({ x: 0, y: 50 }, { dx: 1, dy: 0 }, { x: 220, y: 50 }, { dx: -1, dy: 0 }, [box]);
  const withCost = routeOrtho({ x: 0, y: 50 }, { dx: 1, dy: 0 }, { x: 220, y: 50 }, { dx: -1, dy: 0 }, [box], 14, 18, cong.cost);
  assert.deepEqual(withCost, base);
});

test("orthogonalize：斜跨的相邻点插直角过渡（先沿当前行进轴）", () => {
  // 起始水平行进：(0,0)→(100,60) 应先横后竖 → 插 (100,0)
  assert.deepEqual(orthogonalize([{ x: 0, y: 0 }, { x: 100, y: 60 }], true),
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }]);
  // 已正交的折线原样返回
  assert.deepEqual(orthogonalize([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }], true),
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }]);
  // 连续斜点：行进轴逐段交替
  const out = orthogonalize([{ x: 0, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 80 }], true);
  for (let i = 1; i < out.length; i++) {
    const dx = out[i].x - out[i - 1].x, dy = out[i].y - out[i - 1].y;
    assert.ok(dx === 0 || dy === 0, `段 ${i} 非正交`);
  }
});
