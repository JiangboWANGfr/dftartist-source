#undef NDEBUG  // asserts must fire even in Release builds
#include "frontend/SlangCompile.h"
#include "service/DesignDb.h"
#include "service/SdcLite.h"
#include "service/SdcTcl.h"

#include <algorithm>
#include <cassert>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>

using namespace hdl;
using service::ClockResetTreeResult;
using service::CrPathItem;

static const CrPathItem* find(const ClockResetTreeResult& r, const std::string& kind,
                              const std::string& owner, const std::string& net) {
    for (auto& i : r.items)
        if (i.kind == kind && i.ownerInstanceId == owner && i.net == net) return &i;
    return nullptr;
}
static bool hasElemPrefix(const CrPathItem& i, const std::string& p) {
    return std::any_of(i.elems.begin(), i.elems.end(),
                       [&](const std::string& e) { return e.rfind(p, 0) == 0; });
}

int main(int argc, char** argv) {
    assert(argc >= 3 && "usage: test_crtree <crtree.sv> <crtree.sdc>");

    // ---- SDC parser on its own
    {
        auto sdc = service::parseSdcText(
            "# c\ncreate_clock -name CK -period 5 [get_ports {a b}]\n"
            "create_clock -period 2.5 [get_ports c]\n"
            "create_generated_clock -name G -source [get_ports c] -divide_by 2 [get_pins u/q]\n"
            "set_case_analysis 1 [get_ports tm]\n"
            "set_case_analysis 0 [get_pins u0/sel]\n"
            "create_clock -period 1 \\\n  [get_ports d]\n");
        assert(sdc.errors.empty());
        assert(sdc.clocks.size() == 4);
        assert(sdc.clocks[0].name == "CK" && sdc.clocks[0].targets.size() == 2 && sdc.clocks[0].period == 5.0);
        assert(sdc.clocks[1].name == "c" && sdc.clocks[1].targets == std::vector<std::string>{"c"});
        assert(sdc.clocks[2].generated && sdc.clocks[2].source == "c" && sdc.clocks[2].targets == std::vector<std::string>{"u/q"});
        assert(sdc.clocks[3].targets == std::vector<std::string>{"d"});  // continuation line
        assert(sdc.cases.size() == 2 && sdc.cases[0].target == "tm" && sdc.cases[0].value == 1);
        assert(sdc.cases[1].target == "u0/sel" && sdc.cases[1].value == 0);
    }

    // ---- REAL Tcl evaluation: the cases a hand-rolled parser silently gets wrong
    {
        assert(service::sdcTclAvailable() && "this build must embed Tcl");
        service::SdcObjects objs;
        objs.ports = {"clk_a", "clk_b", "clk_free", "scan_clk", "rst_n", "en", "d"};
        objs.inputs = objs.ports;
        objs.pins = {"top.u_cg.gck", "top.u_core.ck_buf"};

        // variables + foreach + nested [...] + wildcard object query + list-valued -waveform
        auto s = service::parseSdcTclText(R"(
            set P 10.0
            set CKS [get_ports {clk_a clk_b}]
            foreach c $CKS {
              create_clock -name CK_$c -period $P -waveform {0 5} [get_ports $c]
            }
            if {[llength $CKS] == 2} { set_case_analysis 1 [get_ports rst_n] }
            create_clock -name SCAN -period [expr {$P * 2}] [get_ports scan*]
            create_generated_clock -name GCK -source [get_ports clk_a] -divide_by 2 \
              [get_pins top.u_cg/gck]
            set_false_path -from [get_ports d]
            set_logic_zero [get_ports en]
        )", objs);
        for (auto& e : s.errors) std::printf("  sdc note: %s\n", e.c_str());
        // 4 clocks: CK_clk_a, CK_clk_b (from the loop), SCAN (wildcard), GCK (generated)
        assert(s.clocks.size() == 4);
        assert(s.clocks[0].name == "CK_clk_a" && s.clocks[0].period == 10.0);
        assert(s.clocks[0].targets == std::vector<std::string>{"clk_a"});
        assert(s.clocks[1].name == "CK_clk_b");
        assert(s.clocks[2].name == "SCAN" && s.clocks[2].period == 20.0);   // [expr] evaluated
        assert(s.clocks[2].targets == std::vector<std::string>{"scan_clk"}); // glob matched
        assert(s.clocks[3].name == "GCK" && s.clocks[3].generated);
        assert(s.clocks[3].source == "clk_a");
        assert(s.clocks[3].targets == std::vector<std::string>{"top.u_cg.gck"});  // '/' -> '.'
        // set_case_analysis inside `if`, plus set_logic_zero folded into cases
        bool sawRst = false, sawEn = false;
        for (auto& c : s.cases) {
            if (c.target == "rst_n" && c.value == 1) sawRst = true;
            if (c.target == "en" && c.value == 0) sawEn = true;
        }
        assert(sawRst && sawEn);

        // an unknown command is noted but must NOT abort the rest of the file
        auto s2 = service::parseSdcTclText(
            "totally_bogus_cmd -x 1\ncreate_clock -name K -period 3 [get_ports clk_a]\n", objs);
        assert(s2.clocks.size() == 1 && s2.clocks[0].name == "K");
        // a genuine Tcl syntax error IS reported (never silently swallowed)
        auto s3 = service::parseSdcTclText("create_clock -period 3 [get_ports {clk_a\n", objs);
        assert(!s3.errors.empty());
    }

    std::string parseErr;
    auto design = frontend::compileSingleTree({argv[1]}, {}, {}, parseErr);
    assert(design && "compile failed");
    service::DesignDb db(std::move(design));
    auto r = db.clockResetTree(argv[2]);
    assert(r.sdcErrors.empty());
    assert(r.clocks.size() == 1 && r.clocks[0].name == "CLKA");

    // 1. constrained clock through a 2-buffer chain -> 010, elems record both buffers
    {
        const CrPathItem* i = find(r, "clock", "top.u_core", "ck_buf");
        assert(i);
        assert(i->terminus == "pi" && i->detail == "top.clk_a");
        assert(i->clockName == "CLKA");
        assert(i->rootValue == "010" && i->value == "010");
        assert(hasElemPrefix(*i, "buf@top:clk_buf2") && hasElemPrefix(*i, "buf@top:clk_buf1"));
        assert(i->flopCount == 2);  // r0 + the q_r flop share (owner, ck_buf)
    }
    // 2. inverted clock -> 101 (leading/trailing edges swap through the inverter)
    {
        const CrPathItem* i = find(r, "clock", "top.u_core", "ck_inv");
        assert(i);
        assert(i->clockName == "CLKA" && i->rootValue == "010");
        assert(i->value == "101");
        assert(hasElemPrefix(*i, "inv@top:clk_n"));
    }
    // 3. unconstrained top input: root Z, analyzed as X at the flop
    {
        const CrPathItem* i = find(r, "clock", "top.u_core", "ck_free");
        assert(i);
        assert(i->terminus == "pi" && i->detail == "top.clk_free");
        assert(i->clockName.empty());
        assert(i->rootValue == "Z" && i->value == "X");
    }
    // 4. a real gate (clk_a & en) is NOT seen through: terminus logic, X
    {
        const CrPathItem* i = find(r, "clock", "top.u_core", "ck_gated");
        assert(i);
        assert(i->terminus == "logic");
        assert(i->value == "X");
    }
    // 5. clock from an RTL module's output: the walk DESCENDS into the module (slang can see
    //    inside it, unlike a blackbox library cell) and reports the real blocker — the AND gate
    //    in `assign gck = ck & en` — instead of stopping vaguely at the instance.
    {
        const CrPathItem* i = find(r, "clock", "top", "gck");
        assert(i);
        assert(i->value == "X");
        // it really went inside: the path records a hop within the child instance
        assert(std::any_of(i->path.begin(), i->path.end(),
                           [](const std::string& p) { return p.rfind("top.u_cg:", 0) == 0; }));
    }
    // 6. reset rst_n: active-low (inactive=1). The SDC holds it 1 with set_case_analysis —
    // and that must NOT count: case analysis states what FUNCTIONAL mode ties off, and the
    // reset DRC asks about TEST mode, where nothing in the test setup holds this pin. Only a
    // DFT-side declaration (add_pin_constraint, via CrQuery::pinConstraints) may pass it.
    {
        const CrPathItem* i = find(r, "reset", "top.u_core", "rst_n");
        assert(i);
        assert(i->inactive == "1");
        assert(i->value != "1" && !i->ok);   // the functional constant is not test-mode evidence

        service::CrQuery q2;
        q2.pinConstraints.emplace_back("rst_n", 1);   // the DFT plan's own declaration DOES count
        service::ClockResetTreeResult r2 = db.clockResetTree(argv[2], "", {}, q2);
        const CrPathItem* j = find(r2, "reset", "top.u_core", "rst_n");
        assert(j && j->value == "1" && j->ok);
    }
    // 7. reset rst_free: active-high (inactive=0), unconstrained -> X -> NOT ok
    {
        const CrPathItem* i = find(r, "reset", "top", "rst_free");
        assert(i);
        assert(i->inactive == "0");
        assert(i->value == "X");
        assert(!i->ok);
    }
    // 8. no SDC at all: structure still walks; the former CLKA path degrades to Z/X
    {
        auto r2 = db.clockResetTree("");
        const CrPathItem* i = find(r2, "clock", "top.u_core", "ck_buf");
        assert(i && i->clockName.empty() && i->rootValue == "Z" && i->value == "X");
        const CrPathItem* rst = find(r2, "reset", "top.u_core", "rst_n");
        assert(rst && !rst->ok && rst->value == "X");
    }
    // 9. missing SDC file is reported, not fatal
    {
        auto r3 = db.clockResetTree("/nonexistent.sdc");
        assert(!r3.sdcErrors.empty());
    }
    // 10. MULTI-STAGE clock tree: with a cell library the walk must climb THROUGH clock cells
    //     (ICG / inverter) instead of stopping at the first one. argv[3] = stages.sv dir.
    if (argc >= 5) {
        const std::string sv = argv[3];        // .../stages.sv
        const std::string libYaml = argv[4];   // .../stages_lib.yaml (rewritten below)
        // materialise a yaml whose read_cell_library points at the fixture's absolute path
        const std::string dir = sv.substr(0, sv.find_last_of("/\\"));
        const std::string tcl = dir + "/stages.tcelllib";
        const std::string yaml = dir + "/.stages_lib.resolved.yaml";
        {
            std::ifstream in(libYaml);
            std::ostringstream ss; ss << in.rdbuf();
            std::string t = ss.str();
            const std::size_t k = t.find("STAGES_TCELLLIB");
            assert(k != std::string::npos);
            t.replace(k, std::strlen("STAGES_TCELLLIB"), tcl);
            std::ofstream(yaml) << t;
        }
        std::string e2;
        auto d2 = frontend::compileSingleTree({sv}, {}, {}, e2);
        assert(d2 && "stages.sv compile failed");
        service::DesignDb db2(std::move(d2));
        const std::string sdc2 = dir + "/stages.sdc";

        // WITHOUT the library: `my_icg` is just an RTL module, so the walk descends into it and
        // hits the AND gate in its body -> X. It cannot know CK is a clock and FE/TE enables,
        // which is exactly what the cell library supplies.
        {
            auto r0 = db2.clockResetTree(sdc2, "");
            const CrPathItem* i = find(r0, "clock", "top", "g2");
            assert(i && i->value == "X");
            // It DESCENDS into the module body (the path records a hop inside it) but, lacking the
            // library, cannot tell CK is the clock — so the clock does not arrive.
            assert(std::any_of(i->path.begin(), i->path.end(),
                               [](const std::string& p) { return p.rfind("top.u_icg2:", 0) == 0; }));
            // No CELL stages were recognised — but the walk now records the REAL module
            // boundary it crossed (xdn@inst:outPort), which the schematic view renders.
            for (const std::string& e : i->elems)
                assert(e.rfind("xdn@", 0) == 0 || e.rfind("xup@", 0) == 0);
            assert(hasElemPrefix(*i, "xdn@top.u_icg2:"));
        }
        // WITH the library: a clock cell is transparent ONLY under its enabling condition.
        {
            auto r1 = db2.clockResetTree(sdc2, yaml);

            // (a) two ICGs whose TE is tied 1 -> climb through both to the constrained input,
            //     and record WHICH enable opened each stage.
            const CrPathItem* g2 = find(r1, "clock", "top", "g2");
            assert(g2 && "g2 path missing");
            assert(g2->terminus == "pi" && g2->detail == "top.clk_a");
            assert(g2->clockName == "CLKA");
            assert(g2->rootValue == "010" && g2->value == "010");
            assert(g2->elems.size() == 2);
            assert(hasElemPrefix(*g2, "icg@top.u_icg2#TE=1"));
            assert(hasElemPrefix(*g2, "icg@top.u_icg1#TE=1"));

            // (b) + an inverter downstream -> 101 (leading/trailing swapped)
            const CrPathItem* gi = find(r1, "clock", "top", "gi");
            assert(gi && gi->value == "101" && gi->rootValue == "010");
            assert(gi->elems.size() == 3 && hasElemPrefix(*gi, "inv@top.u_cinv"));

            // (c) an ICG with BOTH enables 0 must NOT be traversed — the gate is closed, so no
            //     clock reaches the flop. Traversing it unconditionally would invent a clock.
            const CrPathItem* gx = find(r1, "clock", "top", "gx");
            assert(gx && gx->value == "X");
            assert(gx->terminus == "instance");
            assert(gx->detail.find("u_icgX") != std::string::npos);
            assert(gx->detail.find("gated") != std::string::npos);
            assert(gx->elems.empty());

            // (d) MUX with select tied 1 -> follow mux_in1 (A1 = clk_a), recording the branch
            const CrPathItem* m1 = find(r1, "clock", "top", "m1");
            assert(m1 && m1->value == "010" && m1->terminus == "pi" && m1->detail == "top.clk_a");
            assert(m1->elems.size() == 1 && hasElemPrefix(*m1, "mux@top.u_mux#1"));

            // ---- STRUCTURAL IMPLICATION (things a constant-only evaluator cannot do) ----
            // (f) the ICG enable is `scan_mode & ~1'b0` where scan_mode arrives through a PORT
            //     from the parent: needs a binary op AND a hierarchy hop. Old engine: X -> the
            //     clock died at the gate. Now the gate opens and the walk reaches clk_a.
            const CrPathItem* qh = find(r1, "clock", "top", "gh");
            assert(qh && "gh path missing");
            assert(qh->value == "010" && qh->terminus == "pi" && qh->detail == "top.clk_a");

            // (g) the enable is driven by a CHILD instance's output -> resolving it requires
            //     descending into that child.
            const CrPathItem* qc = find(r1, "clock", "top", "gc");
            assert(qc && qc->value == "010" && qc->terminus == "pi" && qc->detail == "top.clk_a");

            // (h) CONTROLLING VALUES decide even though an operand is unknown:
            //     FE = unknown & 0 -> 0, TE = unknown | 1 -> 1, so the gate is OPEN via TE.
            const CrPathItem* qd = find(r1, "clock", "top", "gd");
            assert(qd && qd->value == "010" && qd->terminus == "pi" && qd->detail == "top.clk_a");

            // ---- SCAN-MODE DIMENSION ----
            // u_muxX's select is unknown in FUNCTIONAL mode, so mx has no clock. Forcing the
            // DFT signal flips the mux to the scan arm, and declaring the mux output as the OCC
            // definition point must make the path report "reaches OCC".
            {
                service::ScanModeInput sm;
                sm.forces.emplace_back("sel_unknown", true);        // scan_enable-style force
                sm.occPoints.push_back("top/u_muxX/Y");             // user-declared, '/' form
                auto rs = db2.clockResetTree(sdc2, yaml, sm);

                const CrPathItem* mx2 = find(rs, "clock", "top", "mx");
                assert(mx2 && "mx path missing");
                assert(mx2->value == "X" && "functional mode is unchanged: select still unknown");
                assert(mx2->scanChecked);
                assert(mx2->scanValue == "010" && "forcing the select opens the mux in scan mode");
                assert(mx2->scanOcc && "the path runs through the declared OCC point");
                assert(mx2->scanOccPoint.find("u_muxX") != std::string::npos);

                // A path that does NOT pass the declared point must say so — that is the whole
                // point of the check (those flops will not shift).
                const CrPathItem* g2s = find(rs, "clock", "top", "g2");
                assert(g2s && g2s->scanChecked && !g2s->scanOcc);
                assert(g2s->scanValue == "010" && "still clocked, just not from an OCC");

                // No scan input at all -> the dimension stays untouched (no false violations).
                auto rn = db2.clockResetTree(sdc2, yaml);
                const CrPathItem* mxn = find(rn, "clock", "top", "mx");
                assert(mxn && !mxn->scanChecked && !mxn->scanOcc && mxn->scanValue.empty());
            }

            // (e) MUX with an unknown select must NOT be traversed (either arm would be a guess)
            const CrPathItem* mx = find(r1, "clock", "top", "mx");
            assert(mx && mx->value == "X" && mx->terminus == "instance");
            assert(mx->detail.find("sel=X") != std::string::npos);
            assert(mx->elems.empty());

            // the commented-out library line must NOT be reported as missing
            for (auto& s : r1.sdcErrors) assert(s.find("commented_out") == std::string::npos);
        }
    }
    std::printf("test_crtree OK\n");
    return 0;
}
