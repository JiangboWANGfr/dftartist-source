#include "lint.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <sstream>

#include "spec.h"

#ifdef SDC_HAVE_TCL

#include <tcl.h>

#include <deque>
#include <map>
#include <set>

namespace sdc {
namespace {

// ---- small text helpers -----------------------------------------------------------------------

std::vector<std::string> splitLines(const std::string& text) {
    std::vector<std::string> out;
    std::string cur;
    for (char c : text) {
        if (c == '\n') {
            out.push_back(cur);
            cur.clear();
        } else {
            cur += c;
        }
    }
    if (!cur.empty()) out.push_back(cur);
    return out;
}

bool isBlankScript(const std::string& s) {
    for (char c : s)
        if (!std::isspace(static_cast<unsigned char>(c))) return false;
    return true;
}

std::string dirOf(const std::string& path) {
    const size_t p = path.find_last_of("/\\");
    return p == std::string::npos ? std::string() : path.substr(0, p);
}

/// A word is an option only if it starts with '-' and is NOT a number: `set_input_delay -2.5`
/// passes a negative delay, not a flag, and misreading it cascades into bogus findings.
bool looksLikeOption(const std::string& s) {
    if (s.size() < 2 || s[0] != '-') return false;
    char* end = nullptr;
    std::strtod(s.c_str(), &end);
    if (end && *end == '\0') return false;   // fully numeric
    return std::isalpha(static_cast<unsigned char>(s[1])) != 0;
}

int levenshtein(const std::string& a, const std::string& b) {
    std::vector<int> prev(b.size() + 1), cur(b.size() + 1);
    for (size_t j = 0; j <= b.size(); ++j) prev[j] = static_cast<int>(j);
    for (size_t i = 1; i <= a.size(); ++i) {
        cur[0] = static_cast<int>(i);
        for (size_t j = 1; j <= b.size(); ++j)
            cur[j] = std::min({prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] != b[j - 1])});
        prev = cur;
    }
    return prev[b.size()];
}

/// "did you mean -rise_from?" — only offered when the edit distance is small enough that the
/// suggestion is almost certainly what was meant; a wrong guess is worse than none.
std::string closest(const std::string& word, const std::vector<std::string>& pool) {
    const int limit = word.size() <= 5 ? 1 : (word.size() <= 10 ? 2 : 3);
    std::string best;
    int bestD = limit + 1;
    for (const std::string& c : pool) {
        const int d = levenshtein(word, c);
        if (d < bestD) { bestD = d; best = c; }
    }
    return bestD <= limit ? best : std::string();
}

bool hasWildcard(const std::string& s) { return s.find_first_of("*?[") != std::string::npos; }

// ---- linter state -----------------------------------------------------------------------------

struct Ref {                 // a clock referenced before/without being defined
    std::string pattern;
    std::string file;
    int line = 0;
    std::string where;       // "get_clocks" / "-master_clock" / "-clock"
};

struct Mcp {                 // one multicycle exception, keyed by its endpoint tuple
    std::string endpoints;   // "-from{...}-to{...}" — identical tuple == same path set
    bool hold = false;       // -hold given (vs -setup)
    std::string file;
    int line = 0;
};

struct Ctx;
struct Binding {             // ClientData for the generic command callback
    Ctx* ctx = nullptr;
    const CommandSpec* spec = nullptr;
};

struct Ctx {
    LintReport rep;
    LintOptions opt;
    const DesignObjects* objs = nullptr;
    Tcl_Interp* ip = nullptr;

    std::string file;        // file the current chunk came from
    int line = 0;            // first line of the current chunk
    std::string chunkText;   // the chunk itself, so nested bodies can locate their own lines

    std::vector<ResolvedClock> clocks;
    std::vector<Ref> refs;
    std::vector<Mcp> mcps;
    std::deque<Binding> bindings;   // deque: addresses handed to Tcl must stay stable
    std::vector<std::string> sourceStack;
    std::set<std::string> reportedUnknown;
    std::set<std::string> echoed;   // `puts` texts already surfaced, so a loop reports once
    int echoes = 0;

    void report(Severity sev, const std::string& rule, const std::string& cmd,
                const std::string& msg, const std::string& hint = "", int lineOverride = 0) {
        if (static_cast<int>(rep.findings.size()) >= opt.maxFindings) return;
        Finding f;
        f.rule = rule;
        f.severity = sev;
        f.file = file;
        f.line = lineOverride > 0 ? lineOverride : line;
        f.command = cmd;
        f.message = msg;
        f.hint = hint;
        rep.findings.push_back(std::move(f));
    }
};

// ---- object resolution (the design-aware layer) -----------------------------------------------

std::vector<std::string> resolvePatterns(const std::vector<std::string>& pool,
                                         const std::vector<std::string>& pats, bool* anyMissed,
                                         std::string* firstMissed) {
    std::vector<std::string> out;
    auto push = [&out](const std::string& n) {
        if (std::find(out.begin(), out.end(), n) == out.end()) out.push_back(n);
    };
    for (const std::string& p : pats) {
        bool any = false;
        for (const std::string& n : pool)
            if (Tcl_StringMatch(n.c_str(), p.c_str())) { push(n); any = true; }
        if (!any) {
            // Keep the literal so later commands still see a target; the miss is reported once.
            push(p);
            if (anyMissed && !*anyMissed) { *anyMissed = true; if (firstMissed) *firstMissed = p; }
            else if (anyMissed) *anyMissed = true;
        }
    }
    return out;
}

Tcl_Obj* listOf(const std::vector<std::string>& v) {
    Tcl_Obj* l = Tcl_NewListObj(0, nullptr);
    for (const std::string& s : v)
        Tcl_ListObjAppendElement(nullptr, l, Tcl_NewStringObj(s.c_str(), -1));
    return l;
}

void flatten(Tcl_Interp* ip, Tcl_Obj* o, std::vector<std::string>& out) {
    int n = 0;
    Tcl_Obj** el = nullptr;
    if (Tcl_ListObjGetElements(ip, o, &n, &el) == TCL_OK && n > 0) {
        for (int i = 0; i < n; ++i) out.emplace_back(Tcl_GetString(el[i]));
        return;
    }
    const char* s = Tcl_GetString(o);
    if (s && *s) out.emplace_back(s);
}

/// SDC writes hierarchical names with '/', the design model uses '.'. Accept either spelling.
std::string toDotPath(std::string s) {
    for (char& c : s)
        if (c == '/') c = '.';
    return s;
}

// ---- value type checking ----------------------------------------------------------------------

/// "10ns" / "48 ns" / "100MHz": a number with a unit glued on. SDC values are UNITLESS — they are
/// in the design's time unit (set_units / the library) — so this is a hard error in every tool,
/// and it is worth naming precisely instead of "expected a number".
bool looksLikeUnitSuffix(const std::string& s) {
    size_t i = 0;
    if (i < s.size() && (s[i] == '+' || s[i] == '-')) ++i;
    const size_t digits = i;
    while (i < s.size() && (std::isdigit(static_cast<unsigned char>(s[i])) || s[i] == '.')) ++i;
    if (i == digits || i == s.size()) return false;
    std::string suffix = s.substr(i);
    for (char& c : suffix) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    while (!suffix.empty() && std::isspace(static_cast<unsigned char>(suffix.front())))
        suffix.erase(suffix.begin());
    for (const char* u : {"s", "ms", "us", "ns", "ps", "fs", "hz", "khz", "mhz", "ghz",
                          "f", "pf", "nf", "uf", "v", "mv", "a", "ma", "ohm"})
        if (suffix == u) return true;
    return false;
}

