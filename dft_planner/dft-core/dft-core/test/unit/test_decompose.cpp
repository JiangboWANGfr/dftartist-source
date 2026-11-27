#undef NDEBUG  // asserts must fire even in Release builds
#include "frontend/SlangCompile.h"
#include "service/DesignDb.h"

#include <algorithm>
#include <cassert>
#include <cstdio>
#include <cstdlib>
#include <string>

using namespace hdl;
using service::DecomposeResult;
using service::LogicCell;

static const LogicCell* cellById(const DecomposeResult& r, const std::string& id) {
    for (auto& c : r.cells)
        if (c.id == id) return &c;
    return nullptr;
}
/// The cell driving signal `name` (the one whose outName is that signal).
static const LogicCell* driverOf(const DecomposeResult& r, const std::string& name) {
    for (auto& c : r.cells)
        if (c.outName == name) return &c;
    return nullptr;
}
/// Follow a pin ref back to the cell it names ("cell:cN"), or nullptr for sig:/const:.
static const LogicCell* refCell(const DecomposeResult& r, const std::string& ref) {
    return ref.rfind("cell:", 0) == 0 ? cellById(r, ref.substr(5)) : nullptr;
}
static std::string pin(const LogicCell& c, const std::string& name) {
    for (auto& p : c.inputs)
        if (p.name == name) return p.ref;
    return "";
}
static bool hasKind(const DecomposeResult& r, const std::string& kind) {
    return std::any_of(r.cells.begin(), r.cells.end(),
                       [&](const LogicCell& c) { return c.kind == kind; });
}
static int countKind(const DecomposeResult& r, const std::string& kind) {
    return static_cast<int>(std::count_if(r.cells.begin(), r.cells.end(),
                                          [&](const LogicCell& c) { return c.kind == kind; }));
}
static bool hasInput(const DecomposeResult& r, const std::string& s) {
    return std::find(r.inputs.begin(), r.inputs.end(), s) != r.inputs.end();
}

/// Print a whole decomposition — run with DECOMPOSE_DUMP=1 to inspect real output.
static void dump(const char* what, const DecomposeResult& r) {
    if (!std::getenv("DECOMPOSE_DUMP")) return;
    std::printf("--- %s [%s] inputs=", what, r.blockKind.c_str());
    for (auto& i : r.inputs) std::printf("%s,", i.c_str());
    std::printf(" outputs=");
    for (auto& o : r.outputs) std::printf("%s,", o.c_str());
    std::printf("\n");
    for (auto& c : r.cells) {
        std::printf("    %s %-7s %-5s w=%d out=%-10s", c.id.c_str(), c.kind.c_str(),
                    c.label.c_str(), c.width, c.outName.c_str());
        for (auto& p : c.inputs) std::printf(" %s=%s", p.name.c_str(), p.ref.c_str());
        std::printf("\n");
    }
    std::fflush(stdout);  // asserts abort() — unflushed output would be lost
}

/// Resolve the "logic:<file>:<line>" id that drives `port` of `nodeId`.
static std::string logicIdFor(service::DesignDb& db, const std::string& nodeId,
                              const std::string& port) {
    auto r = db.traceInto(nodeId, port);
    for (auto& s : r.sources)
        if (s.kind == "logic") return s.id;
    return "";
}

