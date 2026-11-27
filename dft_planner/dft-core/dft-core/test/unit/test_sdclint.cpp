#undef NDEBUG  // asserts must fire even in Release builds
#include "lint.h"
#include "spec.h"

#include <cassert>
#include <cstdio>
#include <string>
#include <vector>

using namespace sdc;

namespace {

int failures = 0;

const Finding* find(const LintReport& r, const std::string& rule) {
    for (const Finding& f : r.findings)
        if (f.rule == rule) return &f;
    return nullptr;
}

int countRule(const LintReport& r, const std::string& rule) {
    int n = 0;
    for (const Finding& f : r.findings)
        if (f.rule == rule) ++n;
    return n;
}

void dump(const char* what, const LintReport& r) {
    std::printf("  --- %s produced %zu finding(s):\n", what, r.findings.size());
    for (const Finding& f : r.findings)
        std::printf("      %s:%d %s [%s] %s\n", f.file.c_str(), f.line, severityName(f.severity),
                    f.rule.c_str(), f.message.c_str());
}

LintOptions opts(unsigned dialects = kAll) {
    LintOptions o;
    o.dialects = dialects;
    return o;
}

/// Expect `rule` to fire, at `line` when line > 0.
void expectRule(const char* what, const std::string& text, const std::string& rule, int line = 0,
                LintOptions o = opts(), DesignObjects objs = {}) {
    const LintReport r = lintText(text, "t.sdc", o, objs);
    const Finding* f = find(r, rule);
    if (!f) {
        std::printf("FAIL [%s]: expected rule %s\n", what, rule.c_str());
        dump(what, r);
        ++failures;
        return;
    }
    if (line > 0 && f->line != line) {
        std::printf("FAIL [%s]: rule %s reported at line %d, expected %d\n", what, rule.c_str(),
                    f->line, line);
        dump(what, r);
        ++failures;
    }
}

void expectNoRule(const char* what, const std::string& text, const std::string& rule,
                  LintOptions o = opts(), DesignObjects objs = {}) {
    const LintReport r = lintText(text, "t.sdc", o, objs);
    if (find(r, rule)) {
        std::printf("FAIL [%s]: rule %s should NOT have fired\n", what, rule.c_str());
        dump(what, r);
        ++failures;
    }
}

void expectClean(const char* what, const std::string& text, LintOptions o = opts(),
                 DesignObjects objs = {}) {
    const LintReport r = lintText(text, "t.sdc", o, objs);
    if (r.count(Severity::Error) != 0) {
        std::printf("FAIL [%s]: expected no errors\n", what);
        dump(what, r);
        ++failures;
    }
}

}  // namespace