bool parseDouble(const std::string& s, double* out) {
    if (s.empty()) return false;
    char* end = nullptr;
    const double v = std::strtod(s.c_str(), &end);
    if (!end || *end != '\0') return false;
    *out = v;
    return true;
}

bool parseLong(const std::string& s, long* out) {
    if (s.empty()) return false;
    char* end = nullptr;
    const long v = std::strtol(s.c_str(), &end, 10);
    if (!end || *end != '\0') return false;
    *out = v;
    return true;
}

bool enumHas(const std::string& values, const std::string& v) {
    std::istringstream is(values);
    std::string t;
    while (is >> t)
        if (t == v) return true;
    return false;
}

/// Validate one argument against its declared grammar. `label` names it for the message
/// ("-period" or "argument 1").
void checkValue(Ctx& ctx, const std::string& cmd, const std::string& label, ArgType t,
                const std::string& values, Tcl_Obj* obj) {
    const std::string s = Tcl_GetString(obj);
    double d = 0;
    long l = 0;
    // Report a unit suffix once, precisely, instead of letting each numeric case say the
    // uninformative "expected a number".
    switch (t) {
        case ArgType::Float:
        case ArgType::PosFloat:
        case ArgType::NonNegFloat:
        case ArgType::Int:
        case ArgType::PosInt:
            if (looksLikeUnitSuffix(s)) {
                ctx.report(Severity::Error, "SDC-UNITS", cmd,
                           label + " has a unit attached: \"" + s + "\"",
                           "SDC values carry no units — they are in the design's time/cap unit "
                           "(see set_units and the library). Write the bare number.");
                return;
            }
            break;
        default:
            break;
    }
    switch (t) {
        case ArgType::Float:
            if (!parseDouble(s, &d))
                ctx.report(Severity::Error, "SDC-VALUE", cmd,
                           label + " expects a number, got \"" + s + "\"");
            break;
        case ArgType::PosFloat:
            if (!parseDouble(s, &d))
                ctx.report(Severity::Error, "SDC-VALUE", cmd,
                           label + " expects a number, got \"" + s + "\"");
            else if (d <= 0)
                ctx.report(Severity::Error, "SDC-VALUE", cmd,
                           label + " must be greater than 0, got " + s,
                           "a zero or negative value here makes every path through it meaningless");
            break;
        case ArgType::NonNegFloat:
            if (!parseDouble(s, &d))
                ctx.report(Severity::Error, "SDC-VALUE", cmd,
                           label + " expects a number, got \"" + s + "\"");
            else if (d < 0)
                ctx.report(Severity::Error, "SDC-VALUE", cmd,
                           label + " must not be negative, got " + s);
            break;
        case ArgType::Int:
            if (!parseLong(s, &l))
                ctx.report(Severity::Error, "SDC-VALUE", cmd,
                           label + " expects an integer, got \"" + s + "\"");
            break;
        case ArgType::PosInt:
            if (!parseLong(s, &l))
                ctx.report(Severity::Error, "SDC-VALUE", cmd,
                           label + " expects an integer, got \"" + s + "\"");
            else if (l <= 0)
                ctx.report(Severity::Error, "SDC-VALUE", cmd,
                           label + " must be greater than 0, got " + s);
            break;
        case ArgType::FloatList:
        case ArgType::IntList: {
            std::vector<std::string> el;
            flatten(ctx.ip, obj, el);
            if (el.empty()) {
                ctx.report(Severity::Error, "SDC-VALUE", cmd, label + " expects a non-empty list");
                break;
            }
            for (const std::string& e : el) {
                const bool ok = (t == ArgType::IntList) ? parseLong(e, &l) : parseDouble(e, &d);
                if (!ok) {
                    ctx.report(Severity::Error, "SDC-VALUE", cmd,
                               label + " expects " + argTypeName(t) + ", but \"" + e +
                                   "\" is not one");
                    break;
                }
            }
            break;
        }
        case ArgType::Enum:
            if (!values.empty() && !enumHas(values, s))
                ctx.report(Severity::Error, "SDC-VALUE", cmd,
                           label + " must be one of {" + values + "}, got \"" + s + "\"");
            break;
        case ArgType::Objects:
        case ArgType::ClockRef:
        case ArgType::Str:
            // Deliberately unchecked: a nested [get_*] that legitimately resolves to nothing is
            // routine, and warning on it drowns the report. "Matches nothing" is the job of the
            // design-aware SDC-EMPTY-MATCH check, which can actually tell.
            break;
        case ArgType::Flag:
        case ArgType::None:
            break;
    }
}

// ---- semantic recording -----------------------------------------------------------------------

struct ParsedArgs {
    std::vector<std::string> pos;              // positionals in order
    std::vector<Tcl_Obj*> posObj;
    std::map<std::string, std::string> opt;    // option -> last value ("" for flags)
    std::map<std::string, int> optCount;
    std::vector<std::string> groups;           // every -group value, for set_clock_groups
    bool has(const char* n) const { return opt.count(n) != 0; }
    std::string get(const char* n) const {
        auto it = opt.find(n);
        return it == opt.end() ? std::string() : it->second;
    }
};

