# 层次原理图"往里 trace"(trace-into) 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/specs/2026-07-22-trace-into-design.md` 实现 Tessent 式下钻:点 IP 引脚盒内侧菱形跨进模块内部增量追线,嵌套画在容器框内,可收起还原。

**Architecture:** 跨两仓。Phase A(dft-core/hdl-core):`DesignDb::traceInto` 经 `port.internalSymbol` 桥进 self.body,结构边+行为源单响应,daemon 暴露 `trace-into`。Phase B(dft-suite):SchNode 加 `parentId` 嵌套模型 → toElkGraph 建 ELK 层次图(INCLUDE_CHILDREN,仅嵌套时)→ laid 递归展平(边按 container 偏移)→ SchematicTab 画容器框/内侧菱形/收起菜单。ELK 行为结论全部来自 spec §4 probe 实测,**勿重复 probe、勿走回头路**。

**Tech Stack:** C++20 + slang(结构/AnalysisManager 行为分析)、NDJSON daemon;TypeScript + zustand + elkjs 0.11.1 + react-konva;node:test 单测 + Playwright e2e。

**工作目录:**
- Phase A:`/Users/jiangbowang/MOI/2025/dftartist/dft-core`(main 干净,**原地开分支** `feat/trace-into`,复用已有 `build/` 增量编译;e2e 默认取 `../dft-core/build/hdl`,原地重编后天然生效)
- Phase B:`/Users/jiangbowang/MOI/2025/dftartist/dft-suite-trace-into`(已存在的 worktree,分支 `feat/trace-into`,spec 已提交)。**不要碰** `/Users/jiangbowang/MOI/2025/dftartist/dft-suite` 主检出(用户 WIP)。

---

## Phase A — dft-core 后端

### Task A0: 开分支

- [ ] **Step 1: 在 dft-core 原地开 feat/trace-into**

```bash
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core switch -c feat/trace-into main
```

预期:`Switched to a new branch 'feat/trace-into'`。工作区应只有未跟踪的 `test/rtl/pad/pad_cfg.json`(用户文件,不碰、不提交)。

### Task A1: fixture + 失败单测(TDD red)

**Files:**
- Create: `test/rtl/traceinto/traceinto.sv`
- Create: `test/unit/test_traceinto.cpp`
- Modify: `test/CMakeLists.txt`(在 regcount 段后追加)

- [ ] **Step 1: 写 fixture**

`test/rtl/traceinto/traceinto.sv`:

```systemverilog
// trace-into fixture:ip 内一层的结构驱动/负载、行为级(always_ff/assign)输出、两级嵌套。
module leaf_and(input logic i0, input logic i1, output logic o);
  assign o = i0 & i1;
endmodule

module core(input logic ci, output logic co);
  assign co = ~ci;
endmodule

module mid(input logic mi, output logic mo);
  core u_core(.ci(mi), .co(mo));
endmodule

module ip(input logic a, input logic b, input logic clk,
          output logic y, output logic q, output logic deep);
  logic m;
  leaf_and u1(.i0(a), .i1(b), .o(m));
  leaf_and u2(.i0(m), .i1(a), .o(y));
  mid u_mid(.mi(m), .mo(deep));
  always_ff @(posedge clk) q <= m;
endmodule

module top(input logic ta, input logic tb, input logic clk,
           output logic ty, output logic tq, output logic td);
  ip u_ip(.a(ta), .b(tb), .clk(clk), .y(ty), .q(tq), .deep(td));
endmodule
```

- [ ] **Step 2: 写单测**(模式照 `test/unit/test_regcount.cpp`:独立 main + assert + fixture 路径经 argv)

`test/unit/test_traceinto.cpp`:

```cpp
#undef NDEBUG  // asserts must fire even in Release builds
#include "frontend/SlangCompile.h"
#include "service/DesignDb.h"

#include <algorithm>
#include <cassert>
#include <cstdio>
#include <string>

using namespace hdl;

static bool hasEdge(const service::TraceIntoResult& r, const std::string& fn, const std::string& fp,
                    const std::string& tn, const std::string& tp) {
    return std::any_of(r.edges.begin(), r.edges.end(), [&](const service::TraceEdge& e) {
        return e.fromNode == fn && e.fromPort == fp && e.toNode == tn && e.toPort == tp;
    });
}

int main(int argc, char** argv) {
    assert(argc >= 2 && "usage: test_traceinto <traceinto.sv>");
    std::string parseErr;
    auto design = frontend::compileSingleTree({argv[1]}, {}, {}, parseErr);
    assert(design && "compile failed");
    service::DesignDb db(std::move(design));

    // 1. 输出引脚往里:结构驱动 —— y 由内部 u2.o 驱动
    {
        auto r = db.traceInto("top.u_ip", "y");
        assert(r.edges.size() == 1);
        assert(hasEdge(r, "top.u_ip.u2", "o", "top.u_ip", "y"));
        assert(r.netName == "y");
        assert(r.sources.empty());
        assert(r.nodes.size() == 1 && r.nodes[0].id == "top.u_ip.u2");
        assert(r.nodes[0].isLeaf);  // leaf_and 内部无子实例
    }
    // 2. 输入引脚往里:内部负载 —— a 喂 u1.i0 和 u2.i1
    {
        auto r = db.traceInto("top.u_ip", "a");
        assert(r.edges.size() == 2);
        assert(hasEdge(r, "top.u_ip", "a", "top.u_ip.u1", "i0"));
        assert(hasEdge(r, "top.u_ip", "a", "top.u_ip.u2", "i1"));
        assert(r.sources.empty());
    }
    // 3. 行为级兜底:q 由 always_ff 直接驱动,无结构驱动
    {
        auto r = db.traceInto("top.u_ip", "q");
        assert(r.edges.empty());
        assert(r.sources.size() == 1);
        assert(r.sources[0].kind == "logic");
        assert(r.sources[0].detail == "always_ff");
        assert(r.sources[0].line > 0);
    }
    // 4. 两级下钻:deep 由 u_mid.mo 驱动;再进 u_mid 一层是 u_core.co
    {
        auto r1 = db.traceInto("top.u_ip", "deep");
        assert(hasEdge(r1, "top.u_ip.u_mid", "mo", "top.u_ip", "deep"));
        assert(r1.nodes.size() == 1 && !r1.nodes[0].isLeaf);  // mid 里还有 u_core,可继续下钻
        auto r2 = db.traceInto("top.u_ip.u_mid", "mo");
        assert(hasEdge(r2, "top.u_ip.u_mid.u_core", "co", "top.u_ip.u_mid", "mo"));
    }
    // 5. 防御:不存在的引脚 → 全空
    {
        auto r = db.traceInto("top.u_ip", "nope");
        assert(r.edges.empty() && r.nodes.empty() && r.sources.empty());
    }
    // 6. leaf 模块(assign 驱动输出)也能安全调用 → 行为源
    {
        auto r = db.traceInto("top.u_ip.u1", "o");
        assert(r.edges.empty());
        assert(r.sources.size() == 1 && r.sources[0].detail == "assign");
    }
    std::printf("test_traceinto OK\n");
    return 0;
}
```

- [ ] **Step 3: 注册 CMake 测试**(`test/CMakeLists.txt`,加在 regcount 三行之后)

```cmake
add_executable(test_traceinto unit/test_traceinto.cpp)
target_link_libraries(test_traceinto PRIVATE hdlcore)
add_test(NAME traceinto COMMAND test_traceinto ${CMAKE_SOURCE_DIR}/test/rtl/traceinto/traceinto.sv)
```

- [ ] **Step 4: 构建,确认红**

