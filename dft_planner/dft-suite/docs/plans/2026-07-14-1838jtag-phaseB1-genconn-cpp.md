# 1838jtag Phase B1（dft-core genconn-core C++）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 让 dft-core 的 C++ `genconn` 二进制对 IEEE 1838 STAP 总线类 `JTAG1838` 生成正确的边界信号（`stap_*` / `<if>_[ijtag_]to_/from_*`），与 Phase A 的 TS `expand.ts` 逐字节一致。

**Architecture:** `genconn-core/expand.cpp` 是 `expand.ts` 的 C++ 直译，逐 busType 分支。加 JTAG1838 = 给 `Base` 加 `qual` 字段 + 一条 STAP 分支（clientPrefix/toPrefix/fromPrefix/basesOf）+ clientSignal/secondarySignal 注入 qual；`order.cpp` 的 `BUS_ORDER` 追加 JTAG1838（否则接口被静默丢弃，与 Phase A Task 7 同类 bug）。**自包含验证**：C++ 单测（`test/unit/`，plain `main()`+`<cassert>`，无 GTest），不碰 legacy `newProject` oracle。

**Tech Stack:** C++17、CMake（`build/` 目录、Unix Makefiles）、`ctest`、仓库自有 JSON 库 `hdl::json`。

**基线：** 在 **dft-core** 仓新建分支 `feat/1838jtag`（基于 `main`）。dft-suite 侧 Phase A 已完成（分支 dft-suite `feat/1838jtag`）。设计真源：dft-suite `docs/specs/2026-07-14-1838jtag-new-bus-type-design.md` §6.2（信号名表）。

**范围：** 仅 genconn-core。specgen-core（`genJtag1838Spec` + linearizer + schema + catalog）是独立子系统，另见 **Plan B2**。

---

## 文件结构（dft-core 仓）

| 文件 | 责任 | 动作 |
|---|---|---|
| `genconn-core/expand.h` | `Base` 结构 | 改（+`qual`）|
| `genconn-core/expand.cpp` | 逐 busType 信号展开 | 改（+JTAG1838 分支 + qual 注入 + toPrefix/fromPrefix 签名带 Base）|
| `genconn-core/order.cpp` | 端口确定序 BUS_ORDER | 改（+JTAG1838）|
| `genconn-core/model.h` | BusInterface.busType 注释 | 改（注释补 JTAG1838，可选）|
| `test/unit/test_genconn_jtag1838.cpp` | 信号名 + 排序回归 | 新建 |
| `test/CMakeLists.txt` | 注册单测 | 改（+1 target）|

---

## 设置：dft-core 建分支

- [ ] **Step 0: 在 dft-core 建 feat/1838jtag 分支**

```bash
cd /Users/jiangbowang/MOI/2025/dftartist/dft-core
git checkout -b feat/1838jtag main
git branch --show-current   # 应为 feat/1838jtag
```
（`main` 上有个未跟踪的 `test/rtl/pad/pad_cfg.json`，与本任务无关，勿提交它。）

---

## Task 1: STAP 信号展开（expand.cpp）+ C++ 单测

**Files（均在 dft-core 仓）:**
- Modify: `genconn-core/expand.h`（Base 加 qual）
- Modify: `genconn-core/expand.cpp`
- Create: `test/unit/test_genconn_jtag1838.cpp`
- Modify: `test/CMakeLists.txt`（注册 target）

- [ ] **Step 1: 写失败测试**

创建 `test/unit/test_genconn_jtag1838.cpp`：

