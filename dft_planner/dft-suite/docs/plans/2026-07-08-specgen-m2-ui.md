# SpecGen A-M2：`specgen/` 界面（dft-suite）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 把 newProject 的 SpecGen 工作区（放 DFT IP + 连线 + 实时 `.spec` 预览 + 生成）移植成 dft-suite 的第三个工作区，生成走 A-M1 的 `dftSpecgen.generate` C++ CLI（防抖预览）。

**Architecture（关键修正）:** SpecGen **不是独立文档**——它把 `dftIps`/`dftWires`/`inSpecgen` 挂在 genconn 的 `HardenDef` 上，datapath 边界针脚就是该 harden 自己的 `BusInterface[]`，入口是 genconn Inspector 的「加入 SpecGen」。故 M2 **动 `genconn/core/model.ts`**（加 DFT 字段/类型）、给 **`genconn/store.ts` 加 specgen slice**（共享 doc、同一 undo）、并在 genconn Inspector 加入口。生成路径（datapath 线性化/dftspec/gen）是 C++ 唯一真源；界面运行时只保留：catalog/schema(表单)/dft-model 类型/wire 校验/route A*/几何(ipgeom/anchor/useZoomPan)/`autoLayoutPositions`(布局)。

**Tech Stack:** React 18 + Konva/react-konva + Zustand(+zundo) + TS。分支 `feat/specgen-m1m2`（已含 A-M1 桥接）。

**仓库根：** `SUITE`=`/Users/jiangbowang/MOI/2025/dftartist/dft-suite`、`NP`=`/Users/jiangbowang/MOI/2025/dftartist/newProject`（源，只读）。

---

## 源→目标 映射

| newProject 源 | dft-suite 落点 | 性质 |
|---|---|---|
| `src/core/dft-model.ts` | `src/genconn/core/dft-model.ts` + `model.ts` 加 `dftIps/dftWires/inSpecgen` 到 HardenDef | 类型 |
| `src/dft/edit.ts`(183L) | `src/specgen/edit.ts` | 纯：dft 增删改/syncDesignInstances/名迁移 |
| `src/dft/wire.ts`(52L) | `src/specgen/wire.ts` | 纯：连线校验 + chainAwareFrom |
| `src/dft/catalog.ts`(60L) | `src/specgen/catalog.ts` | 纯：调色板 + 端口/盒几何 |
| `src/dft/schema.ts`(18L) + `schema/datapath.schema.json`(79KB) | `src/specgen/schema.ts` + `src/specgen/schema/datapath.schema.json` | 表单/调色板；**从 dft-core 同步的副本** |
| `src/dft/gen.ts`(41L) | `src/specgen/gen.ts` | 纯：config 对话框片段预览(`genIpFragment`) |
| `src/dft/route.ts`(119L) | `src/specgen/route.ts` | 纯：A* 正交布线 |
| `src/dft/datapath.ts` 的 `autoLayoutPositions`+`linearizeDatapaths`+图助手 | `src/specgen/layout.ts` | 纯：**仅布局用**的 TS 线性化副本（见决策 D1） |
| `src/ui/ipgeom.ts`/`ipvisual.ts`/`anchor.ts`/`useZoomPan.ts` | `src/specgen/{ipgeom,ipvisual,anchor,useZoomPan}.ts` | 纯几何/颜色/hook |
| `src/ui/DftIpNode.tsx`/`DftConfigDialog.tsx` | `src/specgen/{DftIpNode,DftConfigDialog}.tsx` | Konva/DOM |
| `src/ui/SpecGenTab.tsx`(510L) | `src/specgen/Workspace.tsx`(+内联几何) | Konva 工作区（最大） |
| `src/ui/store.ts` 的 specgen slice | 并入 `src/genconn/store.ts` | 状态 |
| — | `src/specgen/styles.css` | 样式（scope 到 `#ws-specgen`） |

