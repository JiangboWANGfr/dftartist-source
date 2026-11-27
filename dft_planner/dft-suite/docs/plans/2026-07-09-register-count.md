# Register Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 slang 前端逐 instance 数出寄存器（触发器 bit）数量，替代 yosys `reg_count.py`，并在 dft-suite 里用一个可排序的 Register Count 报告 tab 展示（own / subtree / memory），层次树零改动。

**Architecture:** dft-core（C++）在 `DesignDb` 里加一趟后序 walk 累加"被时钟边沿驱动的变量位宽"，经 NDJSON `get-register-count` 方法 + `hdl regcount` CLI 暴露；dft-suite（TS）加类型 + bridge + store 缓存 + 一个单例报告 tab 组件。两仓分别在 `feat/register-count` 分支上，**dft-core 先行**（UI 依赖其新方法）。

**Tech Stack:** C++17 + slang AST；TypeScript + React + Zustand；ctest（C++ 单测）+ `node --test`（TS 单测）+ Playwright（e2e）。

**Spec:** `dft-suite/docs/specs/2026-07-09-register-count-design.md`

**仓库路径：** dft-core = `/Users/jiangbowang/MOI/2025/dftartist/dft-core`；dft-suite = `/Users/jiangbowang/MOI/2025/dftartist/dft-suite`

---

## Part A — dft-core（C++ 计数内核）

### Task A1: RegCount 结构 + 声明 + fixture + 失败单测

**Files:**
- Modify: `dft-core/hdl-core/service/DesignDb.h`（在 `SeqElement` 之后加结构 + 类里加方法声明）
- Create: `dft-core/test/rtl/regcount/regcount.sv`
- Create: `dft-core/test/unit/test_regcount.cpp`
- Modify: `dft-core/test/CMakeLists.txt`

- [ ] **Step 1: 加结构体 + 方法声明到 DesignDb.h**

在 `DesignDb.h` 的 `SeqElement` 结构之后插入：

```cpp
// Per-instance register (flip-flop) bit counts. own = flops declared directly in this
// instance body; subtree = own + all descendants. memoryBits = clock-driven unpacked
// arrays (RAM), excluded from own/subtree (not scan flops).
struct RegCount {
    std::string instanceId;  // = hierarchicalPath
    int own = 0;
    int subtree = 0;
    int memoryBits = 0;
};

struct RegCountResult {
    std::vector<RegCount> counts;  // pre-order over the elaborated hierarchy
    int total = 0;                 // sum of top-instance subtree = whole-design flop count
};
```

在 `class DesignDb` 的 public 段，`getSequential()` 声明之后加：

```cpp
    // L4b: per-instance register (flop bit) count over the elaborated hierarchy.
    // Sums the declared bit-width of every variable driven by an edge-triggered block;
    // dedup per instance; unpacked arrays (RAM) go to memoryBits (excluded from own).
    RegCountResult getRegisterCounts();
```

- [ ] **Step 2: 写 fixture `test/rtl/regcount/regcount.sv`**

```systemverilog
// Register-count fixture: one top instantiating the counting corner cases.
module leaf_ff(input clk, input [31:0] d, output logic [31:0] q);
  always_ff @(posedge clk) q <= d;                 // own = 32
endmodule

module comb_only(input a, output logic y);
  always @(*) y = a;                               // own = 0 (combinational)
endmodule

module dedup_ff(input clk, input rst, input [7:0] d, output logic [7:0] q);
  always_ff @(posedge clk) q <= d;                 // q here ...
  always_ff @(posedge clk) if (rst) q <= 8'h0;     // ... and here -> dedup -> 8
endmodule

module mem_blk(input clk, input [7:0] wd, input [7:0] a);
  logic [7:0] mem [0:255];
  always_ff @(posedge clk) mem[a] <= wd;           // own = 0, memoryBits = 8*256 = 2048
endmodule

module top(input clk, input rst, input [31:0] d);
  logic [31:0] q1; logic [7:0] q2; logic yy; logic [3:0] cnt;
  leaf_ff   u_leaf  (.clk(clk), .d(d),        .q(q1));
  comb_only u_comb  (.a(rst),                 .y(yy));
  dedup_ff  u_dedup (.clk(clk), .rst(rst), .d(d[7:0]), .q(q2));
  mem_blk   u_mem   (.clk(clk), .wd(d[7:0]), .a(d[7:0]));
  always_ff @(posedge clk) cnt <= cnt + 4'd1;      // top own = 4
endmodule
```

