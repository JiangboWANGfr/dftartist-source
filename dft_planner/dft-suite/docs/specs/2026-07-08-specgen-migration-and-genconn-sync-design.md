画m

# SpecGen 迁移 + genconn 引擎增量同步 — 设计

- 日期：2026-07-08
- 状态：Draft（待评审）
- 相关仓库：`newProject`（源）、`dft-core`（C++ 引擎）、`dft-suite`（Electron/React 界面）

## 1. 背景与架构

`newProject`（GenConnection）是原型仓库，所有功能先在这里迭代稳定，再沿「**引擎 → dft-core（C++）/ 界面 → dft-suite（React）**」这条缝迁移。目前：

- 已迁移：HDL/层次模型（`hdl-core` + `hierarchy/`）、GenConnection（`genconn-core` + `genconn/`）、DFT 注入（`inject-core`）、DFX Ctrl IP（`ctrlgen-core` + `genconn/dfx/`）。
- 迁移模板（DFX/ctrlgen 已验证）：**M0 引擎（C++，用 newProject `node` 输出做逐字节 golden）→ M1 桥接（electron CLI + preload + core-bridge）→ M2 界面（React 工作区）**。

关键事实（已核）：dft-suite 的 TS `genconn/core/` 是**活代码**，与 C++ CLI 混合使用——C++ CLI（`genconn generate-all`/`inject`）出最终文件；TS `core/` 跑交互编辑（`edit`）、Inspector 端口展开（`expand`）、生成前校验（`validate`）、unconnected 扫描/预览（`generate`）、同步导出带 DFT 的 `.v`（`vinject`）。**因此任何 genconn 引擎改动必须同时落到 C++ 与 TS 两侧并保持一致。**

## 2. 范围

- **A 部分 — SpecGen 完整迁移**：把 newProject 里最大、已稳定、未迁移的功能 **SpecGen（Tessent SSN DataPath spec 生成）** 迁到两仓。
- **B 部分 — genconn 引擎增量同步**：ee 把 newProject 领先、两侧都缺的 4 个 genconn 引擎特性合并回 C++ 与 TS，并加一条防漂移守护。

采用**方案 A**（已确认）：生成逻辑以 **C++ 为唯一真源**；界面实时预览走**防抖 CLI**（与 `DfxDialog` 400ms 防抖 ctrlgen 预览一致）。

---

## 3. A 部分 — SpecGen 迁移

### 3.1 引擎/界面拆分

| 进**dft-core**（新库 `specgen-core`, C++）                                             | 留**dft-suite**（新模块 `specgen/`, TS）                                                             |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `datapath.ts`（355L 线性化）、`dftspec.ts`（148L）、`gen.ts`（41L）— **生成**路径 | `SpecGenTab.tsx`（510L）、`DftIpNode.tsx`、`DftConfigDialog.tsx` — 画布 + 对话框                      |
| `catalog.ts`（60L）+ `schema.ts`（内嵌 `datapath.schema.json`，3623L）                   | `edit.ts`（183L）、`dft-model.ts`、`catalog`(调色/端口几何数据) — 交互模型/编辑                       |
| document 解析（doc JSON → model）                                                             | `wire.ts`（52L 编辑期校验）、`route.ts`（119L A*）、`ipgeom`、`ipvisual`、`anchor`、`useZoomPan` |
| CLI：`specgen gen <doc.json>` → `.spec`                                                   | `store.ts`（Zustand + localStorage）、实时预览走防抖 `dftSpecgen.generate`                               |

注：`route.ts`（A* 布线）、几何/视觉（`ipgeom`/`ipvisual`/`anchor`）是纯 UI，留 TS。`wire.ts` 是编辑期即时校验，留 TS（与 genconn 的 `snap.ts`/`wire.ts` 一致）。

### 3.2 M0 — `specgen-core`（dft-core, C++ 引擎）