复用 dft-suite 现成：`genconn/core/model.ts`(HardenDef/BusInterface/Id)、`genconn/layout.ts`(defOutline/bars/mapPoint/BUS_COLOR 等边界几何)、`genconn/persist.ts`、`core-bridge/specgen.ts`(A-M1)。

## 决策（需确认 D1；其余已定）

- **D1（唯一需你拍板）auto-arrange**：newProject 的「自动排列」调 `autoLayoutPositions`（内部依赖 `linearizeDatapaths` 图线性化，~200L 纯 TS）。选项：
  - **(A) 完整移植**：把 `linearizeDatapaths`+图助手作 `specgen/layout.ts` 抄一份到 TS（仅布局用，与 C++ 生成真源并存；漂移只影响排列美观、不影响 `.spec`）。**功能对等，推荐。**
  - **(B) 暂缓**：auto-arrange 只用 `autoLayoutPositions` 里的网格兜底（它已 try/catch 线性化失败→网格），不移 `linearizeDatapaths`。M2 更轻，回形带布局留后续。
- **D2 已定**：config 对话框的**单组件**片段预览（`genIpFragment`）留 TS（纯、便宜）；**整份** `.spec` 预览走防抖 `dftSpecgen.generate` CLI。
- **D3 已定**：schema canonical 在 dft-core，脚本同步副本到 `src/specgen/schema/` + parity 测试（对齐 A 部分 spec §3.5）。
- **D4 已定**：specgen 状态并入 `genconn/store.ts`（共享 doc、同一 zundo undo，照搬 newProject 单 store）。

## 里程碑内任务

> D1 若选 (B)，跳过 Task 3 的 `linearizeDatapaths` 部分（只留 grid 兜底）。以下按 (A) 写。

### Task 1：模型 + dft 编辑 + 校验 + store slice
**Files:** `SUITE/src/genconn/core/{dft-model.ts(new),model.ts}`、`SUITE/src/specgen/{edit.ts,wire.ts}(new)`、`SUITE/src/genconn/store.ts`、测试 `SUITE/tests/unit/specgen-edit.test.ts`
- [ ] **Step 1** 移植 `NP/src/core/dft-model.ts` → `genconn/core/dft-model.ts`（DftIpType/DftIpInstance/DftConfig/DftEndpoint/DftWire）。`genconn/core/model.ts` 的 `HardenDef` 加 `dftIps?/dftWires?/inSpecgen?`。
- [ ] **Step 2** 移植 `NP/src/dft/edit.ts` → `specgen/edit.ts`（`addDftIp/moveDftIp/deleteDftIp/setDftIpConfig/addDftWire/removeDftWire/rotateDftIp/flipDftIpH/flipDftIpV/setDftWireWaypoints/addToSpecgen/syncDesignInstances/migrateLegacyIpNames/applyAutoLayout/clearWpForIp`）。全部 `mapDef` 不可变；照抄 NP 逻辑。
- [ ] **Step 3** 移植 `NP/src/dft/wire.ts` → `specgen/wire.ts`（`validateDftWire`/`chainAwareFrom`/`endpointDir`）。依赖 `specgen/catalog.ts`（Task 2 先或同批）。
- [ ] **Step 4** `genconn/store.ts` 加 specgen slice：transient 字段（`activeTab? 用 design.workspace 替代`、`specgenScope`、`selectedDftIp`、`configDialogIp`、`dftWire`、`arrangeSnapshot`）+ actions（照 NP `store.ts:536-589` 表，包一层 `specgen/edit.ts`，set dirty、清 arrangeSnapshot）。undo 已是 doc 级 zundo，无需改。
- [ ] **Step 5** 单测：port `NP/test/dft-edit.test.ts` 的核心用例到 `tests/unit/specgen-edit.test.ts`（add/move/config/wire/sync/rotate）。`npm run typecheck` + `node --test tests/unit/specgen-edit.test.ts` 绿。
- [ ] **Step 6** commit：`feat(specgen): dft model/edit/wire + genconn store slice (A-M2 T1)`

