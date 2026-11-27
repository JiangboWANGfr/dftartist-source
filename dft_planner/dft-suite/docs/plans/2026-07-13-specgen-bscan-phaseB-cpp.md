# Phase B — BScan 生成移植进 dft-core(C++) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 BScan datapath 生成从 newProject TS 移植进 dft-core C++ 引擎，使 `specgen gen` 在 SSN/EDT 后再输出 `EmbeddedBoundaryScan{...}` 块；dft-suite 预览随之显示，逐字节对齐 TS。

**Architecture:** 逐行 port `newProject/src/dft/bscan.ts` → `specgen-core/bscan.cpp`，复用现有 `genBlock`/`ind`/graph 助手（mirror `datapath.cpp` 风格）；内嵌 `bscan.schema.json`；`genDftSpec` 加 SSN 守卫 + 追加 bscan 块。golden = 差分对拍（`specgen_diff.sh` 跑 TS oracle vs C++ CLI，逐字节 diff）。dft-suite 侧仅加 parity 测试 + 重 stage 二进制。

**Tech Stack:** C++17 (dft-core, CMake/ctest) + TS oracle（newProject）；dft-suite TS（node --test / Playwright）。

**真源：** `newProject/src/dft/bscan.ts`（`linearizeBScanChain`+`genBScanSpec`）、`newProject/src/dft/schema/bscan.schema.json`、`newProject/test/dft-bscan.test.ts`（golden 参考）。**风格模板：** `dft-core/specgen-core/datapath.cpp`（graph 走法）。设计：`docs/specs/2026-07-13-specgen-bscan-phaseB-cpp-design.md`。

**分支：** dft-core 新建 `feat/specgen-bscan`（off `main`）承载 Task B1–B5；dft-suite M1（Task B6）直接在 `master`（用户已授权直接合并）。

**关键既有事实（已 probe）：**
- `DftIpInstance.ipType` / `genconn::BusInterface.busType` 是 `std::string`（非枚举），`"EBScanPipeline"`/`"BSCAN"` 无需类型改动；`document.cpp` 已解析任意 ipType + role/interfaceName。
- `Graph`/`keyOf`/`buildGraph` 现在 `datapath.cpp` 匿名命名空间（文件私有）——bscan.cpp 复用须先提升到 `datapath.h`。
- `genBlock(const BlockSchema&, const hdl::json::Value&, int)` + `ind(int)` 在 `gen.h`；`componentSchema` 在 `schema.h`。
- golden 是差分对拍（非冻结 .spec）：oracle `newProject/tools/specgen-oracle.ts gen <doc.json>` 已支持 bscan → 只加 fixture + ctest。

---

## Task B1: catalog 加 EBScanPipeline（dft-core）

**Files:** Modify `specgen-core/catalog.cpp`（静态表 `catalog()`）

- [ ] **Step 1: 加条目**

在 `catalog.cpp` 的 `static const std::vector<DftCatalogEntry> table = { ... }` 里，`{"Edt", {{"ssh_chain_group_in", "in", "chain"}}},` **之后**加：

```cpp
        {"EBScanPipeline",
         {{"scan_in", "in", "data"},
          {"scan_out", "out", "data"},
          {"bscan_clock", "in", "clock"}}},
```

（对齐 `newProject/src/dft/catalog.ts` 的 EBScanPipeline 端口：scan_in in/data、scan_out out/data、bscan_clock in/clock。C++ `DftCatalogEntry` 无 `bus` 字段，生成不需要。）

- [ ] **Step 2: 构建 + 现有 ctest 不回归**

Run: `cmake --build build -j && ctest --test-dir build`
Expected: 全绿（新条目暂未被用，纯新增）。

- [ ] **Step 3: 提交**

```bash
git add specgen-core/catalog.cpp
git commit -m "feat(specgen): catalog 加 EBScanPipeline 端口（BScan 图构建用）"
```

---

## Task B2: bscan.schema.json 内嵌 + bscanComponentSchema（dft-core）