```bash
cmake --build /Users/jiangbowang/MOI/2025/dftartist/dft-core/build -j8 --target test_traceinto
```

预期:FAIL,`no member named 'traceInto' in 'hdl::service::DesignDb'`(以及 `TraceIntoResult` 未定义)。

### Task A2: TraceIntoResult + DesignDb::traceInto + 行为源提取重构

**Files:**
- Modify: `hdl-core/service/DesignDb.h`(结构体加在 `DriversResult` 之后 ~L69;方法声明加在 `traceDrivers` 声明后 ~L141;私有方法 + slang 前置声明)
- Modify: `hdl-core/service/DesignDb.cpp`(实现加在 `traceDrivers` 之后;`traceDrivers` 尾部循环抽成共享私有方法)

- [ ] **Step 1: DesignDb.h 声明**

文件顶部(现有 include 之后、`namespace hdl::service` 之前)加前置声明:

```cpp
namespace slang::ast {
class ValueSymbol;
}
```

`DriversResult`(~L69)后加:

```cpp
// trace-into: one inward step through a module boundary pin — structural child-instance
// edges + behavioral sources (out pin with no structural driver) in one response (spec §2).
struct TraceIntoResult {
    std::vector<TraceEdge> edges;
    std::vector<Meta> nodes;
    std::vector<DriverSourceInfo> sources;
    std::string netName;
    bool bus = false;
    bool truncated = false;
};
```

public 区 `traceDrivers` 声明后加:

```cpp
    // one inward step: boundary port -> internal net (port.internalSymbol) -> child
    // instance pins on it; out pin without a structural driver falls back to behavioral
    // sources (spec §2.1/§2.2). Leaf/blackbox/unknown port -> all-empty result.
    TraceIntoResult traceInto(const std::string& nodeId, const std::string& port);
```

private 区(`ensureRegistered` 声明旁)加:

```cpp
    // shared tail of traceDrivers/traceInto: AnalysisManager-resolved behavioral drivers
    // of `vs`, appended to `out` (deduped by id). scopeId scopes the "port:" source id.
    void collectBehavioralSources(const slang::ast::ValueSymbol& vs, const std::string& scopeId,
                                  bool bus, std::vector<DriverSourceInfo>& out);
```

- [ ] **Step 2: DesignDb.cpp — 抽共享方法**

把 `traceDrivers`(L408)尾部的 `auto& am = p_->ensureAm();` 到循环结束(L447-483)整段替换为一行:

```cpp
    collectBehavioralSources(*vs, parent, bus, r.sources);
    return r;
}
```

紧随其后新增(逻辑与原循环逐行一致,只是 `parent` 参数化为 `scopeId`):

```cpp
void DesignDb::collectBehavioralSources(const ValueSymbol& vs, const std::string& scopeId,
                                        bool bus, std::vector<DriverSourceInfo>& out) {
    auto& am = p_->ensureAm();
    std::string netName(vs.name);
    std::set<std::string> seen;
    for (auto& s0 : out) seen.insert(s0.id);
    for (auto& [d, range] : am.getDrivers(vs)) {
        const Symbol* cs = d->containingSymbol;
        if (cs->kind == SK::Instance) continue;  // structural driver -> the port-connection scan's job

        slang::SourceRange sr = d->getSourceRange();
        std::string f;
        try {
            f = p_->sm->getFullPath(sr.start().buffer()).string();
        } catch (...) {
            f.clear();
        }
        int ln = static_cast<int>(p_->sm->getLineNumber(sr.start()));

        DriverSourceInfo s;
        s.file = f;
        s.line = ln;
        s.bus = bus;
        if (d->isInputPort()) {
            s.kind = "port";
            s.id = "port:" + scopeId + "." + netName;
            s.label = netName;
            s.detail = "input port";
        } else {
            std::string detail =
                (d->kind == slang::analysis::DriverKind::Continuous) ? "assign" : srcLabel(d->source);
            s.kind = "logic";
            s.id = "logic:" + f + ":" + std::to_string(ln);
            s.label = detail;
            s.detail = detail;
        }
        if (!seen.count(s.id)) {
            seen.insert(s.id);
            out.push_back(std::move(s));
        }
    }
}
```

- [ ] **Step 3: DesignDb.cpp — traceInto 实现**(加在 `collectBehavioralSources` 之后)

```cpp
TraceIntoResult DesignDb::traceInto(const std::string& nodeId, const std::string& port) {
    TraceIntoResult r;
    ensureRegistered(nodeId, /*expandSelf*/ false);
    auto it = p_->inst.find(nodeId);
    if (it == p_->inst.end() || !isRealInstance(*it->second)) return r;
    const InstanceBodySymbol& body = it->second->as<InstanceSymbol>().body;

    // boundary port -> its INTERNAL net: the bridge into self.body (spec §1, Netlist.cpp:79)
    const PortSymbol* bp = nullptr;
    for (const Symbol* p : body.getPortList())
        if (p->kind == SK::Port && p->name == port) {
            bp = &p->as<PortSymbol>();
            break;
        }
    if (!bp || !bp->internalSymbol) return r;
    const Symbol* net = bp->internalSymbol;

    std::string dir = dirStr(bp->direction);
    bool wantDrivers = (dir == "out" || dir == "inout");
    bool wantLoads = (dir == "in" || dir == "inout");

    const auto* vs = net->as_if<ValueSymbol>();
    bool bus = vs && vs->getType().getBitWidth() > 1;
    r.netName = std::string(net->name);
    r.bus = bus;

    std::vector<const Symbol*> kids;
    collectChildren(body, kids);  // descends generate blocks, like extractLocalNetlist
    std::set<std::string> seen;
    for (const Symbol* k : kids) {
        if (!isRealInstance(*k)) continue;
        const auto& ci = k->as<InstanceSymbol>();
        for (auto* pc : ci.getPortConnections()) {
            const Symbol& p = pc->port;
            if (p.kind != SK::Port || connNet(pc) != net) continue;
            std::string cdir = dirStr(p.as<PortSymbol>().direction);
            TraceEdge e;
            e.netName = r.netName;
            e.bus = bus;
            if (wantDrivers && cdir == "out") {
                e.fromNode = ci.getHierarchicalPath();
                e.fromPort = std::string(p.name);
                e.toNode = nodeId;
                e.toPort = port;
            } else if (wantLoads && cdir == "in") {
                e.fromNode = nodeId;
                e.fromPort = port;
                e.toNode = ci.getHierarchicalPath();
                e.toPort = std::string(p.name);
            } else {
                continue;
            }
            r.edges.push_back(std::move(e));
            std::string cid = ci.getHierarchicalPath();
            if (!seen.count(cid)) {
                seen.insert(cid);
                p_->registerSym(ci);
                r.nodes.push_back(p_->metaOf(ci));
            }
        }
    }

    // out pin with no structural (child-instance) driver -> behavioral sources (spec §2.2)
    bool hasDriverEdge = std::any_of(r.edges.begin(), r.edges.end(),
                                     [&](const TraceEdge& e) { return e.toNode == nodeId; });
    if (wantDrivers && !hasDriverEdge && vs) collectBehavioralSources(*vs, nodeId, bus, r.sources);
    return r;
}
```

- [ ] **Step 4: 构建 + 跑测,确认绿**

```bash
cmake --build /Users/jiangbowang/MOI/2025/dftartist/dft-core/build -j8 --target test_traceinto \
  && /Users/jiangbowang/MOI/2025/dftartist/dft-core/build/test/test_traceinto \
     /Users/jiangbowang/MOI/2025/dftartist/dft-core/test/rtl/traceinto/traceinto.sv
```

