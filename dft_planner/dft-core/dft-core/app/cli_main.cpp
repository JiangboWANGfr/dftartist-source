#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <memory>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "frontend/SlangCompile.h"
#include "ir/DesignIR.h"
#include "json/JsonWriter.h"
#include "protocol/NdjsonServer.h"
#include "service/DesignDb.h"
#include "service/Filelist.h"
#include "service/Hierarchy.h"
#include "service/ScanBudget.h"
#include "json/JsonValue.h"
#include "slang/ast/Compilation.h"

namespace {

struct Args {
    std::string input;       // filelist|dir (1st positional)
    std::string target;      // node/def (2nd positional, optional)
    std::vector<std::pair<std::string, std::string>> varmap, substs;
    std::string defArg, instArg, topArg;
    std::string stdArg;  // --std 1364-2005|1800-2017|1800-2023 (overrides the filelist's)
    bool all = false;
    bool timing = false;  // --timing: per-phase wall clock to stderr
    // ---- `hdl wrapper` ----
    std::string outDir;                  // --out: where the .log/.rpt/.json go
    int wrapInThreshold = 4;
    int wrapOutThreshold = 4;
    int wrapFeedbackThreshold = 4;
    int wrapLevels = 32;
    int wrapEdtChannels = 0;             // 0 = do not size the EDT
    bool wrapRegisterUndriven = true;
    bool wrapRegisterBlackbox = false;
    bool wrapVerbose = false;            // one log line per port bit
    bool wrapInferClocks = true;
    bool wrapSkipFeedthrough = true;
    std::vector<std::string> wrapExclude;
    std::vector<std::string> wrapClocks;      // --clock-ports
    std::vector<std::string> wrapForceDed;    // --force-dedicated
    std::vector<std::string> wrapForceShared; // --force-shared
    // ---- `hdl scanbudget` ----
    std::string budgetConfig;   // --config: the EDT plan as JSON
    std::string budgetDesign;   // --design: DftSpecification(<design>,<scope>)
    std::string budgetScope;
    std::string error;
};

// --timing: where the wall clock actually goes. Printed to stderr so stdout stays machine-readable.
struct PhaseTimer {
    bool on = false;
    std::chrono::steady_clock::time_point t0 = std::chrono::steady_clock::now();
    void lap(const char* phase) {
        if (!on) return;
        auto now = std::chrono::steady_clock::now();
        std::fprintf(stderr, "  [timing] %-22s %8.1f ms\n", phase,
                     std::chrono::duration<double, std::milli>(now - t0).count());
        t0 = now;
    }
};

Args parseArgs(int argc, char** argv, int start) {
    Args a;
    std::vector<std::string> positionals;
    for (int i = start; i < argc; ++i) {
        std::string_view f = argv[i];
        auto kv = [&](const char* name) -> bool {
            if (f != name) return false;
            if (i + 1 >= argc) { a.error = std::string("missing value for ") + name; return true; }
            std::string val = argv[++i];
            auto eq = val.find('=');
            if (eq == std::string::npos) { a.error = std::string("expected k=v: ") + val; return true; }
            (f == "--var" ? a.varmap : a.substs).emplace_back(val.substr(0, eq), val.substr(eq + 1));
            return true;
        };
        if (f == "--var" || f == "--subst") { kv(f == "--var" ? "--var" : "--subst"); }
        else if (f == "--def") { if (i + 1 < argc) a.defArg = argv[++i]; }
        else if (f == "--inst") { if (i + 1 < argc) a.instArg = argv[++i]; }
        else if (f == "--top") { if (i + 1 < argc) a.topArg = argv[++i]; }  // accepted; daemon keeps all candidates
        else if (f == "--std") { if (i + 1 < argc) a.stdArg = argv[++i]; }
        else if (f == "--all") { a.all = true; }
        else if (f == "--timing") { a.timing = true; }
        // ---- wrapper-cell analysis (see cmdWrapper) ----
        else if (f == "--core") { if (i + 1 < argc) a.target = argv[++i]; }
        else if (f == "--out") { if (i + 1 < argc) a.outDir = argv[++i]; }
        else if (f == "--in-threshold") { if (i + 1 < argc) a.wrapInThreshold = std::atoi(argv[++i]); }
        else if (f == "--out-threshold") { if (i + 1 < argc) a.wrapOutThreshold = std::atoi(argv[++i]); }
        else if (f == "--feedback-threshold") { if (i + 1 < argc) a.wrapFeedbackThreshold = std::atoi(argv[++i]); }
        else if (f == "--levels") { if (i + 1 < argc) a.wrapLevels = std::atoi(argv[++i]); }
        else if (f == "--edt-channels") { if (i + 1 < argc) a.wrapEdtChannels = std::atoi(argv[++i]); }
        else if (f == "--no-undriven-output") { a.wrapRegisterUndriven = false; }
        else if (f == "--register-blackbox-ports") { a.wrapRegisterBlackbox = true; }
        else if (f == "--verbose") { a.wrapVerbose = true; }
        else if (f == "--no-infer-clocks") { a.wrapInferClocks = false; }
        else if (f == "--keep-feedthrough") { a.wrapSkipFeedthrough = false; }
        else if (f == "--config") { if (i + 1 < argc) a.budgetConfig = argv[++i]; }
        else if (f == "--design") { if (i + 1 < argc) a.budgetDesign = argv[++i]; }
        else if (f == "--scope") { if (i + 1 < argc) a.budgetScope = argv[++i]; }
        else if (f == "--exclude" || f == "--clock-ports" || f == "--force-dedicated" ||
                 f == "--force-shared") {
            // comma- or space-separated globs; repeatable
            std::vector<std::string>* dst =
                f == "--exclude"          ? &a.wrapExclude
              : f == "--clock-ports"      ? &a.wrapClocks
              : f == "--force-dedicated"  ? &a.wrapForceDed
                                          : &a.wrapForceShared;
            if (i + 1 < argc) {
                std::string list = argv[++i];
                std::string cur;
                for (char ch : list + ",") {
                    if (ch == ',' || ch == ' ') {
                        if (!cur.empty()) dst->push_back(cur);
                        cur.clear();
                    } else {
                        cur += ch;
                    }
                }
            }
        }
        else if (!f.empty() && f[0] == '-') { a.error = std::string("unknown flag: ") + std::string(f); }
        else { positionals.emplace_back(f); }
    }
    if (positionals.size() >= 1) a.input = positionals[0];
    if (positionals.size() >= 2) a.target = positionals[1];
    return a;
}

// Library search + language version + top, with the command line overriding the filelist.
hdl::frontend::CompileOptions compileOptions(const Args& a, const hdl::service::FilelistResult& fl) {
    hdl::frontend::CompileOptions o;
    o.lib = {fl.libdirs, fl.libexts, fl.libfiles};
    o.languageVersion = a.stdArg.empty() ? fl.langVersion : a.stdArg;
    // --top now really scopes elaboration instead of only being echoed back.
    o.topModule = a.topArg;
    return o;
}

// Compile + build a DesignDb from an input (filelist|dir). Returns nullptr + sets err on failure.
std::unique_ptr<hdl::service::DesignDb> openDb(const Args& a, std::string& err,
                                               PhaseTimer* pt = nullptr) {
    auto fl = hdl::service::parseFilelist(a.input, a.varmap, a.substs);
    if (pt) pt->lap("filelist");
    if (fl.files.empty() && fl.libfiles.empty()) { err = "no source files resolved from " + a.input; return nullptr; }
    std::string parseErr;
    auto design = hdl::frontend::compileSingleTree(fl.files, fl.defines, fl.incdirs,
                                                   compileOptions(a, fl), parseErr);
    if (pt) pt->lap("parse + libsearch");
    if (!design) { err = "parse error: " + parseErr; return nullptr; }
    if (design->topModuleIgnored)
        std::fprintf(stderr, "WARN: --top '%s' matches no module — inferring tops instead\n",
                     design->topModule.c_str());
    auto db = std::make_unique<hdl::service::DesignDb>(std::move(design));
    if (pt) pt->lap("candidate tops");
    return db;
}

// Expand every ancestor prefix of nodeId so it becomes registered (one-shot CLI queries).
void ensureRegistered(hdl::service::DesignDb& db, const std::string& nodeId) {
    size_t pos = 0;
    while ((pos = nodeId.find('.', pos)) != std::string::npos) {
        try { db.expandChildren(nodeId.substr(0, pos)); } catch (...) {}
        ++pos;
    }
}

std::string emitHierarchyJson(const hdl::ir::DesignHierarchy& h) {
    hdl::json::JsonWriter w;
    w.beginObject();
    w.key("schemaVersion");
    w.value(h.schemaVersion);
    w.key("rootInstanceIds");
    w.beginArray();
    for (auto& r : h.rootInstanceIds) w.value(r);
    w.endArray();
    w.key("instances");
    w.beginObject();
    for (auto& [id, n] : h.instances) {
        w.key(id);
        w.beginObject();
        w.key("id"); w.value(n.id);
        w.key("instanceName"); w.value(n.instanceName);
        w.key("definitionId"); w.value(n.definitionId);
        w.key("parentInstanceId");
        if (n.parentInstanceId) w.value(*n.parentInstanceId); else w.valueNull();
        w.key("childInstanceIds");
        w.beginArray();
        for (auto& c : n.childInstanceIds) w.value(c);
        w.endArray();
        w.key("isLeaf"); w.value(n.isLeaf);
        w.endObject();
    }
    w.endObject();
    w.key("definitions");
    w.beginObject();
    for (auto& [id, d] : h.definitions) {
        w.key(id);
        w.beginObject();
        w.key("id"); w.value(d.id);
        w.key("designName"); w.value(d.designName);
        if (d.filePath) { w.key("filePath"); w.value(*d.filePath); }
        w.endObject();
    }
    w.endObject();
    w.endObject();
    return w.str();
}

int cmdDump(const Args& a) {
    auto fl = hdl::service::parseFilelist(a.input, a.varmap, a.substs);
    if (fl.files.empty() && fl.libfiles.empty()) { std::fprintf(stderr, "no source files resolved from %s\n", a.input.c_str()); return 2; }
    std::string parseErr;
    auto design = hdl::frontend::compileSingleTree(fl.files, fl.defines, fl.incdirs,
                                                   compileOptions(a, fl), parseErr);
    if (!design) { std::fprintf(stderr, "parse error: %s\n", parseErr.c_str()); return 2; }
    if (!design->missingLibDirs.empty())
        std::fprintf(stderr, "WARN: %zu -y search dir(s) do not exist, e.g. %s\n",
                     design->missingLibDirs.size(), design->missingLibDirs[0].c_str());
    if (!design->libraryFiles.empty())
        std::fprintf(stderr, "INFO: %zu file(s) resolved from the -y search path\n",
                     design->libraryFiles.size());
    if (!design->missingFiles.empty())
        std::fprintf(stderr, "WARN: %zu missing file(s) skipped, e.g. %s\n",
                     design->missingFiles.size(), design->missingFiles[0].c_str());
    // A full dump elaborates everything anyway, so asking for diagnostics here costs nothing extra.
    if (int errs = design->diagnostics().errorCount)
        std::fprintf(stderr, "WARN: %d compile errors — hierarchy may be partial\n", errs);
    auto h = hdl::service::buildHierarchy(*design->comp);
    std::string json = emitHierarchyJson(h);
    std::fwrite(json.data(), 1, json.size(), stdout);
    std::fputc('\n', stdout);
    std::fprintf(stderr, "wrote %zu instances, %zu definitions, roots=%zu\n", h.instances.size(),
                 h.definitions.size(), h.rootInstanceIds.size());
    return 0;
}

// Every whole-design query has the same shape: open, run one method, print. --timing splits the
// wall clock into filelist / parse / candidate-tops / the query itself.
int cmdSimple(const Args& a, const char* method) {
    PhaseTimer pt{a.timing};
    std::string err;
    auto db = openDb(a, err, &pt);
    if (!db) { std::fprintf(stderr, "%s\n", err.c_str()); return 2; }
    std::string out = hdl::protocol::runQuery(*db, method, {});
    pt.lap(method);
    std::fwrite(out.data(), 1, out.size(), stdout);
    std::fputc('\n', stdout);
    if (a.timing) std::fprintf(stderr, "  [timing] %-22s %8zu bytes\n", "response", out.size());
    return 0;
}

int cmdDiagnostics(const Args& a) { return cmdSimple(a, "get-diagnostics"); }
int cmdSequential(const Args& a) { return cmdSimple(a, "get-sequential"); }
int cmdRegcount(const Args& a) { return cmdSimple(a, "get-register-count"); }

// ---- wrapper: the wrapper-cell estimate as a STANDALONE run ---------------------------------
//
// Its own process on purpose. The estimate is what sizes the EXTEST EDT, it is started once per
// design revision, and on a multi-million-register block it runs for a while — so it must not sit
// inside the GUI's event loop. Here it streams its log to stdout as it goes (the GUI tails that
// live) and drops three artefacts next to each other:
//
//   wrapper_analysis.log   what it did, with progress
//   wrapper_cells.rpt      one line per boundary port BIT, the reviewable form
//   wrapper_cells.json     the same rows for a tool to read back
int cmdWrapper(const Args& a) {
    PhaseTimer pt{a.timing};
    std::string err;
    auto db = openDb(a, err, &pt);
    if (!db) { std::fprintf(stderr, "%s\n", err.c_str()); return 2; }

    const std::string outDir = a.outDir.empty() ? std::string(".") : a.outDir;
    const std::string logPath = outDir + "/wrapper_analysis.log";
    std::ofstream logFile(logPath, std::ios::trunc);
    if (!logFile) {
        std::fprintf(stderr, "cannot write %s\n", logPath.c_str());
        return 2;
    }

    hdl::service::WrapperOptions opt;
    opt.inputFanoutFlopThreshold = a.wrapInThreshold;
    opt.outputFaninFlopThreshold = a.wrapOutThreshold;
    opt.feedbackFlopThreshold = a.wrapFeedbackThreshold;
    opt.levelsThreshold = a.wrapLevels;
    opt.registerUndrivenOutput = a.wrapRegisterUndriven;
    opt.registerPortsReachingBlackboxes = a.wrapRegisterBlackbox;
    opt.excludePorts = a.wrapExclude;
    opt.clockPorts = a.wrapClocks;
    opt.forceDedicatedPorts = a.wrapForceDed;
    opt.forceSharedPorts = a.wrapForceShared;
    opt.inferClockPorts = a.wrapInferClocks;
    opt.skipFeedthroughPorts = a.wrapSkipFeedthrough;
    opt.logEveryPort = a.wrapVerbose;
    // Unbuffered on BOTH sinks: a tail -f and a GUI reading the pipe are the point of this
    // command, and a half-written buffer at the end of a long run tells the user nothing.
    opt.log = [&](const std::string& line) {
        logFile << line << '\n';
        logFile.flush();
        std::fputs(line.c_str(), stdout);
        std::fputc('\n', stdout);
        std::fflush(stdout);
    };

    opt.log("=== wrapper-cell analysis ===");
    hdl::service::WrapperEstimate est;
    try {
        est = db->wrapperCells(a.target, opt);
    } catch (const std::exception& e) {
        opt.log(std::string("ERROR: ") + e.what());
        return 1;
    }
    if (est.core.empty()) {
        opt.log("ERROR: no such core instance (leave --core empty for the largest top)");
        return 1;
    }

    // EDT sizing: input and output wrapper cells go on SEPARATE chains, so this is two
    // independent ceilings, not one division.
    if (a.wrapEdtChannels > 0) {
        const int ch = a.wrapEdtChannels;
        const int ci = (est.wrapperIn() + ch - 1) / ch;
        const int co = (est.wrapperOut() + ch - 1) / ch;
        opt.log("");
        opt.log("  ext EDT with " + std::to_string(ch) + " channels: input chains ~" +
                std::to_string(ch) + " x " + std::to_string(ci) + " cells, output chains ~" +
                std::to_string(ch) + " x " + std::to_string(co) + " cells (longest " +
                std::to_string(std::max(ci, co)) + ")");
    }

    const std::string rptPath = outDir + "/wrapper_cells.rpt";
    if (std::ofstream rpt{rptPath, std::ios::trunc}) {
        rpt << "Boundary port bit      Dir  Decision   Cells(direct/fb)  Wrapper cell"
               "                             Reason\n"
            << std::string(140, '-') << "\n";
        for (const auto& c : est.cells) {
            std::string name = c.name;
            if (name.size() < 22) name.append(22 - name.size(), ' ');
            std::string dir = c.dir == "in" ? "I" : (c.dir == "out" ? "O" : "B");
            std::string dec = c.decision;
            if (dec.size() < 10) dec.append(10 - dec.size(), ' ');
            std::string cells = c.flops ? std::to_string(c.flops - c.flopsFeedback) + "/" +
                                              std::to_string(c.flopsFeedback)
                                        : std::string("-");
            if (cells.size() < 17) cells.append(17 - cells.size(), ' ');
            std::string cell = c.cell.empty() ? std::string("--") : c.cell;
            if (cell.size() < 36) cell.append(36 - cell.size(), ' ');
            rpt << name << " " << dir << "    " << dec << " " << cells << " " << cell << " "
                << (c.reason.empty() ? "--" : c.reason) << "\n";
        }
        rpt << std::string(140, '-') << "\n"
            << "wrapper cells: " << est.wrapperCells() << " (in " << est.wrapperIn() << ", out "
            << est.wrapperOut() << ")   shared " << (est.sharedIn + est.sharedOut)
            << "   dedicated " << (est.dedicatedIn + est.dedicatedOut) << "\n";
        opt.log("wrote " + rptPath);
    } else {
        opt.log("WARN: cannot write " + rptPath);
    }

    const std::string jsonPath = outDir + "/wrapper_cells.json";
    if (std::ofstream js{jsonPath, std::ios::trunc}) {
        hdl::json::JsonWriter w;
        w.beginObject();
        w.key("core"); w.value(est.core);
        w.key("inputBits"); w.value(est.inputBits);
        w.key("outputBits"); w.value(est.outputBits);
        w.key("sharedIn"); w.value(est.sharedIn);
        w.key("sharedOut"); w.value(est.sharedOut);
        w.key("dedicatedIn"); w.value(est.dedicatedIn);
        w.key("dedicatedOut"); w.value(est.dedicatedOut);
        w.key("noneIn"); w.value(est.noneIn);
        w.key("noneOut"); w.value(est.noneOut);
        w.key("wrapperIn"); w.value(est.wrapperIn());
        w.key("wrapperOut"); w.value(est.wrapperOut());
        w.key("wrapperCells"); w.value(est.wrapperCells());
        w.key("addedScanCells"); w.value(est.addedScanCells());
        w.key("analysisMs"); w.value(static_cast<int>(est.analysisMs));
        w.key("coneNodes"); w.value(static_cast<int>(est.coneNodes));
        w.key("cells");
        w.beginArray();
        for (const auto& c : est.cells) {
            w.beginObject();
            w.key("name"); w.value(c.name);
            w.key("port"); w.value(c.port);
            w.key("bit"); w.value(c.bit);
            w.key("dir"); w.value(c.dir);
            w.key("decision"); w.value(c.decision);
            w.key("flops"); w.value(c.flops);
            w.key("flopsFeedback"); w.value(c.flopsFeedback);
            w.key("cell"); w.value(c.cell);
            w.key("clock"); w.value(c.clock);
            w.key("reason"); w.value(c.reason);
            w.key("levels"); w.value(c.levels);
            w.endObject();
        }
        w.endArray();
        w.endObject();
        js << w.str() << "\n";
        opt.log("wrote " + jsonPath);
    }
    opt.log("wrote " + logPath);
    pt.lap("wrapper");
    return 0;
}

// ---- scanbudget: EDT sizing + the two artefacts that have to agree ---------------------------
//
// Config comes in as JSON (the GUI writes it; a script can hand-write it) rather than as thirty
// flags, because the interesting part is a LIST of controllers with a list of instances each.
//
//   { "core":"processor_core",
//     "occInstances":["*tessent_occ*"], "hyperInstances":["*hyper*"],
//     "edts":[ {"name":"INT_EDT","external":false,"instances":["processor_core.PROCESSOR_1"],
//               "channels":4,"targetChainLength":400,"includeOcc":true,"includeHyper":true},
//              {"name":"EXT_EDT","external":true,"channels":2,"targetChainLength":300,
//               "includeWrapper":true} ] }
int cmdScanBudget(const Args& a) {
    PhaseTimer pt{a.timing};
    std::string err;
    auto db = openDb(a, err, &pt);
    if (!db) { std::fprintf(stderr, "%s\n", err.c_str()); return 2; }

    hdl::service::ScanBudgetOptions opt;
    opt.core = a.target;
    opt.designName = a.budgetDesign;
    if (!a.budgetScope.empty()) opt.specScope = a.budgetScope;

    if (!a.budgetConfig.empty()) {
        std::ifstream cf(a.budgetConfig);
        if (!cf) { std::fprintf(stderr, "cannot read %s\n", a.budgetConfig.c_str()); return 2; }
        const std::string text{std::istreambuf_iterator<char>(cf), std::istreambuf_iterator<char>()};
        hdl::json::Value cfg;
        try {
            cfg = hdl::json::parse(text);
        } catch (const std::exception& e) {
            std::fprintf(stderr, "bad config JSON: %s\n", e.what());
            return 2;
        }
        // One reader, shared with the daemon's `scan-budget` method: the CLI, the GUI and the
        // canvas must not drift into three readings of the same document.
        hdl::service::ScanBudgetOptions fromFile = hdl::service::scanBudgetOptionsFromJson(cfg);
        if (!opt.core.empty()) fromFile.core = opt.core;
        if (!opt.designName.empty()) fromFile.designName = opt.designName;
        if (!a.budgetScope.empty()) fromFile.specScope = opt.specScope;
        opt = std::move(fromFile);
    }
    if (opt.edts.empty()) {
        std::fprintf(stderr, "no EDT controllers configured — pass --config <json>\n");
        return 2;
    }

    const std::string outDir = a.outDir.empty() ? std::string(".") : a.outDir;
    std::ofstream logFile(outDir + "/scan_budget.log", std::ios::trunc);
    opt.log = [&](const std::string& line) {
        if (logFile) { logFile << line << '\n'; logFile.flush(); }
        std::fputs(line.c_str(), stdout);
        std::fputc('\n', stdout);
        std::fflush(stdout);
    };
    opt.log("=== scan budget ===");

    hdl::service::ScanBudgetResult r = hdl::service::computeScanBudget(*db, opt);

    auto write = [&](const std::string& name, const std::string& text) {
        std::ofstream f(outDir + "/" + name, std::ios::trunc);
        if (!f) { opt.log("WARN: cannot write " + name); return; }
        f << text;
        opt.log("wrote " + outDir + "/" + name);
    };
    write("edt.spec", r.edtSpec);
    write("scan_insertion.tcl", r.scanTcl);

    hdl::json::JsonWriter w;
    w.beginObject();
    w.key("core"); w.value(r.core);
    w.key("coreRegisterBits"); w.value(static_cast<int>(r.coreRegisterBits));
    w.key("coreMemoryBits"); w.value(static_cast<int>(r.coreMemoryBits));
    w.key("occBits"); w.value(static_cast<int>(r.occBits));
    w.key("hyperBits"); w.value(static_cast<int>(r.hyperBits));
    w.key("nonscanBits"); w.value(static_cast<int>(r.nonscanBits));
    w.key("wrapperIn"); w.value(r.wrapperIn);
    w.key("wrapperOut"); w.value(r.wrapperOut);
    w.key("unassignedBits"); w.value(static_cast<int>(r.unassignedBits));
    w.key("errors"); w.beginArray();
    for (const auto& e : r.errors) w.value(e);
    w.endArray();
    w.key("notes"); w.beginArray();
    for (const auto& n : r.notes) w.value(n);
    w.endArray();
    w.key("edts"); w.beginArray();
    for (const auto& b : r.edts) {
        w.beginObject();
        w.key("name"); w.value(b.name);
        w.key("external"); w.value(b.external);
        w.key("cellsCore"); w.value(static_cast<int>(b.cellsCore));
        w.key("cellsOcc"); w.value(static_cast<int>(b.cellsOcc));
        w.key("cellsHyper"); w.value(static_cast<int>(b.cellsHyper));
        w.key("cellsWrapper"); w.value(static_cast<int>(b.cellsWrapper));
        w.key("cells"); w.value(static_cast<int>(b.cells()));
        w.key("channels"); w.value(b.channels);
        w.key("chainCount"); w.value(b.chainCount);
        w.key("longestMin"); w.value(b.longestMin);
        w.key("longestMax"); w.value(b.longestMax);
        w.key("compression"); w.value(static_cast<int>(b.compression));
        w.key("warnings"); w.beginArray();
        for (const auto& x : b.warnings) w.value(x);
        w.endArray();
        w.key("contributions"); w.beginArray();
        for (const auto& c : b.contributions) {
            w.beginObject();
            w.key("instance"); w.value(c.instance);
            w.key("bits"); w.value(static_cast<int>(c.bits));
            w.key("memoryBits"); w.value(static_cast<int>(c.memoryBits));
            w.endObject();
        }
        w.endArray();
        w.endObject();
    }
    w.endArray();
    w.endObject();
    write("scan_budget.json", w.str() + "\n");
    pt.lap("scanbudget");
    return r.errors.empty() ? 0 : 1;
}

int cmdServe(const Args& a) {
    PhaseTimer pt{a.timing};
    std::string err;
    auto db = openDb(a, err, &pt);
    if (!db) { std::fprintf(stderr, "%s\n", err.c_str()); return 2; }
    return hdl::protocol::runStdioServer(*db);
}

int cmdQuery(const std::string& method, const Args& a) {
    PhaseTimer pt{a.timing};
    std::string err;
    auto db = openDb(a, err, &pt);
    if (!db) { std::fprintf(stderr, "%s\n", err.c_str()); return 2; }
    std::string out;
    try {
        if (method == "ping") {
            out = hdl::protocol::runQuery(*db, "ping", {});
        } else if (method == "roots") {
            out = hdl::protocol::candidateTopsJson(*db);
        } else if (method == "children") {
            ensureRegistered(*db, a.target);
            out = hdl::protocol::runQuery(*db, "expand-children", {{"nodeId", a.target}});
        } else if (method == "ports") {
            if (!a.defArg.empty())
                out = hdl::protocol::runQuery(*db, "get-ports", {{"defId", a.defArg}});
            else {
                ensureRegistered(*db, a.target);
                out = hdl::protocol::runQuery(*db, "get-ports", {{"nodeId", a.target}});
            }
        } else if (method == "loc") {
            if (!a.defArg.empty())
                out = hdl::protocol::runQuery(*db, "get-source-location",
                                              {{"kind", "definition"}, {"defId", a.defArg}});
            else {
                ensureRegistered(*db, a.instArg);
                out = hdl::protocol::runQuery(*db, "get-source-location",
                                              {{"kind", "instantiation"}, {"nodeId", a.instArg}});
            }
        }
    } catch (const std::exception& e) {
        std::fprintf(stderr, "error: %s\n", e.what());
        return 1;
    }
    pt.lap(method.c_str());
    std::fwrite(out.data(), 1, out.size(), stdout);
    std::fputc('\n', stdout);
    if (a.timing) std::fprintf(stderr, "  [timing] %-22s %8zu bytes\n", "response", out.size());
    return 0;
}

}  // namespace

