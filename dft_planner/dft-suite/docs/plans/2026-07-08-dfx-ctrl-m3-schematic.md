# DFX Ctrl M3 — 原理图中心重设计 实施计划

> **For agentic workers:** subagent-driven-development,逐任务 实现→spec 审查→质量审查。checkbox 跟踪。

**Goal:** DFX 从 genconn 画布搬到 hierarchy 的专用「DFX Ctrl」原理图 tab:右键「Add to DFX Ctrl」加实例(累加共存)→ 双击实例配置 → ctrl 块 + mux 用 ELK 渲染进这张 tab 并接线;数据仍存 genconn 文档;移除 genconn 画布 DFX。

**Architecture:** 全部在 dft-suite `feat/dfx-ctrl-ui`。**数据**住 genconn store 的 `GenConnDocument`(复用 localStorage/undo/migrate,A1)。**UI** 住 hierarchy 工作区(新 tab 种类 + 树右键入口),跨 store 读写 genconn store(先例 `hierarchy/store.ts:272` `useGenconnStore.getState().importBlocks`)。**渲染**复用 hierarchy 原理图内核纯模块(`core/schematic.ts`/`schematic/laid.ts`/`schematic/elkLayout.ts`)。

**Tech Stack:** React 18 + Konva + elkjs + Zustand(genconn + hierarchy 两 store)+ node:test/Playwright。spec:`docs/specs/2026-07-07-dfx-ctrl-ip-design.md` §5(M3)/D9–D13。

**关键既有事实(投研已确认):**
- 跨 store 先例:`hierarchy/store.ts:262-274` `addToGenConnection` 调 `useGenconnStore.getState().importBlocks` + `useDesign.setWorkspace`。
- hierarchy tab 系统:`Tab` 联合类型(`core-bridge/model.ts:55`),`tabs: Tab[]`(`hierarchy/store.ts:32`),`addTab/removeTab`(`hierarchy/core/tabs.ts:9-25`);ports-tab 单例范式 `PORTS_TAB_ID="tab:ports"` + find-replace(`hierarchy/store.ts:64,143-153`);`schematics: Record<id,SchematicGraph>`(`:34`);TabArea 渲染 `hierarchy/TabArea.tsx:31-33`。
- 原理图内核:`SchNode`(id=daemon nodeId/hierPath,`core/schematic.ts:8-16`)、`makeNode`(`:43-48`)、`toElkGraph`;`laid.ts` `toLaid/boundsOf/fitTransform`;`SchematicTab.tsx` Konva 双 Layer + 工具条(`:116-121`)、节点双击(`:265-273`)。
- DFX 可复用纯核(零 genconn 依赖):`dfx/judge.ts`、`dfx/build.ts`(仅类型)、`dfx/detailGraph.ts`(`buildDetailGraph(entry)`)、`core-bridge/ctrlgen.ts`、`client.ts` `getPorts/getNetlist`;`dfx/edit.ts` 的 `moduleNameOf/allocModuleDs/allocMuxDs/ctrlIpByModule/upsertCtrlIp/removeCtrlIp` 纯 doc 函数。
- 画布耦合(要移除):`confirmCtrlIp` `store.ts:460-502` 的落块段(`:477-494`)+ `resolveCtrlTargets`(`edit.ts:41-73`);`DfxOverlay` + CanvasView 挂载(`CanvasView.tsx:915-923`)+ DFX 双击/右键(`:818-824,935-937`);genconn 左栏 `DfxPanel`;`deleteInstance/deleteSelected` 的 ctrlIp 反向级联(`store.ts:276-278,362-365`);`DfxDetail`(被 DFX tab 取代)。
- DfxDialog genconn 硬依赖:`useStore`(genconn)、`s.hierarchy`(genconn 调色板层次,用于 +add target 搜索)、`req.seedInstId`→doc 反查(`DfxDialog.tsx:89-101`)、`s.viewCenter`(落块坐标)、`confirmCtrlIp`。
- 持久化:`GenConnDocument`(`model.ts:126-141`)= `library/ui/ctrlIps/moduleDsNext/muxDsNext`;`document.ts` migrate(`:7-36`,`CURRENT_SCHEMA_VERSION`);localStorage `genconn:lastdoc`。
- **已知预存失败**:`tests/integration/genconn-generate.test.ts` golden(SSN 命名,dft-core 缺 1d515dc,与本工作无关)。