预期:`test_traceinto OK`。(可执行文件路径若不同,用 `ctest --test-dir build -R traceinto -V` 代替。)

- [ ] **Step 5: 全量回归**(traceDrivers 重构必须不破现有行为)

```bash
cmake --build /Users/jiangbowang/MOI/2025/dftartist/dft-core/build -j8 && ctest --test-dir /Users/jiangbowang/MOI/2025/dftartist/dft-core/build --output-on-failure
```

预期:全部 PASS。

- [ ] **Step 6: Commit**

```bash
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core add hdl-core/service/DesignDb.h hdl-core/service/DesignDb.cpp test/unit/test_traceinto.cpp test/rtl/traceinto/traceinto.sv test/CMakeLists.txt
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core commit -m "feat(hdl-core): DesignDb::traceInto——经 port.internalSymbol 跨进模块内部一步(结构边+行为源单响应)+单测"
```

### Task A3: daemon 协议 `trace-into`

**Files:**
- Modify: `hdl-core/protocol/NdjsonServer.cpp`(dispatch 里 `trace-drivers` 分支之后,~L258)

- [ ] **Step 1: 序列化分支**(照 trace-fanin(L201) + trace-drivers(L230) 模板,保持本文件"就地内联序列化"的惯例)

```cpp
    } else if (method == "trace-into") {
        TraceIntoResult tr = db.traceInto(pstr("nodeId"), pstr("port"));
        w.beginObject();
        w.key("edges");
        w.beginArray();
        for (auto& e : tr.edges) {
            w.beginObject();
            w.key("fromNode");
            w.value(e.fromNode);
            w.key("fromPort");
            w.value(e.fromPort);
            w.key("toNode");
            w.value(e.toNode);
            w.key("toPort");
            w.value(e.toPort);
            w.key("netName");
            w.value(e.netName);
            w.key("bus");
            w.value(e.bus);
            w.endObject();
        }
        w.endArray();
        w.key("nodes");
        w.beginArray();
        for (auto& m : tr.nodes) writeMeta(w, m, false);
        w.endArray();
        w.key("sources");
        w.beginArray();
        for (auto& s : tr.sources) {
            w.beginObject();
            w.key("kind");
            w.value(s.kind);
            w.key("id");
            w.value(s.id);
            w.key("label");
            w.value(s.label);
            w.key("detail");
            w.value(s.detail);
            w.key("file");
            w.value(s.file);
            w.key("line");
            w.value(s.line);
            w.key("bus");
            w.value(s.bus);
            w.endObject();
        }
        w.endArray();
        w.key("netName");
        w.value(tr.netName);
        w.key("bus");
        w.value(tr.bus);
        w.key("truncated");
        w.value(tr.truncated);
        w.endObject();
```

- [ ] **Step 2: 构建 + 回归**

```bash
cmake --build /Users/jiangbowang/MOI/2025/dftartist/dft-core/build -j8 && ctest --test-dir /Users/jiangbowang/MOI/2025/dftartist/dft-core/build --output-on-failure
```

预期:全绿(协议层端到端由 Phase B 的 e2e 覆盖真 daemon)。

- [ ] **Step 3: Commit**

```bash
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core add hdl-core/protocol/NdjsonServer.cpp
git -C /Users/jiangbowang/MOI/2025/dftartist/dft-core commit -m "feat(protocol): daemon 暴露 trace-into(edges+nodes+sources 单响应)"
```

---

## Phase B — dft-suite 前端(worktree `/Users/jiangbowang/MOI/2025/dftartist/dft-suite-trace-into`,下述相对路径均以它为根)

### Task B1: 协议类型 + client 包装

**Files:**
- Modify: `src/core-bridge/model.ts`(`DriversResult` 之后,~L95)
- Modify: `src/core-bridge/client.ts`(`traceDrivers` 之后,~L54)

- [ ] **Step 1: model.ts 加类型**

```ts
/** trace-into 单响应:结构边 + 内部子实例 + 行为源(输出引脚无结构驱动时)。spec §2.3 */
export interface TraceIntoResult {
  edges: TraceEdge[];
  nodes: NodeMeta[];
  sources: DriverSource[];
  netName: string;
  bus: boolean;
  truncated: boolean;
}
```

- [ ] **Step 2: client.ts 加包装**(import 列表加 `TraceIntoResult`)

```ts
  traceInto: (nodeId: string, port: string): Promise<TraceIntoResult> =>
    window.dft.design.query("trace-into", { nodeId, port }) as Promise<TraceIntoResult>,
```

- [ ] **Step 3: typecheck + Commit**

```bash
npm run typecheck
git add src/core-bridge/model.ts src/core-bridge/client.ts
git commit -m "feat(hierarchy): trace-into 协议类型与 client 包装"
```

### Task B2: schematic.ts 模型层(纯函数)+ 单测

**Files:**
- Modify: `src/hierarchy/core/schematic.ts`
- Modify: `src/genconn/dfx/dfxGraph.ts:136`(图字面量补新字段)
- Create: `tests/unit/schematic-into.test.ts`(本 task 只写模型段;布局段在 B3/B4 追加)

- [ ] **Step 1: 写失败单测**(新文件,先只有模型三条)

```ts
// "往里 trace"(trace-into):模型纯函数语义 + 嵌套 ELK 构造 + 真 elkjs 布局(spec §3/§4)。
import { test } from "node:test"; import assert from "node:assert/strict";
import {
  addTraceInto, collapseInside, makeNode, makeSourceNode, markInEmpty, newSchematic, portId, toElkGraph,
  type SchEdge, type SchematicGraph,
} from "../../src/hierarchy/core/schematic.ts";
import type { PortInfo } from "../../src/hierarchy/core/model.ts";
import { layout } from "../../src/hierarchy/schematic/elkLayout.ts";
import { toLaid } from "../../src/hierarchy/schematic/laid.ts";

const P = (name: string, direction: "in" | "out"): PortInfo => ({ name, direction, width: 1, busLabel: name });

/** seed=soc(非 leaf) + 一次 traceInside(clk):u_cpu/u_mem 落在 soc 内。 */
function expandedGraph(): SchematicGraph {
  const seed = makeNode("soc", "soc", "soc|/rtl/soc.v", "module", [P("clk", "in"), P("rst_n", "in")], { isLeaf: false });
  const cpu = makeNode("soc.u_cpu", "u_cpu", "cpu|/rtl/soc.v", "module", [P("clk", "in"), P("pc", "out")], { isLeaf: true, parentId: "soc" });
  const mem = makeNode("soc.u_mem", "u_mem", "mem|/rtl/soc.v", "module", [P("clk", "in")], { isLeaf: true, parentId: "soc" });
  const edges: SchEdge[] = [
    { id: "e1", fromNode: "soc", fromPort: "clk", toNode: "soc.u_cpu", toPort: "clk", netName: "clk", bus: false },
    { id: "e2", fromNode: "soc", fromPort: "clk", toNode: "soc.u_mem", toPort: "clk", netName: "clk", bus: false },
  ];
  return addTraceInto(newSchematic(seed), "soc", "clk", [cpu, mem], edges);
}

test("addTraceInto:节点挂 parentId、inExpanded 标记、边去重", () => {
  const g = expandedGraph();
  assert.equal(g.nodes["soc.u_cpu"].parentId, "soc");
  assert.deepEqual(g.inExpanded["soc"], ["clk"]);
  const again = addTraceInto(g, "soc", "clk", [g.nodes["soc.u_cpu"]], [g.edges[0]]);
  assert.equal(again.edges.length, 2);
});

test("markInEmpty 与 addTraceInto 清除互逆", () => {
  const seed = makeNode("soc", "soc", "soc|/s.v", "module", [P("clk", "in")], { isLeaf: false });
  let g = markInEmpty(newSchematic(seed), "soc", "clk");
  assert.deepEqual(g.inEmpty["soc"], ["clk"]);
  g = addTraceInto(g, "soc", "clk", [], []);
  assert.deepEqual(g.inEmpty["soc"], []);
});

test("collapseInside:递归删后代、触边、in 标记;容器外侧 expanded 保留", () => {
  let g = expandedGraph();
  // 两级:u_cpu 里再放一个行为源(模拟对 u_cpu.pc 的 traceInside)
  const src = makeSourceNode({ id: "logic:/rtl/soc.v:3", kind: "logic", label: "always", detail: "always", file: "/rtl/soc.v", line: 3, bus: false }, "soc.u_cpu");
  g = addTraceInto(g, "soc.u_cpu", "pc", [src], [{ id: "e3", fromNode: src.id, fromPort: "o", toNode: "soc.u_cpu", toPort: "pc", netName: "pc", bus: false }]);
  g = { ...g, expanded: { soc: ["rst_n"] } };
  const c = collapseInside(g, "soc");
  assert.deepEqual(Object.keys(c.nodes), ["soc"]);
  assert.equal(c.edges.length, 0);
  assert.equal(c.inExpanded["soc"], undefined);
  assert.equal(c.inEmpty["soc"], undefined);
  assert.deepEqual(c.expanded["soc"], ["rst_n"]);
});
```

