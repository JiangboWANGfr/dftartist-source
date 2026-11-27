# data source 统一视觉 + 通道化引脚 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 genconn 画布内部 data source（SSN pad / 共享 tap / bisrController）统一成 specgen 三角芯片风格的「纵向通道行」卡片，并移植 newProject 的 `pdList`（每 PD 一行）+ 共享 tap（N 成员）+ pd→端口名派生。

**Architecture:** 数据模型加 3 个字段（`BusInterface.pdList`/`dsGroupId`、`BusWire.pd`）。新增纯函数模块 `dataSource.ts` 把一个 data source 接口归一成「通道列表」+ 单一来源的短标签。`wire.ts` 移植 `applyBisrMatchOnly` 派生 `pdMatchOnly`（决定 pd 进不进端口名），并把 `pd` 沿 `wireFromTree→addWire→store.beginWire/commitWire→CanvasView.onWirePin` 串起来。渲染层把 `CanvasView` 内部 data source 块重写成「卡片 + 每通道一行 ▶out/◀in」，三角脚复用从 specgen 提取到 `layout.ts` 的 `triPoints`。Inspector 改下拉命名 + PD chip 编辑 + 共享 tap 入口。

**Tech Stack:** TypeScript · React · Konva（react-konva）· Zustand（store）· Node 内置测试（`node --test`，`tests/unit/*.test.ts`）。

**Spec:** `docs/specs/2026-07-15-datasource-unified-visual-design.md`（决策 D1–D8）。

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/genconn/core/model.ts` | 改 | `BusInterface` 加 `pdList?`/`dsGroupId?`；`BusWire` 加 `pd?` |
| `src/genconn/dataSource.ts` | **新建** | 纯函数：`DS_LABEL` 单一短标签、`DsChannel`、`dataSourceChannels`、`isPrimaryDataSource`、`usedPdNames` |
| `src/genconn/wire.ts` | 改 | 移植 `applyBisrMatchOnly`；`wireFromTree`/`addWire`/`removeWire` 串 `pd` |
| `src/genconn/layout.ts` | 改 | 导出 `triPoints`（从 specgen 提取，参数化） |
| `src/specgen/Workspace.tsx` | 改 | 删本地 `triPoints`，改用 `layout.ts` 的 |
| `src/genconn/store.ts` | 改 | wire 草稿态 + `beginWire` 串 `pd`；`commitWire` 传 `pd`；新增 `createSharedTap` |
| `src/genconn/CanvasView.tsx` | 改 | 删本地 `OTHER_LABEL`；`onWirePin` 加 `pd`；重写内部 data source 渲染为通道卡片 |
| `src/genconn/Inspector.tsx` | 改 | 下拉改名（用 `DS_LABEL`）；PD chip 编辑；共享 tap 按钮 |
| `tests/unit/genconn-datasource-channels.test.ts` | **新建** | `dataSourceChannels`/`isPrimaryDataSource` 单测 |
| `tests/unit/genconn-bisr-pd.test.ts` | **新建** | `applyBisrMatchOnly` 三态单测 |

**依赖顺序**：Task 1（模型）→ Task 2（通道纯函数）/Task 3（派生+wire）可并行 → Task 4（store 串 pd，依赖 3）→ Task 5（triPoints 提取）→ Task 6（渲染，依赖 2/5）→ Task 7（Inspector，依赖 2 + store）→ Task 8（总验收）。

---

## Task 1: 数据模型加 3 个字段

**Files:**
- Modify: `src/genconn/core/model.ts`（`BusInterface` 约 :57 后、`BusWire` 约 :107 前）

- [ ] **Step 1: 在 `BusInterface` 末尾（`dsFlip?` 之后）加两个字段**

打开 `src/genconn/core/model.ts`，找到 `dsFlip?: boolean;`（约 :57），在其后、`}` 之前插入：

```ts
  /** 视图：仅 BISR data source；power domain 列表，每个 pd 渲染成卡片里的一行（一条连接线）。不影响生成（生成靠 wire.pd → powerDomain）。 */
  pdList?: string[];
  /** 视图：共享节点分组键。同 dsGroupId 的多个 data source 接口渲成同一张卡片（每成员一行）。不影响生成。 */
  dsGroupId?: string;
```

- [ ] **Step 2: 在 `BusWire` 里加 `pd` 字段**

找到 `interface BusWire { ... connectionIds: Id[]; }`（约 :96–107），在 `connectionIds: Id[];` 之前插入：

```ts
  /** 仅 BISR：这条线携带的 power domain（从某个 pd 桩起线时写入）；喂给 wire.ts 的 applyBisrMatchOnly 派生。 */
  pd?: string;
```

- [ ] **Step 3: 类型检查通过**

Run: `npm run typecheck`
Expected: PASS（无报错；纯字段新增，向后兼容）。

- [ ] **Step 4: Commit**

```bash
git add src/genconn/core/model.ts
git commit -m "feat(genconn): 模型加 BusInterface.pdList/dsGroupId + BusWire.pd"
```

---

## Task 2: 通道纯函数模块 `dataSource.ts`（TDD）

**Files:**
- Create: `src/genconn/dataSource.ts`
- Test: `tests/unit/genconn-datasource-channels.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/genconn-datasource-channels.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { BusInterface, HardenDef } from "../../src/genconn/core/model.ts";
import { dataSourceChannels, isPrimaryDataSource, DS_LABEL } from "../../src/genconn/dataSource.ts";

const mkDef = (interfaces: BusInterface[]): HardenDef => ({
  id: "D", designName: "D", designLevel: "sub_block", designType: "tiling",
  interfaces, childInstances: [], connections: [],
});

