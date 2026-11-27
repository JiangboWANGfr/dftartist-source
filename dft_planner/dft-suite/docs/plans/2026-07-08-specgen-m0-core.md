# SpecGen A-M0：`specgen-core`（dft-core C++ 引擎）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 dft-core 新建 C++ 库 `specgen-core` + `specgen` CLI，把 newProject 的 SpecGen 生成引擎（SSN DataPath spec 生成）逐字节移植过来，用 newProject 的 `genDftSpec` 作 golden oracle 验证一致。

**Architecture:** 复用已验证的迁移模板（genconn-core/ctrlgen-core）：先立 golden 差分测试（RED），再逐模块移植到 GREEN。生成入口 `genDftSpec(scope)`；`scope` = 一个 `HardenDef`（含 `interfaces` + `dftIps` + `dftWires`）。引擎链：`linearizeDatapaths`(图线性化) → `emitDatapath/emitComponent`(按 schema 递归发块) → 复用 genconn-core 的 `expandInterface`(接口→真实端口名)。config 是任意嵌套 JSON，直接用 header-only `hdl::json::Value` 承载并由 `genBlock` 遍历，不做专用结构。

**Tech Stack:** C++20 + CMake/ctest；slang 无关（只用 header-only `json/JsonValue.h` + 依赖 `genconncore`）。差分 oracle = newProject `node`。

**仓库根：** `NP`=`/Users/jiangbowang/MOI/2025/dftartist/newProject`（源，只读+加 oracle）、`CORE`=`/Users/jiangbowang/MOI/2025/dftartist/dft-core`（新库）。分支：均在 `feat/genconn-sync` 之后新开 `feat/specgen-m0`（见 Task 0）。

---

## 源码地图（NP，移植目标；实现时逐一对照）

| 文件 | 作用 | C++ 落点 |
|---|---|---|
| `NP/src/core/dft-model.ts` | 类型：`DftIpType`/`DftIpInstance`/`DftConfig`/`DftEndpoint`/`DftWire` | `specgen-core/model.h` |
| `NP/src/dft/catalog.ts` (DFT_CATALOG + `catalogEntry`) | IP 端口表（role: master/secondary/clock/data/chain）——图算法靠它分边 | `specgen-core/catalog.{h,cpp}`（`dftIpSize` UI-only 不移） |
| `NP/src/dft/schema.ts` + `schema/datapath.schema.json`(3623L) | 组件 schema 注册表（props/blocks）；`componentSchema(type)` | `specgen-core/schema.{h,cpp}` + 内嵌 JSON |
| `NP/src/dft/gen.ts` (`genBlock`/`ind`) | schema+data → Tessent 片段（递归） | `specgen-core/gen.{h,cpp}` |
| `NP/src/dft/datapath.ts` (`linearizeDatapaths` + 图/BFS/chain*/smux/EOP) | **dftWires 有向图 → 声明序嵌套 DataPath**（最难） | `specgen-core/datapath.{h,cpp}`（`autoLayoutPositions`/`linearizeDatapath` 单段 UI-only 不移） |
| `NP/src/dft/dftspec.ts` (`genDftSpec` + emit*) | 顶层装配：SSN 壳 + DataPath + EDT wrapper + ChainGroup | `specgen-core/dftspec.{h,cpp}` |

**入口签名：** `std::string genDftSpec(const SpecgenScope& scope);` 对齐 `NP/src/dft/dftspec.ts:99 genDftSpec(scope: HardenDef): string`。

**关键复用：** `genconn::expandInterface(const BusInterface&)`（`CORE/genconn-core/expand.h`，已在 B 部分完成并含 ifNamePlacement）——`ifacePorts` 用它把接口展开成真实端口名。specgen-core **链接 genconncore**。

---

## 设计决策（先定，减少执行期歧义）