```cpp
#undef NDEBUG  // asserts 在 Release 也要生效
#include "expand.h"
#include "model.h"

#include <cassert>
#include <cstdio>
#include <string>
#include <vector>

using namespace genconn;

static std::vector<std::string> names(const BusInterface& i) {
    std::vector<std::string> out;
    for (const auto& s : expandInterface(i)) out.push_back(s.direction + " " + s.name);
    return out;
}

int main() {
    BusInterface client;
    client.id = "c"; client.busType = "JTAG1838"; client.role = "client";
    std::vector<std::string> cexp = {
        "input stap_tck", "input stap_tms", "input stap_trst",
        "input stap_ijtag_reset", "input stap_ijtag_ce", "input stap_ijtag_se", "input stap_ijtag_ue",
        "input stap_tdi", "output stap_tdo"};
    assert(names(client) == cexp);

    BusInterface sec;
    sec.id = "s"; sec.busType = "JTAG1838"; sec.role = "secondary"; sec.interfaceName = "host_stap";
    std::vector<std::string> sexp = {
        "output host_stap_to_tck", "output host_stap_to_tms", "output host_stap_to_trst",
        "output host_stap_ijtag_to_reset", "output host_stap_ijtag_to_ce", "output host_stap_ijtag_to_se", "output host_stap_ijtag_to_ue",
        "output host_stap_to_tdi", "input host_stap_from_tdo"};
    assert(names(sec) == sexp);

    std::printf("test_genconn_jtag1838 OK\n");
    return 0;
}
```

- [ ] **Step 2: 注册单测 target 到 `test/CMakeLists.txt`**

在 `test/CMakeLists.txt` 里，紧挨现有某个 unit target（如 `test_ctrlgen_gen` 那三行）之后加：

```cmake
add_executable(test_genconn_jtag1838 unit/test_genconn_jtag1838.cpp)
target_link_libraries(test_genconn_jtag1838 PRIVATE genconncore)
add_test(NAME genconn_jtag1838 COMMAND test_genconn_jtag1838)
```
（`genconncore` 已 `PUBLIC` 暴露 `genconn-core` include 目录，`expand.h`/`model.h` 直接可见。）

- [ ] **Step 3: 构建并确认测试 FAIL**

```bash
cd /Users/jiangbowang/MOI/2025/dftartist/dft-core
cmake --build build -j        # 编辑 test/CMakeLists.txt 会触发自动 reconfigure
ctest --test-dir build -R genconn_jtag1838
```
Expected: FAIL —— 未实现 JTAG1838 分支时 `basesOf` 返回空，`expandInterface` 返回空 vector，`names()` 空，`assert(names(client)==cexp)` 失败（进程 abort）。确认看到失败再实现。

- [ ] **Step 4: 实现——`expand.h` 给 `Base` 加 `qual`**

`genconn-core/expand.h`：

```cpp
struct Base {
    std::string name;
    std::string group;  // "down" | "up"
    bool wide = false;  // true = width is busWidth (SSN data bus); else 1 bit
    std::string qual;   // leaf 前限定段（JTAG1838 reset/ce/se/ue = "ijtag_"）；位于 stap_/ifName 与 to_/from_/leaf 之间
};
```

- [ ] **Step 5: 实现——`expand.cpp` 加 JTAG1838**

`genconn-core/expand.cpp`，改动 5 处：

(a) `down`/`up` 助手补 qual 默认空 + 加 `downQ`（匿名 namespace 内，紧跟现有 `down`/`up`）：
```cpp
Base down(const std::string& name, bool wide = false) { return Base{name, "down", wide, ""}; }
Base up(const std::string& name, bool wide = false) { return Base{name, "up", wide, ""}; }
Base downQ(const std::string& name, const std::string& qual) { return Base{name, "down", false, qual}; }
```

(b) `clientPrefix`：BSCAN 分支后加一行：
```cpp
    if (i.busType == "BSCAN") return "bscan_";
    if (i.busType == "JTAG1838") return "stap_";
    return "";
```

(c) `toPrefix` 签名加 `const Base& b` 参数，末尾加 JTAG1838：
```cpp
std::string toPrefix(const BusInterface& i, const Base& b) {
    if (i.busType == "SSN") return ssnPostfix(i) ? "ssn_to_" : (ifName(i) + "_ssn_to_");
    if (i.busType == "IJTAG") return ifName(i) + "_ijtag_to_";
    if (i.busType == "BISR") return pdPrefix(i) + ifName(i) + "_bisr_to_";
    if (i.busType == "BSCAN") return ifName(i) + "_bscan_to_";
    if (i.busType == "JTAG1838") return ifName(i) + "_" + b.qual + "to_";
    return "";
}
```

