# 1838jtag Phase B2（dft-core specgen-core C++）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 让 dft-core 的 C++ `specgen` 对 IEEE 1838 STAP 生成设计 §4 的嵌套 spec 段 `Jtag1838 { HostScanInterface { Tap { HostSTap { STapPipeline/STap/SecondaryHostScanInterface … } } } }`。

**Architecture:** 镜像 `specgen-core/bscan.cpp`（`linearizeBScanChain`+`genBScanSpec`）：新增 `jtag1838.cpp/h` 的 `linearizeStapChain`（walk JTAG1838 client 链）+ `genJtag1838Spec`（包 §4 嵌套壳）。STAP 元件 config 用内嵌 `jtag1838.schema.json`（Phase A 同款）→ `jtag1838ComponentSchema`。`dftspec.cpp` 的 `genDftSpec` 追加一段。STAP 可放置 IP 需进 `catalog.cpp`（否则 `buildGraph` 抛）。**自包含验证**：C++ 单测 `parseScope(doc)→genDftSpec` 逐字节比对 frozen 期望串；不碰 legacy `newProject` oracle。

**Tech Stack:** C++17、CMake（`build/`）、`ctest`、`hdl::json`、plain `main()`+`<cassert>` 单测。

**基线：** dft-core 分支 `feat/1838jtag`（B1 已在其上）。设计真源：dft-suite `docs/specs/2026-07-14-1838jtag-new-bus-type-design.md` §4/§7.2。

**§7.2 linearizer 映射决策（镜像 BScan，本计划采用）：**
- JTAG1838 `client` 接口 → 链起点；`HostScanInterface (<clientName|"client">)` 壳名。
- `STapPipeline` dftIp → `STapPipeline` 节点（类比 EBScanPipeline）。
- `DesignInstance` dftIp → `STap` 节点（类比 BScan 的 DI→EBScanInstance）。
- `STap` dftIp（若用户直接摆放）→ `STap` 节点。
- 到达某 `secondary` JTAG1838 接口的 in 脚（in→out 直通）→ `SecondaryHostScanInterface` 节点（类比 SecondaryEBScanInterface，来自接口而非 dftIp）。
- 节点顺序 = 链遍历顺序，全部落在单个 `HostSTap` 里；`Tap` 固定 id `1`，`HostSTap` 无 id。

---

## 文件结构（dft-core 仓）

| 文件 | 责任 | 动作 |
|---|---|---|
| `specgen-core/catalog.cpp` | ipType→端口（图算法用）| 改（+STapPipeline/STap 条目）|
| `specgen-core/jtag1838.schema.json` | STAP 元件 config schema | 新建（照搬 Phase A 同名文件）|
| `CMakeLists.txt` | 内嵌 schema | 改（+file(READ)）|
| `specgen-core/schema_embedded.h.in` | 内嵌串 | 改（+JTAG1838_SCHEMA_JSON）|
| `specgen-core/schema.h` / `schema.cpp` | schema 访问 | 改（+`jtag1838ComponentSchema`）|
| `specgen-core/jtag1838.h` / `jtag1838.cpp` | linearizer + 生成 | 新建 |
| `specgen-core/dftspec.cpp` | genDftSpec 挂段 | 改 |
| `CMakeLists.txt` | specgencore 加源 | 改（+jtag1838.cpp）|
| `test/unit/test_specgen_jtag1838.cpp` | frozen golden 单测 | 新建 |
| `test/CMakeLists.txt` | 注册单测 | 改 |

---

## Task 1: STAP catalog 条目 + schema 内嵌 + 访问器

**Files:** `specgen-core/catalog.cpp`、`specgen-core/jtag1838.schema.json`（新）、`CMakeLists.txt`、`specgen-core/schema_embedded.h.in`、`specgen-core/schema.h`、`specgen-core/schema.cpp`、`test/unit/test_specgen_jtag1838.cpp`（新，先放 schema 断言）、`test/CMakeLists.txt`

- [ ] **Step 1: 写失败测试（schema 访问器）**

创建 `test/unit/test_specgen_jtag1838.cpp`：

```cpp
#undef NDEBUG
#include "schema.h"

#include <cassert>
#include <cstdio>

using namespace specgen;

int main() {
    // schema 访问器：STap 有 4 个顶层 props，两个子块 Interface/SecondaryHostScanInterface
    const BlockSchema& stap = jtag1838ComponentSchema("STap");
    assert(stap.props.size() == 4);
    assert(stap.blocks.size() == 2);
    const BlockSchema& sp = jtag1838ComponentSchema("STapPipeline");
    assert(sp.blocks.size() == 1);  // Interface

    std::printf("test_specgen_jtag1838 OK\n");
    return 0;
}
```