期望计数：`top.u_leaf` own32/sub32、`top.u_comb` 0/0、`top.u_dedup` 8/8、`top.u_mem` own0/mem2048、`top` own4/sub44（4+32+0+8+0）、total=44。

- [ ] **Step 3: 写失败单测 `test/unit/test_regcount.cpp`**

```cpp
#undef NDEBUG  // asserts must fire even in Release builds
#include "frontend/SlangCompile.h"
#include "service/DesignDb.h"
#include "service/Filelist.h"  // parseFilelist

#include <cassert>
#include <cstdio>
#include <map>
#include <string>

using namespace hdl;

static const service::RegCount& find(const std::map<std::string, service::RegCount>& m,
                                     const std::string& id) {
    auto it = m.find(id);
    if (it == m.end()) { std::fprintf(stderr, "missing instance %s\n", id.c_str()); assert(false); }
    return it->second;
}

int main(int argc, char** argv) {
    assert(argc >= 2 && "usage: test_regcount <regcount.sv>");
    std::string parseErr;
    auto fl = service::parseFilelist(argv[1], {}, {});
    auto design = frontend::compileSingleTree(fl.files, fl.defines, fl.incdirs, parseErr);
    assert(design && "compile failed");
    service::DesignDb db(std::move(design));

    service::RegCountResult rc = db.getRegisterCounts();
    std::map<std::string, service::RegCount> by;
    for (auto& c : rc.counts) by[c.instanceId] = c;

    assert(find(by, "top.u_leaf").own == 32);
    assert(find(by, "top.u_leaf").subtree == 32);
    assert(find(by, "top.u_comb").own == 0);
    assert(find(by, "top.u_dedup").own == 8);   // deduped across two always_ff blocks
    assert(find(by, "top.u_mem").own == 0);
    assert(find(by, "top.u_mem").memoryBits == 2048);
    assert(find(by, "top").own == 4);
    assert(find(by, "top").subtree == 44);
    assert(rc.total == 44);
    std::printf("test_regcount OK (total=%d)\n", rc.total);
    return 0;
}
```

> 注：`argv[1]` 是单个 fixture 文件；`parseFilelist` 对单文件返回该文件本身。若 `Filelist.h` 的头名/命名空间不同，按 `openDb`（`app/cli_main.cpp:56`）里的实际用法对齐。

- [ ] **Step 4: 注册测试到 `test/CMakeLists.txt`**

在 `test_jsonvalue` 那组之后加：

```cmake
add_executable(test_regcount unit/test_regcount.cpp)
target_link_libraries(test_regcount PRIVATE hdlcore)
add_test(NAME regcount COMMAND test_regcount ${CMAKE_SOURCE_DIR}/test/rtl/regcount/regcount.sv)
```

- [ ] **Step 5: 配置 + 构建，确认测试因缺 `getRegisterCounts` 而编译失败**

Run:
```bash
cd dft-core && cmake --build build --target test_regcount 2>&1 | tail -20
```
Expected: 编译/链接失败（`getRegisterCounts` 未定义）。若 `build/` 不存在先 `cmake -S . -B build`。

- [ ] **Step 6: Commit**

```bash
cd dft-core && git add hdl-core/service/DesignDb.h test/rtl/regcount/regcount.sv test/unit/test_regcount.cpp test/CMakeLists.txt
git commit -m "test(regcount): failing unit test + fixture for per-instance flop count"
```

---

### Task A2: 实现 `getRegisterCounts`

**Files:**
- Modify: `dft-core/hdl-core/service/DesignDb.cpp`（加 include + 匿名 namespace helper + 方法定义，紧接 `getSequential` 之后，约 `DesignDb.cpp:628`）

- [ ] **Step 1: 加 include**

在 `DesignDb.cpp` 顶部 include 区加（`ASTVisitor` 用于遍历块体收集赋值目标；`ConcatenationExpression` 处理拼接 LHS）：

```cpp
#include "slang/ast/ASTVisitor.h"
```
（`AssignmentExpression` 已由 `expressions/AssignmentExpressions.h` 提供；若 `ConcatenationExpression` 未被现有 include 覆盖，加 `#include "slang/ast/expressions/MiscExpressions.h"`。）

- [ ] **Step 2: 在匿名 namespace（`extractSeq`/`walkSeq` 同区）内加 helper**