**策略:先加新(hierarchy DFX)、后拆旧(genconn 画布 DFX)**,保证过程中测试尽量绿。T1–T5 加新并让新流程可用,T6 tab 复用,T7 拆旧 + 迁移测试。

---

## M3-T1: schema v3 + dfx store 去画布化 action

**Files:** `src/genconn/core/model.ts`、`document.ts`、`src/genconn/dfx/edit.ts`、`src/genconn/store.ts`、`tests/unit/dfx-schema.test.ts`、`tests/unit/dfx-edit.test.ts`

- [ ] model.ts:`GenConnDocument` 加 `dfxInstances: string[]`(nodeId 列表,注释「加入 DFX Ctrl tab 的实例」)。`DocCtrlIp` 的 `ctrlInstId`/`targets` 改为可选(`ctrlInstId?`/`targets?`)——去画布化后不再必填,目标由 `spec.pins[].target` 承载;保留字段以兼容旧文档。
- [ ] document.ts:`CURRENT_SCHEMA_VERSION = 3`;migrate v<3 分支只 bump(现有 `??=` 兜底扩展加 `doc.dfxInstances ??= []`);emptyDocument 加 `dfxInstances: []`。
- [ ] edit.ts:加纯函数 `addDfxInstance(doc, nodeId)`(去重 push)、`removeDfxInstance(doc, nodeId)`(filter);保留现有 alloc/upsert/removeCtrlIp。
- [ ] store.ts:加 action `addDfxInstance(nodeId)`/`removeDfxInstance(nodeId)`(一次 set);加**去画布化确认** `confirmCtrlIpV3({editModule, moduleBase, rows})`:`allocModuleDs`(new)+ 统计 mux 位 `allocMuxDs` + `buildCtrlIpSpec` + `upsertCtrlIp(doc,{spec})`(**不** addBlockAt/resolveCtrlTargets),一次 set 一步 undo。**暂不删** 旧 `confirmCtrlIp`(T7 删)。
- [ ] 测试:schema v2→v3 迁移(dfxInstances 默认 []、旧 ctrlIps 保留);addDfxInstance 去重、removeDfxInstance;confirmCtrlIpV3 写 spec 不落块。
- [ ] `npm run test:unit`(除预存 golden 全绿)+ `typecheck` + commit。

## M3-T2: buildDfxSchematicGraph 纯函数(detailGraph 推广)

**Files:** `src/genconn/dfx/dfxGraph.ts`(新)、`tests/unit/dfx-graph.test.ts`(新)

- [ ] 参照 `dfx/detailGraph.ts`(单修改建图),写 `buildDfxSchematicGraph(args: { instances: {nodeId, ports: PortInfo[], instanceName, designName}[]; ctrlIps: DocCtrlIp[] }): SchematicGraph`:
  - 每个 instance 一个 SchNode(id=nodeId,端口来自 ports);
  - 每条 ctrlIp:1 ctrl 块 SchNode + 每 mux 位 1 mux SchNode(blackbox,in0/in1/sel/out)+ 1 dfx_mode 源节点(去重合并到单一 dfx 源);
  - 边:控制 mux `ctrl.<pin>→mux.in1`、`mux.out→目标实例.pin`;replace/connect `ctrl.<pin>→目标.pin`;观测 `目标.pin→ctrl.<pin>`;`dfx源→ctrl.dfx_mode`+`dfx源→各 mux.sel`;
  - target 实例 nodeId 从 `pin.target`(tcl 路径,去顶层斜杠)反推,和 instances 的 nodeId(daemon 点分隔)桥接(注意 tcl 路径 vs nodeId 的转换,复用 `judge.tclTarget` 的逆)。
