# Phase B — BScan 生成移植进 dft-core（C++）设计

- 日期：2026-07-13
- 状态：**草案，待用户确认**（Phase A UI-first 已完成于分支 `feat/specgen-bscan-layers-ui`）
- 承接：`docs/specs/2026-07-13-specgen-bscan-layers-sync-design.md` §5
- 真源：`newProject/src/dft/{bscan.ts, dftspec.ts, schema/bscan.schema.json}` + `test/dft-bscan.test.ts`

## 1. 目标

把 BScan datapath 的**生成**移植进 C++ 引擎（dft-core `specgen-core`），使 `specgen gen <doc.json>` 在 SSN/EDT 之外再输出 `EmbeddedBoundaryScan { HostBScanInterface (...) {...} }` 块；dft-suite 预览（走 `dftSpecgen.generate` CLI）随之显示真 BScan 文本，**无需改 dft-suite UI**。逐字节对齐 newProject TS 输出。

## 2. 架构 / 关键探测结论（已 probe dft-core 源码）

- **生成真源是 C++**：`app/specgen_main.cpp` 的 `specgen gen` → `specgen::genDftSpec(scope)`（`specgen-core/dftspec.cpp`）。一旦 `genDftSpec` 追加 bscan 块，CLI 零改动即带出。
- **插入点**：`dftspec.cpp:genDftSpec` 现在顺序 `SSN{}` → `EDT{}`；在最后的 `out += "}\n"` 之前追加 `out += bscanBlock;`（bscan 文本已在 `ind(1)` 层，与 SSN/EDT 同级）。顺序 **SSN → EDT → EmbeddedBoundaryScan**（同 TS `dftspec.ts:153`）。
- **一处结构改动**：C++ `genDftSpec` 现无条件 `linearizeDatapaths(scope)` 且总发 `SSN{`；TS 用 try/catch + `if(dps.length)` 守卫，纯 BScan scope 不致命。需照 TS `dftspec.ts:100-155` 改：`try{dps=linearizeDatapaths}catch{ssnErr}`；`if(!dps.length && !bscanBlock) throw`；`if(dps.length){ SSN... EDT... }`；末尾 `out += bscanBlock`。
- **model 是字符串型**：`DftIpInstance.ipType` / `BusInterface.busType` 均 `std::string`（非枚举），`"EBScanPipeline"`/`"BSCAN"` 无需类型系统改动；`document.cpp` 已解析任意 ipType + `role/interfaceName/config`。
- **catalog 缺 EBScanPipeline**：`catalog.cpp` 静态表无此条目，`buildGraph` 需要它建 `scan_in→scan_out` 内部直通边。必须加（ports: scan_in in/data、scan_out out/data、bscan_clock in/clock）。
- **图助手是文件私有**：`buildGraph`/`keyOf`/`Graph` 在 `datapath.cpp` 匿名命名空间；bscan.cpp 要复用，须**提升到 `datapath.h`** 导出（TS 里 `bscan.ts` 就 `import { buildGraph, keyOf } from "./datapath.ts"`）。
- **genBlock 可复用**：`gen.cpp:genBlock(schema,data,depth)` + `ind(n)` 直接用（同 TS `bscan.ts:70`）。
- **schema 内嵌**：CMake `file(READ datapath.schema.json)` + `configure_file(schema_embedded.h.in)` 生成 `DATAPATH_SCHEMA_JSON` 常量；`schema.cpp:componentSchema` 查它。加 bscan 同法：`file(READ bscan.schema.json)` + 第二个常量 `BSCAN_SCHEMA_JSON` + `schema.cpp:bscanComponentSchema(name)`（独立函数，不改 `componentSchema`——生成只经 `bscanComponentSchema`）。
- **golden 是差分对拍**（不是冻结 .spec）：`test/diff/specgen_diff.sh` 跑 newProject oracle(`tools/specgen-oracle.ts gen`) 与 C++ CLI 同 doc 后 `diff`。oracle 已支持 bscan（TS `dftspec.ts` 调 `genBScanSpec`）→ **加 fixture doc.json + 一条 ctest 即可，无需改 oracle/脚本**。

## 3. 范围拆分 / 分支

- **M0 — dft-core（C++ 引擎，主力）**：分支 `feat/specgen-bscan`（off `main`）。见 §4。
- **M1 — dft-suite（桥接/parity，极小）**：续在现分支 `feat/specgen-bscan-layers-ui`。见 §5。

M0 与 M1 解耦：M0 让 CLI 出 bscan 文本；M1 只做 schema 防漂移 parity + 重编重 stage `specgen` 二进制。