test("SSN pad：单通道，标签 pad", () => {
  const iface: BusInterface = { id: "s1", busType: "SSN", role: "client", isDataSource: true, placement: "other" };
  const chans = dataSourceChannels(iface, mkDef([iface]));
  assert.equal(chans.length, 1);
  assert.equal(chans[0].label, "pad");
  assert.equal(chans[0].ifId, "s1");
  assert.equal(chans[0].pd, undefined);
});

test("BISR pdList：N 行，每行带 pd，颜色为 BISR", () => {
  const iface: BusInterface = { id: "b1", busType: "BISR", role: "client", isDataSource: true, placement: "other", pdList: ["pdA", "pdB"] };
  const chans = dataSourceChannels(iface, mkDef([iface]));
  assert.deepEqual(chans.map((c) => c.label), ["pdA", "pdB"]);
  assert.deepEqual(chans.map((c) => c.pd), ["pdA", "pdB"]);
  assert.ok(chans.every((c) => c.ifId === "b1"));
});

test("共享 tap：同 dsGroupId 的成员各一行，ifId 为各成员", () => {
  const a: BusInterface = { id: "ij", busType: "IJTAG", role: "client", isDataSource: true, placement: "other", dsGroupId: "g1" };
  const b: BusInterface = { id: "bs", busType: "BSCAN", role: "client", isDataSource: true, placement: "other", dsGroupId: "g1" };
  const chans = dataSourceChannels(a, mkDef([a, b]));
  assert.equal(chans.length, 2);
  assert.deepEqual(chans.map((c) => c.ifId), ["ij", "bs"]);
});

test("isPrimaryDataSource：组内第一个为 true、其余 false", () => {
  const a: BusInterface = { id: "ij", busType: "IJTAG", role: "client", isDataSource: true, placement: "other", dsGroupId: "g1" };
  const b: BusInterface = { id: "bs", busType: "BSCAN", role: "client", isDataSource: true, placement: "other", dsGroupId: "g1" };
  const def = mkDef([a, b]);
  assert.equal(isPrimaryDataSource(a, def), true);
  assert.equal(isPrimaryDataSource(b, def), false);
});

