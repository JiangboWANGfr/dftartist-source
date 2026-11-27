# 原理图显示重设计(方案 B)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 spec `docs/specs/2026-07-06-schematic-display-redesign-design.md` 修复 hierarchical schematic 的三个显示问题:pin 名字常显、pin 按 RTL 声明序固定(FIXED_ORDER)、行为级源头(always/assign/输入端口)改紧凑符号,连线加 net 名 + bus 加粗。

**Architecture:** 只动渲染层。`core/schematic.ts` 负责 ELK 输入(端口顺序)与盒子尺寸;新增纯模块 `schematic/laid.ts` 把 ELK 输出压平成绝对坐标(菱形外移 10px、bus/net 透传);`SchematicTab.tsx` 只负责 Konva 绘制(stub、标签、符号形状)。trace 语义、store、daemon 一律不动。

**Tech Stack:** TypeScript + React + react-konva + elkjs;单测 `node --test`(直接跑 `.ts`,elkjs 可在 node 主线程运行)。

**工作分支:** `design/schematic-display-redesign`(spec 已在此分支)。

**背景知识(实现者必读):**

- 图模型/渲染管线见 spec §1-§2;原始设计见 `Hierarchyshower/docs/2026-06-25-show-on-schematic.md`。
- ELK `FIXED_ORDER` 的 `elk.port.index` 是**顺时针**语义,从顶边最左角开始:EAST 侧从上到下、WEST 侧**从下到上**。所以要让输入 pin 按声明序从上往下排,WEST 侧的 index 必须反转。这是本计划最大的坑,Task 1 的单测锁死它。
- Konva:`listening={false}` 的 Layer/shape 不进 hit-graph(性能关键);所有新增的静态图形(stub、标签、符号)都必须 `listening={false}`(Text)或放在静态层里,并带 `perfectDrawEnabled={false}`。
- 每个 Task 结束都要:测试过 → `npm run typecheck` 过 → commit。commit message 用仓库风格 `feat(schematic): …` / `test(schematic): …`。

---

### Task 1: toElkGraph — FIXED_ORDER + 声明序 port.index

**Files:**
- Modify: `src/hierarchy/core/schematic.ts:88-113`(`toElkGraph`)
- Test: `tests/unit/schematic-elk.test.ts`(新建)

- [x] **Step 1.1: 新建测试文件,写两个失败测试(声明序 + 稳定性)**

创建 `tests/unit/schematic-elk.test.ts`:

```ts
// Schematic ELK geometry: pins stay in RTL declaration order (FIXED_ORDER),
// stable across traces. Locks the clockwise-index semantics (WEST reversed).
import { test } from "node:test"; import assert from "node:assert/strict";
import {
  addTrace, edgeId, makeNode, newSchematic, portId, toElkGraph,
  type SchEdge, type SchNode,
} from "../../src/hierarchy/core/schematic.ts";
import type { PortInfo } from "../../src/hierarchy/core/model.ts";
import { layout } from "../../src/hierarchy/schematic/elkLayout.ts";

const P = (name: string, direction: "in" | "out"): PortInfo =>
  ({ name, direction, width: 1, busLabel: name });

const INS = ["clk", "rstn", "a", "b", "c", "d", "tic"];
const OUTS = ["x", "y"];

function seedGraph(): { seed: SchNode; g: ReturnType<typeof newSchematic> } {
  const seed = makeNode(
    "top.u_tc", "u_tc", "tracking_channel|/rtl/tc.v", "module",
    [...INS.map((n) => P(n, "in")), ...OUTS.map((n) => P(n, "out"))],
  );
  return { seed, g: newSchematic(seed) };
}

/** y-center of each named port of node `id` in the laid-out graph. */
async function portYs(g: ReturnType<typeof newSchematic>, id: string, names: string[]): Promise<number[]> {
  const out = await layout(toElkGraph(g));
  const child = out.children!.find((c) => c.id === id)!;
  return names.map((n) => {
    const p = child.ports!.find((q) => q.id === portId(id, n))!;
    return (p.y ?? 0) + (p.height ?? 6) / 2;
  });
}

/** Trace into pin `tic` (declared LAST among inputs) — the user-reported repro. */
function withTrace(g: ReturnType<typeof newSchematic>): ReturnType<typeof addTrace> {
  const drv = makeNode("top.u_tb", "u_tb", "time_base|/rtl/tb.v", "module", [P("o1", "out")]);
  const e: SchEdge = {
    id: edgeId("top.u_tb", "o1", "top.u_tc", "tic"),
    fromNode: "top.u_tb", fromPort: "o1", toNode: "top.u_tc", toPort: "tic",
    netName: "tic", bus: false,
  };
  return addTrace(g, "top.u_tc", "tic", [drv], [e]);
}

test("pins are laid out in RTL declaration order even with a traced edge", async () => {
  const g = withTrace(seedGraph().g);
  const inYs = await portYs(g, "top.u_tc", INS);
  for (let i = 1; i < inYs.length; i++)
    assert.ok(inYs[i] > inYs[i - 1], `input ${INS[i]} must sit below ${INS[i - 1]} (got ${inYs})`);
  const outYs = await portYs(g, "top.u_tc", OUTS);
  assert.ok(outYs[1] > outYs[0], "outputs keep declaration order too");
});

test("pin order is identical before and after a trace (stability)", async () => {
  const { g } = seedGraph();
  const before = await portYs(g, "top.u_tc", INS);
  const after = await portYs(withTrace(g), "top.u_tc", INS);
  const order = (ys: number[]): string[] =>
    INS.map((n, i) => [n, ys[i]] as const).sort((p, q) => p[1] - q[1]).map(([n]) => n);
  assert.deepEqual(order(after), order(before), "trace must not reshuffle pins");
  assert.deepEqual(order(before), INS, "and the order is declaration order");
});
```

- [x] **Step 1.2: 跑测试,确认失败**

Run: `node --test tests/unit/schematic-elk.test.ts`
Expected: **FAIL**(现状 `FIXED_SIDE` 下,ELK 会把有边的 `tic` pin 挪到顶部,声明序断言失败)。
注意:ELK 重排是启发式的,若碰巧两个测试都过了,不要跳过 Task 1 —— 继续实现(FIXED_ORDER 是行为保证,不是碰运气),并在 commit message 里注明。

- [x] **Step 1.3: 实现 — `toElkGraph` 改 FIXED_ORDER + 计算顺时针 index**

`src/hierarchy/core/schematic.ts`,替换 `toElkGraph` 的 `children` 映射(原 99-110 行):

```ts
    children: Object.values(g.nodes).map((n) => {
      const { width, height } = nodeDims(n);
      // FIXED_ORDER indexes ports CLOCKWISE from the top-left corner: EAST runs
      // top->bottom (declaration order as-is), WEST runs bottom->top (reversed).
      const ins = n.ports.filter((p) => p.direction !== "out");
      const outs = n.ports.filter((p) => p.direction === "out");
      const clockwise = new Map<string, number>();
      outs.forEach((p, i) => clockwise.set(p.name, i));
      ins.forEach((p, i) => clockwise.set(p.name, outs.length + (ins.length - 1 - i)));
      return {
        id: n.id, width, height,
        layoutOptions: { "elk.portConstraints": "FIXED_ORDER" },
        ports: n.ports.map((p) => ({
          id: portId(n.id, p.name),
          layoutOptions: {
            "elk.port.side": p.direction === "out" ? "EAST" : "WEST",
            "elk.port.index": String(clockwise.get(p.name)),
          },
          width: 6, height: 6,
        })),
      };
    }),
```

- [x] **Step 1.4: 跑测试,确认通过**

Run: `node --test tests/unit/schematic-elk.test.ts`
Expected: PASS(2 tests)。若声明序测试反了(输入侧从下往上),说明 WEST 反转公式写反 —— 把 `ins.length - 1 - i` 改回 `i` 再试;两种写法必有一种过,单测就是干这个的。

- [x] **Step 1.5: 全量单测 + typecheck**

Run: `npm run test`
Expected: typecheck 无错误,全部单测/集成测试 PASS。

- [x] **Step 1.6: Commit**