**Files:** Create `specgen-core/bscan.schema.json`；Modify `CMakeLists.txt`、`specgen-core/schema_embedded.h.in`、`specgen-core/schema.cpp`、`specgen-core/schema.h`

- [ ] **Step 1: 拷 schema（逐字节）**

```bash
cp ../newProject/src/dft/schema/bscan.schema.json specgen-core/bscan.schema.json
```
（含 `HostBScanInterface`/`EBScanPipeline`/`EBScanInstance`/`SecondaryEBScanInterface` 四组件，顶层 `{ "components": {...} }`，与 datapath.schema.json 同形，现有 `parseBlock` 直接吃。）

- [ ] **Step 2: CMake 读入第二个 schema**

`CMakeLists.txt` 中现有（约 70-74 行）：
```cmake
file(READ ${CMAKE_SOURCE_DIR}/specgen-core/datapath.schema.json SPECGEN_SCHEMA_CONTENT)
configure_file(specgen-core/schema_embedded.h.in
  ${CMAKE_BINARY_DIR}/generated/schema_embedded.h @ONLY)
```
在 `file(READ ... SPECGEN_SCHEMA_CONTENT)` 之后、`configure_file` 之前插入：
```cmake
file(READ ${CMAKE_SOURCE_DIR}/specgen-core/bscan.schema.json SPECGEN_BSCAN_SCHEMA_CONTENT)
```

- [ ] **Step 3: 模板加第二个常量**

`specgen-core/schema_embedded.h.in` 现为单行常量。改为两常量：
```cpp
#pragma once
#include <string_view>
namespace specgen {
inline constexpr std::string_view DATAPATH_SCHEMA_JSON = R"SPECGENSCHEMA(@SPECGEN_SCHEMA_CONTENT@)SPECGENSCHEMA";
inline constexpr std::string_view BSCAN_SCHEMA_JSON = R"SPECGENBSCAN(@SPECGEN_BSCAN_SCHEMA_CONTENT@)SPECGENBSCAN";
}
```

- [ ] **Step 4: schema.cpp/.h 加 bscanComponentSchema**

`schema.h`，在 `componentSchema` 声明后加：
```cpp
// BScan 组件 schema（HostBScanInterface/EBScanPipeline/EBScanInstance/SecondaryEBScanInterface）；
// 缺则抛。按名取（有些名非 DftIpType）。
const BlockSchema& bscanComponentSchema(const std::string& name);
```

`schema.cpp`，在匿名命名空间加第二个 lazy map（紧挨 `components()`）：
```cpp
const std::map<std::string, BlockSchema>& bscanComponents() {
    static const std::map<std::string, BlockSchema> m = [] {
        std::map<std::string, BlockSchema> out;
        Value root = hdl::json::parse(std::string(BSCAN_SCHEMA_JSON));
        if (const Value* comps = root.find("components"))
            for (const auto& [k, v] : comps->obj) out.emplace(k, parseBlock(v));
        return out;
    }();
    return m;
}
```
并在命名空间外加实现：
```cpp
const BlockSchema& bscanComponentSchema(const std::string& name) {
    const auto& m = bscanComponents();
    auto it = m.find(name);
    if (it == m.end()) throw std::runtime_error("no bscan schema for " + name);
    return it->second;
}
```
（复用现有 `parseBlock`；`BSCAN_SCHEMA_JSON` 由 `schema_embedded.h` 提供。不改 `componentSchema`——生成只经 `bscanComponentSchema`。）

- [ ] **Step 5: 构建 + ctest 不回归**

Run: `cmake --build build -j && ctest --test-dir build`
Expected: 全绿（`bscanComponentSchema` 暂未被调用，纯新增；确认内嵌 header 生成无误）。

- [ ] **Step 6: 提交**

```bash
git add specgen-core/bscan.schema.json specgen-core/schema.cpp specgen-core/schema.h specgen-core/schema_embedded.h.in CMakeLists.txt
git commit -m "feat(specgen): 内嵌 bscan.schema.json + bscanComponentSchema"
```

---

## Task B3: 提升 graph 助手到 datapath.h（dft-core，纯重构）