test("DS_LABEL 覆盖全 busType", () => {
  assert.deepEqual(DS_LABEL, { SSN: "pad", IJTAG: "tap", BISR: "bisrController", BSCAN: "tap", JTAG1838: "tap" });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `node --test tests/unit/genconn-datasource-channels.test.ts`
Expected: FAIL —— `Cannot find module '../../src/genconn/dataSource.ts'`。

- [ ] **Step 3: 实现 `dataSource.ts`**

新建 `src/genconn/dataSource.ts`：

```ts
// data source 通道模型（纯函数，无 React/Konva）：把一个 data source 接口归一成"通道列表"。
// 每通道 = 一行「标签 + ▶out/◀in 一对」；bisr 与 tap 同构。pd/总线只挂 out，◀in 只是收线终点。

import type { BusInterface, HardenDef, Id } from "./core/model.ts";
import { BUS_COLOR, busTypeLabel } from "./layout.ts";

/** placement=other 卡片的顶部短标签（单一来源；CanvasView / Inspector 都从这里取）。 */
export const DS_LABEL: Record<BusInterface["busType"], string> = {
  SSN: "pad", IJTAG: "tap", BISR: "bisrController", BSCAN: "tap", JTAG1838: "tap",
};

export interface DsChannel {
  /** React key + 引脚唯一标识。 */
  key: string;
  /** 行标签：pd 名 / 总线短码 / DS_LABEL。 */
  label: string;
  /** 该通道所属总线色。 */
  color: string;
  /** 该通道的线从哪个接口起（onWirePin 的 ifId）。 */
  ifId: Id;
  /** 仅 BISR：out 线携带的 pd。 */
  pd?: string;
}

/** 同一 dsGroupId 组内的成员接口（按 def.interfaces 顺序）；无 group 时返回自身。 */
export function groupMembers(iface: BusInterface, def: HardenDef): BusInterface[] {
  if (!iface.dsGroupId) return [iface];
  return def.interfaces.filter(
    (f) => f.isDataSource && f.placement === "other" && f.dsGroupId === iface.dsGroupId,
  );
}

/** 该接口是否负责渲染卡片：非组成员恒 true；组成员仅"第一个"true（其余跳过，避免重复画）。 */
export function isPrimaryDataSource(iface: BusInterface, def: HardenDef): boolean {
  if (!iface.isDataSource || iface.placement !== "other") return false;
  return groupMembers(iface, def)[0]?.id === iface.id;
}

/** 归一成通道列表。优先级：BISR+pdList → 共享组 → 单通道。 */
export function dataSourceChannels(iface: BusInterface, def: HardenDef): DsChannel[] {
  if (iface.busType === "BISR" && iface.pdList?.length) {
    return iface.pdList.map((pd) => ({
      key: `${iface.id}:${pd}`, label: pd, color: BUS_COLOR.BISR, ifId: iface.id, pd,
    }));
  }
  const members = groupMembers(iface, def);
  if (members.length > 1) {
    return members.map((m) => ({
      key: m.id, label: busTypeLabel(m.busType, m.role), color: BUS_COLOR[m.busType], ifId: m.id,
    }));
  }
  return [{ key: iface.id, label: DS_LABEL[iface.busType], color: BUS_COLOR[iface.busType], ifId: iface.id }];
}

/** 收集全 doc 里已用过的 pd 名（powerDomain + ifacePd 覆盖值）——给 Inspector chip 输入做自动补全。 */
export function usedPdNames(defs: HardenDef[]): string[] {
  const set = new Set<string>();
  for (const d of defs) {
    for (const f of d.interfaces) if (f.powerDomain) set.add(f.powerDomain);
    for (const inst of d.childInstances) for (const pd of Object.values(inst.ifacePd ?? {})) set.add(pd);
  }
  return [...set].sort();
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `node --test tests/unit/genconn-datasource-channels.test.ts`
Expected: PASS（5 个 test 全绿）。

- [ ] **Step 5: 类型检查通过**

Run: `npm run typecheck`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/genconn/dataSource.ts tests/unit/genconn-datasource-channels.test.ts
git commit -m "feat(genconn): dataSource 通道纯函数 + DS_LABEL 单一来源"
```

---

## Task 3: `applyBisrMatchOnly` 派生 + wire 串 pd（TDD）

**Files:**
- Modify: `src/genconn/wire.ts`（`wireFromTree` :225/:355、`addWire` :360、`removeWire` :378，文件末尾加 `applyBisrMatchOnly`）
- Test: `tests/unit/genconn-bisr-pd.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/genconn-bisr-pd.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { GenConnDocument, HardenDef } from "../../src/genconn/core/model.ts";
import { applyBisrMatchOnly } from "../../src/genconn/wire.ts";

// 手搭 doc：SRC(数据源) 经 3 条 BISR wire 连到 dn1(穿 pdA+pdB) 与 dn2(仅 pdA)。
function bisrDoc(): GenConnDocument {
  const SRC: HardenDef = {
    id: "SRC", designName: "SRC", designLevel: "sub_block", designType: "tiling",
    interfaces: [
      { id: "srcDs", busType: "BISR", role: "client", isDataSource: true },   // 数据源接口本体（派生时排除）
      { id: "srcSecA", busType: "BISR", role: "secondary", interfaceName: "a" },
      { id: "srcSecB", busType: "BISR", role: "secondary", interfaceName: "b" },
    ], childInstances: [], connections: [],
  };
  const DN1: HardenDef = {
    id: "DN1", designName: "DN1", designLevel: "sub_block", designType: "tiling",
    interfaces: [{ id: "dn1a", busType: "BISR", role: "client" }, { id: "dn1b", busType: "BISR", role: "client" }],
    childInstances: [], connections: [],
  };
  const DN2: HardenDef = {
    id: "DN2", designName: "DN2", designLevel: "sub_block", designType: "tiling",
    interfaces: [{ id: "dn2c", busType: "BISR", role: "client" }], childInstances: [], connections: [],
  };
  const T: HardenDef = {
    id: "T", designName: "T", designLevel: "chip", designType: "hierarchical", interfaces: [],
    childInstances: [
      { id: "src", instanceName: "src", hardenId: "SRC" },
      { id: "dn1", instanceName: "dn1", hardenId: "DN1" },
      { id: "dn2", instanceName: "dn2", hardenId: "DN2" },
    ],
    connections: [
      { id: "c1", secondaryInstanceId: "src", secondaryInterfaceId: "srcSecA", clientInstanceId: "dn1", clientInterfaceId: "dn1a", manual: true },
      { id: "c2", secondaryInstanceId: "src", secondaryInterfaceId: "srcSecB", clientInstanceId: "dn1", clientInterfaceId: "dn1b", manual: true },
      { id: "c3", secondaryInstanceId: "src", secondaryInterfaceId: "srcSecA", clientInstanceId: "dn2", clientInterfaceId: "dn2c", manual: true },
    ],
    wires: [
      { id: "w1", busType: "BISR", pd: "pdA", sourceInstanceId: "src", sourceInterfaceId: "srcDs", points: [], connectionIds: ["c1"] },
      { id: "w2", busType: "BISR", pd: "pdB", sourceInstanceId: "src", sourceInterfaceId: "srcDs", points: [], connectionIds: ["c2"] },
      { id: "w3", busType: "BISR", pd: "pdA", sourceInstanceId: "src", sourceInterfaceId: "srcDs", points: [], connectionIds: ["c3"] },
    ],
  };
  return { schemaVersion: 1, library: { defs: [T, SRC, DN1, DN2] }, ui: { openDefId: "T", rootDefId: "T" } } as unknown as GenConnDocument;
}

const ifOf = (doc: GenConnDocument, defId: string, ifId: string) =>
  doc.library.defs.find((d) => d.id === defId)!.interfaces.find((f) => f.id === ifId)!;

test("下游穿 1 个 pd → pdMatchOnly=true（只匹配、端口名干净）", () => {
  const out = applyBisrMatchOnly(bisrDoc());
  assert.equal(ifOf(out, "DN2", "dn2c").pdMatchOnly, true);
});

test("下游穿 ≥2 个 pd → pdMatchOnly=false（进名消歧）", () => {
  const out = applyBisrMatchOnly(bisrDoc());
  assert.equal(ifOf(out, "DN1", "dn1a").pdMatchOnly, false);
  assert.equal(ifOf(out, "DN1", "dn1b").pdMatchOnly, false);
});

test("源实例的 secondary 接口 → pdMatchOnly=false（总进名）", () => {
  const out = applyBisrMatchOnly(bisrDoc());
  assert.equal(ifOf(out, "SRC", "srcSecA").pdMatchOnly, false);
  assert.equal(ifOf(out, "SRC", "srcSecB").pdMatchOnly, false);
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `node --test tests/unit/genconn-bisr-pd.test.ts`
Expected: FAIL —— `applyBisrMatchOnly` 未从 wire.ts 导出。

- [ ] **Step 3: 在 `wire.ts` 末尾追加 `applyBisrMatchOnly`（移植 newProject，字段名与 dft-suite 一致）**

打开 `src/genconn/wire.ts`，在文件末尾追加：

```ts
/**
 * 派生 BISR 数据源线生成接口的 pdMatchOnly（决定 pd 进不进端口名）：
 *  - 源实例（data source 本实例）的接口 → false（总是进名）。
 *  - 下游实例的接口 → 本实例经过的"不同 pd 个数" == 1 ? true(只匹配) : false(进名)。
 * 只改「由 BISR wire 连接引用」的接口（排除 DS 源接口本体）；纯函数，与画线顺序无关。
 */
export function applyBisrMatchOnly(doc: GenConnDocument): GenConnDocument {
  const open = doc.library.defs.find((d) => d.id === doc.ui.openDefId) as HardenDef | undefined;
  if (!open) return doc;
  const wires = (open.wires ?? []).filter((w) => w.busType === "BISR");
  if (!wires.length) return doc;
  const connById = new Map(open.connections.map((c) => [c.id, c]));
  const defIdOf = (instId: Id) => open.childInstances.find((i) => i.id === instId)?.hardenId;

  const instPds = new Map<Id, Set<string>>();
  const addPd = (instId: Id, pd?: string) => { if (!pd) return; (instPds.get(instId) ?? instPds.set(instId, new Set()).get(instId)!).add(pd); };
  for (const w of wires) for (const cid of w.connectionIds) {
    const c = connById.get(cid); if (!c) continue;
    addPd(c.secondaryInstanceId, w.pd); addPd(c.clientInstanceId, w.pd);
  }

  const want = new Map<string, boolean>();
  for (const w of wires) for (const cid of w.connectionIds) {
    const c = connById.get(cid); if (!c) continue;
    for (const [instId, ifId] of [[c.secondaryInstanceId, c.secondaryInterfaceId], [c.clientInstanceId, c.clientInterfaceId]] as const) {
      if (ifId === w.sourceInterfaceId) continue;
      const defId = defIdOf(instId); if (!defId) continue;
      const own = instId === w.sourceInstanceId;
      want.set(`${defId}:${ifId}`, own ? false : (instPds.get(instId)?.size ?? 1) === 1);
    }
  }

  return {
    ...doc,
    library: { ...doc.library, defs: doc.library.defs.map((d) => {
      if (!d.interfaces.some((f) => want.has(`${d.id}:${f.id}`))) return d;
      return { ...d, interfaces: d.interfaces.map((f) => {
        const mo = want.get(`${d.id}:${f.id}`);
        return mo === undefined || f.busType !== "BISR" ? f : { ...f, pdMatchOnly: mo };
      }) };
    }) },
  };
}
```

> 若 `wire.ts` 顶部未 import `GenConnDocument`/`HardenDef`/`Id`，补进现有 `import type { ... } from "./core/model.ts";`（`addWire`/`mapOpenDef` 已用到这些类型，一般已在）。

- [ ] **Step 4: 跑测试，确认通过**

Run: `node --test tests/unit/genconn-bisr-pd.test.ts`
Expected: PASS（3 个 test 全绿）。

- [ ] **Step 5: `wireFromTree` 串 `pd`——改 opts 类型与 wire 创建**

在 `src/genconn/wire.ts`：

① 改 `wireFromTree` 签名（约 :225）的 `opts` 类型，加 `pd?`：

```ts
export function wireFromTree(doc: GenConnDocument, sourceInstId: Id, sourceIfId: Id, treeEdges: [Id, Id][], points: Pt[], opts?: { dropUnresolved?: boolean; pd?: string }): WireFromTreeResult {
```

② 改 wire 对象创建（约 :355），把 `pd` 写进去：

```ts
  const wire: BusWire = { id: `w_${rid()}`, busType, busWidth, pd: opts?.pd, sourceInstanceId: sourceInstId, sourceInterfaceId: sourceIfId, points, connectionIds: conns.map((c) => c.id) };
```

- [ ] **Step 6: `addWire` 加 `pd` 参数 + 收尾派生**

改 `addWire`（约 :360–375）：签名加 `pd?`，传进 `wireFromTree`，并在成功返回时包 `applyBisrMatchOnly`：

```ts
export function addWire(doc: GenConnDocument, sourceInstId: Id, sourceIfId: Id, points: Pt[], pd?: string): AddWireResult {
  const open = doc.library.defs.find((d) => d.id === doc.ui.openDefId);
  if (!open) return { doc, error: "无打开的 def" };
  const srcInst = open.childInstances.find((i) => i.id === sourceInstId);
  const srcDef = doc.library.defs.find((d) => d.id === srcInst?.hardenId);
  const dsIf = srcDef?.interfaces.find((f) => f.id === sourceIfId);
  if (!srcInst || !srcDef || !dsIf || !dsIf.isDataSource) return { doc, error: "起点不是 data source 接口" };

  const boxes = computeLayout(open, doc.library);
  const t = buildDrawnTree(boxes, sourceInstId, points);
  if ("error" in t) return { doc, error: t.error };
  const r = wireFromTree(doc, sourceInstId, sourceIfId, t.treeEdges, points, { pd });
  if (r.error) return { doc, error: r.error };
  if (r.unresolved?.length) return { doc, unresolved: r.unresolved };
  return { doc: applyBisrMatchOnly(r.doc), unresolved: [] };
}
```

- [ ] **Step 7: `removeWire` 收尾也派生**

改 `removeWire`（约 :378），把返回包一层 `applyBisrMatchOnly`（删线后重算，让下游 pdMatchOnly 回落）：

```ts
export function removeWire(doc: GenConnDocument, wireId: Id): GenConnDocument {
  return applyBisrMatchOnly(mapOpenDef(doc, (d) => {
    const w = (d.wires ?? []).find((x) => x.id === wireId);
    if (!w) return d;
    const ids = new Set(w.connectionIds);
    return { ...d, connections: d.connections.filter((c) => !ids.has(c.id)), wires: (d.wires ?? []).filter((x) => x.id !== wireId) };
  }));
}
```

- [ ] **Step 8: 全量单测 + 类型检查通过**

Run: `npm run test:unit`
Expected: PASS（新增 3 个 bisr-pd test 绿；既有 `genconn-wire.test.ts`/`genconn-datasource.test.ts` 仍绿——`pd` 可选、不破坏既有）。

Run: `npm run typecheck`
Expected: PASS。

- [ ] **Step 9: Commit**

```bash
git add src/genconn/wire.ts tests/unit/genconn-bisr-pd.test.ts
git commit -m "feat(genconn): 移植 applyBisrMatchOnly 派生 + wire 串 pd"
```

---

## Task 4: store 串 pd + onWirePin 传 pd

**Files:**
- Modify: `src/genconn/store.ts`（wire 草稿态 :125、`beginWire` 声明 :206 与实现 :545、`commitWire` 实现 :548）
- Modify: `src/genconn/CanvasView.tsx`（`onWirePin` 类型 :252、定义 :1026）

- [ ] **Step 1: wire 草稿态加 `pd`**

`src/genconn/store.ts` 约 :125：

```ts
  wire: { sourceInstId: Id; sourceIfId: Id; points: { x: number; y: number }[]; pd?: string } | null; // data source 拉线草稿（瞬态，不进 undo）
```

- [ ] **Step 2: `beginWire` 声明加 `pd`**

`src/genconn/store.ts` 约 :206：

```ts
  beginWire: (instId: Id, ifId: Id, at: { x: number; y: number }, pd?: string) => void;
```

- [ ] **Step 3: `beginWire` 实现写入 `pd`**

`src/genconn/store.ts` 约 :545：

```ts
  beginWire: (instId, ifId, at, pd) => set({ wire: { sourceInstId: instId, sourceIfId: ifId, points: [at], pd } }),
```

- [ ] **Step 4: `commitWire` 把 `pd` 传给 addWire**

`src/genconn/store.ts` 约 :551，`addWire(...)` 调用加 `s.wire.pd`：

```ts
      const r = addWire(s.doc, s.wire.sourceInstId, s.wire.sourceIfId, orthAppend(s.wire.points, at), s.wire.pd);
```

- [ ] **Step 5: `onWirePin` 类型加 `pd`**

`src/genconn/CanvasView.tsx` 约 :252：

```ts
  onWirePin: (instId: string, ifId: string, role: "out" | "in", at: { x: number; y: number }, pd?: string) => void;
```

- [ ] **Step 6: `onWirePin` 定义把 `pd` 传给 beginWire**

`src/genconn/CanvasView.tsx` 约 :1026：

```tsx
              onWirePin={(instId, ifId, role, at, pd) => {
                if (role === "out") { if (!wire) beginWire(instId, ifId, at, pd); }
                else if (wire) commitWire(instId, ifId, at);
              }}
```

- [ ] **Step 7: 类型检查通过**

Run: `npm run typecheck`
Expected: PASS（`pd` 处处可选；Bar 路径的 `onWirePin(...,role,at)` 4 参调用仍合法）。

- [ ] **Step 8: Commit**

```bash
git add src/genconn/store.ts src/genconn/CanvasView.tsx
git commit -m "feat(genconn): store/onWirePin 串 pd（beginWire→commitWire→addWire）"
```

---

## Task 5: 提取 `triPoints` 到 `layout.ts`（DRY）

**Files:**
- Modify: `src/genconn/layout.ts`（导出参数化 `triPoints`）
- Modify: `src/specgen/Workspace.tsx`（删本地 `triPoints` :78–85，改 import + 调用 :507/:513）

- [ ] **Step 1: 在 `layout.ts` 导出 `triPoints`**

`src/genconn/layout.ts` 文件末尾追加：

```ts
/** 三角脚顶点：root=脚根，d=方向单位向量，inward=true 尖朝 d（out 脚），false 尖朝 root（in 脚）；len=脚长，halfW=半宽。 */
export function triPoints(root: { x: number; y: number }, d: { dx: number; dy: number }, inward: boolean, len: number, halfW: number): number[] {
  const tip = inward ? { x: root.x + d.dx * len, y: root.y + d.dy * len } : root;
  const base = inward ? root : { x: root.x + d.dx * len, y: root.y + d.dy * len };
  const px = -d.dy, py = d.dx;
  return [base.x + px * halfW, base.y + py * halfW, base.x - px * halfW, base.y - py * halfW, tip.x, tip.y];
}
```

- [ ] **Step 2: specgen 删本地 `triPoints`、改 import**

`src/specgen/Workspace.tsx`：删掉本地函数 `function triPoints(root, d, inward) { ... }`（约 :78–85）。在顶部从 `layout.ts` 的现有 import 里补上 `triPoints`（该文件已 import `BUS_COLOR` 等）：

```ts
import { /* …现有… */ triPoints } from "../genconn/layout.ts";
```

- [ ] **Step 3: specgen 两处调用补 `len, halfW`（保持原值 pinLen=20, 半宽=5）**

`src/specgen/Workspace.tsx` :507 与 :513：

```tsx
                      <Line points={triPoints(g.pOut, g.dir, true, IFB.pinLen, 5)} closed fill={color}
```
```tsx
                      <Line points={triPoints(g.pIn, g.dir, false, IFB.pinLen, 5)} closed fill={color}
```

- [ ] **Step 4: 类型检查 + 全量单测通过（specgen 渲染语义不变）**

Run: `npm run typecheck && npm run test:unit`
Expected: PASS（几何完全等价，specgen 相关单测不变）。

- [ ] **Step 5: Commit**

```bash
git add src/genconn/layout.ts src/specgen/Workspace.tsx
git commit -m "refactor(genconn): triPoints 提取到 layout.ts 供 genconn/specgen 共用"
```

---

## Task 6: 重写内部 data source 渲染为通道卡片

**Files:**
- Modify: `src/genconn/CanvasView.tsx`（删本地 `OTHER_LABEL` :25、加 import、重写 `placement==="other"` 块 :368–416）

- [ ] **Step 1: 删本地 `OTHER_LABEL`、加 import**

`src/genconn/CanvasView.tsx`：删掉第 25 行 `const OTHER_LABEL: Record<string, string> = { ... };`。在文件顶部 import 区加：

```ts
import { dataSourceChannels, isPrimaryDataSource, DS_LABEL } from "./dataSource.ts";
```

并把 `layout.ts` 的现有 import 补上 `triPoints`（该文件已从 `./layout.ts` import 若干符号）：

```ts
import { /* …现有… */ triPoints } from "./layout.ts";
```

- [ ] **Step 2: 处理旧 `OTHER_LABEL` 的其它引用（条外小 ◆ 标签）**

搜索 `OTHER_LABEL`：`rg -n OTHER_LABEL src/genconn/CanvasView.tsx`。第 402 行 `text={"◆" + (i.busType === "JTAG1838" ? busTypeLabel(...) : OTHER_LABEL[i.busType])}` 在 Step 3 整块被替换，无需单独改；若还有别处引用，改成 `DS_LABEL[i.busType]`。

- [ ] **Step 3: 重写 `placement==="other"` 渲染块**

把 `src/genconn/CanvasView.tsx` 约 :368–416 的整个 `{(def?.interfaces ?? []).filter((i) => i.placement === "other" ...).map((i) => { ... })}` 块，替换为：

```tsx
      {/* placement=other 内部 data source：specgen 三角芯片卡片，每通道一行 ▶out/◀in。组成员只由 primary 渲染。 */}
      {(def?.interfaces ?? [])
        .filter((i) => i.placement === "other"
          && layerStateOf(i.busType, activeLayer, hiddenLayers) !== "hidden"
          && (!i.isDataSource || isPrimaryDataSource(i, def!)))  // 非 DS 的内部节点(JTAG1838 secondary)也画，只是无引脚
        .map((i) => {
          const pos = i.innerPos ?? { x: 40, y: 40 };
          const color = BUS_COLOR[i.busType];
          const otherDim = layerStateOf(i.busType, activeLayer, hiddenLayers) === "dim";
          const channels = i.isDataSource ? dataSourceChannels(i, def!) : [];  // 非 DS → 无通道、无引脚
          const HEADER = 18, ROW = 16, W = 128, PADB = 6, PIN = 7, HALF = 4;
          const H = HEADER + channels.length * ROW + PADB;
          const otherBound = function (this: Konva.Node, p: { x: number; y: number }) {
            const parent = this.getParent();
            if (!parent) return p;
            const at = parent.getAbsoluteTransform();
            const local = at.copy().invert().point(p);
            const cx = Math.max(0, Math.min(vbox.w - W, local.x));
            const cy = Math.max(0, Math.min(vbox.h - H, local.y));
            return at.point({ x: cx, y: cy });
          };
          const world = (lx: number, ly: number) => ({ x: vbox.x + pos.x + lx, y: vbox.y + pos.y + ly });
          return (
            <Group
              key={i.id}
              x={pos.x}
              y={pos.y}
              opacity={otherDim ? 0.25 : 1}
              listening={!otherDim}
              draggable
              dragBoundFunc={otherBound}
              onDragStart={(e) => { e.cancelBubble = true; }}
              onDragMove={(e) => { e.cancelBubble = true; }}
              onDragEnd={(e) => { e.cancelBubble = true; onSetInnerPos(i.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) }); }}
              onMouseDown={(e) => { e.cancelBubble = true; }}
              onClick={(e) => { e.cancelBubble = true; onBarClick(i.id, i.role, e.evt.ctrlKey || e.evt.metaKey); }}
              onDblClick={i.isDataSource ? (e) => { e.cancelBubble = true; onToggleFlip(i.id, !i.dsFlip); } : undefined}
            >
              <Rect x={0} y={0} width={W} height={H} fill={hexTint(color, 0.88)} stroke={color} strokeWidth={1.5} cornerRadius={6} />
              <Text x={7} y={3} text={i.busType === "JTAG1838" ? busTypeLabel(i.busType, i.role) : DS_LABEL[i.busType]} fontSize={11} fontStyle="bold" fill={color} listening={false} />
              {channels.map((ch, k) => {
                const cy = HEADER + k * ROW + ROW / 2;
                // out(绿) 与 in(蓝) 都贴右缘；dsFlip 交换二者水平次序
                const outRoot = i.dsFlip ? { x: W - 4, y: cy } : { x: W - 16, y: cy };
                const inRoot = i.dsFlip ? { x: W - 16, y: cy } : { x: W - 4, y: cy };
                const outD = { dx: 1, dy: 0 };   // ▶ 尖朝右（信号离开）
                const inD = { dx: 1, dy: 0 };    // ◀ 尖在 root、base 朝右
                return (
                  <Group key={ch.key}>
                    <Text x={7} y={cy - 6} width={W - 40} text={ch.label} fontSize={9} fill={ch.color} wrap="none" ellipsis listening={false} />
                    <Line points={triPoints(outRoot, outD, true, PIN, HALF)} closed fill={colors.pair} hitStrokeWidth={10}
                      onMouseDown={(e) => { e.cancelBubble = true; if (!wiring) onWirePin(vbox.instanceId, ch.ifId, "out", world(outRoot.x + PIN, cy), ch.pd); }}
                      onClick={(e) => { e.cancelBubble = true; }} />
                    <Line points={triPoints(inRoot, inD, false, PIN, HALF)} closed fill={colors.accent} hitStrokeWidth={10}
                      onMouseDown={(e) => { e.cancelBubble = true; if (wiring) onWirePin(vbox.instanceId, ch.ifId, "in", world(inRoot.x, cy)); }}
                      onClick={(e) => { e.cancelBubble = true; }} />
                  </Group>
                );
              })}
            </Group>
          );
        })}
```

> 说明：颜色 `colors.pair`(绿 out)/`colors.accent`(蓝 in) 沿用原 data source 引脚配色；`onBarClick`/`onSetInnerPos`/`onToggleFlip`/`vbox`/`wiring`/`busTypeLabel` 均是原块已在作用域/已 import 的同名 prop/变量/函数（`busTypeLabel` 原第 402 行就在用，勿删其 import）。像素常量（`W/HEADER/ROW/PIN`）为初值，Step 5 视觉核验时可微调。非 DS 内部节点（JTAG1838 secondary）走同一卡片、`channels=[]` → 只有标题、无引脚，与旧行为一致。

- [ ] **Step 4: 类型检查通过**

Run: `npm run typecheck`
Expected: PASS。若报 `def` 可能为 undefined，用 `def!`（该 map 位于 `def` 已存在的渲染分支内，与原块一致）。

- [ ] **Step 5: 构建 + e2e 视觉核验**

Run: `npm run test:e2e`
Expected: PASS（既有 genconn 放置/连线 e2e 不回归）。手动核验：放一个 BISR data source 设 `pdList=[pd0,pd1,pd2]` → 卡片显示三行、每行 `pd? ▶◀`、卡片随行数变高、文字不溢出；共享 tap（Task 7 建好后）显示 ijtag/1838/bscan 三行。

- [ ] **Step 6: Commit**

```bash
git add src/genconn/CanvasView.tsx
git commit -m "feat(genconn): 内部 data source 重绘为通道卡片（每行 out/in，复用 triPoints）"
```

---

## Task 7: Inspector —— 下拉改名 + PD chip 编辑 + 共享 tap 入口

**Files:**
- Modify: `src/genconn/store.ts`（新增 `createSharedTap` 声明与实现）
- Modify: `src/genconn/Inspector.tsx`（下拉 :249、加 PD chip 编辑与共享 tap 按钮、import）

- [ ] **Step 1: store 加 `createSharedTap` 声明**

`src/genconn/store.ts`，在 `setInterfacePlacement` 声明（约 :167）附近加：

```ts
  /** 把当前 def 里所有 ijtag/jtag1838/bscan 的内部 data source 接口合并到同一 dsGroupId（<2 个则抛错）。 */
  createSharedTap: (defId: Id) => void;
```

- [ ] **Step 2: store 加 `createSharedTap` 实现**

`src/genconn/store.ts`，在 `setInterfacePlacement` 实现（约 :385）附近加：

```ts
  createSharedTap: (defId) => set((s) => {
    const def = s.doc.library.defs.find((d) => d.id === defId);
    if (!def) throw new Error("无此 def");
    const members = def.interfaces.filter((f) => f.isDataSource && f.placement === "other"
      && (f.busType === "IJTAG" || f.busType === "JTAG1838" || f.busType === "BSCAN"));
    if (members.length < 2) throw new Error("共享 tap 需要至少 2 个 ijtag/jtag1838/bscan 内部 data source");
    const gid = `tap_${Math.random().toString(36).slice(2, 8)}`;
    const ids = new Set(members.map((f) => f.id));
    const pos = members[0].innerPos ?? { x: 40, y: 40 };
    return {
      doc: {
        ...s.doc,
        library: { ...s.doc.library, defs: s.doc.library.defs.map((d) => d.id !== defId ? d : {
          ...d, interfaces: d.interfaces.map((f) => ids.has(f.id) ? { ...f, dsGroupId: gid, innerPos: pos } : f),
        }) },
      },
      dirty: true,
    };
  }),
```

> `Math.random()` 仅用于生成分组 id，不影响生成/回放（`dsGroupId` 是纯视图字段）。

- [ ] **Step 3: Inspector import DS_LABEL / usedPdNames / createSharedTap**

`src/genconn/Inspector.tsx` 顶部加：

```ts
import { DS_LABEL, usedPdNames } from "./dataSource.ts";
```

并在组件里取 store 动作（与现有 `setInterfacePlacement` 取法一致，约在选中接口的渲染函数内）：

```ts
  const createSharedTap = useStore((s) => s.createSharedTap);
```

- [ ] **Step 4: 下拉选项改名（用 DS_LABEL，去掉 `other（盒内：…）`）**

`src/genconn/Inspector.tsx` :248–249，替换两个 `<option>`：

```tsx
              <option value="pin">pin（边上）</option>
              <option value="other">{DS_LABEL[iface.busType]}（内部）</option>
```

- [ ] **Step 5: 加「PD 列表」chip 编辑（仅 BISR 内部 data source）**

在摆放 `InspectorField` 之后（约 :252 的 `)}` 后）插入。先在文件里加一个轻量 chip 输入组件（放在 `Inspector.tsx` 内、`export function Inspector` 之前）：

```tsx
function PdChips({ value, options, onChange }: { value: string[]; options: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const v = raw.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setText("");
  };
  return (
    <div className="pd-chips">
      <div className="pd-chip-row">
        {value.map((pd) => (
          <span key={pd} className="pd-chip">{pd}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== pd))}>×</button>
          </span>
        ))}
      </div>
      <input
        list="pd-name-options"
        value={text}
        placeholder="pd 名 + 回车"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(text); } }}
        onBlur={() => add(text)}
      />
      <datalist id="pd-name-options">{options.map((o) => <option key={o} value={o} />)}</datalist>
    </div>
  );
}
```

> `useState` 若未 import，在 `Inspector.tsx` 顶部 `import { useState } from "react";`（或并入现有 react import）。

然后在选中接口的渲染里、摆放字段之后插入使用：

```tsx
        {iface.busType === "BISR" && iface.isDataSource && iface.placement === "other" && (
          <InspectorField label="PD 列表">
            <PdChips
              value={iface.pdList ?? []}
              options={usedPdNames(doc.library.defs)}
              onChange={(next) => patch({ pdList: next.length ? next : undefined })}
            />
          </InspectorField>
        )}