void recordClock(Ctx& ctx, const CommandSpec& spec, const ParsedArgs& a) {
    const bool gen = spec.name == "create_generated_clock";
    ResolvedClock c;
    c.generated = gen;
    c.add = a.has("-add");
    c.file = ctx.file;
    c.line = ctx.line;
    c.masterClock = a.get("-master_clock");
    for (const std::string& p : a.pos) flatten(ctx.ip, Tcl_NewStringObj(p.c_str(), -1), c.targets);
    c.name = a.get("-name");
    if (c.name.empty() && !c.targets.empty()) c.name = c.targets.front();
    double d = 0;
    if (parseDouble(a.get("-period"), &d)) c.period = d;

    if (!gen) {
        if (c.targets.empty() && !a.has("-name"))
            ctx.report(Severity::Error, "SDC-CLK-VIRTUAL", spec.name,
                       "virtual clock (no source object) needs -name",
                       "a clock with neither a source object nor a name cannot be referenced later");
        // -waveform must be an even, strictly increasing edge list inside one period.
        const std::string wf = a.get("-waveform");
        if (!wf.empty()) {
            std::vector<std::string> el;
            flatten(ctx.ip, Tcl_NewStringObj(wf.c_str(), -1), el);
            std::vector<double> edges;
            bool numeric = true;
            for (const std::string& e : el) {
                double v = 0;
                if (!parseDouble(e, &v)) { numeric = false; break; }
                edges.push_back(v);
            }
            if (numeric) {
                if (edges.size() % 2 != 0)
                    ctx.report(Severity::Error, "SDC-CLK-WAVEFORM", spec.name,
                               "-waveform needs an even number of edges (rise/fall pairs), got " +
                                   std::to_string(edges.size()));
                for (size_t i = 1; i < edges.size(); ++i)
                    if (edges[i] <= edges[i - 1]) {
                        ctx.report(Severity::Error, "SDC-CLK-WAVEFORM", spec.name,
                                   "-waveform edges must strictly increase; edge " +
                                       std::to_string(i + 1) + " (" + el[i] + ") is not after " +
                                       el[i - 1]);
                        break;
                    }
                if (c.period > 0 && !edges.empty() &&
                    (edges.back() - edges.front()) > c.period + 1e-9)
                    ctx.report(Severity::Error, "SDC-CLK-WAVEFORM", spec.name,
                               "-waveform spans more than one -period",
                               "edges must fall inside a single clock period");
            }
        }
    } else {
        double dc = 0;
        if (a.has("-duty_cycle") && parseDouble(a.get("-duty_cycle"), &dc) &&
            (dc <= 0 || dc >= 100))
            ctx.report(Severity::Error, "SDC-CLK-DUTY", spec.name,
                       "-duty_cycle must be between 0 and 100 (percent), got " + a.get("-duty_cycle"));
        if (!a.has("-edges") && !a.has("-divide_by") && !a.has("-multiply_by") &&
            !a.has("-combinational"))
            ctx.report(Severity::Warning, "SDC-GENCLK-RATIO", spec.name,
                       "no -divide_by / -multiply_by / -edges given",
                       "without a ratio the generated clock defaults to divide_by 1; state it "
                       "explicitly if that is what you mean");
        if (!c.masterClock.empty())
            ctx.refs.push_back({c.masterClock, ctx.file, ctx.line, "-master_clock"});

        // Captured for the clock-generation layer (period/master inference), not for any
        // diagnostic here — -source is required by the grammar, so it is always present.
        flatten(ctx.ip, Tcl_NewStringObj(a.get("-source").c_str(), -1), c.source);
        c.invert = a.has("-invert");
        c.combinational = a.has("-combinational");
        long dv = 0;
        if (a.has("-divide_by") && parseLong(a.get("-divide_by"), &dv)) {
            c.hasDivideBy = true;
            c.divideBy = dv;
        }
        long mv = 0;
        if (a.has("-multiply_by") && parseLong(a.get("-multiply_by"), &mv)) {
            c.hasMultiplyBy = true;
            c.multiplyBy = mv;
        }
        if (a.has("-edges")) {
            std::vector<std::string> el;
            flatten(ctx.ip, Tcl_NewStringObj(a.get("-edges").c_str(), -1), el);
            std::vector<double> edges;
            bool numeric = true;
            for (const std::string& e : el) {
                double v = 0;
                if (!parseDouble(e, &v)) { numeric = false; break; }
                edges.push_back(v);
            }
            if (numeric && edges.size() >= 2) {
                c.hasEdges = true;
                c.edges = std::move(edges);
            }
        }
        c.hasEdgeShift = a.has("-edge_shift");
        if (c.hasEdgeShift && !c.hasEdges)
            ctx.report(Severity::Warning, "SDC-GENCLK-EDGESHIFT", spec.name,
                       "-edge_shift given without -edges",
                       "-edge_shift only has meaning alongside -edges; it is ignored otherwise");
    }
    ctx.clocks.push_back(std::move(c));
}

// ---- the generic command callback ---------------------------------------------------------------

// --- defined below; declared here because the command callbacks need them -----------------------
void reportTclError(Ctx& ctx, const std::string& raw, int absLine);

/// Evaluate a script one complete command at a time so every finding carries a real line.
/// `firstLine` is the absolute line of the script's first line — 1 for a file, and the line the
/// body opened on for a nested loop body. `prescan` runs the textual checks, which must happen
/// once per file and not again for each body inside it. Returns the last Tcl completion code so
/// a caller can honour `break`.
int evalScript(Ctx& ctx, const std::string& text, const std::string& file, int firstLine = 1,
               bool prescan = true);

std::vector<std::string> optionNames(const CommandSpec& spec) {
    std::vector<std::string> v;
    for (const OptionSpec& o : spec.options) v.push_back(o.name);
    return v;
}

/// Option lookup with Synopsys/Cadence-style abbreviation: any UNAMBIGUOUS prefix of an option
/// name is the option. Real constraint files lean on this constantly (`-hier`, `-of`, `-master`),
/// so a checker that demands the full spelling reports dozens of errors that no tool would.
/// `ambiguous` is filled with the candidates when a prefix matches more than one — which is a
/// genuine error the vendor tools also reject.
const OptionSpec* findOption(const CommandSpec& spec, const std::string& name,
                             std::vector<std::string>* ambiguous) {
    for (const OptionSpec& o : spec.options)
        if (o.name == name) return &o;
    const OptionSpec* hit = nullptr;
    int n = 0;
    for (const OptionSpec& o : spec.options)
        if (o.name.rfind(name, 0) == 0) { hit = &o; ++n; if (ambiguous) ambiguous->push_back(o.name); }
    if (n == 1) {
        if (ambiguous) ambiguous->clear();
        return hit;
    }
    if (n == 0 && ambiguous) ambiguous->clear();
    return nullptr;
}

