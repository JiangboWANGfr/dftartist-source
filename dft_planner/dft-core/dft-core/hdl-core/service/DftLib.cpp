#include "service/DftLib.h"

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <fstream>
#include <sstream>

namespace hdl::service {

namespace {

std::string trim(std::string s) {
    const auto a = s.find_first_not_of(" \t\r\n");
    if (a == std::string::npos) return {};
    const auto b = s.find_last_not_of(" \t\r\n");
    return s.substr(a, b - a + 1);
}

/// Strip // and -- comments outside of quotes, and /* */ blocks (state carried by `inBlock`).
std::string stripComments(const std::string& line, bool& inBlock) {
    std::string out;
    for (std::size_t i = 0; i < line.size(); ++i) {
        if (inBlock) {
            if (line[i] == '*' && i + 1 < line.size() && line[i + 1] == '/') { inBlock = false; ++i; }
            continue;
        }
        if (line[i] == '/' && i + 1 < line.size() && line[i + 1] == '/') break;
        if (line[i] == '/' && i + 1 < line.size() && line[i + 1] == '*') { inBlock = true; ++i; continue; }
        out += line[i];
    }
    return out;
}

/// Expand a possibly-globbed path (only `*` in the final component, which is all these use).
std::vector<std::string> expandGlob(const std::string& p) {
    namespace fs = std::filesystem;
    if (p.find('*') == std::string::npos) return {p};
    std::vector<std::string> hits;
    try {
        const fs::path pp(p);
        const fs::path dir = pp.parent_path();
        const std::string pat = pp.filename().string();
        const std::size_t star = pat.find('*');
        const std::string pre = pat.substr(0, star), suf = pat.substr(star + 1);
        if (!fs::is_directory(dir)) return {};
        for (const auto& e : fs::directory_iterator(dir)) {
            const std::string fn = e.path().filename().string();
            if (fn.size() >= pre.size() + suf.size() &&
                fn.compare(0, pre.size(), pre) == 0 &&
                (suf.empty() || fn.compare(fn.size() - suf.size(), suf.size(), suf) == 0))
                hits.push_back(e.path().string());
        }
    } catch (...) {
    }
    std::sort(hits.begin(), hits.end());
    return hits;
}

/// Normalize a Tessent cell_type to the role the clock-tree view draws.
std::string roleOf(const std::string& cellType) {
    auto has = [&](const char* s) { return cellType.find(s) != std::string::npos; };
    if (has("clock_gating")) return "icg";
    if (has("clock_mux")) return "mux";
    if (has("clock_buffer")) return "buf";
    if (has("clock_inverter")) return "inv";
    if (has("clock_shaper")) return "shaper";
    if (has("clock_and") || has("clock_or")) return "gate";
    if (has("scan_cell") || has("_dff") || has("dff")) return "dff";
    if (has("latch")) return "latch";
    if (cellType == "mux") return "mux";
    if (cellType == "buffer") return "buf";
    if (cellType == "inverter") return "inv";
    return "other";
}

}  // namespace

std::vector<std::string> cellLibPathsFromSetting(const std::string& yamlPath,
                                                 std::vector<std::string>& errors) {
    std::ifstream f(yamlPath);
    if (!f) {
        errors.push_back("cannot read dft_lib_setting.yaml: " + yamlPath);
        return {};
    }
    std::vector<std::string> out;
    std::string line;
    while (std::getline(f, line)) {
        const std::string t = trim(line);
        if (t.empty() || t[0] == '#') continue;   // commented-out library lines are inactive
        // `read_cell_library <path> [options]` — the token after the command is the file.
        const std::size_t k = t.find("read_cell_library");
        if (k == std::string::npos) continue;
        if (k > 0 && t[k - 1] == '#') continue;
        std::istringstream is(t.substr(k));
        std::string cmd, path;
        is >> cmd >> path;
        if (path.empty() || path[0] == '-') continue;
        for (auto& g : expandGlob(path)) out.push_back(g);
        if (path.find('*') == std::string::npos) { /* kept above */ }
    }
    // de-dup, preserve order
    std::vector<std::string> uniq;
    for (auto& p : out)
        if (std::find(uniq.begin(), uniq.end(), p) == uniq.end()) uniq.push_back(p);
    return uniq;
}

void parseTcelllibText(const std::string& text, DftLibResult& out) {
    std::istringstream is(text);
    std::string raw;
    bool inBlock = false;
    ClockCell cur;
    bool inModel = false;
    int depth = 0;   // paren depth inside the current model

    auto flush = [&] {
        if (inModel && !cur.name.empty() && !cur.cellType.empty()) {
            cur.role = roleOf(cur.cellType);
            cur.inverting = cur.cellType.find("inverter") != std::string::npos ||
                            cur.cellType.find("_inv") != std::string::npos;
            // Only cells that actually sit on a clock path are worth recording.
            if (!cur.clockIn.empty() || !cur.clockOut.empty() || !cur.muxSel.empty() ||
                cur.role != "other")
                out.cells[cur.name] = cur;
        }
        cur = ClockCell{};
        inModel = false;
        depth = 0;
    };

    while (std::getline(is, raw)) {
        const std::string line = stripComments(raw, inBlock);
        const std::string t = trim(line);
        if (t.empty()) continue;

        if (t.rfind("model ", 0) == 0) {
            flush();
            inModel = true;
            std::istringstream ls(t);
            std::string kw;
            ls >> kw >> cur.name;
            // `model foo (a,b)` — strip a trailing paren glued to the name
            const std::size_t p = cur.name.find('(');
            if (p != std::string::npos) cur.name = cur.name.substr(0, p);
            continue;
        }
        if (!inModel) continue;

        if (t.rfind("cell_type", 0) == 0) {
            const std::size_t eq = t.find('=');
            if (eq != std::string::npos) {
                std::string v = trim(t.substr(eq + 1));
                if (!v.empty() && v.back() == ';') v.pop_back();
                cur.cellType = trim(v);
            }
            continue;
        }
        // `input (CK) ( clock_in; )` / `output (GCK) ( clock_out; )`
        const bool isIn = t.rfind("input", 0) == 0;
        const bool isOut = t.rfind("output", 0) == 0;
        if (isIn || isOut) {
            const std::size_t o1 = t.find('('), c1 = t.find(')');
            if (o1 == std::string::npos || c1 == std::string::npos || c1 < o1) continue;
            const std::string pin = trim(t.substr(o1 + 1, c1 - o1 - 1));
            const std::string attrs = t.substr(c1 + 1);
            auto hasAttr = [&](const char* a) { return attrs.find(a) != std::string::npos; };
            if (hasAttr("clock_in")) cur.clockIn.push_back(pin);
            else if (hasAttr("clock_out")) cur.clockOut = pin;
            else if (hasAttr("mux_select")) cur.muxSel = pin;
            else if (hasAttr("mux_in0")) cur.muxIn0 = pin;
            else if (hasAttr("mux_in1")) cur.muxIn1 = pin;
            // `func_enable_inv` / `test_enable_inv` gate on 0, not 1 — keep them apart.
            else if (hasAttr("test_enable_inv") || hasAttr("func_enable_inv")) cur.enableInv.push_back(pin);
            else if (hasAttr("test_enable") || hasAttr("func_enable")) cur.enable.push_back(pin);
            // a plain clock pin on a flop/latch is still the pin to walk through
            else if (hasAttr("active_high_clock") || hasAttr("active_low_clock")) cur.clockIn.push_back(pin);
            continue;
        }
        if (t.rfind("end model", 0) == 0 || t.find("// end model") != std::string::npos) flush();
    }
    flush();
}

DftLibResult loadDftLib(const std::string& yamlPath) {
    DftLibResult r;
    r.libFiles = cellLibPathsFromSetting(yamlPath, r.errors);
    for (const std::string& p : r.libFiles) {
        std::ifstream f(p);
        if (!f) { r.missing.push_back(p); continue; }
        std::ostringstream ss;
        ss << f.rdbuf();
        parseTcelllibText(ss.str(), r);
    }
    return r;
}

}  // namespace hdl::service
