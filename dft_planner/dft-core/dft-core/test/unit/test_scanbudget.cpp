#undef NDEBUG  // asserts must fire even in Release builds
#include "frontend/SlangCompile.h"
#include "service/DesignDb.h"
#include "service/ScanBudget.h"

#include <cassert>
#include <cstdio>
#include <string>

using namespace hdl;
using service::EdtPlan;
using service::ScanBudgetOptions;
using service::ScanBudgetResult;

// regcount.sv, per test_regcount: u_leaf 32, u_dedup 8, u_incr 4, u_struct 24, u_mem 2048
// memory bits (not scan cells), u_comb 0, top's own 4.
static ScanBudgetOptions baseOptions()
{
    ScanBudgetOptions o;
    o.core = "top";
    o.designName = "top";
    o.occInstances = {"*u_dedup*"};    // stand-ins for the real *tessent_occ* / *hyper* globs
    o.hyperInstances = {"*u_incr*"};
    return o;
}

static const service::EdtBudget& edt(const ScanBudgetResult& r, const std::string& name)
{
    for (const auto& b : r.edts)
        if (b.name == name) return b;
    std::fprintf(stderr, "no EDT named %s\n", name.c_str());
    assert(false);
    return r.edts.front();
}

static bool hasError(const ScanBudgetResult& r, const std::string& fragment)
{
    for (const std::string& e : r.errors)
        if (e.find(fragment) != std::string::npos) return true;
    return false;
}

