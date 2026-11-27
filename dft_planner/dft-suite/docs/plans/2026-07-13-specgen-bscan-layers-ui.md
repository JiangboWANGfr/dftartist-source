# SpecGen 同步（UI-first）：BScan 目录 + 图层 + 删除同步 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 newProject（`master`，反馈轮 `867f90b` 为止）的三块 UI/model 工作同步进 dft-suite：genconn 删子实例即时同步 specgen 的 DesignInstance；总线图层下拉抽成共享组件并修「点画布不关闭」；specgen 画布/调色板接入图层门控 + BScan（EBScanPipeline）节点。**不含** BScan 的 C++ 生成（Phase B，另开）。

**Architecture:** genconn 与 specgen 共享同一个 zustand store（`src/genconn/store.ts`）与同一份 `doc: GenConnDocument`。图层状态 `activeLayer/hiddenLayers` 已在 store 里；本计划只补：删除同步动作、共享 `LayerMenu` 组件（含点外关闭）、specgen 画布按每节点/连线的总线层做三态门控（hidden 不画 / dim 变灰锁定 / normal），DesignInstance 跨层恒可见。BScan 节点只进 `doc`（`dftIps`），生成留给 Phase B。

**Tech Stack:** TypeScript + React + react-konva；zustand + zundo；测试 `node --test`（`tests/unit/*.test.ts`）+ Playwright（`tests/e2e`）。

**参照真源：** `newProject/src/ui/{LayerMenu.tsx,SpecGenTab.tsx,Toolbar.tsx,DftIpNode.tsx}`、`newProject/src/dft/catalog.ts`、`newProject/test/dft-delete-sync.test.ts`。设计文档：`docs/specs/2026-07-13-specgen-bscan-layers-sync-design.md`。

**分支：** 已在 `feat/specgen-bscan-layers-ui`（spec 已提交）。不 push、不 merge —— 合并时机留给用户。

---

## Task 1: A1 — genconn 删子实例即时同步 specgen DesignInstance（bug 修复，TDD）

**Files:**
- Test: `tests/unit/genconn-store-delete-sync.test.ts`（新建）
- Modify: `src/genconn/store.ts:364-370`（`deleteInstance` 动作）

`dftSyncDesignInstances` 已在 store 顶部 import（`store.ts:63`），无需新增 import。

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/genconn-store-delete-sync.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { useStore } from "../../src/genconn/store.ts";
import { addToSpecgen, syncDesignInstances } from "../../src/specgen/edit.ts";
import type { GenConnDocument, HardenDef } from "../../src/genconn/core/model.ts";

function docWithChild(): GenConnDocument {
  const pb: HardenDef = {
    id: "pbdef", designName: "core", designLevel: "physical_block", designType: "hierarchical",
    interfaces: [], childInstances: [], connections: [],
  };
  const root: HardenDef = {
    id: "p", designName: "p", designLevel: "chip", designType: "hierarchical",
    interfaces: [], childInstances: [{ id: "ci1", instanceName: "core_inst", hardenId: "pbdef" }], connections: [],
  };
  return {
    schemaVersion: 1, library: { defs: [root, pb] }, ui: { openDefId: "p", rootDefId: "p" },
    ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1,
  };
}