```cpp
// ---- L4b get-register-count: per-instance flop bit count ------------------------------------

// Base ValueSymbol(s) targeted by an assignment LHS. Concatenation LHS recurses each operand;
// part/element/member selects resolve to the base via getSymbolReference (same as collectSyms).
void collectLhsTargets(const Expression& lhs, std::set<const ValueSymbol*>& out) {
    if (lhs.kind == ExpressionKind::Concatenation) {
        for (const Expression* op : lhs.as<ConcatenationExpression>().operands())
            collectLhsTargets(*op, out);
        return;
    }
    if (const Symbol* s = lhs.getSymbolReference())
        if (const auto* vs = s->as_if<ValueSymbol>()) out.insert(vs);
}

// Visits every assignment under a statement, collecting LHS target symbols.
struct AssignTargetVisitor : public ASTVisitor<AssignTargetVisitor, /*Statements*/ true,
                                               /*Expressions*/ true> {
    std::set<const ValueSymbol*>& out;
    explicit AssignTargetVisitor(std::set<const ValueSymbol*>& o) : out(o) {}
    void handle(const AssignmentExpression& e) {
        collectLhsTargets(e.left(), out);
        visitDefault(e);
    }
};

// True if a procedural block is edge-triggered sequential logic (a flop). Mirrors the timing
// test in extractSeq: always_ff/always with a Timed body containing at least one edge event.
bool isEdgeTriggered(const ProceduralBlockSymbol& pb) {
    ProceduralBlockKind pk = pb.procedureKind;
    if (pk != ProceduralBlockKind::AlwaysFF && pk != ProceduralBlockKind::Always) return false;
    const Statement& body = pb.getBody();
    if (body.kind != StatementKind::Timed) return false;
    const TimingControl& tc = body.as<TimedStatement>().timing;
    auto edgy = [](const SignalEventControl& s) { return s.edge != EdgeKind::None; };
    if (tc.kind == TimingControlKind::SignalEvent) return edgy(tc.as<SignalEventControl>());
    if (tc.kind == TimingControlKind::EventList)
        for (auto* ev : tc.as<EventListControl>().events)
            if (ev->kind == TimingControlKind::SignalEvent && edgy(ev->as<SignalEventControl>()))
                return true;
    return false;
}

// own flop bits (packed vars) + memory bits (unpacked arrays) directly in one instance body.
void ownBitsOf(const InstanceSymbol& inst, int& ownBits, int& memBits) {
    std::vector<const ProceduralBlockSymbol*> blocks;
    collectProcBlocks(inst.body, blocks);
    std::set<const ValueSymbol*> targets;
    for (auto* pb : blocks)
        if (isEdgeTriggered(*pb)) {
            AssignTargetVisitor v(targets);
            pb->getBody().visit(v);
        }
    for (const ValueSymbol* vs : targets) {
        const Type& t = vs->getType();
        if (t.isUnpackedArray()) memBits += static_cast<int>(t.getBitstreamWidth());
        else ownBits += static_cast<int>(t.getBitWidth());
    }
}

// Post-order walk: append each instance's RegCount, backfill subtree = own + children subtrees.
int walkReg(const InstanceSymbol& inst, std::vector<RegCount>& out) {
    RegCount rc;
    rc.instanceId = inst.getHierarchicalPath();
    ownBitsOf(inst, rc.own, rc.memoryBits);
    size_t idx = out.size();
    out.push_back(rc);
    int subtree = out[idx].own;
    std::vector<const Symbol*> kids;
    collectChildren(inst.body, kids);
    for (auto* k : kids)
        if (isRealInstance(*k)) subtree += walkReg(k->as<InstanceSymbol>(), out);
    out[idx].subtree = subtree;
    return subtree;
}
```

- [ ] **Step 3: 加方法定义（紧接 `getSequential` 之后）**

```cpp
RegCountResult DesignDb::getRegisterCounts() {
    RegCountResult res;
    for (auto* t : p_->comp->getRoot().topInstances)
        res.total += walkReg(*t, res.counts);
    return res;
}
```

- [ ] **Step 4: 构建 + 跑单测**

Run:
```bash
cd dft-core && cmake --build build --target test_regcount && ctest --test-dir build -R '^regcount$' --output-on-failure
```
Expected: PASS，输出 `test_regcount OK (total=44)`。
> 若因 slang API 名不符编译失败（如 `getBitstreamWidth` vs `bitstreamWidth`、`operands()` 形态、`ASTVisitor` 模板参数），按编译器报错就地校正——语义不变。

- [ ] **Step 5: Commit**

```bash
cd dft-core && git add hdl-core/service/DesignDb.cpp
git commit -m "feat(regcount): DesignDb::getRegisterCounts — per-instance flop bit count"
```

