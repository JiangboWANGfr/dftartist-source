#undef NDEBUG  // asserts must fire even in Release builds
#include "frontend/SlangCompile.h"
#include "service/DesignDb.h"

#include <cassert>
#include <cstdio>
#include <map>
#include <string>

using namespace hdl;
using service::WrapperEstimate;
using service::WrapperPortCell;

static const WrapperPortCell& row(const std::map<std::string, WrapperPortCell>& m,
                                  const std::string& name) {
    auto it = m.find(name);
    if (it == m.end()) {
        std::fprintf(stderr, "missing port bit %s\n", name.c_str());
        assert(false);
    }
    return it->second;
}

static void expect(const std::map<std::string, WrapperPortCell>& m, const std::string& name,
                   const char* decision, int flops) {
    const WrapperPortCell& r = row(m, name);
    if (r.decision != decision || (flops >= 0 && r.flops != flops)) {
        std::fprintf(stderr, "%s: got %s flops=%d (%s), want %s flops=%d\n", name.c_str(),
                     r.decision.c_str(), r.flops, r.reason.c_str(), decision, flops);
        assert(false);
    }
}

int main(int argc, char** argv) {
    assert(argc >= 2 && "usage: test_wrapper <wrapper.sv>");
    std::string parseErr;
    auto design = frontend::compileSingleTree({argv[1]}, {}, {}, parseErr);
    assert(design && "compile failed");
    service::DesignDb db(std::move(design));

    service::WrapperOptions opt;
    opt.excludePorts = {"test_mode"};   // a DFT signal: only the user knows, so it is declared
    WrapperEstimate e = db.wrapperCells("wrap_top", opt);

    std::map<std::string, WrapperPortCell> by;
    for (auto& c : e.cells) by[c.name] = c;

    // ---- clock / reset are recognised by WHERE they land, not by their names
    expect(by, "clk", "none", -1);
    assert(row(by, "clk").reason == "clock");
    expect(by, "rst_n", "none", -1);
    assert(row(by, "rst_n").reason == "reset");
    expect(by, "test_mode", "none", -1);
    assert(row(by, "test_mode").reason == "excluded");

    // ---- inputs
    expect(by, "d_direct", "shared", 1);
    expect(by, "d_gate", "shared", 1);
    assert(row(by, "d_direct").cell == "r_direct");
    for (int b = 0; b < 4; ++b) {
        // BIT PRECISION: whole-bus granularity would see 4 flops on every bit of d_bus.
        const std::string n = "d_bus[" + std::to_string(b) + "]";
        expect(by, n, "shared", 1);
        assert(row(by, n).cell == "r_bus[" + std::to_string(b) + "]");
    }
    // A controlling constant kills the only path: the port is not connected to anything live.
    expect(by, "d_dead", "none", -1);
    assert(row(by, "d_dead").reason == "no functional load");
    expect(by, "d_wide", "dedicated", -1);      // 6 flops > threshold 4
    assert(row(by, "d_wide").reason == "max identified cells");
    // A feedthrough gets NO cell: the cell would sit in the middle of a pass-through path, and
    // both of its ends are already controlled and observed from the boundary either side.
    expect(by, "d_thru", "none", -1);
    assert(row(by, "d_thru").reason == "feedthrough");

    // ---- outputs
    expect(by, "q_direct", "shared", 1);
    expect(by, "q_inv", "shared", 1);           // sees through the inverter
    assert(row(by, "q_inv").cell == "r_gate");
    for (int b = 0; b < 4; ++b)
        expect(by, "q_bus[" + std::to_string(b) + "]", "shared", 1);
    expect(by, "q_const", "none", -1);
    assert(row(by, "q_const").reason == "constant-driven output");
    expect(by, "q_thru", "none", -1);           // the output end of the same feedthrough
    assert(row(by, "q_thru").reason == "feedthrough");
    expect(by, "q_deep", "shared", 1);          // the flop is one level down, inside u_leaf
    assert(row(by, "q_deep").cell == "u_leaf/r");

    // ---- internal feedback: cells on a sequential loop are counted apart from the direct ones
    expect(by, "d_acc", "shared", 4);
    assert(row(by, "d_acc").flopsFeedback == 4);   // every cell of the accumulator loops
    expect(by, "q_acc", "shared", 1);
    assert(row(by, "q_acc").flopsFeedback == 1);
    assert(row(by, "d_direct").flopsFeedback == 0);  // a plain pipeline flop does not loop
    assert(row(by, "q_direct").flopsFeedback == 0);

    // ---- the numbers an EDT config is sized from
    assert(e.inputBits == 13 && e.outputBits == 10);
    assert(e.sharedIn == 7 && e.dedicatedIn == 1 && e.noneIn == 5);
    assert(e.sharedOut == 8 && e.dedicatedOut == 0 && e.noneOut == 2);
    assert(e.wrapperIn() == 8 && e.wrapperOut() == 8 && e.wrapperCells() == 16);
    assert(e.addedScanCells() == 1);   // only dedicated cells are NEW scan cells

    // ---- the feedthrough rule is a choice, and it is reversible ----------------------------
    service::WrapperOptions keepThru = opt;
    keepThru.skipFeedthroughPorts = false;
    WrapperEstimate eT = db.wrapperCells("wrap_top", keepThru);
    std::map<std::string, WrapperPortCell> byT;
    for (auto& c : eT.cells) byT[c.name] = c;
    expect(byT, "d_thru", "dedicated", -1);
    expect(byT, "q_thru", "dedicated", -1);

    // ---- user constraints: clock, force-dedicated, force-shared ----------------------------
    service::WrapperOptions user = opt;
    user.clockPorts = {"d_direct"};          // pretend this one is a clock
    user.forceDedicatedPorts = {"d_dead"};   // no functional load, but wrap it anyway
    user.forceSharedPorts = {"d_wide"};      // 6 flops, over the threshold of 4
    WrapperEstimate eU = db.wrapperCells("wrap_top", user);
    std::map<std::string, WrapperPortCell> byU;
    for (auto& c : eU.cells) byU[c.name] = c;
    expect(byU, "d_direct", "none", -1);
    assert(row(byU, "d_direct").reason == "clock (declared)");
    expect(byU, "d_dead", "dedicated", -1);
    assert(row(byU, "d_dead").reason == "forced dedicated (user)");
    expect(byU, "d_wide", "shared", 6);     // shared despite exceeding the threshold

    // a forced share with nothing to share falls back and says why
    service::WrapperOptions impossible = opt;
    impossible.forceSharedPorts = {"d_dead"};
    WrapperEstimate eI = db.wrapperCells("wrap_top", impossible);
    for (auto& c : eI.cells)
        if (c.name == "d_dead") assert(c.decision == "none");   // no load at all: still nothing

    // ---- raising the threshold turns the over-threshold port into a shared one
    service::WrapperOptions wide = opt;
    wide.inputFanoutFlopThreshold = 8;
    WrapperEstimate e2 = db.wrapperCells("wrap_top", wide);
    std::map<std::string, WrapperPortCell> by2;
    for (auto& c : e2.cells) by2[c.name] = c;
    expect(by2, "d_wide", "shared", 6);
    // d_wide was the last dedicated INPUT cell once the feedthrough stopped taking one.
    assert(e2.sharedIn == 8 && e2.dedicatedIn == 0);

    // ---- and a tighter FEEDBACK ceiling pushes the accumulator over on its own
    service::WrapperOptions tight = opt;
    tight.feedbackFlopThreshold = 2;
    WrapperEstimate e3 = db.wrapperCells("wrap_top", tight);
    std::map<std::string, WrapperPortCell> by3;
    for (auto& c : e3.cells) by3[c.name] = c;
    expect(by3, "d_acc", "dedicated", -1);
    assert(row(by3, "d_acc").reason == "max identified cells (fanout + feedback)");
    expect(by3, "q_acc", "shared", 1);   // 1 feedback cell is still under the ceiling
    expect(by3, "d_direct", "shared", 1);

    std::printf("test_wrapper OK: %d wrapper cells (%d shared, %d dedicated)\n", e.wrapperCells(),
                e.sharedIn + e.sharedOut, e.dedicatedIn + e.dedicatedOut);
    return 0;
}