```

- [ ] **Step 6: 加「共享 tap」按钮（当前接口是 ijtag/jtag1838/bscan 内部 data source 时）**

在 PD 列表字段之后插入：

```tsx
        {iface.isDataSource && iface.placement === "other"
          && (iface.busType === "IJTAG" || iface.busType === "JTAG1838" || iface.busType === "BSCAN") && (
          <InspectorField label="共享 tap">
            <button type="button" onClick={() => guard(() => createSharedTap(idef.id))}>
              + 合并 ijtag/1838/bscan 为同一 tap
            </button>
          </InspectorField>
        )}
```

- [ ] **Step 7: 加最小 chip 样式**

在 `src/genconn/styles.css`（或该模块现有样式文件；若不确定用 `rg -l "insp-actions" src/genconn`）末尾加：

```css
.pd-chips { display: flex; flex-direction: column; gap: 4px; }
.pd-chip-row { display: flex; flex-wrap: wrap; gap: 4px; }
.pd-chip { display: inline-flex; align-items: center; gap: 3px; padding: 1px 4px; border-radius: 4px; background: #f2f4f7; font-size: 12px; }
.pd-chip button { border: 0; background: transparent; cursor: pointer; line-height: 1; }
```

- [ ] **Step 8: 类型检查通过**

Run: `npm run typecheck`
Expected: PASS。

- [ ] **Step 9: 构建 + e2e + 手动核验**

Run: `npm run test:e2e`
Expected: PASS（无回归）。手动：选 BISR 内部 data source → 见「PD 列表」chip，输入 pd0/pd1 回车成为 chip、× 可删、输入框有已用 pd 补全；卡片同步长出对应行。放两个 ijtag+bscan 内部 data source → 点「共享 tap」→ 合成一张卡（两行）。

- [ ] **Step 10: Commit**

```bash
git add src/genconn/store.ts src/genconn/Inspector.tsx src/genconn/styles.css
git commit -m "feat(genconn): Inspector 下拉改名 + PD chip 编辑 + 共享 tap 入口"
```

---

## Task 8: 总验收

**Files:** 无（仅跑门禁）

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: PASS（`typecheck` + 全部 `test:unit`，含新增 2 个测试文件）。

- [ ] **Step 2: e2e**

Run: `npm run test:e2e`
Expected: PASS。

- [ ] **Step 3: 逐条核对 spec §8 验收点**

对照 `docs/specs/2026-07-15-datasource-unified-visual-design.md` §8：
- `dsGroupId` N 成员归一成 channels ✅（Task 2 test）
- `pdList` → N 行 out/in ✅（Task 2 test + Task 6 渲染）
- pd 派生三态（源进名 / 下游 1pd 只匹配 / 下游 ≥2pd 进名）✅（Task 3 test）
- 下拉 label 单一来源 ✅（DS_LABEL）
- chip 输入去重/补全 ✅（Task 7 手动）
- 卡片随通道变高、不溢出、可拖 ✅（Task 6 手动/e2e）

- [ ] **Step 4: 收尾 commit（若有零散改动）**

```bash
git status
# 若干净则跳过；否则：
git add -A && git commit -m "chore(genconn): data source 统一视觉收尾"
```

---

## 待核（开工前确认，spec §7 / D5）

**dft-core C++ genconn 生成的 pd 对齐**：本计划让 `wire.ts` 给接口填 `powerDomain`/`pdMatchOnly`（改**模型**），TS 与 C++ 两侧 expand 都消费同一模型。若 C++ `genconn-core/expand.cpp` 已有等价 `pdPrefix`（`powerDomain && !pdMatchOnly ? "<pd>_" : ""`），则真源自动对齐、无需额外任务；否则另起一轮补 C++。**在 Task 3 前 `rg -n "pdPrefix|powerDomain|pdMatchOnly" ../dft-core/**/expand.cpp` 核对一次。**