(d) `fromPrefix` 同样加 `const Base& b` + JTAG1838：
```cpp
std::string fromPrefix(const BusInterface& i, const Base& b) {
    if (i.busType == "SSN") return ssnPostfix(i) ? "ssn_from_" : (ifName(i) + "_ssn_from_");
    if (i.busType == "IJTAG") return ifName(i) + "_ijtag_from_";
    if (i.busType == "BISR") return pdPrefix(i) + ifName(i) + "_bisr_from_";
    if (i.busType == "BSCAN") return ifName(i) + "_bscan_from_";
    if (i.busType == "JTAG1838") return ifName(i) + "_" + b.qual + "from_";
    return "";
}
```

(e) `basesOf`：BSCAN 分支后加 JTAG1838：
```cpp
    if (i.busType == "JTAG1838") {
        return {down("tck"), down("tms"), down("trst"),
                downQ("reset", "ijtag_"), downQ("ce", "ijtag_"),
                downQ("se", "ijtag_"), downQ("ue", "ijtag_"),
                down("tdi"), up("tdo")};
    }
```

(f) `clientSignal`：叶名前注入 qual：
```cpp
    s.name = clientPrefix(i) + b.qual + b.name + suffix(w);
```

(g) `secondarySignal`：把 `b` 传给 to/from 前缀：
```cpp
    std::string prefix = (b.group == "down") ? toPrefix(i, b) : fromPrefix(i, b);
```

> 说明：现有 4 个 busType 的 `down`/`up` 造出的 Base `qual` 恒为空 → `clientSignal` 的 `+ b.qual +` 无影响；`toPrefix`/`fromPrefix` 新增的 `b` 参数它们不读 → 输出逐字节不变。

- [ ] **Step 6: 重建并确认 PASS**

```bash
cmake --build build -j
ctest --test-dir build -R genconn_jtag1838
```
Expected: PASS（`test_genconn_jtag1838 OK`）。

- [ ] **Step 7: 全量 genconn 回归（确认没弄坏 SSN/IJTAG/BISR/BSCAN）**

```bash
ctest --test-dir build -R 'genconn'
```
Expected: 全绿（`genconn_diff`、`genconn_features_diff` 等既有 golden 仍与 TS oracle 逐字节一致——证明现有 4 类未受影响）。

- [ ] **Step 8: Commit（在 dft-core 仓）**

```bash
cd /Users/jiangbowang/MOI/2025/dftartist/dft-core
git add genconn-core/expand.h genconn-core/expand.cpp test/unit/test_genconn_jtag1838.cpp test/CMakeLists.txt
git commit -m "feat(genconn-core): JTAG1838(IEEE 1838 STAP) 信号展开 + C++ 单测"
```

---

## Task 2: 端口排序 BUS_ORDER 补 JTAG1838 + 回归断言

**Files:**
- Modify: `genconn-core/order.cpp`
- Modify: `genconn-core/model.h`（busType 注释，可选）
- Modify: `test/unit/test_genconn_jtag1838.cpp`（追加排序断言）

- [ ] **Step 1: 追加失败断言到 `test/unit/test_genconn_jtag1838.cpp`**

在文件顶部 include 区补：
```cpp
#include "order.h"
#include <set>
```
在 `main()` 里 `std::printf(...)` 之前追加：
```cpp
    // order.cpp BUS_ORDER 必须含 JTAG1838，否则接口被静默丢弃
    HardenDef def;
    def.id = "d"; def.designName = "top"; def.designLevel = "chip"; def.designType = "hierarchical";
    BusInterface ss; ss.id = "ss"; ss.busType = "SSN"; ss.role = "client";
    BusInterface jj; jj.id = "jj"; jj.busType = "JTAG1838"; jj.role = "client";
    def.interfaces = {ss, jj};
    DefPorts ports = expandDef(def, {});
    bool hasStapTck = false;
    for (const auto& s : ports.inputPorts) if (s.name == "stap_tck") hasStapTck = true;
    assert(hasStapTck);  // JTAG1838 接口的 stap_tck 必须出现在展开端口里
```

