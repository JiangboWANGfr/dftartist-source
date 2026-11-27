#include "celllib.h"

#include <cctype>
#include <stdexcept>

namespace pad {

namespace {

[[noreturn]] void fail(const std::string& why) { throw std::runtime_error("celllib: " + why); }

// ---- tokenizer: idents + single punct chars; skips ws and // and /* */ comments ----
struct Lexer {
    const std::string& t;
    size_t p = 0;
    explicit Lexer(const std::string& text) : t(text) {}

    void skipWs() {
        while (p < t.size()) {
            char c = t[p];
            if (std::isspace(static_cast<unsigned char>(c))) { ++p; continue; }
            if (c == '/' && p + 1 < t.size() && t[p + 1] == '/') {
                while (p < t.size() && t[p] != '\n') ++p;
                continue;
            }
            if (c == '/' && p + 1 < t.size() && t[p + 1] == '*') {
                p += 2;
                while (p + 1 < t.size() && !(t[p] == '*' && t[p + 1] == '/')) ++p;
                p = (p + 1 < t.size()) ? p + 2 : t.size();
                continue;
            }
            break;
        }
    }
    static bool identChar(char c) {
        return std::isalnum(static_cast<unsigned char>(c)) || c == '_' || c == '.' ||
               c == '[' || c == ']' || c == '"';
    }
    std::string next() {  // "" at end of input
        skipWs();
        if (p >= t.size()) return "";
        char c = t[p];
        if (identChar(c)) {
            size_t s = p;
            while (p < t.size() && identChar(t[p])) ++p;
            return t.substr(s, p - s);
        }
        ++p;
        return std::string(1, c);
    }
    std::string peek() {
        size_t save = p;
        std::string tok = next();
        p = save;
        return tok;
    }
};

// skip a balanced (...) block; opening '(' already consumed
void skipBalanced(Lexer& lx) {
    int depth = 1;
    while (depth > 0) {
        std::string tok = lx.next();
        if (tok.empty()) fail("unexpected EOF in (...) block");
        if (tok == "(") ++depth;
        else if (tok == ")") --depth;
    }
}

void skipToSemi(Lexer& lx) {
    while (true) {
        std::string tok = lx.next();
        if (tok.empty() || tok == ";") return;
        if (tok == "(") skipBalanced(lx);  // defensive
    }
}

CellPin* findPin(CellDef& d, const std::string& name) {
    for (auto& pin : d.pins)
        if (pin.name == name) return &pin;
    return nullptr;
}
CellPin& getPin(CellDef& d, const std::string& name) {
    if (CellPin* pin = findPin(d, name)) return *pin;
    d.pins.push_back(CellPin{name, "", {}});
    return d.pins.back();
}

// mode( pin (NAME) (attr; attr = v; ...) ... ) — opening '(' of mode already consumed
void parseMode(Lexer& lx, CellDef& d) {
    while (true) {
        std::string tok = lx.next();
        if (tok.empty()) fail(d.name + ": unexpected EOF in mode()");
        if (tok == ")") return;
        if (tok != "pin") {
            if (tok == "(") skipBalanced(lx);
            continue;
        }
        if (lx.next() != "(") fail(d.name + ": expected '(' after pin");
        std::string pname = lx.next();
        if (lx.next() != ")") fail(d.name + ": expected ')' after pin name");
        if (lx.next() != "(") fail(d.name + ": expected attr block after pin (" + pname + ")");
        CellPin& pin = getPin(d, pname);
        while (true) {
            std::string a = lx.next();
            if (a.empty()) fail(d.name + ": unexpected EOF in pin attrs");
            if (a == ")") break;
            if (a == ";") continue;
            pin.attrs.push_back(a);
            if (lx.peek() == "=") skipToSemi(lx);  // attr = value ...;
        }
    }
}

// model NAME (ports) ( body )
CellDef parseModel(Lexer& lx) {
    CellDef d;
    d.name = lx.next();
    if (d.name.empty() || d.name == "(") fail("model missing name");
    if (lx.next() != "(") fail(d.name + ": expected port list");
    while (true) {
        std::string tok = lx.next();
        if (tok.empty()) fail(d.name + ": unexpected EOF in port list");
        if (tok == ")") break;
        if (tok == ",") continue;
        d.pins.push_back(CellPin{tok, "", {}});
    }
    if (lx.next() != "(") fail(d.name + ": expected model body");
    while (true) {
        std::string tok = lx.next();
        if (tok.empty()) fail(d.name + ": unexpected EOF in model body");
        if (tok == ")") break;  // end of model
        if (tok == "cell_type") {
            if (lx.next() != "=") fail(d.name + ": expected '=' after cell_type");
            d.cellType = lx.next();
            skipToSemi(lx);
        } else if (tok == "mode") {
            if (lx.next() != "(") fail(d.name + ": expected '(' after mode");
            parseMode(lx, d);
        } else if (tok == "input" || tok == "output" || tok == "inout") {
            std::string dir = tok == "input" ? "in" : tok == "output" ? "out" : "inout";
            if (lx.next() != "(") fail(d.name + ": expected '(' after " + tok);
            while (true) {
                std::string n = lx.next();
                if (n.empty()) fail(d.name + ": unexpected EOF in " + tok + " list");
                if (n == ")") break;
                if (n == ",") continue;
                getPin(d, n).dir = dir;
            }
            if (lx.peek() == "(") {  // optional per-pin attr block: input (v) ( unused; ... )
                lx.next();
                skipBalanced(lx);
            }
        } else if (tok == "(") {
            skipBalanced(lx);  // structure block (instances / primitives)
        } else {
            if (lx.peek() == "=") skipToSemi(lx);  // key = value;  (else: stray ';' etc, ignore)
        }
    }
    return d;
}

}  // namespace

CellLib parseCellLib(const std::string& text) {
    CellLib lib;
    Lexer lx(text);
    while (true) {
        std::string tok = lx.next();
        if (tok.empty()) break;
        if (tok == "model") {
            lib.cells.push_back(parseModel(lx));
        } else if (tok == "(") {
            skipBalanced(lx);  // dft_cell_selection ( name ) ( ... ) etc.
        } else if (lx.peek() == "=") {
            skipToSemi(lx);  // library_format_version = 9;
        }
    }
    return lib;
}

std::map<std::string, PadCellInfo> buildPadDict(const CellLib& lib) {
    std::map<std::string, PadCellInfo> dict;
    for (const CellDef& c : lib.cells) {
        if (c.cellType != "pad") continue;
        PadCellInfo info;
        info.cell = c.name;
        for (const CellPin& p : c.pins) {
            for (const std::string& a : p.attrs) {
                if (a == "pad_from_io") { info.dir = "in"; info.padPin = p.name; }
                else if (a == "pad_to_io") { info.dir = "out"; info.padPin = p.name; }
                else if (a == "pad_pad_io") { info.dir = "inout"; info.padPin = p.name; }
                else if (a == "pad_from_pad") info.coreOutPin = p.name;
                else if (a == "pad_to_pad") info.coreInPin = p.name;
                else if (a == "pad_enable_high") { info.enablePin = p.name; info.enablePolarity = "high"; }
                else if (a == "pad_enable_low") { info.enablePin = p.name; info.enablePolarity = "low"; }
                else if (a == "pad_pull0") info.pull = "pull0";
                else if (a == "pad_pull1") info.pull = "pull1";
            }
        }
        if (info.dir.empty() || info.padPin.empty()) continue;  // malformed pad: skip (P1)
        dict.emplace(c.name, std::move(info));
    }
    return dict;
}

}  // namespace pad