- [ ] **Step 2: 注册单测**

`test/CMakeLists.txt`（挨着 `specgen_bscan` 那类 add_test）：

```cmake
add_executable(test_specgen_jtag1838 unit/test_specgen_jtag1838.cpp)
target_link_libraries(test_specgen_jtag1838 PRIVATE specgencore)
add_test(NAME specgen_jtag1838_unit COMMAND test_specgen_jtag1838)
```

- [ ] **Step 3: 构建确认 FAIL**

```bash
cd /Users/jiangbowang/MOI/2025/dftartist/dft-core
cmake --build build -j
ctest --test-dir build -R specgen_jtag1838_unit --output-on-failure
```
Expected: 编译失败（`jtag1838ComponentSchema` 未声明）——即"失败"。确认后实现。

- [ ] **Step 4: 建 `specgen-core/jtag1838.schema.json`**

内容与 dft-suite Phase A 的 `src/specgen/schema/jtag1838.schema.json` **逐字节相同**（STap/STapPipeline/SecondaryHostScanInterface 三组件）。从该文件复制：

```bash
cp /Users/jiangbowang/MOI/2025/dftartist/dft-suite/src/specgen/schema/jtag1838.schema.json \
   /Users/jiangbowang/MOI/2025/dftartist/dft-core/specgen-core/jtag1838.schema.json
```
（若 dft-suite 分支未 checkout，则手抄该 JSON；结构见设计文档 §7.2。）

- [ ] **Step 5: CMake 内嵌**

`CMakeLists.txt`，在 `bscan.schema.json` 的 `file(READ ...)` 行后加：
```cmake
file(READ ${CMAKE_SOURCE_DIR}/specgen-core/jtag1838.schema.json SPECGEN_JTAG1838_SCHEMA_CONTENT)
```

`specgen-core/schema_embedded.h.in`，在 `BSCAN_SCHEMA_JSON` 行后加：
```cpp
inline constexpr std::string_view JTAG1838_SCHEMA_JSON = R"SPECGENJTAG1838(@SPECGEN_JTAG1838_SCHEMA_CONTENT@)SPECGENJTAG1838";
```

- [ ] **Step 6: schema.h 声明 + schema.cpp 实现访问器**

`specgen-core/schema.h`，在 `bscanComponentSchema` 声明后加：
```cpp
// STAP(1838) 组件 schema（STap/STapPipeline/SecondaryHostScanInterface）；缺则抛。
const BlockSchema& jtag1838ComponentSchema(const std::string& name);
```

`specgen-core/schema.cpp`，仿 `bscanComponents()`/`bscanComponentSchema` 加（匿名 namespace 内加访问器，文件尾部加导出函数）：
```cpp
const std::map<std::string, BlockSchema>& jtag1838Components() {
    static const std::map<std::string, BlockSchema> m = [] {
        std::map<std::string, BlockSchema> out;
        Value root = hdl::json::parse(std::string(JTAG1838_SCHEMA_JSON));
        if (const Value* comps = root.find("components"))
            for (const auto& [k, v] : comps->obj) out.emplace(k, parseBlock(v));
        return out;
    }();
    return m;
}
```
导出（匿名 namespace 外，仿 `bscanComponentSchema`）：
```cpp
const BlockSchema& jtag1838ComponentSchema(const std::string& name) {
    const auto& m = jtag1838Components();
    auto it = m.find(name);
    if (it == m.end()) throw std::runtime_error("no jtag1838 schema for " + name);
    return it->second;
}
```

- [ ] **Step 7: catalog.cpp 加 STAP 可放置 IP（否则 buildGraph 抛）**

`specgen-core/catalog.cpp`，在 `table` 里 `EBScanPipeline` 条目后加（`buildGraph` 对每个 dftIp 调 `catalogEntry`；STAP 数据通路口 scan_in/scan_out + clock）：
```cpp
        {"STapPipeline",
         {{"scan_in", "in", "data"},
          {"scan_out", "out", "data"},
          {"tck", "in", "clock"}}},
        {"STap",
         {{"scan_in", "in", "data"},
          {"scan_out", "out", "data"},
          {"tck", "in", "clock"}}},
```
> `SecondaryHostScanInterface` 不进 catalog——它作为 spec 节点来自 secondary **接口**（§7.2），不作为 `scope.dftIps` 出现（与 BScan 的 SecondaryEBScanInterface 一致）。

