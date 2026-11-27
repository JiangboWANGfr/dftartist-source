# SpecGen 图层几何独立 + 多选/删除辅助 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 SpecGen 各总线图层几何独立（在 BSCAN 里改位置不再牵动 SSN 走线），并补齐多选/框选/全选/批量删除与 scope 级「清空/移出 SpecGen」。

**Architecture:** 跨层节点（当前仅 `DesignInstance`）新增每层坐标 `layerPos`；所有几何计算（`ws`/障碍/锚点）按活动图层过滤节点集；`activeLayer===null` 变只读参考视图，默认进入第一个有内容的层。多选照搬 GenConnection 既有语义（`selectedIds` + marquee）。生成侧不变（`layerPos` 纯视图字段）。

**Tech Stack:** TypeScript、React + react-konva、Zustand（`src/genconn/store.ts`）、`node --test`（内置测试器，`node:assert/strict`）、Playwright（e2e，可选）。

**参考设计：** `docs/specs/2026-07-13-specgen-layer-independence-and-edit-design.md`

---

## 文件结构

| 文件 | 职责 | 改动 |
|---|---|---|
| `src/genconn/core/dft-model.ts` | DFT 视图数据类型 | `DftIpInstance` 加 `layerPos?` |
| `src/specgen/edit.ts` | DFT 编辑纯函数 | 加 `isCrossLayerIp`/`ipPosIn`；`moveDftIp`/`applyAutoLayout`/`setDftIpPositions` 加 `layer` 参；加 `clearDftScope`/`removeFromSpecgen` |
| `src/genconn/store.ts` | Zustand store | 多选 state+actions；move/arrange 传 `activeLayer`；`clearDftScope`/`removeFromSpecgen`；`openSpecgenScope` 默认进层 |
| `src/specgen/Workspace.tsx` | Konva 画布 + 工具条 | 几何按层过滤 + `ipPosIn`；只读全部视图；多选高亮/框选/批量删；scope 按钮 |
| `src/specgen/DftIpNode.tsx` | 单个 IP 节点 | 用外传 `pos` 取代内部 `ip.position` |
| `tests/unit/specgen-layerpos.test.ts` | 新 | `ipPosIn`/`layerPos` 单测 |
| `tests/unit/specgen-store.test.ts` | 新 | 多选 / 每层移动 / clear / remove store 单测 |
| `tests/unit/specgen-edit.test.ts` | 扩 | `clearDftScope`/`removeFromSpecgen`/`moveDftIp(layer)` 单测 |
| `tests/unit/specgen-schema-parity.test.ts` | 扩 | `layerPos` 序列化不破坏 parity 守卫 |

---

# Phase 1 — Part A：图层几何独立

## Task 1: 数据模型 `layerPos` + `ipPosIn` 辅助

**Files:**
- Modify: `src/genconn/core/dft-model.ts:11-27`（`DftIpInstance`）
- Modify: `src/specgen/edit.ts`（顶部 import + 新增导出）
- Test: `tests/unit/specgen-layerpos.test.ts`（新建）

- [ ] **Step 1: 加模型字段**

`src/genconn/core/dft-model.ts` 顶部 import 改为带 `BusInterface`：

```ts
import type { Id, BusInterface } from "./model.ts";
```

在 `DftIpInstance` 接口内、`position` 字段之后加：

```ts
  /** 跨层节点（DesignInstance）每层坐标覆盖；缺省回退 position。纯视图，generate 不读。 */
  layerPos?: Partial<Record<BusInterface["busType"], { x: number; y: number }>>;
```

- [ ] **Step 2: 加辅助函数**

`src/specgen/edit.ts` 顶部 import 追加：

```ts
import type { BusType } from "../genconn/layers.ts";
```

文件末尾追加：

```ts
/** 跨层节点：在每个图层都显示，需每层各存一份坐标（当前只有 DesignInstance）。 */
export const isCrossLayerIp = (ip: DftIpInstance): boolean => ip.ipType === "DesignInstance";

/** IP 在给定活动层下的有效坐标：跨层节点在具体层用 layerPos 覆盖，否则用 position（含「全部」只读视图）。 */
export function ipPosIn(ip: DftIpInstance, layer: BusType | null): { x: number; y: number } {
  if (layer && isCrossLayerIp(ip)) return ip.layerPos?.[layer] ?? ip.position;
  return ip.position;
}
```

- [ ] **Step 3: 写失败测试**

新建 `tests/unit/specgen-layerpos.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DftIpInstance } from "../../src/genconn/core/dft-model.ts";
import { isCrossLayerIp, ipPosIn } from "../../src/specgen/edit.ts";

const di = (over: Partial<DftIpInstance> = {}): DftIpInstance =>
  ({ id: "d1", ipType: "DesignInstance", instanceName: "core", position: { x: 10, y: 10 }, ...over });
const pipe = (over: Partial<DftIpInstance> = {}): DftIpInstance =>
  ({ id: "p1", ipType: "Pipeline", instanceName: "pp_1", position: { x: 20, y: 20 }, ...over });

test("isCrossLayerIp 只对 DesignInstance 为 true", () => {
  assert.equal(isCrossLayerIp(di()), true);
  assert.equal(isCrossLayerIp(pipe()), false);
});

test("ipPosIn: 单层 IP 恒返回 position", () => {
  assert.deepEqual(ipPosIn(pipe(), "SSN"), { x: 20, y: 20 });
  assert.deepEqual(ipPosIn(pipe(), null), { x: 20, y: 20 });
});

test("ipPosIn: DesignInstance 具体层有覆盖用覆盖、无覆盖回退 position", () => {
  const d = di({ layerPos: { SSN: { x: 99, y: 88 } } });
  assert.deepEqual(ipPosIn(d, "SSN"), { x: 99, y: 88 }); // 覆盖
  assert.deepEqual(ipPosIn(d, "BSCAN"), { x: 10, y: 10 }); // 无覆盖回退
  assert.deepEqual(ipPosIn(d, null), { x: 10, y: 10 });   // 全部视图用 position
});
```

- [ ] **Step 4: 运行测试**

Run: `node --test tests/unit/specgen-layerpos.test.ts`
Expected: 3 tests PASS。