- [ ] **Step 2: 重建并确认 FAIL**

```bash
cmake --build build -j
ctest --test-dir build -R genconn_jtag1838 --output-on-failure
```
Expected: FAIL —— `BUS_ORDER` 未含 `"JTAG1838"`，`orderInterfaces` 过滤掉 `jj`，`expandDef` 无 `stap_tck`，`assert(hasStapTck)` 失败。

- [ ] **Step 3: 修 `genconn-core/order.cpp`**

```cpp
const char* BUS_ORDER[] = {"BSCAN", "IJTAG", "JTAG1838", "BISR", "SSN"};
```

- [ ] **Step 4:（可选）`genconn-core/model.h` 注释补 JTAG1838**

把 `BusInterface::busType` 的注释：
```cpp
    std::string busType;  // "SSN" | "IJTAG" | "BISR" | "BSCAN" | "JTAG1838"
```

- [ ] **Step 5: 重建并确认 PASS**

```bash
cmake --build build -j
ctest --test-dir build -R genconn_jtag1838
```
Expected: PASS。

- [ ] **Step 6: 全量回归**

```bash
ctest --test-dir build
```
Expected: 全绿（所有既有 golden/unit 不受影响）。

- [ ] **Step 7: Commit**

```bash
git add genconn-core/order.cpp genconn-core/model.h test/unit/test_genconn_jtag1838.cpp
git commit -m "feat(genconn-core): order.cpp BUS_ORDER 补 JTAG1838 + 排序回归断言"
```

---

## Self-Review

**1. Spec coverage（对照设计 §6.2）：**
- 9 个 base（tck/tms/trst/reset/ce/se/ue/tdi↓ + tdo↑）、`ijtag_` 仅 reset/ce/se/ue、client=`stap_[ijtag_]leaf`、secondary=`<if>_[ijtag_]to_/from_ leaf` → Task 1 单测逐字节钉死。✓
- BUS_ORDER 不丢 JTAG1838（Phase A Task 7 同类修复的 C++ 对应）→ Task 2。✓
- `genconn generate.cpp` 的逐 busType 一致性校验（BISR pd / BSCAN variant / SSN width）JTAG1838 无对应维度、无需加（同 IJTAG）→ Task 1 Step 7 全量回归确认未破坏。✓

**2. Placeholder scan：** 无 TBD；每步给完整 C++ + 确切命令。✓

**3. Type consistency：**
- `Base` 加 `qual`（Task 1 Step 4）后，`down`/`up`/`downQ`（Step 5a）与 `clientSignal`/`secondarySignal`（Step 5f/5g）一致引用。✓
- `toPrefix`/`fromPrefix` 改签名为 `(const BusInterface&, const Base&)`（Step 5c/5d），唯一调用点 `secondarySignal`（Step 5g）同步传 `b`。✓
- 单测用 `BusInterface{id,busType,role,interfaceName}`、`HardenDef{id,designName,designLevel,designType,interfaces}`、`DefPorts{inputPorts}`、`InterfaceSignal{name,direction}` 均与 `genconn-core/model.h`/`order.h` 实际字段一致。✓

**依赖/后续：** Plan B2（specgen-core）另写——`genJtag1838Spec` 的 linearizer 按设计 §7.2 镜像 `bscan.cpp`（DI→STAP、secondary 直通→SecondaryHostScanInterface、STapPipeline→STapPipeline），出 §4 的 `Jtag1838{HostScanInterface{Tap{HostSTap{…}}}}` 嵌套块，含 catalog 条目 + schema 内嵌 + `dftspec.cpp` 挂段 + frozen golden fixture。B2 的 linearizer 有真实设计内容，故独立成篇。