- [ ] **Step 8: 构建确认 PASS**

```bash
cmake --build build -j
ctest --test-dir build -R specgen_jtag1838_unit
```
Expected: PASS（`STap` props=4/blocks=2、`STapPipeline` blocks=1）。

- [ ] **Step 9: Commit**

```bash
git add specgen-core/catalog.cpp specgen-core/jtag1838.schema.json CMakeLists.txt \
  specgen-core/schema_embedded.h.in specgen-core/schema.h specgen-core/schema.cpp \
  test/unit/test_specgen_jtag1838.cpp test/CMakeLists.txt
git commit -m "feat(specgen-core): STAP catalog + jtag1838 schema 内嵌 + 访问器"
```

---

## Task 2: linearizeStapChain + genJtag1838Spec + dftspec 挂段（frozen golden 单测）

**Files:** `specgen-core/jtag1838.h`（新）、`specgen-core/jtag1838.cpp`（新）、`specgen-core/dftspec.cpp`、`CMakeLists.txt`（specgencore 加源）、`test/unit/test_specgen_jtag1838.cpp`（追加端到端断言）

- [ ] **Step 1: 追加失败测试（frozen golden 端到端）**

在 `test/unit/test_specgen_jtag1838.cpp` 顶部补 include：
```cpp
#include "dftspec.h"
#include "document.h"
#include <string>
```
在 `main()` 的 `std::printf` 前追加（构造最小 STAP 链：client cl → STapPipeline sp1 → secondary r1 → 回 cl）：
```cpp
    const char* doc = R"({
      "schemaVersion": 1,
      "library": { "defs": [ {
        "id": "d", "designName": "d", "designLevel": "physical_block", "designType": "hierarchical",
        "interfaces": [
          { "id": "cl", "busType": "JTAG1838", "role": "client" },
          { "id": "r1", "busType": "JTAG1838", "role": "secondary", "interfaceName": "r1" }
        ],
        "childInstances": [], "connections": [],
        "dftIps": [
          { "id": "sp1", "ipType": "STapPipeline", "instanceName": "sp1", "position": {"x":0,"y":0} }
        ],
        "dftWires": [
          { "id": "w1", "from": {"kind":"iface","instanceId":"d","interfaceId":"cl","pin":"out"},
                        "to":   {"kind":"ip","ipId":"sp1","port":"scan_in"} },
          { "id": "w2", "from": {"kind":"ip","ipId":"sp1","port":"scan_out"},
                        "to":   {"kind":"iface","instanceId":"d","interfaceId":"r1","pin":"in"} },
          { "id": "w3", "from": {"kind":"iface","instanceId":"d","interfaceId":"r1","pin":"out"},
                        "to":   {"kind":"iface","instanceId":"d","interfaceId":"cl","pin":"in"} }
        ]
      } ] },
      "ui": { "openDefId": "d", "rootDefId": "d" }
    })";
    SpecgenScope scope = parseScope(doc);
    std::string got = genDftSpec(scope);
    std::string want =
        "read_config_data -in_wrapper $dftspec -rep -from_string {\n"
        "  Jtag1838 {\n"
        "    HostScanInterface (1) {\n"
        "      Tap (1) {\n"
        "        HostSTap {\n"
        "          STapPipeline (sp1) {\n"
        "          }\n"
        "          SecondaryHostScanInterface (r1) {\n"
        "          }\n"
        "        }\n"
        "      }\n"
        "    }\n"
        "  }\n"
        "}\n";
    if (got != want) {
        std::fprintf(stderr, "--- got ---\n%s\n--- want ---\n%s\n", got.c_str(), want.c_str());
        assert(false);
    }
```

- [ ] **Step 2: 构建确认 FAIL**

```bash
cmake --build build -j
ctest --test-dir build -R specgen_jtag1838_unit --output-on-failure
```
Expected: 编译失败（`genJtag1838Spec`/`jtag1838.h` 尚不存在，`dftspec.cpp` 未挂段）——先建骨架让它编译且**运行时** FAIL：本步只需确认它编译不过或运行不出 `want`。

- [ ] **Step 3: 建 `specgen-core/jtag1838.h`**