**Files:** Modify `specgen-core/datapath.h`、`specgen-core/datapath.cpp`

bscan.cpp 需要 `buildGraph`/`keyOf` 及 `Graph` 结构（现 `datapath.cpp` 匿名命名空间）。把它们导出，行为不变。

- [ ] **Step 1: datapath.h 声明 Graph/keyOf/buildGraph**

`datapath.h`，在 `linearizeDatapaths` 声明之前加：
```cpp
// 供 bscan.cpp 复用的图（endpoint key -> 邻接/所属 ip/接口 id）。key 见 keyOf。
struct Graph {
    std::unordered_map<std::string, std::vector<std::string>> adj, radj;
    std::unordered_map<std::string, std::optional<std::string>> ipOf;  // iface -> nullopt
    std::unordered_map<std::string, const DftIpInstance*> ipById;
    std::unordered_map<std::string, std::string> ifaceIdOf;
};
std::string keyOf(const DftEndpoint& ep);
Graph buildGraph(const SpecgenScope& scope);
```
并在 `datapath.h` 顶部 include 加 `#include <unordered_map>`。

- [ ] **Step 2: datapath.cpp 去匿名**

`datapath.cpp` 中把 `struct Graph {...}`、`std::string keyOf(...)`、`Graph buildGraph(...)` 三者移出匿名 `namespace {}`（放到 `namespace specgen {` 内、匿名块外，或直接删掉它们在匿名块内的定义改为 `specgen::` 成员）。**最简做法**：把这三个定义整体从匿名命名空间移到文件内 `namespace specgen {` 顶层（`#include "datapath.h"` 已带声明）。其余匿名助手（`ipPortKey`/`roleEq`/`ipOfNull`/`ipOfOwner`/`dedupByKey`/`buildNode`/BFS 等）保持匿名不动。

- [ ] **Step 3: 构建 + 全 ctest 绿（零行为变化）**

Run: `cmake --build build -j && ctest --test-dir build`
Expected: 全绿（重构，输出不变；`specgen_diff` 等所有对拍不回归）。

- [ ] **Step 4: 提交**

```bash
git add specgen-core/datapath.h specgen-core/datapath.cpp
git commit -m "refactor(specgen): 导出 Graph/keyOf/buildGraph 供 bscan 复用"
```

---

## Task B4: BScan golden fixtures + ctest（dft-core，先失败）

**Files:** Create `test/fixtures/specgen_bscan.doc.json`、`test/fixtures/specgen_bscan_mixed.doc.json`；Modify `test/CMakeLists.txt`

- [ ] **Step 1: BScan-only fixture**

Create `test/fixtures/specgen_bscan.doc.json`（外层 envelope 键对齐 `test/fixtures/specgen_basic.doc.json`——先读它确认 `schemaVersion`/`library.defs`/`ui.rootDefId`/`ctrlIps` 等键名；scope 内容对齐 `newProject/test/dft-bscan.test.ts` 的 `bscanScope`）：

```json
{
  "schemaVersion": 1,
  "library": { "defs": [ {
    "id": "d", "designName": "d", "designLevel": "physical_block", "designType": "hierarchical",
    "interfaces": [
      { "id": "cl", "busType": "BSCAN", "role": "client" },
      { "id": "r1", "busType": "BSCAN", "role": "secondary", "interfaceName": "r1" }
    ],
    "childInstances": [], "connections": [],
    "dftIps": [
      { "id": "pf", "ipType": "EBScanPipeline", "instanceName": "from_r1", "position": { "x": 0, "y": 0 } },
      { "id": "pt", "ipType": "EBScanPipeline", "instanceName": "to_r1", "position": { "x": 0, "y": 0 } }
    ],
    "dftWires": [
      { "id": "w1", "from": { "kind": "iface", "instanceId": "d", "interfaceId": "cl", "pin": "out" }, "to": { "kind": "ip", "ipId": "pf", "port": "scan_in" } },
      { "id": "w2", "from": { "kind": "ip", "ipId": "pf", "port": "scan_out" }, "to": { "kind": "iface", "instanceId": "d", "interfaceId": "r1", "pin": "in" } },
      { "id": "w3", "from": { "kind": "iface", "instanceId": "d", "interfaceId": "r1", "pin": "out" }, "to": { "kind": "ip", "ipId": "pt", "port": "scan_in" } },
      { "id": "w4", "from": { "kind": "ip", "ipId": "pt", "port": "scan_out" }, "to": { "kind": "iface", "instanceId": "d", "interfaceId": "cl", "pin": "in" } }
    ]
  } ] },
  "ui": { "openDefId": "d", "rootDefId": "d" },
  "ctrlIps": [], "dfxInstances": [], "moduleDsNext": 1, "muxDsNext": 1
}
```