```bash
git add src/hierarchy/core/schematic.ts tests/unit/schematic-elk.test.ts
git commit -m "feat(schematic): pins in RTL declaration order (FIXED_ORDER, west index reversed)"
```

---

### Task 2: laid.ts — toLaid 移出为纯模块(菱形外移 + bus/net 透传)

**Files:**
- Create: `src/hierarchy/schematic/laid.ts`
- Modify: `src/hierarchy/schematic/SchematicTab.tsx:19-42`(删除本地 toLaid/Box/Wire/Laid,改 import)、`:72`(调用点)
- Test: `tests/unit/schematic-elk.test.ts`(追加)

- [x] **Step 2.1: 追加失败测试(锚点外移 + 透传)**

在 `tests/unit/schematic-elk.test.ts` 末尾追加:

```ts
import { PIN_STUB, toLaid } from "../../src/hierarchy/schematic/laid.ts";
import type { LaidOutGraph } from "../../src/hierarchy/schematic/elkLayout.ts";

test("toLaid: diamonds sit PIN_STUB outside the box edge; bus/net pass through", () => {
  const node = makeNode("t.u", "u", "m|/rtl/m.v", "module", [P("i", "in"), P("o", "out")]);
  const g = newSchematic(node);
  g.edges.push({ id: "e1", fromNode: "t.u", fromPort: "o", toNode: "t.u", toPort: "i", netName: "loop", bus: true });
  const elkOut = {
    id: "root",
    children: [{
      id: "t.u", x: 100, y: 50, width: 130, height: 72,
      ports: [
        { id: portId("t.u", "i"), x: -3, y: 20, width: 6, height: 6 },   // west, centered on border
        { id: portId("t.u", "o"), x: 127, y: 20, width: 6, height: 6 },  // east, centered on border
      ],
    }],
    edges: [{ id: "e1", sections: [{ startPoint: { x: 0, y: 0 }, bendPoints: [{ x: 5, y: 5 }], endPoint: { x: 9, y: 9 } }] }],
  } as unknown as LaidOutGraph;
  const laid = toLaid(elkOut, g.nodes, g.edges);
  assert.equal(laid.boxes[0].ports[portId("t.u", "i")].x, 100 - PIN_STUB);        // border 100 -> 10px outside (left)
  assert.equal(laid.boxes[0].ports[portId("t.u", "o")].x, 100 + 130 + PIN_STUB);  // border 230 -> 10px outside (right)
  assert.equal(laid.boxes[0].ports[portId("t.u", "i")].y, 50 + 23);
  assert.deepEqual(laid.wires[0].points, [0, 0, 5, 5, 9, 9]);
  assert.equal(laid.wires[0].bus, true, "bus flag must come from the SchEdge, not hardcoded false");
  assert.equal(laid.wires[0].net, "loop");
});
```

- [x] **Step 2.2: 跑测试,确认失败**

Run: `node --test tests/unit/schematic-elk.test.ts`
Expected: **FAIL**(`laid.ts` 不存在,import 报错)。

- [x] **Step 2.3: 创建 `src/hierarchy/schematic/laid.ts`**

```ts
// Flatten an ELK layout result into absolute-coordinate boxes + polyline wires
// (pure: no React/Konva — unit-testable). Diamond anchors sit PIN_STUB px OUTSIDE
// the box edge (Tessent-style pin stub); wires still terminate at the on-border
// ELK anchor, which is collinear with the stub, so the joint is seamless.

import type { LaidOutGraph } from "./elkLayout.ts";
import { portId, type SchEdge, type SchNode } from "../core/schematic.ts";

export const PIN_STUB = 10;

export interface Box { node: SchNode; x: number; y: number; w: number; h: number; ports: Record<string, { x: number; y: number }>; }
export interface Wire { id: string; points: number[]; bus: boolean; net: string; }
export interface Laid { boxes: Box[]; wires: Wire[]; }

export function toLaid(elk: LaidOutGraph, nodes: Record<string, SchNode>, edges: SchEdge[]): Laid {
  const boxes: Box[] = [];
  for (const c of elk.children ?? []) {
    const node = nodes[c.id];
    if (!node) continue;
    const x = c.x ?? 0, y = c.y ?? 0;
    const outIds = new Set(node.ports.filter((p) => p.direction === "out").map((p) => portId(node.id, p.name)));
    const ports: Record<string, { x: number; y: number }> = {};
    for (const p of c.ports ?? []) {
      const cx = x + (p.x ?? 0) + (p.width ?? 6) / 2;
      ports[p.id] = { x: cx + (outIds.has(p.id) ? PIN_STUB : -PIN_STUB), y: y + (p.y ?? 0) + (p.height ?? 6) / 2 };
    }
    boxes.push({ node, x, y, w: c.width ?? 130, h: c.height ?? 52, ports });
  }
  const byId = new Map(edges.map((e) => [e.id, e]));
  const wires: Wire[] = [];
  for (const e of elk.edges ?? []) {
    const s = e.sections?.[0];
    if (!s) continue;
    const pts = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].flatMap((p) => [p.x, p.y]);
    const edge = byId.get(e.id);
    wires.push({ id: e.id, points: pts, bus: edge?.bus ?? false, net: edge?.netName ?? "" });
  }
  return { boxes, wires };
}
```

