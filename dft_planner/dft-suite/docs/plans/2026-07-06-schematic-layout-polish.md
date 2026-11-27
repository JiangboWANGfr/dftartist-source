# 原理图布局与可读性打磨(第二轮)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 spec `docs/specs/2026-07-06-schematic-layout-polish-design.md` 实现四项:布线间距加宽、net 名标签移到负载端(每线唯一)、zoom-to-fit + 重排按钮、稳定性 Lite(semiInteractive + prev 坐标 + seed 锚定)。

**Architecture:** 纯渲染/布局层。`core/schematic.ts` 负责 ELK 选项与 prev 坐标注入;`laid.ts` 负责终点去重和三个纯几何函数(boundsOf/fitTransform/anchorTo);`SchematicTab.tsx` 负责标签位置、位置记忆 ref、按钮。store/daemon 不动。

**Tech Stack:** TypeScript + React + react-konva + elkjs;单测 `node --test` 直跑 `.ts`。

**工作分支:** `design/schematic-layout-polish`(基于第一轮头 `8e1e264`,spec 已在此分支)。

**背景(实现者必读):**

- 第一轮已完成:pin 用 `FIXED_POS` 钉在精确行(`PIN_ROW0=46`/`PIN_PITCH=22`),`laid.ts` 输出菱形锚点(外移 `PIN_STUB=10`),wires 带 `bus`/`net`,标签目前画在**起点**并按**同起点**去重(本轮要改)。
- 稳定性机制是 probe 实测定型的(spec §2.4):**不要**尝试 ELK interactive 全家桶或 `considerModelOrder`——已证伪,会把老盒子挤走 372~896px 甚至幂等翻序。
- 每个 Task:测试红→绿 → `npm run test` 全绿 → commit(repo 风格 `feat(schematic): …`,末尾空行后加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`)。
- 仓库根的未跟踪文件 `dft-suite.zip` 别动;git add 只加计划列出的文件。

---

### Task 1: toElkGraph — 间距加宽 + prev 稳定性提示

**Files:**
- Modify: `src/hierarchy/core/schematic.ts`(`ElkInputNode`、`toElkGraph`)
- Test: `tests/unit/schematic-elk.test.ts`(追加 4 个测试)

- [x] **Step 1.1: 写失败测试**

在 `tests/unit/schematic-elk.test.ts` 末尾追加(既有 helper `seedGraph`/`withTrace`/`P`/`INS`/`portId`/`layout`/`makeNode`/`makeSourceNode`/`newSchematic`/`addTrace`/`edgeId` 直接复用):

```ts
test("toElkGraph emits the widened spacing set (no stability options without prev)", () => {
  const lo = toElkGraph(seedGraph().g).layoutOptions;
  assert.equal(lo["elk.spacing.nodeNode"], "60");
  assert.equal(lo["elk.layered.spacing.nodeNodeBetweenLayers"], "150");
  assert.equal(lo["elk.spacing.edgeEdge"], "16");
  assert.equal(lo["elk.spacing.edgeNode"], "20");
  assert.equal(lo["elk.layered.spacing.edgeEdgeBetweenLayers"], "16");
  assert.equal(lo["elk.layered.spacing.edgeNodeBetweenLayers"], "20");
  assert.equal(lo["elk.layered.crossingMinimization.semiInteractive"], undefined);
});

test("toElkGraph with prev injects positions + semiInteractive", () => {
  const g = withTrace(seedGraph().g); // u_tc + u_tb
  const elk = toElkGraph(g, { "top.u_tc": { x: 120, y: 30 } });
  assert.equal(elk.layoutOptions["elk.layered.crossingMinimization.semiInteractive"], "true");
  const tc = elk.children.find((c) => c.id === "top.u_tc")!;
  assert.equal(tc.x, 120);
  assert.equal(tc.y, 30);
  const tb = elk.children.find((c) => c.id === "top.u_tb")!;
  assert.equal(tb.x, undefined, "nodes without prev carry no hint");
  assert.equal(tb.y, undefined);
});

test("stability: unchanged graph relayouts with zero drift", async () => {
  const g = withTrace(seedGraph().g);
  const out1 = await layout(toElkGraph(g));
  const prev = Object.fromEntries(out1.children!.map((c) => [c.id, { x: c.x!, y: c.y! }]));
  const out2 = await layout(toElkGraph(g, prev));
  for (const c of out2.children!) {
    assert.ok(Math.abs(c.x! - prev[c.id].x) < 0.5, `${c.id} x drift`);
    assert.ok(Math.abs(c.y! - prev[c.id].y) < 0.5, `${c.id} y drift`);
  }
});

test("stability: fanin prepend keeps old boxes still after seed anchoring", async () => {
  const seed = makeNode("top.u_tc", "u_tc", "tc|/r.v", "module", [P("a", "in"), P("x", "out")]);
  const drv = makeNode("top.u_tb", "u_tb", "tb|/r.v", "module", [P("i0", "in"), P("o1", "out")]);
  let g = newSchematic(seed);
  g = addTrace(g, "top.u_tc", "a", [drv], [{
    id: edgeId("top.u_tb", "o1", "top.u_tc", "a"),
    fromNode: "top.u_tb", fromPort: "o1", toNode: "top.u_tc", toPort: "a", netName: "n", bus: false,
  }]);
  const out1 = await layout(toElkGraph(g));
  const prev = Object.fromEntries(out1.children!.map((c) => [c.id, { x: c.x!, y: c.y! }]));
  const src = makeSourceNode({ id: "port:top.p", kind: "port", label: "p", detail: "input port", file: "/r.v", line: 1, bus: false });
  const g2 = addTrace(g, "top.u_tb", "i0", [src], [{
    id: edgeId("port:top.p", "o", "top.u_tb", "i0"),
    fromNode: "port:top.p", fromPort: "o", toNode: "top.u_tb", toPort: "i0", netName: "p", bus: false,
  }]);
  const out2 = await layout(toElkGraph(g2, prev));
  const posOf = (id: string) => { const c = out2.children!.find((q) => q.id === id)!; return { x: c.x!, y: c.y! }; };
  const dx = prev["top.u_tc"].x - posOf("top.u_tc").x;
  const dy = prev["top.u_tc"].y - posOf("top.u_tc").y;
  for (const id of ["top.u_tc", "top.u_tb"]) {
    const p2 = posOf(id);
    assert.ok(Math.abs(p2.x + dx - prev[id].x) < 0.5, `${id} x still (anchored)`);
    assert.ok(Math.abs(p2.y + dy - prev[id].y) < 0.5, `${id} y still (anchored)`);
  }
});
```

- [x] **Step 1.2: 跑测试,确认失败**

Run: `node --test tests/unit/schematic-elk.test.ts`
Expected: **FAIL**(spacing 断言:现值 40/70 且无 edge 间距键;prev 测试:toElkGraph 不接受第二参数,typecheck/运行报错)。

- [x] **Step 1.3: 实现**

`src/hierarchy/core/schematic.ts`:

1. `ElkInputNode` 加可选坐标:

```ts
export interface ElkInputNode { id: string; x?: number; y?: number; width: number; height: number; layoutOptions: Record<string, string>; ports: ElkInputPort[]; }
```

2. `toElkGraph` 整体替换为(相对现状:图级选项换成 §2.1 六键 + 条件 semiInteractive;签名加 `prev`;children 有 prev 的带 x/y;其余逻辑逐字保留):

```ts
export function toElkGraph(g: SchematicGraph, prev?: Record<string, { x: number; y: number }>): ElkGraphInput {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "150",
      "elk.spacing.edgeEdge": "16",
      "elk.spacing.edgeNode": "20",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "16",
      "elk.layered.spacing.edgeNodeBetweenLayers": "20",
      // Stability-lite (spec §2.4): previous on-screen coordinates act as same-layer
      // ordering tie-breaks, so unchanged graphs relayout with zero drift.
      ...(prev ? { "elk.layered.crossingMinimization.semiInteractive": "true" } : {}),
    },
    children: Object.values(g.nodes).map((n) => {
      const { width, height } = nodeDims(n);
      // FIXED_POS: we own every pin position — row i (declaration order, per side)
      // centers at PIN_ROW0 + i*PIN_PITCH; inputs on WEST, outputs on EAST. ELK
      // only places boxes and routes orthogonal wires to these anchors.
      let inRow = 0, outRow = 0;
      const src = n.kind === "port" || n.kind === "logic";
      return {
        id: n.id, width, height,
        ...(prev?.[n.id] ? { x: prev[n.id].x, y: prev[n.id].y } : {}),
        layoutOptions: { "elk.portConstraints": "FIXED_POS" },
        ports: n.ports.map((p) => {
          const out = p.direction === "out";
          const row = out ? outRow++ : inRow++;
          return {
            id: portId(n.id, p.name),
            layoutOptions: { "elk.port.side": out ? "EAST" : "WEST" },
            x: out ? width - 3 : -3,
            y: src ? height / 2 - 3 : PIN_ROW0 + row * PIN_PITCH - 3,
            width: 6, height: 6,
          };
        }),
      };
    }),
    edges: g.edges.map((e) => ({ id: e.id, sources: [portId(e.fromNode, e.fromPort)], targets: [portId(e.toNode, e.toPort)] })),
  };
}
```

(注意:children map 内部与现文件一致,若现文件的 `src`/`inRow` 声明顺序略有出入,以保留现有语义为准,不要改 pin 逻辑。)

- [x] **Step 1.4: 跑测试确认通过 + 全量**

Run: `node --test tests/unit/schematic-elk.test.ts && npm run test`
Expected: 新增 4 个测试 PASS,共 31 pass;typecheck 干净。若"prepend"测试 residual 超差(ELK 版本差异),报 BLOCKED 附实际数字,不要放宽阈值。

- [x] **Step 1.5: Commit**

```bash
git add src/hierarchy/core/schematic.ts tests/unit/schematic-elk.test.ts
git commit -m "feat(schematic): widened routing spacing; stability hints (semiInteractive + prev positions)"
```

---

### Task 1b(评审修复轮): 稳定性机制改用 elk.position;判别性测试

Task 1 质量评审发现两个稳定性测试(每层单节点链)删掉机制照样绿;进一步 probe(r2f/g)发现根因:**semiInteractive 不读 elkjs 的 `children[].x/y` 字段,只读节点级 `elk.position` layoutOption** —— Task 1 的 x/y 字段版机制是无效的,之前的 0 漂移只是 ELK 确定性。改用 `elk.position` 后(probe r2h):交换 prev 顺序精确跟随、fanout 追加从"翻序+896px"变 **0 漂移**。spec §2.4/§5 已同步。

**Files:**
- Modify: `src/hierarchy/core/schematic.ts`(children 的 x/y 展开 → `elk.position` layoutOption;`ElkInputNode` 撤销 x/y 字段)
- Modify: `tests/unit/schematic-elk.test.ts`(prev 注入测试改断言 elk.position;新增判别性测试;两个链式测试改诚实命名)

- [x] **Step 1b.1**: 测试:prev 注入测试断言 `child.layoutOptions["elk.position"] === "(120,30)"`(无 prev 的 child 无此键);新增判别性测试(1 驱动 pin 扇出 3 负载,交换 prev 中两负载坐标 → 布局顺序跟随 prev);链式两测试改名为"deterministic relayout"/"rigid translation"并加注释说明其烟雾性质。跑 → 判别性测试红(x/y 字段机制下顺序不跟随)。
- [x] **Step 1b.2**: 实现:toElkGraph children 改为 `...(prev?.[n.id] ? {} : {})` 撤销 → 在 child layoutOptions 加 `"elk.position": \`(${prev[n.id].x},${prev[n.id].y})\``;`ElkInputNode` 移除 x?/y?。跑 → 全绿。
- [x] **Step 1b.3**: `npm run test` 全绿 → Commit:`fix(schematic): stability hints via elk.position option (x/y fields are a no-op); discriminating order test`