- [ ] **Step 2: 混合 fixture（SSN + BScan 并存）**

Create `test/fixtures/specgen_bscan_mixed.doc.json` = 上面基础上再加一条 SSN datapath（对齐 `dft-bscan.test.ts` 的 `mixedScope`）：给 `interfaces` 加 `{ "id": "sx", "busType": "SSN", "role": "client", "busWidth": 4 }`；给 `dftIps` 加 `{ "id": "sh", "ipType": "ScanHost", "instanceName": "ssh_1", "position": { "x": 0, "y": 0 } }`；给 `dftWires` 加 `{ "id": "s1", "from": { "kind": "iface", "instanceId": "d", "interfaceId": "sx", "pin": "out" }, "to": { "kind": "ip", "ipId": "sh", "port": "bus_data_in" } }` 与 `{ "id": "s2", "from": { "kind": "ip", "ipId": "sh", "port": "bus_data_out" }, "to": { "kind": "iface", "instanceId": "d", "interfaceId": "sx", "pin": "in" } }`。

- [ ] **Step 3: ctest 注册（对齐现有 specgen_edt_diff 块）**

`test/CMakeLists.txt`，在现有 `specgen_muxsecondary_diff` 那组 `add_test` 后（同 `if(HDL_NODE)` 守卫域内）加：
```cmake
  add_test(NAME specgen_bscan_diff
    COMMAND ${CMAKE_COMMAND} -E env SPECGEN=$<TARGET_FILE:specgen> NODE=${HDL_NODE}
            DOC=${CMAKE_SOURCE_DIR}/test/fixtures/specgen_bscan.doc.json
            bash ${CMAKE_SOURCE_DIR}/test/diff/specgen_diff.sh)
  add_test(NAME specgen_bscan_mixed_diff
    COMMAND ${CMAKE_COMMAND} -E env SPECGEN=$<TARGET_FILE:specgen> NODE=${HDL_NODE}
            DOC=${CMAKE_SOURCE_DIR}/test/fixtures/specgen_bscan_mixed.doc.json
            bash ${CMAKE_SOURCE_DIR}/test/diff/specgen_diff.sh)
```

- [ ] **Step 4: 跑新 golden，确认失败（红）**

Run: `cmake --build build -j && ctest --test-dir build -R "specgen_bscan"`
Expected: **FAIL** —— C++ `genDftSpec` 现不发 bscan 块（且 BScan-only 会因 `linearizeDatapaths` 抛「无 path」而 CLI 报错），diff MISMATCH。这正是 Task B5 要转绿的红测。

- [ ] **Step 5: 提交（红测入库）**

```bash
git add test/fixtures/specgen_bscan.doc.json test/fixtures/specgen_bscan_mixed.doc.json test/CMakeLists.txt
git commit -m "test(specgen): BScan 差分对拍 golden（bscan-only + 混合，先红）"
```

---

## Task B5: bscan.cpp 移植 + 接入 genDftSpec（dft-core，转绿）

**Files:** Create `specgen-core/bscan.cpp`、`specgen-core/bscan.h`；Modify `specgen-core/dftspec.cpp`、`CMakeLists.txt`