- 新建 `libspecgencore`，**不依赖 slang**，复用 header-only `json/JsonValue.h`，结构照抄 `genconn-core`/`ctrlgen-core`。
- 移植顺序：`model.h`（DftIpInstance/DftConfig/DftWire/DftEndpoint 文档模型）→ `document.cpp`（parseDocument）→ `catalog`+`schema`（内嵌 schema）→ `datapath.cpp`（线性化，最难）→ `gen.cpp`（组件 `.spec` 片段）→ `dftspec.cpp`（完整 DftSpecification 装配）。
- CLI `app/specgen_main.cpp`：`specgen gen <doc.json>` → `.spec` 文本到 stdout（多文件时用 `===FILE:<name>===` 分隔，与 genconn/ctrlgen 一致）。
- CMake：加 `specgencore` 静态库 + `specgen` 可执行目标。
- **验证**：ctest `specgen_golden_*` 用 newProject（`node`）做 oracle，多组 fixture（chip datapath、multi-datapath、EDT、extra-output-path）产出与 TS **逐字节一致**；沿用现有 `ctrlgen_golden_*` 差分测试模式。

### 3.3 M1 — 桥接（dft-suite `electron/` + `core-bridge/`）

- `electron/cli.cjs`：加 `specgenGen(docJson)`（写 tmp、spawn `specgen gen`、解析 `===FILE:===`）。
- `electron/bin.cjs` + `scripts/stage-bin.sh` + `docs/PACKAGING.md`：把 `specgen` 二进制纳入定位与打包。
- `electron/preload.cjs` + `core-bridge/dft.d.ts`：暴露 `window.dft.specgen.gen(doc)`。
- `core-bridge/specgen.ts`：typed wrapper `dftSpecgen.generate(doc)`。
- **验证**：e2e 冒烟用 fixture doc 调 `dftSpecgen.generate`，输出与 M0 一致；`tsc --noEmit` 干净。

### 3.4 M2 — `specgen/` 界面（dft-suite）

- 新建 `src/specgen/`：移植 `SpecGenTab`、`DftIpNode`、`DftConfigDialog`、`ipgeom`、`ipvisual`、`anchor`、`useZoomPan`、`catalog`、`wire`、`route`、`edit`、`dft-model`、`store`、`styles.css`。
- shell：`TopBar` 加 SpecGen 作**第三个工作区 tab**；`App.tsx` body 分支 + `store/design.ts` 的 workspace 联合类型加 `specgen`。
- 实时预览：`DftConfigDialog` 的 `.spec` 预览与 `SpecGenTab` 右侧预览面板改为调防抖 `dftSpecgen.generate`（~400ms），镜像 `DfxDialog`。
- store：自成一体（palette 驱动，与 RTL 设计无耦合），localStorage 持久化 + zundo undo，模式同 `genconn/store.ts`。
- **验证**：`tsc` 干净、应用能起、放 IP → 连线 → 实时预览更新 → 生成 `.spec` 下载；与 newProject 视觉/行为一致；e2e 冒烟。

### 3.5 schema 单一真源（已确认策略）

`datapath.schema.json`（3623L）**两侧都要用**：C++ 生成 + TS 配置对话框表单渲染 + palette/端口几何。

- **canonical 放 dft-core**，内嵌进 `specgen` 二进制（CMake 步骤把 JSON 转成 C++ 字符串常量，或 raw string literal 提交同处）。
- 用小脚本把同一份 JSON **同步一份到 dft-suite**（`src/specgen/schema/datapath.schema.json`）供 TS 表单渲染。
- 加 **parity 测试**：两份 JSON 内容一致（防漂移）。

---

## 4. B 部分 — genconn 引擎增量同步

把 newProject 领先、C++ 与 dft-suite TS **两侧都缺**的特性合并，并保持两侧一致。每项都要：① dft-core C++ `genconn-core` ② dft-suite TS `genconn/core` ③ 相应 golden/parity 覆盖 ④（如有）对应 UI（Inspector/Canvas）。

### 4.1 确认的 delta