/// Produce the Tcl result for the object-query commands. Everything else returns an empty
/// string — SDC constraint commands have no useful return value.
bool produceResult(Ctx& ctx, const CommandSpec& spec, const ParsedArgs& a, Tcl_Interp* ip) {
    const std::string& n = spec.name;
    const DesignObjects& d = *ctx.objs;

    auto queryPool = [&](const std::vector<std::string>& pool, const char* kind,
                         bool dotPath) -> bool {
        std::vector<std::string> pats;
        for (const std::string& p : a.pos)
            flatten(ip, Tcl_NewStringObj(p.c_str(), -1), pats);
        if (dotPath)
            for (std::string& p : pats) p = toDotPath(p);

        // `get_pins -of_objects <cells>` — no positional pattern at all. Tessent's own
        // tessent_get_pins is built entirely on this form, so a checker that ignores
        // -of_objects hands back an empty collection and the constraint file's error handler
        // starts shouting about pins that are perfectly present.
        if (a.has("-of_objects")) {
            std::vector<std::string> ofs;
            flatten(ip, Tcl_NewStringObj(a.get("-of_objects").c_str(), -1), ofs);
            std::vector<std::string> owned;
            for (std::string o : ofs) {
                o = toDotPath(o);
                for (const std::string& n : pool) {
                    // A pin/net of cell `u_a` is `u_a.<leaf>` — one level down, no deeper.
                    if (n.size() <= o.size() + 1 || n.compare(0, o.size(), o) != 0 ||
                        n[o.size()] != '.')
                        continue;
                    if (n.find('.', o.size() + 1) == std::string::npos) owned.push_back(n);
                }
            }
            // -filter names library/design attributes we have no model for, so it is not applied
            // (same choice as filter_collection): a superset keeps the file checkable, an empty
            // set silently disables every check downstream of it.
            std::vector<std::string> res;
            if (pats.empty()) {
                res = owned;
            } else {
                for (const std::string& n : owned)
                    for (const std::string& p : pats)
                        if (Tcl_StringMatch(n.c_str(), p.c_str())) { res.push_back(n); break; }
            }
            Tcl_SetObjResult(ip, listOf(res));
            return true;
        }
        if (pats.empty()) {   // -filter-only query: nothing we can resolve, and nothing to report
            Tcl_SetObjResult(ip, listOf({}));
            return true;
        }
        bool missed = false;
        std::string firstMissed;
        std::vector<std::string> res = resolvePatterns(pool, pats, &missed, &firstMissed);
        // Only claim "not found" when we actually know the design's objects of that kind and the
        // author did not ask for silence.
        if (missed && ctx.opt.designAware && !pool.empty() && !a.has("-quiet"))
            ctx.report(Severity::Error, "SDC-EMPTY-MATCH", n,
                       std::string(kind) + " pattern \"" + firstMissed + "\" matches nothing in "
                       "the design",
                       hasWildcard(firstMissed)
                           ? "no object matches this glob — check the pattern or the hierarchy level"
                           : "check the spelling, or whether the object is a pin rather than a "
                             "port (and vice versa)");
        Tcl_SetObjResult(ip, listOf(res));
        return true;
    };

    if (n == "get_ports" || n == "get_port") return queryPool(d.ports, "port", false);
    if (n == "get_pins" || n == "get_pin") return queryPool(d.pins, "pin", true);
    if (n == "get_nets" || n == "get_net") return queryPool(d.nets, "net", true);
    if (n == "get_cells" || n == "get_cell") return queryPool(d.cells, "cell", true);
    if (n == "all_inputs") { Tcl_SetObjResult(ip, listOf(d.inputs)); return true; }
    if (n == "all_outputs") { Tcl_SetObjResult(ip, listOf(d.outputs)); return true; }
    if (n == "all_clocks" || n == "get_clocks") {
        std::vector<std::string> pool;
        for (const ResolvedClock& c : ctx.clocks)
            if (!c.name.empty()) pool.push_back(c.name);
        if (n == "all_clocks") { Tcl_SetObjResult(ip, listOf(pool)); return true; }
        std::vector<std::string> pats;
        for (const std::string& p : a.pos)
            flatten(ip, Tcl_NewStringObj(p.c_str(), -1), pats);
        // -quiet says "I know this may match nothing" — honour it, or every guarded
        // `get_clocks ... -quiet` probe turns into a false undefined-clock error.
        if (!a.has("-quiet"))
            for (const std::string& p : pats)
                ctx.refs.push_back({p, ctx.file, ctx.line, "get_clocks"});
        bool missed = false;
        std::string firstMissed;
        Tcl_SetObjResult(ip, listOf(resolvePatterns(pool, pats, &missed, &firstMissed)));
        return true;
    }
    // all_registers / get_lib_* / current_*: we have no model for these, so hand back the
    // patterns unchanged rather than an empty collection that would look like a match failure.
    if (n == "all_registers") { Tcl_SetObjResult(ip, listOf({})); return true; }
    if (n.rfind("get_lib", 0) == 0 || n == "get_libs") {
        Tcl_SetObjResult(ip, listOf(a.pos));
        return true;
    }

    // ---- collection helpers ---------------------------------------------------------------
    // A collection is just a Tcl list of names here. These must behave, not merely parse:
    // `if {[sizeof_collection ...]}` decides whether a whole block of constraints is read, and
    // foreach_in_collection is the loop those constraints live inside.
    auto elems = [&](size_t i) {
        std::vector<std::string> v;
        if (i < a.pos.size()) flatten(ip, Tcl_NewStringObj(a.pos[i].c_str(), -1), v);
        return v;
    };
    if (n == "sizeof_collection") {
        Tcl_SetObjResult(ip, Tcl_NewIntObj(static_cast<int>(elems(0).size())));
        return true;
    }
    if (n == "get_object_name" || n == "collection_to_list" || n == "copy_collection" ||
        n == "query_objects") {
        Tcl_SetObjResult(ip, listOf(elems(0)));
        return true;
    }
    if (n == "index_collection") {
        const std::vector<std::string> v = elems(0);
        long i = 0;
        if (a.pos.size() > 1 && parseLong(a.pos[1], &i) && i >= 0 &&
            i < static_cast<long>(v.size()))
            Tcl_SetObjResult(ip, Tcl_NewStringObj(v[i].c_str(), -1));
        else
            Tcl_ResetResult(ip);
        return true;
    }
    if (n == "add_to_collection") {
        std::vector<std::string> v;
        for (size_t i = 0; i < a.pos.size(); ++i) {
            const std::vector<std::string> e = elems(i);
            v.insert(v.end(), e.begin(), e.end());
        }
        if (a.has("-unique")) {
            std::vector<std::string> u;
            for (const std::string& s : v)
                if (std::find(u.begin(), u.end(), s) == u.end()) u.push_back(s);
            v.swap(u);
        }
        Tcl_SetObjResult(ip, listOf(v));
        return true;
    }
    if (n == "append_to_collection" && a.pos.size() >= 2) {
        // Appends IN PLACE to a variable (like lappend), unlike add_to_collection.
        const std::string var = a.pos[0];
        std::vector<std::string> v;
        if (const char* cur = Tcl_GetVar2(ip, var.c_str(), nullptr, TCL_GLOBAL_ONLY))
            flatten(ip, Tcl_NewStringObj(cur, -1), v);
        const std::vector<std::string> add = elems(1);
        for (const std::string& s : add)
            if (!a.has("-unique") || std::find(v.begin(), v.end(), s) == v.end()) v.push_back(s);
        Tcl_SetVar2Ex(ip, var.c_str(), nullptr, listOf(v), TCL_GLOBAL_ONLY);
        Tcl_ResetResult(ip);
        return true;
    }
    // We have no library/design attribute model, so an attribute read returns empty. That makes
    // `[get_attribute $x is_hierarchical] eq "true"` take the false branch — which under-covers,
    // but inventing an answer would send the checker down a branch the real tool never takes.
    if (n == "get_attribute") { Tcl_ResetResult(ip); return true; }
    if (n == "all_fanin" || n == "all_fanout" || n == "all_connected") {
        Tcl_SetObjResult(ip, listOf({}));
        return true;
    }
    if (n == "get_generated_clocks") {
        std::vector<std::string> pool;
        for (const ResolvedClock& c : ctx.clocks)
            if (c.generated && !c.name.empty()) pool.push_back(c.name);
        std::vector<std::string> pats;
        for (const std::string& p : a.pos)
            flatten(ip, Tcl_NewStringObj(p.c_str(), -1), pats);
        bool missed = false;
        std::string firstMissed;
        Tcl_SetObjResult(ip, listOf(pats.empty() ? pool
                                                 : resolvePatterns(pool, pats, &missed, &firstMissed)));
        return true;
    }
    if (n == "remove_from_collection") {
        const std::vector<std::string> base = elems(0), drop = elems(1);
        std::vector<std::string> v;
        for (const std::string& s : base) {
            bool hit = false;
            for (const std::string& d : drop)
                if (s == d || Tcl_StringMatch(s.c_str(), d.c_str())) { hit = true; break; }
            if (hit == a.has("-intersect")) v.push_back(s);
        }
        Tcl_SetObjResult(ip, listOf(v));
        return true;
    }
    if (n == "sort_collection") {
        std::vector<std::string> v = elems(0);
        std::sort(v.begin(), v.end());
        Tcl_SetObjResult(ip, listOf(v));
        return true;
    }
    if (n == "compare_collections") {
        Tcl_SetObjResult(ip, Tcl_NewIntObj(elems(0) == elems(1) ? 0 : 1));
        return true;
    }
    if (n == "filter_collection") {
        // The filter expression names library/design attributes we have no model for. Passing the
        // collection through unchanged keeps the surrounding constraints checkable; dropping it to
        // empty would silently disable every check downstream.
        Tcl_SetObjResult(ip, listOf(elems(0)));
        return true;
    }
    if (n == "foreach_in_collection" && a.pos.size() >= 3) {
        const std::string var = a.pos[0];
        const std::vector<std::string> coll = elems(1);
        const std::string& bodyText = a.pos[2];
        // The body is a sub-script, so findings inside it would otherwise all land on the
        // `foreach_in_collection` line. Locate where the body starts within this chunk and
        // re-base the reported line on it.
        int bodyLine = ctx.line;
        const size_t at = ctx.chunkText.find(bodyText);
        if (at != std::string::npos)
            bodyLine += static_cast<int>(std::count(ctx.chunkText.begin(),
                                                    ctx.chunkText.begin() + at, '\n'));
        const int savedLine = ctx.line;
        const std::string savedChunk = ctx.chunkText;
        const std::string bodyFile = ctx.file;   // copy: evalScript reassigns ctx.file
        // Run the body through the same chunker, not one flat Tcl_Eval: that is what gives each
        // constraint inside the loop its own line number instead of the loop header's.
        for (const std::string& e : coll) {
            Tcl_SetVar2Ex(ip, var.c_str(), nullptr, Tcl_NewStringObj(e.c_str(), -1),
                          TCL_GLOBAL_ONLY);
            if (evalScript(ctx, bodyText, bodyFile, bodyLine, /*prescan*/ false) == TCL_BREAK)
                break;
        }
        ctx.line = savedLine;
        ctx.chunkText = savedChunk;
        Tcl_ResetResult(ip);
        return true;
    }
    return false;
}