**移植真源：`newProject/src/dft/bscan.ts`（先完整读它）。** 用 `datapath.cpp` 的 C++ 惯用法（`hdl::json::Value` 处理 config、`std::optional`、`Graph`）；graph 助手来自 `datapath.h`（Task B3），`genBlock`/`ind` 来自 `gen.h`，`bscanComponentSchema` 来自 `schema.h`（Task B2）。golden（Task B4）逐字节验收。

> **B4 红测暴露的额外必修项**：TS `datapath.ts:313-314` 的 `linearizeDatapaths` 只把 `busType==="SSN"` 的边界接口当 entry/exit（BSCAN/IJTAG/BISR 接口不进 SSN datapath）——这条过滤是 newProject BScan 期新增的，dft-core m0 端口**没有**。缺它 → C++ 把 BScan 边界线也当 SSN datapath → `emitComponent` 对 EBScanPipeline 抛「no datapath schema」。**Step 0 先补这条过滤**，BScan-only 才会 entries 空 → linearize 抛 → genDftSpec 守卫吞掉 → dps 空 → 不出 SSN 块。

- [ ] **Step 0: 给 linearizeDatapaths 补 busType==SSN 过滤（datapath.cpp）**

`specgen-core/datapath.cpp` 的 `linearizeDatapaths`（约 301-308），当前收集 entries/exits 无 busType 过滤：
```cpp
    std::vector<DftEndpoint> entriesRaw, exitsRaw;
    for (const auto& w : scope.dftWires) {
        if (w.from.kind == "iface" && w.from.pin == "out") entriesRaw.push_back(w.from);
        if (w.to.kind == "iface" && w.to.pin == "in") exitsRaw.push_back(w.to);
    }
```
改为只认 SSN 接口（对齐 TS）：
```cpp
    auto ifaceBus = [&](const DftEndpoint& e) -> std::string {
        for (const auto& f : scope.interfaces) if (f.id == e.interfaceId) return f.busType;
        return "";
    };
    std::vector<DftEndpoint> entriesRaw, exitsRaw;
    for (const auto& w : scope.dftWires) {
        if (w.from.kind == "iface" && w.from.pin == "out" && ifaceBus(w.from) == "SSN") entriesRaw.push_back(w.from);
        if (w.to.kind == "iface" && w.to.pin == "in" && ifaceBus(w.to) == "SSN") exitsRaw.push_back(w.to);
    }
```
（`genconn::BusInterface` 有 `id` / `busType`（std::string）。SSN-only 既有 golden 不受影响——全 SSN 接口全过。）

- [ ] **Step 1: bscan.h**

Create `specgen-core/bscan.h`：
```cpp
#pragma once
// BScan datapath 生成（C++ port of newProject/src/dft/bscan.ts）：单链，无分支。
#include <string>
#include <vector>

#include "json/JsonValue.h"
#include "model.h"

namespace specgen {

struct BScanNode {
    std::string type;  // "EBScanPipeline" | "SecondaryEBScanInterface" | "EBScanInstance"
    std::string name;
    hdl::json::Value params;  // DFT IP config（EBScanPipeline）；secondary/EBScanInstance 为空
};
struct BScanChain {
    std::string clientName;
    std::vector<BScanNode> order;
};

// 无 BSCAN client 接口 -> 返回 false（该 scope 无 BScan datapath）；断链/分支/环 -> 抛。
bool linearizeBScanChain(const SpecgenScope& scope, BScanChain& out);
// scope -> EmbeddedBoundaryScan 文本块（ind(1) 层）；无 BScan 链 -> 空串。
std::string genBScanSpec(const SpecgenScope& scope);

}  // namespace specgen
```

- [ ] **Step 2: bscan.cpp（逐行 port bscan.ts）**