1. **config/SpecData = `hdl::json::Value`**：`DftIpInstance.config` 与 `DpNode.params` 都存原始 JSON object；`genBlock(schema, const Value& data, depth)` 直接遍历。避免专用 DftConfig 结构。
2. **specgen-core 依赖 genconn-core**：复用 `genconn::BusInterface` + `expandInterface`。scope 的 `interfaces` 用 genconn 的 `BusInterface`（B 部分已含 busWidth/isDataSource 等本任务要读的字段）。
3. **schema 内嵌**：`datapath.schema.json` 拷进 `CORE/specgen-core/datapath.schema.json`（canonical），CMake 用 `file(READ)`+`configure_file` 生成 `schema_embedded.h`（`inline constexpr std::string_view DATAPATH_SCHEMA_JSON = R"(...)"`），启动时 `hdl::json::parse` 成 schema 树。自包含、无运行时文件依赖。（dft-suite 侧同步副本留到 A-M2。）
4. **oracle**：newProject 加 `tools/specgen-oracle.ts`——用 `src/dft/edit.ts` 的 `addDftIp/addDftWire/setDftIpConfig` 造 scope（参照 `NP/test/dft-dftspec.test.ts` 的 `scope()`），`emit-doc` 输出整 doc JSON、`gen` 输出 `genDftSpec` 文本。C++ `specgen gen <doc.json>` 解析 doc、取 `ui.rootDefId` 的 def 作 scope、跑移植的 `genDftSpec`。
5. **CLI 输出**：`specgen gen <doc.json>` → `.spec` 文本到 stdout（单文件，无需 `===FILE:===`）。

---

## File Structure

**CORE 新增：**
- `specgen-core/model.h` — `DftEndpoint`/`DftWire`/`DftIpInstance`（config=`json::Value`）/`SpecgenScope`（含 `genconn::HardenDef`-式 interfaces + dftIps + dftWires）。
- `specgen-core/document.{h,cpp}` — `parseScope(jsonText)` → `SpecgenScope`（解析 interfaces/dftIps/dftWires/config）。
- `specgen-core/schema.{h,cpp}` — `PropSchema`/`BlockSchema` + `componentSchema(type)`（从内嵌 JSON 解析）。
- `specgen-core/catalog.{h,cpp}` — `DftPort`(name/dir/role) + `catalogEntry(ipType)`（静态表，移植 DFT_CATALOG）。
- `specgen-core/gen.{h,cpp}` — `ind(n)` + `genBlock(schema, data, depth)`。
- `specgen-core/datapath.{h,cpp}` — `DpNode`/`ExtraOutput`/`LinearizedDatapath`/`DatapathN` + `linearizeDatapaths(scope)` + 内部图算法。
- `specgen-core/dftspec.{h,cpp}` — `genDftSpec(scope)` + emit* 助手。
- `specgen-core/datapath.schema.json` — 从 NP 拷贝的 canonical schema。
- `app/specgen_main.cpp` — `specgen gen <doc.json>` CLI。
- `test/fixtures/specgen_*.doc.json` — golden fixtures。
- `test/diff/specgen_diff.sh` — 差分脚本。
- `CMakeLists.txt`（顶层）+ `test/CMakeLists.txt` — 加库/可执行/schema 内嵌步骤/ctest。

**NP 新增：** `tools/specgen-oracle.ts`（emit-doc/gen 模式）。

---

## Task 0: 分支

- [ ] 在两仓从当前分支新开工作分支：
```bash
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core checkout -b feat/specgen-m0
git -C /Users/jiangbowang/MOI/2025/dftartist/newProject checkout -b feat/specgen-m0
```
（dft-suite 本 M0 不改代码，其 `docs/plans/` 已有本文件。）

---

## Task 1: 库骨架 + model + schema 内嵌 + CLI stub + oracle → RED

**Files:** `CORE/specgen-core/{model.h,document.h,document.cpp,schema.h,schema.cpp,datapath.schema.json}`, `CORE/app/specgen_main.cpp`, `CORE/CMakeLists.txt`, `NP/tools/specgen-oracle.ts`, `CORE/test/fixtures/specgen_basic.doc.json`, `CORE/test/diff/specgen_diff.sh`, `CORE/test/CMakeLists.txt`