## 4. M0 详细（dft-core，TDD/golden）

移植 checklist（每步照 newProject 逐行，逐字节对齐）：

1. **catalog**：`specgen-core/catalog.cpp` 加 `EBScanPipeline` 条目（ports 同 TS `catalog.ts:47-56`）。
2. **bscan.schema.json**：`newProject/src/dft/schema/bscan.schema.json` → `specgen-core/bscan.schema.json`（逐字节）；`CMakeLists.txt:70-74` 旁加 `file(READ ... BSCAN_SCHEMA_CONTENT)` + `schema_embedded.h.in` 加 `BSCAN_SCHEMA_JSON` 常量。
3. **schema.cpp/.h**：加 lazy `bscanComponents()` 解析 `BSCAN_SCHEMA_JSON` + `const BlockSchema& bscanComponentSchema(const std::string&)`（缺则抛 `no bscan schema for <name>`），复用现有 `parseBlock`。
4. **导出图助手**：把 `buildGraph`/`keyOf`/`Graph`（现 `datapath.cpp` 匿名）提升到 `datapath.h` 声明 + `datapath.cpp` 去匿名，供 bscan.cpp 用。
5. **bscan.cpp/.h**：port `linearizeBScanChain`（单链：从 BSCAN client `out` 起，单后继前进，secondary `in→out` 直通，DI→`EBScanInstance`、其余→`EBScanPipeline`，到 client `in` 止；断链/分支/环抛错）+ `genBScanSpec`（`EmbeddedBoundaryScan{ HostBScanInterface(clientName){ 每节点 type(name){ genBlock } } }`，缩进 ind(1..4)）。真源 `newProject/src/dft/bscan.ts`。
6. **dftspec.cpp**：`genDftSpec` 按 §2「一处结构改动」加 SSN 守卫 + 末尾 `out += genBScanSpec(scope)`。
7. **CMake**：`CMakeLists.txt:76-82` 源文件表加 `specgen-core/bscan.cpp`。
8. **golden**：`test/fixtures/specgen_bscan.doc.json`（BScan-only：BSCAN client + secondary + EBScanPipeline 链，对齐 `test/dft-bscan.test.ts` 的 `bscanScope`/`fig14`）+ `test/CMakeLists.txt` 加 `specgen_bscan_diff`（DOC= 该 fixture，`if(HDL_NODE)` 守卫）。另加一个 `specgen_bscan_mixed`（SSN+BScan 并存）fixture+test。

**验收**：`cmake --build build && ctest`（新 bscan_diff 绿 + 现有 diff 不回归）。差分对拍即逐字节 golden。

## 5. M1 详细（dft-suite）

1. **parity 守卫**：新增 `tests/unit/specgen-bscan-schema-parity.test.ts`（照 `specgen-schema-parity.test.ts`）——`src/specgen/schema/bscan.schema.json` == dft-core `specgen-core/bscan.schema.json` 逐字节（`existsSync` skip 缺 checkout）。两侧同源 newProject → 天然一致。
2. **schema sync 脚本**：若 `scripts/sync-schema.sh` 存在，加 bscan.schema.json 到拷贝清单（防漂移）。
3. **重 stage 二进制**：`scripts/stage-bin.sh` 重跑，把新编 `specgen` 拷进；确认 dft-suite 预览对一个 BScan scope 出 `EmbeddedBoundaryScan` 文本（真机/e2e 冒烟）。

**验收**：dft-suite `npm test` 绿（含新 parity）；真机截图：种一个 BScan scope → 预览面板出 `EmbeddedBoundaryScan{...}`。

## 6. 测试矩阵（golden 对拍 + 单测）

- **linearize**（隐含在对拍里，也可加 C++ 单测）：图 14 顺序 = client_out, from_r1, r1, to_r1, from_r2, r2, to_r2；无 client→跳过；断链→抛。
- **genBScanSpec**：`bscanScope` / `fig14` 逐字节（对拍 oracle）。
- **genDftSpec**：BScan-only（无 SSN 块）、SSN+BScan 混合（两块并存）。
- **DI→EBScanInstance**：DesignInstance 进链生成 `EBScanInstance(inst){}`（newProject `scopeWithDI` 用例）。

## 7. 明确不做

- dft-suite specgen UI 已在 Phase A 就位（放置/连线/图层/配置弹窗），M2 无。
- BScan 画布上的高级摆位/对称复制等，非本期。
- §2 提到的 C++ `componentSchema` 不加 BSCAN 兜底（generation 只经 `bscanComponentSchema`；dft-suite TS 侧的兜底是给配置弹窗的，已在 Phase A 有）。