---

### Task A3: NDJSON 协议方法 `get-register-count`

**Files:**
- Modify: `dft-core/hdl-core/protocol/NdjsonServer.cpp`（`get-sequential` 分支之后加 `else if`）

- [ ] **Step 1: 加序列化分支**

在 `else if (method == "get-sequential") { ... }` 块之后插入：

```cpp
    } else if (method == "get-register-count") {
        RegCountResult rc = db.getRegisterCounts();
        w.beginObject();
        w.key("counts");
        w.beginArray();
        for (auto& c : rc.counts) {
            w.beginObject();
            w.key("instanceId"); w.value(c.instanceId);
            w.key("own");        w.value(c.own);
            w.key("subtree");    w.value(c.subtree);
            w.key("memoryBits"); w.value(c.memoryBits);
            w.endObject();
        }
        w.endArray();
        w.key("total"); w.value(rc.total);
        w.endObject();
```

> `RegCountResult` 已随 `DesignDb.h` 引入（NdjsonServer.cpp 已 include 之）。`w.value(int)` 与 `get-sequential` 里 `w.value(static_cast<int>(...))` 用法一致。

- [ ] **Step 2: 构建 daemon**

Run:
```bash
cd dft-core && cmake --build build --target hdl
```
Expected: 链接成功。

- [ ] **Step 3: Commit**

```bash
cd dft-core && git add hdl-core/protocol/NdjsonServer.cpp
git commit -m "feat(regcount): NDJSON get-register-count method"
```

---

### Task A4: CLI 子命令 `hdl regcount`

**Files:**
- Modify: `dft-core/app/cli_main.cpp`（加 `cmdRegcount` + usage 行 + main 分发）

- [ ] **Step 1: 加 `cmdRegcount`（照 `cmdSequential` 抄，`cli_main.cpp:146`）**

在 `cmdSequential` 之后：

```cpp
int cmdRegcount(const Args& a) {
    std::string err;
    auto db = openDb(a, err);
    if (!db) { std::fprintf(stderr, "%s\n", err.c_str()); return 2; }
    std::string out = hdl::protocol::runQuery(*db, "get-register-count", {});
    std::fwrite(out.data(), 1, out.size(), stdout);
    std::fputc('\n', stdout);
    return 0;
}
```

- [ ] **Step 2: usage 行 + main 分发**

usage 字符串里 `sequential` 行之后加：

```cpp
                     "  regcount <input> [opts]              # L4b: per-instance flop bit count\n"
```

main 里 `if (cmd == "sequential") return cmdSequential(a);` 之后加：

```cpp
    if (cmd == "regcount") return cmdRegcount(a);
```

- [ ] **Step 3: 构建 + 手测 fixture**

Run:
```bash
cd dft-core && cmake --build build --target hdl && ./build/app/hdl regcount test/rtl/regcount/regcount.sv
```
Expected: JSON，含 `"total":44` 与每 instance 的 own/subtree/memoryBits。

- [ ] **Step 4: Commit**

```bash
cd dft-core && git add app/cli_main.cpp
git commit -m "feat(regcount): 'hdl regcount' CLI subcommand"
```

---

### Task A5: yosys 交叉验证（gps_baseband ±2%）

> 目的：把 slang 计数对齐已知 7762 FF 标尺。若环境无 yosys 或无 gps_baseband，本任务**记录并跳过**，不阻塞。

**Files:**
- Create: `dft-core/test/diff/regcount_yosys.sh`

- [ ] **Step 1: 定位 gps_baseband 与 yosys**

Run:
```bash
which yosys; ls /Users/jiangbowang/MOI/2025/dftartist/dft-core/rtl_test/gps_baseband 2>/dev/null || find /Users/jiangbowang/MOI/2025/dftartist -maxdepth 4 -iname 'gps_baseband' -type d 2>/dev/null
```
若二者任一缺失 → 在本任务勾注 "skipped: <原因>"，跳到 Step 4。

- [ ] **Step 2: 写对比脚本 `test/diff/regcount_yosys.sh`**