---

### Task 2: laid.ts — 终点去重 + boundsOf / fitTransform / anchorTo

**Files:**
- Modify: `src/hierarchy/schematic/laid.ts`
- Test: `tests/unit/schematic-elk.test.ts`(改 1 个既有测试 + 追加 3 个)

- [x] **Step 2.1: 改既有去重测试 + 写新失败测试**

(a) 既有测试 "toLaid: diamonds sit PIN_STUB outside the box edge; bus/net pass through" 改造:`g.edges` 现有 e1(net "loop", bus true);再 push 两条:

```ts
  g.edges.push({ id: "e3", fromNode: "t.u", fromPort: "o", toNode: "t.u", toPort: "i", netName: "loop", bus: false });
  g.edges.push({ id: "e4", fromNode: "t.u", fromPort: "o", toNode: "t.u", toPort: "i", netName: "fan", bus: false });
```

ELK 夹具 `edges` 数组替换为(e1/e2 保留,追加 e3 同**终点**、e4 同起点不同终点):

```ts
    edges: [
      { id: "e1", sections: [{ startPoint: { x: 0, y: 0 }, bendPoints: [{ x: 5, y: 5 }], endPoint: { x: 9, y: 9 } }] },
      { id: "e2", sections: [{ startPoint: { x: 1, y: 1 }, endPoint: { x: 2, y: 2 } }] },
      { id: "e3", sections: [{ startPoint: { x: 3, y: 0 }, endPoint: { x: 9, y: 9 } }] },
      { id: "e4", sections: [{ startPoint: { x: 0, y: 0 }, endPoint: { x: 5, y: 9 } }] },
    ],
```