- [ ] **Step 5: 类型检查**

Run: `npm run typecheck`
Expected: 无报错。

- [ ] **Step 6: Commit**

```bash
git add src/genconn/core/dft-model.ts src/specgen/edit.ts tests/unit/specgen-layerpos.test.ts
git commit -m "feat(specgen): DftIpInstance 加 layerPos + ipPosIn/isCrossLayerIp 辅助"
```

---

## Task 2: `moveDftIp`/`applyAutoLayout`/`setDftIpPositions` 加 `layer` 参

**Files:**
- Modify: `src/specgen/edit.ts:45-50`（`moveDftIp`）、`:79-82`（`setDftIpPositions`）、`:176-183`（`applyAutoLayout`）
- Test: `tests/unit/specgen-edit.test.ts`（追加）

- [ ] **Step 1: 写失败测试**

在 `tests/unit/specgen-edit.test.ts` 末尾追加（顶部 import 里补上 `applyAutoLayout`）：

```ts
import { applyAutoLayout } from "../../src/specgen/edit.ts";

test("moveDftIp: 单层 IP 写 position（layer 参不影响）", () => {
  let d = addDftIp(baseDoc(), "p", "Pipeline");
  const id = defOf(d).dftIps![0].id;
  d = moveDftIp(d, "p", id, { x: 300, y: 120 }, "SSN");
  assert.deepEqual(defOf(d).dftIps![0].position, { x: 300, y: 120 });
  assert.equal(defOf(d).dftIps![0].layerPos, undefined);
});

test("moveDftIp: DesignInstance 在具体层写 layerPos，不动 position 与别层", () => {
  const di: DftIpInstance = { id: "d1", ipType: "DesignInstance", instanceName: "core",
    position: { x: 10, y: 10 }, layerPos: { SSN: { x: 1, y: 1 } } };
  let d = withIps([di]);
  d = moveDftIp(d, "p", "d1", { x: 500, y: 500 }, "BSCAN");
  const out = defOf(d).dftIps![0];
  assert.deepEqual(out.position, { x: 10, y: 10 }, "position 不动");
  assert.deepEqual(out.layerPos!.SSN, { x: 1, y: 1 }, "SSN 覆盖不动");
  assert.deepEqual(out.layerPos!.BSCAN, { x: 500, y: 500 }, "BSCAN 覆盖被写入");
});

test("moveDftIp: DesignInstance 在 layer=null 写 position（全部视图不该发生但兜底一致）", () => {
  const di: DftIpInstance = { id: "d1", ipType: "DesignInstance", instanceName: "core", position: { x: 10, y: 10 } };
  let d = withIps([di]);
  d = moveDftIp(d, "p", "d1", { x: 7, y: 7 }, null);
  assert.deepEqual(defOf(d).dftIps![0].position, { x: 7, y: 7 });
});

test("applyAutoLayout: DesignInstance 具体层写 layerPos，单层 IP 写 position", () => {
  const di: DftIpInstance = { id: "d1", ipType: "DesignInstance", instanceName: "core", position: { x: 0, y: 0 } };
  const pp: DftIpInstance = { id: "p1", ipType: "Pipeline", instanceName: "pp_1", position: { x: 0, y: 0 } };
  let d = withIps([di, pp]);
  d = applyAutoLayout(d, "p", { positions: { d1: { x: 40, y: 40 }, p1: { x: 60, y: 60 } }, mirror: {} }, "SSN");
  const [od, op] = defOf(d).dftIps!;
  assert.deepEqual(od.layerPos!.SSN, { x: 40, y: 40 });
  assert.deepEqual(od.position, { x: 0, y: 0 });
  assert.deepEqual(op.position, { x: 60, y: 60 });
});
```

`withIps` 与 `defOf` 已在该测试文件中定义（复用）。

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/unit/specgen-edit.test.ts`
Expected: 新增 4 条 FAIL（签名不匹配 / layerPos 未写）。

- [ ] **Step 3: 改实现**

`src/specgen/edit.ts` `moveDftIp` 整体替换为：

```ts
export function moveDftIp(doc: GenConnDocument, defId: Id, ipId: Id, pos: { x: number; y: number }, layer: BusType | null = null): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d,
    dftIps: (d.dftIps ?? []).map((i) => {
      if (i.id !== ipId) return i;
      if (layer && isCrossLayerIp(i)) return { ...i, layerPos: { ...(i.layerPos ?? {}), [layer]: pos } };
      return { ...i, position: pos };
    }),
    dftWires: clearWpForIp(d.dftWires, ipId),
  }));
}
```

`setDftIpPositions` 整体替换为（自动排列批量写；同样按层）：

```ts
export function setDftIpPositions(doc: GenConnDocument, defId: Id, positions: Record<Id, { x: number; y: number }>, layer: BusType | null = null): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d, dftIps: (d.dftIps ?? []).map((i) => {
    const p = positions[i.id];
    if (!p) return i;
    if (layer && isCrossLayerIp(i)) return { ...i, layerPos: { ...(i.layerPos ?? {}), [layer]: p } };
    return { ...i, position: p };
  }) }));
}
```

`applyAutoLayout` 整体替换为：

```ts
export function applyAutoLayout(doc: GenConnDocument, defId: Id,
  layout: { positions: Record<Id, { x: number; y: number }>; mirror: Record<Id, boolean> },
  layer: BusType | null = null): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d, dftIps: (d.dftIps ?? []).map((i) => {
    const p = layout.positions[i.id];
    const mir = layout.mirror[i.id] ?? i.mirror;
    if (!p) return i.mirror === mir ? i : { ...i, mirror: mir };
    if (layer && isCrossLayerIp(i)) return { ...i, layerPos: { ...(i.layerPos ?? {}), [layer]: p }, mirror: mir };
    return { ...i, position: p, mirror: mir };
  }) }));
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/unit/specgen-edit.test.ts`
Expected: 全部 PASS（含原有测试）。

- [ ] **Step 5: Commit**

```bash
git add src/specgen/edit.ts tests/unit/specgen-edit.test.ts
git commit -m "feat(specgen): moveDftIp/applyAutoLayout/setDftIpPositions 支持按层写 layerPos"
```

---

## Task 3: store —— move/arrange 传 activeLayer + 默认进层

**Files:**
- Modify: `src/genconn/store.ts:562`（`moveDftIp`）、`:585-601`（`autoArrangeDft`）、`:551-554`（`openSpecgenScope`）、导入区
- Test: `tests/unit/specgen-store.test.ts`（新建）

- [ ] **Step 1: 补导入**

`src/genconn/store.ts` 从 `../specgen/edit.ts` 的 import 块里追加 `ipPosIn`、`isCrossLayerIp`；从 `../specgen/catalog.ts` 追加 `catalogBus`；`BUS_LAYERS` 从 `./layers.ts`（`BusType` 已导入，补 `BUS_LAYERS`）。

```ts
// 在现有 import { ... } from "../specgen/edit.ts" 块内追加：
  ipPosIn as dftIpPosIn,
  isCrossLayerIp as dftIsCrossLayerIp,