Create `specgen-core/bscan.cpp`，忠实翻译 `newProject/src/dft/bscan.ts`：
- `linearizeBScanChain`：找 `busType=="BSCAN" && role=="client"` 接口；无则返回 false。`buildGraph(scope)`（datapath.h）；`startKey=keyOf({iface, scope.id, client.id, "out"})`、`endKey=...:"in"`。从 startKey 单后继前进（`g.adj[cur]`；空→抛「链断裂」，>1→抛「分支」），到 endKey 止；`guard` 集合防环。
  - 首过某 IP（`g.ipOf[cur]` 有值且未见过）→ 记节点：`type = ip.ipType=="DesignInstance" ? "EBScanInstance" : "EBScanPipeline"`，`name=ip.instanceName`，`params=ip.config`。
  - 到某 secondary 的 `in` 脚（`g.ifaceIdOf[cur]` 存在且 `pin=="in"`；pin 取 `cur.substr(cur.rfind(':')+1)`）→ 校验该接口 `role=="secondary"`（否则抛），首见记 `{"SecondaryEBScanInterface", interfaceName ?? id, {}}`，再穿到其 `out` 脚 `keyOf({iface, scope.id, ifId, "out"})`。
  - `clientName = client.interfaceName ?? "client"`。
- `genBScanSpec`：`linearizeBScanChain` false 或空 order → 返回 ""。否则：
  ```
  ind(1) + "EmbeddedBoundaryScan {\n"
    + ind(2) + "HostBScanInterface (" + clientName + ") {\n"
    + 每节点： ind(3) + type + " (" + name + ") {\n" + genBlock(bscanComponentSchema(type), node.params, 4) + ind(3) + "}\n"
    + ind(2) + "}\n"
    + ind(1) + "}\n"
  ```
  （缩进/字面量对齐 bscan.ts:63-78；node.params 为空 Value 时 genBlock 输出空体。）

- [ ] **Step 3: CMake 加 bscan.cpp**

`CMakeLists.txt` 的 `add_library(specgencore STATIC ... specgen-core/dftspec.cpp)` 源文件表里加一行 `specgen-core/bscan.cpp`。

- [ ] **Step 4: dftspec.cpp 接入（SSN 守卫 + 追加 bscan 块）**

`specgen-core/dftspec.cpp`：顶部 include 加 `#include "bscan.h"` 与 `#include <stdexcept>`（若未含）。把 `genDftSpec` 改为（对齐 TS `dftspec.ts:100-155`）：
```cpp
std::string genDftSpec(const SpecgenScope& scope) {
    std::vector<DatapathN> dps;
    std::exception_ptr ssnErr;
    try { dps = linearizeDatapaths(scope); } catch (...) { ssnErr = std::current_exception(); }
    std::string bscanBlock = genBScanSpec(scope);
    if (dps.empty() && bscanBlock.empty()) {
        if (ssnErr) std::rethrow_exception(ssnErr);
        throw std::runtime_error("datapath needs a boundary in/out");
    }
    // ... edts 计算 + chainGroupsBySh 不变 ...
    std::string out = "read_config_data -in_wrapper $dftspec -rep -from_string {\n";
    if (!dps.empty()) {
        out += ind(1) + "SSN {\n";
        out += ind(2) + pad28("ijtag_host_interface") + ": Sib(ssn);\n";
        for (const auto& dp : dps) out += emitDatapath(scope, dp, std::to_string(dp.id), 2, chainGroupsBySh);
        out += ind(1) + "}\n";
        if (!edts.empty()) { /* ...EDT 块原样... */ }
    }
    out += bscanBlock;
    out += "}\n";
    return out;
}
```
即：`dps` 改为 try/catch 得到；`bscanBlock` 早算；空空则（重）抛；SSN+EDT 整段裹进 `if(!dps.empty())`；末尾 `out += bscanBlock;` 在 `out += "}\n";` 前。**edts/chainGroupsBySh 计算与 EDT 块内部逻辑一字不改**，只是移进守卫。

- [ ] **Step 5: 跑 golden，确认转绿 + 全 ctest 不回归**

Run: `cmake --build build -j && ctest --test-dir build`
Expected: `specgen_bscan_diff` + `specgen_bscan_mixed_diff` **PASS**（逐字节对齐 TS oracle）；现有 `specgen_diff`/`specgen_edt_diff`/… 全绿。若 mismatch，`bash test/diff/specgen_diff.sh` 手跑看 diff 逐行修 bscan.cpp。

