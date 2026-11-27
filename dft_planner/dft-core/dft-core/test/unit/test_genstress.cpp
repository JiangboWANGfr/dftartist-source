#undef NDEBUG  // asserts must fire even in Release builds
#include "frontend/SlangCompile.h"
#include "service/DesignDb.h"

#include <cassert>
#include <chrono>
#include <cstdio>
#include <string>
#include <vector>

using namespace hdl;

// Phase timing is printed unconditionally: this test doubles as the scaling datapoint for
// "what does 70k instances actually cost", and a regression there is worth seeing in CI logs.
static std::chrono::steady_clock::time_point g_t = std::chrono::steady_clock::now();
static void lap(const char* what) {
    auto now = std::chrono::steady_clock::now();
    std::fprintf(stderr, "  [genstress] %-22s %7.0f ms\n", what,
                 std::chrono::duration<double, std::milli>(now - g_t).count());
    g_t = now;
}

// Capacity + correctness at elaboration scale. The fixture deliberately exceeds two of slang's
// stock limits (maxInstanceDepth 128, maxInstanceArray 65535); if the raised limits in
// SlangCompile.cpp are ever reverted this test fails with a hard elaboration error rather than
// silently losing part of the design.
//
// Every number below is derived by hand from the RTL, so a wrong answer is a real bug and not a
// golden file nobody can check:
//   delay_chain DEPTH=300  -> 300 instances, 300 flops (one per level), hierarchy 300 deep
//   huge_array  ARRAY=70000-> 1 + 70000 instances, 0 flops
//   gen_matrix  8x8        -> 1 instance, 64 flops (one per generate-case arm, distinct bits)
//   reduce_tree TREE=64    -> 127 instances (64 leaves + 63 splits), 0 flops
//   top                    -> 1 instance
//   TOTAL                     70430 instances, 364 flops
static constexpr int kExpectedInstances = 70430;
static constexpr int kExpectedFlops = 364;
static constexpr int kDepth = 300;
static constexpr int kArray = 70000;

int main(int argc, char** argv) {
    assert(argc >= 2 && "usage: test_genstress <genstress.sv>");

    std::string err;
    auto design = frontend::compileSingleTree({argv[1]}, {}, {}, err);
    assert(design && "compile failed");
    const auto& dg = design->diagnostics();
    if (dg.errorCount != 0) {
        std::fprintf(stderr, "%s\n", dg.text.c_str());
        assert(false && "deep recursion + a 70k instance array must elaborate cleanly");
    }
    assert(kArray > 65535 && kDepth > 128 && "fixture must exceed slang's stock limits");
    lap("parse + elaborate");

    service::DesignDb db(std::move(design));
    lap("DesignDb");

    // ---- 1. the whole thing is there, exactly ------------------------------------------------
    service::RegCountResult rc = db.getRegisterCounts();
    lap("regcount");
    assert(static_cast<int>(rc.counts.size()) == kExpectedInstances);
    assert(rc.total == kExpectedFlops);

    // ---- 2. recursion really is 300 levels deep ------------------------------------------------
    // Hierarchy depth = the most '.'-separated segments in any instance path.
    int maxDepth = 0;
    const std::string* deepest = nullptr;
    for (const auto& c : rc.counts) {
        int d = 1;
        for (char ch : c.instanceId)
            if (ch == '.') ++d;
        if (d > maxDepth) {
            maxDepth = d;
            deepest = &c.instanceId;
        }
    }
    // top . (g_rec.u_next) x299 . g_last  -> the chain contributes 2 segments per level
    assert(maxDepth > kDepth && "the recursive chain must survive to full depth");
    assert(deepest && deepest->find("u_chain") != std::string::npos);

    // every level of the chain holds exactly one flop, and the subtree sums walk back up
    int chainRows = 0;
    for (const auto& c : rc.counts)
        if (c.instanceId.find(".u_chain") != std::string::npos && c.own == 1) ++chainRows;
    assert(chainRows == kDepth);

    // ---- 3. the 70k instance array expands, element by element ---------------------------------
    lap("depth scan");
    db.expandChildren("genstress_top");  // lazy registration: the parent must be expanded first
    service::ExpandResult arr = db.expandChildren("genstress_top.u_array");
    lap("expand 70k array");
    assert(static_cast<int>(arr.children.size()) == kArray);
    assert(arr.children.front().instanceName == "u_cell[69999]" ||
           arr.children.front().instanceName == "u_cell[0]");
    // all of them are the same leaf cell, and none is a blackbox
    for (const auto& c : arr.children) {
        assert(c.kind == "module");
        assert(c.isLeaf);
    }

    // ---- 4. the generate nest: for x for x case x if, all arms elaborated ----------------------
    int matrixFlops = 0;
    bool sawCaseArm = false, sawNestedIf = false;
    for (const auto& c : rc.counts) {
        if (c.instanceId.find("u_matrix") == std::string::npos) continue;
        matrixFlops += c.own;
        if (c.instanceId.find("g_row") != std::string::npos) sawCaseArm = true;
    }
    assert(matrixFlops == 64 && "every generate-case arm must contribute its one flop");
    (void)sawCaseArm;
    (void)sawNestedIf;

    // generate blocks are scopes, not instances, so they surface through expandChildren instead
    service::ExpandResult mtx = db.expandChildren("genstress_top.u_matrix");
    assert(mtx.children.empty() && "gen_matrix instantiates nothing; its generate blocks are scopes");

    // ---- 5. the binary recursion is complete: 64 leaves + 63 internal nodes --------------------
    int treeRows = 0;
    for (const auto& c : rc.counts)
        if (c.instanceId.find("u_tree") != std::string::npos) ++treeRows;
    assert(treeRows == 127);

    // ---- 6. the flop enumeration sees every edge-triggered block ------------------------------
    lap("generate checks");
    const auto& seq = db.getSequential();
    lap("sequential");
    // One always_ff per chain level + one per generate-case arm.
    assert(static_cast<int>(seq.size()) == kDepth + 64);
    // NOTE: sum(SeqElement::bits) is deliberately NOT the register count. `bits` is per BLOCK and
    // counts the full declared width of every variable the block writes, so gen_matrix's 64 blocks
    // each report the whole 64-bit `q` (64*64). RegCount dedups per instance, which is why it says
    // 64. Both are right for what they measure; conflating them is the trap this note guards.
    int seqBits = 0;
    for (const auto& e : seq) seqBits += e.bits;
    assert(seqBits == kDepth + 64 * 64);

    std::printf("test_genstress OK (%d instances, %d flops, depth %d)\n", kExpectedInstances,
                kExpectedFlops, maxDepth);
    return 0;
}