int cmdGeneric(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* b = static_cast<Binding*>(cd);
    Ctx& ctx = *b->ctx;
    const CommandSpec& spec = *b->spec;
    const std::string& cmd = spec.name;
    ++ctx.rep.summary.commands;

    // --- dialect: is this command even part of the tool set being targeted? -------------------
    if ((spec.dialects & ctx.opt.dialects) == 0)
        ctx.report(Severity::Warning, "SDC-DIALECT", cmd,
                   "`" + cmd + "` belongs to " + dialectNames(spec.dialects) +
                       ", which is not in the selected dialect",
                   "remove it, or guard it so the file still reads into the other tool");

    // --- walk the argument list ---------------------------------------------------------------
    ParsedArgs a;
    for (int i = 1; i < objc; ++i) {
        const std::string s = Tcl_GetString(objv[i]);
        if (!looksLikeOption(s)) {
            a.pos.push_back(s);
            a.posObj.push_back(objv[i]);
            continue;
        }
        std::vector<std::string> ambiguous;
        const OptionSpec* os = findOption(spec, s, &ambiguous);
        if (!os) {
            if (!ambiguous.empty()) {
                std::string list;
                for (const std::string& c : ambiguous) list += (list.empty() ? "" : ", ") + c;
                ctx.report(Severity::Error, "SDC-OPT-AMBIGUOUS", cmd,
                           s + " is an ambiguous abbreviation on `" + cmd + "`",
                           "it matches " + list + " — spell out the one you mean");
            } else {
                const std::string sug = closest(s, optionNames(spec));
                ctx.report(Severity::Error, "SDC-OPT-UNKNOWN", cmd,
                           "`" + cmd + "` has no option " + s,
                           sug.empty() ? "" : "did you mean " + sug + "?");
            }
            // Swallow what was probably its value so the positional count stays believable.
            if (i + 1 < objc && !looksLikeOption(Tcl_GetString(objv[i + 1]))) ++i;
            continue;
        }
        if ((os->dialects & ctx.opt.dialects) == 0)
            ctx.report(Severity::Warning, "SDC-OPT-DIALECT", cmd,
                       s + " on `" + cmd + "` exists only in " + dialectNames(os->dialects),
                       "the other tool will reject this option");
        ++a.optCount[os->name];
        if (os->type == ArgType::Flag) {
            a.opt[os->name] = "";
            continue;
        }
        if (i + 1 >= objc) {
            ctx.report(Severity::Error, "SDC-OPT-NOVALUE", cmd,
                       s + " needs " + argTypeName(os->type) + " after it");
            continue;
        }
        Tcl_Obj* vo = objv[++i];
        checkValue(ctx, cmd, s, os->type, os->values, vo);
        a.opt[os->name] = Tcl_GetString(vo);
        if (os->name == "-group") a.groups.push_back(Tcl_GetString(vo));
        if (os->name == "-clock" && spec.name.rfind("set_", 0) == 0) {
            std::vector<std::string> cl;
            flatten(ip, vo, cl);
            for (const std::string& c : cl)
                if (!c.empty() && !hasWildcard(c)) ctx.refs.push_back({c, ctx.file, ctx.line, "-clock"});
        }
    }

    // --- required / mutually exclusive / dependent options -------------------------------------
    std::map<std::string, std::vector<std::string>> seenGroups;
    for (const OptionSpec& o : spec.options) {
        const bool seen = a.optCount.count(o.name) != 0;
        if (o.required && !seen)
            ctx.report(Severity::Error, "SDC-OPT-MISSING", cmd,
                       "`" + cmd + "` requires " + o.name);
        if (seen && !o.mutexGroup.empty()) seenGroups[o.mutexGroup].push_back(o.name);
        if (seen && !o.requiresOpt.empty() && a.optCount.count(o.requiresOpt) == 0)
            ctx.report(Severity::Error, "SDC-OPT-REQUIRES", cmd,
                       o.name + " is only legal together with " + o.requiresOpt);
    }
    for (auto& [g, names] : seenGroups)
        if (names.size() > 1) {
            std::string list;
            for (const std::string& n : names) list += (list.empty() ? "" : " ") + n;
            ctx.report(Severity::Error, "SDC-OPT-CONFLICT", cmd,
                       "mutually exclusive options given together: " + list);
        }
    if (!spec.requireOneOf.empty() && seenGroups.count(spec.requireOneOf) == 0) {
        std::string choices;
        for (const OptionSpec& o : spec.options)
            if (o.mutexGroup == spec.requireOneOf)
                choices += (choices.empty() ? "" : " | ") + o.name;
        ctx.report(Severity::Error, "SDC-OPT-MISSING", cmd,
                   "`" + cmd + "` needs one of: " + choices);
    }

    // --- positional arity and types ------------------------------------------------------------
    const size_t need = spec.leading.size();
    for (size_t k = 0; k < need && k < a.pos.size(); ++k)
        checkValue(ctx, cmd, "argument " + std::to_string(k + 1), spec.leading[k],
                   spec.leadingValues, a.posObj[k]);
    if (a.pos.size() < need)
        ctx.report(Severity::Error, "SDC-ARG-MISSING", cmd,
                   "`" + cmd + "` expects " + std::to_string(need) + " value argument" +
                       (need == 1 ? "" : "s") + ", got " + std::to_string(a.pos.size()));
    const size_t extra = a.pos.size() > need ? a.pos.size() - need : 0;
    // The classic Tcl trap: `#` only starts a comment at the START of a command, so a trailing
    // "# note" silently becomes extra arguments. It can land at any positional index (after
    // [current_design], after an object list, ...), so scan them all — and once found, it fully
    // explains the arity, so suppress the generic extra-argument message.
    bool sawStrayHash = false;
    for (const std::string& p : a.pos)
        if (!p.empty() && p[0] == '#') { sawStrayHash = true; break; }
    if (sawStrayHash)
        ctx.report(Severity::Error, "SDC-COMMENT", cmd,
                   "`#` here is an argument, not a comment",
                   "Tcl only treats # as a comment at the start of a command — end the command "
                   "first, e.g. `...; # note`");
    else if (spec.trailing == ArgType::None && extra > 0)
        ctx.report(Severity::Error, "SDC-ARG-EXTRA", cmd,
                   "`" + cmd + "` takes no object list, but got \"" + a.pos[need] + "\"");
    else if (spec.trailingRequired && extra == 0)
        ctx.report(Severity::Error, "SDC-ARG-MISSING", cmd,
                   "`" + cmd + "` needs " + argTypeName(spec.trailing) + " to apply to");

    // --- per-command semantics ------------------------------------------------------------------
    if (cmd == "create_clock" || cmd == "create_generated_clock") {
        if (cmd == "create_clock") ++ctx.rep.summary.clocks;
        else ++ctx.rep.summary.generatedClocks;
        recordClock(ctx, spec, a);
    } else if (cmd == "set_input_delay" || cmd == "set_output_delay") {
        ++ctx.rep.summary.ioDelays;
        if (!a.has("-clock"))
            ctx.report(Severity::Warning, "SDC-IO-NOCLOCK", cmd,
                       "no -clock given",
                       "an I/O delay without a reference clock is unconstrained in PrimeTime and "
                       "silently dropped by some tools");
    } else if (cmd == "set_false_path" || cmd == "set_multicycle_path" || cmd == "set_max_delay" ||
               cmd == "set_min_delay") {
        ++ctx.rep.summary.exceptions;
        static const char* kEndpoints[] = {"-from", "-to",      "-through",     "-rise_from",
                                           "-fall_from", "-rise_to", "-fall_to", "-rise_through",
                                           "-fall_through"};
        bool any = false;
        for (const char* e : kEndpoints)
            if (a.has(e)) any = true;
        if (!any)
            ctx.report(Severity::Warning, "SDC-EXC-GLOBAL", cmd,
                       "no -from / -to / -through given",
                       "this applies to every path in the design — almost always wider than "
                       "intended");
        // Record the endpoint tuple so the post-pass can find setup multicycles with no hold
        // counterpart — the classic omission that leaves hold checked at the wrong edge.
        if (cmd == "set_multicycle_path" && (a.has("-setup") || a.has("-hold"))) {
            std::string key;
            for (const char* e : kEndpoints)
                if (a.has(e)) key += std::string(e) + "{" + a.get(e) + "}";
            ctx.mcps.push_back({key, a.has("-hold"), ctx.file, ctx.line});
        }
    }
    // Deliberately NOT checked: `set_clock_groups` with a single -group. One group is legal and
    // meaningful — it declares that group asynchronous/exclusive to EVERY OTHER clock, which is
    // exactly what Tessent emits for the TCK group. Warning on it was pure noise.

    if (!produceResult(ctx, spec, a, ip)) Tcl_ResetResult(ip);
    return TCL_OK;
}