- [ ] **Step 6: 提交**

```bash
git add specgen-core/bscan.cpp specgen-core/bscan.h specgen-core/dftspec.cpp CMakeLists.txt
git commit -m "feat(specgen): 移植 BScan 生成(bscan.cpp) + genDftSpec 接入 EmbeddedBoundaryScan 块"
```

---

## Task B6: dft-suite M1 —— parity 守卫 + 重 stage 二进制（dft-suite, master）

**Files:** Create `tests/unit/specgen-bscan-schema-parity.test.ts`；Modify `scripts/sync-schema.sh`（若存在）；重跑 `scripts/stage-bin.sh`

- [ ] **Step 1: parity 测试（照 datapath 版）**

先读 `tests/unit/specgen-schema-parity.test.ts` 确认 `CANONICAL` 路径变量。Create `tests/unit/specgen-bscan-schema-parity.test.ts`：
```ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// 防漂移：UI 侧 bscan.schema.json 必须逐字节 == dft-core canonical。缺 checkout 时跳过。
const CANONICAL = `${process.env.DFT_CORE_DIR || "../dft-core"}/specgen-core/bscan.schema.json`;
const LOCAL = "src/specgen/schema/bscan.schema.json";
const have = existsSync(CANONICAL);

test("UI bscan.schema.json == dft-core canonical (byte-identical)", { skip: !have }, () => {
  assert.strictEqual(readFileSync(LOCAL, "utf8"), readFileSync(CANONICAL, "utf8"));
});
```
（dft-suite 的 `src/specgen/schema/bscan.schema.json` 已在 Phase A Task 6 从 newProject 拷入；dft-core 的在 Task B2 从同源拷入 → 天然一致。若不一致，以 dft-core canonical 为准覆盖 UI 副本。）

- [ ] **Step 2: sync 脚本补 bscan（若有）**

若存在 `scripts/sync-schema.sh`，把 `bscan.schema.json` 加进它的拷贝清单（对齐 datapath.schema.json 行）。无则跳过本步。

- [ ] **Step 3: 单测绿**

Run: `npm test`
Expected: typecheck + 全 unit 绿（含新 parity；dft-core 已建 `feat/specgen-bscan` 时 parity 真比对，否则 skip）。

- [ ] **Step 4: 重编 dft-core + 重 stage 二进制**

Run:
```bash
cmake --build ../dft-core/build -j
bash scripts/stage-bin.sh
```
Expected: 新 `specgen` 二进制拷进 dft-suite staging（stage-bin.sh 现 stage 5 个二进制含 specgen）。

- [ ] **Step 5: 真机冒烟（预览出 BScan 文本）**

用 `docs/plans` 附带手法或临时 Playwright：种一个 BScan scope（BSCAN client + EBScanPipeline 链）→ 切 SpecGen → 开 dftspec 预览 → 断言含 `EmbeddedBoundaryScan {`。截图核验。

- [ ] **Step 6: 提交**

```bash
git add tests/unit/specgen-bscan-schema-parity.test.ts scripts/sync-schema.sh
git commit -m "test(specgen): bscan.schema parity 守卫 + 重 stage specgen 二进制(M1)"
```

---

## 验证矩阵

- **dft-core**：`ctest` 全绿，`specgen_bscan_diff`（BScan-only：有 `EmbeddedBoundaryScan{}`、无 `SSN{`）+ `specgen_bscan_mixed_diff`（SSN+BScan 两块并存）逐字节对齐 TS oracle；DI→EBScanInstance 由链遍历保证（如需可加含 DesignInstance 的第三 fixture，对齐 `dft-bscan.test.ts` 的 `scopeWithDI`）。
- **dft-suite**：`npm test` 全绿（含 bscan parity）；真机预览出 `EmbeddedBoundaryScan{...}`。

## 明确不做

- BScan 画布 UI 已在 Phase A 就位（无 M2）。
- C++ `componentSchema` 不加 BSCAN 兜底（生成只经 `bscanComponentSchema`）。
- 对称复制 / 高级摆位等非本期。