跑 `npm run test:unit` → 预期 FAIL(`addTraceInto` 等未导出、makeNode 参数不符)。

- [ ] **Step 2: schematic.ts 模型改动**

`SchNode` 接口加两个可选字段(注释风格照旧):

```ts
export interface SchNode {
  id: string;
  instanceName: string;
  designName: string;
  kind: "module" | "primitive" | "blackbox" | "port" | "logic";
  ports: SchPort[];
  loc?: { file: string; line: number };
  isLeaf?: boolean;    // false 才画内侧菱形(module 且已知非 leaf);undefined = 不画(dfx 图等)
  parentId?: string;   // 往里 trace 落进的容器;根层节点无此字段(spec §3.1)
}
```

`SchematicGraph` 加内侧标记(与 expanded/empty 平行):

```ts
  inExpanded: Record<string, string[]>;  // nodeId -> 已往里追过的引脚(内侧菱形置灰)
  inEmpty: Record<string, string[]>;     // nodeId -> 往里追为空的引脚(内部悬空死角)
```

`newSchematic` 返回值补 `inExpanded: {}, inEmpty: {}`。

`makeNode` 加可选 opts(**不破坏既有调用**,dfxGraph 的调用不传即可):

```ts
export function makeNode(id: string, instanceName: string, definitionId: string, kind: SchNode["kind"], ports: PortInfo[],
                         opts: { isLeaf?: boolean; parentId?: string } = {}): SchNode {
  return {
    id, instanceName, kind, designName: splitDefId(definitionId).designName,
    ports: ports.map((p) => ({ name: p.name, direction: p.direction, busLabel: p.busLabel })),
    ...(opts.isLeaf !== undefined ? { isLeaf: opts.isLeaf } : {}),
    ...(opts.parentId ? { parentId: opts.parentId } : {}),
  };
}
```

`makeSourceNode` 加可选 parentId(行为源画进容器):

```ts
export function makeSourceNode(src: DriverSource, parentId?: string): SchNode {
  return {
    id: src.id,
    instanceName: src.detail,
    designName: src.label,
    kind: src.kind,
    ports: [{ name: "o", direction: "out", busLabel: src.label }],
    loc: { file: src.file, line: src.line },
    ...(parentId ? { parentId } : {}),
  };
}
```

新增三个纯函数(放在 `markEmpty` 附近):

```ts
/** 内侧菱形死角:往里追无结构边也无行为源(spec §2.4)。 */
export function markInEmpty(g: SchematicGraph, nodeId: string, port: string): SchematicGraph {
  const prev = g.inEmpty[nodeId] ?? [];
  if (prev.includes(port)) return g;
  return { ...g, inEmpty: { ...g.inEmpty, [nodeId]: [...prev, port] } };
}

/** 合并一步"往里 trace":新节点已带 parentId(=容器);标记容器该引脚 inExpanded、清死角。 */
export function addTraceInto(g: SchematicGraph, containerId: string, port: string, newNodes: SchNode[], edges: SchEdge[]): SchematicGraph {
  const nodes = { ...g.nodes };
  for (const n of newNodes) if (!nodes[n.id]) nodes[n.id] = n;
  const have = new Set(g.edges.map((e) => e.id));
  const allEdges = [...g.edges, ...edges.filter((e) => !have.has(e.id))];
  const prev = g.inExpanded[containerId] ?? [];
  const inExpanded = { ...g.inExpanded, [containerId]: prev.includes(port) ? prev : [...prev, port] };
  const wasEmpty = g.inEmpty[containerId];
  const inEmpty = wasEmpty?.includes(port)
    ? { ...g.inEmpty, [containerId]: wasEmpty.filter((p) => p !== port) }
    : g.inEmpty;
  return { ...g, nodes, edges: allEdges, inExpanded, inEmpty };
}

/** 收起容器:递归移除全部后代节点、触及后代的边与标记;容器自身清 in 标记、外侧标记保留(spec §5.3)。 */
export function collapseInside(g: SchematicGraph, containerId: string): SchematicGraph {
  const doomed = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of Object.values(g.nodes))
      if (n.parentId && !doomed.has(n.id) && (n.parentId === containerId || doomed.has(n.parentId))) {
        doomed.add(n.id);
        grew = true;
      }
  }
  if (!doomed.size) return g;
  const nodes: Record<string, SchNode> = {};
  for (const [id, n] of Object.entries(g.nodes)) if (!doomed.has(id)) nodes[id] = n;
  const edges = g.edges.filter((e) => !doomed.has(e.fromNode) && !doomed.has(e.toNode));
  const strip = (m: Record<string, string[]>, alsoContainer: boolean): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const [id, ps] of Object.entries(m)) if (!doomed.has(id) && !(alsoContainer && id === containerId)) out[id] = ps;
    return out;
  };
  return { ...g, nodes, edges, expanded: strip(g.expanded, false), empty: strip(g.empty, false), inExpanded: strip(g.inExpanded, true), inEmpty: strip(g.inEmpty, true) };
}
```

- [ ] **Step 3: dfxGraph.ts:136 字面量补字段**

```ts
  return { seedId, nodes, edges, expanded: {}, empty: {}, inExpanded: {}, inEmpty: {} };
```

- [ ] **Step 4: 跑测确认绿 + 全量**

```bash
npm run typecheck && npm run test:unit
```

预期:本文件 3 条 PASS,既有全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/hierarchy/core/schematic.ts src/genconn/dfx/dfxGraph.ts tests/unit/schematic-into.test.ts
git commit -m "feat(schematic): parentId 嵌套模型 + addTraceInto/collapseInside/markInEmpty 纯函数与单测"
```

### Task B3: toElkGraph 嵌套构造

**Files:**
- Modify: `src/hierarchy/core/schematic.ts`(`ElkInputNode` + `toElkGraph`)
- Modify: `tests/unit/schematic-into.test.ts`(追加 2 条结构级测试)

- [ ] **Step 1: 追加失败测试**

```ts
test("toElkGraph:嵌套 children + 容器 padding/尺寸 0 + 仅嵌套时开 INCLUDE_CHILDREN", () => {
  const g = expandedGraph();
  const elk = toElkGraph(g);
  assert.equal(elk.layoutOptions["elk.hierarchyHandling"], "INCLUDE_CHILDREN");
  const soc = elk.children.find((c) => c.id === "soc")!;
  assert.equal(soc.children?.length, 2);
  assert.equal(soc.width, 0);
  assert.ok(soc.layoutOptions["elk.padding"].startsWith("[top=46"));
  // 平铺图回归:无 parentId 时不开 INCLUDE_CHILDREN、无 children
  const flat = toElkGraph(newSchematic(makeNode("t.u", "u", "m|/m.v", "module", [P("i", "in")])));
  assert.equal(flat.layoutOptions["elk.hierarchyHandling"], undefined);
  assert.equal(flat.children[0].children, undefined);
});

