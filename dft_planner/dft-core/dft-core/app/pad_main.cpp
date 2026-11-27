#include <cstdio>
#include <exception>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <string_view>

#include "celllib.h"
#include "extract.h"
#include "gen.h"
#include "json/JsonValue.h"
#include "json/JsonWriter.h"
#include "table.h"

namespace {

std::string readFile(const std::string& p, bool& ok) {
    std::ifstream in(p);
    ok = in.good();
    std::stringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

struct Args {
    std::string cmd, filelist, lib, config, level, aux;
    bool json = false;
};

bool parseArgs(int argc, char** argv, Args& a) {
    if (argc < 2) return false;
    a.cmd = argv[1];
    for (int i = 2; i < argc; ++i) {
        std::string_view s = argv[i];
        auto val = [&](std::string& dst) {
            if (i + 1 >= argc) return false;
            dst = argv[++i];
            return true;
        };
        if (s == "-f") { if (!val(a.filelist)) return false; }
        else if (s == "--lib") { if (!val(a.lib)) return false; }
        else if (s == "--config") { if (!val(a.config)) return false; }
        else if (s == "--level") { if (!val(a.level)) return false; }
        else if (s == "--aux") { if (!val(a.aux)) return false; }
        else if (s == "--json") a.json = true;
        else return false;
    }
    return true;
}

pad::ExtractResult loadTable(const Args& a) {
    if (a.lib.empty()) throw std::runtime_error("missing --lib <celllib>");
    if (a.filelist.empty()) throw std::runtime_error("missing -f <filelist>");
    bool ok = false;
    std::string libText = readFile(a.lib, ok);
    if (!ok) throw std::runtime_error("cannot read lib: " + a.lib);
    pad::CellLib lib = pad::parseCellLib(libText);
    pad::ExtractResult r = pad::extractPads(a.filelist, lib);
    if (!a.config.empty()) {
        std::string cfg = readFile(a.config, ok);
        if (!ok) throw std::runtime_error("cannot read config: " + a.config);
        pad::applyOverlay(r, cfg);
    }
    return r;
}

void writeTableJson(const pad::ExtractResult& r, hdl::json::JsonWriter& w) {
    w.beginObject();
    w.key("pads");
    w.beginArray();
    for (const auto& p : r.pads) {
        w.beginObject();
        w.key("path"); w.value(p.path);
        w.key("gpio"); w.value(p.gpio);
        w.key("cell"); w.value(p.cell);
        w.key("dir"); w.value(p.dir);
        w.key("padNet"); w.value(p.padNet);
        w.key("coreInNet"); w.value(p.coreInNet);
        w.key("coreOutNet"); w.value(p.coreOutNet);
        w.key("autoEnableNet"); w.value(p.autoEnableNet);
        w.key("bscanEn"); w.value(p.bscanEn);
        w.key("reuse"); w.value(p.reuse);
        w.key("func"); w.value(p.func);
        w.key("enable"); w.value(p.enable);
        w.endObject();
    }
    w.endArray();
    pad::SsnSummary ssn = pad::ssnSummary(r.pads);
    w.key("ssn");
    w.beginObject();
    w.key("inWidth"); w.value(ssn.inWidth);
    w.key("outWidth"); w.value(ssn.outWidth);
    w.endObject();
    w.key("warnings");
    w.beginArray();
    for (const auto& s : r.warnings) w.value(s);
    w.endArray();
    w.endObject();
}

int cmdTable(const Args& a) {
    pad::ExtractResult r = loadTable(a);
    if (a.json) {
        hdl::json::JsonWriter w;
        writeTableJson(r, w);
        std::printf("%s\n", w.str().c_str());
        return 0;
    }
    std::printf("path\tgpio\tpad\tdir\tbscan_en\treuse\tfunc\tenable\n");
    for (const auto& p : r.pads)
        std::printf("%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n", p.path.c_str(), p.gpio.c_str(),
                    p.cell.c_str(), p.dir.c_str(), p.bscanEn ? "y" : "n", p.reuse.c_str(),
                    p.func.c_str(), p.enable.c_str());
    for (const auto& s : r.warnings) std::fprintf(stderr, "WARN %s\n", s.c_str());
    return 0;
}

int cmdGen(const Args& a) {
    pad::ExtractResult r = loadTable(a);
    pad::GenOptions opts{a.level, a.aux};
    std::string outA = pad::generateAuxPorts(r.pads, opts);
    std::string outB = pad::generatePortOptions(r.pads);
    if (!outA.empty()) std::fputs(outA.c_str(), stdout);
    if (!outA.empty() && !outB.empty()) std::fputs("\n", stdout);
    if (!outB.empty()) std::fputs(outB.c_str(), stdout);
    for (const auto& s : r.warnings) std::fprintf(stderr, "WARN %s\n", s.c_str());
    return 0;
}

// NDJSON loop: {"id":N,"method":"pad.table"|"pad.generate","params":{...}} per line.
// params: filelist, lib (paths); config (INLINE overlay JSON text, optional);
//         level, aux (pad.generate only).
int cmdServe() {
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        std::string id = "null", out;
        try {
            hdl::json::Value req = hdl::json::parse(line);
            if (const auto* idv = req.find("id")) {
                if (idv->type == hdl::json::Value::Type::Int) id = std::to_string(idv->i);
                else if (idv->type == hdl::json::Value::Type::Str) {
                    hdl::json::JsonWriter iw;
                    iw.value(idv->s);
                    id = iw.str();
                }
            }
            std::string method = req.str("method");
            if (method != "pad.table" && method != "pad.generate")
                throw std::runtime_error("unknown method: " + method);
            const auto* params = req.find("params");
            if (!params) throw std::runtime_error("missing params");

            Args a;
            a.filelist = params->str("filelist");
            a.lib = params->str("lib");
            a.level = params->str("level");
            a.aux = params->str("aux");
            std::string cfgText = params->str("config");

            bool ok = false;
            std::string libText = readFile(a.lib, ok);
            if (!ok) throw std::runtime_error("cannot read lib: " + a.lib);
            pad::CellLib lib = pad::parseCellLib(libText);
            pad::ExtractResult r = pad::extractPads(a.filelist, lib);
            if (!cfgText.empty()) pad::applyOverlay(r, cfgText);

            hdl::json::JsonWriter w;
            if (method == "pad.table") {
                writeTableJson(r, w);
            } else if (method == "pad.generate") {
                pad::GenOptions opts{a.level, a.aux};
                w.beginObject();
                w.key("outputA"); w.value(pad::generateAuxPorts(r.pads, opts));
                w.key("outputB"); w.value(pad::generatePortOptions(r.pads));
                w.endObject();
            }
            out = "{\"id\":" + id + ",\"result\":" + w.str() + "}";
        } catch (const std::exception& e) {
            hdl::json::JsonWriter w;
            w.value(std::string(e.what()));
            out = "{\"id\":" + id + ",\"error\":" + w.str() + "}";
        }
        std::printf("%s\n", out.c_str());
        std::fflush(stdout);
    }
    return 0;
}

}  // namespace

int main(int argc, char** argv) {
    Args a;
    if (!parseArgs(argc, argv, a)) {
        std::fprintf(stderr,
                     "usage: pad table -f <filelist> --lib <celllib> [--config <overlay.json>] [--json]\n"
                     "       pad gen   -f <filelist> --lib <celllib> [--config <overlay.json>]"
                     " --level chip|phy|sub [--aux external|internal]\n"
                     "       pad serve\n");
        return 2;
    }
    try {
        if (a.cmd == "table") return cmdTable(a);
        if (a.cmd == "gen") return cmdGen(a);
        if (a.cmd == "serve") return cmdServe();
    } catch (const std::exception& e) {
        std::fprintf(stderr, "pad: %s\n", e.what());
        return 2;
    }
    std::fprintf(stderr, "pad: unknown command '%s'\n", a.cmd.c_str());
    return 2;
}
