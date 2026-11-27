// Unit tests for sdc-core/clockgen.cpp — the parse_sdc_to_yaml port (gen_dft.pl:5212-6572):
// master-clock inference, generated-clock period resolution, add_clock/tessent-mapping command
// generation, PAD/DFT-clock auto-comment, and the keep-last-per-object dedup pass.
//
// Deliberately uses bare object names (no [get_pins ...]) throughout: clockgen operates on
// ResolvedClock::targets/source, which are already-flattened strings by the time lint.cpp hands
// them over, so a bare word exercises exactly the same code path without needing a DesignObjects
// fixture (that resolution layer is already covered by test_sdclint).
#undef NDEBUG
#include "clockgen.h"
#include "lint.h"

#include <cmath>
#include <cstdio>
#include <string>

using namespace sdc;

namespace {

int failures = 0;

#define CHECK(cond, msg)                                                          \
    do {                                                                          \
        if (!(cond)) {                                                            \
            std::printf("FAIL: %s (%s:%d)\n", msg, __FILE__, __LINE__);           \
            ++failures;                                                           \
        }                                                                          \
    } while (0)

const GeneratedClock* findClock(const ClockGenResult& r, const std::string& name) {
    for (const GeneratedClock& g : r.clocks)
        if (g.name == name) return &g;
    return nullptr;
}

const AddClockCmd* findCmd(const ClockGenResult& r, const std::string& clockName) {
    for (const AddClockCmd& a : r.addClockCmds)
        if (a.clockName == clockName) return &a;
    return nullptr;
}

bool anyWarningContains(const ClockGenResult& r, const std::string& needle) {
    for (const std::string& w : r.warnings)
        if (w.find(needle) != std::string::npos) return true;
    return false;
}

ClockGenResult run(const std::string& sdc) {
    const LintReport rep = lintText(sdc, "t.sdc");
    return generateClocks(rep.clocks);
}

}  // namespace