原"同起点去重"断言(`wires[1]` 或 `wires[2]` 上关于 e2/e3 的两行,以现文件为准)替换为:

```ts
  assert.equal(laid.wires[1].bus, false, "unknown edge falls back to bus=false");
  assert.equal(laid.wires[1].net, "", "unknown edge falls back to net=''");
  assert.equal(laid.wires[2].net, "", "same END point -> only the first keeps its label");
  assert.equal(laid.wires[3].net, "fan", "same start, different end (fanout) -> keeps its label");
  assert.equal(laid.wires[0].net, "loop");
```

(b) 文件末尾追加:

```ts
import { anchorTo, boundsOf, fitTransform } from "../../src/hierarchy/schematic/laid.ts";
// ↑ 合并进文件顶部既有的 laid.ts import 行,不要重复 import 语句

test("boundsOf covers boxes and wire points with padding; empty -> null", () => {
  const node = makeNode("t.u", "u", "m|/rtl/m.v", "module", [P("i", "in")]);
  const g = newSchematic(node);
  const elkOut = {
    id: "root",
    children: [{ id: "t.u", x: 100, y: 50, width: 130, height: 80,
      ports: [{ id: portId("t.u", "i"), x: -3, y: 43, width: 6, height: 6 }] }],
    edges: [],
  } as unknown as LaidOutGraph;
  const laid = toLaid(elkOut, g.nodes, g.edges);
  laid.wires.push({ id: "w", points: [0, 0, 300, 200], bus: false, net: "" });
  assert.deepEqual(boundsOf(laid), { x: -20, y: -20, w: 340, h: 240 });
  assert.equal(boundsOf({ boxes: [], wires: [] }), null);
});

test("fitTransform fits and centers; never zooms in past 1x; scale floor 0.2", () => {
  const vp = { w: 800, h: 600 };
  const big = fitTransform({ x: 0, y: 0, w: 1440, h: 520 }, vp);
  assert.equal(big.scale, 0.5); // (800-80)/1440
  const small = fitTransform({ x: 100, y: 100, w: 200, h: 100 }, vp);
  assert.equal(small.scale, 1, "small content stays 1:1");
  assert.equal(small.x + 200 * small.scale, 400, "content center -> viewport center (x)");
  assert.equal(small.y + 150 * small.scale, 300, "content center -> viewport center (y)");
  assert.equal(fitTransform({ x: 0, y: 0, w: 100000, h: 100 }, vp).scale, 0.2, "floor");
});

test("anchorTo keeps the anchor box at its previous on-screen position", () => {
  const node = makeNode("t.u", "u", "m|/rtl/m.v", "module", [P("i", "in")]);
  const g = newSchematic(node);
  const elkOut = {
    id: "root",
    children: [{ id: "t.u", x: 100, y: 50, width: 130, height: 80,
      ports: [{ id: portId("t.u", "i"), x: -3, y: 43, width: 6, height: 6 }] }],
    edges: [],
  } as unknown as LaidOutGraph;
  const laid = toLaid(elkOut, g.nodes, g.edges);
  laid.wires.push({ id: "w", points: [0, 0, 10, 10], bus: false, net: "" });
  const anchored = anchorTo(laid, { "t.u": { x: 160, y: 90 } }, "t.u");
  assert.equal(anchored.boxes[0].x, 160);
  assert.equal(anchored.boxes[0].y, 90);
  assert.equal(anchored.boxes[0].ports[portId("t.u", "i")].x, 150, "port anchor shifted with the box"); // 90 + 60
  assert.equal(anchored.boxes[0].ports[portId("t.u", "i")].y, 136); // 96 + 40
  assert.deepEqual(anchored.wires[0].points, [60, 40, 70, 50]);
  assert.equal(anchorTo(laid, null, "t.u"), laid, "no prev -> unchanged");
  assert.equal(anchorTo(laid, { other: { x: 0, y: 0 } }, "t.u"), laid, "anchor not in prev -> unchanged");
});
```