```cpp
#pragma once
// STAP(IEEE 1838) datapath 生成（镜像 bscan.h）：单链，无分支。
#include <string>
#include <vector>

#include "json/JsonValue.h"
#include "model.h"

namespace specgen {

struct StapNode {
    std::string type;  // "STapPipeline" | "STap" | "SecondaryHostScanInterface"
    std::string name;
    hdl::json::Value params;
};
struct StapChain {
    std::string clientName;
    std::vector<StapNode> order;
};

// 无 JTAG1838 client 接口 -> false；断链/分支/环 -> 抛。
bool linearizeStapChain(const SpecgenScope& scope, StapChain& out);
// scope -> Jtag1838 文本块（ind(1) 层）；无链 -> 空串。
std::string genJtag1838Spec(const SpecgenScope& scope);

}  // namespace specgen
```

- [ ] **Step 4: 建 `specgen-core/jtag1838.cpp`**

镜像 `bscan.cpp`，节点类型改为 STAP 映射（§7.2）：

```cpp
#include "jtag1838.h"

#include <stdexcept>
#include <unordered_set>

#include "datapath.h"
#include "gen.h"
#include "schema.h"

namespace specgen {

namespace {
using hdl::json::Value;

std::optional<std::string> ipOwnerOf(const Graph& g, const std::string& k) {
    auto it = g.ipOf.find(k);
    if (it == g.ipOf.end()) return std::nullopt;
    return it->second;
}
}  // namespace

bool linearizeStapChain(const SpecgenScope& scope, StapChain& out) {
    const genconn::BusInterface* client = nullptr;
    for (const auto& i : scope.interfaces)
        if (i.busType == "JTAG1838" && i.role == "client") { client = &i; break; }
    if (!client) return false;

    Graph g = buildGraph(scope);
    DftEndpoint startEp;
    startEp.kind = "iface";
    startEp.instanceId = scope.id;
    startEp.interfaceId = client->id;
    startEp.pin = "out";
    DftEndpoint endEp = startEp;
    endEp.pin = "in";
    std::string startKey = keyOf(startEp);
    std::string endKey = keyOf(endEp);

    std::vector<StapNode> order;
    std::unordered_set<std::string> seenIp, seenSec;
    std::unordered_set<std::string> guard{startKey};

    auto oneSucc = [&](const std::string& k) -> std::string {
        auto it = g.adj.find(k);
        const std::vector<std::string>& succ = it == g.adj.end() ? std::vector<std::string>{} : it->second;
        if (succ.empty()) throw std::runtime_error("STAP 链断裂：走不到 client 的 in 脚");
        if (succ.size() > 1) throw std::runtime_error("STAP 链出现分支（当前不支持）");
        return succ[0];
    };

    std::string cur = startKey;
    while (cur != endKey) {
        auto ipId = ipOwnerOf(g, cur);
        if (ipId && !seenIp.count(*ipId)) {
            seenIp.insert(*ipId);
            const DftIpInstance* ip = g.ipById.at(*ipId);
            StapNode n;
            n.type = ip->ipType == "DesignInstance" ? "STap" : ip->ipType;  // DI→STap；STapPipeline/STap 原名
            n.name = ip->instanceName;
            if (ip->config.type == Value::Type::Null) n.params.type = Value::Type::Object;
            else n.params = ip->config;
            order.push_back(std::move(n));
        }
        std::string next;
        auto fit = g.ifaceIdOf.find(cur);
        std::string pin = cur.substr(cur.rfind(':') + 1);
        if (fit != g.ifaceIdOf.end() && pin == "in") {
            const std::string& ifId = fit->second;
            const genconn::BusInterface* itf = nullptr;
            for (const auto& f : scope.interfaces)
                if (f.id == ifId) { itf = &f; break; }
            if (!itf || itf->role != "secondary") throw std::runtime_error("STAP 链到达非 secondary 的 in 脚");
            if (!seenSec.count(ifId)) {
                seenSec.insert(ifId);
                StapNode n;
                n.type = "SecondaryHostScanInterface";
                n.name = itf->interfaceName.value_or(ifId);
                n.params.type = Value::Type::Object;
                order.push_back(std::move(n));
            }
            DftEndpoint outEp;
            outEp.kind = "iface";
            outEp.instanceId = scope.id;
            outEp.interfaceId = ifId;
            outEp.pin = "out";
            next = keyOf(outEp);
        } else {
            next = oneSucc(cur);
        }
        if (guard.count(next)) throw std::runtime_error("STAP 链有环");
        guard.insert(next);
        cur = next;
    }

    out.clientName = client->interfaceName.value_or("client");
    out.order = std::move(order);
    return true;
}

std::string genJtag1838Spec(const SpecgenScope& scope) {
    StapChain chain;
    if (!linearizeStapChain(scope, chain) || chain.order.empty()) return "";

    std::string inner;
    for (const auto& n : chain.order) {
        const BlockSchema& comp = jtag1838ComponentSchema(n.type);
        std::string body = genBlock(comp, n.params, 6);
        inner += ind(5) + n.type + " (" + n.name + ") {\n" + body + ind(5) + "}\n";
    }
    return ind(1) + "Jtag1838 {\n"
         + ind(2) + "HostScanInterface (1) {\n"   // 固定 id 1，与设计 §4 一致；chain.clientName 暂不用于壳名
         + ind(3) + "Tap (1) {\n"
         + ind(4) + "HostSTap {\n"
         + inner
         + ind(4) + "}\n"
         + ind(3) + "}\n"
         + ind(2) + "}\n"
         + ind(1) + "}\n";
}

}  // namespace specgen
```

