# genconn data-source 引出连线自动生成接口 Implementation Plan (Track 1, S0–S2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** 把 newProject genconn 的「data source 接口 + 从它引出连线 → 自动生成 secondary/client 接口 + 连接」功能忠实移植到 dft-suite genconn。对称复制(S3)不在本计划。

**Architecture:** 纯 dft-suite（TS + Konva 画布）。自动生成的接口/连接走现有 C++ generate，无 dft-core 改动。核心引擎是 `newProject/src/ui/wire.ts`（500L：折线→穿过的 harden 树→每条树边父生 secondary/子生 client + manual 连接 + 实例定向 + view-only BusWire）。DS 标记是引线的前置（`addWire` 要求源接口 `isDataSource`）。

**Tech Stack:** React + react-konva + Zustand(+zundo)。分支 `feat/genconn-ds-wire`（off `feat/specgen-m1m2`，已含 edge/placement/isDataSource/dsFlip 字段）。

**仓库根：** `SUITE`=`/Users/jiangbowang/MOI/2025/dftartist/dft-suite`、`NP`=`/Users/jiangbowang/MOI/2025/dftartist/newProject`（源，只读）。

## 现状 / 缺口
- dft-suite genconn model **已有**：`edge?`(side/offset/perimeter)、`placement?`、`isDataSource?`、`dsFlip?`。**缺**：`innerPos?`(BusInterface)、`manual?`(BusConnection)、`BusWire` 类型 + `wires?`(HardenDef)。
- dft-suite genconn **无** `wire.ts`、CanvasView **无**任何拉线钩子（onPinDown/beginWire）。layout 助手齐（computeLayout/mapPoint/dispDims/pointInPolygon/addInterface/mapOpenDef）。
- 源参考：`NP/src/ui/wire.ts`、`NP/src/core/edit.ts`(setDataSource/setInterfacePlacement/setInterfaceInnerPos)、`NP/src/ui/Inspector.tsx`、`NP/src/ui/CanvasView.tsx`(DS 引脚/引线/BusWire 渲染)、`NP/src/ui/store.ts`(beginWire/commitWire/…)、`NP/src/ui/layout.ts`(placement=other skip + BarView.isDataSource/dsFlip)、`NP/test/wire.test.ts`。

---

## Task 1 (S0 + S1-logic)：模型 + DS 编辑 + store + Inspector
**Files:** `SUITE/src/genconn/core/{model.ts,edit.ts}`、`SUITE/src/genconn/store.ts`、`SUITE/src/genconn/Inspector.tsx`、测试 `SUITE/tests/unit/genconn-datasource.test.ts`

- [ ] **Step 1 模型**：`model.ts` 加 `innerPos?: { x: number; y: number }`(BusInterface，对照 NP)、`manual?: boolean`(BusConnection)、`BusWire` 类型（`id/busType/busWidth?/sourceInstanceId/sourceInterfaceId/points:{x,y}[]/connectionIds:Id[]`，照 NP model.ts）+ `wires?: BusWire[]`(HardenDef)。
- [ ] **Step 2 DS 编辑函数**：`genconn/core/edit.ts` 加 `setDataSource`/`setInterfacePlacement`/`setInterfaceInnerPos`（逐字移植 `NP/src/core/edit.ts` 对应 3 函数：other 仅 data-source client 合法、切 other 给默认 innerPos {40,40}、取消 DS 复位 placement）。
- [ ] **Step 3 store actions**：`genconn/store.ts` 加 `setDataSource`/`setInterfacePlacement`/`setInterfaceInnerPos`（thin wrapper，set doc + dirty；对齐现有 genconn action 风格）。
- [ ] **Step 4 Inspector**：`genconn/Inspector.tsx` 移植 NP 的接口编辑区：接口 role 处加「iface / data source」下拉(`setDataSource`) +（isDataSource && client 时）「pin / other」摆放下拉(`setInterfacePlacement`)。对照 `NP/src/ui/Inspector.tsx:192,272-279`；label/选项照抄（other 选项后缀按 busType 显示 pad/tap/bisrController）。
- [ ] **Step 5 测试 + 验证**：port `NP/test/wire.test.ts` 里 setDataSource/placement 相关用例（若有）+ 自写 DS 编辑单测到 `tests/unit/genconn-datasource.test.ts`。`npm run typecheck` + 该测试绿 + `npm test` 全绿。
- [ ] **Step 6 commit**：`feat(genconn): data-source marking + placement edit/store/Inspector (S0+S1)`