- [ ] **Step 1: model.h**（对照 `NP/src/core/dft-model.ts`）
```cpp
#pragma once
#include <optional>
#include <string>
#include <vector>
#include "json/JsonValue.h"
#include "genconn-core/model.h"   // 复用 genconn::BusInterface
namespace specgen {
struct DftEndpoint {           // tagged union: kind=="ip" | "iface"
    std::string kind;
    std::string ipId, port;                 // kind=="ip"
    std::string instanceId, interfaceId, pin; // kind=="iface"（pin: "in"|"out"）
};
struct DftWire { std::string id; DftEndpoint from, to; };
struct DftIpInstance {
    std::string id, ipType, instanceName;
    hdl::json::Value config;                 // 任意嵌套 overrides；缺省空 object
    std::optional<std::string> moduleName;
};
struct SpecgenScope {
    std::string designName;
    std::vector<genconn::BusInterface> interfaces;  // 供 expandInterface
    std::vector<DftIpInstance> dftIps;
    std::vector<DftWire> dftWires;
};
}
```

- [ ] **Step 2: document.cpp `parseScope`** —— 解析 doc JSON、取 `ui.rootDefId` 的 def：读其 `designName`/`interfaces`(复用 genconn 风格解析 BusInterface：id/busType/role/interfaceName/powerDomain/pdMatchOnly/busWidth/bscanVariant/**isDataSource**/**ifNamePlacement**)/`dftIps`(id/ipType/instanceName/config 原样存 Value/moduleName)/`dftWires`(id + from/to：按有无 `ipId` 判 kind)。config 缺省为空 object Value。

- [ ] **Step 3: schema 内嵌 + schema.cpp**
拷 `NP/src/dft/schema/datapath.schema.json` → `CORE/specgen-core/datapath.schema.json`。CMake（Task1 Step7）用 `configure_file`/`file(READ)` 生成 `schema_embedded.h`。`schema.{h,cpp}`：
```cpp
struct PropSchema { std::string name; /* type/values/default 生成用不到，可略 */ };
struct BlockSchema { std::optional<std::string> name; bool hasId; // id != null
                     std::vector<PropSchema> props; std::vector<BlockSchema> blocks; };
const BlockSchema& componentSchema(const std::string& ipType);  // 缺失抛 runtime_error（对齐 schema.ts:14）
```
启动时（首次调用惰性 or 静态初始化）`hdl::json::parse(DATAPATH_SCHEMA_JSON)` → 建 `components` 映射。只需 `props[].name` 与 `blocks[]`(name/id-ness/递归)——对齐 gen.ts `genBlock` 实际读取的字段。

- [ ] **Step 4: CLI stub** `app/specgen_main.cpp`：
```cpp
// specgen gen <doc.json>
int main(int argc, char** argv) {
  if (argc < 3 || std::string(argv[1]) != "gen") { std::cerr << "usage: specgen gen <doc.json>\n"; return 2; }
  std::string json = /* read file argv[2] */;
  specgen::SpecgenScope scope = specgen::parseScope(json);
  std::cout << specgen::genDftSpec(scope);   // Task4 前先返回 ""，保证可编译可跑
  return 0;
}
```
（本 Task 先让 `genDftSpec` 返回空串或最外壳，仅要求可编译、可运行。真正实现分散在 Task 2–4。）

- [ ] **Step 5: oracle** `NP/tools/specgen-oracle.ts`（照 `genconn-oracle.ts` + `dft-dftspec.test.ts` 的 `scope()`）：
```ts
import { readFileSync } from "node:fs";
import { addDftIp, addDftWire, setDftIpConfig } from "../src/dft/edit.ts";
import { genDftSpec } from "../src/dft/dftspec.ts";
import { serialize } from "../src/core/document.ts";
import type { GenConnDocument } from "../src/core/model.ts";
import type { DftEndpoint } from "../src/core/dft-model.ts";
function basicScope(): GenConnDocument { /* 完全照搬 dft-dftspec.test.ts:scope() 的构造，返回 doc（不取 def） */ }
const mode = process.argv[2];
if (mode === "emit-doc") process.stdout.write(serialize(basicScope()));   // 造 fixture
else if (mode === "gen") {                                                // gen <doc.json>：读外部 doc（TS/C++ 同一文件）
  const d: GenConnDocument = JSON.parse(readFileSync(process.argv[3], "utf8"));
  const def = d.library.defs.find((x) => x.id === d.ui.rootDefId) ?? d.library.defs[0];
  process.stdout.write(genDftSpec(def));
} else { console.error("usage: specgen-oracle <emit-doc | gen <doc.json>>"); process.exit(2); }
```

