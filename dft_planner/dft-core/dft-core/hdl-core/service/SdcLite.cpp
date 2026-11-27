#include "service/SdcLite.h"

#include <cctype>
#include <fstream>
#include <sstream>

namespace hdl::service {

namespace {

// Split one logical SDC command into whitespace tokens, flattening [get_ports {a b}] /
// [get_pins ...] / [list ...] into their member names and dropping the brackets/braces.
// Good enough for clock extraction; NOT a Tcl evaluator (no $vars, no nested commands).
std::vector<std::string> tokenizeCmd(const std::string& line) {
    std::vector<std::string> out;
    std::string cur;
    auto flush = [&] {
        if (cur.empty()) return;
        // strip Tcl accessor words — their arguments are what we want
        if (cur != "[get_ports" && cur != "[get_pins" && cur != "[get_clocks" &&
            cur != "[list" && cur != "get_ports" && cur != "get_pins" &&
            cur != "get_clocks" && cur != "list") {
            // trim residual brackets/braces/quotes
            std::string t;
            for (char c : cur)
                if (c != '[' && c != ']' && c != '{' && c != '}' && c != '"') t += c;
            if (!t.empty()) out.push_back(t);
        }
        cur.clear();
    };
    for (char c : line) {
        if (std::isspace(static_cast<unsigned char>(c))) flush();
        else cur += c;
    }
    flush();
    return out;
}

double toNum(const std::string& s) {
    try { return std::stod(s); } catch (...) { return 0.0; }
}

}  // namespace

SdcInfo parseSdcText(const std::string& text) {
    SdcInfo info;

    // 1. logical lines: strip comments, join "\" continuations
    std::vector<std::string> lines;
    {
        std::istringstream is(text);
        std::string raw, acc;
        while (std::getline(is, raw)) {
            if (!raw.empty() && raw.back() == '\r') raw.pop_back();
            const std::size_t hash = raw.find('#');
            if (hash != std::string::npos) raw.erase(hash);
            bool cont = false;
            std::string t = raw;
            while (!t.empty() && std::isspace(static_cast<unsigned char>(t.back()))) t.pop_back();
            if (!t.empty() && t.back() == '\\') { t.pop_back(); cont = true; }
            acc += t + " ";
            if (!cont) {
                if (acc.find_first_not_of(' ') != std::string::npos) lines.push_back(acc);
                acc.clear();
            }
        }
        if (acc.find_first_not_of(' ') != std::string::npos) lines.push_back(acc);
    }

    // 2. pick out the commands we understand
    for (const std::string& ln : lines) {
        const std::vector<std::string> tok = tokenizeCmd(ln);
        if (tok.empty()) continue;
        const std::string& cmd = tok[0];

        if (cmd == "create_clock" || cmd == "create_generated_clock") {
            SdcClock ck;
            ck.generated = (cmd == "create_generated_clock");
            for (std::size_t i = 1; i < tok.size(); ++i) {
                const std::string& t = tok[i];
                if (t == "-name" && i + 1 < tok.size()) ck.name = tok[++i];
                else if (t == "-period" && i + 1 < tok.size()) ck.period = toNum(tok[++i]);
                else if (t == "-source" && i + 1 < tok.size()) ck.source = tok[++i];
                else if (t == "-waveform") {
                    // consume the numeric waveform args
                    while (i + 1 < tok.size() && (std::isdigit(static_cast<unsigned char>(tok[i + 1][0])) ||
                                                  tok[i + 1][0] == '.'))
                        ++i;
                } else if (t == "-divide_by" || t == "-multiply_by" || t == "-duty_cycle") {
                    if (i + 1 < tok.size()) ++i;
                } else if (t == "-add" || t == "-invert" || t == "-combinational") {
                    // flags, no argument
                } else if (!t.empty() && t[0] == '-') {
                    if (i + 1 < tok.size() && tok[i + 1][0] != '-') ++i;  // unknown option+arg
                } else {
                    ck.targets.push_back(t);
                }
            }
            if (ck.name.empty() && !ck.targets.empty()) ck.name = ck.targets.front();
            if (ck.targets.empty() && !ck.generated)
                info.errors.push_back("create_clock without target: " + ln);
            else
                info.clocks.push_back(std::move(ck));
        } else if (cmd == "set_case_analysis" && tok.size() >= 3) {
            const int v = (tok[1] == "1") ? 1 : 0;
            for (std::size_t i = 2; i < tok.size(); ++i) info.cases.push_back({tok[i], v});
        }
    }
    return info;
}

SdcInfo parseSdcFile(const std::string& path) {
    std::ifstream f(path);
    if (!f) {
        SdcInfo info;
        info.errors.push_back("cannot read SDC file: " + path);
        return info;
    }
    std::ostringstream ss;
    ss << f.rdbuf();
    return parseSdcText(ss.str());
}

}  // namespace hdl::service