## Task 2 (S1-canvas)：画布 DS 视觉
**Files:** `SUITE/src/genconn/layout.ts`、`SUITE/src/genconn/CanvasView.tsx`
- [ ] **Step 1 layout**：`selfBars` 跳过 `placement === "other"` 的接口（不进边条），对照 `NP/src/ui/layout.ts:242`。BarView 已带 isDataSource/dsFlip（M2 已加）——确认 selfBars 有传（若无则补）。
- [ ] **Step 2 边条 DS 视觉**：CanvasView 的边界接口条：`isDataSource` 时画 ◆ 标记 + 双击翻转 `dsFlip`（updateInterface 或 setInterface…），对照 `NP/src/ui/CanvasView.tsx:121,129`。
- [ ] **Step 3 盒内渲染**：CanvasView 加 `placement === "other"` 的接口在盒内按 `innerPos` 渲染（可拖，dragBoundFunc 限盒内 → `setInterfaceInnerPos`），对照 `NP/src/ui/CanvasView.tsx:352-383`。
- [ ] **Step 4 验证**：`npm run typecheck` + `npm test` 绿。（视觉留 T5 截图核对。）commit：`feat(genconn): canvas data-source visuals (◆/flip/placement=other in-box) (S1)`

## Task 3 (S2-logic)：wire 引擎移植
**Files:** `SUITE/src/genconn/wire.ts`(new)、测试 `SUITE/tests/unit/genconn-wire.test.ts`
- [ ] **Step 1 移植 wire.ts**：`NP/src/ui/wire.ts` → `SUITE/src/genconn/wire.ts` 逐字移植（`addWire`/`wireFromTree`/`buildDrawnTree`/`removeWire`/`orthAppend`/`notchDepth`/`facingPlacement`/`orientSide`/`orientOffset`/`instanceCrossings`/`lineHitInstances` 等）。**不移** `growReplicas`/`computeReplicas`/`applyReplicas`/`stripWire`/`replicaPlan`（S3）。调整 import：`../core/model.ts`→`./core/model.ts`；`./layout.ts`→`./layout.ts`；`../core/edit.ts`(addInterface/mapOpenDef)→`./core/edit.ts`。
- [ ] **Step 2 测试**：port `NP/test/wire.test.ts` 里 addWire/wireFromTree/buildDrawnTree/removeWire 相关用例（跳过 replica 用例）到 `tests/unit/genconn-wire.test.ts`，调 import 路径。
- [ ] **Step 3 验证**：`npm run typecheck` + `node --test tests/unit/genconn-wire.test.ts` 绿（自动生成接口/连接、定向、树构建的语义与 NP 一致）+ `npm test` 全绿。
- [ ] **Step 4 commit**：`feat(genconn): port data-source wire engine (draw -> auto secondary/client + connections) (S2)`

## Task 4 (S2-canvas)：画布拉线交互
**Files:** `SUITE/src/genconn/store.ts`、`SUITE/src/genconn/CanvasView.tsx`
- [ ] **Step 1 store**：加 `wire` 草稿态(`{sourceInstId,sourceIfId,points}` | null) + `beginWire(instId,ifId,at)`/`commitWire(inInstId,inIfId,at)`/`cancelWire()`/`removeWire(wireId)`（对照 `NP/src/ui/store.ts:504-528`；commitWire 走 `addWire(doc, src, orthAppend(points, at))`，错误/unresolved 走 alert 或状态；先不接 replica）。
- [ ] **Step 2 引脚**：CanvasView DS 接口条加 out/in 引脚（`isDataSource` 时），`onPinDown("out"/"in", worldAt)` → begin/commit（对照 `NP/src/ui/CanvasView.tsx:139-154,348,1022-1023`）。
- [ ] **Step 3 拉线草稿 + BusWire 渲染**：画线态跟随光标（`orthAppend` 正交折线预览）；已提交 `wires` 渲染为折线（+ 右键删除 → `removeWire`）。对照 NP CanvasView 的 wire 渲染 + notch 辅助。
- [ ] **Step 4 验证**：`npm run typecheck` + `npm test` 绿。commit：`feat(genconn): canvas data-source wiring interaction (pins/draft/commit/render) (S2)`

## Task 5：验证 + 起应用截图核对
- [ ] **Step 1**：`npm run build` 干净。
- [ ] **Step 2 e2e/驱动**：用 `tests/helpers/electron.ts` 起应用，种一个含两个相邻 harden（一个有 DS client 接口）的 doc → 切 genconn → 从 DS 引脚拉线到另一 harden → 断言两端自动生成了接口 + 一条 manual 连接（查 store doc）。或直接驱动 + 截图。
- [ ] **Step 3 截图**：截 genconn 画布（DS 标记 ◆ / placement=other 盒内 / 引线 + 自动生成的接口条），人（controller）看图核对与 newProject 一致。
- [ ] **Step 4**：`npm test` + `npm run test:e2e` 全绿。commit：`test(genconn): data-source wiring e2e + verification (S2)`

## Self-Review 备注
- **最大风险**：Task 3 的 `wireFromTree` 定向(findOrient 8 选 1)+树构建(buildDrawnTree 密采样)——靠 port 的 `wire.test.ts` 单测 + Task 5 视觉核对兜底。
- 自动生成的接口/连接是标准 BusInterface/BusConnection（`manual:true` 是视图标记），走现有 C++ generate，无 dft-core 改动。
- 前置字段 edge/placement/isDataSource/dsFlip 已在（B/M2）；本计划仅加 innerPos/manual/BusWire/wires。
- S3 对称复制（growReplicas/computeReplicas/applyReplicas + 预览接受 UI）显式不做。