```bash
#!/usr/bin/env bash
# Cross-check slang regcount total vs yosys $dff bit count. Args: <hdl-bin> <input> <gps_dir>
set -euo pipefail
HDL="$1"; INPUT="$2"; GPS="$3"
SLANG=$("$HDL" regcount "$INPUT" | sed -n 's/.*"total":\([0-9]*\).*/\1/p')
# yosys: elaborate + proc, count $dff cell output bits
YS=$(yosys -q -p "read_verilog -sv $GPS/*.v; hierarchy -auto-top; proc; stat" 2>/dev/null \
     | sed -n 's/.*\$dff *\([0-9]*\).*/\1/p' | paste -sd+ - | bc 2>/dev/null || echo 0)
echo "slang=$SLANG yosys_dff_cells=$YS"
# tolerance ±2% against slang bit total is compared manually / by the runner
```

> yosys `$dff` 行给的是 cell 数不是 bit 数——精确 bit 对齐需 `stat -width` 或按每个 `$dff` 的 `WIDTH` 求和。Step 3 用实际输出决定精确解析方式；此脚本先给出两个可对比的量级。

- [ ] **Step 3: 跑对比，记录差异**

Run:
```bash
cd dft-core && bash test/diff/regcount_yosys.sh ./build/app/hdl <gps_filelist_or_dir> <gps_dir>
```
Expected: slang 总数与 yosys 数量级一致；把实测差异（相对 7762）写进 spec §7 的验收记录。差异 > ±2% → 开 issue 记录偏差来源（partial-bit / memory / 黑盒），不在本期强改。

- [ ] **Step 4: Commit（或记录跳过）**

```bash
cd dft-core && git add test/diff/regcount_yosys.sh
git commit -m "test(regcount): yosys cross-check script for gps_baseband (7762 FF baseline)"
```
若跳过：不建脚本，在本计划文件本任务处勾注 "skipped: <原因>"。

---

## Part B — dft-suite（Register Count 报告 tab）

> 前置：Part A 已把 `get-register-count` 方法编入 `hdl` 二进制，并已 stage 进 dft-suite 打包（`scripts/stage-bin.sh`）。开发期 daemon 用现有 `hdl` 二进制即可；确保跑的是新构建的 `hdl`。

### Task B1: TS 类型 + bridge 方法

**Files:**
- Modify: `dft-suite/src/core-bridge/model.ts`（加 `RegCount`/`RegCountResult` + `Tab` 加 `RegCountTabSpec`）
- Modify: `dft-suite/src/core-bridge/client.ts`（加 `getRegisterCounts`）

- [ ] **Step 1: model.ts 加类型**

在 `NetlistResult` 附近加：

```ts
/** Per-instance register (flop bit) count from get-register-count. */
export interface RegCount {
  instanceId: string;
  own: number;
  subtree: number;
  memoryBits: number;
}
export interface RegCountResult { counts: RegCount[]; total: number; }
```

在 `SchematicTabSpec` / `DfxCtrlTabSpec` 附近加新 tab 类型，并加入 `Tab` 联合：

```ts
/** The single Register Count report tab. Content derives from get-register-count. */
export type RegCountTabSpec = {
  id: "regcount";
  kind: "regcount";
  title: string;
};
```
把 `Tab` 联合改为：
```ts
export type Tab = HdlTab | SchematicTabSpec | PortsTabSpec | DfxCtrlTabSpec | RegCountTabSpec;
```

- [ ] **Step 2: client.ts 加 bridge 方法**

`model.ts` import 里加 `RegCountResult`，在 `dftDesign` 对象里 `getNetlist` 之后加：

```ts
  getRegisterCounts: (): Promise<RegCountResult> =>
    window.dft.design.query("get-register-count", {}) as Promise<RegCountResult>,
```

- [ ] **Step 3: typecheck**

Run:
```bash
cd dft-suite && npm run typecheck
```
Expected: 通过（新类型自洽；`Tab` 联合新增成员暂未在 TabArea 用到，不报错）。

- [ ] **Step 4: Commit**

```bash
cd dft-suite && git add src/core-bridge/model.ts src/core-bridge/client.ts
git commit -m "feat(regcount): TS types + getRegisterCounts bridge method"
```

---

### Task B2: 纯排序/过滤 helper + 单测（TDD）

**Files:**
- Create: `dft-suite/src/hierarchy/core/regcount.ts`
- Create: `dft-suite/tests/unit/regcount.test.ts`