- [ ] **Step 6: fixture + 差分脚本**
`cd $NP && node tools/specgen-oracle.ts emit-doc > $CORE/test/fixtures/specgen_basic.doc.json`（把 oracle 造的 doc 落盘作 fixture）。
`CORE/test/diff/specgen_diff.sh`（照 `genconn_features_diff.sh`）：
```bash
#!/usr/bin/env bash
set -euo pipefail
SPECGEN=${SPECGEN:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/build/specgen}
ORACLE_DIR=${ORACLE_DIR:-/Users/jiangbowang/MOI/2025/dftartist/newProject}
NODE=${NODE:-node}
DOC=${DOC:-/Users/jiangbowang/MOI/2025/dftartist/dft-core/test/fixtures/specgen_basic.doc.json}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$NODE" "$ORACLE_DIR/tools/specgen-oracle.ts" gen "$DOC" >"$tmp/ts.txt" 2>/dev/null  # TS 从同一 doc 生成
"$SPECGEN" gen "$DOC" >"$tmp/cxx.txt"                                                # C++ 从同一 doc 生成
diff -q "$tmp/ts.txt" "$tmp/cxx.txt" >/dev/null && echo "MATCH specgen ($(wc -c <"$tmp/cxx.txt")B)" || { echo MISMATCH; diff "$tmp/ts.txt" "$tmp/cxx.txt" | head -60; exit 1; }
```
> TS 与 C++ 读**同一份** `$DOC`，各自跑 `genDftSpec`，逐字节比对——无内置-scope 耦合。

- [ ] **Step 7: CMake + ctest**
顶层 `CMakeLists.txt`：加 `specgen-core/datapath.schema.json` 的 `configure_file`→`schema_embedded.h`；`add_library(specgencore ...)` 链接 `genconncore`；`add_executable(specgen app/specgen_main.cpp)` 链接 `specgencore`。`test/CMakeLists.txt` 在 `if(HDL_NODE)` 块加 `specgen_diff`（`SPECGEN=$<TARGET_FILE:specgen> NODE=${HDL_NODE}`）。

- [ ] **Step 8: 建 + 跑 → 确认 RED**
`cd $CORE && cmake -S . -B build && cmake --build build --target specgen -j && ctest --test-dir build -R specgen_diff --output-on-failure`
Expected: **FAIL** —— `genDftSpec` 还是空/壳，与 oracle 全文不符。RED 确认。

- [ ] **Step 9: Commit**
```bash
cd $CORE && git add specgen-core/ app/specgen_main.cpp CMakeLists.txt test/ && git commit -m "feat(specgen-core): lib skeleton + model/schema/CLI + differential scaffold (RED)"
cd $NP && git add tools/specgen-oracle.ts && git commit -m "test(specgen): oracle (emit-doc/gen) for C++ port"
```

---

## Task 2: catalog + gen（`genBlock`）

**Files:** `CORE/specgen-core/{catalog.h,catalog.cpp,gen.h,gen.cpp}`, `CORE/CMakeLists.txt`

- [ ] **Step 1: catalog** —— 逐条移植 `NP/src/dft/catalog.ts` 的 `DFT_CATALOG`（只需 `ports`: `name`/`dir`(in|out)/`role`(master|secondary|clock|data|chain, 可空)；`side`/`label`/`abbr`/`dftIpSize` 是 UI，不移）。`catalogEntry(ipType)` 缺失抛错。
```cpp
struct DftPort { std::string name; std::string dir; std::optional<std::string> role; };
struct DftCatalogEntry { std::string ipType; std::vector<DftPort> ports; };
const DftCatalogEntry& catalogEntry(const std::string& ipType);
```
逐类型对照：ScanHost(DATA_IN/OUT/CLOCK + chain_group_out[out,chain])、Receiver1xPipeline/OutputPipeline/Pipeline/BusFrequencyDivider/BusFrequencyMultiplier=simple(DATA_IN/OUT/CLOCK)、Multiplexer(master_bus_data_in[in,master]/secondary_bus_data_in[in,secondary]/DATA_OUT/CLOCK)、Fifo(DATA_IN/OUT + bus_in_clock/bus_out_clock[in,clock])、DesignInstance(DATA_IN/OUT)、Edt(ssh_chain_group_in[in,chain])。其中 `DATA_IN=bus_data_in[in,data]`、`DATA_OUT=bus_data_out[out,data]`、`CLOCK=bus_clock[in,clock]`。