// 顶部新增：
import { catalogBus } from "../specgen/catalog.ts";
import { BUS_LAYERS, type BusType } from "./layers.ts"; // 若已 import BusType，合并为带 BUS_LAYERS
```

（`layers.ts` 现有 `import type { BusType } from "./layers.ts"` → 改成 `import { BUS_LAYERS, type BusType } from "./layers.ts"`。）

- [ ] **Step 2: 加「首个有内容的层」纯函数**

在 store.ts `create(...)` 之前（模块顶层）加：

```ts
/** 按图层顺序取第一个「有该 busType 接口或该 bus 的 IP」的层；都没有则 null。 */
function firstContentLayer(def: HardenDef | undefined): BusType | null {
  if (!def) return null;
  for (const bt of BUS_LAYERS) {
    const hasIface = def.interfaces.some((i) => i.busType === bt);
    const hasIp = (def.dftIps ?? []).some((ip) => ip.ipType !== "DesignInstance" && catalogBus(ip.ipType) === bt);
    if (hasIface || hasIp) return bt;
  }
  return null;
}
```

- [ ] **Step 3: 改 3 个 action**

`moveDftIp`（`:562`）改为传 `s.activeLayer`：

```ts
  moveDftIp: (defId, ipId, pos) => set((s) => ({ doc: dftMoveIp(s.doc, defId, ipId, pos, s.activeLayer), dirty: true, arrangeSnapshot: null })),
```

`openSpecgenScope`（`:551-554`）在返回对象里加 `activeLayer`（进 scope 落到首个有内容的层）；其余保持：

```ts
  openSpecgenScope: (defId) => set((s) => {
    const next = dftMigrateLegacyIpNames(dftSyncDesignInstances(s.doc, defId), defId);
    const layer = firstContentLayer((next).library.defs.find((d) => d.id === defId));
    const base = { specgenScope: defId, selectedDftIps: [], activeLayer: layer };
    return next === s.doc ? base : { ...base, doc: next, dirty: true, arrangeSnapshot: null };
  }),
```

（注意：此处 `selectedDftIp` 已在 Task 6 前不存在；本任务先只改 move/openScope/autoArrange，`selectedDftIps` 的引入见 Phase 2 Task 7。为避免顺序耦合，本 Task 3 的 `openSpecgenScope` 暂保留原 `selectedDftIp: null`，待 Task 7 统一替换为 `selectedDftIps: []`。）

> 实施提示：Task 3 落地时 `openSpecgenScope` 写 `selectedDftIp: null`；Task 7 再改为 `selectedDftIps: []`。

`autoArrangeDft`（`:585-601`）改为按活动层过滤 + 传 layer。整体替换：

```ts
  autoArrangeDft: (defId, viewH, viewW) => set((s) => {
    const scope = s.doc.library.defs.find((d) => d.id === defId);
    if (!scope) return {};
    const layer = s.activeLayer;
    const inLayer = (ip) => layer === null ? true : dftIsCrossLayerIp(ip) || catalogBus(ip.ipType) === layer;
    const snap = s.arrangeSnapshot;
    if (snap && snap.defId === defId) {
      return { doc: dftApplyAutoLayout(s.doc, defId, { positions: snap.positions, mirror: snap.mirror }, layer), arrangeSnapshot: null, dirty: true };
    }
    const full = autoLayoutPositions(scope, viewH, viewW);
    const positions: Record<Id, { x: number; y: number }> = {};
    const mirror: Record<Id, boolean> = {};
    const snapPos: Record<Id, { x: number; y: number }> = {};
    const snapMir: Record<Id, boolean> = {};
    for (const ip of scope.dftIps ?? []) {
      if (!inLayer(ip)) continue;                 // 只排当前层的节点
      if (full.positions[ip.id]) positions[ip.id] = full.positions[ip.id];
      if (full.mirror[ip.id] !== undefined) mirror[ip.id] = full.mirror[ip.id];
      snapPos[ip.id] = { ...dftIpPosIn(ip, layer) };   // 快照按层坐标，恢复才准
      snapMir[ip.id] = ip.mirror ?? false;
    }
    return {
      doc: dftApplyAutoLayout(s.doc, defId, { positions, mirror }, layer),
      arrangeSnapshot: { defId, positions: snapPos, mirror: snapMir },
      dirty: true,
    };
  }),
```

（`inLayer` 的 `ip` 形参加类型：`(ip: DftIpInstance)`——文件已 import `DftIpInstance`；若未 import 则在类型区补。）

- [ ] **Step 4: 写 store 测试**

新建 `tests/unit/specgen-store.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { useStore } from "../../src/genconn/store.ts";
import { addToSpecgen, addDftIp } from "../../src/specgen/edit.ts";
import type { GenConnDocument, HardenDef } from "../../src/genconn/core/model.ts";
import type { DftIpInstance } from "../../src/genconn/core/dft-model.ts";

function scopeDoc(dftIps: DftIpInstance[] = [], interfaces: HardenDef["interfaces"] = []): GenConnDocument {
  const root: HardenDef = {
    id: "p", designName: "p", designLevel: "sub_block", designType: "tiling",
    interfaces, childInstances: [], connections: [], inSpecgen: true, dftIps,
  };
  return {
    schemaVersion: 1, library: { defs: [root] }, ui: { openDefId: "p", rootDefId: "p" },
    ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1,
  };
}
const topOf = () => useStore.getState().doc.library.defs.find((d) => d.id === "p")!;

