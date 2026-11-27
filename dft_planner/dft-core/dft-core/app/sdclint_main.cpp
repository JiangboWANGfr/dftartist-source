// sdclint — check an SDC/XDC constraint file for syntax, command and design errors.
//
//   sdclint check top.sdc
//   sdclint check top.sdc --dialect generic          # flag every vendor extension
//   sdclint check top.sdc --objects design.objs      # turn on the design-aware checks
//   sdclint check top.sdc --json                     # machine-readable, for CI
//
// The --objects file is a plain listing so CI can run the design-aware layer without paying for
// an elaboration: one "<kind> <name>" per line, kind in {port,input,output,pin,net,cell}.
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

#include "json/JsonWriter.h"
#include "lint.h"
#include "spec.h"

namespace {

struct Args {
    std::string input;
    std::string objectsFile;
    unsigned dialects = sdc::kAll;
    bool json = false;
    bool warningsAreErrors = false;
    bool noDesign = false;
    std::string error;
};

unsigned parseDialects(const std::string& csv, std::string* err) {
    unsigned m = 0;
    std::stringstream ss(csv);
    std::string t;
    while (std::getline(ss, t, ',')) {
        if (t == "generic" || t == "sdc") m |= sdc::kGeneric;
        else if (t == "dc" || t == "pt" || t == "synopsys") m |= sdc::kDcPt;
        else if (t == "genus" || t == "cadence") m |= sdc::kGenus;
        else if (t == "all") m |= sdc::kAll;
        else { *err = "unknown dialect: " + t + " (want generic|dc|genus|all)"; return sdc::kAll; }
    }
    return m ? m : sdc::kAll;
}

Args parseArgs(int argc, char** argv, int start) {
    Args a;
    for (int i = start; i < argc; ++i) {
        std::string_view f = argv[i];
        auto need = [&](const char* name) -> std::string {
            if (i + 1 >= argc) { a.error = std::string("missing value for ") + name; return {}; }
            return argv[++i];
        };
        if (f == "--dialect") a.dialects = parseDialects(need("--dialect"), &a.error);
        else if (f == "--objects") a.objectsFile = need("--objects");
        else if (f == "--json") a.json = true;
        else if (f == "--no-design") a.noDesign = true;
        else if (f == "-Werror") a.warningsAreErrors = true;
        else if (!f.empty() && f[0] == '-') { a.error = std::string("unknown flag: ") + std::string(f); break; }
        else if (a.input.empty()) a.input = f;
        if (!a.error.empty()) break;
    }
    return a;
}

bool loadObjects(const std::string& path, sdc::DesignObjects* o, std::string* err) {
    std::ifstream in(path);
    if (!in.good()) { *err = "cannot read objects file: " + path; return false; }
    std::string kind, name;
    while (in >> kind >> name) {
        if (kind == "port") o->ports.push_back(name);
        else if (kind == "input") { o->ports.push_back(name); o->inputs.push_back(name); }
        else if (kind == "output") { o->ports.push_back(name); o->outputs.push_back(name); }
        else if (kind == "pin") o->pins.push_back(name);
        else if (kind == "net") o->nets.push_back(name);
        else if (kind == "cell") o->cells.push_back(name);
    }
    return true;
}

std::string emitJson(const sdc::LintReport& r) {
    hdl::json::JsonWriter w;
    w.beginObject();
    w.key("findings");
    w.beginArray();
    for (const sdc::Finding& f : r.findings) {
        w.beginObject();
        w.key("rule");     w.value(f.rule);
        w.key("severity"); w.value(sdc::severityName(f.severity));
        w.key("file");     w.value(f.file);
        w.key("line");     w.value(f.line);
        w.key("column");   w.value(f.column);
        w.key("command");  w.value(f.command);
        w.key("message");  w.value(f.message);
        w.key("hint");     w.value(f.hint);
        w.endObject();
    }
    w.endArray();
    w.key("summary");
    w.beginObject();
    w.key("commands");        w.value(r.summary.commands);
    w.key("clocks");          w.value(r.summary.clocks);
    w.key("generatedClocks"); w.value(r.summary.generatedClocks);
    w.key("exceptions");      w.value(r.summary.exceptions);
    w.key("ioDelays");        w.value(r.summary.ioDelays);
    w.key("designAware");     w.value(r.summary.designAware);
    w.key("tclAvailable");    w.value(r.summary.tclAvailable);
    w.key("errors");   w.value(r.count(sdc::Severity::Error));
    w.key("warnings"); w.value(r.count(sdc::Severity::Warning));
    w.endObject();
    w.endObject();
    return w.str();
}

/// Compiler-style so editors and CI log scrapers can jump straight to the line.
void emitText(const sdc::LintReport& r) {
    for (const sdc::Finding& f : r.findings) {
        std::printf("%s:%d: %s: %s [%s]\n", f.file.c_str(), f.line,
                    sdc::severityName(f.severity), f.message.c_str(), f.rule.c_str());
        if (!f.hint.empty()) std::printf("    hint: %s\n", f.hint.c_str());
    }
}

}  // namespace

int main(int argc, char** argv) {
    if (argc >= 2 && std::string_view(argv[1]) == "--version") {
        std::printf("sdc-core 0.1.0 (SDC syntax/semantic checker, %s)\n",
                    sdc::lintAvailable() ? "Tcl embedded" : "NO Tcl — checks disabled");
        return 0;
    }
    if (argc < 3 || std::string_view(argv[1]) != "check") {
        std::fprintf(stderr,
                     "usage: sdclint check <file.sdc> [--dialect generic|dc|genus|all[,...]]\n"
                     "                                [--objects <file>] [--no-design] [--json] [-Werror]\n");
        return 2;
    }
    Args a = parseArgs(argc, argv, 2);
    if (!a.error.empty()) { std::fprintf(stderr, "%s\n", a.error.c_str()); return 2; }
    if (a.input.empty()) { std::fprintf(stderr, "missing <file.sdc>\n"); return 2; }

    sdc::DesignObjects objs;
    if (!a.objectsFile.empty()) {
        std::string err;
        if (!loadObjects(a.objectsFile, &objs, &err)) { std::fprintf(stderr, "%s\n", err.c_str()); return 2; }
    }
    sdc::LintOptions opt;
    opt.dialects = a.dialects;
    opt.designAware = !a.noDesign;

    const sdc::LintReport rep = sdc::lintFile(a.input, opt, objs);
    if (a.json) {
        const std::string j = emitJson(rep);
        std::fwrite(j.data(), 1, j.size(), stdout);
        std::fputc('\n', stdout);
    } else {
        emitText(rep);
    }

    const int errors = rep.count(sdc::Severity::Error);
    const int warns = rep.count(sdc::Severity::Warning);
    std::fprintf(stderr,
                 "SDC: %d commands, %d clocks (%d generated), %d exceptions, %d I/O delays; "
                 "design-aware=%s — %d error(s), %d warning(s)\n",
                 rep.summary.commands, rep.summary.clocks, rep.summary.generatedClocks,
                 rep.summary.exceptions, rep.summary.ioDelays,
                 rep.summary.designAware ? "yes" : "no", errors, warns);
    return (errors || (a.warningsAreErrors && warns)) ? 1 : 0;
}