- [x] **Step 2.4: SchematicTab 改用 laid.ts**

`src/hierarchy/schematic/SchematicTab.tsx`:

1. 删除本地的 `Box`/`Wire`/`Laid` 接口和 `toLaid` 函数(原 19-42 行,含注释)。
2. import 区加:

```ts
import { toLaid, type Box, type Laid } from "./laid.ts";
```

3. 布局 effect 的调用点(原 72 行)改为:

```ts
    void layout(toElkGraph(graph)).then((elk) => { if (alive) setLaid(toLaid(elk, graph.nodes, graph.edges)); });
```

- [x] **Step 2.5: 跑测试 + typecheck,确认通过**

Run: `node --test tests/unit/schematic-elk.test.ts && npm run typecheck`
Expected: PASS(3 tests),typecheck 无错误。

- [x] **Step 2.6: Commit**

```bash
git add src/hierarchy/schematic/laid.ts src/hierarchy/schematic/SchematicTab.tsx tests/unit/schematic-elk.test.ts
git commit -m "feat(schematic): extract pure toLaid — pin anchors 10px outside box, bus/net passthrough"
```

---

### Task 3: StaticBox pin stub + 名字标签;连线 net 名 + bus 加粗

**Files:**
- Modify: `src/hierarchy/schematic/SchematicTab.tsx`(`StaticBox`、wires 渲染)

纯视图层,无法用 node --test 断言 Konva 输出 —— 用 typecheck + e2e 冒烟 + Task 6 手动验收兜底。

- [x] **Step 3.1: StaticBox 渲染 stub + busLabel**

`StaticBox` 整体替换为(注意:全部新增 Text/Line 都在静态层内,`listening={false}` + `perfectDrawEnabled={false}`):

```tsx
/** Static portion of a node: box rect, text labels, pin stubs + pin-name labels.
 *  Rendered in the non-listening layer → zero hit-graph cost. */
const StaticBox = memo(function StaticBox({ box, isSeed }: { box: Box; isSeed: boolean }) {
  const { node, x, y, w, h } = box;
  const stroke = isSeed ? "#e0a93b" : node.kind === "port" ? "#2f7d6b" : node.kind === "logic" ? "#a8823a" : "#48505c";
  return (
    <Group>
      <Rect
        x={x} y={y} width={w} height={h} cornerRadius={4}
        fill={FILL[node.kind]} stroke={stroke} strokeWidth={isSeed ? 2 : 1}
        perfectDrawEnabled={false}
      />
      <Text x={x} y={y + 5} width={w} align="center" text={node.designName} fontSize={11} fontStyle="bold" fill="#dfe4ea" listening={false} perfectDrawEnabled={false} />
      <Text x={x} y={y + 19} width={w} align="center" text={node.instanceName} fontSize={9} fill="#8b95a3" listening={false} perfectDrawEnabled={false} />
      {node.ports.map((p) => {
        const pt = box.ports[portId(node.id, p.name)];
        if (!pt) return null;
        const out = p.direction === "out";
        return (
          <Group key={p.name}>
            <Line
              points={out ? [x + w, pt.y, pt.x, pt.y] : [pt.x, pt.y, x, pt.y]}
              stroke="#6b7785" strokeWidth={1} perfectDrawEnabled={false}
            />
            {out
              ? <Text x={x} y={pt.y - 5} width={w - 7} align="right" text={p.busLabel} fontSize={9.5} fill="#cdd4dc" listening={false} perfectDrawEnabled={false} />
              : <Text x={x + 7} y={pt.y - 5} text={p.busLabel} fontSize={9.5} fill="#cdd4dc" listening={false} perfectDrawEnabled={false} />}
          </Group>
        );
      })}
    </Group>
  );
});
```