test("moveDftIp: 具体层里挪 DesignInstance 写 layerPos，不动 position", () => {
  const di: DftIpInstance = { id: "d1", ipType: "DesignInstance", instanceName: "core", position: { x: 0, y: 0 } };
  useStore.setState({ doc: scopeDoc([di]), activeLayer: "BSCAN" });
  useStore.getState().moveDftIp("p", "d1", { x: 200, y: 200 });
  const out = topOf().dftIps![0];
  assert.deepEqual(out.position, { x: 0, y: 0 });
  assert.deepEqual(out.layerPos!.BSCAN, { x: 200, y: 200 });
});

test("openSpecgenScope: 默认进入首个有内容的层（有 BSCAN 接口→BSCAN）", () => {
  useStore.setState({ doc: scopeDoc([], [{ id: "if1", busType: "BSCAN", role: "client", bscanVariant: "DC" }]) });
  useStore.getState().openSpecgenScope("p");
  assert.equal(useStore.getState().activeLayer, "BSCAN");
});
```

- [ ] **Step 5: 运行**

Run: `node --test tests/unit/specgen-store.test.ts`
Expected: 2 tests PASS。

- [ ] **Step 6: 类型检查 + Commit**

```bash
npm run typecheck
git add src/genconn/store.ts tests/unit/specgen-store.test.ts
git commit -m "feat(specgen): store 按 activeLayer 写位置 + 进 scope 默认落到首个有内容的层"
```

---

## Task 4: Workspace 几何按层隔离 + DftIpNode 用外传坐标 + 只读全部视图

**Files:**
- Modify: `src/specgen/DftIpNode.tsx:17-31`（props）、`:49`、`:90`
- Modify: `src/specgen/Workspace.tsx`（几何 + 渲染 + 工具条）
- 验证：`npm run build`（typecheck）+ 手动

- [ ] **Step 1: DftIpNode 接收 `pos`**

`DftIpNode.tsx` props 解构里加 `pos`，类型里加 `pos: { x: number; y: number }`：

```ts
export function DftIpNode({ ip, pos, selected, wiring, dim, dropHover, onSelect, onMove, onDragMove, onOpenConfig, onPortDown, onSlotEnter, onSlotLeave, onBodyEnter, onBodyLeave, onContextMenu }: {
  ip: DftIpInstance; pos: { x: number; y: number }; selected: boolean; wiring: boolean;
  // …其余不变
```

`:49` Group 坐标改用 `pos`：

```ts
    <Group x={pos.x} y={pos.y} draggable opacity={dim ? 0.25 : 1} listening={!dim}
```

`:90` 起线锚点改用 `pos`：

```ts
            onPortDown({ kind: "ip", ipId: ip.id, port: outPort.name }, { x: pos.x + d.x, y: pos.y + d.y });
```

- [ ] **Step 2: Workspace 引入按层节点集 + `ipPosIn`**

`Workspace.tsx` 顶部 import 追加：

```ts
import { ipPosIn, isCrossLayerIp } from "./edit.ts";
```

在 `scope`/`ipBox` 定义处加「当前层可见节点集」`geomIps`，并把 `ipBox`、`obstacles`、`endpointAnchorEnd`、渲染都改用它。

`ipBox`（`:292-295`）替换为：先按层过滤出 `geomIps`，再用 `ipPosIn` 求包围盒：

```ts
  const geomIps = (scope?.dftIps ?? []).filter((ip) =>
    activeLayer === null ? true : isCrossLayerIp(ip) || catalogBus(ip.ipType) === activeLayer);
  const ipBox = geomIps.reduce((m, ip) => {
    const { w, h } = dftIpDispSize(ip);
    const p = ipPosIn(ip, activeLayer);
    return { w: Math.max(m.w, p.x + w + 60), h: Math.max(m.h, p.y + h + 60) };
  }, { w: 0, h: 0 });
```

`obstacles`（`:306-310`）替换为按 `geomIps` + `ipPosIn`：

```ts
  const obstacles: ObsRect[] = geomIps.map((ip) => {
    const { w, h } = dftIpDispSize(ip);
    const pos = dragPos && dragPos.ipId === ip.id ? { x: dragPos.x, y: dragPos.y } : ipPosIn(ip, activeLayer);
    return { x: pos.x, y: pos.y, w, h };
  });
```

- [ ] **Step 3: 锚点解析用 `ipPosIn`**

`endpointAnchorEnd`（`:85-107`）签名加 `layer` 参，内部 `ip.position` 改 `ipPosIn`：

```ts
function endpointAnchorEnd(
  scope: HardenDef, ep: DftEndpoint, bars: Omit<BarView, "paired" | "unconnected">[], backdropBox: BoxView,
  dragPos: { ipId: string; x: number; y: number } | null, layer: BusType | null,
): AnchorEnd | null {
  if (ep.kind === "ip") {
    const ip = (scope.dftIps ?? []).find((i) => i.id === ep.ipId);
    if (!ip) return null;
    const pos = dragPos && dragPos.ipId === ip.id ? { x: dragPos.x, y: dragPos.y } : ipPosIn(ip, layer);
    // …其余不变
```

两处调用（`:313-314` wireEnds、`:538` 预览）都补 `activeLayer` 实参：

```ts
    const a = endpointAnchorEnd(scope!, w.from, bars, backdropBox, dragPos, activeLayer);
    const b = endpointAnchorEnd(scope!, w.to, bars, backdropBox, dragPos, activeLayer);
```
```ts
  const fromEnd = endpointAnchorEnd(scope, from2, bars, backdropBox, dragPos, activeLayer);
  // …
  const toEnd: AnchorEnd | null = canSnap ? endpointAnchorEnd(scope, wireHover!, bars, backdropBox, dragPos, activeLayer) : null;
```

`Workspace.tsx` 顶部补 `import { layerStateOf, type BusType } from "../genconn/layers.ts";`（`BusType` 已可能未导入 → 加上）。

- [ ] **Step 4: IP 渲染传 `pos` + 只读全部视图**

IP 渲染块（`:505-532`）里给 `DftIpNode` 传 `pos={ipPosIn(ip, activeLayer)}`，并在 `activeLayer===null`（只读）时禁止拖动/选择/拉线：

```ts
                {scope?.dftIps?.map((ip) => {
                  const ls = ip.ipType === "DesignInstance" ? "normal" : layerStateOf(catalogBus(ip.ipType), activeLayer, hiddenLayers);
                  if (ls === "hidden") return null;
                  const readOnly = activeLayer === null; // 全部视图 = 只读参考
                  return (
                  <DftIpNode key={ip.id} ip={ip} pos={ipPosIn(ip, activeLayer)} selected={selectedDftIp === ip.id}
                    dim={ls === "dim" || readOnly}
                    wiring={!!dftWire}
                    // …其余回调不变
                  />
                  );
                })}
```

（`dim` 复用了「不可交互」语义：`DftIpNode` 里 `listening={!dim}` 会在只读时禁掉拖动/点击/起线。接口块起线脚同理——见 Step 5。）

- [ ] **Step 5: 只读时禁用接口起线 + 工具条按钮**

接口 `▶out` 起线脚（`:437-441`）的 `onMouseDown` 包一层 `activeLayer &&`：

```ts
                        onMouseDown={(e) => { e.cancelBubble = true; if (!dftWire && activeLayer) dftBeginWire(mkEp("out"), g.outW); }}
```

工具条（`:352-356`）：删除/自动排列按钮在只读（`activeLayer===null`）时禁用：

```ts
          {selectedDftIp && scope && activeLayer && <button onClick={() => deleteDftIp(scope.id, selectedDftIp)}>删除选中 IP</button>}
          {scope && <button disabled={activeLayer === null}
            onClick={() => autoArrangeDft(scope.id, Math.min(Math.max(WORKSPACE_MIN.h, outline.h), size.h), ws.w)}>
            {arrangeSnapshot?.defId === scope.id && arrangeSnapshot?.layer === activeLayer ? "恢复排列" : "自动排列"}
          </button>}
```

> 注：`arrangeSnapshot` 现带 `layer` 字段（T3 修复），按钮"恢复排列"标签须同时匹配 `defId` 与 `layer`，否则切层后会在没排过的层上误显"恢复排列"。
```

- [ ] **Step 6: 构建 + typecheck**

Run: `npm run build`
Expected: `tsc --noEmit` 通过、vite build 成功。

- [ ] **Step 7: 手动验证核心回归（关键）**

Run: `npm run dev:electron`，打开 `/Users/jiangbowang/Desktop/chip3.arch`，进 SpecGen 选 `tracking_channel`：
1. 切到 SSN 层，记住某条 SSN 连线走向与接口位置。
2. 切到 BSCAN 层，把任意 IP / DesignInstance 拖到别处。
3. 切回 SSN 层 → **接口位置、连线走向应与第 1 步完全一致**（不再"大乱"）。
4. 「全部」视图：节点淡显、无法拖动（只读参考）。
5. 进入 scope 默认落在第一个有内容的层，而非「全部」。

- [ ] **Step 8: Commit**

```bash
git add src/specgen/Workspace.tsx src/specgen/DftIpNode.tsx
git commit -m "feat(specgen): 画布几何按活动层隔离 + 跨层节点用 layerPos + 全部视图只读"
```

---

## Task 5: schema-parity / 序列化守卫

**Files:**
- Modify: `tests/unit/specgen-schema-parity.test.ts`（追加一条）
- 若序列化用白名单字段：`src/genconn/core/document.ts`（`serialize`）

- [ ] **Step 1: 确认 serialize 是否透传 layerPos**

Run: `grep -n "layerPos\|position\|dftIps" src/genconn/core/document.ts`
判断 `serialize` 是整体透传 `dftIps`（则 `layerPos` 自动带上）还是逐字段挑选（则需在 IP 序列化处补 `layerPos`）。若逐字段：在 IP 序列化对象里加 `...(ip.layerPos ? { layerPos: ip.layerPos } : {})`。

- [ ] **Step 2: 写守卫测试**

在 `tests/unit/specgen-schema-parity.test.ts` 追加（沿用该文件既有构造 doc 的写法；下面用最小 doc）：

```ts
import { serialize } from "../../src/genconn/core/document.ts";

test("layerPos 序列化 round-trip：带 layerPos 的 DesignInstance 不丢字段", () => {
  const di = { id: "d1", ipType: "DesignInstance" as const, instanceName: "core",
    position: { x: 1, y: 2 }, layerPos: { SSN: { x: 3, y: 4 } } };
  const doc = {
    schemaVersion: 1, library: { defs: [{ id: "p", designName: "p", designLevel: "sub_block" as const,
      designType: "tiling" as const, interfaces: [], childInstances: [], connections: [], inSpecgen: true, dftIps: [di] }] },
    ui: { openDefId: "p", rootDefId: "p" }, ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1,
  };
  const s = serialize(doc as never);
  const back = JSON.parse(s);
  const ip = back.library.defs[0].dftIps[0];
  assert.deepEqual(ip.layerPos, { SSN: { x: 3, y: 4 } });
  assert.deepEqual(ip.position, { x: 1, y: 2 });
});
```

（顶部若无 `import { test } from "node:test"; import assert from "node:assert/strict";` 则补。）

- [ ] **Step 3: 运行 + 修实现（如需）**

Run: `node --test tests/unit/specgen-schema-parity.test.ts`
Expected: PASS。若 FAIL（layerPos 丢失）→ 按 Step 1 在 serialize 补透传，再跑至 PASS。

- [ ] **Step 4: 全量测试**

Run: `npm test`
Expected: typecheck + 全部单测/集成 PASS（含既有 bscan schema parity）。

- [ ] **Step 5: Commit**

```bash
git add tests/unit/specgen-schema-parity.test.ts src/genconn/core/document.ts
git commit -m "test(specgen): layerPos 序列化 round-trip 守卫"
```

---

# Phase 2 — Part B：多选 / 删除辅助

## Task 6: edit.ts —— `clearDftScope` + `removeFromSpecgen`

**Files:**
- Modify: `src/specgen/edit.ts`（追加两函数）
- Test: `tests/unit/specgen-edit.test.ts`（追加）

- [ ] **Step 1: 写失败测试**

`tests/unit/specgen-edit.test.ts` 追加（顶部 import 补 `clearDftScope, removeFromSpecgen`）：

```ts
import { clearDftScope, removeFromSpecgen } from "../../src/specgen/edit.ts";

test("clearDftScope 清空 dftIps 与 dftWires，其余不动", () => {
  let d = addToSpecgen(baseDoc(), "p");
  d = addDftIp(d, "p", "ScanHost");
  d = addDftIp(d, "p", "Pipeline");
  const [ssh, pp] = defOf(d).dftIps!;
  d = addDftWire(d, "p", { kind: "ip", ipId: ssh.id, port: "bus_data_out" }, { kind: "ip", ipId: pp.id, port: "bus_data_in" });
  d = clearDftScope(d, "p");
  assert.equal(defOf(d).dftIps!.length, 0);
  assert.equal(defOf(d).dftWires!.length, 0);
  assert.equal(defOf(d).inSpecgen, true, "clear 不改 inSpecgen");
});

test("removeFromSpecgen 置 inSpecgen=false，内容保留", () => {
  let d = addToSpecgen(baseDoc(), "p");
  d = addDftIp(d, "p", "ScanHost");
  d = removeFromSpecgen(d, "p");
  assert.equal(defOf(d).inSpecgen, false);
  assert.equal(defOf(d).dftIps!.length, 1, "内容保留，可再加入恢复");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/unit/specgen-edit.test.ts`
Expected: 2 条新测 FAIL（未导出）。

- [ ] **Step 3: 实现**

`src/specgen/edit.ts` 末尾追加：

```ts
/** 清空该 scope 的全部 DFT IP + 连线（DesignInstance 会随 syncDesignInstances 自动重建）。 */
export function clearDftScope(doc: GenConnDocument, defId: Id): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d, dftIps: [], dftWires: [] }));
}

/** 移出 SpecGen：inSpecgen=false；内容保留以便再「加入 SpecGen」时恢复。 */
export function removeFromSpecgen(doc: GenConnDocument, defId: Id): GenConnDocument {
  return mapDef(doc, defId, (d) => ({ ...d, inSpecgen: false }));
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/unit/specgen-edit.test.ts`
Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/specgen/edit.ts tests/unit/specgen-edit.test.ts
git commit -m "feat(specgen): clearDftScope / removeFromSpecgen 纯函数"
```

---

## Task 7: store —— 多选 state + actions + scope 动作

**Files:**
- Modify: `src/genconn/store.ts`（state 字段、actions、类型声明、`setActiveLayer`）
- Test: `tests/unit/specgen-store.test.ts`（追加）

- [ ] **Step 1: 替换选择字段**

state 里 `selectedDftIp: Id | null` → `selectedDftIps: Id[]`（`:116` 类型声明、`:283` 初值）。类型声明区（约 `:224` 附近 `selectDftIp` 声明处）补：

```ts
  selectedDftIps: Id[];
  selectDftIp: (ipId: Id | null) => void;          // 单选便捷（写数组）
  selectDftIps: (ipIds: Id[]) => void;             // 框选结算：整批替换
  toggleDftIp: (ipId: Id, additive: boolean) => void;
  selectAllDftIps: (defId: Id) => void;
  clearDftSelection: () => void;
  deleteDftIps: (defId: Id, ipIds: Id[]) => void;
  clearDftScope: (defId: Id) => void;
  removeFromSpecgen: (defId: Id) => void;
```

从 `../specgen/edit.ts` import 追加 `clearDftScope as dftClearScope, removeFromSpecgen as dftRemoveFromSpecgen`。

- [ ] **Step 2: 实现 actions**

`selectDftIp`（`:564`）改为写数组；`deleteDftIp`（`:563`）清数组；追加新 actions：

```ts
  selectDftIp: (ipId) => set({ selectedDftIps: ipId ? [ipId] : [] }),
  selectDftIps: (ipIds) => set({ selectedDftIps: ipIds }),
  toggleDftIp: (ipId, additive) => set((s) => {
    if (!additive) return { selectedDftIps: [ipId] };
    const has = s.selectedDftIps.includes(ipId);
    return { selectedDftIps: has ? s.selectedDftIps.filter((i) => i !== ipId) : [...s.selectedDftIps, ipId] };
  }),
  selectAllDftIps: (defId) => set((s) => {
    const def = s.doc.library.defs.find((d) => d.id === defId);
    const layer = s.activeLayer;
    const ids = (def?.dftIps ?? [])
      .filter((ip) => !dftIsCrossLayerIp(ip) && (layer === null || catalogBus(ip.ipType) === layer))
      .map((ip) => ip.id);
    return { selectedDftIps: ids };
  }),
  clearDftSelection: () => set({ selectedDftIps: [] }),
  deleteDftIps: (defId, ipIds) => set((s) => {
    let doc = s.doc;
    for (const id of ipIds) doc = dftDeleteIp(doc, defId, id);
    return { doc, selectedDftIps: [], dirty: true, arrangeSnapshot: null };
  }),
  clearDftScope: (defId) => set((s) => ({ doc: dftClearScope(s.doc, defId), selectedDftIps: [], dirty: true, arrangeSnapshot: null })),
  removeFromSpecgen: (defId) => set((s) => {
    const doc = dftRemoveFromSpecgen(s.doc, defId);
    const stillOpen = s.specgenScope === defId
      ? (doc.library.defs.find((d) => d.inSpecgen && d.id !== defId)?.id ?? null)
      : s.specgenScope;
    return { doc, specgenScope: stillOpen, selectedDftIps: [], dirty: true, arrangeSnapshot: null };
  }),
```

`deleteDftIp`（`:563`）里 `selectedDftIp: null` → `selectedDftIps: []`。
`setActiveLayer`（`:307`）里 `selectedIds: []` 那处，补 `selectedDftIps: []`。
`openSpecgenScope`（Task 3 里暂写的 `selectedDftIp: null`）→ 改为 `selectedDftIps: []`。
初始 state（`:283`）`selectedDftIp: null` → `selectedDftIps: []`。

- [ ] **Step 3: 写测试**

`tests/unit/specgen-store.test.ts` 追加：

```ts
test("toggleDftIp additive 累加/移除；非 additive 单选", () => {
  useStore.setState({ doc: scopeDoc([]), selectedDftIps: [] });
  useStore.getState().toggleDftIp("a", true);
  useStore.getState().toggleDftIp("b", true);
  assert.deepEqual(useStore.getState().selectedDftIps, ["a", "b"]);
  useStore.getState().toggleDftIp("a", true);
  assert.deepEqual(useStore.getState().selectedDftIps, ["b"]);
  useStore.getState().toggleDftIp("c", false);
  assert.deepEqual(useStore.getState().selectedDftIps, ["c"]);
});

test("selectAllDftIps 排除 DesignInstance", () => {
  const di: DftIpInstance = { id: "d1", ipType: "DesignInstance", instanceName: "core", position: { x: 0, y: 0 } };
  const pp: DftIpInstance = { id: "p1", ipType: "Pipeline", instanceName: "pp_1", position: { x: 0, y: 0 } };
  useStore.setState({ doc: scopeDoc([di, pp]), activeLayer: null });
  useStore.getState().selectAllDftIps("p");
  assert.deepEqual(useStore.getState().selectedDftIps, ["p1"]);
});

test("removeFromSpecgen 置 inSpecgen=false 并切走当前打开 scope", () => {
  const d = scopeDoc([]);
  d.library.defs.push({ id: "q", designName: "q", designLevel: "sub_block", designType: "tiling",
    interfaces: [], childInstances: [], connections: [], inSpecgen: true });
  useStore.setState({ doc: d, specgenScope: "p" });
  useStore.getState().removeFromSpecgen("p");
  assert.equal(topOf().inSpecgen, false);
  assert.equal(useStore.getState().specgenScope, "q");
});

test("clearDftScope 清内容", () => {
  const pp: DftIpInstance = { id: "p1", ipType: "Pipeline", instanceName: "pp_1", position: { x: 0, y: 0 } };
  useStore.setState({ doc: scopeDoc([pp]) });
  useStore.getState().clearDftScope("p");
  assert.equal((topOf().dftIps ?? []).length, 0);
});
```

- [ ] **Step 4: 运行 + typecheck**

Run: `node --test tests/unit/specgen-store.test.ts && npm run typecheck`
Expected: 全 PASS；typecheck 报出所有仍引用 `selectedDftIp` 的地方（下一 Task 修 Workspace）。

> 注意：typecheck 此时会在 `Workspace.tsx` 报 `selectedDftIp` 不存在——这是预期的，Task 8 修复。可先 commit store（测试已过），Workspace 编译错误在 Task 8 一并消除；或将 Task 7、8 合并为一次提交。建议合并提交以保持每次 commit 可编译。

- [ ] **Step 5: （与 Task 8 合并提交）**

暂不单独 commit；见 Task 8 Step 6。

---

## Task 8: Workspace —— 多选高亮 + 框选 + 全选 + 批量删 + scope 按钮

**Files:**
- Modify: `src/specgen/Workspace.tsx`
- 验证：`npm run build` + 手动

- [ ] **Step 1: 取多选 state + 新 actions**

`Workspace.tsx` store 取值区（`:143-168`）：`selectedDftIp` → `selectedDftIps`，并取新 actions：

```ts
  const selectedDftIps = useStore((s) => s.selectedDftIps);
  const selectDftIps = useStore((s) => s.selectDftIps);
  const toggleDftIp = useStore((s) => s.toggleDftIp);
  const selectAllDftIps = useStore((s) => s.selectAllDftIps);
  const deleteDftIps = useStore((s) => s.deleteDftIps);
  const clearDftScope = useStore((s) => s.clearDftScope);
  const removeFromSpecgen = useStore((s) => s.removeFromSpecgen);
```

删掉 `const selectedDftIp = useStore((s) => s.selectedDftIp);`。加派生单选：

```ts
  const singleSel = selectedDftIps.length === 1 ? selectedDftIps[0] : null;
```

- [ ] **Step 2: 替换所有 `selectedDftIp` 引用**

- 键盘删（`:211-213`）：改为批量：
```ts
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedDftIps.length) { e.preventDefault(); deleteDftIps(scope.id, selectedDftIps); }
        else if (selectedDftWire) { e.preventDefault(); removeDftWire(scope.id, selectedDftWire); setSelectedDftWire(null); }
      }
```
- 旋转/镜像（`:214-221`）用 `singleSel`：把 `selectedDftIp` → `singleSel`（两处）。
- Ctrl/Cmd+A 全选（在同一 keydown 里加分支，放 `Escape` 前）：
```ts
      } else if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey)) {
        if (activeLayer) { e.preventDefault(); selectAllDftIps(scope.id); }
      }