int main(int argc, char** argv) {
    if (argc >= 2 && std::string_view(argv[1]) == "--version") {
        std::printf("hdl-core 0.0.1 (slang backend)\n");
        return 0;
    }
    if (argc < 2) {
        std::fprintf(stderr,
                     "usage: hdl <cmd> ...\n"
                     "  dump <input> [--var k=v] [--subst a=b]\n"
                     "  sequential <input> [opts]            # L4: flops + clock/async-reset nets\n"
                     "  regcount <input> [opts]              # L4b: per-instance flop bit count\n"
                     "  serve <input> [opts]                 # NDJSON daemon over stdio\n"
        "  wrapper <input> [wopts]              # wrapper-cell estimate (standalone; logs live)\n"
        "     wopts: --core <inst>  --out <dir>  --exclude p1,p2  --verbose\n"
        "            --in-threshold N  --out-threshold N  --feedback-threshold N  --levels N\n"
        "            --edt-channels N  --no-undriven-output  --register-blackbox-ports\n"
        "            --clock-ports p1,p2      never wrapped (a cell there is in the clock path)\n"
        "            --force-dedicated p1,p2  always a dedicated cell\n"
        "            --force-shared p1,p2     share even past the thresholds\n"
        "            --no-infer-clocks        do not treat a port reaching a clock pin as a clock\n"
        "            --keep-feedthrough       wrap PI-to-PO pass-throughs (default: no cell)\n"
        "  scanbudget <input> --config <json> [--out <dir>] [--core I] [--design D] [--scope S]\n"
        "                                       # EDT sizing -> edt.spec + scan_insertion.tcl\n"
                     "  ping|roots <input> [opts]\n"
                     "  children <input> <nodeId> [opts]\n"
                     "  ports <input> (<nodeId> | --def <defId>) [opts]\n"
                     "  loc <input> (--inst <nodeId> | --def <defId>) [opts]\n"
                     "opts: --var k=v  --subst a=b  --timing\n"
                     "      --top <name>   elaborate ONLY this top (big speedup on a wide corpus)\n"
                     "      --std 1364-2005|1800-2017|1800-2023   (default 1800-2023;\n"
                     "            also settable in the filelist as --std=<v>)\n");
        return 2;
    }
    std::string cmd = argv[1];
    Args a = parseArgs(argc, argv, 2);
    if (!a.error.empty()) { std::fprintf(stderr, "%s\n", a.error.c_str()); return 2; }
    if (a.input.empty()) { std::fprintf(stderr, "missing <input>\n"); return 2; }

    if (cmd == "dump") return cmdDump(a);
    if (cmd == "diagnostics") return cmdDiagnostics(a);
    if (cmd == "sequential") return cmdSequential(a);
    if (cmd == "regcount") return cmdRegcount(a);
    if (cmd == "serve") return cmdServe(a);
    if (cmd == "wrapper") return cmdWrapper(a);
    if (cmd == "scanbudget") return cmdScanBudget(a);
    if (cmd == "ping" || cmd == "roots" || cmd == "children" || cmd == "ports" || cmd == "loc")
        return cmdQuery(cmd, a);
    std::fprintf(stderr, "unknown command: %s\n", cmd.c_str());
    return 2;
}
