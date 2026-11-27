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
    // 7. inout 引脚:内部驱动(u3.z)+ 内部负载(u4.p)双向边;有结构驱动 → 无行为兜底
    {
        auto r = db.traceInto("top.u_ip", "io");
        assert(r.edges.size() == 2);
        assert(hasEdge(r, "top.u_ip.u3", "z", "top.u_ip", "io"));
        assert(hasEdge(r, "top.u_ip", "io", "top.u_ip.u4", "p"));
        assert(r.sources.empty());
    }
    // 8. trace-through:进入行为块(always/assign)看它的输入信号 —— RTLvision 式 P1
    {
        auto hasSrc = [](const service::DriversResult& r, const std::string& kind, const std::string& label) {
            return std::any_of(r.sources.begin(), r.sources.end(), [&](const service::DriverSourceInfo& s) {
                return s.kind == kind && s.label == label;
            });
        };
        // always_ff @(posedge clk) q <= m; 读 clk(端口)+ m(结构驱动,P1 暂不解析)
        auto rq = db.traceInto("top.u_ip", "q");
        assert(rq.sources.size() == 1 && rq.sources[0].kind == "logic");
        auto inQ = db.traceLogic(rq.sources[0].id);
        assert(hasSrc(inQ, "port", "clk"));  // 至少解析出 clk 输入端口

        // assign o = i0 & i1; → 两个输入端口 i0/i1
        auto ru1 = db.traceInto("top.u_ip.u1", "o");
        assert(ru1.sources.size() == 1 && ru1.sources[0].detail == "assign");
        auto inU1 = db.traceLogic(ru1.sources[0].id);
        assert(inU1.sources.size() == 2);
        assert(hasSrc(inU1, "port", "i0") && hasSrc(inU1, "port", "i1"));

        // PER-INSTANCE block ids. u1 and u2 are two instances of the SAME module, so their
        // blocks share a file:line — with `logic:<file>:<line>` the ids collided, the registry
        // kept whichever instance traced last, and a block resolved its fan-in in an arbitrary
        // scope (the sweep's I7s). The scope segment makes them distinct and self-describing.
        auto ru2 = db.traceInto("top.u_ip.u2", "o");
        assert(ru2.sources.size() == 1 && ru2.sources[0].detail == "assign");
        assert(ru1.sources[0].id != ru2.sources[0].id && "same-module instances must not collide");
        assert(ru1.sources[0].id.rfind("logic:top.u_ip.u1:", 0) == 0);
        assert(ru2.sources[0].id.rfind("logic:top.u_ip.u2:", 0) == 0);
        // …and each resolves its OWN fan-in (u2 reads m and a, same shape as u1's ports).
        auto inU2 = db.traceLogic(ru2.sources[0].id);
        assert(inU2.sources.size() == 2);

        // `wire wi = a | b;` — a DECLARATION INITIALIZER. slang's AnalysisManager reports no
        // driver for these, so the fan-in through it used to come back empty and the trace
        // dead-ended with no explanation (real case: `wire puc_a = por | wdt_reset;` stopped
        // the reset trace at puc_a_scan). The declaration must act as the driving statement.
        auto rw = db.traceInto("top.u_ip", "w");
        assert(rw.sources.size() == 1 && rw.sources[0].kind == "logic");
        auto inW = db.traceLogic(rw.sources[0].id);            // `assign w = wi;` -> wi
        assert(inW.sources.size() == 1);
        assert(inW.sources[0].kind == "logic");
        assert(inW.sources[0].label == "wire");                // the declaration, not an assign
        assert(inW.sources[0].net == "wi");                    // names the SIGNAL it drives
        // ...and we can step THROUGH the declaration to its own reads.
        auto inWi = db.traceLogic(inW.sources[0].id);
        assert(inWi.sources.size() == 2);
        assert(hasSrc(inWi, "port", "a") && hasSrc(inWi, "port", "b"));

        // every source names the signal it drives (not just the block kind)
        assert(hasSrc(inU1, "port", "i0"));
        for (auto& s : inU1.sources) assert(!s.net.empty());

        // 防御:未知 logicId → 空
        assert(db.traceLogic("logic:/nope:1").sources.empty());
    }
    // 9. instance-driven net: `m` is driven ONLY by u1's output `.o(m)`. The analysis loop
    //    skips instance drivers and the structural fallback used to collect assigns/procs
    //    only, so this trace answered NOTHING and the schematic showed an inert net tap
    //    (real case: per_dout1 in `assign dout = per_dout1|din1|din2`).
    {
        auto r = db.traceNet("top.u_ip", "m");
        assert(r.sources.size() == 1);
        assert(r.sources[0].kind == "instance");
        assert(r.sources[0].id == "top.u_ip.u1");     // the driving child, full path
        assert(r.sources[0].label == "o");            // its driving OUTPUT pin
        assert(r.sources[0].net == "m");
        assert(r.sources[0].detail == "leaf_and");    // module name for the box caption
    }
    // 10. constant-only block: `wire cst = 1'b0;` — the fan-in is the literal, not an empty
    //     list indistinguishable from a broken trace.
    {
        auto r = db.traceNet("top.u_ip", "cst");
        assert(r.sources.size() == 1 && r.sources[0].kind == "logic");
        auto in = db.traceLogic(r.sources[0].id);
        assert(in.sources.size() == 1);
        assert(in.sources[0].kind == "constant");
        assert(in.sources[0].label == "1'b0");
    }
    // 11. COLD resolution of a wire-declaration id: a fresh DesignDb (nothing registered by a
    //     prior trace, like a restored schematic) must resolve `logic:<scope>:<file>:<line>`
    //     pointing at `wire wi = a | b;` — findBlockAt now recognizes declaration initializers.
    {
        auto rw = db.traceInto("top.u_ip", "w");
        auto inW = db.traceLogic(rw.sources[0].id);
        const std::string wiId = inW.sources[0].id;   // the wi declaration's per-instance id

        std::string err2;
        auto d2 = frontend::compileSingleTree({argv[1]}, {}, {}, err2);
        assert(d2 && "recompile failed");
        service::DesignDb db2(std::move(d2));
        auto cold = db2.traceLogic(wiId);
        assert(cold.netName == "wi");
        assert(cold.sources.size() == 2);             // ports a and b
    }
    std::printf("test_traceinto OK\n");
    return 0;
}