```
- keydown deps 数组（`:226`）：把 `selectedDftIp` 换 `selectedDftIps, singleSel, deleteDftIps, selectAllDftIps`。
- 工具条删除按钮（`:352`）：
```ts
          {selectedDftIps.length > 0 && scope && activeLayer &&
            <button onClick={() => deleteDftIps(scope.id, selectedDftIps)}>删除选中 ({selectedDftIps.length})</button>}
```
- IP 渲染 `selected`（`:510`）：`selected={selectedDftIps.includes(ip.id)}`。
- IP `onSelect`（`:514`）：支持 Shift/Ctrl 切换：
```ts
                    onSelect={(additive) => additive ? toggleDftIp(ip.id, true) : selectDftIp(ip.id)}
```
  并把 `DftIpNode` 的 `onSelect` 类型改为 `(additive: boolean) => void`，其内部点击（`DftIpNode.tsx:50`）传修饰键：
```ts
      onClick={(e) => { e.cancelBubble = true; onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey); }}
```
- 右键菜单单删（`:571`）：保持 `deleteDftIp(scope.id, ctxMenu.id)`（单个仍可用）。

- [ ] **Step 3: 框选 marquee（参考 CanvasView.tsx:610-829）**

在组件内加 state：

```ts
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const marqueeMoved = useRef(false);
```

Stage 空白按下时（`onMouseDown`，`:370-375`）：只读/拉线态不框选；否则起框：

```ts
              onMouseDown={(e) => {
                if (e.target !== e.target.getStage()) return;
                setCtxMenu(null);
                if (dftWire || !activeLayer) return;               // 只读全部视图不框选
                const sp = e.target.getStage()?.getPointerPosition();
                const p = sp ? toWorld(sp) : null;
                if (!p) { selectDftIp(null); setSelectedDftWire(null); return; }
                marqueeMoved.current = false;
                setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
              }}