- [ ] 复用 `core/schematic.ts` 的 `makeNode/edgeId/toElkGraph` 可布局形状;`node --test` 可 import(纯 .ts)。
- [ ] 测试:多实例 + 多 ctrlIp 合图,节点/边方向/去重(dfx 源单例、目标实例复用同一节点)。
- [ ] test/typecheck/commit。

## M3-T3: DfxCtrlTab 组件 + hierarchy tab 接入

**Files:** `src/core-bridge/model.ts`(Tab 联合加 dfx 种类)、`src/hierarchy/core/tabs.ts` 或 store(单例 tab)、`src/hierarchy/store.ts`(openDfxCtrlTab)、`src/hierarchy/TabArea.tsx`、`src/hierarchy/schematic/DfxCtrlTab.tsx`(新)、样式

- [ ] `Tab` 联合加 `DfxCtrlTabSpec { id: "dfx:ctrl"; kind: "dfxctrl"; title }`;固定单例 id。
- [ ] hierarchy store:`openDfxCtrlTab()`(仿 ports-tab 单例:存在则 activate,否则 addTab);tab 内容图从 genconn store 的 `doc.dfxInstances + doc.ctrlIps` 派生。
- [ ] `DfxCtrlTab.tsx`:订阅 genconn store(`useGenconnStore`)取 dfxInstances/ctrlIps;对每个 dfxInstance 调 `dftDesign.getPorts` 拉端口(缓存);`buildDfxSchematicGraph` → `toElkGraph→layout→toLaid`;Konva 双 Layer 渲染(参照 `SchematicTab.tsx` StaticBox);**双击实例块** → 打开配置弹窗(`openDfxDialog({mode:"new", seedNodeId})`,弹窗由 T4 支持 nodeId);工具条「适应/重排」。fitTransform 初始取景。
- [ ] TabArea 渲染 `kind==="dfxctrl"` → `<DfxCtrlTab/>`。
- [ ] 手验(探针/dev):Add 两个实例后 tab 出现两个块。test/typecheck/commit。

## M3-T4: DfxDialog nodeId 驱动 + confirm 去画布化 + 预览加宽/拖/展开 + 目标可删

**Files:** `src/genconn/dfx/DfxDialog.tsx`、`src/genconn/styles.css`、store(openDfxDialog 支持 seedNodeId)

- [ ] `dfxDialog` 请求类型加 `{ mode:"new"; seedNodeId: string }`(nodeId 直接 seed);DfxDialog new 模式:seedNodeId 存在则用它,loadRows 直接 `getNetlist(parentOf)`+`getPorts(nodeId)`(先 netlist 后 ports);designName 从 getPorts 结果或 daemon 拿(不再 doc 反查)。保留旧 seedInstId 分支到 T7 删。
- [ ] 确认改调 `confirmCtrlIpV3`(T1 的去画布 action);不再传 viewCenter/targetMeta。
- [ ] `+添加目标实例` 搜索源:改用共享设计(hierarchy 树 dump 或 `searchHierarchy` 作用于共享数据);若 genconn `s.hierarchy` 在 hierarchy 工作区不可用,改走 `useHierStore` 或共享 dump——实现时确认数据源。
- [ ] 预览加宽(a):`.dfx-preview` flex-basis 360px→`clamp(420px,40vw,720px)`;可拖分隔(b):加 `.dfx-splitter` + previewW state + 指针事件;展开(d):「展开预览」按钮 toggle,展开时隐 `.dfx-left`、预览满宽。
- [ ] 目标删除(§5.3):多目标分组头行加 `✕` → `removeTarget(nodeId)`(滤 targets + rows);edit 删目标=仅摘引脚。
- [ ] test(dfx-build 已覆盖 build;新增 removeTarget 纯逻辑若可抽则测)/typecheck/手验/commit。

## M3-T5: 树右键「Add to DFX Ctrl」+ DFX 清单 + 生成下载

**Files:** `src/hierarchy/ContextMenu.tsx`、`src/hierarchy/store.ts`、`src/hierarchy/schematic/DfxCtrlTab.tsx`(清单+生成区)、样式