- [x] **Step 2.2: 跑测试,确认失败**

Run: `node --test tests/unit/schematic-elk.test.ts`
Expected: **FAIL**(boundsOf/fitTransform/anchorTo 不存在 → import 报错;去重断言按旧"同起点"规则失败)。

- [x] **Step 2.3: 实现 laid.ts**

(a) 把现有的"同起点去重"块(`const seenStart = new Set<string>(); …`)替换为:

```ts
  // A pin driven by multiple behavioral sources yields wires sharing an END point —
  // keep the net label on the first only (same net, they'd stack). Fanout wires end
  // at distinct pins, so every fanout wire keeps its label (spec §2.2).
  const seenEnd = new Set<string>();
  for (const w of wires) {
    const k = `${w.points[w.points.length - 2]},${w.points[w.points.length - 1]}`;
    if (seenEnd.has(k)) w.net = "";
    else seenEnd.add(k);
  }
```

(b) 文件末尾追加三个纯函数:

```ts
export interface Bounds { x: number; y: number; w: number; h: number; }

/** Content bounding box (boxes ∪ wire points), padded for stubs/labels. Null when empty. */
export function boundsOf(laid: Laid, pad = 20): Bounds | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of laid.boxes) {
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  for (const w of laid.wires)
    for (let i = 0; i < w.points.length; i += 2) {
      x0 = Math.min(x0, w.points[i]); y0 = Math.min(y0, w.points[i + 1]);
      x1 = Math.max(x1, w.points[i]); y1 = Math.max(y1, w.points[i + 1]);
    }
  if (!Number.isFinite(x0)) return null;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

/** Stage transform fitting `bounds` into `viewport`, centered; zooms out only (≤ maxScale). */
export function fitTransform(bounds: Bounds, viewport: { w: number; h: number }, padding = 40, maxScale = 1): { scale: number; x: number; y: number } {
  const scale = Math.max(0.2, Math.min(maxScale, (viewport.w - 2 * padding) / bounds.w, (viewport.h - 2 * padding) / bounds.h));
  return {
    scale,
    x: (viewport.w - bounds.w * scale) / 2 - bounds.x * scale,
    y: (viewport.h - bounds.h * scale) / 2 - bounds.y * scale,
  };
}

/** Translate the laid result so `anchorId` keeps its previous on-screen position (spec §2.4). */
export function anchorTo(laid: Laid, prev: Record<string, { x: number; y: number }> | null, anchorId: string): Laid {
  const a = laid.boxes.find((b) => b.node.id === anchorId);
  const p = prev?.[anchorId];
  if (!a || !p) return laid;
  const dx = p.x - a.x, dy = p.y - a.y;
  if (dx === 0 && dy === 0) return laid;
  return {
    boxes: laid.boxes.map((b) => ({
      ...b, x: b.x + dx, y: b.y + dy,
      ports: Object.fromEntries(Object.entries(b.ports).map(([k, pt]) => [k, { x: pt.x + dx, y: pt.y + dy }])),
    })),
    wires: laid.wires.map((w) => ({ ...w, points: w.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) })),
  };
}
```