- [ ] **Step 2: gen** —— 移植 `NP/src/dft/gen.ts`：
```cpp
std::string ind(int n);  // "  " * n
// data 为 json::Value(object)；schema 决定发哪些 prop/block
std::string genBlock(const BlockSchema& bs, const hdl::json::Value& data, int depth);
```
严格对照 gen.ts：props——`data[name]` 是非空(trim 后非空)字符串则 `ind(depth) + name.padEnd(28) + ": " + v + ";\n"`。blocks——`hasId`(id!=null)：`data[name]` 须数组，逐项取 `id`(字符串)→`(id)`，`inner=genBlock(b,item,depth+1)`，`!idStr && inner 全空` 则跳过；否则 `ind + name + " (id) {\n" + inner + ind + "}\n"`。`!hasId`(singleton)：`data[name]` 须 object，`inner` 非空才发 `name {\n...}\n`。`padEnd(28)` 用手写：`name + std::string(max(0,28-name.size()),' ')`。

- [ ] **Step 3: 验证（编译 + 局部自测）**
`cd $CORE && cmake --build build --target specgen -j` 干净。可临时写个小 main/单测喂一个简单 schema+data 比对片段（可选，不提交）；或直接靠 Task4 的 golden 覆盖。`specgen_diff` 仍 RED（dftspec 未接）。

- [ ] **Step 4: Commit**
```bash
cd $CORE && git add specgen-core/ CMakeLists.txt && git commit -m "feat(specgen-core): catalog port table + genBlock (Tessent block emitter)"
```

---

## Task 3: datapath（`linearizeDatapaths` 图线性化）——最难，golden 兜底

**Files:** `CORE/specgen-core/{datapath.h,datapath.cpp}`, `CORE/CMakeLists.txt`

移植 `NP/src/dft/datapath.ts` 中 **`linearizeDatapaths` 及其依赖**（`buildGraph`/`keyOf`/`ipPortKey`/`bfsBlockingBoundaries`/`ipPath`/`reversedUnique`/`dedupByKey`/`buildNode`/`chainBackward`/`chainBackwardToIface`/`chainForward`/`buildSmuxSecondary`/`buildExtraOutputs`）。**不移** `autoLayoutPositions`、`linearizeDatapath`(单段)——UI/未用。

- [ ] **Step 1: 类型 datapath.h**（对照 datapath.ts:6–8）
```cpp
struct ExtraOutput { int outputBusWidth; std::vector<DpNode> chain; std::optional<std::string> exitInterfaceId; };
struct DpNode {
    std::string type, instanceName, id;
    hdl::json::Value params;                        // = ip.config ?? {}
    std::optional<std::string> moduleName;
    std::vector<DpNode> smux_secondary;             // 空=无
    std::vector<ExtraOutput> extra_output_paths;
    std::optional<int> secondaryInputDatapathId;
    std::optional<std::string> secondaryFeedInterfaceId;
};
struct DatapathN { int id; std::vector<DpNode> order; DftEndpoint entry, exit; int outputBusWidth; };
std::vector<DatapathN> linearizeDatapaths(const SpecgenScope& scope);
```
（`LinearizedDatapath` 无 id，本任务只需 `DatapathN`；C++ 可只保留 DatapathN。）

