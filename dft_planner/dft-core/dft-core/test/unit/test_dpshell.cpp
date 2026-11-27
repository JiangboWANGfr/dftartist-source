#undef NDEBUG
#include "frontend/SlangCompile.h"
#include "service/DesignDb.h"
#include "service/DpShell.h"

#include <cassert>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <string>

using namespace hdl;

static bool has(const std::string& hay, const std::string& needle) {
    return hay.find(needle) != std::string::npos;
}

int main(int argc, char** argv) {
    assert(argc >= 3 && "usage: test_dpshell <crtree.sv> <crtree.sdc>");
    std::string err;
    auto design = frontend::compileSingleTree({argv[1]}, {}, {}, err);
    assert(design && "compile failed");
    service::DesignDb db(std::move(design));
    service::DpShell sh(db);

    // ---- object queries drive the search box AND the shell
    {
        auto r = sh.eval("get_ports clk*");
        assert(r.ok);
        assert(has(r.output, "clk_a") && has(r.output, "clk_free"));

        // Rendered with '/' separators and TOP-RELATIVE (Tessent convention): the top is the
        // current design, so naming it in every path is noise. `top/u_core` would be wrong.
        r = sh.eval("get_cells *core*");
        assert(r.ok && has(r.output, "u_core") && !has(r.output, "top/u_core"));

        // A module is named by its NAME, not by the internal `name|file` defId the GUI uses to
        // open a definition — the top module answers to its own name.
        r = sh.eval("get_modules top");
        assert(r.ok && has(r.output, "top") && !has(r.output, "|"));
        r = sh.eval("llength [get_modules top]");
        assert(r.ok && r.output == "1");

        r = sh.eval("get_nets clk_buf*");
        assert(r.ok && has(r.output, "clk_buf1") && has(r.output, "clk_buf2"));

        // results are a real Tcl list -> composable with llength/foreach
        r = sh.eval("llength [get_ports clk*]");
        assert(r.ok && r.output == "2");   // clk_a, clk_free
    }

    // ---- OCC definition points: user-declared, idempotent, replayable
    {
        auto r = sh.eval("add_occ_point u_cg/gck -clock CLKA -comment {gated clock}");
        assert(r.ok && has(r.output, "added OCC definition point: u_cg/gck"));
        assert(sh.occPoints().size() == 1);
        assert(sh.occPoints()[0].pin == "top.u_cg.gck");    // stored normalized
        assert(sh.occPoints()[0].clock == "CLKA");

        // re-adding is idempotent (updates annotation, no duplicate)
        r = sh.eval("add_occ_point u_cg/gck -comment {second}");
        assert(r.ok && has(r.output, "already defined"));
        assert(sh.occPoints().size() == 1 && sh.occPoints()[0].comment == "second");

        // a query can feed the command directly — this is the dp_shell workflow
        r = sh.eval("add_to_occ_def_point [get_ports clk_a]");
        assert(r.ok);
        assert(sh.occPoints().size() == 2);

        r = sh.eval("report_occ_def_points");
        assert(r.ok && has(r.output, "OCC definition points (2)"));

        // the emitted file is REPLAYABLE dp_shell commands
        const std::string tcl = sh.renderOccTcl();
        assert(has(tcl, "add_occ_point u_cg/gck -clock CLKA -comment {second}"));
        assert(has(tcl, "add_occ_point clk_a"));
        assert(!has(tcl, "top/"));

        // replay into a fresh shell reproduces the same state
        service::DpShell sh2(db);
        auto rr = sh2.eval(tcl);
        assert(rr.ok);
        assert(sh2.occPoints().size() == 2);
        assert(sh2.occPoints()[0].pin == "top.u_cg.gck" && sh2.occPoints()[0].clock == "CLKA");

        // BOTH spellings are accepted on input — the absolute one because scripts written
        // before this convention have to keep working, the relative one because it is what the
        // queries now hand back.
        r = sh.eval("remove_occ_def_point top/clk_a");
        assert(r.ok && sh.occPoints().size() == 1);
        r = sh.eval("add_occ_point clk_a");           // relative in…
        assert(r.ok && sh.occPoints().size() == 2);
        assert(sh.occPoints()[1].pin == "top.clk_a"); // …absolute where it is compared
        r = sh.eval("remove_occ_def_point clk_a");
        assert(r.ok && sh.occPoints().size() == 1);
    }

    // ---- DFT control mux: recorded only (insertion stays in the user's flow)
    {
        auto r = sh.eval("add_dft_ctrl_mux top/u_core/rst_n -override_source dft_rst_n -select scan_en");
        assert(r.ok);
        assert(sh.ctrlMuxes().size() == 1);
        assert(sh.ctrlMuxes()[0].target == "top.u_core.rst_n");
        assert(sh.ctrlMuxes()[0].overrideSource == "dft_rst_n");
        assert(sh.ctrlMuxes()[0].select == "scan_en");

        // missing required options must ERROR, not silently record a half-mux
        r = sh.eval("add_dft_ctrl_mux top/foo -select s");
        assert(!r.ok && has(r.error, "usage:"));
        assert(sh.ctrlMuxes().size() == 1);

        // Recording a mux constrains NOTHING: DFT-side values compute from their real source
        // circuits, and only an explicit user add_pin_constraint overrides that. The user asked
        // for exactly this ("不要自动给…constraint,真实地根据输入源头计算"). The engineer
        // constrains the pins themselves:
        assert(sh.pinConstraints().empty());
        r = sh.eval("add_pin_constraint dft_rst_n 1; add_pin_constraint scan_en 1");
        assert(r.ok);
        assert(sh.pinConstraints().size() == 2);
        for (auto& pc : sh.pinConstraints()) assert(pc.value == '1');
        r = sh.eval("report_pin_constraints");
        assert(r.ok && has(r.output, "dft_rst_n = 1") && has(r.output, "scan_en = 1"));
        // -source_value is parsed for old plans but is a no-op now
        r = sh.eval("add_dft_ctrl_mux top/u_core/rst_n -override_source dft_rst_n -select scan_en -source_value 0");
        assert(r.ok && has(r.output, "no longer constrains"));
        assert(sh.pinConstraints().size() == 2);
        for (auto& pc : sh.pinConstraints()) assert(pc.value == '1');   // untouched

        r = sh.eval("report_dft_ctrl_mux");
        assert(r.ok && has(r.output, "-override_source dft_rst_n"));

        // delete_* is the same command as remove_*: both spellings come naturally, and a script
        // that says one must not fail because the tool only knows the other.
        r = sh.eval("delete_dft_ctrl_mux -help");
        assert(r.ok && has(r.output, "alias for remove_dft_ctrl_mux"));
        r = sh.eval("add_dft_ctrl_mux top/u_core/gone -override_source s -select m");
        assert(r.ok && sh.ctrlMuxes().size() == 2);
        r = sh.eval("delete_dft_ctrl_mux top/u_core/gone");
        assert(r.ok && sh.ctrlMuxes().size() == 1);
        assert(has(sh.renderCtrlMuxTcl(), "add_dft_ctrl_mux u_core/rst_n"));
    }

    // ---- DRC reports over the clock/reset structure
    {
        const std::string sdc = argv[2];
        auto r = sh.eval("report_clock_tree -sdc " + sdc);
        assert(r.ok);
        assert(has(r.output, "value=010"));           // constrained clock
        assert(has(r.output, "clock=CLKA"));

        r = sh.eval("report_reset -sdc " + sdc);
        assert(r.ok);
        // set_case_analysis does NOT pass a reset: it states a FUNCTIONAL-mode constant, and
        // the reset DRC asks about test mode (the direct check is in test_crtree). rst_free
        // fails — nothing in the test setup holds it. rst_n reads OK here only because the
        // ctrl-mux block above planned a mux AND the test constrained its DFT side by hand.
        assert(has(r.output, "**NOT INACTIVE**"));
        assert(has(r.output, "rst_free"));

        // -violations filters to just the failures (the DRC view)
        r = sh.eval("report_reset -sdc " + sdc + " -violations");
        assert(r.ok && has(r.output, "**NOT INACTIVE**"));
        assert(!has(r.output, "  OK"));
    }

    // ---- read_sdc/load_sdc: actually parses the file (not just remembers the path) and prints
    // ---- the resolved clocks — same engine as the SDC tab's Clocks & add_clock panel.
    {
        const std::string sdc = argv[2];
        auto r = sh.eval("read_sdc " + sdc);
        assert(r.ok);
        assert(has(r.output, "sdc: " + sdc));
        assert(has(r.output, "CLKA  10ns  primary"));
        assert(has(r.output, "1 clock(s)"));

        // no-argument form still just reports what was set (unchanged behavior).
        r = sh.eval("read_sdc");
        assert(r.ok && has(r.output, "sdc: " + sdc));

        // load_sdc is the same command under the name people reach for first.
        r = sh.eval("load_sdc " + sdc);
        assert(r.ok && has(r.output, "CLKA  10ns  primary"));

        // report_clocks -sdc now reports the SAME resolved summary instead of the old stub.
        r = sh.eval("report_clocks -sdc");
        assert(r.ok && has(r.output, "CLKA  10ns  primary") && has(r.output, "1 clock(s)"));
    }

    // ---- pin constraints: user 0/1 forces enter the DRC value calculus
    {
        const std::string sdc = argv[2];
        // rst_free (active-high, unconstrained in the SDC) fails without help…
        auto r = sh.eval("report_reset -sdc " + sdc);
        assert(r.ok && has(r.output, "**NOT INACTIVE**"));

        // start from a clean slate: the ctrl-mux block above constrained its two DFT pins
        r = sh.eval("add_pin_constraint dft_rst_n X\nadd_pin_constraint scan_en X\n"
                    "add_pin_constraint s X\nadd_pin_constraint m X");
        assert(r.ok && sh.pinConstraints().empty());

        // …bad value is an ERROR, not a silent record
        r = sh.eval("add_pin_constraint rst_free 2");
        assert(!r.ok && has(r.error, "0|1|X|Z"));
        assert(sh.pinConstraints().empty());

        // …constraining them to their inactive values fixes the violations. rst_n needs its
        // own declaration now: its SDC case analysis is functional-mode and no longer counts.
        r = sh.eval("add_pin_constraint rst_free 0\nadd_pin_constraint rst_n 1");
        assert(r.ok && has(r.output, "pin constraint: rst_free = 0"));
        assert(sh.pinConstraints().size() == 2);
        r = sh.eval("report_reset -sdc " + sdc);
        assert(r.ok && !has(r.output, "**NOT INACTIVE**"));

        // …re-adding upserts (no duplicate), 1 = held ACTIVE -> violation is back
        r = sh.eval("add_pin_constraint rst_free 1");
        assert(r.ok && sh.pinConstraints().size() == 2);
        r = sh.eval("report_reset -sdc " + sdc);
        assert(r.ok && has(r.output, "**NOT INACTIVE**"));

        r = sh.eval("report_pin_constraints");
        assert(r.ok && has(r.output, "rst_free = 1"));

        // …X clears; Z is recorded but does NOT force (still analyzed as unconstrained)
        r = sh.eval("add_pin_constraint rst_free X");
        assert(r.ok && has(r.output, "cleared") && sh.pinConstraints().size() == 1);
        r = sh.eval("add_pin_constraint rst_free Z");
        assert(r.ok && sh.pinConstraints().size() == 2);
        r = sh.eval("report_reset -sdc " + sdc);
        assert(r.ok && has(r.output, "**NOT INACTIVE**"));

        // …an unresolvable pin warns (recorded anyway — may not be elaborated yet)
        r = sh.eval("add_pin_constraint no/such/pin 0");
        assert(r.ok && has(r.output, "WARNING"));

        // clean up so later blocks see an unconstrained design
        r = sh.eval("add_pin_constraint rst_free X\nadd_pin_constraint rst_n X\nadd_pin_constraint no/such/pin X");
        assert(r.ok && sh.pinConstraints().empty());
    }

    // ---- OCC auto-write: set_occ_out_dir keeps dfx_occ_def_point.tcl in lockstep
    {
        namespace fs = std::filesystem;
        const fs::path dir = fs::temp_directory_path() / "dpshell_occ_autowrite";
        std::error_code ec;
        fs::remove_all(dir, ec);
        const fs::path file = dir / "dfx_occ_def_point.tcl";

        service::DpShell sh3(db);
        auto readAll = [&]() {
            std::ifstream f(file);
            return std::string(std::istreambuf_iterator<char>(f), {});
        };

        // no dir set -> adding does NOT create any file
        auto r = sh3.eval("add_occ_point u_cg/gck");
        assert(r.ok && !fs::exists(file));

        // setting the dir creates it and writes the CURRENT state immediately
        r = sh3.eval("set_occ_out_dir " + dir.string());
        assert(r.ok && has(r.output, "# wrote"));
        assert(fs::exists(file) && has(readAll(), "add_occ_point u_cg/gck"));

        // every add/remove rewrites the file — state and disk cannot drift
        r = sh3.eval("add_occ_point clk_a -clock CLKA");
        assert(r.ok && has(r.output, "# wrote"));
        assert(has(readAll(), "add_occ_point clk_a -clock CLKA"));
        r = sh3.eval("remove_occ_def_point top/u_cg/gck");
        assert(r.ok && !has(readAll(), "gck") && has(readAll(), "clk_a"));

        // write_occ_def_points with no argument now defaults to the auto-write file
        r = sh3.eval("write_occ_def_points");
        assert(r.ok && has(r.output, dir.string()));

        // the file replays into a fresh shell
        service::DpShell sh4(db);
        assert(sh4.sourceFile(file.string()).ok && sh4.occPoints().size() == 1);
        fs::remove_all(dir, ec);
    }

    // ---- scripting: control flow + a Tcl error is reported, not swallowed
    {
        auto r = sh.eval("set n 0\nforeach p [get_ports clk*] { incr n }\nset n");
        assert(r.ok && has(r.output, "2"));
        r = sh.eval("this_command_does_not_exist");
        assert(!r.ok && !r.error.empty());
    }
    // ---- self-documentation: one registry behind help / -help / report_commands / completion
    {
        // The catalogue is report_commands; `help` is the orientation that points at it.
        auto r = sh.eval("report_commands");
        assert(r.ok && has(r.output, "add_occ_point") && has(r.output, "report_clock_tree"));
        assert(has(r.output, "design query") && has(r.output, "shell"));

        r = sh.eval("help");
        assert(r.ok && has(r.output, "report_commands"));

        // -help works on EVERY command, and names that command's switches.
        r = sh.eval("analyze_wrapper_cells -help");
        assert(r.ok && has(r.output, "-input_fanout_flop_threshold") && has(r.output, "usage:"));
        assert(!has(r.output, "wrapper cells:"));   // -help must not run the analysis
        r = sh.eval("get_pins -help");
        assert(r.ok && has(r.output, "-below_instances") && has(r.output, "-filter"));
        r = sh.eval("help get_ports");
        assert(r.ok && has(r.output, "-direction"));

        // The completion feed the console reads: "name<TAB>-opt -opt …".
        r = sh.eval("report_commands -completion");
        assert(r.ok && has(r.output, "get_instances\t") && has(r.output, "-below_instances"));
        // A filtered catalogue is a catalogue of that group only.
        r = sh.eval("report_commands -group OCC");
        assert(r.ok && has(r.output, "add_occ_point") && !has(r.output, "report_clock_tree"));
    }
    // ---- the Tessent get_* switches
    {
        // -filter on an attribute the model has, and -direction, both narrow the result.
        auto r = sh.eval("llength [get_ports * -silent]");
        assert(r.ok);
        r = sh.eval("llength [get_ports * -direction input -silent]");
        assert(r.ok);
        // -nocase and -regexp find what a plain glob would miss.
        r = sh.eval("llength [get_ports CLK* -nocase -silent]");
        assert(r.ok && !has(r.output, "0"));
        r = sh.eval("llength [get_ports {^clk} -regexp -silent]");
        assert(r.ok && !has(r.output, "0"));
        // An unknown -filter attribute is REPORTED, never silently treated as "matches all".
        r = sh.eval("get_ports * -filter {no_such_attr == 1}");
        assert(r.ok && has(r.output, "no_such_attr"));
        // A bad regexp is an error, not an empty result that reads like "nothing matched".
        r = sh.eval("get_ports {a(} -regexp");
        assert(!r.ok);
        // Singular spellings resolve to the same command.
        r = sh.eval("llength [get_port clk* -silent]");
        assert(r.ok && has(r.output, "2"));
        r = sh.eval("llength [get_instance * -silent -limit 5]");
        assert(r.ok);
    }
    // ---- shell conveniences, and Tcl proper
    {
        auto r = sh.eval("echo hello world");
        assert(r.ok && has(r.output, "hello world"));
        r = sh.eval("expr {6*7}");
        assert(r.ok && has(r.output, "42"));
        r = sh.eval("set xs {}; foreach i {1 2 3} { lappend xs [expr {$i*$i}] }; join $xs ,");
        assert(r.ok && has(r.output, "1,4,9"));
        r = sh.eval("ls -help");
        assert(r.ok && has(r.output, "include dotfiles"));
        r = sh.eval("which get_pins");
        assert(r.ok && has(r.output, "dp_shell command"));
    }
    std::printf("test_dpshell OK\n");
    return 0;
}