- [x] **Step 2.4: 跑测试确认通过 + 全量**

Run: `node --test tests/unit/schematic-elk.test.ts && npm run test`
Expected: 全 PASS(34 tests);typecheck 干净。

- [x] **Step 2.5: Commit**

```bash
git add src/hierarchy/schematic/laid.ts tests/unit/schematic-elk.test.ts
git commit -m "feat(schematic): net-label dedup by END point; boundsOf/fitTransform/anchorTo pure helpers"
```

---

### Task 3: SchematicTab — 标签移终点、稳定性接线、fit/重排按钮

**Files:**
- Modify: `src/hierarchy/schematic/SchematicTab.tsx`
- Modify: `src/hierarchy/styles.css`(追加 `.schtools` 样式)

视图层,无单测;typecheck + e2e + Task 4 验收兜底。

- [x] **Step 3.1: import + 布局 effect 替换(稳定性接线)**

(a) laid.ts import 行扩为:

```ts
import { anchorTo, boundsOf, fitTransform, PIN_STUB, toLaid, type Box, type Laid } from "./laid.ts";
```

(b) 在 `const [laid, setLaid] = useState<Laid | null>(null);` 之后加:

```ts
  // Stability-lite (spec §2.4): remember each box's ON-SCREEN position; feed it to the
  // next layout as ordering tie-breaks and re-anchor the result on the seed box.
  const prevPos = useRef<Record<string, { x: number; y: number }> | null>(null);
  const [relayoutTick, setRelayoutTick] = useState(0);

  const applyFit = useCallback((l: Laid) => {
    const stage = stageRef.current;
    const b = boundsOf(l);
    if (!stage || !b) return;
    const t = fitTransform(b, { w: stage.width(), h: stage.height() });
    stage.scale({ x: t.scale, y: t.scale });
    stage.position({ x: t.x, y: t.y });
    stage.batchDraw();
  }, []);
```