- [ ] **Step 2: 逐函数移植**——严格对照 datapath.ts，保持顺序/去重/停止集语义：
  - `keyOf`/`ipPortKey`：ip→`ip:<ipId>:<port>`；iface→`if:<instanceId>:<interfaceId>:<pin>`。
  - `buildGraph`：真实边(过滤 chain 端口，`catalogEntry(...).ports` 查 role=="chain")；catalog 派生内部直通边（in: 排除 clock/secondary/chain；out: 排除 clock/chain；笛卡尔积连边）。用 `std::map<std::string,std::vector<std::string>>` 存 adj/radj，`ipOf`/`ifaceIdOf`/`ipById`。**保持插入序**（TS Map 有序；用 vector-of-pairs 或有序容器，BFS/首元素取用依赖序）。
  - `bfsBlockingBoundaries`：BFS，屏蔽中途 iface 边界（`ipOf[v]==null && v!=goal` 跳过）；用 `std::deque` 当队列、`prev` map 回溯。
  - `chainBackward`/`chainBackwardToIface`/`chainForward`：取 `radj/adj` 的**首元素** `[0]`（依赖插入序！）；owner==null 停（chainBackwardToIface/Forward 带出 ifaceId）。
  - `buildSmuxSecondary`：仅 Multiplexer；master 侧上游作 stopSet；secondary 侧 chainBackward。
  - `buildExtraOutputs`：out 口除主路径外每条出边一条 EOP；分支直落接口 vs chainForward。
  - `linearizeDatapaths`：entries=wires 里 iface&pin=="out"，exits=iface&pin=="in"；每 entry 找首个可达 exit（优先同接口 in 脚、再未占用、再其余）；`ipToDp` 跨段映射；每段 order 里 Multiplexer 判跨段 `secondaryInputDatapathId` vs 本段 `smux_secondary`+`secondaryFeedInterfaceId`；`buildExtraOutputs`。exitBusWidth = exit 接口 `busWidth` || 4。
  > **陷阱**：所有"取 preds/succ 第一个""Map 遍历序"都依赖 JS 插入序——C++ 必须用保持插入序的结构（不要 `std::unordered_map` 做会被遍历/首元素依赖的容器）。`??`/truthiness 对空串按 `!empty()`。

- [ ] **Step 3: 编译**
`cd $CORE && cmake --build build --target specgen -j` 干净。`specgen_diff` 仍 RED（dftspec 未接），但 datapath 已可被 Task4 调用。

- [ ] **Step 4: Commit**
```bash
cd $CORE && git add specgen-core/ CMakeLists.txt && git commit -m "feat(specgen-core): linearizeDatapaths graph linearization (port of datapath.ts)"
```

---

## Task 4: dftspec（`genDftSpec` 装配）→ 让 specgen_basic 变 GREEN

**Files:** `CORE/specgen-core/{dftspec.h,dftspec.cpp}`, `CORE/CMakeLists.txt`

移植 `NP/src/dft/dftspec.ts` 全部：`ifacePorts`/`emitDatapathConnections`/`emitEopConnections`/`emitExtraOutputPath`/`emitComponent`/`emitDatapath`/`genDftSpec`。

- [ ] **Step 1: ifacePorts** —— `expandInterface`(复用 genconn)→挑 `width==1`=时钟、`width>1&&input`=dataIn、`width>1&&output`=dataOut；返回 clockIn/clockOut/dataIn/dataOut（对照 dftspec.ts:12–24）。

- [ ] **Step 2: emit* 助手** —— 严格对照 dftspec.ts：Connections 四行规则（bus_clock_in/bus_data_in 来自 entry，bus_clock_out/bus_data_out 来自 exit；缺则省行；全无不出块），`padEnd(28)`，`ind(depth)` 缩进层级与 TS 完全一致。`emitComponent` 特判：DesignInstance 用 `moduleName` 当组件名；ScanHost 注入 `ChainGroup(id)`（来自 `ChainGroups` map）；Multiplexer 注入 `input_datapath_id`/`secondary_bus_data_in` 拓扑键并入 `Connections`；递归 `smux_secondary` + `extra_output_paths`。

- [ ] **Step 3: genDftSpec** —— `linearizeDatapaths` + EDT 过滤 + `chainGroupsBySh` 构建（ScanHost→EDT chain 线分组）+ 发 `read_config_data...{ SSN { ijtag_host_interface: Sib(ssn); <datapaths> } <EDT wrapper if any> }`。EDT 块：每 EDT `Controller (name) { genBlock(EdtSchema, config(+ssh_chain_group if chained)) }`。对照 dftspec.ts:99–148 逐行。

- [ ] **Step 4: 接 CLI + 跑 golden → GREEN**
`cd $CORE && cmake --build build --target specgen -j && ctest --test-dir build -R specgen_diff --output-on-failure`
Expected: **MATCH**（C++ genDftSpec 从 `specgen_basic.doc.json` 生成 == oracle `gen`，逐字节）。若 MISMATCH，diff 定位到具体行，回到对应 emit/datapath 修——不要改 oracle 迁就。