/// Tcl could not resolve the command at all: not a builtin, not a user proc, not in our table.
int cmdUnknown(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* ctx = static_cast<Ctx*>(cd);
    if (objc >= 2) {
        const std::string name = Tcl_GetString(objv[1]);
        // A "command" that is nothing but digits and ':' is almost never a command — it is a bus
        // index that was not escaped. `set_case_analysis 0 $inst/RM[3]` makes Tcl run command `3`
        // and splices its result into the name, so the constraint lands on the wrong object (or
        // errors). One report per line: a wide bus would otherwise produce one per bit.
        const bool busIndex = !name.empty() &&
                              name.find_first_not_of("0123456789:") == std::string::npos;
        const std::string key =
            busIndex ? "bus@" + ctx->file + ":" + std::to_string(ctx->line) : name;
        if (ctx->reportedUnknown.insert(key).second) {
            if (busIndex) {
                ctx->report(Severity::Error, "SDC-BUS-BRACKET", "",
                            "`[" + name + "]` is being run as a command, not read as a bus index",
                            "square brackets are command substitution in Tcl. Brace the whole "
                            "object name — {u_a/d_reg[" + name + "]} — which also protects a "
                            "Verilog escaped identifier (\\name) from being eaten by Tcl");
            } else {
                std::vector<std::string> pool;
                for (const CommandSpec& c : commandSpecs()) pool.push_back(c.name);
                const std::string sug = closest(name, pool);
                ctx->report(Severity::Error, "SDC-CMD-UNKNOWN", name,
                            "unknown command `" + name + "`",
                            sug.empty() ? "not an SDC command and not defined in this file"
                                        : "did you mean " + sug + "?");
            }
        }
    }
    Tcl_ResetResult(ip);
    return TCL_OK;
}

int cmdPassthrough(ClientData, Tcl_Interp* ip, int, Tcl_Obj* const[]) {
    Tcl_ResetResult(ip);
    return TCL_OK;
}

/// `puts` MUST be overridden, not left to Tcl. Two reasons, one of them fatal: the linter also
/// runs inside the ndjson daemon, whose stdout IS the protocol channel — a constraint file that
/// prints a banner would corrupt the response stream. The second reason is a bonus: a serious
/// SDC file reports its own problems this way ("Tessent SDC error: No pin found ..."), and those
/// belong in the report rather than on the floor.
int cmdPuts(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* ctx = static_cast<Ctx*>(cd);
    int i = 1;
    if (i < objc && std::string(Tcl_GetString(objv[i])) == "-nonewline") ++i;
    // `puts $chan msg` — with two remaining words the first is the channel, not the message.
    if (objc - i >= 2) ++i;
    const std::string msg = i < objc ? Tcl_GetString(objv[i]) : std::string();
    Tcl_ResetResult(ip);
    if (msg.empty() || ctx->echoes >= 40) return TCL_OK;

    std::string lower = msg;
    for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    // "No pin found with pattern(s) ..." is an OBJECT-EXISTENCE claim. Without a design we
    // refuse to make that claim ourselves (SDC-EMPTY-MATCH is suppressed), so we must not
    // launder it through the file's own diagnostic either — with no netlist loaded the file's
    // lookups fail by construction and every one of these is noise about our setup, not the file.
    if (!ctx->rep.summary.designAware && lower.find("found") != std::string::npos) return TCL_OK;

    if (!ctx->echoed.insert(msg).second) return TCL_OK;   // a loop must not report N times
    ++ctx->echoes;
    const bool bad = lower.find("error") != std::string::npos ||
                     lower.find("warning") != std::string::npos ||
                     lower.find("fail") != std::string::npos;
    ctx->report(bad ? Severity::Warning : Severity::Info, "SDC-ECHO", "",
                "the file reports: " + msg,
                bad ? "this is the constraint file's own diagnostic, not the checker's" : "");
    return TCL_OK;
}

/// A checker must not write to the user's disk. Handing back "stdout" keeps files that log a
/// report working — their `puts $fh ...` lands in cmdPuts — without any of it reaching a file.
int cmdOpen(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* ctx = static_cast<Ctx*>(cd);
    if (ctx->reportedUnknown.insert("open").second)
        ctx->report(Severity::Info, "SDC-IO-BLOCKED", "open",
                    "file I/O is disabled while checking",
                    objc >= 2 ? std::string("`open ") + Tcl_GetString(objv[1]) +
                                "` was neutralised — the checker never writes to disk"
                              : "");
    Tcl_SetObjResult(ip, Tcl_NewStringObj("stdout", -1));
    return TCL_OK;
}

// ---- evaluation: chunk the file into commands so every finding has a line number ---------------

