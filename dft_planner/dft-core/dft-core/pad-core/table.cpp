#include "table.h"

#include <stdexcept>

#include "json/JsonValue.h"  // header-only parser shared from hdl-core

namespace pad {

namespace {
using hdl::json::Value;

[[noreturn]] void fail(const std::string& why) { throw std::runtime_error("pad overlay: " + why); }

bool parseYesNo(const std::string& s, const std::string& path) {
    if (s == "yes" || s == "y") return true;
    if (s == "no" || s == "n") return false;
    fail(path + ": bscan_en must be yes|no");
}
}  // namespace

void applyOverlay(ExtractResult& r, const std::string& jsonText) {
    Value v = hdl::json::parse(jsonText);
    const Value* pads = v.find("pads");
    if (!pads || pads->type != Value::Type::Object) fail("missing 'pads' object");
    for (const auto& [path, cfg] : pads->obj) {
        PadInstance* row = nullptr;
        for (auto& p : r.pads)
            if (p.path == path) { row = &p; break; }
        if (!row) fail("unknown pad path '" + path + "'");
        if (cfg.type != Value::Type::Object) fail(path + ": entry must be an object");
        for (const auto& [k, val] : cfg.obj) {
            if (val.type != Value::Type::Str) fail(path + ": '" + k + "' must be a string");
            if (k == "bscan_en") {
                row->bscanEn = parseYesNo(val.s, path);
            } else if (k == "reuse") {
                if (val.s != "in" && val.s != "out") fail(path + ": reuse must be in|out");
                if (row->dir != "inout") fail(path + ": reuse only applies to inout pads");
                row->reuse = val.s;
            } else if (k == "func") {
                row->func = val.s;
            } else if (k == "enable") {
                row->enable = val.s;
            } else {
                fail(path + ": unknown key '" + k + "'");
            }
        }
        if (row->func == "ssn" && row->dir == "inout" && row->reuse.empty())
            fail(path + ": func=ssn on an inout pad requires reuse");
    }
}

SsnSummary ssnSummary(const std::vector<PadInstance>& rows) {
    SsnSummary s;
    for (const auto& r : rows) {
        if (r.func != "ssn") continue;
        std::string eff = r.dir == "inout" ? r.reuse : r.dir;
        if (eff == "in") ++s.inWidth;
        else if (eff == "out") ++s.outWidth;
    }
    return s;
}

}  // namespace pad