- [ ] **Step 5: Commit**
```bash
cd $CORE && git add specgen-core/ CMakeLists.txt && git commit -m "feat(specgen-core): genDftSpec assembly (SSN shell + DataPath + EDT) — specgen_basic golden GREEN"
```

---

## Task 5: 扩 golden 覆盖（multi-datapath / EDT / EOP / MUX-secondary）

**Files:** `NP/tools/specgen-oracle.ts`, `CORE/test/fixtures/specgen_*.doc.json`, `CORE/test/diff/specgen_diff.sh`(参数化多 fixture), `CORE/test/CMakeLists.txt`

- [ ] **Step 1: 加场景 scope** —— 在 `specgen-oracle.ts` 加带参数的 scope 构造，覆盖 NP 现有测试的形态：`dft-multidatapath`(多段+跨段 input_datapath_id)、`dft-extraoutput`(EOP)、EDT+ChainGroup（`dft-dftspec.test.ts` 的 EDT 部分）、MUX secondary（`dft-datapath`）。参照对应测试文件复刻构造。用 `specgen-oracle.ts <scenario> emit-doc|gen`。

- [ ] **Step 2: 落盘 fixture + 参数化差分**
每场景 `emit-doc` 落 `CORE/test/fixtures/specgen_<scenario>.doc.json`；`specgen_diff.sh` 支持 `SCENARIO`/`DOC` 参数；`test/CMakeLists.txt` 每场景一个 `add_test(NAME specgen_<scenario>_diff ...)`。

- [ ] **Step 3: 全绿**
`cd $CORE && cmake --build build --target specgen -j && ctest --test-dir build -R specgen --output-on-failure`
Expected: 所有 `specgen_*_diff` MATCH。任一 MISMATCH → 该形态的 datapath/dftspec 移植有偏差，按 diff 修。

- [ ] **Step 4: Commit**
```bash
cd $NP && git add tools/specgen-oracle.ts && git commit -m "test(specgen): multi-datapath/EDT/EOP/mux-secondary oracle scenarios"
cd $CORE && git add test/ && git commit -m "test(specgen): golden fixtures for multi-datapath/EDT/EOP/mux-secondary"
```

---

## Task 6: 收尾（全量 ctest + README/CMake）

**Files:** `CORE/genconn-core/README.md` 或 `CORE/README.md`, `CORE/CMakeLists.txt`

- [ ] **Step 1: 全量测试**
`cd $CORE && ctest --test-dir build --output-on-failure` → 全绿（含 genconn/ctrlgen/specgen 所有差分 + 单测），确认 specgen-core 未破坏既有。

- [ ] **Step 2: README** —— `CORE/README.md` 的库表加 `specgen-core (libspecgencore)` 行（作用 + 状态 ✅ M0），对齐现有五库风格。

- [ ] **Step 3: Commit**
```bash
cd $CORE && git add README.md CMakeLists.txt && git commit -m "docs(specgen-core): register in README; M0 complete"
```

---

## Self-Review 备注

- **Spec 覆盖**：dft-model→model(Task1)、schema/catalog/gen(Task1/2)、datapath(Task3)、dftspec(Task4)、golden 覆盖(Task1/5)、收尾(Task6)。UI-only（autoLayoutPositions/dftIpSize/route/ipgeom）明确不在 M0。
- **最大风险**：Task3 datapath 图算法——JS Map/数组**插入序**语义必须用保持序的 C++ 容器复刻；`preds[0]`/`succ[0]`/遍历序若用无序容器会静默偏差。golden（Task4/5 多形态）是唯一裁判，覆盖 multi/EOP/mux-secondary/EDT 才算移植到位。
- **依赖**：specgen-core 链接 genconncore（复用 `expandInterface` + `BusInterface`）；须先合/含 B 部分（ifNamePlacement 已在 expand）——本分支从 `feat/genconn-sync` 之后开，天然包含。
- **类型一致**：config/params 全程 `hdl::json::Value`；schema 只用 `props[].name` + `blocks`(name/hasId/递归)，与 gen.ts 实读字段对齐。
- **前置**：能 `cmake -S . -B build` 配置 dft-core、`node` 可用。