int cmdSource(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* ctx = static_cast<Ctx*>(cd);
    std::string path;
    for (int i = 1; i < objc; ++i) {
        const std::string s = Tcl_GetString(objv[i]);
        if (!s.empty() && s[0] == '-') { ++i; continue; }   // -encoding <name>
        path = s;
    }
    Tcl_ResetResult(ip);
    if (path.empty() || !ctx->opt.followSource) return TCL_OK;

    std::string resolved = path;
    std::ifstream probe(resolved);
    if (!probe.good()) {
        const std::string base = dirOf(ctx->file);
        if (!base.empty()) resolved = base + "/" + path;
    }
    std::ifstream in(resolved, std::ios::binary);
    if (!in.good()) {
        ctx->report(Severity::Error, "SDC-SOURCE", "source",
                    "cannot read sourced file: " + path);
        return TCL_OK;
    }
    if (std::find(ctx->sourceStack.begin(), ctx->sourceStack.end(), resolved) !=
        ctx->sourceStack.end()) {
        ctx->report(Severity::Error, "SDC-SOURCE", "source",
                    "circular source of " + path);
        return TCL_OK;
    }
    if (ctx->sourceStack.size() >= 8) {
        ctx->report(Severity::Error, "SDC-SOURCE", "source", "source nesting too deep at " + path);
        return TCL_OK;
    }
    std::ostringstream ss;
    ss << in.rdbuf();

    const std::string savedFile = ctx->file;
    const int savedLine = ctx->line;
    ctx->sourceStack.push_back(resolved);
    evalScript(*ctx, ss.str(), resolved);
    ctx->sourceStack.pop_back();
    ctx->file = savedFile;
    ctx->line = savedLine;
    return TCL_OK;
}

/// Classify a Tcl error message into a rule + hint. These are the L1 findings.
void reportTclError(Ctx& ctx, const std::string& raw, int absLine) {
    std::string rule = "SDC-EVAL";
    std::string hint;
    auto has = [&raw](const char* s) { return raw.find(s) != std::string::npos; };
    if (has("no such variable")) {
        rule = "SDC-VAR-UNDEF";
        hint = "the variable is never `set` before this point (a typo, or a setup file that was "
               "not sourced)";
    } else if (has("missing close-brace") || has("missing close-bracket") ||
               has("missing \"") || has("extra characters after close-brace") ||
               has("unmatched open") || has("quote followed by")) {
        rule = "SDC-SYNTAX";
        hint = "unbalanced { } [ ] or \" — check the line continuations above too";
    } else if (has("divide by zero") || has("syntax error in expression")) {
        rule = "SDC-EXPR";
        hint = "the [expr ...] on this line cannot be evaluated";
    } else if (has("invalid command name")) {
        rule = "SDC-CMD-UNKNOWN";
    }
    ctx.report(Severity::Error, rule, "", raw, hint, absLine);
}

int evalScript(Ctx& ctx, const std::string& text, const std::string& file, int firstLine,
               bool prescan) {
    const std::vector<std::string> lines = splitLines(text);

    // --- textual pre-scan: two failure modes the interpreter cannot see -------------------------
    // A backslash that is not the LAST character no longer continues the line; the command ends
    // there and the rest becomes a separate (usually broken) command. Invisible in an editor.
    if (prescan) {
        bool sawCrlf = false;
        for (size_t i = 0; i < lines.size(); ++i) {
            std::string l = lines[i];
            if (!l.empty() && l.back() == '\r') { sawCrlf = true; l.pop_back(); }
            const size_t last = l.find_last_not_of(" \t");
            if (last != std::string::npos && l[last] == '\\' && last + 1 != l.size()) {
                ctx.file = file;
                ctx.report(Severity::Error, "SDC-CONT-WS", "",
                           "line continuation `\\` is followed by trailing whitespace",
                           "the backslash escapes the space instead of the newline, so the command "
                           "ends here and the next line is parsed on its own",
                           firstLine + static_cast<int>(i));
            }
        }
        if (sawCrlf) {
            ctx.file = file;
            ctx.report(Severity::Warning, "SDC-CRLF", "",
                       "file has CRLF line endings",
                       "a trailing \\r turns line continuations and bare words into different "
                       "strings; convert to LF before handing the file to DC/Genus",
                       firstLine);
        }
    }

    // --- chunk into complete commands, keeping each chunk's first line --------------------------
    std::string buf;
    int start = firstLine;
    int last = TCL_OK;
    for (size_t i = 0; i < lines.size(); ++i) {
        if (buf.empty()) start = firstLine + static_cast<int>(i);
        buf += lines[i];
        buf += "\n";
        if (!Tcl_CommandComplete(buf.c_str())) continue;
        if (!isBlankScript(buf)) {
            ctx.file = file;
            ctx.line = start;
            ctx.chunkText = buf;
            const int rc = Tcl_Eval(ctx.ip, buf.c_str());
            if (rc == TCL_BREAK || rc == TCL_CONTINUE || rc == TCL_RETURN) {
                Tcl_ResetResult(ctx.ip);
                return rc;
            }
            if (rc != TCL_OK) {
                const int errLine = Tcl_GetErrorLine(ctx.ip);
                reportTclError(ctx, Tcl_GetStringResult(ctx.ip),
                               start + (errLine > 0 ? errLine - 1 : 0));
                Tcl_ResetResult(ctx.ip);
            }
            last = rc;
        }
        buf.clear();
    }
    if (!buf.empty() && !isBlankScript(buf)) {
        ctx.file = file;
        ctx.report(Severity::Error, "SDC-SYNTAX", "",
                   "unterminated command — the file ends inside an open { } [ ] or quote",
                   "everything from this line on was swallowed; fix the first unbalanced "
                   "delimiter and re-run",
                   start);
    }
    return last == TCL_ERROR ? TCL_OK : last;
}

// ---- cross-command checks that can only run once the whole file has been read -------------------