| #            | 特性                                                                                                 | 落点                                                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G1** | **BISR `omitMemCtrl`**：为真时略过 `mem_chain_select`/`mem_disable`                      | `expand`(bases 条件)、`generate`(mismatch 检查)、`edit`(compatible 需同值 + `newLikeInterface`/`portInterface` 复制)、`model`(字段)；C++ + TS 两侧                                                    |
| **G2** | **SSN `ifNamePlacement: "prefix"\|"postfix"`** ⚠️                                           | `expand`(prefix=接口名在前 / postfix=在后)、`model`(字段)；C++ + TS。**改默认 SSN 端口名**，需先跑现有 golden 判定这是行为变更并相应更新 fixtures                                                       |
| **G3** | **SSN 多接口去重键 `SSN:<interfaceName>`**                                                   | `validate`、`edit`(clientKey)；C++ + TS                                                                                                                                                                       |
| **G4** | **`placement:"pin"\|"other"` + `isDataSource` + `innerPos`**（data-source client 摆盒内） | 校验规则（`validate` + `edit` 的 other 限制）→ C++ + TS；`setInterfacePlacement`/`setDataSource`/`setInterfaceInnerPos` 及 `innerPos` 视图 → **仅 TS**（含 Inspector 开关 + Canvas 盒内渲染） |

### 4.2 防漂移守护（系统性修复）

- dft-core 侧：现有 `genconn_diff` golden 覆盖上述特性（扩 fixtures）。
- dft-suite 侧：新增 **TS ↔ newProject 一致性测试**——对一组含 omitMemCtrl/ifNamePlacement/多 SSN 接口的 doc，断言 dft-suite TS `generate`/`expand` 输出与 newProject `node` 一致。这是防止「TS 侧再次悄悄落后」的守护（`omitMemCtrl` 当初就这么漏的）。

### 4.3 验证

- dft-core `ctest` 全绿（含新增/扩展的 genconn golden）。
- dft-suite `tsc` 干净；新 TS↔newProject parity 测试绿；genconn 现有 UI 冒烟不回归。

---

## 5. 排序

1. **B 部分先行（快赢 + 去风险）**：genconn 增量较小、独立，且先建立「TS↔newProject parity 守护」范式；同时它清理了共享 `model.ts`，为 A 铺路。
2. **A 部分 M0 → M1 → M2**：SpecGen 主体，各里程碑独立可验证。
   - 注意 A 与 B 都动 `genconn/core/model.ts`（B 加 genconn 字段，A 加 `dftIps/dftWires/inSpecgen`）——B 先做可减少冲突。

（A、B 大体独立，若并行需协调 `model.ts` 的字段合并。）

## 6. 风险与注意

- **G2 是最高风险项**：`ifNamePlacement` 默认值可能改变现有 SSN 端口命名。落地前**必须**先用现有 golden/fixtures 判定：这是纯新增（默认保持旧行为）还是行为变更（需更新 golden 并知会）。不确定就停下确认。
- `datapath.ts`（355L 线性化）是 A 部分移植最易出错处；靠 M0 的逐字节 golden 兜底，fixtures 要覆盖 multi-datapath/MUX 二级链/ExtraOutputPath/EDT。
- schema 内嵌方式（codegen vs raw literal）是 M0 的一个小决策，不阻塞。
- EDT IP 支持随 SpecGen 一起来（catalog/wire/dftspec/DftIpNode 已含）。

## 7. 决策记录（已确认）

1. 范围 = 完整 SpecGen 工作区 + genconn 引擎增量同步。✅
2. 生成逻辑放 C++ `specgen-core`，预览走防抖 CLI（方案 A）。✅
3. schema 单一真源：canonical 在 dft-core（内嵌），同步副本到 dft-suite + parity 测试。✅
4. 命名：库 `specgen-core` / CLI `specgen`。✅
5. 节奏：M0 → M1 → M2，各自独立成 spec/plan（+ B 部分作为前置里程碑）。✅