int main(int argc, char** argv) {
    assert(argc >= 2 && "usage: test_decompose <decompose.sv>");
    std::string parseErr;
    auto design = frontend::compileSingleTree({argv[1]}, {}, {}, parseErr);
    assert(design && "compile failed");
    service::DesignDb db(std::move(design));

    const std::string U = "top.u_dut";

    // DECOMPOSE_DUMP=1 prints every block's real netlist (debugging aid).
    for (const char* p : {"y_and", "y_mux", "y_cmp", "q", "q_noreset", "c_out", "case_out"})
        dump(p, db.decomposeLogic(logicIdFor(db, U, p)));

    // 1. assign y_and = a & b;  ->  one `and` cell driving y_and, fed by sig:a and sig:b
    {
        std::string id = logicIdFor(db, U, "y_and");
        assert(!id.empty());
        auto r = db.decomposeLogic(id);
        assert(r.blockKind == "assign");
        const LogicCell* c = driverOf(r, "y_and");
        assert(c && c->kind == "and" && c->label == "&");
        assert(pin(*c, "a") == "sig:a" && pin(*c, "b") == "sig:b");
        assert(c->width == 4);
        assert(hasInput(r, "a") && hasInput(r, "b"));
        assert(std::find(r.outputs.begin(), r.outputs.end(), "y_and") != r.outputs.end());
    }
    // 2. assign y_mux = sel ? a : b;  ->  MUX with s=sel, a=a, b=b
    {
        auto r = db.decomposeLogic(logicIdFor(db, U, "y_mux"));
        const LogicCell* m = driverOf(r, "y_mux");
        assert(m && m->kind == "mux");
        assert(pin(*m, "s") == "sig:sel");
        assert(pin(*m, "a") == "sig:a");   // true arm
        assert(pin(*m, "b") == "sig:b");   // false arm
    }
    // 3. assign y_cmp = (a == b);  ->  eq
    {
        auto r = db.decomposeLogic(logicIdFor(db, U, "y_cmp"));
        const LogicCell* c = driverOf(r, "y_cmp");
        assert(c && c->kind == "eq" && c->label == "==");
    }
    // 4. always_ff with async reset -> DFFR carrying d / clk / rst / rval
    {
        auto r = db.decomposeLogic(logicIdFor(db, U, "q"));
        assert(r.blockKind == "always_ff");
        const LogicCell* ff = driverOf(r, "q");
        assert(ff && ff->kind == "dff" && ff->label == "DFFR");
        assert(pin(*ff, "clk") == "sig:clk");
        assert(pin(*ff, "rst") == "sig:rst_n");
        assert(pin(*ff, "rval") == "const:4'b0");   // reset value 4'h0 (SVInt rendering)
        // regression: outName was read after std::move(c), so outputs came back empty
        assert(std::find(r.outputs.begin(), r.outputs.end(), "q") != r.outputs.end());
        const LogicCell* d = refCell(r, pin(*ff, "d"));
        assert(d && d->kind == "add" && d->label == "+");  // next state a + b
        assert(pin(*d, "a") == "sig:a" && pin(*d, "b") == "sig:b");
        assert(ff->width == 4);
    }
    // 5. always_ff without reset -> plain DFF, no rst/rval pins
    {
        auto r = db.decomposeLogic(logicIdFor(db, U, "q_noreset"));
        const LogicCell* ff = driverOf(r, "q_noreset");
        assert(ff && ff->kind == "dff" && ff->label == "DFF");
        assert(pin(*ff, "clk") == "sig:clk");
        assert(pin(*ff, "rst").empty() && pin(*ff, "rval").empty());
        const LogicCell* d = refCell(r, pin(*ff, "d"));
        assert(d && d->kind == "xor");
        assert(std::find(r.outputs.begin(), r.outputs.end(), "q_noreset") != r.outputs.end());
    }
    // 6. always_comb if/else -> MUX (no DFF anywhere)
    {
        auto r = db.decomposeLogic(logicIdFor(db, U, "c_out"));
        assert(r.blockKind == "always_comb");
        assert(!hasKind(r, "dff"));
        const LogicCell* m = driverOf(r, "c_out");
        assert(m && m->kind == "mux");
        assert(pin(*m, "s") == "sig:sel");
        assert(pin(*m, "a") == "sig:a" && pin(*m, "b") == "sig:b");
    }
    // 7. case -> chain of MUXes selected by eq comparators against the case labels
    {
        auto r = db.decomposeLogic(logicIdFor(db, U, "case_out"));
        assert(r.blockKind == "always_comb");
        assert(countKind(r, "mux") == 3);   // three non-default arms
        assert(countKind(r, "eq") == 3);    // one comparator per arm label
        const LogicCell* outer = driverOf(r, "case_out");
        assert(outer && outer->kind == "mux");
        // outermost mux selects arm 0 (st==0) -> a, else the rest of the chain
        const LogicCell* sel0 = refCell(r, pin(*outer, "s"));
        assert(sel0 && sel0->kind == "eq" && pin(*sel0, "a") == "sig:st");
        assert(pin(*outer, "a") == "sig:a");
        // walk to the innermost mux: its false arm is the default value 4'h0
        const LogicCell* mid = refCell(r, pin(*outer, "b"));
        assert(mid && mid->kind == "mux" && pin(*mid, "a") == "sig:b");
        const LogicCell* inner = refCell(r, pin(*mid, "b"));
        assert(inner && inner->kind == "mux");
        const LogicCell* orCell = refCell(r, pin(*inner, "a"));
        assert(orCell && orCell->kind == "or");         // arm 2: a | b
        assert(pin(*inner, "b") == "const:4'b0");       // default arm
        assert(hasInput(r, "st"));
        // regression: the `touched` scan used to call cur(), registering a bogus self-input.
        // case_out is fully driven (default covers the rest) — it is NOT an input.
        assert(!hasInput(r, "case_out"));
    }
    // 7b. THE regression that made "Show RTL Primitives" do nothing: decompose must work with
    //     NO prior trace registering the id. A fresh DesignDb resolves it by file:line alone.
    {
        std::string parseErr2;
        auto d2 = frontend::compileSingleTree({argv[1]}, {}, {}, parseErr2);
        assert(d2 && "compile failed");
        service::DesignDb fresh(std::move(d2));
        // Ids are DERIVED (not hardcoded line numbers) so editing the fixture cannot break this.
        // `fresh` has never traced anything, so these can only resolve by source location.
        const std::string ffId = logicIdFor(db, U, "q");            // the async-reset always_ff
        const std::string asId = logicIdFor(db, U, "y_and");        // a continuous assign
        assert(!ffId.empty() && !asId.empty());
        auto r = fresh.decomposeLogic(ffId);
        assert(!r.cells.empty() && "block must resolve by source location without a prior trace");
        assert(r.blockKind == "always_ff");
        const LogicCell* ff = driverOf(r, "q");
        assert(ff && ff->kind == "dff" && ff->label == "DFFR");
        auto ra = fresh.decomposeLogic(asId);
        assert(!ra.cells.empty() && ra.blockKind == "assign");
        assert(driverOf(ra, "y_and"));
        // a line with no behavioral block -> empty, no crash (line 1 is the file header comment)
        assert(fresh.decomposeLogic("logic:" + std::string(argv[1]) + ":1").cells.empty());
        // malformed ids must not crash
        assert(fresh.decomposeLogic("logic:").cells.empty());
        assert(fresh.decomposeLogic("logic:/x/y.sv:notanumber").cells.empty());
        assert(fresh.decomposeLogic("garbage").cells.empty());
    }
    // 7c. A CONSTANT bit-select is a NAME, not logic: `a[2:1] | b[2:1]` must be one OR gate fed
    //     by sig:a[2:1] / sig:b[2:1] — no select cell, and no constant nodes for the bounds.
    {
        auto r = db.decomposeLogic(logicIdFor(db, U, "y_slice"));
        assert(!hasKind(r, "select") && "constant bit-select must fold into the signal name");
        const LogicCell* g = driverOf(r, "y_slice");
        assert(g && g->kind == "or");
        assert(pin(*g, "a") == "sig:a[2:1]");
        assert(pin(*g, "b") == "sig:b[2:1]");
        assert(hasInput(r, "a[2:1]") && hasInput(r, "b[2:1]"));
        // the bare base names must NOT appear — the slice replaced them
        assert(!hasInput(r, "a") && !hasInput(r, "b"));
        assert(r.cells.size() == 1 && "no extra cells for the constant bounds");
    }
    // 7d. A VARIABLE index is real hardware — it must stay a select cell.
    {
        auto r = db.decomposeLogic(logicIdFor(db, U, "y_dyn"));
        assert(hasKind(r, "select") && "variable index must remain a cell");
        const LogicCell* s = driverOf(r, "y_dyn");
        assert(s && s->kind == "select");
        assert(pin(*s, "a") == "sig:a" && pin(*s, "i") == "sig:st");
    }
    // 8. defence: unknown logicId -> empty, no crash
    {
        auto r = db.decomposeLogic("logic:/nope:1");
        assert(r.cells.empty() && r.inputs.empty() && r.outputs.empty());
        assert(r.blockKind.empty());
    }
    // 9. every pin ref must resolve (no dangling "cell:" ids) — structural integrity
    {
        for (const char* p : {"y_and", "y_mux", "y_cmp", "q", "q_noreset", "c_out", "case_out"}) {
            auto r = db.decomposeLogic(logicIdFor(db, U, p));
            assert(!r.cells.empty());
            for (auto& c : r.cells)
                for (auto& in : c.inputs) {
                    bool ok = in.ref.rfind("sig:", 0) == 0 || in.ref.rfind("const:", 0) == 0 ||
                              (in.ref.rfind("cell:", 0) == 0 && cellById(r, in.ref.substr(5)));
                    assert(ok && "dangling cell reference");
                }
            // no cell may reference itself (would be an infinite render loop)
            for (auto& c : r.cells)
                for (auto& in : c.inputs) assert(in.ref != "cell:" + c.id);
        }
    }
    std::printf("test_decompose OK\n");
    return 0;
}