### Task 2：纯 UI 引擎（catalog/schema/gen/route/几何/颜色/hook）+ schema 同步
**Files:** `SUITE/src/specgen/{catalog.ts,schema.ts,gen.ts,route.ts,ipgeom.ts,ipvisual.ts,anchor.ts,useZoomPan.ts}(new)`、`SUITE/src/specgen/schema/datapath.schema.json`、`SUITE/scripts/sync-schema.sh(new)`、测试 `tests/unit/specgen-schema-parity.test.ts`、`tests/unit/specgen-route.test.ts`
- [ ] **Step 1** 建同步脚本 `scripts/sync-schema.sh`：`cp ../dft-core/specgen-core/datapath.schema.json src/specgen/schema/datapath.schema.json`。运行它落副本。
- [ ] **Step 2** 移植 `catalog.ts`/`schema.ts`（import 改成本地 `./schema/datapath.schema.json`）/`gen.ts`/`route.ts`/`ipgeom.ts`/`ipvisual.ts`/`anchor.ts`/`useZoomPan.ts`。`ipgeom` 依赖的 `layout.ts` 助手（`mapPoint`/`dispDims`）复用 `genconn/layout.ts`（若缺则补导出）。
- [ ] **Step 3** parity 测试 `specgen-schema-parity.test.ts`：断言 `src/specgen/schema/datapath.schema.json` 与 `../dft-core/specgen-core/datapath.schema.json` 内容一致（防漂移）。route 测试 port `NP/test/dft-route.test.ts`。
- [ ] **Step 4** `npm run typecheck` + 两个新测试绿。commit：`feat(specgen): pure UI engine (catalog/schema/gen/route/geom) + schema sync+parity (A-M2 T2)`

### Task 3：布局线性化 TS 副本（D1=A）
**Files:** `SUITE/src/specgen/layout.ts(new)`、测试 `tests/unit/specgen-layout.test.ts`
- [ ] **Step 1** 从 `NP/src/dft/datapath.ts` 抄 `autoLayoutPositions` + `linearizeDatapaths` + 其图助手（`buildGraph`/`bfs`/`chain*`/`buildSmuxSecondary`/`buildExtraOutputs`/`keyOf`/…）到 `specgen/layout.ts`。**注释标明：仅供画布布局；`.spec` 生成真源是 C++ specgen。** import 用本地 catalog。
- [ ] **Step 2** 冒烟测试：对一个含 datapath 的 scope，`autoLayoutPositions` 返回每个 IP 的 position + mux mirror；`linearizeDatapaths` 不抛。
- [ ] **Step 3** typecheck + 测试绿。commit：`feat(specgen): TS datapath linearization copy for canvas auto-arrange (A-M2 T3)`

### Task 4：DftIpNode + DftConfigDialog
**Files:** `SUITE/src/specgen/{DftIpNode.tsx,DftConfigDialog.tsx}(new)`
- [ ] **Step 1** 移植 `NP/src/ui/DftIpNode.tsx`（Konva Group：盒/梯形、直立文字、hover 起线点、MUX M/S 槽、drag/dblclick）。props 对齐（`onPortDown`/`onMove`/`openConfig`/`setDragPos`）。
- [ ] **Step 2** 移植 `NP/src/ui/DftConfigDialog.tsx`（递归 schema 表单 + `genIpFragment` 片段预览，留 TS）。
- [ ] **Step 3** typecheck 干净（组件未挂载也要类型通过）。commit：`feat(specgen): DftIpNode + DftConfigDialog (A-M2 T4)`