(c) 现有布局 effect(`// Re-layout whenever the graph (nodes/edges) changes.` 那段)整体替换为:

```ts
  // Re-layout whenever the graph changes. Old boxes keep their on-screen positions
  // (semiInteractive tie-breaks + seed anchoring); first layout / 重排 auto-fits.
  useEffect(() => {
    if (!graph) { setLaid(null); return; }
    let alive = true;
    const prev = prevPos.current;
    void layout(toElkGraph(graph, prev ?? undefined)).then((elk) => {
      if (!alive) return;
      const anchored = anchorTo(toLaid(elk, graph.nodes, graph.edges), prev, seedNodeId);
      prevPos.current = Object.fromEntries(anchored.boxes.map((b) => [b.node.id, { x: b.x, y: b.y }]));
      setLaid(anchored);
      if (prev === null) applyFit(anchored);
    });
    return () => { alive = false; };
  }, [graph, relayoutTick, applyFit, seedNodeId]);
```

- [x] **Step 3.2: wire 标签移到终点**

静态层 wires map 里的 net 名 `Text`(现在在 `points[0]+6, points[1]-14`)替换为:

```tsx
              {w.net !== "" && (
                <Text
                  x={w.points[w.points.length - 2] - 158}
                  y={w.points[w.points.length - 1] - 14}
                  width={150}
                  align="right"
                  wrap="none"
                  ellipsis
                  text={w.net} fontSize={9} fill="#7a8490" listening={false} perfectDrawEnabled={false}
                />
              )}
```

- [x] **Step 3.3: 按钮 overlay**

return 的 wrapper 内、`<Stage>` 之前插入:

```tsx
      <div className="schtools">
        <button data-btn="fit" title="缩放至适应内容" onClick={() => { if (laid) applyFit(laid); }}>适应</button>
        <button data-btn="relayout" title="全新布局(丢弃位置记忆)" onClick={() => { prevPos.current = null; setRelayoutTick((t) => t + 1); }}>重排</button>
      </div>
```

`src/hierarchy/styles.css` 的 `.schwrap` 规则后追加:

```css
#ws-hierarchy .schwrap { position: relative; }
#ws-hierarchy .schtools { position: absolute; top: 8px; right: 8px; z-index: 1; display: flex; gap: 6px; }
#ws-hierarchy .schtools button {
  font-size: 11px; padding: 3px 10px; border-radius: 5px; cursor: pointer;
  color: var(--text); background: var(--panel); border: 1px solid var(--border); opacity: .85;
}
#ws-hierarchy .schtools button:hover { opacity: 1; border-color: var(--accent); }
```

(`.schwrap` 已有规则保留,`position: relative` 作为同选择器的追加行合并进去也可。)

- [x] **Step 3.4: typecheck + 全量 + e2e**

Run: `npm run test && npm run test:e2e`
Expected: 全 PASS(34 单测 + 18 e2e;`test:e2e` 自带前置构建)。

- [x] **Step 3.5: Commit**

```bash
git add src/hierarchy/schematic/SchematicTab.tsx src/hierarchy/styles.css
git commit -m "feat(schematic): net labels at load end; fit/relayout buttons; stability-lite wiring"
```

---

### Task 3b(评审修复轮): 位置记忆按 tabId 键控(修复跨 tab 泄漏)

Task 3 spec 审查发现:`TabArea.tsx` 渲染 `<SchematicTab>` 无 React key,schematic→schematic 直切复用同一组件实例 → 组件级 `prevPos` ref 把 A tab 的坐标泄漏进 B tab(跳过首次 auto-fit、`anchorTo` 用错锚点、共享节点 id 时 elk.position 串台)。修复:位置记忆改为**模块级 `Map<tabId, positions>`**(spec §2.4 已更新)——比加 key 更优:key 强制 remount 会让每次切回 tab 都全新布局,丢掉稳定性记忆;Map 键控则切回时命中幂等场景,零漂移还原。

**Files:**
- Modify: `src/hierarchy/schematic/SchematicTab.tsx`

- [x] **Step 3b.1**: 组件外(import 之后)加模块级缓存,组件内 `prevPos` ref 全部改走 Map:

```ts
// Per-tab position memory (module-level: survives tab switches AND unmounts, matching
// how the store keeps each tab's SchematicGraph alive). Keyed by tabId — a component
// instance is REUSED across direct schematic→schematic switches (no React key), so an
// instance ref would leak tab A's coords into tab B.
const prevPosByTab = new Map<string, Record<string, { x: number; y: number }>>();
```

组件内删除 `prevPos` ref;布局 effect 改为:

```ts
  useEffect(() => {
    if (!graph) { setLaid(null); return; }
    let alive = true;
    const prev = prevPosByTab.get(tabId) ?? null;
    void layout(toElkGraph(graph, prev ?? undefined)).then((elk) => {
      if (!alive) return;
      const anchored = anchorTo(toLaid(elk, graph.nodes, graph.edges), prev, seedNodeId);
      prevPosByTab.set(tabId, Object.fromEntries(anchored.boxes.map((b) => [b.node.id, { x: b.x, y: b.y }])));
      setLaid(anchored);
      if (prev === null) applyFit(anchored);
    });
    return () => { alive = false; };
  }, [graph, relayoutTick, applyFit, seedNodeId, tabId]);
```

重排按钮 onClick 改为:`{ prevPosByTab.delete(tabId); setRelayoutTick((t) => t + 1); }`

- [x] **Step 3b.2**: `npm run test && npm run test:e2e` 全绿;Commit:`fix(schematic): per-tab position memory (module Map) — no cross-tab prevPos leak`

---

### Task 4: e2e 按钮 smoke + 真机验收

**Files:**
- Modify: `tests/e2e/schematic.spec.ts`(追加按钮 smoke)

- [x] **Step 4.1: e2e 追加按钮 smoke**

在现有测试的 `expectSmooth(...)` 之后、`app.close()` 之前追加:

```ts
  // fit / relayout buttons: present, clickable, canvas stays alive
  await page.locator('[data-btn="fit"]').click();
  await page.locator('[data-btn="relayout"]').click();
  await page.waitForTimeout(800);
  await expect(page.locator('#hier-center canvas').first()).toBeVisible();
```

Run: `npm run test:e2e`
Expected: 18/18 PASS。

- [x] **Step 4.2: Commit**