```

> 注意：起框后要阻止 Stage 自身的 `draggable` 平移。把 Stage 的 `draggable` 改为 `draggable={!dftWire && !marquee}`（`:366`）。

Stage `onMouseMove`（`:376`）里，若在框选则更新框 + 命中：

```ts
                if (marquee) {
                  const sp2 = e.target.getStage()?.getPointerPosition();
                  const p2 = sp2 ? toWorld(sp2) : null;
                  if (p2) {
                    if (Math.abs(p2.x - marquee.x0) + Math.abs(p2.y - marquee.y0) > 3) marqueeMoved.current = true;
                    setMarquee({ ...marquee, x1: p2.x, y1: p2.y });
                  }
                  return;
                }
```

Stage `onMouseUp`（`:394`）里，若在框选则结算命中集合：

```ts
                if (marquee) {
                  const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1);
                  const X = Math.max(marquee.x0, marquee.x1), Y = Math.max(marquee.y0, marquee.y1);
                  const hit = geomIps.filter((ip) => {
                    if (ip.ipType !== "DesignInstance" && catalogBus(ip.ipType) !== activeLayer) return false;
                    const p = ipPosIn(ip, activeLayer); const { w, h } = dftIpDispSize(ip);
                    return p.x < X && p.x + w > x && p.y < Y && p.y + h > y;   // 盒相交
                  }).map((ip) => ip.id);
                  if (marqueeMoved.current) selectDftIps(hit); else { selectDftIp(null); setSelectedDftWire(null); }
                  setMarquee(null);
                  return;
                }