// #3 回归：SpecGen 工作区未挂载时，在 genconn 删子实例，deleteInstance 应立即清掉对应自动 DesignInstance，
// 而不是等切回 SpecGen 才由其 useEffect sync。
test("deleteInstance：删子实例立即清掉对应 DesignInstance（不必切回 SpecGen）", () => {
  let doc = addToSpecgen(docWithChild(), "p");
  doc = syncDesignInstances(doc, "p");
  const top0 = doc.library.defs.find((d) => d.id === "p")!;
  assert.equal((top0.dftIps ?? []).length, 1, "前置：已同步出 1 个 DesignInstance");

  useStore.setState({ doc });
  useStore.getState().deleteInstance("ci1");

  const top = useStore.getState().doc.library.defs.find((d) => d.id === "p")!;
  assert.equal(top.childInstances.length, 0, "子实例已删");
  assert.equal((top.dftIps ?? []).length, 0, "对应 DesignInstance 应被立即清掉（回归 #3）");
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `node --test tests/unit/genconn-store-delete-sync.test.ts`
Expected: FAIL —— 断言「对应 DesignInstance 应被立即清掉」失败，`dftIps` 仍为 1（当前 `deleteInstance` 不跑 sync）。

- [ ] **Step 3: 改 `deleteInstance` 加同步循环**

`src/genconn/store.ts`，把 `deleteInstance`（现 364-370）整体替换为：

```ts
  deleteInstance: (instId) =>
    set((s) => {
      let doc = editDelete(s.doc, instId);
      // 删子实例后立即清理各 SpecGen scope 的自动 DesignInstance（SpecGen 工作区未挂载时其 useEffect 不跑，否则要等切回 SpecGen 才删）。
      for (const d of doc.library.defs) if (d.inSpecgen) doc = dftSyncDesignInstances(doc, d.id);
      return {
        doc,
        dirty: true,
        selectedIds: s.selectedIds.filter((i) => i !== instId),
        selection: s.selection.id === instId ? { kind: null, id: null } : s.selection,
      };
    }),
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `node --test tests/unit/genconn-store-delete-sync.test.ts`
Expected: PASS（2 断言全绿）。

- [ ] **Step 5: 提交**

```bash
git add tests/unit/genconn-store-delete-sync.test.ts src/genconn/store.ts
git commit -m "fix(genconn): 删子实例即时同步 specgen DesignInstance（不必切回 SpecGen）"
```

---

## Task 2: A5 — catalog 加 EBScanPipeline + catalogBus（TDD）

**Files:**
- Modify: `src/genconn/core/dft-model.ts:5-8`（`DftIpType` 联合）
- Modify: `src/specgen/catalog.ts`（`DftCatalogEntry` 加 `bus?`、加 EBScanPipeline 条目、加 `catalogBus`）
- Test: `tests/unit/specgen-catalog.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/specgen-catalog.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogEntry, catalogBus, dftIpSize } from "../../src/specgen/catalog.ts";

test("catalogBus：EBScanPipeline→BSCAN，其余→SSN（缺省）", () => {
  assert.equal(catalogBus("EBScanPipeline"), "BSCAN");
  assert.equal(catalogBus("ScanHost"), "SSN");
  assert.equal(catalogBus("DesignInstance"), "SSN");
});

test("EBScanPipeline catalog 条目：abbr/bus/端口/尺寸齐全", () => {
  const e = catalogEntry("EBScanPipeline");
  assert.equal(e.abbr, "EBP");
  assert.equal(e.bus, "BSCAN");
  assert.equal(e.group, "datapath");
  assert.deepEqual(e.ports.map((p) => p.name), ["scan_in", "scan_out", "bscan_clock"]);
  assert.deepEqual(dftIpSize("EBScanPipeline"), { w: 100, h: 40 });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `node --test tests/unit/specgen-catalog.test.ts`
Expected: FAIL —— `catalogBus` 不存在（import 报错 / 运行时抛），`catalogEntry("EBScanPipeline")` 抛 unknown type。

- [ ] **Step 3: 加 `EBScanPipeline` 到 `DftIpType`**

`src/genconn/core/dft-model.ts`，把 `DftIpType`（现 5-8）改为：

```ts
export type DftIpType =
  | "Pipeline" | "ScanHost" | "OutputPipeline" | "Receiver1xPipeline"
  | "Multiplexer" | "Fifo" | "BusFrequencyDivider" | "BusFrequencyMultiplier" | "DesignInstance"
  | "Edt" | "EBScanPipeline";
```

- [ ] **Step 4: catalog 加 `bus?` 字段 + EBScanPipeline 条目 + catalogBus**

`src/specgen/catalog.ts`：

(a) `DftCatalogEntry` 接口加 `bus?`：

```ts
export interface DftCatalogEntry { ipType: DftIpType; label: string; abbr: string; group: "datapath" | "other"; bus?: "SSN" | "BSCAN"; ports: DftPort[]; }
```

(b) 在 `DFT_CATALOG` 数组里、`Edt` 条目**之后**追加：

```ts
  {
    ipType: "EBScanPipeline", label: "EBScanPipeline", abbr: "EBP", group: "datapath", bus: "BSCAN",
    ports: [
      { name: "scan_in", dir: "in", side: "left", role: "data" },
      { name: "scan_out", dir: "out", side: "right", role: "data" },
      { name: "bscan_clock", dir: "in", side: "top", role: "clock" },
    ],
  },
```

(c) 在 `catalogEntry` 函数**之前**（或之后）加：

```ts
/** DFT IP 所属总线层（缺省 SSN）：给调色板分组 + 图层门控用。 */
export function catalogBus(ipType: DftIpType): "SSN" | "BSCAN" {
  return catalogEntry(ipType).bus ?? "SSN";
}
```

- [ ] **Step 5: 跑测试 + typecheck，确认通过**

Run: `node --test tests/unit/specgen-catalog.test.ts && npm run typecheck`
Expected: 测试 PASS；tsc 无报错。

- [ ] **Step 6: 提交**

```bash
git add src/genconn/core/dft-model.ts src/specgen/catalog.ts tests/unit/specgen-catalog.test.ts
git commit -m "feat(specgen): catalog 加 EBScanPipeline(BSCAN 层) + catalogBus 助手"
```

---

## Task 3: A2+A3 — 抽出共享 LayerMenu 组件（含点画布/外部关闭）+ genconn Toolbar 改用

**Files:**
- Create: `src/genconn/LayerMenu.tsx`
- Modify: `src/genconn/Toolbar.tsx`（删内联下拉 + 相关 state/imports，换成 `<LayerMenu />`）

组件是纯 React（无 Konva/无 node --test 覆盖），验证走 `typecheck` + Task 5 的 e2e/人工。

- [ ] **Step 1: 新建 `src/genconn/LayerMenu.tsx`**

移植自 newProject `src/ui/LayerMenu.tsx`，并**新增**点组件外（含画布）/ Esc 关闭（newProject 无此行为——本次改进）：

```tsx
// 总线图层下拉：全部 + 4 层（逐层选活动层 + 👁 显隐）。genconn Toolbar 与 SpecGen 共用同一个，保证行为一致。
// 打开后点组件外（含 Konva 画布）或按 Esc → 关闭。
import { useEffect, useRef, useState } from "react";
import { useStore } from "./store.ts";
import { BUS_LAYERS } from "./layers.ts";
import { BUS_COLOR } from "./layout.ts";

export function LayerMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const activeLayer = useStore((s) => s.activeLayer);
  const hiddenLayers = useStore((s) => s.hiddenLayers);
  const setActiveLayer = useStore((s) => s.setActiveLayer);
  const toggleLayerHidden = useStore((s) => s.toggleLayerHidden);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button className={activeLayer || hiddenLayers.size ? "active" : ""} onClick={() => setOpen((v) => !v)} title="总线图层：选活动层专注（其余变灰锁定）+ 逐层显隐">图层 ▾</button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 20, background: "#fff", border: "1px solid #d0d5dd", borderRadius: 6, padding: 4, minWidth: 170, boxShadow: "0 4px 12px rgba(0,0,0,.12)" }}>
          <div onClick={() => setActiveLayer(null)} style={{ padding: "4px 8px", cursor: "pointer", fontWeight: activeLayer === null ? 700 : 400 }}>{activeLayer === null ? "● " : "○ "}全部</div>
          {BUS_LAYERS.map((bt) => {
            const hidden = hiddenLayers.has(bt);
            return (
              <div key={bt} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px" }}>
                <span onClick={() => setActiveLayer(bt)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flex: 1, fontWeight: activeLayer === bt ? 700 : 400, textDecoration: hidden ? "line-through" : "none", color: hidden ? "#98a2b3" : "#111" }}>
                  {activeLayer === bt ? "● " : "○ "}<span style={{ width: 10, height: 10, background: BUS_COLOR[bt], borderRadius: 2, display: "inline-block" }} />{bt}
                </span>
                <span onClick={() => toggleLayerHidden(bt)} style={{ cursor: "pointer" }} title={hidden ? "显示该层" : "隐藏该层"}>{hidden ? "🚫" : "👁"}</span>
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 2: genconn Toolbar 改用 `<LayerMenu />`，删内联下拉与孤儿引用**

`src/genconn/Toolbar.tsx`：

(a) 顶部 import：删掉 `import { BUS_LAYERS } from "./layers.ts";`（行 8）与 `import { BUS_COLOR } from "./layout.ts";`（行 9），改为加一行 `import { LayerMenu } from "./LayerMenu.tsx";`。

(b) 删掉这些现在没用到的选择器/状态（行 22-26）：
```ts
  const activeLayer = useStore((s) => s.activeLayer);
  const hiddenLayers = useStore((s) => s.hiddenLayers);
  const setActiveLayer = useStore((s) => s.setActiveLayer);
  const toggleLayerHidden = useStore((s) => s.toggleLayerHidden);
  const [layerOpen, setLayerOpen] = useState(false);
```
（`useState` 仍被 `fileOpen` 用，保留该 import。）

(c) 把内联下拉块（现 82-100 整段 `<span style={{ position: "relative"...}}> ... </span>`）整体替换为：
```tsx
      <LayerMenu />
```

- [ ] **Step 3: typecheck，确认无孤儿/无报错**

Run: `npm run typecheck`
Expected: PASS（若 `noUnusedLocals` 生效，任何漏删的 `activeLayer` 等会在此报错——按报错清干净）。

- [ ] **Step 4: 提交**

```bash
git add src/genconn/LayerMenu.tsx src/genconn/Toolbar.tsx
git commit -m "refactor(genconn): 图层下拉抽成共享 LayerMenu（+点画布/Esc 关闭）"
```

---

## Task 4: A4 — specgen 画布接入图层门控 + 调色板 BScan 分组 + LayerMenu

**Files:**
- Modify: `src/specgen/DftIpNode.tsx`（加 `dim` prop → 变灰 + 不可交互）
- Modify: `src/specgen/Workspace.tsx`（imports、读 store、wireBus 助手、调色板门控、scopebar 放 LayerMenu、bars/wires/nodes 三态门控）

- [ ] **Step 1: DftIpNode 加 `dim` prop**

`src/specgen/DftIpNode.tsx`：

(a) 参数解构（行 17）加 `dim`：
```tsx
export function DftIpNode({ ip, selected, wiring, dim, dropHover, onSelect, onMove, onDragMove, onOpenConfig, onPortDown, onSlotEnter, onSlotLeave, onBodyEnter, onBodyLeave, onContextMenu }: {
```
(b) 类型（行 18 `wiring: boolean;` 后）加：
```tsx
  dim?: boolean;              // 非活动图层：变灰 + 不可交互
```
(c) 根 `<Group>`（行 48）加 `opacity`/`listening`：
```tsx
    <Group x={ip.position.x} y={ip.position.y} draggable opacity={dim ? 0.25 : 1} listening={!dim}
```

- [ ] **Step 2: Workspace imports + 读图层状态 + wireBus 助手**

`src/specgen/Workspace.tsx`：

(a) 在 catalog import（行 12）加 `catalogBus`：
```tsx
import { DFT_CATALOG, catalogEntry, catalogBus } from "./catalog.ts";
```
(b) 新增两行 import（放在 layout import 之后）：
```tsx
import { layerStateOf, type BusType } from "../genconn/layers.ts";
import { LayerMenu } from "../genconn/LayerMenu.tsx";
```
（`BUS_COLOR` 已从 `../genconn/layout.ts` 导入，`DftWire` 已导入，无需再加。）

(c) 在 `deleteDftIp` 等 `useStore` 选择器附近，加两个图层状态选择器：
```tsx
  const activeLayer = useStore((s) => s.activeLayer);
  const hiddenLayers = useStore((s) => s.hiddenLayers);
```

(d) 在 `scope` 定义（`const scope: HardenDef | undefined = ...`，约行 167）**之后**加 `wireBus` 助手：
```tsx
  // 图层门控（纯视图）：接口按 busType、IP 按 catalog bus；wire 无 busType 字段 → 由端点推导（接口优先，否则 IP 的 catalog bus；DI 跨层跳过）。
  const wireBus = (w: DftWire): BusType => {
    for (const ep of [w.from, w.to]) if (ep.kind === "iface") { const f = scope?.interfaces.find((x) => x.id === ep.interfaceId); if (f) return f.busType; }
    for (const ep of [w.from, w.to]) if (ep.kind === "ip") { const i = scope?.dftIps?.find((x) => x.id === ep.ipId); if (i && i.ipType !== "DesignInstance") return catalogBus(i.ipType); }
    return "SSN";
  };
```

- [ ] **Step 3: 调色板按图层门控 + BScan 分组**

`src/specgen/Workspace.tsx`，把 `<div className="dft-palette">…</div>`（现约 311-322）整体替换为：

```tsx
      <div className="dft-palette">
        {(activeLayer === null || activeLayer === "SSN") && (<>
          <div className="dft-head">SSN DataPath</div>
          {DFT_CATALOG.filter((e) => e.group === "datapath" && (e.bus ?? "SSN") !== "BSCAN").map((e) => (
            <div key={e.ipType} className="dft-item" title={`加一个 ${e.label}`} onClick={() => scope && addDftIp(scope.id, e.ipType)}>
              ⬡ {e.label}
            </div>
          ))}
          <div className="dft-head">其他 DFT IP</div>
          {DFT_CATALOG.filter((e) => e.group === "other").map((e) => (
            <div key={e.ipType} className="dft-item" title={`加一个 ${e.label}`} onClick={() => scope && addDftIp(scope.id, e.ipType)}>
              ⬡ {e.label}
            </div>
          ))}
        </>)}
        {(activeLayer === null || activeLayer === "BSCAN") && (<>
          <div className="dft-head" style={{ color: BUS_COLOR.BSCAN }}>BScan</div>
          {DFT_CATALOG.filter((e) => e.bus === "BSCAN").map((e) => (
            <div key={e.ipType} className="dft-item" title={`加一个 ${e.label}`} onClick={() => scope && addDftIp(scope.id, e.ipType)}>
              ⬡ {e.label}
            </div>
          ))}
        </>)}
      </div>
```

- [ ] **Step 4: scopebar 放 `图层：` + `<LayerMenu />`**

同文件 `dft-scopebar` 内，在 `<button className="gen-dftspec" …>` **之前**插入：

```tsx
          <span style={{ marginLeft: 12, color: "#667085" }}>图层：</span>
          <LayerMenu />
```

- [ ] **Step 5: 接口块 bars 三态门控**

在 `bars.map((bar) => {` 后（现约 395 前的那一行 `const g = ifaceGeom(...)` 之上），加门控；并给该 bar 的根 `<Group key={bar.interfaceId}>` 加 `opacity`/`listening`。改成：

```tsx
                {bars.map((bar) => {
                  const ls = layerStateOf(bar.busType, activeLayer, hiddenLayers); // 图层三态
                  if (ls === "hidden") return null;
                  const g = ifaceGeom(bar, backdropBox);
```
并把 `<Group key={bar.interfaceId}>` 改为：
```tsx
                    <Group key={bar.interfaceId} opacity={ls === "dim" ? 0.25 : 1} listening={ls !== "dim"}>
```

- [ ] **Step 6: 连线 wires 三态门控**

在 `(scope.dftWires ?? []).map((w) => {` 里，`if (!pq) return null;` **之后**加：
```tsx
                  const wls = layerStateOf(wireBus(w), activeLayer, hiddenLayers); // 图层三态
                  if (wls === "hidden") return null;
```
把主 `<Arrow points={mainPts}` 那行改为带 opacity/listening：
```tsx
                    <Arrow
                      points={mainPts}
                      opacity={wls === "dim" ? 0.25 : 1} listening={wls !== "dim"}
```
把段拖拽 handle 的条件 `{sel && segmentsOf(flat).map(...` 改为 `{sel && wls !== "dim" && segmentsOf(flat).map(...`（dim 态不给拖拽 handle）。

- [ ] **Step 7: 节点 nodes 三态门控（DI 跨层恒可见）**

把 `{scope?.dftIps?.map((ip) => (` … `))}`（现 476-497）改为带门控的 block 形式：

```tsx
                {scope?.dftIps?.map((ip) => {
                  // DesignInstance 跨层（子块可在任意扫描网络）→ 恒 normal，不随图层变灰/隐藏。
                  const ls = ip.ipType === "DesignInstance" ? "normal" : layerStateOf(catalogBus(ip.ipType), activeLayer, hiddenLayers);
                  if (ls === "hidden") return null;
                  return (
                  <DftIpNode key={ip.id} ip={ip} selected={selectedDftIp === ip.id}
                    dim={ls === "dim"}
                    wiring={!!dftWire}
                    dropHover={dftWire && wireHover?.kind === "ip" && wireHover.ipId === ip.id ? wireHover.port : null}
                    onSelect={() => selectDftIp(ip.id)}
                    onOpenConfig={() => openConfigDialog(ip.id)}
                    onDragMove={(p) => setDragPos({ ipId: ip.id, x: p.x, y: p.y })}
                    onMove={(p) => { setDragPos(null); moveDftIp(scope.id, ip.id, p); }}
                    onPortDown={(ep, at) => { if (!dftWire) dftBeginWire(ep, at); }}
                    onSlotEnter={(ep) => setWireHover(ep)}
                    onSlotLeave={() => setWireHover(null)}
                    onBodyEnter={() => {
                      if (ip.ipType === "Multiplexer") { setMuxHover(ip.id); return; }
                      const plainIn = catalogEntry(ip.ipType).ports.find((p) => p.dir === "in" && p.role !== "clock" && p.role !== "master" && p.role !== "secondary");
                      if (plainIn) setWireHover({ kind: "ip", ipId: ip.id, port: plainIn.name });
                    }}
                    onBodyLeave={() => { setMuxHover(null); setWireHover(null); }}
                    onContextMenu={(e) => { e.evt.preventDefault(); e.cancelBubble = true;
                      const wa = wrapRef.current?.closest(".dft-workarea") as HTMLElement | null;
                      const rect = wa?.getBoundingClientRect();
                      setCtxMenu({ kind: "ip", id: ip.id, x: e.evt.clientX - (rect?.left ?? 0), y: e.evt.clientY - (rect?.top ?? 0) }); }} />
                  );
                })}
```

- [ ] **Step 8: typecheck，确认通过**

Run: `npm run typecheck`
Expected: PASS（无未用 import / 类型错误）。

- [ ] **Step 9: 提交**

```bash
git add src/specgen/Workspace.tsx src/specgen/DftIpNode.tsx
git commit -m "feat(specgen): 画布/调色板接入总线图层门控 + BScan 分组 + DI 跨层恒可见"
```

---

## Task 5: 全量验证（typecheck + 单测 + e2e + 真机截图核验）

**Files:** 无（验证任务）。

- [ ] **Step 1: typecheck + 全部单测**

Run: `npm test`
Expected: `typecheck` 干净；`node --test` 全绿（含新加的 delete-sync、catalog 两个文件；原有 137 单测不回归）。

- [ ] **Step 2: e2e 全绿（自带前置构建，防旧 dist 假绿）**

Run: `npm run test:e2e`
Expected: Playwright 套件全绿（`genconn.spec.ts`/`specgen.spec.ts` 等不回归）。

- [ ] **Step 3: 真机截图人工核验（Playwright 驱动 Electron）**

用 `veirlogPaser/rtl_test/gps_baseband.fl`（gps_baseband 设计）打开，逐条核验并截图：

1. **删除同步**：genconn 里删一个子实例 → 直接切到 SpecGen → 该子块对应的 DesignInstance 已不在（无孤儿）。
2. **图层下拉关闭**：SpecGen scopebar 点「图层 ▾」展开 → 点画布空白处 → 下拉消失；再展开 → 按 Esc → 消失。genconn Toolbar 同样行为。
3. **图层门控**：SpecGen 选「SSN」活动层 → 非 SSN 接口/节点变灰且不可点；选某层 👁→🚫 隐藏 → 该层不画。
4. **BScan 分组**：调色板在「全部」或「BSCAN」层下显示「BScan」组，点「EBScanPipeline」→ 画布出现 EBP 彩盒（紫色系 #9e77ed）；选「SSN」层时该组隐藏。
5. （已知/预期）SpecGen 预览文本**不含** `EmbeddedBoundaryScan` —— 属 Phase B（C++），非缺陷。

- [ ] **Step 4: 汇报**

把截图与 `npm test` / `npm run test:e2e` 输出贴给用户；确认无回归后本计划完成（分支留用户合并）。

---

## 明确不做（Phase B / 其他）

- BScan **生成**（`linearizeBScanChain`/`genBScanSpec`、bscan.schema、DI→EBScanInstance）——跨仓 C++ 移植，另开 M0→M1 计划。
- 对称复制 S3、拉线 UX 便利（对齐辅助线/逐角撤销/hide-wires）、newProject `feat/bus-layers` 游离提交。