- [ ] **Step 1: 写失败单测 `tests/unit/regcount.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { regRows } from "../../src/hierarchy/core/regcount.ts";
import type { RegCountResult } from "../../src/core-bridge/model.ts";

const R: RegCountResult = {
  total: 44,
  counts: [
    { instanceId: "top",         own: 4,  subtree: 44, memoryBits: 0 },
    { instanceId: "top.u_leaf",  own: 32, subtree: 32, memoryBits: 0 },
    { instanceId: "top.u_dedup", own: 8,  subtree: 8,  memoryBits: 0 },
    { instanceId: "top.u_mem",   own: 0,  subtree: 0,  memoryBits: 2048 },
  ],
};

test("sort by subtree desc (default)", () => {
  const rows = regRows(R, { key: "subtree", dir: "desc" }, "");
  assert.deepEqual(rows.map(r => r.instanceId), ["top", "top.u_leaf", "top.u_dedup", "top.u_mem"]);
});

test("sort by own asc", () => {
  const rows = regRows(R, { key: "own", dir: "asc" }, "");
  assert.equal(rows[0].instanceId, "top.u_mem");   // own 0
  assert.equal(rows[rows.length - 1].instanceId, "top.u_leaf"); // own 32
});

test("filter by instanceId substring", () => {
  const rows = regRows(R, { key: "subtree", dir: "desc" }, "u_");
  assert.deepEqual(rows.map(r => r.instanceId).sort(),
    ["top.u_dedup", "top.u_leaf", "top.u_mem"]);
});
```

- [ ] **Step 2: 跑，确认失败**

Run:
```bash
cd dft-suite && node --test tests/unit/regcount.test.ts
```
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写 `src/hierarchy/core/regcount.ts`**

```ts
import type { RegCount, RegCountResult } from "../../core-bridge/model.ts";

export type RegSortKey = "instanceId" | "own" | "subtree" | "memoryBits";
export interface RegSort { key: RegSortKey; dir: "asc" | "desc"; }

/** Filter counts by instanceId substring, then sort by the chosen column. */
export function regRows(result: RegCountResult, sort: RegSort, filter: string): RegCount[] {
  const f = filter.trim().toLowerCase();
  const rows = f
    ? result.counts.filter(c => c.instanceId.toLowerCase().includes(f))
    : result.counts.slice();
  const sign = sort.dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key];
    const cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
    return cmp * sign;
  });
  return rows;
}
```

- [ ] **Step 4: 跑，确认通过**

Run:
```bash
cd dft-suite && node --test tests/unit/regcount.test.ts && npm run typecheck
```
Expected: 3 tests PASS；typecheck 通过。

- [ ] **Step 5: Commit**

```bash
cd dft-suite && git add src/hierarchy/core/regcount.ts tests/unit/regcount.test.ts
git commit -m "feat(regcount): pure regRows sort/filter helper + unit tests"
```

---

### Task B3: store —— `regCounts` 缓存 + `openRegCountTab`

**Files:**
- Modify: `dft-suite/src/hierarchy/store.ts`

- [ ] **Step 1: AppState 接口加字段/action**

在 `AppState` 接口里 `schematics` 附近加：
```ts
  regCounts: RegCountResult | null;
```
在 action 声明区 `openDfxCtrlTab` 之后加：
```ts
  /** Open (or activate) the singleton Register Count report tab; lazy-load counts on first open. */
  openRegCountTab: () => Promise<void>;
```

- [ ] **Step 2: import + 常量 + blankState**

`model.ts` 类型 import 里加 `RegCountResult`。
在 `SCHEMATIC_TAB_ID` 附近加：
```ts
/** Stable singleton id for the Register Count report tab. */
const REGCOUNT_TAB_ID = "regcount";
```
`blankState` 里加：
```ts
    regCounts: null as RegCountResult | null,
```

- [ ] **Step 3: 实现 `openRegCountTab`（照 `openDfxCtrlTab`，`store.ts:172`）**

在 `openDfxCtrlTab` 实现之后加：
```ts
    openRegCountTab: async () => {
      // Singleton tab: activate if present, else add. Content derives from get-register-count.
      set((s) => (s.tabs.some((t) => t.id === REGCOUNT_TAB_ID)
        ? { activeTabId: REGCOUNT_TAB_ID }
        : addTab({ tabs: s.tabs, activeTabId: s.activeTabId },
                 { id: REGCOUNT_TAB_ID, kind: "regcount", title: "寄存器统计" })));
      if (get().regCounts) return;            // cached
      try {
        const rc = await hs.getRegisterCounts();
        set({ regCounts: rc });
      } catch (e) {
        console.error("get-register-count failed", e);  // tab renders error state
      }
    },
```
> `regCounts` 在 `blankState` 里，`reset()` / 新设计 `loadFromReady`（其开头 `set(blankState)`）会自动清空——无需额外改动。

- [ ] **Step 4: typecheck**