- [ ] ContextMenu 加项「Add to DFX Ctrl」→ hierarchy store `addToDfxCtrl(nodeId)`:`useGenconnStore.getState().addDfxInstance(nodeId)` + `openDfxCtrlTab()`(留在 hierarchy 工作区)。
- [ ] DfxCtrlTab 内(侧栏/浮层)DFX 清单:列 `doc.ctrlIps` 每条 `模块名 · N 目标(引脚数) · X控/Y观`;单击高亮该组、双击/✎ 编辑(openDfxDialog edit)、🗑 删除(`window.confirm` → `removeCtrlIp`)。
- [ ] 「全部生成/下载」:遍历 `doc.ctrlIps` 调 `dftCtrlgen.gen(c.spec)` → `downloadText`(复用 persist.ts)。
- [ ] 手验全链路(Add→双击配置→确认→ctrl/mux 出现→清单→生成)。test/typecheck/commit。

## M3-T6: Show on Schematic tab 复用(D12)

**Files:** `src/hierarchy/store.ts`(openSchematic)、`src/hierarchy/ContextMenu.tsx`、`SchematicTab.tsx`(tabId/图 key)

- [ ] openSchematic 加 `newTab?` 参数:默认复用单例 schematic tab(仿 ports-tab find-replace,固定 id 如 `sch:__single`),就地换 seedNodeId/title;`newTab` 走现 `sch:${nodeId}`。
- [ ] 图缓存 key 从 tab-id 解耦为 seedNodeId:`schematics` 与 `prevPosByTab` 的访问点(`store.ts:203,220,224,245`、`SchematicTab.tsx:24,27,69,73`)改按 seedNodeId 索引。
- [ ] ContextMenu 加「Show on Schematic in New Tab」。
- [ ] 手验:连开多个实例复用一个 tab;新 tab 项另开。test/typecheck/commit。

## M3-T7: 移除 genconn 画布 DFX + 迁移测试 + 全量回归

**Files:** 删/改 `DfxOverlay.tsx`、`CanvasView.tsx`(DFX 入口/Layer)、`genconn/Workspace.tsx`(DfxPanel 挂载)、`DfxPanel.tsx`(移到 hierarchy 或删)、`store.ts`(旧 confirmCtrlIp/deleteInstance 级联/dfxFocus 画布 fit)、`dfx/edit.ts`(resolveCtrlTargets)、`DfxDetail.tsx`/`detailGraph.ts`(detailGraph 若被 T2 dfxGraph 取代则清理)、相关测试与 e2e

- [ ] 移除 genconn 画布 DFX:`DfxOverlay` 组件 + CanvasView overlay Layer/DFX 双击/右键项;genconn 左栏 `DfxPanel`(其功能已由 DFX tab 清单取代);`confirmCtrlIp` 旧画布落块段 + `resolveCtrlTargets`;`deleteInstance/deleteSelected` 的 ctrlIp 反向级联;旧 `confirmCtrlIp`/seedInstId 分支;`dfxFocus/dfxFitSeq` 若仅画布用则删。
- [ ] `DfxDetail`:被 DFX tab 取代,删除其组件与 Workspace 挂载(detailGraph 逻辑已推广进 T2 dfxGraph;若仍被别处引用则保留纯函数)。
- [ ] 迁移测试:删/改依赖画布的单测(dfx-edit 的 resolveCtrlTargets/级联用例、detail-graph 若删)、e2e `dfx.spec.ts` 改为 hierarchy DFX tab 流程(Add to DFX Ctrl→双击→配置→确认→ctrl 块出现→生成)。
- [ ] `npm run test:unit`(除预存 golden 全绿)+ `typecheck` + `build` + `npx playwright test`(不回归)。commit。

---

## Self-review
- 数据(D11/A1)全程在 genconn doc,复用持久化;UI 在 hierarchy;跨 store 有先例。
- 先加后拆(T1–T6 加新、T7 拆旧)使中途测试尽量绿;预存 golden 失败全程无关。
- 复用最大化:judge/build/detailGraph→dfxGraph/generation/schema/Electron 桥全留;新写只有 DfxCtrlTab 渲染 + 建图推广 + 弹窗解耦 + 入口。