int main() {
    if (!lintAvailable()) {
        std::printf("SKIP: build has no embedded Tcl interpreter\n");
        return 0;
    }

    // ---- explicit -master_clock + -divide_by ---------------------------------------------------
    {
        const ClockGenResult r = run(
            "create_clock -name CK -period 10 clk_pin\n"
            "create_generated_clock -name G1 -source clk_pin -master_clock CK -divide_by 2 g1_pin\n");
        const GeneratedClock* g = findClock(r, "G1");
        CHECK(g != nullptr, "G1 present");
        if (g) {
            CHECK(!g->masterInferred, "G1 master given explicitly, not inferred");
            CHECK(g->masterClock == "CK", "G1 master is CK");
            CHECK(std::abs(g->period - 20.0) < 1e-9, "G1 period = 10*2");
        }
    }

    // ---- master inferred via -source matching another clock's own target ----------------------
    {
        const ClockGenResult r = run(
            "create_clock -name CK -period 10 clk_pin\n"
            "create_generated_clock -name G2 -source clk_pin -divide_by 4 g2_pin\n");
        const GeneratedClock* g = findClock(r, "G2");
        CHECK(g != nullptr, "G2 present");
        if (g) {
            CHECK(g->masterInferred, "G2 master inferred");
            CHECK(g->masterClock == "CK", "G2 master inferred as CK");
            CHECK(std::abs(g->period - 40.0) < 1e-9, "G2 period = 10*4");
        }
    }

    // ---- -multiply_by, and -divide_by + -multiply_by together -----------------------------------
    {
        const ClockGenResult r = run(
            "create_clock -name CK -period 10 clk_pin\n"
            "create_generated_clock -name G3 -source clk_pin -master_clock CK -multiply_by 2 g3_pin\n"
            "create_generated_clock -name G4 -source clk_pin -master_clock CK -divide_by 3 "
            "-multiply_by 2 g4_pin\n");
        const GeneratedClock* g3 = findClock(r, "G3");
        const GeneratedClock* g4 = findClock(r, "G4");
        CHECK(g3 && std::abs(g3->period - 5.0) < 1e-9, "G3 period = 10/2");
        CHECK(g4 && std::abs(g4->period - 15.0) < 1e-9, "G4 period = 10*3/2");
    }

    // ---- -edges (half-period numbering, span/2 cycles) and -combinational -----------------------
    {
        const ClockGenResult r = run(
            "create_clock -name CK -period 10 clk_pin\n"
            "create_generated_clock -name G5 -source clk_pin -master_clock CK -edges {1 3} g5_pin\n"
            "create_generated_clock -name G6 -source clk_pin -master_clock CK -combinational g6_pin\n");
        const GeneratedClock* g5 = findClock(r, "G5");
        const GeneratedClock* g6 = findClock(r, "G6");
        CHECK(g5 && std::abs(g5->period - 10.0) < 1e-9, "G5 period = 10*((3-1)/2)");
        CHECK(g6 && std::abs(g6->period - 10.0) < 1e-9, "G6 (combinational) period == master's");
    }

    // ---- PAD-named target is commented out, with a warning ---------------------------------------
    {
        const ClockGenResult r = run(
            "create_clock -name CK -period 10 clk_pin\n"
            "create_generated_clock -name GPAD -source clk_pin -master_clock CK -divide_by 1 "
            "TEST_PAD\n");
        const AddClockCmd* c = findCmd(r, "GPAD");
        CHECK(c != nullptr, "GPAD add_clock present");
        if (c) {
            CHECK(c->commented, "GPAD commented out");
            CHECK(c->reason == "PAD signal", "GPAD reason is PAD signal");
            CHECK(c->text.rfind("# add_clock 0 TEST_PAD -period 10ns -label GPAD", 0) == 0,
                  "GPAD text");
        }
        CHECK(anyWarningContains(r, "Commented out clock defined on PAD signal 'TEST_PAD'"),
              "GPAD warning");
    }

    // ---- a DFT-infrastructure clock name is commented out, with a warning -----------------------
    {
        const ClockGenResult r = run(
            "create_clock -name CK -period 10 clk_pin\n"
            "create_generated_clock -name chip_tck -source clk_pin -master_clock CK -divide_by 1 "
            "tck_pin\n");
        const AddClockCmd* c = findCmd(r, "chip_tck");
        CHECK(c != nullptr, "chip_tck add_clock present");
        if (c) {
            CHECK(c->commented, "chip_tck commented out");
            CHECK(c->reason == "DFT clock", "chip_tck reason is DFT clock");
        }
        CHECK(anyWarningContains(r, "Commented out DFT clock 'chip_tck'"), "chip_tck warning");
    }

    // ---- self-referencing master inference: a generated clock whose -source is never
    // ---- independently create_clock'd "infers" itself as its own master (a latent quirk of the
    // ---- original gen_dft.pl, preserved deliberately) and so never converges.
    {
        const ClockGenResult r = run(
            "create_generated_clock -name GX -source lonely_src -divide_by 2 gx_pin\n");
        const GeneratedClock* g = findClock(r, "GX");
        CHECK(g != nullptr, "GX present");
        if (g) {
            CHECK(g->masterInferred && g->masterClock == "GX", "GX inferred itself as master");
            CHECK(g->period == 0.0, "GX period never resolves");
        }
        CHECK(anyWarningContains(r, "Unable to resolve period for generated clock 'GX' with "
                                    "master 'GX'"),
              "GX unresolved-period warning");
    }

    // ---- genuinely ambiguous inference (more than one candidate, no unique resolved period) -----
    {
        const ClockGenResult r = run(
            "create_clock -name A -period 5 shared_pin\n"
            "create_clock -name B -period 7 -add shared_pin\n"
            "create_generated_clock -name GAMB -source shared_pin -divide_by 2 gamb_pin\n");
        const GeneratedClock* g = findClock(r, "GAMB");
        CHECK(g != nullptr, "GAMB present");
        if (g) {
            CHECK(g->masterClock.empty(), "GAMB master could not be inferred");
            CHECK(g->period == 0.0, "GAMB period unresolved");
        }
        CHECK(anyWarningContains(r, "Unable to infer master clock for generated clock 'GAMB'"),
              "GAMB warning");
    }

    // ---- an explicit -master_clock that names no clock at all: never resolves, reports which
    // ---- master it was waiting on (not "unable to infer" — one was given).
    {
        const ClockGenResult r = run(
            "create_clock -name CK -period 10 clk_pin\n"
            "create_generated_clock -name GTYPO -source clk_pin -master_clock NOPE -divide_by 2 "
            "gtypo_pin\n");
        const GeneratedClock* g = findClock(r, "GTYPO");
        CHECK(g != nullptr && g->period == 0.0, "GTYPO period unresolved");
        CHECK(anyWarningContains(r, "Unable to resolve period for generated clock 'GTYPO' with "
                                    "master 'NOPE'"),
              "GTYPO warning");
    }

    // ---- keep-last-per-object: two clocks on the same final target -- the earlier add_clock
    // ---- line is commented out as superseded, the later one stays live.
    {
        const ClockGenResult r = run(
            "create_clock -name CK -period 10 clk_pin\n"
            "create_generated_clock -name GA -source clk_pin -master_clock CK -divide_by 1 "
            "shared_tgt\n"
            "create_generated_clock -name GB -source clk_pin -master_clock CK -divide_by 1 -add "
            "shared_tgt\n");
        const AddClockCmd* ga = findCmd(r, "GA");
        const AddClockCmd* gb = findCmd(r, "GB");
        CHECK(ga != nullptr && gb != nullptr, "GA and GB both present");
        if (ga && gb) {
            CHECK(ga->commented && ga->reason == "superseded", "GA (earlier) superseded");
            CHECK(!gb->commented, "GB (later) stays live");
            CHECK(gb->text == "add_clock 0 shared_tgt -period 10ns -label GB", "GB text");
        }
    }

    // ---- tessent_clock_mapping is emitted once per named clock -----------------------------------
    {
        const ClockGenResult r = run("create_clock -name CK -period 10 clk_pin\n");
        bool found = false;
        for (const std::string& s : r.tessentMappingCmds)
            if (s == "set tessent_clock_mapping(CK) CK") found = true;
        CHECK(found, "tessent_clock_mapping for CK");
    }

    // ---- exact-duplicate add_clock text collapses to one, not two --------------------------------
    {
        const ClockGenResult r = run(
            "create_clock -name CK -period 10 clk_pin\n"
            "create_generated_clock -name DUP -source clk_pin -master_clock CK -divide_by 1 -add "
            "dup_tgt\n"
            "create_generated_clock -name DUP -source clk_pin -master_clock CK -divide_by 1 -add "
            "dup_tgt\n");
        int count = 0;
        for (const AddClockCmd& a : r.addClockCmds)
            if (a.text == "add_clock 0 dup_tgt -period 10ns -label DUP") ++count;
        CHECK(count == 1, "identical add_clock text deduped to one");
    }

    if (failures) {
        std::printf("test_clockgen: %d failure(s)\n", failures);
        return 1;
    }
    std::printf("test_clockgen: all checks passed\n");
    return 0;
}