Run:
```bash
cd dft-suite && npm run typecheck
```
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
cd dft-suite && git add src/hierarchy/store.ts
git commit -m "feat(regcount): store regCounts cache + openRegCountTab (lazy load)"
```

---

### Task B4: RegCountTab 组件 + TabArea 接线 + 样式

**Files:**
- Create: `dft-suite/src/hierarchy/RegCountTab.tsx`
- Modify: `dft-suite/src/hierarchy/TabArea.tsx`
- Modify: `dft-suite/src/hierarchy/styles.css`

- [ ] **Step 1: 写 `RegCountTab.tsx`**

```tsx
// Register Count report: sortable table of every instance's own / subtree / memory flop bits.
// Content comes from the store's regCounts (lazy-loaded by openRegCountTab). Clicking a row
// selects the matching instance in the hierarchy tree.

import { useState } from "react";
import { useStore } from "./store.ts";
import { regRows, type RegSortKey } from "./core/regcount.ts";

const COLS: { key: RegSortKey; label: string; num: boolean }[] = [
  { key: "instanceId", label: "Instance", num: false },
  { key: "own", label: "own", num: true },
  { key: "subtree", label: "subtree", num: true },
  { key: "memoryBits", label: "memory", num: true },
];

export function RegCountTab() {
  const rc = useStore((s) => s.regCounts);
  const instances = useStore((s) => s.instances);
  const selectInstance = useStore((s) => s.selectInstance);
  const [sortKey, setSortKey] = useState<RegSortKey>("subtree");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState("");

  if (!rc) return <div className="regcount muted">加载中…</div>;

  const rows = regRows(rc, { key: sortKey, dir }, filter);
  const clickHead = (k: RegSortKey) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setDir(k === "instanceId" ? "asc" : "desc"); }
  };
  const clickRow = (id: string) => {
    const node = instances[id];
    if (node) selectInstance({ nodeId: id, defId: node.definitionId });
  };

  return (
    <div className="regcount">
      <div className="rc-head">
        <input className="rc-filter" placeholder="filter instance…" value={filter}
               onChange={(e) => setFilter(e.target.value)} />
        <span className="rc-total">total {rc.total}</span>
      </div>
      <div className="rc-table-wrap">
        <table className="rc-table">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={c.num ? "num" : ""} onClick={() => clickHead(c.key)}>
                  {c.label}{sortKey === c.key ? (dir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.instanceId} onClick={() => clickRow(r.instanceId)}>
                <td>{r.instanceId}</td>
                <td className="num">{r.own}</td>
                <td className="num">{r.subtree}</td>
                <td className="num">{r.memoryBits || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TabArea.tsx 接线**

顶部 import 加：
```tsx
import { RegCountTab } from "./RegCountTab.tsx";
```
`tabbody` 里 `dfxctrl` 分支之后加：
```tsx
        {active?.kind === "regcount" && <RegCountTab />}
```
tab 标题 `title` 三元里 `regcount` 走默认 `t.title` 分支——现有 `t.kind === "schematic" ? ... : t.title` 已覆盖，无需改。

- [ ] **Step 3: styles.css 加表样式**

在 `styles.css` 末尾加：
```css
.regcount { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.regcount.muted { padding: 12px; color: var(--text-faint); }
.rc-head { display: flex; align-items: center; gap: 12px; padding: 6px 10px; border-bottom: 1px solid var(--border, #333); }
.rc-filter { flex: 1; max-width: 320px; padding: 3px 6px; }
.rc-total { color: var(--text-faint); font-variant-numeric: tabular-nums; }
.rc-table-wrap { flex: 1; min-height: 0; overflow: auto; }
.rc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.rc-table th { position: sticky; top: 0; background: var(--bg, #1e1e1e); text-align: left; padding: 4px 10px; cursor: pointer; user-select: none; border-bottom: 1px solid var(--border, #333); }
.rc-table th.num, .rc-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.rc-table td { padding: 3px 10px; white-space: nowrap; }
.rc-table tbody tr:hover { background: var(--hover, rgba(255,255,255,.05)); cursor: pointer; }
```
> CSS 变量名（`--border`/`--bg`/`--hover`）以 `styles.css`/`theme.css` 实际定义为准；上面给了回退值。

- [ ] **Step 4: typecheck + 构建**

Run:
```bash
cd dft-suite && npm run typecheck && npm run build
```
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
cd dft-suite && git add src/hierarchy/RegCountTab.tsx src/hierarchy/TabArea.tsx src/hierarchy/styles.css
git commit -m "feat(regcount): RegCountTab sortable report + TabArea wiring + styles"
```

---

### Task B5: 入口按钮（左侧 dock 头）

**Files:**
- Modify: `dft-suite/src/hierarchy/Workspace.tsx`
- Modify: `dft-suite/src/hierarchy/styles.css`（dock 头样式）

- [ ] **Step 1: Workspace.tsx 左 dock 加按钮**

把 `leftdock` 块改为在树上方放一个极简头：
```tsx
      <div id="hier-tree" className="leftdock">
        <div className="dock-head">
          <button className="dock-btn" onClick={() => void useStore.getState().openRegCountTab()}>
            寄存器统计
          </button>
        </div>
        <HierarchyTree />
      </div>
```
> `status === "ready"` 才渲染 `HierarchyWorkspace` 的这段（组件顶部已 early-return idle/error），故按钮天然只在有设计时可见。

- [ ] **Step 2: styles.css dock 头样式**

```css
.dock-head { padding: 4px 6px; border-bottom: 1px solid var(--border, #333); }
.dock-btn { font-size: 12px; padding: 2px 8px; cursor: pointer; }
```

- [ ] **Step 3: typecheck + 构建**

Run:
```bash
cd dft-suite && npm run typecheck && npm run build
```
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
cd dft-suite && git add src/hierarchy/Workspace.tsx src/hierarchy/styles.css
git commit -m "feat(regcount): '寄存器统计' entry button opens the report tab"
```

---

### Task B6: e2e 冒烟 + 收尾验证

**Files:**
- Create: `dft-suite/tests/e2e/regcount.spec.ts`（照 `tests/e2e/hierarchy.spec.ts` 的开设计+等就绪套路）

- [ ] **Step 1: 读现有 e2e 套路**

Run:
```bash
cd dft-suite && sed -n '1,60p' tests/e2e/hierarchy.spec.ts
```
照它的 fixture 打开、`window.dft` 等待、选择器风格写冒烟。

- [ ] **Step 2: 写 `tests/e2e/regcount.spec.ts`**

冒烟断言（按 hierarchy.spec.ts 的实际 helper/选择器改写占位处）：
1. 打开测试设计，等 `status==="ready"`。
2. 点「寄存器统计」按钮（`.dock-btn`）。
3. 断言出现 `.rc-table` 且至少一行；`total` 文本为正整数。
4. 点某数据行 → 断言左树对应实例被选中（`.trow.sel[data-node=...]`）。

```ts
import { test, expect } from "@playwright/test";
// TODO: 复用 tests/helpers 里打开设计的 helper（见 hierarchy.spec.ts）
test("register count report opens and rows select tree instances", async ({ page }) => {
  // ...open design via existing helper, wait ready...
  await page.click(".dock-btn");
  await expect(page.locator(".rc-table")).toBeVisible();
  const total = await page.locator(".rc-total").innerText();
  expect(Number(total.replace(/\D/g, ""))).toBeGreaterThan(0);
  const firstRow = page.locator(".rc-table tbody tr").first();
  const inst = await firstRow.locator("td").first().innerText();
  await firstRow.click();
  await expect(page.locator(`.trow.sel[data-node="${inst}"]`)).toBeVisible();
});
```

- [ ] **Step 3: 跑 e2e（需能构建 + 有 fixture 设计 + 打包好的 hdl）**

Run:
```bash
cd dft-suite && npm run test:e2e -- regcount.spec.ts
```
Expected: PASS。若 e2e 基础设施本地跑不起来 → 勾注 "skipped: e2e infra"，改为手动冒烟（`npm run dev:electron` 打开设计、点按钮、核对表 + 点行选中）。

- [ ] **Step 4: 全量回归**

Run:
```bash
cd dft-suite && npm test            # typecheck + unit
cd dft-core && ctest --test-dir build --output-on-failure  # 含 regcount + 原有
```
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
cd dft-suite && git add tests/e2e/regcount.spec.ts
git commit -m "test(regcount): e2e smoke — report opens, rows select tree instances"
```

---

## 完成标准

- dft-core：`ctest -R regcount` 绿（total=44，各 instance own/subtree/memoryBits 正确）；`hdl regcount` 可用；yosys 对比记录在案（或标注跳过）。
- dft-suite：`npm test` 绿；「寄存器统计」按钮打开可排序报告 tab；点行高亮左树对应实例；层次树零改动。
- 两仓各自 `feat/register-count` 分支，提交粒度如上；由用户自行合并。