test("toElkGraph:新增内部节点拿到兄弟下方的 elk.position 提示(spec §4-7)", () => {
  const g = expandedGraph();
  const prev = { soc: { x: 18, y: 12 }, "soc.u_cpu": { x: 18, y: 46 } };  // u_mem 无 prev = 新节点
  const elk = toElkGraph(g, prev);
  const soc = elk.children.find((c) => c.id === "soc")!;
  assert.equal(soc.children!.find((c) => c.id === "soc.u_mem")!.layoutOptions["elk.position"], "(18,146)");
  assert.equal(soc.children!.find((c) => c.id === "soc.u_cpu")!.layoutOptions["elk.position"], "(18,46)");
});
```

- [ ] **Step 2: 实现**

`ElkInputNode` 加 `children?: ElkInputNode[];`。`toElkGraph` 整体替换为(平铺图输出与现状逐字段一致——回归由既有 schematic-elk.test 把关):

```ts
export function toElkGraph(g: SchematicGraph, prev?: Record<string, { x: number; y: number }>): ElkGraphInput {
  const kidsOf: Record<string, SchNode[]> = {};
  const roots: SchNode[] = [];
  for (const n of Object.values(g.nodes)) {
    if (n.parentId && g.nodes[n.parentId]) (kidsOf[n.parentId] ??= []).push(n);
    else roots.push(n);
  }
  const nested = Object.keys(kidsOf).length > 0;

  // 新增内部节点必须带"放到已 pin 兄弟下方"的位置提示,否则 ELK 抢占顶部把老盒挤走
  // (spec §4-7,probe F5/F7)。提示 y 只是排序键。
  const hintFor = (n: SchNode): string | null => {
    if (!prev || prev[n.id] || !n.parentId) return null;
    const sib = (kidsOf[n.parentId] ?? []).map((s) => prev[s.id]).filter((p): p is { x: number; y: number } => !!p);
    if (!sib.length) return null;
    return `(18,${Math.max(...sib.map((p) => p.y)) + 100})`;
  };

  const build = (n: SchNode): ElkInputNode => {
    const inner = kidsOf[n.id];
    // 容器尺寸交给 ELK(输入被忽略,传 0;spec §4-2);边界引脚坐标 ELK 自摆(§4-4),
    // FIXED_POS 对容器无效但 side 仍生效,叶子盒行坐标照旧精确。
    const { width, height } = inner ? { width: 0, height: 0 } : nodeDims(n);
    let inRow = 0, outRow = 0;
    const src = n.kind === "port" || n.kind === "logic";
    const pos = prev?.[n.id] ? `(${prev[n.id].x},${prev[n.id].y})` : hintFor(n);
    return {
      id: n.id, width, height,
      layoutOptions: {
        "elk.portConstraints": "FIXED_POS",
        ...(pos ? { "elk.position": pos } : {}),
        ...(inner
          ? {
              // top=46 给两行标题让位(§4-3);crossing-min 逐层读取,容器需重复声明(§4-8)
              "elk.padding": "[top=46,left=18,bottom=12,right=18]",
              ...(prev ? { "elk.layered.crossingMinimization.semiInteractive": "true" } : {}),
            }
          : {}),
      },
      ports: n.ports.map((p) => {
        const out = p.direction === "out";
        const row = out ? outRow++ : inRow++;
        return {
          id: portId(n.id, p.name),
          layoutOptions: { "elk.port.side": out ? "EAST" : "WEST" },
          x: out ? width - 3 : -3,
          y: src ? height / 2 - 3 : PIN_ROW0 + row * PIN_PITCH - 3,
          width: 6, height: 6,
        };
      }),
      ...(inner ? { children: inner.map(build) } : {}),
    };
  };

  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "150",
      "elk.spacing.edgeEdge": "16",
      "elk.spacing.edgeNode": "20",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "16",
      "elk.layered.spacing.edgeNodeBetweenLayers": "20",
      ...(nested ? { "elk.hierarchyHandling": "INCLUDE_CHILDREN" } : {}),
      ...(prev ? { "elk.layered.crossingMinimization.semiInteractive": "true" } : {}),
    },
    children: roots.map(build),
    // 边保持平铺:ELK 自动把内层边归入正确容器(spec §4-5,probe P1b)
    edges: g.edges.map((e) => ({ id: e.id, sources: [portId(e.fromNode, e.fromPort)], targets: [portId(e.toNode, e.toPort)] })),
  };
}
```

- [ ] **Step 3: 跑测(含既有 schematic-elk 回归)+ Commit**

```bash
npm run typecheck && npm run test:unit
git add src/hierarchy/core/schematic.ts tests/unit/schematic-into.test.ts
git commit -m "feat(schematic): toElkGraph 嵌套构造——INCLUDE_CHILDREN(仅嵌套)+容器 padding+新内部节点位置提示"
```

### Task B4: laid.ts 递归展平 + d.ts 扩展

**Files:**
- Modify: `src/hierarchy/schematic/elk.bundled.d.ts`
- Modify: `src/hierarchy/schematic/laid.ts`(`Box`/`toLaid`/`anchorTo`)
- Modify: `tests/unit/schematic-into.test.ts`(追加 2 条真 elkjs 测试)

- [ ] **Step 1: 追加失败测试**

```ts
test("真 elkjs:容器自动撑大、子盒绝对坐标、内层边随容器偏移、innerPorts 在内侧", async () => {
  const g = expandedGraph();
  const laid = toLaid(await layout(toElkGraph(g)), g.nodes, g.edges);
  const soc = laid.boxes.find((b) => b.node.id === "soc")!;
  const cpu = laid.boxes.find((b) => b.node.id === "soc.u_cpu")!;
  assert.ok(soc.isContainer && !cpu.isContainer);
  assert.ok(cpu.x > soc.x && cpu.y > soc.y, "子盒在容器内(绝对坐标)");
  assert.ok(cpu.x + cpu.w <= soc.x + soc.w + 1 && cpu.y + cpu.h <= soc.y + soc.h + 1);
  assert.equal(soc.x + cpu.rel.x, cpu.x, "rel + 容器原点 = 绝对");
  assert.ok(soc.w > cpu.w && soc.h > cpu.h, "容器撑大到能装下子盒");
  // 内层边 e1(soc.clk→u_cpu.clk)终点与 u_cpu.clk 锚点同行(容器偏移已应用)
  const wire = laid.wires.find((w) => w.id === "e1")!;
  const endY = wire.points[wire.points.length - 1];
  assert.ok(Math.abs(endY - cpu.ports[portId("soc.u_cpu", "clk")].y) < 1, `wire endY=${endY}`);
  // innerPorts 在边界内侧:WEST 引脚 inner.x > outer.x
  const outer = soc.ports[portId("soc", "clk")];
  const inner = soc.innerPorts[portId("soc", "clk")];
  assert.ok(inner.x > outer.x);
});