int main() {
    if (!lintAvailable()) {
        std::printf("SKIP: build has no embedded Tcl interpreter\n");
        return 0;
    }

    // ================= L1: Tcl syntax ==========================================================

    // An unbalanced brace swallows the rest of the file; report it at the line it opened on.
    expectRule("missing close brace",
               "create_clock -name CK -period 10 [get_ports {clk]\n"
               "set_load 5 [all_outputs]\n",
               "SDC-SYNTAX", 1);

    // Trailing whitespace after a continuation backslash: invisible, and it silently splits the
    // command in two. The interpreter cannot see this, so it is a textual pre-check.
    expectRule("continuation whitespace",
               "create_generated_clock -name G -source [get_ports clk] \\  \n"
               "    -divide_by 2 [get_pins u/q]\n",
               "SDC-CONT-WS", 1);

    // `#` is only a comment at the start of a command.
    expectRule("stray hash after command", "set_max_transition 0.2 [all_outputs] # be careful\n",
               "SDC-COMMENT", 1);
    expectRule("stray hash, no object list", "set_max_area 0 # target\n", "SDC-COMMENT", 1);
    // ...but the correct `; #` spelling must stay silent.
    expectNoRule("semicolon hash is fine", "set_max_area 0; # target\n", "SDC-COMMENT");

    // Undefined variable — Tcl catches it, we classify and locate it.
    expectRule("undefined variable",
               "set P 10\n"
               "create_clock -name CK -period ${PERIOD} [get_ports clk]\n",
               "SDC-VAR-UNDEF", 2);

    // Variables and [expr] that DO resolve must not be flagged; this is the whole reason for
    // using a real interpreter.
    expectClean("expr and variables",
                "set CLK_200M [expr 1000.0/200]\n"
                "set ALIAS $CLK_200M\n"
                "create_clock -name CK -period ${ALIAS} [get_ports clk]\n"
                "foreach p {a b} { set_max_transition 0.2 [get_ports $p] }\n");

    // ================= L2: commands, options, values ===========================================

    expectRule("misspelled option", "create_clock -perid 10 [get_ports clk]\n", "SDC-OPT-UNKNOWN", 1);
    {   // ...and the suggestion must actually name the right option.
        const LintReport r = lintText("create_clock -perid 10 [get_ports clk]\n", "t.sdc");
        const Finding* f = find(r, "SDC-OPT-UNKNOWN");
        if (!f || f->hint.find("-period") == std::string::npos) {
            std::printf("FAIL [suggestion]: expected a '-period' suggestion, got \"%s\"\n",
                        f ? f->hint.c_str() : "(none)");
            ++failures;
        }
    }
    expectRule("misspelled exception option", "set_false_path -form [get_ports a]\n",
               "SDC-OPT-UNKNOWN", 1);
    expectRule("unknown command", "creat_clock -period 10 [get_ports clk]\n", "SDC-CMD-UNKNOWN", 1);

    expectRule("zero period", "create_clock -name CK -period 0 [get_ports clk]\n", "SDC-VALUE", 1);
    expectRule("non-numeric period", "create_clock -name CK -period fast [get_ports clk]\n",
               "SDC-VALUE", 1);
    expectRule("missing required option",
               "create_generated_clock -name G -divide_by 2 [get_pins u/q]\n",
               "SDC-OPT-MISSING", 1);
    expectRule("option needs a value", "create_clock -name CK -period\n", "SDC-OPT-NOVALUE", 1);
    expectRule("bad case-analysis value", "set_case_analysis 2 [get_ports tm]\n", "SDC-VALUE", 1);
    expectNoRule("good case-analysis value", "set_case_analysis 1 [get_ports tm]\n", "SDC-VALUE");

    expectRule("clock group without exclusivity",
               "create_clock -name A -period 10 [get_ports a]\n"
               "create_clock -name B -period 10 [get_ports b]\n"
               "set_clock_groups -group [get_clocks A] -group [get_clocks B]\n",
               "SDC-OPT-MISSING", 3);
    expectRule("conflicting exclusivity",
               "create_clock -name A -period 10 [get_ports a]\n"
               "create_clock -name B -period 10 [get_ports b]\n"
               "set_clock_groups -asynchronous -logically_exclusive "
               "-group [get_clocks A] -group [get_clocks B]\n",
               "SDC-OPT-CONFLICT", 3);
    expectRule("divide_by and multiply_by together",
               "create_clock -name CK -period 10 [get_ports clk]\n"
               "create_generated_clock -name G -source [get_ports clk] -divide_by 2 "
               "-multiply_by 3 [get_pins u/q]\n",
               "SDC-OPT-CONFLICT", 2);
    expectRule("-allow_paths without -asynchronous",
               "create_clock -name A -period 10 [get_ports a]\n"
               "create_clock -name B -period 10 [get_ports b]\n"
               "set_clock_groups -logically_exclusive -allow_paths "
               "-group [get_clocks A] -group [get_clocks B]\n",
               "SDC-OPT-REQUIRES", 3);

    // Negative numbers must survive the option/positional split.
    expectClean("negative I/O delay",
                "create_clock -name CK -period 10 [get_ports clk]\n"
                "set_input_delay -2.5 -clock [get_clocks CK] [get_ports d]\n");

    // ---- option abbreviation: every vendor shell accepts unambiguous prefixes, and real
    // ---- constraint files use them constantly. Rejecting them would bury the report in noise.
    expectClean("abbreviated options",
                "create_clock -name CK -period 10 [get_ports clk]\n"
                "create_generated_clock -name G -source [get_ports clk] -divide_by 2 "
                "-master CK [get_pins u/q]\n"
                "set_false_path -to [get_pins -of [get_cells -hier u_a]]\n");
    expectRule("ambiguous abbreviation",
               "create_clock -name CK -period 10 [get_ports clk]\n"
               "create_generated_clock -name G -source [get_ports clk] -m 2 [get_pins u/q]\n",
               "SDC-OPT-AMBIGUOUS", 2);

    // ---- collection commands are control flow: skipping them would leave their bodies unchecked
    expectRule("error inside a foreach_in_collection body",
               "create_clock -name CK -period 10 [get_ports clk]\n"
               "foreach_in_collection c [get_cells u_a] {\n"
               "    set n [get_object_name $c]\n"
               "    set_case_analysis 5 $n/RME\n"
               "}\n",
               "SDC-VALUE", 4);
    // An unescaped bus index is command substitution, so the constraint silently targets the
    // wrong object. This is the single nastiest legal-looking SDC bug.
    expectRule("unescaped bus index", "set_case_analysis 0 u_a/RM[3]\n", "SDC-BUS-BRACKET", 1);
    expectNoRule("escaped bus index is fine", "set_case_analysis 0 {u_a/RM[3]}\n",
                 "SDC-BUS-BRACKET");
    expectClean("sizeof_collection drives an if",
                "create_clock -name CK -period 10 [get_ports clk]\n"
                "if {[sizeof_collection [get_ports -quiet nope*]] > 0} {\n"
                "    set_false_path -from [get_ports clk]\n"
                "}\n");
    // -quiet on a clock probe means "may match nothing" — do not turn it into an error.
    expectNoRule("quiet clock probe",
                 "create_clock -name CK -period 10 [get_ports clk]\n"
                 "set x [remove_from_collection [all_clocks] [get_clocks \"virt*\" -quiet]]\n",
                 "SDC-CLK-UNDEF");

    // ================= dialects =================================================================

    expectRule("DC-only command under the SDC standard", "set_dont_touch [get_cells u_a]\n",
               "SDC-DIALECT", 1, opts(kGeneric));
    expectNoRule("...accepted when DC is selected", "set_dont_touch [get_cells u_a]\n",
                 "SDC-DIALECT", opts(kDcPt));
    expectRule("DC-only option under the SDC standard",
               "set_false_path -reset_path -from [get_ports a]\n", "SDC-OPT-DIALECT", 1,
               opts(kGeneric | kGenus));
    expectNoRule("...accepted when DC is selected",
                 "set_false_path -reset_path -from [get_ports a]\n", "SDC-OPT-DIALECT",
                 opts(kDcPt));
    expectRule("Genus-only command under Synopsys",
               "set_interactive_constraint_modes true\n", "SDC-DIALECT", 1, opts(kDcPt));

    // ================= semantics ================================================================

    expectRule("waveform not increasing",
               "create_clock -name CK -period 10 -waveform {0 5 3 8} [get_ports clk]\n",
               "SDC-CLK-WAVEFORM", 1);
    expectRule("waveform odd edge count",
               "create_clock -name CK -period 10 -waveform {0 5 8} [get_ports clk]\n",
               "SDC-CLK-WAVEFORM", 1);
    expectClean("legal waveform",
                "create_clock -name CK -period 10 -waveform {0 5} [get_ports clk]\n");

    expectRule("virtual clock without a name", "create_clock -period 10\n", "SDC-CLK-VIRTUAL", 1);
    expectClean("named virtual clock", "create_clock -name v_clk -period 10\n");

    expectRule("clock redefined",
               "create_clock -name CK -period 10 [get_ports clk]\n"
               "create_clock -name CK -period 20 [get_ports clk2]\n",
               "SDC-CLK-REDEFINE", 2);
    expectNoRule("redefinition with -add is intentional",
                 "create_clock -name CK -period 10 [get_ports clk]\n"
                 "create_clock -name CK -period 20 -add [get_ports clk2]\n",
                 "SDC-CLK-REDEFINE");

    expectRule("reference to an undefined clock",
               "create_clock -name CK -period 10 [get_ports clk]\n"
               "set_input_delay 1 -clock [get_clocks NOPE] [get_ports d]\n",
               "SDC-CLK-UNDEF", 2);
    expectRule("generated clock with an undefined master",
               "create_clock -name CK -period 10 [get_ports clk]\n"
               "create_generated_clock -name G -source [get_ports clk] -divide_by 2 "
               "-master_clock MISSING [get_pins u/q]\n",
               "SDC-CLK-UNDEF", 2);
    expectClean("all clock references resolve",
                "create_clock -name CK -period 10 [get_ports clk]\n"
                "set_input_delay 1 -clock [get_clocks CK] [get_ports d]\n"
                "set_output_delay 1 -clock CK [get_ports q]\n");

    expectRule("I/O delay without a clock", "set_input_delay 1 [get_ports d]\n",
               "SDC-IO-NOCLOCK", 1);
    expectRule("global false path", "set_false_path -setup\n", "SDC-EXC-GLOBAL", 1);
    expectRule("no clocks at all", "set_load 5 [all_outputs]\n", "SDC-NO-CLOCK", 1);

    // Two DIFFERENTLY NAMED clocks on one source object: both lines look fine in isolation, but
    // without -add the second deletes the first. Found in a real chip_top.sdc.
    expectRule("second clock silently replaces the first on the same port",
               "create_clock -name INCLK -period 10 [get_ports clk]\n"
               "create_clock -name REFCLK -period 48 [get_ports clk]\n",
               "SDC-CLK-OVERWRITE", 2);
    expectNoRule("...but -add makes it intentional",
                 "create_clock -name INCLK -period 10 [get_ports clk]\n"
                 "create_clock -name REFCLK -period 48 -add [get_ports clk]\n",
                 "SDC-CLK-OVERWRITE");

    // SDC values are unitless — "10ns" is rejected by every tool, and saying so beats
    // "expected a number".
    expectRule("period with a unit suffix",
               "create_clock -name CK -period 10ns [get_ports clk]\n", "SDC-UNITS", 1);
    expectNoRule("a bare number is fine",
                 "create_clock -name CK -period 10.0 [get_ports clk]\n", "SDC-UNITS");

    // A setup multicycle with no hold counterpart passes timing and fails on silicon.
    expectRule("setup multicycle with no hold",
               "create_clock -name CK -period 10 [get_ports clk]\n"
               "set_multicycle_path 2 -setup -from [get_clocks CK]\n",
               "SDC-MCP-NOHOLD", 2);
    expectNoRule("...paired with -hold on the same endpoints",
                 "create_clock -name CK -period 10 [get_ports clk]\n"
                 "set_multicycle_path 2 -setup -from [get_clocks CK]\n"
                 "set_multicycle_path 1 -hold  -from [get_clocks CK]\n",
                 "SDC-MCP-NOHOLD");

    // A single -group is legal and meaningful: that group is asynchronous to EVERY OTHER clock.
    // Tessent emits exactly this, so warning on it was pure noise.
    expectNoRule("one clock group is not a defect",
                 "create_clock -name CK -period 10 [get_ports clk]\n"
                 "set_clock_groups -asynchronous -name tck_group -group [get_clocks CK]\n",
                 "SDC-CLKGRP-ONE");

    // A constraint fragment (Tessent's dft_add_func block) defines no clocks of its own, so its
    // clock references are external by construction — flagging each one is noise about the
    // file's nature, not a defect.
    expectNoRule("fragment: clock references are external",
                 "set_input_delay 9 -clock ts_tck_ijtag_tck [get_ports ijtag_si]\n",
                 "SDC-CLK-UNDEF");
    expectRule("...and the file is labelled as a fragment once",
               "set_input_delay 9 -clock ts_tck_ijtag_tck [get_ports ijtag_si]\n",
               "SDC-NO-CLOCK", 1);
    // A Tessent instrument .sdc is a proc library that is sourced, never executed directly.
    expectRule("procedure-only file",
               "proc tessent_edt_sdc {args} {\n"
               "  create_clock edt_clock -period 40.0 -name edt_clock -add\n"
               "}\n",
               "SDC-PROC-ONLY", 1);

    // Synopsys collection/attribute commands that real vendor SDC leans on.
    expectClean("append_to_collection and get_attribute",
                "create_clock -name CK -period 10 [get_ports clk]\n"
                "set cs [get_cells u_a]\n"
                "append_to_collection cs [get_cells u_b]\n"
                "if {[sizeof_collection $cs] == 2} { set_false_path -from [get_cells $cs] }\n"
                "if {[get_attribute [get_cells u_a] is_hierarchical] eq \"true\"} {\n"
                "  set_disable_clock_gating_check [get_cells u_a]\n"
                "}\n");

    // `puts` must never reach stdout — the linter also runs inside the ndjson daemon, whose
    // stdout is the protocol channel. It is surfaced as a finding instead.
    expectRule("the file's own diagnostic is surfaced, not printed",
               "create_clock -name CK -period 10 [get_ports clk]\n"
               "puts \"Tessent SDC error: mode not supported\"\n",
               "SDC-ECHO", 2);
    // ...but an object-not-found message is an existence claim, and without a design the file's
    // own lookups fail by construction. Reporting those would be laundering our own limitation.
    expectNoRule("object-not-found echoes need a design to mean anything",
                 "create_clock -name CK -period 10 [get_ports clk]\n"
                 "puts \"Tessent SDC error: No pin found with pattern(s) foo\"\n",
                 "SDC-ECHO");
    // ...and a checker must not write to the user's disk.
    expectRule("file writes are neutralised",
               "create_clock -name CK -period 10 [get_ports clk]\n"
               "set fh [open /tmp/sdc_lint_must_not_write.txt w]\n"
               "puts $fh \"nope\"\n"
               "close $fh\n",
               "SDC-IO-BLOCKED", 2);

    // ================= L3: design-aware =========================================================

    DesignObjects d;
    d.ports = {"clk", "rst_n", "d0", "d1", "q0"};
    d.inputs = {"clk", "rst_n", "d0", "d1"};
    d.outputs = {"q0"};
    d.pins = {"u_core.u_reg.CK", "u_core.u_reg.Q"};
    d.cells = {"u_core", "u_core.u_reg"};

    expectRule("port that does not exist",
               "create_clock -name CK -period 10 [get_ports nosuch_clk]\n", "SDC-EMPTY-MATCH", 1,
               opts(), d);
    expectRule("glob that matches nothing",
               "create_clock -name CK -period 10 [get_ports clk]\n"
               "set_input_delay 1 -clock CK [get_ports {spi_*}]\n",
               "SDC-EMPTY-MATCH", 2, opts(), d);
    expectRule("pin that does not exist",
               "create_clock -name CK -period 10 [get_ports clk]\n"
               "create_generated_clock -name G -source [get_ports clk] -divide_by 2 "
               "[get_pins u_core/u_missing/CK]\n",
               "SDC-EMPTY-MATCH", 2, opts(), d);
    // SDC writes pins with '/', the design model uses '.': both must resolve.
    expectNoRule("slash pin path resolves",
                 "create_clock -name CK -period 10 [get_ports clk]\n"
                 "create_generated_clock -name G -source [get_ports clk] -divide_by 2 "
                 "[get_pins u_core/u_reg/CK]\n",
                 "SDC-EMPTY-MATCH", opts(), d);
    // `get_pins -of_objects <cells>` with no positional pattern: the form Tessent's own
    // tessent_get_pins is built on. It must return the cell's pins, not an empty collection.
    {
        const LintReport r = lintText(
            "create_clock -name CK -period 10 [get_ports clk]\n"
            "set p [get_pins -of_objects [get_cells u_core.u_reg]]\n"
            "if {[sizeof_collection $p] == 0} { puts \"EMPTY\" }\n"
            "set_false_path -to $p\n",
            "t.sdc", opts(), d);
        if (find(r, "SDC-ECHO")) {
            std::printf("FAIL [-of_objects]: returned an empty collection\n");
            dump("-of_objects", r);
            ++failures;
        }
    }
    expectNoRule("-quiet suppresses the miss",
                 "create_clock -name CK -period 10 [get_ports clk]\n"
                 "set_input_delay 1 -clock CK [get_ports -quiet {spi_*}]\n",
                 "SDC-EMPTY-MATCH", opts(), d);
    // Without a design there is nothing to check against — never guess.
    expectNoRule("no design => no empty-match claims",
                 "create_clock -name CK -period 10 [get_ports nosuch_clk]\n", "SDC-EMPTY-MATCH");
    {
        LintOptions o = opts();
        o.designAware = false;
        expectNoRule("design-aware disabled",
                     "create_clock -name CK -period 10 [get_ports nosuch_clk]\n",
                     "SDC-EMPTY-MATCH", o, d);
    }

    // ================= a realistic file must come back clean ====================================

    expectClean("realistic constraint file",
                "#####################################\n"
                "set ATE_CLK_200M  [expr 1000.0/200]\n"
                "set CPU_CLK_100M  [expr 1000.0/100]\n"
                "set AHB_CLK_100M  $CPU_CLK_100M\n"
                "set UART_SCLK_100M [expr 1000.0/100]; # sample clock\n"
                "create_clock -name v_clk -period 1 -add\n"
                "create_clock -name i_ate_ref_clk [get_ports clk] -period ${ATE_CLK_200M} -add\n"
                "create_generated_clock -name g_cpu_clk [get_pins u_core/u_reg/Q] \\\n"
                "                       -source [get_ports clk] -divide_by 1 -add \\\n"
                "                       -master_clock i_ate_ref_clk\n"
                "set_clock_groups -asynchronous -group [get_clocks i_ate_ref_clk] \\\n"
                "                               -group [get_clocks g_cpu_clk]\n"
                "set_input_delay  1.0 -clock i_ate_ref_clk [get_ports d0]\n"
                "set_output_delay 1.0 -clock i_ate_ref_clk [get_ports q0]\n"
                "set_false_path -from [get_ports rst_n]\n"
                "set_max_transition 0.210 [get_ports q0]\n"
                "set_load 15 [all_outputs]\n",
                opts(), d);

    // The summary must reflect what was actually read.
    {
        const LintReport r = lintText(
            "create_clock -name CK -period 10 [get_ports clk]\n"
            "create_generated_clock -name G -source [get_ports clk] -divide_by 2 [get_pins u/q]\n"
            "set_false_path -from [get_ports a]\n"
            "set_input_delay 1 -clock CK [get_ports d]\n",
            "t.sdc");
        if (r.summary.clocks != 1 || r.summary.generatedClocks != 1 || r.summary.exceptions != 1 ||
            r.summary.ioDelays != 1) {
            std::printf("FAIL [summary]: got clocks=%d gen=%d exc=%d io=%d\n", r.summary.clocks,
                        r.summary.generatedClocks, r.summary.exceptions, r.summary.ioDelays);
            ++failures;
        }
    }

    // Errors must sort ahead of warnings so the first finding is the one worth fixing.
    {
        const LintReport r = lintText(
            "set_input_delay 1 [get_ports d]\n"          // warning
            "create_clock -perid 10 [get_ports clk]\n",  // error
            "t.sdc");
        if (r.findings.empty() || r.findings.front().severity != Severity::Error) {
            std::printf("FAIL [ordering]: expected an error first\n");
            dump("ordering", r);
            ++failures;
        }
    }

    // The spec table must not contain a duplicate command name (a silent shadowing bug).
    {
        std::vector<std::string> seen;
        for (const CommandSpec& c : commandSpecs()) {
            for (const std::string& s : seen)
                if (s == c.name) {
                    std::printf("FAIL [spec]: duplicate command %s\n", c.name.c_str());
                    ++failures;
                }
            seen.push_back(c.name);
        }
        assert(findCommand("create_clock") != nullptr);
        assert(findCommand("no_such_command") == nullptr);
    }

    if (failures) {
        std::printf("test_sdclint: %d failure(s)\n", failures);
        return 1;
    }
    std::printf("test_sdclint: all checks passed\n");
    return 0;
}