- [ ] **Step 5: `dftspec.cpp` 挂段**

在 `specgen-core/dftspec.cpp` 顶部 include 区加 `#include "jtag1838.h"`。

在 `genDftSpec` 里 `std::string bscanBlock = genBScanSpec(scope);`（~192 行）后加：
```cpp
    std::string jtag1838Block = genJtag1838Spec(scope);
```
把空判断（`if (dps.empty() && bscanBlock.empty())`）改为：
```cpp
    if (dps.empty() && bscanBlock.empty() && jtag1838Block.empty()) {
```
在 `out += bscanBlock;`（~258 行）后加：
```cpp
    out += jtag1838Block;
```

- [ ] **Step 6: CMake 把 jtag1838.cpp 加进 specgencore**

`CMakeLists.txt` 的 `add_library(specgencore STATIC ... bscan.cpp)` 列表加一行 `specgen-core/jtag1838.cpp`。

- [ ] **Step 7: 构建确认 PASS**

```bash
cmake --build build -j
ctest --test-dir build -R specgen_jtag1838_unit --output-on-failure
```
Expected: PASS（`got == want` 逐字节）。

- [ ] **Step 8: 全量回归（既有 SSN/EDT/BScan golden 不破）**

```bash
ctest --test-dir build
```
Expected: 全绿——尤其 `specgen_diff`/`specgen_bscan_diff` 等对 TS oracle 的 golden 仍逐字节一致（证明 `genDftSpec` 挂段未影响既有段：SSN/BScan 无 JTAG1838 client 时 `genJtag1838Spec` 返回空串）。

- [ ] **Step 9: Commit**

```bash
git add specgen-core/jtag1838.h specgen-core/jtag1838.cpp specgen-core/dftspec.cpp \
  CMakeLists.txt test/unit/test_specgen_jtag1838.cpp
git commit -m "feat(specgen-core): genJtag1838Spec linearizer + dftspec 挂段 + frozen golden 单测"
```

---

## Self-Review

**1. Spec coverage（§4/§7.2）：**
- §4 嵌套壳 `Jtag1838{HostScanInterface{Tap{HostSTap{…}}}}` → Task 2 `genJtag1838Spec` + frozen golden 钉死。✓
- §7.2 映射（DI→STap、STapPipeline→STapPipeline、secondary iface→SecondaryHostScanInterface）→ Task 2 linearizer。✓
- STAP 元件 config schema（§7.2 = specgen2/add_ijtag_ips.py）→ Task 1 内嵌 jtag1838.schema.json。✓
- catalog 门槛（buildGraph 对每 dftIp 调 catalogEntry）→ Task 1 加 STapPipeline/STap 条目。✓

**2. Placeholder scan：** 无 TBD；linearizer/生成/挂段/单测均给完整 C++。✓

**3. Type consistency：**
- `StapNode{type,name,params}`/`StapChain{clientName,order}`（Task 2 Step 3）与 `linearizeStapChain`/`genJtag1838Spec`（Step 4）一致。✓
- `jtag1838ComponentSchema`（Task 1 Step 6 声明）被 `genJtag1838Spec`（Task 2 Step 4）调用，名字一致。✓
- `genDftSpec` 三段空判断 + 追加 `jtag1838Block`（Task 2 Step 5）与 §4 输出一致。✓
- 单测用 `parseScope`/`genDftSpec`/`SpecgenScope`/`BlockSchema` 均为 specgen-core 实际符号。✓

**壳名决策（已按 §4 定死）：** `HostScanInterface (1)` + `Tap (1)` 固定 id，与设计 §4 一致（不用 client 名）。`linearizeStapChain` 仍算出 `chain.clientName` 但生成器不用于壳名（保留字段，将来若要按 client 命名再接）。frozen golden 已按此定。