### Task 5：SpecGen Workspace（Konva 主工作区）+ 防抖 CLI 预览
**Files:** `SUITE/src/specgen/{Workspace.tsx,styles.css}(new)`
- [ ] **Step 1** 移植 `NP/src/ui/SpecGenTab.tsx` → `specgen/Workspace.tsx`：三区（palette / Konva canvas / 预览面板），含内联几何（`ifaceGeom`/`triPoints`/`wirePoints`/`segmentsOf`/`moveSegment`）、wire-draft、段拖拽、右键菜单、键盘（R/⇧R/F/⇧F/Del）、缩放控件、面板拖拽宽度（照 `genconn/Workspace.tsx` 的 lsNum/drag 范式）。scope = `doc.library.defs.filter(inSpecgen)` 选 `specgenScope`。
- [ ] **Step 2** **实时预览改防抖 CLI**：把 `genDftSpec(scope)` 的 `useMemo` 换成 `useEffect`+400ms 防抖调 `dftSpecgen.generate(serialize({...doc, ui:{...doc.ui, rootDefId: scope.id}}))`（镜像 `genconn/dfx/DfxDialog.tsx` 的防抖 ctrlgen 预览），try/catch → 错误注释回退 UX 不变。Copy/Save(.dftspec) 保留。
- [ ] **Step 3** `styles.css` 移植 `.specgen`/`.dft-*` 规则，scope 到 `#ws-specgen`。
- [ ] **Step 4** typecheck 干净。commit：`feat(specgen): SpecGen Konva workspace + debounced CLI preview (A-M2 T5)`

### Task 6：shell 集成 + 「加入 SpecGen」入口
**Files:** `SUITE/src/store/design.ts`、`SUITE/src/shell/{App.tsx,TopBar.tsx}`、`SUITE/src/genconn/Inspector.tsx`、`SUITE/src/main.tsx`(如需)
- [ ] **Step 1** `store/design.ts`：`Workspace` 联合加 `"specgen"`。
- [ ] **Step 2** `shell/TopBar.tsx`：`TABS` 加 `{ id:"specgen", label:"SpecGen" }`。
- [ ] **Step 3** `shell/App.tsx`：body 加 `ws==="specgen"` 分支 → `<div id="ws-specgen">…<SpecgenWorkspace/></div>`。
- [ ] **Step 4** `genconn/Inspector.tsx`：加「加入 SpecGen」按钮（选中实例的 def）→ 调 genconn store 的 `addToSpecgen(defId)`（切 workspace 到 specgen + 设 specgenScope）。
- [ ] **Step 5** typecheck 干净。commit：`feat(specgen): shell tab integration + genconn 'add to SpecGen' entry (A-M2 T6)`

### Task 7：验证 + e2e 冒烟
**Files:** `SUITE/tests/e2e/specgen.spec.ts(new)`
- [ ] **Step 1** `npm run build`（tsc + vite）干净。
- [ ] **Step 2** e2e 冒烟（playwright，照 `tests/e2e/dfx.spec.ts` 范式，需真 specgen 二进制）：开应用→切 SpecGen tab（或经 genconn「加入 SpecGen」）→放一个 ScanHost→连边界接口→断言预览面板出现 `read_config_data ... DataPath`→生成/下载。
- [ ] **Step 3** `npm test` 全绿（typecheck + unit + integration）。手动核对与 newProject 视觉/交互一致（放 IP/连线/旋转/自动排列/预览）。
- [ ] **Step 4** commit：`test(specgen): e2e smoke + full A-M2 verification`

## Self-Review 备注
- **最大修正**：SpecGen 共享 genconn doc（非独立 store），故 Task 1 动 `genconn/core/model.ts` + `genconn/store.ts` + `genconn/Inspector.tsx`。
- **最大工作量**：Task 5（SpecGenTab 510L Konva + 内联几何 + 交互）。
- **D1 风险**：选 (A) 则 `specgen/layout.ts` 的 `linearizeDatapaths` 与 C++ 并存（布局用，漂移不碰 `.spec`）；选 (B) 则 auto-arrange 退化网格。
- **前置**：dft-core 在 `feat/specgen-m0`（specgen 二进制已建，预览/e2e 需要）。
- **schema 79KB** 随 Vite 打进 bundle（`import ... with {type:"json"}` 或 `?raw`，按 dft-suite 现有 JSON import 惯例）。