- [x] **Step 3.2: wires 渲染 — bus 线宽 + net 名标签**

静态层的 wires map(原 124-132 行)替换为:

```tsx
          {laid?.wires.map((w) => (
            <Group key={w.id}>
              <Line
                points={w.points}
                stroke="#6b7785"
                strokeWidth={w.bus ? 2.2 : 1.4}
                perfectDrawEnabled={false}
              />
              {w.net !== "" && (
                <Text x={w.points[0] + 6} y={w.points[1] - 14} text={w.net} fontSize={9} fill="#7a8490" listening={false} perfectDrawEnabled={false} />
              )}
            </Group>
          ))}
```

(net 名画在 driver 侧第一段上方 —— `points[0],points[1]` 是 ELK section 的起点,即输出锚点。)

- [x] **Step 3.3: typecheck + 全量单测**

Run: `npm run test`
Expected: PASS,无类型错误。

- [x] **Step 3.4: e2e 冒烟(有 hdl 二进制才跑,无则跳过)**

Run: `npx playwright test tests/e2e/schematic.spec.ts`
Expected: PASS(pan ≥50fps 不回归;标签全在 `listening={false}` 静态层)或 SKIP(no hdl binary)。

- [x] **Step 3.5: Commit**

```bash
git add src/hierarchy/schematic/SchematicTab.tsx
git commit -m "feat(schematic): pin-name labels + stubs; net-name labels on wires; thick bus edges"
```

---

### Task 3b(评审修复轮): FIXED_POS 精确 pin 行 + net 标签去重 + e2e 门禁强化

Task 3 质量评审发现:① perf 门禁没覆盖新增 Text 负载(e2e 不追线就 pan);② 首行 pin 标签与标题重叠(FIXED_ORDER 下 ELK 把端口分布到整侧全高;probe 证实 `portsSurrounding` 无效、`portAlignment END` 底边距只剩 3px);③ fanout 多条边在同一起点叠画 net 标签。修复方案(已同步回 spec §2.2/§2.4/§4):

**Files:**
- Modify: `src/hierarchy/core/schematic.ts`(`toElkGraph` 改 FIXED_POS + 导出 `PIN_ROW0`/`PIN_PITCH`;`nodeDims` 高度公式;`ElkInputPort` 加 x/y)
- Modify: `src/hierarchy/schematic/laid.ts`(net 标签同起点去重)
- Modify: `tests/unit/schematic-elk.test.ts`(新增精确行坐标测试 + 去重断言)
- Modify: `tests/e2e/schematic.spec.ts`(先经 `window.__hierStore` 追线长锥,断言 edges>0,再测 pan 帧率)