test("真 elkjs:内层稳定性——老子盒 pin 住 + 新子盒发提示,顺序保持(spec §4-7)", async () => {
  const g = expandedGraph();
  const g1: SchematicGraph = {
    ...g,
    nodes: Object.fromEntries(Object.entries(g.nodes).filter(([id]) => id !== "soc.u_mem")),
    edges: g.edges.filter((e) => e.id !== "e2"),
  };
  const laid1 = toLaid(await layout(toElkGraph(g1)), g1.nodes, g1.edges);
  const prev: Record<string, { x: number; y: number }> = {};
  for (const b of laid1.boxes) prev[b.node.id] = b.node.parentId ? b.rel : { x: b.x, y: b.y };
  const laid2 = toLaid(await layout(toElkGraph(g, prev)), g.nodes, g.edges);
  const cpu = laid2.boxes.find((b) => b.node.id === "soc.u_cpu")!;
  const mem = laid2.boxes.find((b) => b.node.id === "soc.u_mem")!;
  assert.ok(cpu.y < mem.y, `老盒 u_cpu(${cpu.y}) 应保持在新盒 u_mem(${mem.y}) 上方`);
});
```

- [ ] **Step 2: d.ts 扩展**(嵌套输出 + 边的 container 归属)

```ts
  export interface ElkLaidEdge { id: string; sections?: ElkLaidEdgeSection[]; container?: string; }
  export interface ElkLaidNode { id: string; x?: number; y?: number; width?: number; height?: number; ports?: ElkLaidPort[]; children?: ElkLaidNode[]; edges?: ElkLaidEdge[]; }
```

- [ ] **Step 3: laid.ts 实现**

`Box` 接口替换为:

```ts
export interface Box {
  node: SchNode; x: number; y: number; w: number; h: number;
  /** 相对父容器的坐标(根层 = 布局系坐标)。位置记忆按父系回喂 ELK(spec §4-8)。 */
  rel: { x: number; y: number };
  ports: Record<string, { x: number; y: number }>;
  /** 镜像到边界内侧的锚点(内侧菱形 = 往里追,spec §5.1)。 */
  innerPorts: Record<string, { x: number; y: number }>;
  isContainer: boolean;
}
```

`toLaid` 整体替换(平铺图行为与现状一致;标签去重段原样保留):

```ts
export function toLaid(elk: LaidOutGraph, nodes: Record<string, SchNode>, edges: SchEdge[]): Laid {
  const boxes: Box[] = [];
  const hasKids = new Set<string>();
  for (const n of Object.values(nodes)) if (n.parentId) hasKids.add(n.parentId);
  // 每个容器坐标系的绝对原点;边 sections 相对其 container 节点(spec §4-5)
  const origin: Record<string, { x: number; y: number }> = { root: { x: 0, y: 0 } };

  const walk = (c: NonNullable<LaidOutGraph["children"]>[number], ox: number, oy: number): void => {
    const node = nodes[c.id];
    if (!node) return;
    const rx = c.x ?? 0, ry = c.y ?? 0;
    const x = ox + rx, y = oy + ry;
    origin[c.id] = { x, y };
    const outIds = new Set(node.ports.filter((p) => p.direction === "out").map((p) => portId(node.id, p.name)));
    const ports: Record<string, { x: number; y: number }> = {};
    const innerPorts: Record<string, { x: number; y: number }> = {};
    for (const p of c.ports ?? []) {
      const cx = x + (p.x ?? 0) + (p.width ?? 6) / 2;
      const cy = y + (p.y ?? 0) + (p.height ?? 6) / 2;
      const out = outIds.has(p.id);
      ports[p.id] = { x: cx + (out ? PIN_STUB : -PIN_STUB), y: cy };
      innerPorts[p.id] = { x: cx + (out ? -PIN_STUB : PIN_STUB), y: cy };
    }
    boxes.push({ node, x, y, rel: { x: rx, y: ry }, w: c.width ?? 130, h: c.height ?? 52, ports, innerPorts, isContainer: hasKids.has(c.id) });
    for (const k of c.children ?? []) walk(k, x, y);
  };
  for (const c of elk.children ?? []) walk(c, 0, 0);

  const byId = new Map(edges.map((e) => [e.id, e]));
  const wires: Wire[] = [];
  const collect = (es: readonly { id: string; sections?: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; bendPoints?: { x: number; y: number }[] }[]; container?: string }[] | undefined, fallback: string): void => {
    for (const e of es ?? []) {
      const s = e.sections?.[0];
      if (!s) continue;
      const o = origin[e.container ?? fallback] ?? { x: 0, y: 0 };
      const pts = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].flatMap((p) => [p.x + o.x, p.y + o.y]);
      const edge = byId.get(e.id);
      wires.push({ id: e.id, points: pts, bus: edge?.bus ?? false, net: edge?.netName ?? "" });
    }
  };
  collect(elk.edges, "root");
  const walkEdges = (c: NonNullable<LaidOutGraph["children"]>[number]): void => {
    collect(c.edges, c.id);
    for (const k of c.children ?? []) walkEdges(k);
  };
  for (const c of elk.children ?? []) walkEdges(c);

  // A pin driven by multiple behavioral sources yields wires sharing an END point —
  // keep the net label on the first only (same net, they'd stack). Fanout wires end
  // at distinct pins, so every fanout wire keeps its label (spec §2.2).
  const seenEnd = new Set<string>();
  for (const w of wires) {
    const k = `${w.points[w.points.length - 2]},${w.points[w.points.length - 1]}`;
    if (seenEnd.has(k)) w.net = "";
    else seenEnd.add(k);
  }
  return { boxes, wires };
}
```

`anchorTo` 的 boxes 映射补 innerPorts 平移(rel 不动——父系坐标锚移不变):

```ts
  const shift = (m: Record<string, { x: number; y: number }>): Record<string, { x: number; y: number }> =>
    Object.fromEntries(Object.entries(m).map(([k, pt]) => [k, { x: pt.x + dx, y: pt.y + dy }]));
  return {
    boxes: laid.boxes.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy, ports: shift(b.ports), innerPorts: shift(b.innerPorts) })),
    wires: laid.wires.map((w) => ({ ...w, points: w.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) })),
  };
```

- [ ] **Step 4: 跑测 + Commit**

```bash
npm run typecheck && npm run test:unit
git add src/hierarchy/schematic/elk.bundled.d.ts src/hierarchy/schematic/laid.ts tests/unit/schematic-into.test.ts
git commit -m "feat(schematic): laid 递归展平——容器绝对原点偏移边坐标 + innerPorts/rel/isContainer"
```

### Task B5: store 编排(traceInside/collapseInside)

**Files:**
- Modify: `src/hierarchy/store.ts`

- [ ] **Step 1: import 与接口**

import 更新(schematic.ts 行):加 `addTraceInto, markInEmpty`,并 `collapseInside as collapseInsideGraph`。`AppState` 接口在 `traceSchematic` 声明后加:

```ts
  /** 内侧菱形:跨进 nodeId 内部一步(trace-into,结构边+行为源单响应)。 */
  traceInside: (seedNodeId: string, nodeId: string, port: string) => Promise<void>;
  /** 右键容器"Collapse internals":递归移除内部、还原黑盒。 */
  collapseInside: (seedNodeId: string, nodeId: string) => void;