int main(int argc, char** argv)
{
    assert(argc >= 2 && "usage: test_scanbudget <regcount.sv>");
    std::string parseErr;
    auto design = frontend::compileSingleTree({argv[1]}, {}, {}, parseErr);
    assert(design && "compile failed");
    service::DesignDb db(std::move(design));

    // ---- the families are pulled OUT of the assigned subtrees, never counted twice ----------
    {
        ScanBudgetOptions o = baseOptions();
        EdtPlan intEdt;
        intEdt.name = "INT_EDT";
        intEdt.instances = {"top"};
        intEdt.channels = 2;
        intEdt.targetChainLength = 16;
        o.edts.push_back(intEdt);
        const ScanBudgetResult r = service::computeScanBudget(db, o);
        assert(r.errors.empty());
        assert(r.occBits == 8);     // u_dedup
        assert(r.hyperBits == 4);   // u_incr
        const auto& b = edt(r, "INT_EDT");
        // top's whole subtree minus the two family subtrees, which are added back as families.
        assert(b.cellsCore == r.coreRegisterBits - 8 - 4);
        assert(b.cellsOcc == 8 && b.cellsHyper == 4);
        assert(b.cells() == r.coreRegisterBits);
        assert(r.unassignedBits == 0);
        // memory is reported, not counted
        assert(r.coreMemoryBits == 2048);
        assert(b.memoryBits == 2048);
    }

    // ---- the derived numbers are self-consistent -------------------------------------------
    {
        ScanBudgetOptions o = baseOptions();
        EdtPlan p;
        p.name = "INT_EDT";
        p.instances = {"top"};
        p.channels = 2;
        p.targetChainLength = 16;
        o.edts.push_back(p);
        const ScanBudgetResult r = service::computeScanBudget(db, o);
        const auto& b = edt(r, "INT_EDT");
        assert(b.chainCount == (b.cells() + 15) / 16);
        assert(b.achievedLength == (b.cells() + b.chainCount - 1) / b.chainCount);
        // The range must CONTAIN what will actually happen — the bug this replaced wrote a
        // range centred on the target, which the achieved length could fall outside.
        assert(b.longestMin <= b.achievedLength && b.achievedLength <= b.longestMax);
        assert(b.longestMin > 0);
    }

    // ---- an instance assigned under another EDT's subtree is an ERROR, not a silent overlap -
    {
        ScanBudgetOptions o = baseOptions();
        EdtPlan a;
        a.name = "EDT_A";
        a.instances = {"top"};
        a.channels = 2;
        a.targetChainLength = 16;
        EdtPlan b2;
        b2.name = "EDT_B";
        b2.instances = {"top.u_leaf"};   // inside EDT_A's subtree
        b2.channels = 2;
        b2.targetChainLength = 16;
        o.edts = {a, b2};
        const ScanBudgetResult r = service::computeScanBudget(db, o);
        assert(hasError(r, "overlapping assignment"));
    }

    // ---- disjoint assignment adds up, and what nobody claimed is reported -------------------
    {
        ScanBudgetOptions o = baseOptions();
        EdtPlan a;
        a.name = "EDT_A";
        a.instances = {"top.u_leaf"};
        a.channels = 2;
        a.targetChainLength = 16;
        a.includeOcc = false;
        a.includeHyper = false;
        EdtPlan b2;
        b2.name = "EDT_B";
        b2.instances = {"top.u_struct"};
        b2.channels = 2;
        b2.targetChainLength = 16;
        b2.includeOcc = false;
        b2.includeHyper = false;
        o.edts = {a, b2};
        const ScanBudgetResult r = service::computeScanBudget(db, o);
        assert(r.errors.empty());
        assert(edt(r, "EDT_A").cells() == 32);
        assert(edt(r, "EDT_B").cells() == 24);
        // top's own flops plus the two family subtrees were never assigned.
        assert(r.unassignedBits == r.coreRegisterBits - 8 - 4 - 32 - 24);
        assert(r.unassignedBits > 0);
    }

    // ---- exactly one external controller ----------------------------------------------------
    {
        ScanBudgetOptions o = baseOptions();
        EdtPlan a;
        a.name = "EXT_A";
        a.external = true;
        a.channels = 2;
        a.targetChainLength = 16;
        EdtPlan b2 = a;
        b2.name = "EXT_B";
        o.edts = {a, b2};
        const ScanBudgetResult r = service::computeScanBudget(db, o);
        assert(hasError(r, "more than one external EDT"));
    }

    // ---- the two artefacts, generated from the one model ------------------------------------
    {
        ScanBudgetOptions o = baseOptions();
        EdtPlan in;
        in.name = "INT_EDT";
        in.instances = {"top"};
        in.channels = 4;
        in.targetChainLength = 16;
        in.channelInPipe = "dfx_int_edt_channels_in_pipe";
        EdtPlan ex;
        ex.name = "EXT_EDT";
        ex.external = true;
        ex.includeWrapper = true;
        ex.channels = 2;
        ex.targetChainLength = 8;
        o.edts = {in, ex};
        const ScanBudgetResult r = service::computeScanBudget(db, o);

        const std::string& spec = r.edtSpec;
        assert(spec.find("DftSpecification(top,logic_test) {") != std::string::npos);
        assert(spec.find("Controller(INT_EDT)") != std::string::npos);
        assert(spec.find("Controller(EXT_EDT)") != std::string::npos);
        // int vs ext is carried by mode_enables, not by the controller's name.
        assert(spec.find("mode_enables") != std::string::npos);
        assert(spec.find("DftSignal(int_edt_mode)") != std::string::npos);
        assert(spec.find("DftSignal(ext_edt_mode)") != std::string::npos);
        assert(spec.find("dfx_int_edt_channels_in_pipe") != std::string::npos);
        assert(spec.find("scan_chain_count") != std::string::npos);
        assert(spec.find("longest_chain_range") != std::string::npos);

        const std::string& tcl = r.scanTcl;
        assert(tcl.find("create_scan_chain_family OCC_CHAIN") != std::string::npos);
        assert(tcl.find("create_scan_chain_family HYPER_CHAIN") != std::string::npos);
        assert(tcl.find("create_scan_chain_family INT_CHAIN") != std::string::npos);
        assert(tcl.find("add_scan_mode int_edt_mode -type internal") != std::string::npos);
        assert(tcl.find("add_scan_mode ext_edt_mode -type external") != std::string::npos);
        // the wrapper elements only go to the external mode
        assert(tcl.find("class == wrapper") != std::string::npos);
        // the glob the user gave becomes the attribute rule
        assert(tcl.find("*u_dedup*") != std::string::npos);
        // an internal controller carries INT_CHAIN; an external one must not
        const std::size_t extAt = tcl.find("add_scan_mode ext_edt_mode");
        assert(tcl.find("INT_CHAIN]", extAt) == std::string::npos);

        std::printf("test_scanbudget OK: INT %lld cells / %d chains, EXT %lld cells / %d chains\n",
                    edt(r, "INT_EDT").cells(), edt(r, "INT_EDT").chainCount,
                    edt(r, "EXT_EDT").cells(), edt(r, "EXT_EDT").chainCount);
    }
    // ---- exceptions: a rule minus one subtree --------------------------------------------
    // The planner lets an engineer click a rule-matched instance back OUT of a family. If the
    // budget kept counting it, the spec would size for cells the scan mode never routes there —
    // the same class of silent disagreement this file exists to catch.
    {
        ScanBudgetOptions o = baseOptions();
        o.occInstances = {"top.u_dedup", "top.u_leaf"};   // 8 + 32
        o.hyperInstances = {};
        EdtPlan intEdt;
        intEdt.name = "INT_EDT";
        intEdt.instances = {"top"};
        intEdt.channels = 2;
        intEdt.targetChainLength = 16;
        o.edts.push_back(intEdt);

        const ScanBudgetResult before = service::computeScanBudget(db, o);
        assert(before.occBits == 40);

        o.occExcludes = {"top.u_leaf"};
        const ScanBudgetResult after = service::computeScanBudget(db, o);
        assert(after.occBits == 8);                              // u_leaf is out
        assert(after.errors.empty());
        // and its bits are not lost — they fall back to the ordinary core cells
        assert(edt(after, "INT_EDT").cellsOcc == 8);
        assert(edt(after, "INT_EDT").cells() == edt(before, "INT_EDT").cells());
        assert(edt(after, "INT_EDT").cellsCore == edt(before, "INT_EDT").cellsCore + 32);
        // the Tcl has to say the same thing the numbers do
        assert(after.scanTcl.find("-name is_occ -value false") != std::string::npos);
        assert(after.scanTcl.find("top.u_leaf") != std::string::npos);

        // an exception naming nothing in the design changes no number
        o.occExcludes = {"top.u_does_not_exist"};
        assert(service::computeScanBudget(db, o).occBits == 40);
        std::printf("test_scanbudget OK: exceptions subtract %lld bits and return them to core\n",
                    before.occBits - after.occBits);
    }
    // ---- every switch of create_scan_chain_family / add_scan_mode must be expressible --------
    // The two commands carry 33 and 36 options. We derive a handful; the rest are decisions only
    // the engineer can make, and a generator that cannot carry them emits a script that has to be
    // hand-edited — which is exactly how the generated and the real script drift apart.
    {
        ScanBudgetOptions o = baseOptions();
        EdtPlan p;
        p.name = "INT_EDT";
        p.instances = {"top"};
        p.channels = 2;
        p.targetChainLength = 16;
        p.extraFamilies = {"INT2_CHAIN"};  // the custom family below, ticked for this controller
        o.edts.push_back(p);

        // the shape from the user's own scan_insertion.tcl
        o.familyOptions["OCC_CHAIN"] = {
            {"si_timing", "leading_edge"},
            {"so_timing", "trailing_edge"},
            {"si_lockup_cell_type", "flop"},
            {"ssh_instance", "ap_wrapper_h_282_logic_test_tessent_ssn_scan_host_dart_mlvl1_inst"},
            {"ssh_chain_groups", "occ_chain"},
        };
        o.familyOptions["WRAPPER_CHAIN"] = {
            {"include_elements",
             "[get_scan_elements -filter \"class == wrapper && !is_occ && !is_hyper\"]"},
        };
        // a family invented in the UI — no derived filter, everything comes from its options
        o.familyOptions["INT2_CHAIN"] = {
            {"include_elements", "[get_cells {u_dsp/*}]"},
            {"chain_length", "200"},
            {"single_clock_domain_chains", "on"},
        };
        o.scanModeOptions["int_edt_mode"] = {
            {"single_clock_edge_chains", "on"},
            {"si_lockup_cell_type", "flop"},
            {"ssh_instance", "[get_instance my_ssh]"},
            {"ssh_chain_groups", "int_chain"},
        };
        const std::string tcl = service::computeScanBudget(db, o).scanTcl;

        // family switches ride along, including the SSH pair
        assert(tcl.find("-si_timing leading_edge") != std::string::npos);
        assert(tcl.find("-so_timing trailing_edge") != std::string::npos);
        assert(tcl.find("-ssh_chain_groups occ_chain") != std::string::npos);
        assert(tcl.find("ssn_scan_host_dart_mlvl1_inst") != std::string::npos);
        // a family we only mention through its options is still created
        assert(tcl.find("create_scan_chain_family WRAPPER_CHAIN") != std::string::npos);
        // and so is a CUSTOM one the model never derives — verbatim, with all its switches
        const std::size_t c2 = tcl.find("create_scan_chain_family INT2_CHAIN");
        assert(c2 != std::string::npos);
        const std::string cline = tcl.substr(c2, tcl.find('\n', c2) - c2);
        assert(cline.find("-include_elements [get_cells {u_dsp/*}]") != std::string::npos);
        assert(cline.find("-chain_length 200") != std::string::npos);
        assert(cline.find("-single_clock_domain_chains on") != std::string::npos);
        // a user value REPLACES the derived seed rather than appearing twice
        const std::size_t wc = tcl.find("create_scan_chain_family WRAPPER_CHAIN");
        const std::size_t eol = tcl.find('\n', wc);
        const std::string wline = tcl.substr(wc, eol - wc);
        assert(wline.find("class == wrapper && !is_occ") != std::string::npos);
        assert(wline.find("-include_elements") == wline.rfind("-include_elements"));

        // -ssh_instance and -edt_instances are alternatives in the grammar: naming an SSH host
        // means SSN drives the mode, so an EDT instance list would contradict it.
        const std::size_t mode = tcl.find("add_scan_mode int_edt_mode");
        const std::string mline = tcl.substr(mode, tcl.find("\n\n", mode) - mode);
        assert(mline.find("-ssh_instance [get_instance my_ssh]") != std::string::npos);
        assert(mline.find("-ssh_chain_groups int_chain") != std::string::npos);
        // the ticked custom family joins this controller's -include_chain_families
        assert(mline.find("INT2_CHAIN") != std::string::npos);
        assert(mline.find("-edt_instances") == std::string::npos);
        // and the derived switches we did not override are still there
        assert(mline.find("-type internal") != std::string::npos);
        assert(mline.find("-include_chain_families") != std::string::npos);
        std::printf("test_scanbudget OK: family/mode switches pass through verbatim\n");
    }

    // ---- chains can never be fewer than channels ---------------------------------------------
    // Regression: 1475 cells at a target length of 400 gives 4 chains, which was emitted beside
    // input_channel_count 8. A decompressor drives at least one chain per channel, so that spec
    // cannot be built at all — and nothing rejected it.
    {
        ScanBudgetOptions o = baseOptions();
        EdtPlan p;
        p.name = "INT_EDT";
        p.instances = {"top"};
        p.channels = 8;
        p.targetChainLength = 400;   // way longer than this design can fill
        o.edts.push_back(p);
        const ScanBudgetResult r = service::computeScanBudget(db, o);
        const auto& b = edt(r, "INT_EDT");
        assert(r.errors.empty());
        // chains come from the RANGE MAX, channels follow from the chains — never the reverse
        assert(b.longestMin == 360 && b.longestMax == 440);
        assert(b.chainCount == (b.cells() + 439) / 440);
        assert(b.chainCount >= b.channels && "a controller cannot drive fewer chains than channels");
        assert(b.compression >= 1.0);
        bool said = false, tooShort = false;
        for (const std::string& w : b.warnings) {
            if (w.find("only make") != std::string::npos) said = true;
            if (w.find("under half the target") != std::string::npos) tooShort = true;
        }
        assert(said && "dropping the asked-for channel count has to be reported, not silent");
        assert(tooShort && "an achieved chain far under the target is the flow's own warning");

        // A target the design can actually fill: chains stay above the channels asked for.
        ScanBudgetOptions o2 = baseOptions();
        EdtPlan p2 = p;
        p2.targetChainLength = 4;
        o2.edts.push_back(p2);
        const auto& b2 = edt(service::computeScanBudget(db, o2), "INT_EDT");
        assert(b2.chainCount > b2.channels && b2.channels == 8);

        // Channels left at 0 are DERIVED: ceil(chains / chainsPerChannel) + separate-control.
        ScanBudgetOptions o3 = baseOptions();
        EdtPlan p3 = p;
        p3.channels = 0;
        p3.targetChainLength = 4;
        p3.chainsPerChannel = 5;
        p3.separateControlDataChannels = true;
        o3.edts.push_back(p3);
        const auto& b3 = edt(service::computeScanBudget(db, o3), "INT_EDT");
        assert(b3.channels == (b3.chainCount + 4) / 5 + 1);
        std::printf("test_scanbudget OK: %lld cells -> %d chains x %d, %d channel(s)\n",
                    b.cells(), b.chainCount, b.achievedLength, b.channels);
    }

    // ---- an internal controller with no instance list takes the remainder -------------------
    // Regression: the empty list was documented as "everything not claimed by another one" and
    // implemented as a loop over an empty vector, so the ordinary single-INT-EDT case — no
    // per-instance coverage at all — silently budgeted ZERO cells and emitted a spec of zeros.
    {
        ScanBudgetOptions o = baseOptions();
        EdtPlan intEdt;
        intEdt.name = "INT_EDT";
        intEdt.instances = {};        // <- the case that returned 0
        intEdt.channels = 2;
        intEdt.targetChainLength = 16;
        o.edts.push_back(intEdt);
        const ScanBudgetResult r = service::computeScanBudget(db, o);
        assert(r.errors.empty());
        const auto& b = edt(r, "INT_EDT");
        assert(b.cells() == r.coreRegisterBits);              // the whole core, nothing lost
        assert(b.cellsCore == r.coreRegisterBits - 8 - 4);    // less the two family subtrees
        assert(b.cellsOcc == 8 && b.cellsHyper == 4);
        assert(b.chainCount > 0 && b.achievedLength > 0);
        assert(r.unassignedBits == 0);

        // naming an instance on ANOTHER controller takes it out of the remainder
        ScanBudgetOptions o2 = o;
        EdtPlan other;
        other.name = "INT_EDT2";
        other.instances = {"top.u_leaf"};   // 32 bits
        other.channels = 2;
        other.targetChainLength = 16;
        other.includeOcc = other.includeHyper = false;
        o2.edts.push_back(other);
        const ScanBudgetResult r2 = service::computeScanBudget(db, o2);
        assert(r2.errors.empty());
        assert(edt(r2, "INT_EDT2").cellsCore == 32);
        assert(edt(r2, "INT_EDT").cellsCore == b.cellsCore - 32);
        assert(edt(r2, "INT_EDT").cells() + edt(r2, "INT_EDT2").cells() == r2.coreRegisterBits);

        // …but two controllers both meaning "everything else" is an error, not a coin toss
        ScanBudgetOptions o3 = o;
        EdtPlan alsoEmpty;
        alsoEmpty.name = "INT_EDT3";
        alsoEmpty.channels = 2;
        alsoEmpty.targetChainLength = 16;
        o3.edts.push_back(alsoEmpty);
        assert(hasError(service::computeScanBudget(db, o3), "no instance list"));

        std::printf("test_scanbudget OK: the remainder controller takes %lld cells\n", b.cells());
    }
    return 0;
}