- [x] **Step 3b.1**: 单测:新增"pins sit on exact declaration rows"(断言每个 pin 中心 y === `PIN_ROW0 + i*PIN_PITCH`,两侧分别计行);toLaid 夹具加 e3(与 e1 同起点、在 g.edges 里有 netName)断言 `wires[2].net === ""`。跑 → 红。
- [x] **Step 3b.2**: 实现:`toElkGraph` FIXED_POS(pin x=-3/w-3,y=PIN_ROW0+row*PIN_PITCH-3,删 clockwise Map、`elk.port.index`、图级 `elk.spacing.portPort`;保留 `elk.port.side`);`nodeDims` 高度 `PIN_ROW0 + rows*PIN_PITCH + 12`;`ElkInputPort` 接口加 `x: number; y: number`;`laid.ts` wires 构建后同起点去重(第一条保留 net,其余置空)。跑 → 绿(旧测试 1/2/3 全部保持通过,机制无关)。
- [x] **Step 3b.3**: e2e:schematic.spec.ts 在 pan 测量前,用 `page.evaluate` 经 `window.__hierStore.getState()` 依次对 seed(`soc.u_cpu`)的每个 pin 调 `traceSchematic`(输入 fanin、输出 fanout),断言 `edges.length > 0`,等待 relayout 稳定(~500ms),再跑原 pan ≥50fps 门禁。必要时 `test.setTimeout` 放宽(首次 trace 触发 daemon analyze)。
- [x] **Step 3b.4**: `npm run test` 全绿 + e2e 实测通过(记录追线后的 edges/nodes 数量)。
- [x] **Step 3b.5**: Commit:`fix(schematic): FIXED_POS pin rows (title band), net-label dedup, perf gate on traced cone`

---

### Task 4: nodeDims — 行为级源头紧凑尺寸

**Files:**
- Modify: `src/hierarchy/core/schematic.ts:72-80`(`nodeDims`)
- Test: `tests/unit/schematic-elk.test.ts`(追加)

- [x] **Step 4.1: 追加失败测试**

在 `tests/unit/schematic-elk.test.ts` 末尾追加(`makeSourceNode`、`nodeDims` 加进顶部的既有 import):

```ts
test("nodeDims: behavioral sources are compact, module boxes unchanged", () => {
  const port = makeSourceNode({ id: "port:top.clk", kind: "port", label: "clk", detail: "input port", file: "/rtl/top.v", line: 3, bus: false });
  const logic = makeSourceNode({ id: "logic:/rtl/top.v:214", kind: "logic", label: "always_ff", detail: "always_ff", file: "/rtl/top.v", line: 214, bus: false });
  assert.equal(nodeDims(port).height, 20);
  assert.ok(nodeDims(port).width <= 90, "port arrow stays small");
  assert.deepEqual(nodeDims(logic), { width: 150, height: 38 });
  const mod = makeNode("t.u", "u", "m|/rtl/m.v", "module", INS.map((n) => P(n, "in")));
  assert.equal(nodeDims(mod).height, 46 + INS.length * 22 + 12, "module formula untouched (post-Task-3b geometry)");
});
```

- [x] **Step 4.2: 跑测试,确认失败**

Run: `node --test tests/unit/schematic-elk.test.ts`
Expected: **FAIL**(port/logic 走的还是模块公式:高 52,不是 20/38)。

- [x] **Step 4.3: 实现 — `nodeDims` 加紧凑分支**

`src/hierarchy/core/schematic.ts`,`nodeDims` 函数体开头插入两行分支:

```ts
/** Box size from #ports per side + label widths (rough; elk uses w/h, not the labels).
 *  Behavioral sources (port arrow / logic tag) get compact fixed shapes instead. */
export function nodeDims(n: SchNode): { width: number; height: number } {
  if (n.kind === "port") return { width: Math.max(60, n.designName.length * 6.5 + 24), height: 20 };
  if (n.kind === "logic") return { width: 150, height: 38 };
  const ins = n.ports.filter((p) => p.direction !== "out").length;
  const outs = n.ports.filter((p) => p.direction === "out").length;
  const rows = Math.max(ins, outs, 1);
  const labelW = Math.max(n.designName.length, n.instanceName.length) * 7;
  const portW = Math.max(0, ...n.ports.map((p) => p.busLabel.length)) * 6.5;
  return { width: Math.max(130, labelW + 30, portW * 2 + 36), height: PIN_ROW0 + rows * PIN_PITCH + 12 };
}
```

(注意:Task 3b 之后模块高度公式已是 `PIN_ROW0 + rows * PIN_PITCH + 12`,本任务只在函数开头插入两行紧凑分支,高度公式保持 Task 3b 的版本不动。)

- [x] **Step 4.4: 跑测试,确认通过**

Run: `node --test tests/unit/schematic-elk.test.ts && npm run typecheck`
Expected: PASS(4 tests)。

- [x] **Step 4.5: Commit**

