#include <cstdio>
#include <memory>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "check.h"
#include "frontend/SlangCompile.h"
#include "json/JsonWriter.h"
#include "service/DesignDb.h"
#include "service/Filelist.h"

namespace {

struct Args {
    std::string input;
    std::vector<std::pair<std::string, std::string>> varmap, substs;
    std::string stdArg;  // --std 1364-2005|1800-2017|1800-2023 (overrides the filelist's)
    std::string error;
};

Args parseArgs(int argc, char** argv, int start) {
    Args a;
    for (int i = start; i < argc; ++i) {
        std::string_view f = argv[i];
        if (f == "--var" || f == "--subst") {
            if (i + 1 >= argc) { a.error = std::string("missing value for ") + std::string(f); break; }
            std::string val = argv[++i];
            auto eq = val.find('=');
            if (eq == std::string::npos) { a.error = "expected k=v: " + val; break; }
            (f == "--var" ? a.varmap : a.substs).emplace_back(val.substr(0, eq), val.substr(eq + 1));
        } else if (f == "--std") {
            if (i + 1 >= argc) { a.error = "missing value for --std"; break; }
            a.stdArg = argv[++i];
        } else if (!f.empty() && f[0] == '-') {
            a.error = std::string("unknown flag: ") + std::string(f);
            break;
        } else if (a.input.empty()) {
            a.input = f;
        }
    }
    return a;
}

std::string emitReport(const drc::DrcReport& rep) {
    hdl::json::JsonWriter w;
    w.beginObject();
    w.key("violations");
    w.beginArray();
    for (const auto& v : rep.violations) {
        w.beginObject();
        w.key("rule"); w.value(v.rule);
        w.key("severity"); w.value(v.severity);
        w.key("signal"); w.value(v.signal);
        w.key("instanceId"); w.value(v.instanceId);
        w.key("file"); w.value(v.file);
        w.key("line"); w.value(v.line);
        w.key("path");
        w.beginArray();
        for (const auto& p : v.path) w.value(p);
        w.endArray();
        w.key("message"); w.value(v.message);
        w.endObject();
    }
    w.endArray();
    w.key("checked");
    w.beginObject();
    w.key("flops"); w.value(rep.flops);
    w.key("clocks"); w.value(rep.clocks);
    w.key("resets"); w.value(rep.resets);
    w.endObject();
    w.endObject();
    return w.str();
}

int cmdCheck(const Args& a) {
    auto fl = hdl::service::parseFilelist(a.input, a.varmap, a.substs);
    if (fl.files.empty() && fl.libfiles.empty()) { std::fprintf(stderr, "no source files resolved from %s\n", a.input.c_str()); return 2; }
    std::string parseErr;
    hdl::frontend::CompileOptions copts;
    copts.lib = {fl.libdirs, fl.libexts, fl.libfiles};
    copts.languageVersion = a.stdArg.empty() ? fl.langVersion : a.stdArg;
    auto design = hdl::frontend::compileSingleTree(fl.files, fl.defines, fl.incdirs, copts, parseErr);
    if (!design) { std::fprintf(stderr, "parse error: %s\n", parseErr.c_str()); return 2; }
    if (int errs = design->diagnostics().errorCount)
        std::fprintf(stderr, "WARN: %d compile errors — results may be partial\n", errs);

    hdl::service::DesignDb db(std::move(design));
    drc::DrcReport rep = drc::runDrc(db);

    std::string json = emitReport(rep);
    std::fwrite(json.data(), 1, json.size(), stdout);
    std::fputc('\n', stdout);

    int errors = 0, warns = 0;
    for (const auto& v : rep.violations) (v.severity == "error" ? errors : warns)++;
    std::fprintf(stderr, "DRC: %d flops, %d clocks, %d async resets checked — %d error(s), %d warning(s)\n",
                 rep.flops, rep.clocks, rep.resets, errors, warns);
    return errors ? 1 : 0;
}

}  // namespace

int main(int argc, char** argv) {
    if (argc >= 2 && std::string_view(argv[1]) == "--version") {
        std::printf("drc-core 0.0.1 (clock/reset DFT-DRC)\n");
        return 0;
    }
    if (argc < 3 || std::string_view(argv[1]) != "check") {
        std::fprintf(stderr, "usage: drc check <input> [--var k=v] [--subst a=b]\n");
        return 2;
    }
    Args a = parseArgs(argc, argv, 2);
    if (!a.error.empty()) { std::fprintf(stderr, "%s\n", a.error.c_str()); return 2; }
    if (a.input.empty()) { std::fprintf(stderr, "missing <input>\n"); return 2; }
    return cmdCheck(a);
}