```

- [ ] **Step 2: 实现**(加在 `traceSchematic` 实现之后;习语照抄它——getPorts 建全引脚盒、blackbox 引脚合成)

```ts
    traceInside: async (seedNodeId, nodeId, port) => {
      const graph = get().schematics[seedNodeId];
      if (!graph) return;
      try {
        const res = await hs.traceInto(nodeId, port);
        if (res.edges.length === 0 && res.sources.length === 0) {
          set((s) => ({ schematics: { ...s.schematics, [seedNodeId]: markInEmpty(s.schematics[seedNodeId], nodeId, port) } }));
          return;
        }
        const newNodes: SchNode[] = [];
        for (const m of res.nodes) {
          if (graph.nodes[m.id]) continue;
          const { ports } = await hs.getPorts({ nodeId: m.id });
          newNodes.push(makeNode(m.id, m.instanceName, m.definitionId, m.kind, ports, { isLeaf: m.isLeaf, parentId: nodeId }));
        }
        const ensure = (n: SchNode, name: string, direction: Direction): void => {
          if (!n.ports.some((p) => p.name === name)) n.ports.push({ name, direction, busLabel: name });
        };
        const byId: Record<string, SchNode> = {};
        for (const n of newNodes) byId[n.id] = n;
        const edges: SchEdge[] = res.edges.map((e) => {
          if (byId[e.fromNode]) ensure(byId[e.fromNode], e.fromPort, "out");
          if (byId[e.toNode]) ensure(byId[e.toNode], e.toPort, "in");
          return { id: edgeId(e.fromNode, e.fromPort, e.toNode, e.toPort), fromNode: e.fromNode, fromPort: e.fromPort, toNode: e.toNode, toPort: e.toPort, netName: e.netName, bus: e.bus };
        });
        // 行为源画进容器内(port 箭头/logic 标签),边指向被追的边界引脚
        for (const src of res.sources) {
          if (!graph.nodes[src.id] && !byId[src.id]) {
            const sn = makeSourceNode(src, nodeId);
            byId[sn.id] = sn;
            newNodes.push(sn);
          }
          edges.push({ id: edgeId(src.id, "o", nodeId, port), fromNode: src.id, fromPort: "o", toNode: nodeId, toPort: port, netName: res.netName, bus: src.bus });
        }
        set((s) => ({ schematics: { ...s.schematics, [seedNodeId]: addTraceInto(s.schematics[seedNodeId], nodeId, port, newNodes, edges) } }));
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    collapseInside: (seedNodeId, nodeId) =>
      set((s) => ({ schematics: { ...s.schematics, [seedNodeId]: collapseInsideGraph(s.schematics[seedNodeId], nodeId) } })),
```

- [ ] **Step 3: makeNode 调用点传 isLeaf**(内侧菱形只画已知非 leaf 的 module,spec §5.1)

- `store.ts:334`(openSchematic seed):`makeNode(nodeId, node.instanceName, node.definitionId, node.kind, ports, { isLeaf: node.isLeaf })`
- `store.ts:381`(addToSchematic):同上加 `{ isLeaf: node.isLeaf }`
- `store.ts:444`(traceSchematic 新盒):`makeNode(m.id, m.instanceName, m.definitionId, m.kind, ports, { isLeaf: m.isLeaf })`

- [ ] **Step 4: typecheck + 单测 + Commit**

```bash
npm run typecheck && npm run test:unit
git add src/hierarchy/store.ts
git commit -m "feat(hierarchy): traceInside/collapseInside store 编排 + makeNode 补 isLeaf"
```

### Task B6: SchematicTab 渲染(容器框/内侧菱形/收起菜单)

**Files:**
- Modify: `src/hierarchy/schematic/SchematicTab.tsx`

- [ ] **Step 1: 组件顶部接线**

`SchematicTab` 里加(现有 `trace`/`openHdl` 旁):

```ts
  const traceInside = useStore((s) => s.traceInside);
  const collapse = useStore((s) => s.collapseInside);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [ctxMenu]);
```

位置记忆改"子盒记相对父系坐标"(spec §4-8)——布局 effect 里那行替换为:

```ts
      prevPosBySeed.set(seedNodeId, Object.fromEntries(anchored.boxes.map((b) => [b.node.id, b.node.parentId ? b.rel : { x: b.x, y: b.y }])));
```

- [ ] **Step 2: 静态层绘制顺序**(容器在最底、连线其上、叶盒最上——容器 Rect 不得盖住内部连线)

静态 Layer 的 JSX 改为:

```tsx
        <Layer listening={false}>
          {laid?.boxes.filter((b) => b.isContainer).map((b) => (
            <StaticBox key={b.node.id} box={b} isSeed={b.node.id === seedNodeId} />
          ))}
          {laid?.wires.map((w) => ( /* 现有 wire JSX 原样保留 */ ))}
          {laid?.boxes.filter((b) => !b.isContainer).map((b) => (
            <StaticBox key={b.node.id} box={b} isSeed={b.node.id === seedNodeId} />
          ))}
        </Layer>
```

- [ ] **Step 3: StaticBox 容器画法 + 内侧 stub**

`StaticBox` 的模块盒分支改造:容器用透明底色不遮内容;非 leaf module 引脚加内侧 stub 线:

```tsx
  const { x, y, w, h } = box;
  const stroke = isSeed ? "#e0a93b" : "#48505c";
  const showInner = node.kind === "module" && node.isLeaf === false;  // 含容器与可下钻黑盒态
  return (
    <Group>
      <Rect
        x={x} y={y} width={w} height={h} cornerRadius={4}
        fill={box.isContainer ? "rgba(122,132,144,0.06)" : FILL[node.kind]}
        stroke={stroke} strokeWidth={isSeed ? 2 : 1}
        perfectDrawEnabled={false}
      />
      {/* 标题两行照旧 */}
      <Text x={x} y={y + 5} width={w} align="center" text={node.designName} fontSize={11} fontStyle="bold" fill="#dfe4ea" listening={false} perfectDrawEnabled={false} />
      <Text x={x} y={y + 19} width={w} align="center" text={node.instanceName} fontSize={9} fill="#8b95a3" listening={false} perfectDrawEnabled={false} />
      {node.ports.map((p) => {
        const pid = portId(node.id, p.name);
        const pt = box.ports[pid];
        if (!pt) return null;
        const out = p.direction === "out";
        const ipt = box.innerPorts[pid];
        return (
          <Group key={p.name}>
            <Line
              points={out ? [x + w, pt.y, pt.x, pt.y] : [pt.x, pt.y, x, pt.y]}
              stroke="#6b7785" strokeWidth={1} perfectDrawEnabled={false}
            />
            {showInner && ipt && (
              <Line
                points={out ? [x + w, pt.y, ipt.x, ipt.y] : [x, pt.y, ipt.x, ipt.y]}
                stroke="#6b7785" strokeWidth={1} perfectDrawEnabled={false}
              />
            )}
            {out
              ? <Text x={x} y={pt.y - 5} width={w - 7} align="right" text={p.busLabel} fontSize={9.5} fill="#cdd4dc" listening={false} perfectDrawEnabled={false} />
              : <Text x={x + 7} y={pt.y - 5} text={p.busLabel} fontSize={9.5} fill="#cdd4dc" listening={false} perfectDrawEnabled={false} />}
          </Group>
        );
      })}
    </Group>
  );
```

- [ ] **Step 4: InteractiveBox 内侧菱形 + 容器右键**

props 扩为:

```ts
  box: Box; isSeed: boolean; expanded: string[]; empty: string[]; inExpanded: string[]; inEmpty: string[];
  onPin: (port: string, dir: "fanin" | "fanout") => void;
  onPinInside: (port: string) => void;
  onOpenHdl: () => void;
  onCtx: (x: number, y: number) => void;
```

hit-rect 加(仅容器响应右键):

```tsx
        onContextMenu={box.isContainer ? (e) => { e.evt.preventDefault(); onCtx(e.evt.clientX, e.evt.clientY); } : undefined}
```

外侧菱形循环之后追加内侧菱形(弱化色,三态同外侧;spec §5.1):

```tsx
      {!src && node.kind === "module" && node.isLeaf === false && node.ports.map((p) => {
        const ipt = box.innerPorts[portId(node.id, p.name)];
        if (!ipt) return null;
        const done = inExpanded.includes(p.name);
        const dead = !done && inEmpty.includes(p.name);
        const out = p.direction === "out";
        const solid = done ? "#5a6470" : out ? "#8a5a20" : "#2c7a64";
        return (
          <RegularPolygon
            key={"in:" + p.name}
            x={ipt.x} y={ipt.y} sides={4} radius={dead ? 4 : 5} rotation={45}
            fill={dead ? undefined : solid}
            stroke={dead ? "#6b7785" : undefined} strokeWidth={dead ? 1.3 : undefined}
            onClick={() => onPinInside(p.name)} onTap={() => onPinInside(p.name)}
            onMouseEnter={cursorPointer} onMouseLeave={cursorDefault}
            perfectDrawEnabled={false}
          />
        );
      })}
```

交互 Layer 的调用点补新 props:

```tsx
              inExpanded={graph.inExpanded[b.node.id] ?? []}
              inEmpty={graph.inEmpty[b.node.id] ?? []}
              onPinInside={(port) => void traceInside(seedNodeId, b.node.id, port)}
              onCtx={(x, y) => setCtxMenu({ x, y, nodeId: b.node.id })}
```

- [ ] **Step 5: 收起菜单**(`.schwrap` 内、`</Stage>` 之后;复用 .cmenu/.cmi 样式)

```tsx
      {ctxMenu && (
        <div className="cmenu" style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y }} onClick={(e) => e.stopPropagation()}>
          <div className="cmi" data-menu="collapse-inside" onClick={() => { collapse(seedNodeId, ctxMenu.nodeId); setCtxMenu(null); }}>
            Collapse internals
          </div>
        </div>
      )}