```bash
git add src/hierarchy/core/schematic.ts tests/unit/schematic-elk.test.ts
git commit -m "feat(schematic): compact nodeDims for behavioral source nodes (port/logic)"
```

---

### Task 5: 行为级源头符号(端口箭头 + logic 标签块),去掉其菱形

**Files:**
- Modify: `src/hierarchy/schematic/SchematicTab.tsx`(`StaticBox` 分支 + 两个新组件 + `InteractiveBox`)

- [x] **Step 5.1: 新增 PortSourceSym / LogicSourceTag,StaticBox 分支**

在 `StaticBox` 定义之前加入:

```tsx
import { PIN_STUB } from "./laid.ts";   // merge into the existing ./laid.ts import

const basename = (f: string): string => f.split("/").pop() ?? f;

/** Behavioral fanin source: parent-module INPUT PORT, drawn as a flat Tessent-style
 *  port arrow (designName = the port/net name). No trace diamond — the id is
 *  synthetic (`port:`), the daemon cannot trace it. */
function PortSourceSym({ box }: { box: Box }) {
  const { node, x, y, w, h } = box;
  return (
    <Group>
      <Line
        points={[x, y, x + w - 12, y, x + w, y + h / 2, x + w - 12, y + h, x, y + h]}
        closed fill="#1c3a33" stroke="#2f8f6b" strokeWidth={1.2} perfectDrawEnabled={false}
      />
      <Text x={x} y={y + h / 2 - 5} width={w - 10} align="center" text={node.designName} fontSize={10} fill="#bfe8da" listening={false} perfectDrawEnabled={false} />
      <Line points={[x + w, y + h / 2, x + w + PIN_STUB, y + h / 2]} stroke="#6b7785" strokeWidth={1} perfectDrawEnabled={false} />
    </Group>
  );
}

/** Behavioral fanin source: always/assign block, drawn as a compact tag with its
 *  HDL location. Double-click (hit-rect in InteractiveBox) opens the source. */
function LogicSourceTag({ box }: { box: Box }) {
  const { node, x, y, w, h } = box;
  return (
    <Group>
      <Rect x={x} y={y} width={w} height={h} cornerRadius={4} fill="#2f2716" stroke="#a8823a" strokeWidth={1.2} perfectDrawEnabled={false} />
      <Text x={x + 10} y={y + 7} text={node.instanceName} fontSize={10} fontStyle="bold" fill="#e3b45c" listening={false} perfectDrawEnabled={false} />
      <Text x={x + 10} y={y + 21} text={node.loc ? `${basename(node.loc.file)}:${node.loc.line}` : node.designName} fontSize={8.5} fill="#9aa2ad" listening={false} perfectDrawEnabled={false} />
      <Line points={[x + w, y + h / 2, x + w + PIN_STUB, y + h / 2]} stroke="#6b7785" strokeWidth={1} perfectDrawEnabled={false} />
    </Group>
  );
}
```

`StaticBox` 函数体最前面加分支(在解构 `{ node, x, y, w, h }` 之后、`stroke` 计算之前):

```tsx
  if (node.kind === "port") return <PortSourceSym box={box} />;
  if (node.kind === "logic") return <LogicSourceTag box={box} />;
```

此后 `stroke` 表达式里的 port/logic 分支成为死代码,简化为:

```tsx
  const stroke = isSeed ? "#e0a93b" : "#48505c";
```

(`FILL` 常量里的 port/logic 项同理不再被读到,但保留 —— 它的类型是 `Record<SchNode["kind"], string>`,删键要改类型,不值得。)

- [x] **Step 5.2: InteractiveBox 跳过源头符号的菱形**

`InteractiveBox` 里已有 `const src = node.kind === "port" || node.kind === "logic";`,把 ports map 包一层:

```tsx
      {!src && node.ports.map((p) => {
        /* …既有菱形渲染代码,原样保留… */
      })}
```

透明 hit-rect 原样保留(src 的双击开 HDL 就靠它)。

- [x] **Step 5.3: typecheck + 全量单测 + e2e 冒烟**

Run: `npm run test && npx playwright test tests/e2e/schematic.spec.ts`
Expected: 全 PASS(e2e 无二进制则 SKIP)。