```

（`selectDftIps` 已在 Task 7 声明+实现；此处从 store 取用：`const selectDftIps = useStore((s) => s.selectDftIps);`，与 Step 1 的其它 action 取值放一起。）

在 `<Layer>` 里、IP 之后画选框：

```ts
                {marquee && (
                  <Rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)}
                    width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)}
                    fill="#2e90fa22" stroke="#2e90fa" strokeWidth={1} dash={[4, 4]} listening={false} />
                )}
```

- [ ] **Step 4: scope 级按钮**

scope 工具条（`:347-351` `dft-scopebar` 里 `<select>` 之后）加两个按钮：

```ts
          {scope && <button className="danger" onClick={() => {
            if (window.confirm(`清空「${scope.designName}」的全部 DFT IP 与连线？`)) clearDftScope(scope.id);
          }}>清空本 scope</button>}
          {scope && <button onClick={() => {
            if (window.confirm(`把「${scope.designName}」移出 SpecGen？（内容保留，可再加入恢复）`)) removeFromSpecgen(scope.id);
          }}>移出 SpecGen</button>}
```

- [ ] **Step 5: 构建 + 手动验证**

Run: `npm run build`
Expected: typecheck + build 通过（所有 `selectedDftIp` 引用已消除）。

手动（`npm run dev:electron`，chip3.arch → SpecGen）：
1. 空白拖框 → 覆盖多个 IP 高亮；Del → 一起删（连线级联删）。
2. Shift/Ctrl 点选 → 增减单个。
3. Ctrl/Cmd+A → 选当前层用户 IP（DesignInstance 不选中）。
4. 「清空本 scope」→ 确认后 IP/连线清空，DesignInstance 自动重建。
5. 「移出 SpecGen」→ 确认后该 scope 从下拉消失、自动切到另一个 scope；回 GenConnection 能再「加入 SpecGen」恢复内容。

- [ ] **Step 6: Commit（含 Task 7 store 改动）**

```bash
git add src/genconn/store.ts src/specgen/Workspace.tsx src/specgen/DftIpNode.tsx tests/unit/specgen-store.test.ts
git commit -m "feat(specgen): 多选/框选/全选/批量删 + scope 级 清空/移出 SpecGen"
```

- [ ] **Step 7: 全量回归**

Run: `npm test`
Expected: typecheck + 全部单测/集成 PASS。若有 e2e：`npm run test:e2e`（可选）。

---

## 自查（写完计划后对照 spec）

- **Part A 覆盖**：模型 `layerPos`（T1）、`ipPosIn`/`isCrossLayerIp`（T1）、move 写规则（T2）、store 传 layer + 默认进层（T3）、几何按层 + 只读全部视图 + DftIpNode pos（T4）、序列化守卫（T5）。✅
- **Part B 覆盖**：多选/toggle/全选/批量删（T7/T8）、marquee（T8）、Ctrl+A（T8）、清空 scope（T6/T7/T8）、移出 SpecGen（T6/T7/T8）。✅
- **类型一致**：`ipPosIn(ip, layer)`、`isCrossLayerIp(ip)`、`moveDftIp(...,layer)`、`applyAutoLayout(...,layer)`、`setDftIpPositions(...,layer)`、`selectedDftIps`、`toggleDftIp(id,additive)`、`selectDftIps(ids)`、`selectAllDftIps`、`deleteDftIps`、`clearDftScope`、`removeFromSpecgen` —— 跨 Task 命名统一。✅
- **提交可编译**：Task 7 引入 `selectedDftIps` 会让 Workspace 暂不编译 → 已在 T7/T8 合并提交（T7 Step 5 说明）。✅
- **验收核心**：Task 4 Step 7 手动回归直接盯"BSCAN 里改位置 → SSN 走线逐字一致"。（如需自动化，可后续补一条 Playwright e2e：读两次 SSN 线的 `points` 属性比对。）