```bash
git add tests/e2e/schematic.spec.ts
git commit -m "test(schematic): fit/relayout button smoke in the perf-gate spec"
```

- [x] **Step 4.3: 真机验收(gps_baseband,复现用户 fanout 场景)**

临时驱动脚本(放仓库根 `accept-polish.tmp.mjs`,跑完删除):打开 `veirlogPaser/rtl_test/gps_baseband.fl` → 对 `tb`(time_base)开 schematic → 对其**全部输出 pin 追 fanout**(复现用户场景)→ 截图;再点 fit 截图;核对:

1. 布线通道不再挤成一束(线距 ≥16px 可辨);
2. 每条 fanout 线在**负载端**都有 net 名;
3. 追线过程中 seed(tb)保持原位(对比追线前后截图);
4. 适应/重排按钮工作(fit 后全锥入画;重排后布局刷新且自动 fit);
5. pan/zoom 手感无卡顿。

结果(含截图路径、edges/nodes 数)记入本文件执行记录;删除临时脚本。

- [x] **Step 4.3b(验收修复轮): fit/滚轮缩放下限 0.2 → 0.05**

真机验收发现:tb 全 fanout 锥(12 个 tracking_channel,~5300px 高)fit 需要 ~0.13,`fitTransform` 的 0.2 下限导致"适应/重排"后内容上下裁切、seed 裁出视口(polish-4/5 截图)。修复(spec §2.3 已同步):`laid.ts` `fitTransform` 下限 0.2→0.05;`SchematicTab.tsx` `onWheel` 的 `Math.max(0.2, ...)` → `Math.max(0.05, ...)`;单测 floor 断言 0.2→0.05;全量测试后重跑验收。

**执行记录(2026-07-06,Step 4.3 真机验收,tb 全 fanout 场景)**:

- 数据:7 个输出 pin 全部 fanout,锥 = 13 节点(tb + 12 tracking_channel)/ 36 边;`sample_clk`/`accum_enable`/`tic_count`/`accum_count` 无负载 → 空心死角菱形正确。
- 核验(截图 polish-1~5):① 通道宽敞、平行线距清晰;② 每条 fanout 线在负载端有 net 名(`accum_sample_enable`/`pre_tic_enable`/`tic_enable` 逐线可读);③ **seed 追线前后逐像素同位**(稳定性 Lite + 锚定生效),视口不被抢走;④ 适应/重排按钮工作;⑤ e2e 追锥 perf 门禁 18/18。
- **验收修复轮(Step 4.3b)**:fit 下限 0.2 在 12-tc 大锥(~5300px 高)下裁切内容、seed 出视口 → fit/滚轮下限放宽到 0.05(commit `8a21c6b`),复测后全锥入画、seed 可见、重排+自动 fit 正常。

- [x] **Step 4.4: 收尾**(最终全分支审查见下)

全量 `npm run test && npm run test:e2e` 最终确认 → 向用户汇报(含截图)→ 最终全分支审查(基线 `8e1e264`)→ finishing-a-development-branch。

---

## Self-Review(计划完成后自查记录)

- **Spec 覆盖**:§2.1 间距 → Task 1;§2.2 终点标签+去重 → Task 2(数据)+ Task 3.2(渲染);§2.3 boundsOf/fitTransform/按钮/自动 fit 时机 → Task 2 + Task 3.1/3.3;§2.4 prev 注入/anchorTo/prevPos 存锚定后坐标/重排 → Task 1 + Task 2 + Task 3.1;§4 测试 1-7 → Task 1(1/2/6/7)+ Task 2(3/4/5),e2e smoke → Task 4.1,手动验收 → Task 4.3。无缺口。
- **占位符**:无 TBD/TODO;所有代码步骤给了完整代码。
- **类型一致性**:`toElkGraph(g, prev?)` 签名 Task 1 定义、Task 3.1 调用一致;`anchorTo(laid, prev, anchorId)`/`boundsOf(laid)`/`fitTransform(bounds, viewport)` 在 Task 2 定义、Task 2 测试与 Task 3.1 使用一致;`prevPos.current` 类型 `Record<string,{x,y}> | null` 与 `anchorTo` 的 `prev` 参数一致。