- [x] **Step 5.4: Commit**

```bash
git add src/hierarchy/schematic/SchematicTab.tsx
git commit -m "feat(schematic): Tessent-style source symbols (port arrow / logic tag), no bogus trace diamonds"
```

---

### Task 6: 全量验证 + 手动验收

- [x] **Step 6.1: 全量测试**

Run: `npm run test && npx playwright test`
Expected: typecheck + 全部单测/集成 PASS;e2e PASS(或二进制缺失 SKIP,注明)。

- [x] **Step 6.2: 手动验收(gps_baseband,spec §4 剧本)**

启动应用(`npm run dev:electron`,需 `DFT_CORE_BIN_DIR` 指向 dft-core/build 或已 stage),打开 gps_baseband 设计:

1. 右键 `tc4` → Show on Hierarchical Schematic。
2. 核对种子盒:每个 pin 都有名字(含 `[msb:lsb]`)、输入左/输出右、顺序 = RTL 声明序。
3. 依次点 `clk`、`pre_tic_enable`、`tic_enable`、`carr_nco_fc` 输入 pin 的绿菱形追 fanin。
4. 核对:连线终点就是所点的 pin,且该 pin 位置不动(只变灰);time_base 以模块盒出现且带 pin 名;行为级源头以箭头/标签块出现(不是大棕框),logic 标签第二行是 `file:line`;双击源头符号打开 HDL 到对应行;连线带 net 名;bus 线明显更粗。
5. 平移/缩放手感无卡顿。

**执行记录(2026-07-06,Steps 6.1/6.2)**:

- 全量:`npm run test` 27/27 + typecheck 干净;`npx playwright test` 18/18。
- **重要发现**:e2e 与验收都加载 `dist/`(electron/main.cjs 非 dev 模式 loadFile dist),而 dist 是 6/30 的旧构建 —— 本分支此前所有 e2e "通过"跑的都是旧渲染代码(单测不受影响,直接跑源码)。`npm run build` 刷新后全部重跑,18/18 依然通过,此时 perf 门禁才真正覆盖新渲染。**已修复(最终审查轮)**:`test:e2e` 脚本改为 `npm run build && playwright test`,e2e 永远跑新构建(实测 build+18 e2e ≈ 40s)。
- 验收(gps_baseband/tc4,自动化重演 spec §4 剧本 + 截图人工核验):15 个输入 pin 全部 fanin 追线成功,锥 = 14 节点(2 模块 + 3 端口箭头 + 9 logic 标签)/ 15 边(5 bus)/ 0 死角;pin 名声明序、标题带无重叠、连线终点正确且 pin 位置稳定(仅置灰)、net 名(clk/ch4_carr_nco/…)、bus 加粗、logic 标签显示 `gps_baseband.v:295/613/614/813`、源头符号无假菱形 —— spec §4 清单全部达成。

- [x] **Step 6.3: 结果记录 + 收尾**(最终全分支审查:Ready to merge,收尾项已落:spec 状态行、clamp 文档、e2e 前置构建守卫)

把验收结果(含截图)汇报给用户;若全部通过,用 superpowers:finishing-a-development-branch 决定合并方式(仓库惯例:merge 回 master)。

---

## Self-Review(计划完成后自查记录)

- **Spec 覆盖**:§2.1 pin 标签 → Task 3;§2.2 声明序 + stub → Task 1 + 2 + 3;§2.3 源头符号/无菱形/紧凑尺寸/双击保留 → Task 4 + 5;§2.4 net 名 + bus 加粗 → Task 2(数据)+ 3(渲染);§4 四条单测 → Task 1(测 1/2)、2(测 3)、4(测 4),e2e + 手动 → Task 3/5/6。无缺口。
- **占位符**:无 TBD/TODO;每个代码步骤都有完整代码。
- **类型一致性**:`toLaid(elk, nodes, edges)` 签名在 Task 2 定义、Task 2.4 调用一致;`Box`/`Laid`/`PIN_STUB` 从 `laid.ts` 导出、Task 3/5 引用一致;测试 helper `P`/`INS` 在 Task 1 定义、Task 4 复用(同一文件)。