```

- [ ] **Step 6: 全量单测 + typecheck + Commit**

```bash
npm test
git add src/hierarchy/schematic/SchematicTab.tsx
git commit -m "feat(schematic): 容器框渲染+盒内侧菱形(往里追)+右键 Collapse internals"
```

### Task B7: e2e 回归

**Files:**
- Create: `tests/e2e/schematic-into.spec.ts`

- [ ] **Step 1: 写 e2e**(模式照 `tests/e2e/schematic.spec.ts`:launchApp + store 驱动;BIN 可被环境变量覆写)

```ts
// e2e:层次原理图"往里 trace"——seed=soc,traceInside(clk) 嵌套展开 u_cpu/u_mem,
// 再 collapseInside 还原黑盒。走真 daemon(trace-into 协议)+ 真 ELK + Konva。
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR ?? path.resolve(process.cwd(), "../dft-core/build");
const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc.f");

test("schematic trace-into: 下钻 soc 内部一步,再收起还原", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");

  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
  await page.locator('#hier-tree [data-node]').first().waitFor();

  // 右键根节点 soc → Show in Hierarchy Schematic
  await page.locator('#hier-tree [data-node="soc"]').click({ button: "right" });
  await page.locator('[data-menu="schematic"]').waitFor();
  await page.locator('[data-menu="schematic"]').click();
  await page.locator('#hier-center canvas').first().waitFor({ timeout: 10_000 });

  // 往里 trace:soc.clk → 内部 u_cpu.clk / u_mem.clk(store 驱动,同内侧菱形点击路径)
  const after = await page.evaluate(async () => {
    const store = (window as any).__hierStore;
    await store.getState().traceInside("soc", "soc", "clk");
    const g = store.getState().schematics["soc"];
    return {
      cpuParent: g.nodes["soc.u_cpu"]?.parentId,
      memParent: g.nodes["soc.u_mem"]?.parentId,
      inExpanded: g.inExpanded["soc"],
      edges: g.edges.length,
    };
  });
  expect(after.cpuParent).toBe("soc");
  expect(after.memParent).toBe("soc");
  expect(after.inExpanded).toEqual(["clk"]);
  expect(after.edges).toBe(2);
  await page.waitForTimeout(600);  // ELK+Konva 落定
  await page.screenshot({ path: "test-results/trace-into-expanded.png" });
  await expect(page.locator('#hier-center canvas').first()).toBeVisible();

  // 收起:内容移除、容器恢复黑盒
  const collapsed = await page.evaluate(() => {
    const store = (window as any).__hierStore;
    store.getState().collapseInside("soc", "soc");
    const g = store.getState().schematics["soc"];
    return { nodeIds: Object.keys(g.nodes), edges: g.edges.length, inExpanded: g.inExpanded["soc"] };
  });
  expect(collapsed.nodeIds).toEqual(["soc"]);
  expect(collapsed.edges).toBe(0);
  expect(collapsed.inExpanded).toBeUndefined();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/trace-into-collapsed.png" });
  await expect(page.locator('#hier-center canvas').first()).toBeVisible();

  await app.close();
});
```

- [ ] **Step 2: 跑 e2e**(必须走 `npm run test:e2e`——自带前置构建,防旧 dist 假绿)

```bash
npm run test:e2e
```

预期:新 spec + 既有 e2e 全 PASS。若 `#hier-tree [data-node="soc"]` 选择器不中(根节点 DOM 结构不同),看 `src/hierarchy` 树组件实际 data 属性后调整选择器,**不改产品代码**。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/schematic-into.spec.ts
git commit -m "test(e2e): trace-into 下钻/收起回归(soc fixture,真 daemon)"
```

### Task B8: 收尾验证

- [ ] **Step 1: 两仓全量绿**

```bash
ctest --test-dir /Users/jiangbowang/MOI/2025/dftartist/dft-core/build --output-on-failure
npm test && npm run test:e2e
```

- [ ] **Step 2: spec 状态行更新**(`docs/specs/2026-07-22-trace-into-design.md` 头部"状态"改为"已实现(2026-07-22),验收见 e2e schematic-into")并提交:

```bash
git add docs/specs/2026-07-22-trace-into-design.md
git commit -m "docs(spec): trace-into 状态更新——已实现"
```

- [ ] **Step 3: 汇报**——两仓分支名、测试结果、两张 e2e 截图路径(`test-results/trace-into-*.png`)交用户人工核验(对照 Tessent 截图)。**不 push、不 merge**(用户自己掌握)。

---

## 验收对照(spec → task)

| Spec 条目 | Task |
|---|---|
| §2.1 traceInto 结构语义(out→内驱/in→内载/inout 双向) | A1/A2 |
| §2.2 行为级兜底单响应 | A1(测 3)/A2 |
| §2.3 协议 trace-into | A3 + B1 |
| §2.4 边界情形(leaf/悬空→全空) | A1(测 5/6)/A2 |
| §3.1 parentId/inExpanded/inEmpty/纯函数 | B2 |
| §3.2 store 编排 | B5 |
| §4-1..8 ELK 嵌套(INCLUDE_CHILDREN 条件开/容器尺寸 0/padding/边平铺+container 偏移/新节点提示/相对坐标记忆) | B3/B4 + B6(Step1 记忆) |
| §5.1 内侧菱形三态 | B6 |
| §5.2 容器画法(透明底/标题带/z 序) | B6 |
| §5.3 收起菜单 | B6 + B2(collapseInside) |
| §6 测试(C++ 单测/TS 单测/e2e 截图) | A1/B2-B4/B7 |
| §7 分支与合并(留用户) | A0/B8 |