void postChecks(Ctx& ctx, int procCount) {
    std::map<std::string, int> defined;     // clock name -> first definition line
    std::map<std::string, const ResolvedClock*> onTarget;  // source object -> the clock already on it
    std::vector<std::string> names;
    for (const ResolvedClock& c : ctx.clocks) {
        if (!c.name.empty()) {
            auto it = defined.find(c.name);
            if (it == defined.end()) {
                defined[c.name] = c.line;
                names.push_back(c.name);
            } else if (!c.add) {
                ctx.file = c.file;
                ctx.report(Severity::Warning, "SDC-CLK-REDEFINE",
                           c.generated ? "create_generated_clock" : "create_clock",
                           "clock `" + c.name + "` is redefined (first defined at line " +
                               std::to_string(it->second) + ")",
                           "without -add the second definition replaces the first",
                           c.line);
            }
        }
        // The far nastier version of the same mistake: two DIFFERENTLY NAMED clocks on the same
        // source object. Nothing looks wrong — two well-formed create_clock lines — but without
        // -add the second silently removes the first, and every constraint written against the
        // first clock then applies to nothing.
        if (c.generated) continue;
        for (const std::string& t : c.targets) {
            auto it = onTarget.find(t);
            if (it == onTarget.end()) {
                onTarget[t] = &c;
            } else if (!c.add) {
                ctx.file = c.file;
                ctx.report(Severity::Error, "SDC-CLK-OVERWRITE", "create_clock",
                           "clock `" + c.name + "` replaces `" + it->second->name + "` on `" + t +
                               "` (defined at line " + std::to_string(it->second->line) + ")",
                           "two clocks on one object need -add on the second; without it the "
                           "first clock — and everything constrained against it — disappears",
                           c.line);
            }
        }
    }

    // A file that defines NO clocks is a fragment (a Tessent dft_add_func block, a shift-mode
    // add-on). Every clock it names is external by construction, so reporting each one as
    // undefined is noise about the file's nature, not about a defect — the one summary line
    // below says it once instead.
    const bool fragment = ctx.clocks.empty();
    if (!fragment)
        for (const Ref& r : ctx.refs) {
            if (r.pattern.empty()) continue;
            bool hit = false;
            for (const std::string& n : names)
                if (Tcl_StringMatch(n.c_str(), r.pattern.c_str())) { hit = true; break; }
            if (hit) continue;
            ctx.file = r.file;
            // A literal name that resolves to nothing is a definite mistake; a glob that matches
            // nothing is often a probe for clocks another file may add, so it is only a warning.
            const bool glob = hasWildcard(r.pattern);
            ctx.report(glob ? Severity::Warning : Severity::Error, "SDC-CLK-UNDEF", r.where,
                       std::string(glob ? "clock pattern `" : "clock `") + r.pattern +
                           (glob ? "` matches no clock defined in this file"
                                 : "` is not defined in this file"),
                       "define it with create_clock/create_generated_clock, or source the file "
                       "that does before this one",
                       r.line);
        }

    // A setup multicycle with no hold counterpart on the same endpoints leaves the hold check at
    // the launch edge — it passes timing and fails on silicon. Only reported when the endpoints
    // match exactly, so a hold exception written with different endpoints is not miscounted.
    for (const Mcp& m : ctx.mcps) {
        if (m.hold) continue;
        bool paired = false;
        for (const Mcp& o : ctx.mcps)
            if (o.hold && o.endpoints == m.endpoints) { paired = true; break; }
        if (paired) continue;
        ctx.file = m.file;
        ctx.report(Severity::Warning, "SDC-MCP-NOHOLD", "set_multicycle_path",
                   "setup multicycle with no matching -hold on the same path",
                   "a setup multiple of N normally needs `-hold N-1`; without it hold is still "
                   "checked one cycle after launch",
                   m.line);
    }

    ctx.file.clear();
    if (ctx.rep.summary.commands == 0 && procCount > 0)
        ctx.report(Severity::Info, "SDC-PROC-ONLY", "",
                   "this file only defines procedures (" + std::to_string(procCount) +
                       ") — no constraint was evaluated",
                   "it is a library meant to be sourced; check the file that calls into it", 1);
    else if (fragment)
        ctx.report(Severity::Warning, "SDC-NO-CLOCK", "",
                   "the file defines no clocks — it is a fragment, not a standalone constraint set",
                   "clock references in it were not checked; they must come from the file sourced "
                   "before this one", 1);
}

// ---- driver ---------------------------------------------------------------------------------

LintReport run(const std::string& text, const std::string& file, const LintOptions& opt,
               const DesignObjects& objs) {
    Ctx ctx;
    ctx.opt = opt;
    ctx.objs = &objs;
    ctx.file = file;
    ctx.rep.summary.designAware = opt.designAware && !objs.empty();

    Tcl_Interp* ip = Tcl_CreateInterp();
    if (!ip) {
        ctx.report(Severity::Error, "SDC-INTERNAL", "", "failed to create a Tcl interpreter", "", 1);
        return ctx.rep;
    }
    ctx.ip = ip;
    // Tcl_Init is deliberately skipped: it loads init.tcl (absent on many EDA installs) and SDC
    // needs nothing from the script library.
    const std::vector<CommandSpec>& specs = commandSpecs();
    for (const CommandSpec& s : specs) {
        ctx.bindings.push_back({&ctx, &s});
        Tcl_CreateObjCommand(ip, s.name.c_str(), cmdGeneric, &ctx.bindings.back(), nullptr);
    }
    for (const char* n : {"sh", "exec", "redirect", "suppress_message", "echo",
                          "read_sdc", "write_sdc", "check_timing", "report_timing",
                          "report_clock", "update_timing", "link_design"})
        if (isPassthroughCommand(n)) Tcl_CreateObjCommand(ip, n, cmdPassthrough, &ctx, nullptr);
    Tcl_CreateObjCommand(ip, "source", cmdSource, &ctx, nullptr);
    Tcl_CreateObjCommand(ip, "unknown", cmdUnknown, &ctx, nullptr);
    // Override the Tcl builtins that would otherwise escape the sandbox: stdout (the daemon's
    // protocol channel) and the filesystem.
    Tcl_CreateObjCommand(ip, "puts", cmdPuts, &ctx, nullptr);
    Tcl_CreateObjCommand(ip, "open", cmdOpen, &ctx, nullptr);
    Tcl_CreateObjCommand(ip, "close", cmdPassthrough, &ctx, nullptr);
    Tcl_CreateObjCommand(ip, "flush", cmdPassthrough, &ctx, nullptr);

    ctx.sourceStack.push_back(file);
    evalScript(ctx, text, file);
    // A Tessent instrument .sdc is nothing but `proc` definitions that a later file calls. Ask
    // the interpreter how many were defined so the report can say that, instead of the useless
    // "this file defines no clocks".
    int procCount = 0;
    if (Tcl_Eval(ip, "llength [info procs]") == TCL_OK)
        procCount = std::atoi(Tcl_GetStringResult(ip));
    Tcl_ResetResult(ip);
    postChecks(ctx, procCount);

    Tcl_DeleteInterp(ip);
    ctx.ip = nullptr;

    // Errors first, then by position — the order a user wants to fix them in.
    std::stable_sort(ctx.rep.findings.begin(), ctx.rep.findings.end(),
                     [](const Finding& a, const Finding& b) {
                         if (a.severity != b.severity) return a.severity < b.severity;
                         if (a.file != b.file) return a.file < b.file;
                         return a.line < b.line;
                     });
    ctx.rep.clocks = std::move(ctx.clocks);
    return ctx.rep;
}

}  // namespace

bool lintAvailable() { return true; }

LintReport lintText(const std::string& text, const std::string& displayPath,
                    const LintOptions& opt, const DesignObjects& objs) {
    return run(text, displayPath, opt, objs);
}

LintReport lintFile(const std::string& path, const LintOptions& opt, const DesignObjects& objs) {
    std::ifstream in(path, std::ios::binary);
    if (!in.good()) {
        LintReport r;
        Finding f;
        f.rule = "SDC-FILE";
        f.severity = Severity::Error;
        f.file = path;
        f.line = 1;
        f.message = "cannot read file";
        r.findings.push_back(std::move(f));
        return r;
    }
    std::ostringstream ss;
    ss << in.rdbuf();
    return run(ss.str(), path, opt, objs);
}

}  // namespace sdc

#else  // !SDC_HAVE_TCL

namespace sdc {

bool lintAvailable() { return false; }

namespace {
LintReport noTcl(const std::string& file) {
    LintReport r;
    Finding f;
    f.rule = "SDC-NO-TCL";
    f.severity = Severity::Error;
    f.file = file;
    f.line = 1;
    f.message = "this build has no embedded Tcl interpreter, so SDC cannot be checked";
    f.hint = "rebuild with -DHDL_WITH_TCL=ON and a Tcl development package installed";
    r.findings.push_back(std::move(f));
    r.summary.tclAvailable = false;
    return r;
}
}  // namespace

LintReport lintFile(const std::string& path, const LintOptions&, const DesignObjects&) {
    return noTcl(path);
}
LintReport lintText(const std::string&, const std::string& displayPath, const LintOptions&,
                    const DesignObjects&) {
    return noTcl(displayPath);
}

}  // namespace sdc

#endif
