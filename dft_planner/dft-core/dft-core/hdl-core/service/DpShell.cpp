#include "service/DpShell.h"

#include "service/DesignDb.h"
#include "frontend/SlangCompile.h"
#include "service/DftLib.h"
#include "clockgen.h"   // sdc-core: master-clock inference + resolved period (read_sdc/load_sdc)
#include "lint.h"       // sdc-core: same parse pass, needed to reach clockgen's input

#include <algorithm>
#include <cmath>
#include <cctype>
#include <cstdlib>
#include <ctime>
#include <filesystem>
#include <iomanip>
#include <map>
#include <functional>
#include <memory>
#include <regex>
#include <fstream>
#include <sstream>

#ifdef HDL_HAVE_TCL
#include <tcl.h>
#endif

namespace hdl::service {

namespace {

std::string normSep(std::string s) {
    for (char& c : s)
        if (c == '/') c = '.';
    return s;
}
/// Render back in the '/' form users type in SDC/dp_shell.
std::string userSep(std::string s) {
    for (char& c : s)
        if (c == '.') c = '/';
    return s;
}

/// The one rendering of the OCC list as replayable commands — file writes, the occTcl
/// protocol field and the auto-write all emit exactly this text.
std::string renderOccText(const std::vector<OccPoint>& occ,
                          const std::function<std::string(const std::string&)>& show) {
    std::ostringstream o;
    o << "# dfx_occ_def_point.tcl — OCC definition points (replayable dp_shell commands)\n";
    for (auto& p : occ) {
        o << "add_occ_point " << show(p.pin);
        if (!p.clock.empty()) o << " -clock " << p.clock;
        if (!p.comment.empty()) o << " -comment {" << p.comment << "}";
        o << "\n";
    }
    return o.str();
}

#ifdef HDL_HAVE_TCL
/// One switch of one command, for `-help`, `report_commands` and Tab completion. Written once,
/// beside the registration, so the three can never describe different commands.
struct CmdOpt {
    const char* name;   // "-clock"
    const char* arg;    // "<name>", or "" for a flag
    const char* help;
};
struct CmdSpec {
    std::string name, group, usage, summary;
    std::vector<CmdOpt> opts;
    Tcl_ObjCmdProc* proc = nullptr;
    void* impl = nullptr;     // DpShell::Impl*
    bool alias = false;       // a second name for a command already listed
};
#endif

/// The VIRTUAL instantiation script: `create_instance` for every planned DFX IP, then
/// `create_connection` for every planned wire and constant tie. Emitted in the shape the
/// insertion flow reads — the RTL is never touched, this script is what instantiates them.
std::string renderInstText(const std::vector<DftIp>& ips, const std::vector<DftConn>& conns) {
    if (ips.empty() && conns.empty()) return {};
    std::ostringstream o;
    for (const auto& x : ips) {
        o << "create_instance " << x.instance << " -of_module " << x.module;
        if (!x.at.empty()) o << " -at " << userSep(x.at);
        o << "\n";
    }
    for (const auto& c : conns) {
        o << "create_connection " << c.from;
        if (c.constant.empty()) o << " " << c.to;
        else o << " -constant " << c.constant;
        o << "\n";
    }
    return o.str();
}

}  // namespace

struct DpShell::Impl {
    DesignDb& db;
    std::vector<OccPoint> occ;
    std::vector<CtrlMux> mux;
    std::vector<UserClock> clocks;      // add_clocks
    std::vector<DftSignal> signals;     // add_dft_signals
    std::map<std::string, std::string> drcSeverity;   // ruleId -> Error|Warning|Note|Ignore
    std::string dftLib;   // dft_lib_setting.yaml path (set_dft_lib)
    std::string sdcFile;  // functional SDC (read_sdc)
    /// set_occ_out_dir: when set, EVERY add/remove of an OCC point rewrites
    /// <dir>/dfx_occ_def_point.tcl — the GUI points this at the harden's spec/logic_test
    /// so the plan on disk can never drift from the shell state.
    std::string occOutDir;
    std::vector<PinConstraint> pinCons;   // add_pin_constraint
    /// set_memory_instance_options — the user-forced half of the MBIST compatibility rules
    /// (CCR4 partitioning_group, and the overridable parts of CCR3).
    std::vector<DesignDb::MbistPlanOptions::InstanceOption> memInstOpts;
    /// set_phase_constraint: what the DFT signals are held at in each test phase. The reset DRC
    /// is a per-phase question — "inactive while shifting" and "controllable in stuck-at
    /// capture" are different requirements on the same wire.
    std::map<std::string, std::vector<PinConstraint>> phaseCons;   // "shift"|"sac"|"asc"
    /// The user's DFX IP library, compiled as its own elaboration (read_dfx_ip). Every module
    /// nothing instantiates becomes a top, so a planned IP's output pin can be EVALUATED from
    /// its real circuit — with the rule the whole plan runs on: unconstrained means X.
    std::unique_ptr<DesignDb> ipDb;
    std::string ipDir;
    /// The read_dfx_ip arguments that produced ipDb — persisted into dfx_dft_plan.tcl, so a
    /// restarted session reloads the library automatically instead of asking the user again.
    std::vector<std::string> ipPaths;
    std::vector<DftIp> ips;               // add_dft_ip (planned DFX IP instantiations)
    std::vector<DftConn> conns;           // add_dft_connection (pin->pin and constant ties)
    std::string scope;    // set_scope: which analysis the following commands belong to
    std::string out;
#ifdef HDL_HAVE_TCL
    Tcl_Interp* ip = nullptr;
    /// Every registered command, in registration order. unique_ptr because each one's address is
    /// the ClientData Tcl hands back.
    std::vector<std::unique_ptr<CmdSpec>> cmds;
#endif
    /// The elaborated top names, fetched once. Hierarchical names in this flow are TOP-RELATIVE
    /// the way Tessent writes them — `PROCESSOR_1/clock_module_0`, not
    /// `processor_core/PROCESSOR_1/clock_module_0` — because the top IS the current design, and
    /// naming it in every path is noise that also breaks the day the top is renamed.
    std::vector<std::string> tops;
    bool topsLoaded = false;
    const std::vector<std::string>& topList() {
        if (!topsLoaded) { tops = db.topNames(); topsLoaded = true; }
        return tops;
    }
    /// DISPLAY form: '/'-separated and top-relative. Everything a user reads goes through here.
    std::string show(const std::string& id) {
        for (const auto& t : topList())
            if (id.size() > t.size() + 1 && id.compare(0, t.size(), t) == 0 && id[t.size()] == '.')
                return userSep(id.substr(t.size() + 1));
        return userSep(id);
    }
    /// STORAGE form: '.'-separated and absolute, so a recorded point compares against the
    /// elaborated paths the rest of the tool uses. A top-relative name gets its prefix back —
    /// both spellings may be typed, and scripts written before this keep working.
    ///
    /// The prefix is RESOLVED, not guessed. A filelist elaborates every module nothing
    /// instantiates as its own top (this design has 24), so "the first top" is very often not
    /// the design's top: prefixing with it turned `add_pin_constraint reset_n 1` into a
    /// constraint on a path that does not exist, reported as "matches no pin/port/net" and then
    /// silently ignored by the DRC. A name that resolves under no top is kept as typed, which is
    /// what leaf-name matching has always done.
    std::string absPath(const std::string& p) {
        const std::string n = normSep(p);
        for (const auto& t : topList())
            if (n == t || (n.size() > t.size() && n.compare(0, t.size(), t) == 0 && n[t.size()] == '.'))
                return n;
        auto cached = absCache.find(n);
        if (cached != absCache.end()) return cached->second;
        std::string best = n;
        for (const auto& t : topList()) {
            const std::string cand = t + "." + n;
            if (!db.findObjects(cand, "instance,pin,port,net", 1).objects.empty()) { best = cand; break; }
        }
        absCache.emplace(n, best);
        return best;
    }
    std::map<std::string, std::string> absCache;

    explicit Impl(DesignDb& d) : db(d) {}

    void print(const std::string& s) { out += s; out += "\n"; }

    /// Query helper shared by get_cells/get_ports/get_pins/get_nets.
    std::vector<std::string> query(const std::string& pattern, const char* kinds, int limit) {
        FindResult r = db.findObjects(normSep(pattern), kinds, limit);
        std::vector<std::string> ids;
        ids.reserve(r.objects.size());
        for (auto& o : r.objects) ids.push_back(o.id);
        if (r.truncated) print("# note: result truncated at " + std::to_string(limit));
        return ids;
    }
};

#ifdef HDL_HAVE_TCL

namespace {

/// ClientData is the command's own CmdSpec (so the trampoline can reach its help), and every
/// command reaches the shell state through here.
DpShell::Impl* ctxOf(ClientData cd) {
    return static_cast<DpShell::Impl*>(static_cast<CmdSpec*>(cd)->impl);
}
CmdSpec* specOf(ClientData cd) { return static_cast<CmdSpec*>(cd); }

std::vector<std::string> flatArgs(Tcl_Interp* ip, int objc, Tcl_Obj* const objv[], int from) {
    std::vector<std::string> v;
    for (int i = from; i < objc; ++i) {
        int n = 0;
        Tcl_Obj** el = nullptr;
        if (Tcl_ListObjGetElements(ip, objv[i], &n, &el) == TCL_OK && n > 0) {
            for (int k = 0; k < n; ++k) v.emplace_back(Tcl_GetString(el[k]));
        } else {
            const char* s = Tcl_GetString(objv[i]);
            if (s && *s) v.emplace_back(s);
        }
    }
    return v;
}

/// Query results, rendered the way the flow writes hierarchical names: '/'-separated and
/// TOP-RELATIVE. Naming the top in every returned path is what stopped `get_instances` output
/// from being usable as input to anything expecting the Tessent spelling.
Tcl_Obj* toList(DpShell::Impl* c, const std::vector<std::string>& v) {
    Tcl_Obj* l = Tcl_NewListObj(0, nullptr);
    for (auto& s : v) Tcl_ListObjAppendElement(nullptr, l, Tcl_NewStringObj(c->show(s).c_str(), -1));
    return l;
}

/// One `-filter` term: `attribute op value`, the subset of the Tessent attribute equation this
/// design model can actually answer. Unsupported attributes are REPORTED, not silently dropped —
/// a filter that quietly matches everything is worse than one that says it cannot.
struct FilterTerm { std::string attr, op, val; };

std::vector<FilterTerm> parseFilter(const std::string& eq, std::string& bad) {
    std::vector<FilterTerm> out;
    std::istringstream in(eq);
    std::string tok;
    std::vector<std::string> toks;
    while (in >> tok) toks.push_back(tok);
    for (std::size_t i = 0; i + 2 < toks.size() + 1;) {
        if (toks[i] == "&&" || toks[i] == "and") { ++i; continue; }
        if (i + 2 >= toks.size() + 0 && i + 2 > toks.size() - 1) break;
        if (i + 2 >= toks.size()) break;
        FilterTerm t{toks[i], toks[i + 1], toks[i + 2]};
        if (!t.val.empty() && (t.val.front() == '"' || t.val.front() == '\'')) t.val = t.val.substr(1);
        if (!t.val.empty() && (t.val.back() == '"' || t.val.back() == '\'')) t.val.pop_back();
        static const char* known[] = {"name", "full_name", "direction", "design", "module",
                                      "parent", "leaf_name", "kind"};
        bool ok = false;
        for (const char* k : known) if (t.attr == k) ok = true;
        if (!ok) bad += (bad.empty() ? "" : ", ") + t.attr;
        out.push_back(t);
        i += 3;
    }
    return out;
}

bool matchTerm(DpShell::Impl* c, const FoundObject& o, const FilterTerm& t) {
    std::string v;
    if (t.attr == "name" || t.attr == "leaf_name") v = o.name;
    else if (t.attr == "full_name") v = c->show(o.id);
    else if (t.attr == "direction") v = o.dir;
    else if (t.attr == "design" || t.attr == "module") v = o.design;
    else if (t.attr == "parent") v = c->show(o.parent);
    else if (t.attr == "kind") v = o.kind;
    else return true;   // unknown attribute: already reported, do not filter on a guess
    if (t.op == "==") return v == t.val;
    if (t.op == "!=") return v != t.val;
    if (t.op == "=~") return Tcl_StringMatch(v.c_str(), t.val.c_str()) != 0;
    if (t.op == "!~") return Tcl_StringMatch(v.c_str(), t.val.c_str()) == 0;
    return true;
}

/// get_instances / get_ports / get_pins / get_nets / get_modules — the Tessent shape
/// (tshell_ref "Command Dictionary Ga-Get_p"), with the switches this design model can honour.
template <const char* KINDS>
int cmdQuery(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    int limit = 1000;
    std::vector<std::string> pats, below, ofInstances, ofModules, ofNets, ofPorts;
    std::string direction, filterEq, ofType;
    bool regexp = false, nocase = false, silent = false, wantParent = false;
    const std::string cmdName = Tcl_GetString(objv[0]);

    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        auto listArg = [&](std::vector<std::string>& dst) {
            if (i + 1 < objc) for (auto& s : flatArgs(ip, objc, objv, ++i)) dst.push_back(c->absPath(s));
        };
        if (a.empty()) continue;
        // Patterns and switches interleave, exactly as they do in Tessent: `get_ports clk* -nocase`
        // is the natural way to write it, and stopping at the first pattern silently threw away
        // every switch after it.
        if (a[0] != '-') {
            for (auto& s : flatArgs(ip, i + 1, objv, i)) pats.push_back(s);
            continue;
        }
        if (a == "-limit" && i + 1 < objc) {
            int v = 0;
            if (Tcl_GetIntFromObj(ip, objv[++i], &v) == TCL_OK && v > 0) limit = v;
        } else if (a == "-below_instances") { listArg(below); }
        else if (a == "-of_instances" || a == "-of_instance") { listArg(ofInstances); }
        else if (a == "-of_modules" || a == "-of_module") {
            if (i + 1 < objc) for (auto& s : flatArgs(ip, objc, objv, ++i)) ofModules.push_back(s);
        } else if (a == "-of_nets" || a == "-of_net") { listArg(ofNets); }
        else if (a == "-of_ports" || a == "-of_port") { listArg(ofPorts); }
        else if (a == "-parent_of_instances") { wantParent = true; listArg(ofInstances); }
        else if (a == "-direction" && i + 1 < objc) direction = Tcl_GetString(objv[++i]);
        else if (a == "-of_type" && i + 1 < objc) ofType = Tcl_GetString(objv[++i]);
        else if (a == "-filter" && i + 1 < objc) filterEq = Tcl_GetString(objv[++i]);
        else if (a == "-regexp") regexp = true;
        else if (a == "-nocase") nocase = true;
        else if (a == "-silent" || a == "-quiet") silent = true;
        else if (a == "-hierarchical" || a == "-hier" || a == "-bundle" ||
                 a == "-use_path_matching_options" || a == "-match_rtl_reg") {
            // accepted: this model is hierarchical, unbundled and post-elaboration anyway
        } else if (!silent) {
            c->print("# " + cmdName + ": ignoring unsupported switch " + a);
        }
    }
    // Tessent: no pattern = every object of that kind, subject to the other switches.
    const bool wildcardScan = pats.empty() || regexp || nocase;
    if (pats.empty()) pats.push_back("*");

    std::string badAttrs;
    const std::vector<FilterTerm> terms = filterEq.empty()
        ? std::vector<FilterTerm>{} : parseFilter(filterEq, badAttrs);
    if (!badAttrs.empty() && !silent)
        c->print("# " + cmdName + ": -filter attribute not known to this model: " + badAttrs +
                 " (known: name, full_name, direction, design, parent, kind)");

    // A regexp/nocase pass has to see every candidate, so the glob layer is widened to "*" and
    // the real matching happens here.
    const int scanLimit = wildcardScan ? std::max(limit, 200000) : limit;
    std::vector<FoundObject> hits;
    std::vector<std::string> seen;
    for (const auto& p : pats) {
        FindResult r = c->db.findObjects(wildcardScan ? "*" : normSep(p), KINDS, scanLimit);
        for (auto& o : r.objects) {
            if (wildcardScan && p != "*") {
                const std::string hay = p.find('/') != std::string::npos ||
                                        p.find('.') != std::string::npos ? c->show(o.id) : o.name;
                bool ok;
                if (regexp) {
                    try {
                        std::regex re(p, nocase ? std::regex::icase | std::regex::ECMAScript
                                                : std::regex::ECMAScript);
                        ok = std::regex_search(hay, re);
                    } catch (const std::regex_error& e) {
                        Tcl_SetObjResult(ip, Tcl_NewStringObj(
                            (cmdName + ": bad -regexp pattern '" + p + "': " + e.what()).c_str(), -1));
                        return TCL_ERROR;
                    }
                } else {
                    ok = nocase ? Tcl_StringCaseMatch(hay.c_str(), p.c_str(), TCL_MATCH_NOCASE) != 0
                                : Tcl_StringMatch(hay.c_str(), p.c_str()) != 0;
                }
                if (!ok) continue;
            }
            if (std::find(seen.begin(), seen.end(), o.id) != seen.end()) continue;
            seen.push_back(o.id);
            hits.push_back(o);
        }
        if (r.truncated && !silent) c->print("# note: search truncated at " + std::to_string(scanLimit));
    }

    const auto underAny = [](const std::string& id, const std::vector<std::string>& roots) {
        for (const auto& r : roots)
            if (id == r || (id.size() > r.size() + 1 && id.compare(0, r.size(), r) == 0 && id[r.size()] == '.'))
                return true;
        return false;
    };
    std::vector<std::string> out;
    for (const auto& o : hits) {
        if (!below.empty() && !underAny(o.id, below)) continue;
        if (!ofInstances.empty() && !wantParent &&
            !(underAny(o.id, ofInstances) || std::find(ofInstances.begin(), ofInstances.end(),
                                                       o.parent) != ofInstances.end()))
            continue;
        if (!ofModules.empty() && std::find(ofModules.begin(), ofModules.end(), o.design) == ofModules.end())
            continue;
        if (!direction.empty()) {
            const std::string d = o.dir;
            const bool ok = (direction == "input" || direction == "in") ? (d == "in" || d == "input")
                          : (direction == "output" || direction == "out") ? (d == "out" || d == "output")
                          : d == direction;
            if (!ok) continue;
        }
        bool keep = true;
        for (const auto& t : terms) if (!matchTerm(c, o, t)) { keep = false; break; }
        if (!keep) continue;
        // A module is named by its NAME. `id` on a module is the internal defId
        // (`processor_core|/path/to/processor_core.v`) that the GUI uses to open a definition —
        // returning that made `get_modules` output unusable as a module name anywhere else.
        const std::string shown = o.kind == "module" ? o.name : o.id;
        if (std::find(out.begin(), out.end(), shown) != out.end()) continue;
        out.push_back(shown);
        if (static_cast<int>(out.size()) >= limit) break;
    }
    // -parent_of_instances: the owning instance of each match, each named once.
    if (wantParent) {
        std::vector<std::string> parents;
        for (const auto& o : hits)
            if (!o.parent.empty() && std::find(parents.begin(), parents.end(), o.parent) == parents.end())
                parents.push_back(o.parent);
        out = parents;
    }
    if (!ofNets.empty() || !ofPorts.empty() || !ofType.empty()) {
        if (!silent)
            c->print("# " + cmdName + ": -of_nets/-of_ports/-of_type need connectivity this "
                     "model does not index; the other switches were applied");
    }
    if (out.empty() && !silent)
        c->print("# " + cmdName + ": nothing matched");
    Tcl_SetObjResult(ip, toList(c, out));
    return TCL_OK;
}
extern const char K_CELL[] = "instance";
extern const char K_PORT[] = "port";
extern const char K_PIN[] = "pin";
extern const char K_NET[] = "net";
extern const char K_MOD[] = "module";

/// When an output dir is configured, keep <dir>/dfx_occ_def_point.tcl in lockstep with the
/// shell's OCC list: called after every add/remove. Failures are reported, never fatal —
/// losing the auto-write must not lose the in-memory plan.
void autoWriteOcc(DpShell::Impl* c) {
    if (c->occOutDir.empty()) return;
    std::error_code ec;
    std::filesystem::create_directories(c->occOutDir, ec);
    const std::string path = c->occOutDir + "/dfx_occ_def_point.tcl";
    std::ofstream f(path);
    if (!f) {
        c->print("# WARNING: cannot auto-write " + path);
        return;
    }
    f << renderOccText(c->occ, [&](const std::string& id) { return c->show(id); });
    c->print("# wrote " + path);
}

/// The FULL plan (IPs + ctrl muxes + pin constraints) as replayable commands — auto-written
/// beside the OCC file so a restarted session can restore everything it recorded.
void autoWritePlan(DpShell::Impl* c) {
    if (c->occOutDir.empty()) return;
    std::error_code ec;
    std::filesystem::create_directories(c->occOutDir, ec);
    const std::string path = c->occOutDir + "/dfx_dft_plan.tcl";
    std::ofstream f(path);
    if (!f) { c->print("# WARNING: cannot auto-write " + path); return; }
    const char nl = '\n';
    f << "# dfx_dft_plan.tcl - planned DFX IPs / ctrl muxes / pin constraints (replayable)" << nl;
    if (!c->ipPaths.empty()) {
        f << "read_dfx_ip";
        for (auto& a : c->ipPaths) f << " " << a;
        f << nl;
    }
    for (auto& x : c->ips) {
        f << "add_dft_ip " << x.module << " -instance " << x.instance;
        if (!x.at.empty()) f << " -at " << c->show(x.at);
        if (!x.comment.empty()) f << " -comment {" << x.comment << "}";
        f << nl;
    }
    for (auto& m : c->mux) {
        f << "add_dft_ctrl_mux " << c->show(m.target)
          << " -override_source " << m.overrideSource << " -select " << m.select;
        if (!m.comment.empty()) f << " -comment {" << m.comment << "}";
        f << nl;
    }
    for (auto& cn : c->conns) {
        f << "add_dft_connection " << cn.from;
        if (!cn.constant.empty()) f << " -constant " << cn.constant;
        else f << " " << cn.to;
        f << nl;
    }
    // MBIST plan edits (controller assignments, partitioning groups, overrides) — replayed at
    // design open like every other planned decision, so a hand-made partition survives restart.
    for (auto& o : c->memInstOpts) {
        f << "set_memory_instance_options " << o.pattern;
        if (!o.controller.empty()) f << " -controller " << o.controller;
        if (o.stepIndex >= 0) f << " -step " << o.stepIndex;
        if (!o.partitioningGroup.empty()) f << " -partitioning_group " << o.partitioningGroup;
        if (!o.physicalCluster.empty()) f << " -physical_cluster_override " << o.physicalCluster;
        if (!o.powerDomain.empty()) f << " -power_domain " << o.powerDomain;
        if (!o.clockDomain.empty()) f << " -test_clock_override " << o.clockDomain;
        if (o.exclude) f << " -use_in_memory_bist_dft_specification off";
        f << nl;
    }
    for (auto& pc : c->pinCons)
        f << "add_pin_constraint " << c->show(pc.pin) << " " << pc.value << nl;
    for (const char* ph : {"shift", "sac", "asc"})
        if (auto it = c->phaseCons.find(ph); it != c->phaseCons.end())
            for (auto& pc : it->second)
                f << "set_phase_constraint " << ph << " " << c->show(pc.pin) << " "
                  << pc.value << nl;
    c->print("# wrote " + path);

    // The reset DRC's own setup, on its own: these are the values the analysis has to be run
    // with, and a reviewer asking "what was forced" should not have to read the IP plan to
    // find out. Same commands, replayable on their own.
    const std::string cpath = c->occOutDir + "/reset_drc_pin_constraint.tcl";
    std::ofstream cf(cpath);
    if (!cf) { c->print("# WARNING: cannot auto-write " + cpath); return; }
    cf << "# reset_drc_pin_constraint.tcl - pin constraints for the reset DRC (replayable)" << nl;
    for (auto& pc : c->pinCons)
        cf << "add_pin_constraint " << c->show(pc.pin) << " " << pc.value << nl;
    c->print("# wrote " + cpath);
}

/// set_occ_out_dir [dir] — auto-write target for the OCC plan. The GUI sets this to the
/// harden's dft_studio_db/<harden>/spec/logic_test at design open; no argument reports the
/// current setting. Setting it writes the file immediately (state and disk start in sync).
int cmdSetOccOutDir(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    if (objc < 2) {
        c->print(c->occOutDir.empty() ? "no OCC output dir set (auto-write off)"
                                      : "OCC output dir: " + c->occOutDir);
        Tcl_SetObjResult(ip, Tcl_NewStringObj(c->occOutDir.c_str(), -1));
        return TCL_OK;
    }
    c->occOutDir = Tcl_GetString(objv[1]);
    c->print("OCC output dir: " + c->occOutDir);
    autoWriteOcc(c);
    autoWritePlan(c);
    return TCL_OK;
}

/// add_occ_point <pin>... [-clock name] [-comment text]  (alias: add_to_occ_def_point)
int cmdAddOcc(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    std::string clock, comment;
    std::vector<std::string> pins;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (a == "-clock" && i + 1 < objc) clock = Tcl_GetString(objv[++i]);
        else if (a == "-comment" && i + 1 < objc) comment = Tcl_GetString(objv[++i]);
        else if (!a.empty() && a[0] == '-') continue;
        else {
            int n = 0;
            Tcl_Obj** el = nullptr;
            if (Tcl_ListObjGetElements(ip, objv[i], &n, &el) == TCL_OK && n > 0)
                for (int k = 0; k < n; ++k) pins.emplace_back(Tcl_GetString(el[k]));
            else pins.emplace_back(a);
        }
    }
    if (pins.empty()) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj("add_occ_point: no pin given", -1));
        return TCL_ERROR;
    }
    for (auto& raw : pins) {
        const std::string pin = c->absPath(raw);
        auto it = std::find_if(c->occ.begin(), c->occ.end(),
                               [&](const OccPoint& o) { return o.pin == pin; });
        if (it != c->occ.end()) {   // idempotent: re-adding updates the annotation
            if (!clock.empty()) it->clock = clock;
            if (!comment.empty()) it->comment = comment;
            c->print("# already defined: " + c->show(pin));
            continue;
        }
        // Soft check: a point that resolves to NO design object is almost always a path with
        // the harden top left off (the GUI display form). Record it anyway — the user may be
        // naming something not yet elaborated — but never accept it silently: an unresolvable
        // point would sit in dfx_occ_def_point.tcl and fail much later, in the DFT flow.
        if (c->db.findObjects(pin, "pin,port,net,cell", 1).objects.empty())
            c->print("# WARNING: " + c->show(pin) +
                     " matches no pin/port/net/cell in the design (missing the top level?)");
        c->occ.push_back({pin, clock, comment});
        c->print("added OCC definition point: " + c->show(pin) + (clock.empty() ? "" : "  (clock " + clock + ")"));
    }
    autoWriteOcc(c);
    return TCL_OK;
}

int cmdRemoveOcc(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    for (auto& raw : flatArgs(ip, objc, objv, 1)) {
        const std::string pin = c->absPath(raw);
        const auto n = std::remove_if(c->occ.begin(), c->occ.end(),
                                      [&](const OccPoint& o) { return o.pin == pin; });
        if (n == c->occ.end()) c->print("# not an OCC point: " + c->show(pin));
        else { c->occ.erase(n, c->occ.end()); c->print("removed OCC definition point: " + c->show(pin)); }
    }
    autoWriteOcc(c);
    return TCL_OK;
}

int cmdReportOcc(ClientData cd, Tcl_Interp* ip, int, Tcl_Obj* const[]) {
    auto* c = ctxOf(cd);
    if (c->occ.empty()) c->print("no OCC definition points");
    else {
        c->print("OCC definition points (" + std::to_string(c->occ.size()) + "):");
        for (auto& o : c->occ)
            c->print("  " + c->show(o.pin) + (o.clock.empty() ? "" : "  clock=" + o.clock) +
                     (o.comment.empty() ? "" : "  # " + o.comment));
    }
    Tcl_SetObjResult(ip, Tcl_NewIntObj(static_cast<int>(c->occ.size())));
    return TCL_OK;
}

/// add_dft_ctrl_mux <target> -override_source <src> -select <sel> [-comment text]
int cmdAddMux(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    CtrlMux m;
    bool srcValueGiven = false;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if ((a == "-override_source" || a == "-override") && i + 1 < objc) m.overrideSource = Tcl_GetString(objv[++i]);
        else if (a == "-select" && i + 1 < objc) m.select = Tcl_GetString(objv[++i]);
        else if (a == "-source_value" && i + 1 < objc) { ++i; srcValueGiven = true; }
        else if (a == "-comment" && i + 1 < objc) m.comment = Tcl_GetString(objv[++i]);
        else if (!a.empty() && a[0] == '-') continue;
        else if (m.target.empty()) m.target = a;
    }
    if (m.target.empty() || m.overrideSource.empty() || m.select.empty()) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj(
            "usage: add_dft_ctrl_mux <target> -override_source <src> -select <sel>", -1));
        return TCL_ERROR;
    }
    m.target = c->absPath(m.target);
    auto it = std::find_if(c->mux.begin(), c->mux.end(),
                           [&](const CtrlMux& x) { return x.target == m.target; });
    // NO implicit constraints. Recording a mux used to auto-constrain its select and source
    // (select=1, source=-source_value) — convenient, and exactly what the user rejected: the
    // DFT-side values must COMPUTE from the pins' real driver circuits, and only an explicit
    // user `add_pin_constraint` may override that. The flag is still parsed so replayed plans
    // do not error, but it constrains nothing any more.
    if (srcValueGiven)
        c->print("# note: -source_value no longer constrains anything — values compute from "
                 "the source circuit; use add_pin_constraint yourself to override");
    if (it != c->mux.end()) { *it = m; c->print("updated DFT ctrl mux on " + c->show(m.target)); }
    else { c->mux.push_back(m); c->print("added DFT ctrl mux on " + c->show(m.target) +
                                         "  override_source=" + m.overrideSource + "  select=" + m.select); }
    autoWritePlan(c);
    return TCL_OK;
}

int cmdRemoveMux(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    for (auto& raw : flatArgs(ip, objc, objv, 1)) {
        const std::string t = c->absPath(raw);
        const auto n = std::remove_if(c->mux.begin(), c->mux.end(),
                                      [&](const CtrlMux& x) { return x.target == t; });
        if (n == c->mux.end()) c->print("# no ctrl mux on " + c->show(t));
        else { c->mux.erase(n, c->mux.end()); c->print("removed DFT ctrl mux on " + c->show(t)); }
    }
    autoWritePlan(c);
    return TCL_OK;
}

int cmdReportMux(ClientData cd, Tcl_Interp* ip, int, Tcl_Obj* const[]) {
    auto* c = ctxOf(cd);
    if (c->mux.empty()) c->print("no DFT ctrl muxes");
    else {
        c->print("DFT ctrl muxes (" + std::to_string(c->mux.size()) + "):");
        for (auto& m : c->mux)
            c->print("  " + c->show(m.target) + "  -override_source " + m.overrideSource +
                     "  -select " + m.select);
    }
    Tcl_SetObjResult(ip, Tcl_NewIntObj(static_cast<int>(c->mux.size())));
    return TCL_OK;
}

/// The user's add_pin_constraint forces (0/1 only) as a CrQuery — every command that runs the
/// value calculus goes through this, so a constraint holds in run_drc AND the report_* views.
std::string ipPinValue(DpShell::Impl* c, const std::string& fullPin, const std::string& phase,
                       int depth = 0, std::string* stuckAt = nullptr);

/// The session's constraints as the value calculus wants them — used by EVERY analysis the shell
/// runs, so `report_reset`, `report_clock_tree` and `run_drc` all judge the same design state.
CrQuery consQuery(DpShell::Impl* c) {
    CrQuery q;
    const auto held = [&](const std::string& pin) -> std::string {
        const std::string n = normSep(pin);
        for (const auto& pc : c->pinCons)
            if (pc.pin == n && (pc.value == '0' || pc.value == '1')) return std::string(1, pc.value);
        return {};
    };
    for (auto& pc : c->pinCons)
        if (pc.value == '0' || pc.value == '1')
            q.pinConstraints.emplace_back(pc.pin, pc.value == '1' ? 1 : 0);
    // Planned control muxes drive their target in test mode. Included here rather than only in
    // the GUI's own query, so the console answers the same question the buttons do — a mux is
    // credited ONLY when its select is held active and its source is held at a definite value,
    // because a mux whose DFT side is unconstrained would not actually drive anything.
    for (const auto& m : c->mux) {
        const std::string selC = ipPinValue(c, m.select, "shift");
        const std::string sel = !selC.empty() ? selC : held(m.select);
        // UNCONSTRAINED (empty) is not the same as computed-X: a mux whose select nobody
        // constrains is inert — it changes nothing, it does not poison the target. Only a
        // select the CIRCUIT computes as X genuinely drives X.
        if (sel.empty() || sel == "0") continue;
        std::string v;
        if (sel == "1") {
            const std::string srcC = ipPinValue(c, m.overrideSource, "shift");
            v = !srcC.empty() ? srcC : held(m.overrideSource);
            if (v.empty()) v = "X";
        } else {
            v = "X";
        }
        q.plannedMuxes.push_back({normSep(m.target), v});
    }
    return q;
}

/// Value of `fullPin` (a pin of a PLANNED IP instance) in `phase`, COMPUTED from the IP's own
/// circuit. Constraint sources, most specific first: this phase's set_phase_constraint, then the
/// session's add_pin_constraint, then add_dft_connection ties/links (a link to another planned
/// IP's output recurses into that IP). Everything else is X — and X propagates out honestly:
/// an IP whose inputs nobody constrained does not get to claim a value.
/// Returns "" when the pin is not under a planned IP or the library is not loaded.
std::string ipPinValue(DpShell::Impl* c, const std::string& fullPin, const std::string& phase,
                       int depth, std::string* stuckAt) {
    if (!c->ipDb || depth > 3) return {};
    const std::string p = normSep(fullPin);
    const DftIp* owner = nullptr;
    std::string base;
    for (const auto& ip : c->ips) {
        std::string b = ip.at.empty() ? ip.instance : normSep(ip.at) + "." + ip.instance;
        if (p.size() > b.size() + 1 && p.compare(0, b.size(), b) == 0 && p[b.size()] == '.') {
            owner = &ip;
            base = b;
            break;
        }
    }
    if (!owner) return {};
    const std::string pin = p.substr(base.size() + 1);

    // A constraint stated ON the queried pin itself wins over computing it — same rule the
    // cross-IP links already follow. The IP outputs that matter here are persistent-cell /
    // register driven: statically they compute X, and the per-phase constraint on the pin IS
    // the programming (add_dft_ctrl_mux records exactly these). Without this, loading the
    // library would turn every planned fix into an X driver.
    if (const auto it = c->phaseCons.find(phase); it != c->phaseCons.end())
        for (const auto& pc : it->second)
            if (pc.pin == p && (pc.value == '0' || pc.value == '1'))
                return std::string(1, pc.value);
    for (const auto& pc : c->pinCons)
        if (pc.pin == p && (pc.value == '0' || pc.value == '1'))
            return std::string(1, pc.value);
    for (const auto& cn : c->conns)
        if (normSep(cn.to) == p && !cn.constant.empty() &&
            (cn.constant == "0" || cn.constant == "1"))
            return cn.constant;

    // Bare-port constraints on THIS IP instance, mapped to port names.
    std::vector<std::pair<std::string, int>> ports;
    const auto put = [&](const std::string& name, int v) {
        for (auto& kv : ports)
            if (kv.first == name) { kv.second = v; return; }
        ports.emplace_back(name, v);
    };
    const auto scan = [&](const std::vector<PinConstraint>& list) {
        for (const auto& pc : list) {
            if (pc.value != '0' && pc.value != '1') continue;
            const std::string n = pc.pin;
            if (n.size() > base.size() + 1 && n.compare(0, base.size(), base) == 0 &&
                n[base.size()] == '.')
                put(n.substr(base.size() + 1), pc.value == '1' ? 1 : 0);
        }
    };
    scan(c->pinCons);
    if (const auto it = c->phaseCons.find(phase); it != c->phaseCons.end()) scan(it->second);
    // Planned connections: constants tie a pin outright; a link to another planned IP's output
    // takes that IP's computed value (the TDR feeding the dynamic controller is exactly this).
    for (const auto& cn : c->conns) {
        const std::string to = normSep(cn.to);
        if (to.size() > base.size() + 1 && to.compare(0, base.size(), base) == 0 &&
            to[base.size()] == '.') {
            if (!cn.constant.empty()) put(to.substr(base.size() + 1), cn.constant == "1" ? 1 : 0);
            else {
                // A constraint stated ON the driver pin wins over computing it: a TDR output is
                // a programmed register — statically X — and the per-phase constraint on it IS
                // the programming. Only when nothing is stated do we evaluate the driver's own
                // circuit.
                const std::string from = normSep(cn.from);
                std::string v;
                if (const auto it = c->phaseCons.find(phase); it != c->phaseCons.end())
                    for (const auto& pc : it->second)
                        if (pc.pin == from && (pc.value == '0' || pc.value == '1'))
                            v = std::string(1, pc.value);
                if (v.empty())
                    for (const auto& pc : c->pinCons)
                        if (pc.pin == from && (pc.value == '0' || pc.value == '1'))
                            v = std::string(1, pc.value);
                if (v.empty()) v = ipPinValue(c, cn.from, phase, depth + 1);
                if (v == "0" || v == "1") put(to.substr(base.size() + 1), v == "1" ? 1 : 0);
            }
        }
    }
    return c->ipDb->evalNet(owner->module, pin, ports, stuckAt);
}

/// The DRC query for one test phase: session constraints + that phase's overrides, with the
/// planned muxes re-resolved against them. Shared by report_reset_states and the protocol's
/// clock-reset-tree, so the console and the schematic answer from the same arithmetic.
CrQuery phaseQueryFor(DpShell::Impl* c, const std::string& phase) {
    CrQuery q = consQuery(c);
    const auto it = c->phaseCons.find(phase);
    static const std::vector<PinConstraint> none;
    const std::vector<PinConstraint>& ph = it == c->phaseCons.end() ? none : it->second;
    for (const auto& pc : ph)
        if (pc.value == '0' || pc.value == '1') {
            // A phase constraint OVERRIDES the session's own for that pin: it says what this
            // phase holds it at, which is the more specific statement.
            auto e = std::find_if(q.pinConstraints.begin(), q.pinConstraints.end(),
                                  [&](const auto& x) { return normSep(x.first) == pc.pin; });
            if (e != q.pinConstraints.end()) e->second = pc.value == '1' ? 1 : 0;
            else q.pinConstraints.emplace_back(pc.pin, pc.value == '1' ? 1 : 0);
        }
    // …AND the planned muxes have to be re-resolved against those values. consQuery() worked
    // them out from the session constraints; leaving them alone made every phase show the
    // shift answer, which is the one thing three columns must never do.
    const auto heldInPhase = [&](const std::string& pin) -> std::string {
        const std::string n = normSep(pin);
        for (const auto& pc : ph)
            if (pc.pin == n && (pc.value == '0' || pc.value == '1')) return std::string(1, pc.value);
        for (const auto& pc : c->pinCons)
            if (pc.pin == n && (pc.value == '0' || pc.value == '1')) return std::string(1, pc.value);
        return {};
    };
    q.plannedMuxes.clear();
    for (const auto& m : c->mux) {
        // COMPUTED beats declared: when the IP library is loaded, the select and the source are
        // evaluated from the IP's own circuit under this phase's constraints — and X propagates
        // as X. A mux whose select computes X drives X; only select==0 leaves the functional
        // path untouched. Nothing unconstrained gets to pretend.
        const std::string selC = ipPinValue(c, m.select, phase);
        const std::string sel = !selC.empty() ? selC : heldInPhase(m.select);
        // Unconstrained select = inert mux (see consQuery); computed X = drives X.
        if (sel.empty() || sel == "0") continue;
        std::string v;
        if (sel == "1") {
            const std::string srcC = ipPinValue(c, m.overrideSource, phase);
            v = !srcC.empty() ? srcC : heldInPhase(m.overrideSource);
            if (v.empty()) v = "X";
        } else {
            v = "X";   // select unknown -> the mux output is unknown
        }
        q.plannedMuxes.push_back({normSep(m.target), v});
    }
    return q;
}

/// read_dfx_ip <dir|file>... — compile the user's DFX IP library as its own elaboration. Every
/// module nothing instantiates becomes a top; a planned IP's pins can then be EVALUATED from
/// the real circuit instead of declared.
int cmdReadDfxIp(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    std::vector<std::string> files;
    namespace fs = std::filesystem;
    std::error_code ec;
    // Idempotent for the same arguments: the GUI issues this automatically at design open, and
    // the plan replay may have run it already — recompiling an unchanged library is pure waste.
    if (c->ipDb) {
        std::vector<std::string> want;
        for (int i = 1; i < objc; ++i) want.push_back(Tcl_GetString(objv[i]));
        if (!want.empty() && want == c->ipPaths) {
            c->print("read_dfx_ip: already loaded (" + want[0] +
                     (want.size() > 1 ? " …" : "") + ")");
            return TCL_OK;
        }
    }
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (fs::is_directory(a, ec)) {
            c->ipDir = a;
            for (const auto& e : fs::directory_iterator(a, ec)) {
                const std::string x = e.path().string();
                if (x.size() > 2 && (x.rfind(".v") == x.size() - 2 || x.rfind(".sv") == x.size() - 3))
                    files.push_back(x);
            }
        } else if (fs::exists(a, ec)) files.push_back(a);
        else c->print("# read_dfx_ip: no such path " + a);
    }
    if (files.empty()) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj("usage: read_dfx_ip <dir|file>...", -1));
        return TCL_ERROR;
    }
    std::string err;
    auto design = hdl::frontend::compileSingleTree(files, {}, {}, err);
    if (!design) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj(("read_dfx_ip: " + err).c_str(), -1));
        return TCL_ERROR;
    }
    c->ipDb = std::make_unique<DesignDb>(std::move(design));
    c->ipPaths.clear();
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (fs::exists(a, ec)) c->ipPaths.push_back(a);
    }
    c->print("read_dfx_ip: " + std::to_string(files.size()) + " file(s) compiled" +
             (err.empty() ? "" : "  (" + err + ")"));
    autoWritePlan(c);
    return TCL_OK;
}

/// report_dft_ip_circuit <inst/pin> — the pin's per-phase value COMPUTED from the IP circuit,
/// and the IP's input ports with what each phase holds them at (X = unconstrained). This is the
/// input-circuit analysis: which inputs decide the pin, and what they are in each phase.
int cmdReportIpCircuit(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    if (!c->ipDb) {
        c->print("no IP library loaded — read_dfx_ip <dir> first");
        return TCL_OK;
    }
    if (objc < 2) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj("usage: report_dft_ip_circuit <inst/pin>", -1));
        return TCL_ERROR;
    }
    const std::string full = Tcl_GetString(objv[1]);
    static const char* kPhases[] = {"shift", "sac", "asc"};
    std::string vals[3], stuck[3];
    for (int k = 0; k < 3; ++k) vals[k] = ipPinValue(c, full, kPhases[k], 0, &stuck[k]);
    if (vals[0].empty()) {
        c->print("# " + full + " is not a pin of a planned DFX IP (add_dft_ip first)");
        return TCL_OK;
    }
    // Which of the three came from a DECLARATION on the pin (constraint/tie) rather than the
    // circuit: the circuit answer for a programmed register is X, and saying "computed" about
    // a declared value would misreport where the number comes from.
    bool anyDecl = false;
    {
        const std::string pn = normSep(full);
        for (int k = 0; k < 3; ++k) {
            bool decl = false;
            if (const auto it = c->phaseCons.find(kPhases[k]); it != c->phaseCons.end())
                for (const auto& pc : it->second)
                    if (pc.pin == pn && (pc.value == '0' || pc.value == '1')) decl = true;
            for (const auto& pc : c->pinCons)
                if (pc.pin == pn && (pc.value == '0' || pc.value == '1')) decl = true;
            anyDecl = anyDecl || decl;
        }
    }
    c->print(full + "  s(" + vals[0] + ")-sac(" + vals[1] + ")/asc(" + vals[2] + ")" +
             (anyDecl ? "   declared by constraint (a programmed register: the circuit alone computes X)"
                      : "   computed from the IP circuit"));
    // The actionable half of an X: WHERE the static calculus stopped. A register output is the
    // usual answer — its per-phase value is programmed behaviour, so it has to be DECLARED:
    //   set_phase_constraint <phase> <this pin> <0|1>
    for (int k = 0; k < 3; ++k)
        if (vals[k] == "X" && !stuck[k].empty()) {
            if (stuck[k].rfind("input:", 0) == 0)
                c->print("  " + std::string(kPhases[k]) + ": X — first unconstrained input: " +
                         stuck[k].substr(6) + "  (set_phase_constraint " + kPhases[k] + " <inst>/" +
                         stuck[k].substr(6) + " <0|1>, then re-run: the next missing one is named)");
            else
                c->print("  " + std::string(kPhases[k]) + ": X — stuck at " + stuck[k].substr(5) +
                         " (no combinational driver: a register output or an undriven net; " +
                         "declare the pin itself per phase with set_phase_constraint)");
            break;   // one explanation; the phases almost always stick at the same point
        }
    // The inputs that decide it: every input port of the owning module, with its per-phase
    // constraint. X means nobody constrains it in that phase — and X is what it contributes.
    const std::string p = normSep(full);
    for (const auto& x : c->ips) {
        std::string b = x.at.empty() ? x.instance : normSep(x.at) + "." + x.instance;
        if (!(p.size() > b.size() + 1 && p.compare(0, b.size(), b) == 0 && p[b.size()] == '.'))
            continue;
        c->print("inputs of " + x.module + " (" + x.instance + "):");
        const auto heldIn = [&](const std::string& phase, const std::string& port) -> std::string {
            const std::string want = b + "." + port;
            if (const auto it = c->phaseCons.find(phase); it != c->phaseCons.end())
                for (const auto& pc : it->second)
                    if (pc.pin == want) return std::string(1, pc.value);
            for (const auto& pc : c->pinCons)
                if (pc.pin == want) return std::string(1, pc.value);
            for (const auto& cn : c->conns)
                if (normSep(cn.to) == want)
                    return cn.constant.empty() ? ("<- " + cn.from) : cn.constant;
            return "X";
        };
        FindResult pr = c->ipDb->findObjects("*", "port", 500);
        for (const auto& o : pr.objects) {
            if (o.design != x.module || o.dir == "out") continue;
            c->print("  " + o.name + "  s(" + heldIn("shift", o.name) + ")-sac(" +
                     heldIn("sac", o.name) + ")/asc(" + heldIn("asc", o.name) + ")" +
                     (o.dir == "inout" ? "  [inout]" : ""));
        }
        break;
    }
    return TCL_OK;
}

/// report_memory_instance ?<membistlib dir>? — which memories the design contains: every
/// blackbox instance matched against the membistlib (*.tcd_memory templates and, when present,
/// the `<CellName>.v` Verilog model beside them). With no argument the last scanned directory
/// (Memory tab / a previous call) is re-used. Unmatched blackboxes are listed too — they are
/// the coverage question ("这个黑盒是不是没建库的 memory?").
int cmdReportMemoryInstance(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    (void)ip;
    auto* c = ctxOf(cd);
    // report_memory_instance ?<dir>? ?-def <file>?
    //                        ?-physical_cluster_size_ratio <0..100>? ?-max_per_controller <n>?
    std::string dir, def;
    double ratio = -1;      // <0 = no grouping requested
    int maxPer = 0;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (a == "-def" && i + 1 < objc) { def = Tcl_GetString(objv[++i]); }
        else if ((a == "-physical_cluster_size_ratio" || a == "-ratio") && i + 1 < objc) {
            try { ratio = std::stod(Tcl_GetString(objv[++i])); } catch (...) { ratio = -1; }
        } else if ((a == "-max_per_controller" || a == "-max") && i + 1 < objc) {
            try { maxPer = std::stoi(Tcl_GetString(objv[++i])); } catch (...) { maxPer = 0; }
        } else if (!a.empty() && a[0] != '-' && dir.empty()) { dir = a; }
    }
    DesignDb::MemoryMapResult mm = c->db.memoryMap(dir, def);
    // A DEF was given but no explicit ratio: group with the tool's default 20 %, because the
    // whole point of reading a DEF here is to see the controller partition it implies.
    if (ratio < 0 && !def.empty()) ratio = 20;
    if (ratio >= 0) DesignDb::groupMemories(mm, ratio, maxPer);
    for (const auto& e : mm.errors) c->print("# " + e);
    if (mm.templates.empty() && mm.instances.empty()) return TCL_OK;

    const auto num = [](double v) {
        std::string s = std::to_string(v);
        if (const auto d = s.find('.'); d != std::string::npos && s.size() > d + 3)
            s = s.substr(0, d + 3);
        return s;
    };
    std::vector<std::vector<std::string>> rows;
    std::vector<std::string> head{"instance", "module", "type", "words", "ports",
                                  "bist_algorithm", "model"};
    if (!mm.defFile.empty()) { head.push_back("x"); head.push_back("y"); }
    if (!mm.groups.empty()) head.push_back("controller");
    rows.push_back(head);
    int matchedCount = 0;
    for (const auto& mi : mm.instances) {
        if (mi.matched < 0) continue;
        ++matchedCount;
        const auto& t = mm.templates[static_cast<std::size_t>(mi.matched)];
        const std::string model = t.verilogModel.empty()
            ? "-" : t.verilogModel.substr(t.verilogModel.find_last_of('/') + 1);
        std::vector<std::string> row{mi.path, mi.module, t.type, t.words, t.ports,
                                     t.algorithm, model};
        if (!mm.defFile.empty()) {
            row.push_back(mi.placed ? num(mi.x) : "-");
            row.push_back(mi.placed ? num(mi.y) : "-");
        }
        if (!mm.groups.empty())
            row.push_back(mi.group >= 0 ? ("mbist_ctrl_" + std::to_string(mi.group + 1)) : "-");
        rows.push_back(std::move(row));
    }
    std::vector<std::size_t> wcol(rows[0].size(), 0);
    for (const auto& rw : rows)
        for (std::size_t k = 0; k < rw.size(); ++k) wcol[k] = std::max(wcol[k], rw[k].size());
    for (std::size_t i = 0; i < rows.size(); ++i) {
        std::string line = i == 0 ? "# " : "  ";
        for (std::size_t k = 0; k < rows[i].size(); ++k) {
            line += rows[i][k];
            if (k + 1 < rows[i].size())
                line += std::string(wcol[k] - rows[i][k].size() + 2, ' ');
        }
        c->print(line);
        if (i == 0 && rows.size() == 1) c->print("  (none)");
    }
    c->print("# " + std::to_string(matchedCount) + " memory instance(s), " +
             std::to_string(mm.templates.size()) + " template(s)" +
             (mm.defFile.empty() ? ""
                                 : ", " + std::to_string(mm.placedCount) + " placed from DEF"));
    // Controller grouping (physical proximity): each group is one MemoryBIST controller
    // candidate, with the span its BIST bus / clock / repair chain has to cover.
    if (!mm.groups.empty() && mm.dieDiagonal > 0)
        c->print("# die " + num(mm.dieX1 - mm.dieX0) + " x " + num(mm.dieY1 - mm.dieY0) +
                 " um, diagonal " + num(mm.dieDiagonal) +
                 " um; cluster limit = " + num(ratio) + "% = " +
                 num(mm.dieDiagonal * ratio / 100.0) + " um");
    for (std::size_t g = 0; g < mm.groups.size(); ++g) {
        const auto& gr = mm.groups[g];
        c->print("# mbist_ctrl_" + std::to_string(g + 1) + ": " +
                 std::to_string(gr.members.size()) + " memories, centroid (" +
                 num(gr.cx) + ", " + num(gr.cy) + "), span " +
                 num(gr.x1 - gr.x0) + " x " + num(gr.y1 - gr.y0) + ", diagonal " +
                 num(std::hypot(gr.x1 - gr.x0, gr.y1 - gr.y0)));
    }
    // Blackboxes with no template: not silently dropped — each is either a memory that still
    // needs a library entry, or a hard macro that is genuinely not a memory.
    bool wroteHeader = false;
    for (const auto& mi : mm.instances) {
        if (mi.matched >= 0) continue;
        if (!wroteHeader) { c->print("# blackboxes with NO memory template:"); wroteHeader = true; }
        c->print("  " + mi.path + "  (" + mi.module + ")");
    }
    return TCL_OK;
}

/// set_memory_instance_options <inst-pattern> ?-partitioning_group <g>?
///     ?-physical_cluster_override <c>? ?-power_domain <p>? ?-test_clock_override <clk>?
///     ?-use_in_memory_bist_dft_specification on|off?
/// The user-forced half of the compatibility rules: CCR4 (partitioning_group) and the
/// overridable parts of CCR3. Accumulates in the session and is applied by report_mbist_plan.
int cmdSetMemoryInstanceOptions(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    if (objc < 2) {
        if (c->memInstOpts.empty()) { c->print("# no memory instance options set"); return TCL_OK; }
        for (const auto& o : c->memInstOpts) {
            std::string s = "  " + o.pattern;
            if (!o.partitioningGroup.empty()) s += " -partitioning_group " + o.partitioningGroup;
            if (!o.physicalCluster.empty()) s += " -physical_cluster_override " + o.physicalCluster;
            if (!o.powerDomain.empty()) s += " -power_domain " + o.powerDomain;
            if (!o.clockDomain.empty()) s += " -test_clock_override " + o.clockDomain;
            if (!o.controller.empty()) s += " -controller " + o.controller;
            if (o.stepIndex >= 0) s += " -step " + std::to_string(o.stepIndex);
            if (o.exclude) s += " -use_in_memory_bist_dft_specification off";
            c->print(s);
        }
        return TCL_OK;
    }
    DesignDb::MbistPlanOptions::InstanceOption io;
    io.pattern = Tcl_GetString(objv[1]);
    for (int i = 2; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        const auto next = [&]() -> std::string { return i + 1 < objc ? Tcl_GetString(objv[++i]) : ""; };
        if (a == "-partitioning_group") io.partitioningGroup = next();
        else if (a == "-physical_cluster_override") io.physicalCluster = next();
        else if (a == "-power_domain") io.powerDomain = next();
        else if (a == "-test_clock_override") io.clockDomain = next();
        else if (a == "-controller") io.controller = next();
        else if (a == "-step") { try { io.stepIndex = std::stoi(next()); } catch (...) {} }
        else if (a == "-use_in_memory_bist_dft_specification") io.exclude = (next() == "off");
        else {
            Tcl_SetObjResult(ip, Tcl_NewStringObj(("unknown option " + a).c_str(), -1));
            return TCL_ERROR;
        }
    }
    // Same pattern set twice: replace, so re-running a script does not stack duplicates.
    bool replaced = false;
    for (auto& o : c->memInstOpts)
        if (o.pattern == io.pattern) { o = io; replaced = true; break; }
    if (!replaced) c->memInstOpts.push_back(std::move(io));
    // Publish to the design so the GUI's mbist-plan query sees the same options the console set.
    c->db.setMemoryInstanceOptions(c->memInstOpts);
    return TCL_OK;
}

/// add_mbist_controller <name> <memory>... — put these memories on a controller of your own
/// ("把这几颗 memory 单独划到一个 controller"). Shorthand for set_memory_instance_options
/// -controller on each; the compatibility rules still run and any breach is reported.
/// `-step <n>` additionally pins them to one step.
int cmdAddMbistController(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    if (objc < 3) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj(
            "usage: add_mbist_controller <name> <memory>... ?-step <n>?", -1));
        return TCL_ERROR;
    }
    const std::string name = Tcl_GetString(objv[1]);
    int step = -1;
    std::vector<std::string> mems;
    for (int i = 2; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (a == "-step" && i + 1 < objc) {
            try { step = std::stoi(Tcl_GetString(objv[++i])); } catch (...) {}
        } else mems.push_back(a);
    }
    if (mems.empty()) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj("no memories given", -1));
        return TCL_ERROR;
    }
    for (const auto& pat : mems) {
        DesignDb::MbistPlanOptions::InstanceOption io;
        io.pattern = pat;
        io.controller = name;
        io.stepIndex = step;
        bool replaced = false;
        for (auto& o : c->memInstOpts)
            if (o.pattern == pat) { o.controller = name; o.stepIndex = step; replaced = true; break; }
        if (!replaced) c->memInstOpts.push_back(std::move(io));
    }
    c->db.setMemoryInstanceOptions(c->memInstOpts);
    autoWritePlan(c);
    c->print("# " + name + ": " + std::to_string(mems.size()) +
             " memory pattern(s) assigned — run report_mbist_plan to see the result");
    return TCL_OK;
}

/// remove_mbist_controller ?<name>? — drop user controller assignments (all, or one by name)
/// and hand those memories back to the automatic CCR partition.
int cmdRemoveMbistController(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    (void)ip;
    auto* c = ctxOf(cd);
    const std::string name = objc > 1 ? Tcl_GetString(objv[1]) : "";
    int n = 0;
    for (auto& o : c->memInstOpts)
        if (!o.controller.empty() && (name.empty() || o.controller == name)) {
            o.controller.clear();
            o.stepIndex = -1;
            ++n;
        }
    // An option row that now says nothing at all is dropped, so the plan file stays readable.
    c->memInstOpts.erase(std::remove_if(c->memInstOpts.begin(), c->memInstOpts.end(),
        [](const DesignDb::MbistPlanOptions::InstanceOption& o) {
            return o.controller.empty() && o.partitioningGroup.empty() &&
                   o.physicalCluster.empty() && o.powerDomain.empty() &&
                   o.clockDomain.empty() && o.stepIndex < 0 && !o.exclude;
        }), c->memInstOpts.end());
    c->db.setMemoryInstanceOptions(c->memInstOpts);
    autoWritePlan(c);
    c->print("# released " + std::to_string(n) + " assignment(s)");
    return TCL_OK;
}

/// rename_mbist_controller <old> <new> — rename a user controller in place; every memory
/// pattern currently assigned to <old> moves to <new>. Only user-defined controllers (see
/// add_mbist_controller) are named entities — a Step has no persisted identity (it is
/// recomputed by the packer on every plan) and a Memory's name is its design instance name,
/// so neither can be renamed here.
int cmdRenameMbistController(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    if (objc != 3) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj("usage: rename_mbist_controller <old> <new>", -1));
        return TCL_ERROR;
    }
    const std::string oldName = Tcl_GetString(objv[1]);
    const std::string newName = Tcl_GetString(objv[2]);
    int n = 0;
    for (auto& o : c->memInstOpts)
        if (o.controller == oldName) { o.controller = newName; ++n; }
    if (n == 0) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj(("no such controller: " + oldName).c_str(), -1));
        return TCL_ERROR;
    }
    c->db.setMemoryInstanceOptions(c->memInstOpts);
    autoWritePlan(c);
    c->print("# " + oldName + " renamed to " + newName + " (" + std::to_string(n) + " pattern(s))");
    return TCL_OK;
}

/// report_mbist_plan — the MemoryBIST partition: which controller tests which memories, in
/// which steps, and what that costs (power / cycles / runtime). Needs only the memory library
/// and the design; -def / -period / budgets are optional refinements.
int cmdReportMbistPlan(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    (void)ip;
    auto* c = ctxOf(cd);
    DesignDb::MbistPlanOptions o;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        const auto next = [&]() -> std::string { return i + 1 < objc ? Tcl_GetString(objv[++i]) : ""; };
        if (a == "-def") o.defFile = next();
        else if (a == "-physical_cluster_size_ratio" || a == "-ratio") {
            try { o.clusterSizeRatio = std::stod(next()); } catch (...) {}
        } else if (a == "-period") {
            try { o.defaultPeriodNs = std::stod(next()); } catch (...) {}
        } else if (a == "-clock_period") {           // -clock_period dco_clk 10
            const std::string nm = next();
            try { o.clockPeriods.emplace_back(nm, std::stod(next())); } catch (...) {}
        } else if (a == "-max_power_per_step") {
            try { o.maxPowerPerStepMw = std::stod(next()); } catch (...) {}
        } else if (a == "-max_memories_per_step") {
            try { o.maxMemoriesPerStep = std::stoi(next()); } catch (...) {}
        } else if (a == "-max_steps_per_controller") {
            try { o.maxStepsPerController = std::stoi(next()); } catch (...) {}
        } else if (a == "-max_test_time_per_controller") {
            try { o.maxTestTimePerControllerMs = std::stod(next()); } catch (...) {}
        } else if (!a.empty() && a[0] != '-' && o.libDir.empty()) {
            o.libDir = a;
        }
    }
    o.instanceOptions = c->memInstOpts;
    DesignDb::MbistPlan pl = c->db.mbistPlan(o);
    for (const auto& e : pl.errors) c->print("# " + e);
    if (pl.memories.empty()) {
        for (const auto& n : pl.notes) c->print("# " + n);
        return TCL_OK;
    }
    const auto f2 = [](double v) {
        std::string s = std::to_string(v);
        if (const auto d = s.find('.'); d != std::string::npos && s.size() > d + 3)
            s = s.substr(0, d + 3);
        return s;
    };
    c->print("# Controller Summary");
    c->print("#   controller                     clock       period  power(mW)  runtime(ns)   cycles      flops  memories  separated_by");
    for (const auto& ct : pl.controllers) {
        std::string line = "    " + ct.name;
        line.resize(std::max<std::size_t>(line.size(), 35), ' ');
        line += ct.clockDomain;
        line.resize(std::max<std::size_t>(line.size(), 47), ' ');
        line += f2(ct.periodNs) + "  " + f2(ct.powerMw) + "  " + f2(ct.runtimeNs) + "  " +
                std::to_string(ct.cycles) + "  " + std::to_string(ct.flops) + "  " +
                std::to_string(ct.memories.size()) + "  " +
                (ct.userDefined ? "[user] " : "") +
                (ct.ruleId.empty() ? "-" : ct.ruleId + ": " + ct.ruleWhy);
        c->print(line);
        for (const auto& v : ct.violations) c->print("        !! " + v);
    }
    c->print("# Step Summary");
    c->print("#   controller                     step  power(mW)  runtime(ns)   cycles   comparator     memories / separated_by");
    for (const auto& st : pl.steps) {
        const auto& ct = pl.controllers[static_cast<std::size_t>(st.controller)];
        std::string mems;
        for (int m : st.members) {
            const auto& mm2 = pl.memories[static_cast<std::size_t>(m)];
            mems += (mems.empty() ? "" : ", ") + mm2.path.substr(mm2.path.rfind('.') + 1);
        }
        std::string line = "    " + ct.name;
        line.resize(std::max<std::size_t>(line.size(), 35), ' ');
        line += "Step " + std::to_string(st.index) + "  " + f2(st.powerMw) + "  " +
                f2(st.runtimeNs) + "  " + std::to_string(st.cycles) + "  " + st.comparator +
                "  " + mems +
                (st.ruleId.empty() ? "" : "   [new step: " + st.ruleId + " " + st.ruleWhy + "]");
        c->print(line);
    }
    c->print("# Memory Summary");
    c->print("#   memory                              controller                     step  ifid  type  words  width  clock       power(mW)  cycles");
    for (const auto& m : pl.memories) {
        const auto& ct = pl.controllers[static_cast<std::size_t>(m.controller)];
        std::string line = "    " + m.path;
        line.resize(std::max<std::size_t>(line.size(), 40), ' ');
        line += ct.name;
        line.resize(std::max<std::size_t>(line.size(), 71), ' ');
        line += std::to_string(m.step) + "  " + m.interfaceId + "  " + m.type + "  " +
                std::to_string(m.words) + "  " + std::to_string(m.width) + "  " +
                m.clockDomain + "  " + f2(m.powerMw) + "  " + std::to_string(m.cycles);
        c->print(line);
    }
    // The rule ledger: every CCR/SCR, whether this design has anything for it to act on, and
    // how many controllers/steps it actually caused. A rule with 0 splits is not a rule that
    // was skipped — it is a rule everything already satisfied.
    c->print("# Compatibility Rules (CCR = controller, SCR = step)");
    for (const auto& r : pl.rules) {
        std::string line = "    " + r.id;
        line.resize(std::max<std::size_t>(line.size(), 12), ' ');
        line += (r.applies ? (r.splits ? "split x" + std::to_string(r.splits) : "satisfied")
                           : "n/a      ");
        line.resize(std::max<std::size_t>(line.size(), 26), ' ');
        line += r.title;
        c->print(line);
    }
    c->print("# total: " + std::to_string(pl.controllers.size()) + " controller(s), " +
             std::to_string(pl.steps.size()) + " step(s), " +
             std::to_string(pl.memories.size()) + " memory instance(s); test time " +
             f2(pl.totalRuntimeNs / 1e6) + " ms (controllers run concurrently), peak power " +
             f2(pl.peakPowerMw) + " mW");
    for (const auto& n : pl.notes) c->print("# note: " + n);
    return TCL_OK;
}

/// set_phase_constraint <shift|sac|asc> <pin>... <0|1|X> — what the DFT signals are held at in
/// one test phase. X removes it. No argument reports what is set.
int cmdSetPhaseConstraint(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    static const char* kPhases[] = {"shift", "sac", "asc"};
    if (objc < 2) {
        for (const char* ph : kPhases) {
            const auto it = c->phaseCons.find(ph);
            if (it == c->phaseCons.end() || it->second.empty()) { c->print(std::string(ph) + ": (none)"); continue; }
            std::string l = std::string(ph) + ":";
            for (const auto& pc : it->second) l += "  " + c->show(pc.pin) + "=" + std::string(1, pc.value);
            c->print(l);
        }
        return TCL_OK;
    }
    const std::string phase = Tcl_GetString(objv[1]);
    bool known = false;
    for (const char* ph : kPhases) if (phase == ph) known = true;
    if (!known) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj(
            "set_phase_constraint: phase must be shift, sac or asc", -1));
        return TCL_ERROR;
    }
    auto args = flatArgs(ip, objc, objv, 2);
    if (args.size() < 2) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj(
            "usage: set_phase_constraint <shift|sac|asc> <pin>... <0|1|X>", -1));
        return TCL_ERROR;
    }
    const std::string vs = args.back();
    args.pop_back();
    const char v = static_cast<char>(std::toupper(static_cast<unsigned char>(vs[0])));
    if (vs.size() != 1 || (v != '0' && v != '1' && v != 'X')) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj("set_phase_constraint: value must be 0, 1 or X", -1));
        return TCL_ERROR;
    }
    auto& list = c->phaseCons[phase];
    for (auto& raw : args) {
        const std::string pin = normSep(raw);
        auto it = std::find_if(list.begin(), list.end(),
                               [&](const PinConstraint& x) { return x.pin == pin; });
        if (v == 'X') {
            if (it != list.end()) { list.erase(it); c->print(phase + ": cleared " + c->show(pin)); }
            continue;
        }
        if (it != list.end()) it->value = v;
        else list.push_back({pin, v});
        c->print(phase + ": " + c->show(pin) + " = " + std::string(1, v));
    }
    autoWritePlan(c);
    return TCL_OK;
}

/// report_reset_states [-sdc file] [-verbose] — the SHIFT-phase verification, per register.
///
/// The question a reset plan has to answer is not "how many violations are left" but "is EVERY
/// register held inactive while the chain shifts". This states that per group: the value the
/// calculus computes at the flop, the value the reset needs, and whether a planned mux is what
/// makes it so. Active-high reset -> inactive is 0; active-low -> 1.
int cmdReportResetStates(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    std::string sdc = c->sdcFile;
    bool verbose = false;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (a == "-sdc" && i + 1 < objc) sdc = Tcl_GetString(objv[++i]);
        else if (a == "-verbose") verbose = true;
    }
    // One walk per phase: same netlist, same calculus, different DFT-signal constraints. That is
    // the whole difference between the phases, and running them separately is what lets one line
    // say "inactive while shifting, controllable in stuck-at, quiet through the transition".
    const auto walkPhase = [&](const char* phase) {
        return c->db.clockResetTree(sdc, c->dftLib, {}, phaseQueryFor(c, phase));
    };
    ClockResetTreeResult sh = walkPhase("shift");
    ClockResetTreeResult sac = walkPhase("sac");
    ClockResetTreeResult asc = walkPhase("asc");
    // Same enumeration order, same design -> index-aligned. Guarded anyway.
    const auto at = [](const ClockResetTreeResult& r, std::size_t i) {
        return i < r.items.size() ? r.items[i].value : std::string("?");
    };

    int bits = 0, okBits = 0, planBits = 0, badBits = 0, groups = 0, badGroups = 0, ascBad = 0;
    for (std::size_t k = 0; k < sh.items.size(); ++k) {
        const auto& i = sh.items[k];
        if (i.kind != "reset") continue;
        ++groups;
        bits += i.flopCount;
        if (!i.ok) { ++badGroups; badBits += i.flopCount; }
        else if (i.plannedFix) planBits += i.flopCount;
        else okBits += i.flopCount;
        // at-speed capture must stay inactive throughout; stuck-at may be either value.
        const std::string vAsc = at(asc, k);
        const bool ascOk = vAsc == i.inactive;
        if (!ascOk) ++ascBad;
        // s(v)-sac(v)/asc(v): shift, stuck-at capture, at-speed capture — the three states one
        // wire has to be right in, in the order they run.
        const std::string label = "s(" + i.value + ")-sac(" + at(sac, k) + ")/asc(" + vAsc + ")";
        if (verbose || !i.ok || !ascOk)
            c->print(std::string("  ") + (i.ok ? (i.plannedFix ? "[PLAN] " : "[ OK ] ") : "[FAIL] ") +
                     c->show(i.ownerInstanceId) + "/" + i.net +
                     "  active=" + (i.edge == "negedge" ? "low" : "high") +
                     "  inactive=" + i.inactive + "  " + label +
                     (i.inverted ? "  (inverted path)" : "") +
                     "  flops=" + std::to_string(i.flopCount));
    }
    c->print("scan-shift reset state: " + std::to_string(groups) + " group(s), " +
             std::to_string(bits) + " register bit(s)");
    c->print("  inactive in the netlist as it stands : " + std::to_string(okBits) + " bit(s)");
    c->print("  inactive only via a PLANNED mux      : " + std::to_string(planBits) + " bit(s)");
    c->print("  NOT inactive                         : " + std::to_string(badBits) + " bit(s)" +
             (badGroups ? "  <- these will not shift" : "  <- every register is inactive"));
    c->print("  not inactive in AT-SPEED capture     : " + std::to_string(ascBad) + " group(s)" +
             (ascBad ? "  <- a reset firing here destroys the transition" : ""));
    if (c->phaseCons.empty())
        c->print("# note: no set_phase_constraint yet — sac/asc were walked with the shift setup, "
                 "so their columns repeat it. State each phase to get three real answers.");
    Tcl_SetObjResult(ip, Tcl_NewIntObj(badBits));
    return TCL_OK;
}

/// report_clock_tree / report_reset [-sdc file] [-unconstrained]
int cmdReportCr(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    const std::string cmd = Tcl_GetString(objv[0]);
    const bool wantReset = (cmd == "report_reset");
    std::string sdc;
    bool onlyBad = false;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (a == "-sdc" && i + 1 < objc) sdc = Tcl_GetString(objv[++i]);
        else if (a == "-unconstrained" || a == "-violations") onlyBad = true;
    }
    ClockResetTreeResult r = c->db.clockResetTree(sdc, c->dftLib, {}, consQuery(c));
    for (auto& e : r.sdcErrors) c->print("# sdc: " + e);
    int n = 0;
    for (auto& i : r.items) {
        if ((i.kind == "reset") != wantReset) continue;
        const bool bad = wantReset ? !i.ok : (i.value != "010" && i.value != "101");
        if (onlyBad && !bad) continue;
        ++n;
        std::string line = "  " + c->show(i.ownerInstanceId) + "/" + i.net +
                           "  " + i.edge + "  value=" + i.value +
                           "  src=" + i.terminus + (i.detail.empty() ? "" : ":" + c->show(i.detail)) +
                           "  flops=" + std::to_string(i.flopCount);
        if (!i.clockName.empty()) line += "  clock=" + i.clockName;
        if (wantReset) line += std::string("  inactive=") + i.inactive + (i.ok ? "  OK" : "  **NOT INACTIVE**");
        c->print(line);
    }
    c->print((wantReset ? "reset groups: " : "clock groups: ") + std::to_string(n));
    Tcl_SetObjResult(ip, Tcl_NewIntObj(n));
    return TCL_OK;
}

int cmdWriteOcc(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    // Default: the auto-write file when an output dir is configured, else the cwd file.
    const std::string path = objc > 1 ? Tcl_GetString(objv[1])
                             : c->occOutDir.empty() ? "dfx_occ_def_point.tcl"
                                                    : c->occOutDir + "/dfx_occ_def_point.tcl";
    std::ofstream f(path);
    if (!f) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj(("cannot write " + path).c_str(), -1));
        return TCL_ERROR;
    }
    f << renderOccText(c->occ, [&](const std::string& id) { return c->show(id); });
    c->print("wrote " + std::to_string(c->occ.size()) + " OCC definition point(s) to " + path);
    return TCL_OK;
}

/// add_clocks [off_state] <port/pin>... [-label L]
/// The off_state (0/1) is the value the clock rests at — a clock with no declared off state
/// cannot be held quiet in test, so we require it rather than guessing.
int cmdAddClocks(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    std::string off, label;
    std::vector<std::string> nodes;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if ((a == "-label" || a == "-Label") && i + 1 < objc) label = Tcl_GetString(objv[++i]);
        else if (!a.empty() && a[0] == '-') continue;
        else if (off.empty() && (a == "0" || a == "1")) off = a;
        else {
            int n = 0; Tcl_Obj** el = nullptr;
            if (Tcl_ListObjGetElements(ip, objv[i], &n, &el) == TCL_OK && n > 0)
                for (int k = 0; k < n; ++k) nodes.emplace_back(Tcl_GetString(el[k]));
            else nodes.emplace_back(a);
        }
    }
    if (off.empty() || nodes.empty()) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj("usage: add_clocks <0|1> <port/pin>... [-label L]", -1));
        return TCL_ERROR;
    }
    for (auto& raw : nodes) {
        const std::string n = normSep(raw);
        auto it = std::find_if(c->clocks.begin(), c->clocks.end(),
                               [&](const UserClock& u) { return u.node == n; });
        if (it != c->clocks.end()) { it->offState = off; it->label = label; c->print("# updated clock " + c->show(n)); }
        else { c->clocks.push_back({n, off, label}); c->print("added clock " + c->show(n) + "  off_state=" + off); }
    }
    return TCL_OK;
}

// Defined below (near cmdReadSdc); forward-declared so cmdReportClocks (-Sdc) can share it
// instead of re-running its own no-op clockResetTree("") call.
void printSdcClockSummary(DpShell::Impl* c, const std::string& file);

int cmdReportClocks(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    bool wantSdc = true, wantUser = true;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (a == "-Sdc" || a == "-sdc") wantUser = false;
        else if (a == "-User" || a == "-user") wantSdc = false;
    }
    if (wantUser) {
        c->print("user clocks (" + std::to_string(c->clocks.size()) + "):");
        for (auto& u : c->clocks)
            c->print("  " + c->show(u.node) + "  off_state=" + u.offState +
                     (u.label.empty() ? "" : "  label=" + u.label));
    }
    if (wantSdc) printSdcClockSummary(c, c->sdcFile);
    Tcl_SetObjResult(ip, Tcl_NewIntObj(static_cast<int>(c->clocks.size())));
    return TCL_OK;
}

/// add_dft_signals <name>... -source_nodes <pin>
int cmdAddDftSignals(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    std::string src;
    int value = 1;              // test-mode value; -value 0 for an active-low control
    std::vector<std::string> names;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if ((a == "-source_nodes" || a == "-source") && i + 1 < objc) src = Tcl_GetString(objv[++i]);
        // NB: this must consume its argument, otherwise the value itself falls through to the
        // name branch below and `add_dft_signals scan_enable -value 1` creates a signal called "1".
        else if (a == "-value" && i + 1 < objc) {
            int v = 1;
            if (Tcl_GetIntFromObj(ip, objv[++i], &v) == TCL_OK) value = (v != 0) ? 1 : 0;
        }
        else if (!a.empty() && a[0] == '-') continue;
        else {
            int n = 0; Tcl_Obj** el = nullptr;
            if (Tcl_ListObjGetElements(ip, objv[i], &n, &el) == TCL_OK && n > 0)
                for (int k = 0; k < n; ++k) names.emplace_back(Tcl_GetString(el[k]));
            else names.emplace_back(a);
        }
    }
    if (names.empty()) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj("usage: add_dft_signals <name>... -source_nodes <pin>", -1));
        return TCL_ERROR;
    }
    for (auto& n : names) {
        auto it = std::find_if(c->signals.begin(), c->signals.end(),
                               [&](const DftSignal& s) { return s.name == n; });
        if (it != c->signals.end()) { it->source = normSep(src); c->print("# updated dft signal " + n); }
        else { c->signals.push_back({n, normSep(src)}); c->print("added dft signal " + n +
                                                               (src.empty() ? "" : "  <- " + c->show(c->absPath(src)))); }
    }
    return TCL_OK;
}

int cmdReportDftSignals(ClientData cd, Tcl_Interp* ip, int, Tcl_Obj* const[]) {
    auto* c = ctxOf(cd);
    c->print("dft signals (" + std::to_string(c->signals.size()) + "):");
    for (auto& s : c->signals)
        c->print("  " + s.name + (s.source.empty() ? "" : "  <- " + c->show(s.source)));
    Tcl_SetObjResult(ip, Tcl_NewIntObj(static_cast<int>(c->signals.size())));
    return TCL_OK;
}

// --- DRC rules. Ids are OURS (C* = clock, R* = reset); severity is user-tunable, mirroring the
// familiar set_drc_handling workflow so a check can be demoted without editing scripts.
struct DrcRule { const char* id; const char* desc; };
const DrcRule kRules[] = {
    {"C1", "clock pin is not driven by a defined clock (value X)"},
    {"C2", "clock is held at a constant (never pulses)"},
    {"C3", "clock passes through combinational logic that blocks the edge"},
    {"R1", "async reset is not at its inactive value in test"},
    {"R2", "async reset value is unknown (X)"},
};

std::string severityOf(DpShell::Impl* c, const std::string& id) {
    auto it = c->drcSeverity.find(id);
    return it == c->drcSeverity.end() ? "Error" : it->second;
}

/// set_drc_handling <rule_id> <Error|Warning|Note|Ignore>
int cmdSetDrcHandling(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    if (objc < 3) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj("usage: set_drc_handling <rule_id> <Error|Warning|Note|Ignore>", -1));
        return TCL_ERROR;
    }
    const std::string id = Tcl_GetString(objv[1]);
    std::string sev = Tcl_GetString(objv[2]);
    if (!sev.empty()) sev[0] = static_cast<char>(std::toupper(sev[0]));
    if (sev != "Error" && sev != "Warning" && sev != "Note" && sev != "Ignore") {
        Tcl_SetObjResult(ip, Tcl_NewStringObj("severity must be Error|Warning|Note|Ignore", -1));
        return TCL_ERROR;
    }
    if (std::none_of(std::begin(kRules), std::end(kRules), [&](const DrcRule& r) { return id == r.id; })) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj(("unknown rule id: " + id).c_str(), -1));
        return TCL_ERROR;
    }
    c->drcSeverity[id] = sev;
    c->print("set_drc_handling " + id + " " + sev);
    return TCL_OK;
}

/// report_drc_rules [-sdc F] [-Summary | -All_fails | <rule_id>...]
int cmdReportDrcRules(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    std::string sdc;
    bool summary = false;
    std::vector<std::string> only;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (a == "-sdc" && i + 1 < objc) sdc = Tcl_GetString(objv[++i]);
        else if (a == "-Summary" || a == "-summary" || a == "-Fails_summary") summary = true;
        else if (!a.empty() && a[0] == '-') continue;
        else only.push_back(a);
    }
    auto wanted = [&](const std::string& id) {
        return only.empty() || std::find(only.begin(), only.end(), id) != only.end();
    };
    ClockResetTreeResult r = c->db.clockResetTree(sdc, c->dftLib, {}, consQuery(c));
    for (auto& e : r.sdcErrors) c->print("# sdc: " + e);

    std::map<std::string, std::vector<std::string>> fails;
    for (auto& i : r.items) {
        const std::string where = c->show(i.ownerInstanceId) + "/" + i.net +
                                  "  (x" + std::to_string(i.flopCount) + " flops)";
        if (i.kind == "clock") {
            if (i.value == "X") {
                fails[i.terminus == "logic" ? "C3" : "C1"].push_back(where + "  src=" + i.terminus +
                    (i.detail.empty() ? "" : ":" + c->show(i.detail)));
            } else if (i.value == "0" || i.value == "1") {
                fails["C2"].push_back(where + "  held at " + i.value);
            }
        } else {
            if (i.value == "X") fails["R2"].push_back(where);
            else if (!i.ok) fails["R1"].push_back(where + "  value=" + i.value + " inactive=" + i.inactive);
        }
    }
    int total = 0;
    for (const DrcRule& rule : kRules) {
        if (!wanted(rule.id)) continue;
        const std::string sev = severityOf(c, rule.id);
        if (sev == "Ignore") continue;
        auto it = fails.find(rule.id);
        const int n = it == fails.end() ? 0 : static_cast<int>(it->second.size());
        if (n) total += n;
        c->print(std::string(rule.id) + " [" + sev + "]  " + rule.desc + " — " +
                 std::to_string(n) + " occurrence(s)");
        if (!summary && it != fails.end())
            for (auto& w : it->second) c->print("    " + w);
    }
    c->print("total DRC occurrences: " + std::to_string(total));
    Tcl_SetObjResult(ip, Tcl_NewIntObj(total));
    return TCL_OK;
}

/// set_dft_lib <dft_lib_setting.yaml>  — the cell library that lets the clock walk climb
/// THROUGH ICG/buffer/inverter cells (their `clock_in` pin is declared there).
/// set_scope <name> — declares WHICH analysis the following commands configure, so one script
/// can hold the setup for several (drc_analysis, occ_insertion, …) without the tool guessing.
int cmdSetScope(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    if (objc < 2) {
        c->print(c->scope.empty() ? "no scope set" : "scope: " + c->scope);
        Tcl_SetObjResult(ip, Tcl_NewStringObj(c->scope.c_str(), -1));
        return TCL_OK;
    }
    c->scope = Tcl_GetString(objv[1]);
    c->print("scope: " + c->scope);
    return TCL_OK;
}

/// 3-decimal, trailing-zero-trimmed period/frequency text — matches sdc-core/clockgen.cpp's own
/// formatting so a number printed here reads the same as the one in the SDC tab's Clocks panel.
std::string fmtSdcNum(double v) {
    std::ostringstream ss;
    ss.setf(std::ios::fixed);
    ss << std::setprecision(3) << v;
    std::string s = ss.str();
    if (s.find('.') != std::string::npos) {
        std::size_t last = s.find_last_not_of('0');
        if (s[last] == '.') --last;
        s.erase(last + 1);
    }
    return s;
}

/// Actually parse `file` (not just remember it) and print what it resolved to: master-clock
/// inference and generated-clock period math already applied (sdc-core/clockgen.cpp — the same
/// engine behind the SDC tab's "Clocks & add_clock" panel), so this is a real read, not an echo
/// of the path. Shared by `read_sdc`/`load_sdc` (given a file) and `report_clocks -sdc` (given
/// none — reports on whatever `read_sdc` last set).
void printSdcClockSummary(DpShell::Impl* c, const std::string& file) {
    if (file.empty()) { c->print("no SDC set"); return; }
    SdcObjectSet s = c->db.sdcObjects();
    sdc::DesignObjects sobjs;
    if (!s.truncated) {
        sobjs.ports = std::move(s.ports);
        sobjs.inputs = std::move(s.inputs);
        sobjs.outputs = std::move(s.outputs);
        sobjs.pins = std::move(s.pins);
        sobjs.nets = std::move(s.nets);
        sobjs.cells = std::move(s.cells);
    }
    sdc::LintOptions lopt;
    lopt.designAware = !s.truncated;
    const sdc::LintReport rep = sdc::lintFile(file, lopt, sobjs);
    if (!rep.summary.tclAvailable) { c->print("no embedded Tcl interpreter — cannot read SDC"); return; }
    if (rep.summary.commands == 0) { c->print("cannot read " + file); return; }
    const sdc::ClockGenResult gen = sdc::generateClocks(rep.clocks);
    c->print("sdc: " + file);
    const int errors = rep.count(sdc::Severity::Error);
    if (errors)
        c->print("  " + std::to_string(errors) + " syntax/command error(s) — see the SDC tab for detail");
    for (const sdc::GeneratedClock& g : gen.clocks) {
        std::string line = "  " + (g.name.empty() ? std::string("(unnamed)") : g.name);
        line += g.period > 0 ? "  " + fmtSdcNum(g.period) + "ns" : "  period?";
        line += g.generated ? "  generated" : "  primary";
        if (!g.masterClock.empty())
            line += "  <- " + g.masterClock + (g.masterInferred ? " (inferred)" : "");
        c->print(line);
    }
    c->print(std::to_string(gen.clocks.size()) + " clock(s), " +
             std::to_string(gen.warnings.size()) + " warning(s)");
    for (const std::string& w : gen.warnings) c->print("  ! " + w);
}

/// read_sdc <file> — the functional SDC the value calculus is based on. Parses it immediately
/// and prints what it resolved to (not just an echo of the path) — `load_sdc` is the same
/// command under the name people reach for first. `read_sdc` with no argument reports what a
/// prior call set, same as before.
int cmdReadSdc(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    if (objc < 2) {
        c->print(c->sdcFile.empty() ? "no SDC set" : "sdc: " + c->sdcFile);
        Tcl_SetObjResult(ip, Tcl_NewStringObj(c->sdcFile.c_str(), -1));
        return TCL_OK;
    }
    c->sdcFile = Tcl_GetString(objv[1]);
    printSdcClockSummary(c, c->sdcFile);
    return TCL_OK;
}

/// run_drc — execute the clock/reset DRC with whatever this scope has been given, and report
/// the rule counts. The GUI issues exactly this, so a console session and a button press are
/// the same operation and a script can reproduce either.
int cmdRunDrc(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    (void)objc; (void)objv;
    if (!c->scope.empty() && c->scope != "drc_analysis")
        c->print("# note: current scope is '" + c->scope + "', running the DRC anyway");
    ScanModeInput scan;
    for (auto& o : c->occ) scan.occPoints.push_back(o.pin);
    for (auto& sg : c->signals) scan.forces.emplace_back(sg.name, sg.value != 0);
    CrQuery q = consQuery(c);
    c->print("run_drc: sdc=" + (c->sdcFile.empty() ? std::string("<none>") : c->sdcFile) +
             "  lib=" + (c->dftLib.empty() ? std::string("<none>") : c->dftLib) +
             "  occPoints=" + std::to_string(scan.occPoints.size()) +
             "  dftSignals=" + std::to_string(scan.forces.size()));
    if (!q.pinConstraints.empty())
        c->print("  applying " + std::to_string(q.pinConstraints.size()) + " pin constraint(s)");
    ClockResetTreeResult r = c->db.clockResetTree(c->sdcFile, c->dftLib, scan, q);
    for (auto& e : r.sdcErrors) c->print("# " + e);
    int clk = 0, rst = 0, badClk = 0, badRst = 0, seqRst = 0, noOcc = 0;
    for (auto& i : r.items) {
        if (i.kind == "clock") {
            ++clk;
            if (i.value != "010" && i.value != "101") ++badClk;
            if (i.scanChecked && !i.scanOcc) ++noOcc;
        } else {
            ++rst;
            if (i.terminus == "sequential") ++seqRst;
            else if (!i.ok) ++badRst;
        }
    }
    c->print("  clock groups " + std::to_string(clk) + ", violations " + std::to_string(badClk));
    c->print("  reset groups " + std::to_string(rst) + ", violations " + std::to_string(badRst) +
             ", from a register (R3) " + std::to_string(seqRst));
    if (!scan.occPoints.empty())
        c->print("  clocks not reaching an OCC point (S1): " + std::to_string(noOcc));
    Tcl_SetObjResult(ip, Tcl_NewIntObj(badClk + badRst + seqRst));
    return TCL_OK;
}

/// write_drc_script <file> — emit the replayable setup for this scope.
int cmdWriteDrcScript(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    const std::string path = objc > 1 ? Tcl_GetString(objv[1]) : "dfx_drc.tcl";
    std::ofstream f(path);
    if (!f) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj(("cannot write " + path).c_str(), -1));
        return TCL_ERROR;
    }
    const char nl = '\n';
    f << "# DFT DRC setup - replay with: dft_planner -script " << path << nl;
    f << "set_scope drc_analysis" << nl;
    if (!c->sdcFile.empty()) f << "read_sdc " << c->sdcFile << nl;
    if (!c->dftLib.empty()) f << "set_dft_lib " << c->dftLib << nl;
    for (auto& sg : c->signals)
        f << "add_dft_signals " << sg.name << " -value " << sg.value << nl;
    for (auto& pc : c->pinCons)
        f << "add_pin_constraint " << c->show(pc.pin) << " " << pc.value << nl;
    for (auto& x : c->ips) {
        f << "add_dft_ip " << x.module << " -instance " << x.instance;
        if (!x.at.empty()) f << " -at " << c->show(x.at);
        if (!x.comment.empty()) f << " -comment {" << x.comment << "}";
        f << nl;
    }
    for (auto& o : c->occ) {
        f << "add_occ_point " << c->show(o.pin);
        if (!o.clock.empty()) f << " -clock " << o.clock;
        f << nl;
    }
    f << "run_drc" << nl;
    c->print("wrote " + path);
    Tcl_SetObjResult(ip, Tcl_NewStringObj(path.c_str(), -1));
    return TCL_OK;
}

/// add_pin_constraint <pin>... <0|1|X|Z> — pin value for the DRC value calculus. 0/1 force the
/// pin (applied to the FUNCTIONAL analysis, so the scan pass inherits them); X clears an earlier
/// force; Z marks the pin explicitly floating (analyzed like unconstrained). Re-run run_drc (or
/// click Run DRC) to see the effect — nothing re-runs implicitly.
/// add_dft_connection <from_pin> <to_pin> | <pin> -constant <0|1> [-comment T]
int cmdAddConn(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    std::vector<std::string> pos;
    std::string constant, comment;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (a == "-constant" && i + 1 < objc) constant = Tcl_GetString(objv[++i]);
        else if (a == "-comment" && i + 1 < objc) comment = Tcl_GetString(objv[++i]);
        else if (!a.empty() && a[0] != '-') pos.push_back(a);
    }
    if (pos.empty() || (constant.empty() && pos.size() < 2)) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj(
            "usage: add_dft_connection <from_pin> <to_pin> | <pin> -constant <0|1>", -1));
        return TCL_ERROR;
    }
    if (!constant.empty() && constant != "0" && constant != "1") {
        Tcl_SetObjResult(ip, Tcl_NewStringObj("add_dft_connection: -constant wants 0 or 1", -1));
        return TCL_ERROR;
    }
    DftConn cn;
    cn.from = userSep(pos[0]);
    cn.to = constant.empty() ? userSep(pos[1]) : std::string();
    cn.constant = constant;
    cn.comment = comment;
    // A pin can be driven once. Recording it again REPLACES, so re-clicking a wire in the GUI
    // fixes the plan instead of silently stacking two drivers on one input.
    const std::string key = constant.empty() ? cn.to : cn.from;
    auto it = std::find_if(c->conns.begin(), c->conns.end(), [&](const DftConn& x) {
        return (x.constant.empty() ? x.to : x.from) == key;
    });
    if (it != c->conns.end()) { *it = cn; c->print("updated connection on " + key); }
    else {
        c->conns.push_back(cn);
        c->print(cn.constant.empty() ? "connected " + cn.from + " -> " + cn.to
                                     : "tied " + cn.from + " = " + cn.constant);
    }
    autoWritePlan(c);
    return TCL_OK;
}

/// remove_dft_connection <pin>... — by either end.
int cmdRemoveConn(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    for (auto& raw : flatArgs(ip, objc, objv, 1)) {
        const std::string p = userSep(raw);
        const auto n = std::remove_if(c->conns.begin(), c->conns.end(),
                                      [&](const DftConn& x) { return x.from == p || x.to == p; });
        if (n == c->conns.end()) c->print("# no connection on " + p);
        else { c->conns.erase(n, c->conns.end()); c->print("removed connection on " + p); }
    }
    autoWritePlan(c);
    return TCL_OK;
}

int cmdReportConns(ClientData cd, Tcl_Interp* ip, int, Tcl_Obj* const[]) {
    auto* c = ctxOf(cd);
    if (c->conns.empty()) c->print("no planned connections");
    else {
        c->print("planned connections (" + std::to_string(c->conns.size()) + "):");
        for (auto& x : c->conns)
            c->print("  " + x.from + (x.constant.empty() ? " -> " + x.to
                                                         : "  = " + x.constant));
    }
    Tcl_SetObjResult(ip, Tcl_NewIntObj(static_cast<int>(c->conns.size())));
    return TCL_OK;
}

/// write_dft_instantiation [file] — the create_instance / create_connection script.
int cmdWriteInst(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    std::string path = objc > 1 ? Tcl_GetString(objv[1]) : "";
    if (path.empty())
        path = (c->occOutDir.empty() ? std::string(".") : c->occOutDir) + "/dfx_instantiation.tcl";
    std::ofstream f(path);
    if (!f) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj(("cannot write " + path).c_str(), -1));
        return TCL_ERROR;
    }
    f << renderInstText(c->ips, c->conns);
    c->print("wrote " + path);
    Tcl_SetObjResult(ip, Tcl_NewStringObj(path.c_str(), -1));
    return TCL_OK;
}

/// report_dft_instantiation — the same script, printed rather than written.
int cmdReportInst(ClientData cd, Tcl_Interp*, int, Tcl_Obj* const[]) {
    auto* c = ctxOf(cd);
    const std::string t = renderInstText(c->ips, c->conns);
    c->print(t.empty() ? "# nothing planned yet — add_dft_ip / add_dft_connection first"
                       : t.substr(0, t.size() - (t.back() == '\n' ? 1 : 0)));
    return TCL_OK;
}

int cmdAddPinConstraint(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    auto args = flatArgs(ip, objc, objv, 1);
    if (args.size() < 2) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj("usage: add_pin_constraint <pin>... <0|1|X|Z>", -1));
        return TCL_ERROR;
    }
    std::string vs = args.back();
    args.pop_back();
    char v = static_cast<char>(std::toupper(static_cast<unsigned char>(vs[0])));
    if (vs.size() != 1 || (v != '0' && v != '1' && v != 'X' && v != 'Z')) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj(("add_pin_constraint: bad value '" + vs +
                                               "' (want 0|1|X|Z)").c_str(), -1));
        return TCL_ERROR;
    }
    for (auto& raw : args) {
        const std::string pin = c->absPath(raw);
        if (c->db.findObjects(pin, "pin,port,net", 1).objects.empty())
            c->print("# WARNING: " + c->show(pin) + " matches no pin/port/net in the design");
        auto it = std::find_if(c->pinCons.begin(), c->pinCons.end(),
                               [&](const PinConstraint& pc) { return pc.pin == pin; });
        if (v == 'X') {
            if (it != c->pinCons.end()) { c->pinCons.erase(it); c->print("cleared constraint on " + c->show(pin)); }
            else c->print("# no constraint on " + c->show(pin));
            continue;
        }
        if (it != c->pinCons.end()) it->value = v;
        else c->pinCons.push_back({pin, v});
        c->print("pin constraint: " + c->show(pin) + " = " + std::string(1, v));
    }
    autoWritePlan(c);
    return TCL_OK;
}

int cmdReportPinConstraints(ClientData cd, Tcl_Interp* ip, int, Tcl_Obj* const[]) {
    auto* c = ctxOf(cd);
    if (c->pinCons.empty()) c->print("no pin constraints");
    else {
        c->print("pin constraints (" + std::to_string(c->pinCons.size()) + "):");
        for (auto& pc : c->pinCons)
            c->print("  " + c->show(pc.pin) + " = " + std::string(1, pc.value));
    }
    Tcl_SetObjResult(ip, Tcl_NewIntObj(static_cast<int>(c->pinCons.size())));
    return TCL_OK;
}

/// add_dft_ip <module> -instance <name> [-at <scope>] [-comment T] — record a PLANNED DFX IP
/// instantiation (dfx_dynamic_hyper_ctl, dfx_static_hyper_ctl_tdr, …). Recorded only; the
/// user's insertion flow does the actual edit. Idempotent per instance name.
int cmdAddDftIp(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    std::string module, inst, at, comment;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (a == "-instance" && i + 1 < objc) inst = Tcl_GetString(objv[++i]);
        else if (a == "-at" && i + 1 < objc) at = c->absPath(Tcl_GetString(objv[++i]));
        else if (a == "-comment" && i + 1 < objc) comment = Tcl_GetString(objv[++i]);
        else if (!a.empty() && a[0] != '-' && module.empty()) module = a;
    }
    if (module.empty() || inst.empty()) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj(
            "usage: add_dft_ip <module> -instance <name> [-at <scope>] [-comment T]", -1));
        return TCL_ERROR;
    }
    auto it = std::find_if(c->ips.begin(), c->ips.end(),
                           [&](const DftIp& x) { return x.instance == inst; });
    if (it != c->ips.end()) {
        it->module = module;
        if (!at.empty()) it->at = at;
        if (!comment.empty()) it->comment = comment;
        c->print("# updated DFX IP: " + inst + " (" + module + ")");
    } else {
        c->ips.push_back({module, inst, at, comment});
        c->print("planned DFX IP: " + module + " " + inst +
                 (at.empty() ? "" : "  at " + c->show(at)));
    }
    autoWritePlan(c);
    return TCL_OK;
}

int cmdRemoveDftIp(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    for (auto& raw : flatArgs(ip, objc, objv, 1)) {
        const auto n = std::remove_if(c->ips.begin(), c->ips.end(),
                                      [&](const DftIp& x) { return x.instance == raw; });
        if (n == c->ips.end()) c->print("# not a planned DFX IP: " + raw);
        else { c->ips.erase(n, c->ips.end()); c->print("removed DFX IP: " + raw); }
    }
    autoWritePlan(c);
    return TCL_OK;
}

int cmdReportDftIps(ClientData cd, Tcl_Interp* ip, int, Tcl_Obj* const[]) {
    auto* c = ctxOf(cd);
    if (c->ips.empty()) c->print("no planned DFX IPs");
    else {
        c->print("planned DFX IPs (" + std::to_string(c->ips.size()) + "):");
        for (auto& x : c->ips)
            c->print("  " + x.module + "  " + x.instance +
                     (x.at.empty() ? "" : "  at " + c->show(x.at)) +
                     (x.comment.empty() ? "" : "  # " + x.comment));
    }
    Tcl_SetObjResult(ip, Tcl_NewIntObj(static_cast<int>(c->ips.size())));
    return TCL_OK;
}

int cmdSetDftLib(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    if (objc < 2) {
        c->print(c->dftLib.empty() ? "no dft_lib_setting.yaml set" : "dft lib: " + c->dftLib);
        Tcl_SetObjResult(ip, Tcl_NewStringObj(c->dftLib.c_str(), -1));
        return TCL_OK;
    }
    c->dftLib = Tcl_GetString(objv[1]);
    DftLibResult r = loadDftLib(c->dftLib);
    for (auto& e : r.errors) c->print("# " + e);
    for (auto& m : r.missing) c->print("# unreadable: " + m);
    int clockCells = 0;
    for (auto& [k, cell] : r.cells)
        if (!cell.clockIn.empty()) ++clockCells;
    c->print("read " + std::to_string(r.libFiles.size()) + " cell librar(ies): " +
             std::to_string(r.cells.size()) + " cells, " + std::to_string(clockCells) +
             " with a declared clock input");
    return TCL_OK;
}

int cmdReportCells(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    if (c->dftLib.empty()) { c->print("no cell library — run `set_dft_lib <yaml>` first"); return TCL_OK; }
    std::string filter;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (!a.empty() && a[0] != '-') filter = a;
    }
    DftLibResult r = loadDftLib(c->dftLib);
    int n = 0;
    for (auto& [k, cell] : r.cells) {
        if (!filter.empty() && cell.role != filter) continue;
        std::string line = "  " + cell.name + "  type=" + cell.cellType + "  role=" + cell.role;
        if (!cell.clockIn.empty()) {
            line += "  clock_in=";
            for (auto& p : cell.clockIn) line += p + " ";
        }
        if (!cell.clockOut.empty()) line += " clock_out=" + cell.clockOut;
        c->print(line);
        ++n;
    }
    c->print("cells: " + std::to_string(n));
    Tcl_SetObjResult(ip, Tcl_NewIntObj(n));
    return TCL_OK;
}

// analyze_wrapper_cells [-core <inst>] [-input_fanout_flop_threshold N]
//                       [-output_fanin_flop_threshold N] [-levels N]
//                       [-exclude_ports {pat ...}] [-verbose] [-edt_channels N]
//
// The number this exists for is the EXTEST EDT's: its chains hold nothing but wrapper cells, and
// EDT is configured a flow step BEFORE scan insertion runs the real analysis. Declared clocks and
// DFT signals (add_clocks / add_dft_signals) are excluded automatically — a wrapper cell on a test
// signal is never what the user meant, and only they know which ports those are.
int cmdWrapperCells(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    WrapperOptions opt;
    std::string core;
    bool verbose = false;
    int channels = 0;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        auto intArg = [&](int& dst) {
            if (i + 1 < objc) dst = std::atoi(Tcl_GetString(objv[++i]));
        };
        if (a == "-core" && i + 1 < objc) core = c->absPath(Tcl_GetString(objv[++i]));
        else if (a == "-input_fanout_flop_threshold") intArg(opt.inputFanoutFlopThreshold);
        else if (a == "-output_fanin_flop_threshold") intArg(opt.outputFaninFlopThreshold);
        else if (a == "-feedback_flop_threshold") intArg(opt.feedbackFlopThreshold);
        else if (a == "-levels") intArg(opt.levelsThreshold);
        else if (a == "-edt_channels") intArg(channels);
        else if (a == "-verbose") verbose = true;
        else if (a == "-exclude_ports" && i + 1 < objc)
            for (const std::string& p : flatArgs(ip, objc, objv, i + 1)) {
                opt.excludePorts.push_back(p);
                ++i;
            }
    }
    // The user's own declarations are the authority on what is a test signal, not a name guess.
    for (const DftSignal& s : c->signals) opt.excludePorts.push_back(s.name);
    for (const UserClock& k : c->clocks) {
        std::string leaf = k.node;
        const std::size_t sl = leaf.find_last_of("./");
        if (sl != std::string::npos) leaf.erase(0, sl + 1);
        if (!leaf.empty()) opt.excludePorts.push_back(leaf);
    }

    WrapperEstimate e = c->db.wrapperCells(core, opt);
    if (e.core.empty()) {
        c->print("no design loaded");
        return TCL_OK;
    }
    c->print("core: " + c->show(e.core));
    if (verbose)
        for (const WrapperPortCell& r : e.cells) {
            std::string line = "  " + r.name + " (" + (r.dir == "in" ? "I" : "O") + ")  " +
                               r.decision;
            if (r.flops)
                line += "  cells=" + std::to_string(r.flops - r.flopsFeedback) + "/" +
                        std::to_string(r.flopsFeedback);  // direct/internal-feedback
            if (!r.cell.empty()) line += "  cell=" + r.cell;
            if (!r.reason.empty()) line += "  [" + r.reason + "]";
            c->print(line);
        }
    auto row = [&](const char* what, int in, int out) {
        std::string label(what);
        if (label.size() < 22) label.append(22 - label.size(), ' ');
        c->print("  " + label + "in " + std::to_string(in) + "   out " + std::to_string(out) +
                 "   total " + std::to_string(in + out));
    };
    c->print("boundary port bits:");
    row("analysed", e.inputBits, e.outputBits);
    row("shared wrapper cells", e.sharedIn, e.sharedOut);
    row("dedicated (added)", e.dedicatedIn, e.dedicatedOut);
    row("no wrapper cell", e.noneIn, e.noneOut);
    row("WRAPPER CELLS", e.wrapperIn(), e.wrapperOut());
    c->print("scan cells added to the design: " + std::to_string(e.addedScanCells()) +
             "  (shared cells are already flops)");
    c->print("analysis: " + std::to_string(static_cast<long long>(e.analysisMs)) + " ms, " +
             std::to_string(e.coneNodes) + " net bits visited");
    // Input and output wrapper cells go on SEPARATE chains, so the chain count is two
    // independent ceilings — a single total would under-count it.
    if (channels > 0) {
        const int ci = (e.wrapperIn() + channels - 1) / channels;
        const int co = (e.wrapperOut() + channels - 1) / channels;
        c->print("ext EDT with " + std::to_string(channels) +
                 " channels: input chains ~" + std::to_string(channels) + " x " +
                 std::to_string(ci) + " cells, output chains ~" + std::to_string(channels) +
                 " x " + std::to_string(co) + " cells (longest " + std::to_string(std::max(ci, co)) +
                 ")");
    }
    Tcl_SetObjResult(ip, Tcl_NewIntObj(e.wrapperCells()));
    return TCL_OK;
}

/// help [command] — the short list, or one command in full (same text as `<command> -help`).
int cmdHelp(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]);

// ---------------------------------------------------------------------------------------------
// Shell conveniences.
//
// A console you live in for an hour is a console you expect `ls` and `cat` to work in. These are
// implemented NATIVELY rather than shelled out: the output has to come back through the same
// capture the DFT commands use (so it lands in the panel, in order), and it has to behave the
// same on the Windows build as on the Linux one. Anything not implemented here still reaches the
// real system through Tcl's own `exec`, via the `unknown` fallback installed below.
// ---------------------------------------------------------------------------------------------
namespace fs = std::filesystem;

/// Split argv into short flags (bundled: `-la` == `-l -a`) and positionals.
struct Argv {
    std::string flags;                    // "la"
    std::vector<std::string> pos;
    bool has(char f) const { return flags.find(f) != std::string::npos; }
};
Argv parseArgv(int objc, Tcl_Obj* const objv[]) {
    Argv a;
    for (int i = 1; i < objc; ++i) {
        const std::string s = Tcl_GetString(objv[i]);
        if (s.size() > 1 && s[0] == '-' && !std::isdigit(static_cast<unsigned char>(s[1])))
            a.flags += s.substr(1);
        else
            a.pos.push_back(s);
    }
    return a;
}

int cmdLs(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    Argv a = parseArgv(objc, objv);
    std::vector<std::string> targets = a.pos;
    if (targets.empty()) targets.push_back(".");
    std::error_code ec;
    std::vector<std::string> names;
    for (const auto& t : targets) {
        fs::path p(t);
        if (!fs::exists(p, ec)) { c->print("ls: " + t + ": no such file or directory"); continue; }
        if (!fs::is_directory(p, ec)) { names.push_back(t); continue; }
        std::vector<fs::directory_entry> es;
        for (const auto& e : fs::directory_iterator(p, ec)) es.push_back(e);
        std::sort(es.begin(), es.end(), [](const fs::directory_entry& x, const fs::directory_entry& y) {
            return x.path().filename().string() < y.path().filename().string();
        });
        if (targets.size() > 1) c->print(t + ":");
        for (const auto& e : es) {
            const std::string nm = e.path().filename().string();
            if (!a.has('a') && !nm.empty() && nm[0] == '.') continue;
            const bool dir = e.is_directory(ec);
            if (a.has('l')) {
                const std::uintmax_t sz = dir ? 0 : fs::file_size(e.path(), ec);
                c->print(std::string(dir ? "d" : "-") + "  " + std::to_string(sz) + "\t" + nm);
            } else {
                names.push_back(nm + (dir ? "/" : ""));
            }
        }
    }
    if (!a.has('l') && !names.empty()) {
        std::string line;
        for (const auto& n : names) { if (!line.empty()) line += "  "; line += n; }
        c->print(line);
    }
    Tcl_SetObjResult(ip, Tcl_NewStringObj("", -1));
    return TCL_OK;
}

int cmdCat(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    Argv a = parseArgv(objc, objv);
    if (a.pos.empty()) { Tcl_SetObjResult(ip, Tcl_NewStringObj("usage: cat <file>...", -1)); return TCL_ERROR; }
    for (const auto& f : a.pos) {
        std::ifstream in(f);
        if (!in) { c->print("cat: " + f + ": cannot open"); continue; }
        std::ostringstream ss;
        ss << in.rdbuf();
        std::string t = ss.str();
        while (!t.empty() && (t.back() == '\n' || t.back() == '\r')) t.pop_back();
        c->print(t);
    }
    return TCL_OK;
}

/// head/tail -n N <file>...
int cmdHeadTail(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    const bool isHead = std::string(Tcl_GetString(objv[0])) == "head";
    int n = 10;
    std::vector<std::string> files;
    for (int i = 1; i < objc; ++i) {
        const std::string s = Tcl_GetString(objv[i]);
        if ((s == "-n" || s == "-c") && i + 1 < objc) { n = std::atoi(Tcl_GetString(objv[++i])); }
        else if (s.size() > 1 && s[0] == '-' && std::isdigit(static_cast<unsigned char>(s[1]))) n = std::atoi(s.c_str() + 1);
        else files.push_back(s);
    }
    if (files.empty()) { Tcl_SetObjResult(ip, Tcl_NewStringObj("usage: head|tail [-n N] <file>...", -1)); return TCL_ERROR; }
    for (const auto& f : files) {
        std::ifstream in(f);
        if (!in) { c->print(std::string(isHead ? "head: " : "tail: ") + f + ": cannot open"); continue; }
        std::vector<std::string> lines;
        std::string l;
        while (std::getline(in, l)) lines.push_back(l);
        if (files.size() > 1) c->print("==> " + f + " <==");
        const std::size_t take = static_cast<std::size_t>(n < 0 ? 0 : n);
        if (isHead)
            for (std::size_t i = 0; i < lines.size() && i < take; ++i) c->print(lines[i]);
        else
            for (std::size_t i = lines.size() > take ? lines.size() - take : 0; i < lines.size(); ++i)
                c->print(lines[i]);
    }
    return TCL_OK;
}

int cmdGrep(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    Argv a = parseArgv(objc, objv);
    if (a.pos.size() < 2) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj("usage: grep [-i] [-n] [-v] <pattern> <file>...", -1));
        return TCL_ERROR;
    }
    std::string pat = a.pos[0];
    if (a.has('i')) std::transform(pat.begin(), pat.end(), pat.begin(),
                                   [](unsigned char ch) { return std::tolower(ch); });
    int hits = 0;
    for (std::size_t fi = 1; fi < a.pos.size(); ++fi) {
        std::ifstream in(a.pos[fi]);
        if (!in) { c->print("grep: " + a.pos[fi] + ": cannot open"); continue; }
        std::string l;
        int ln = 0;
        while (std::getline(in, l)) {
            ++ln;
            std::string hay = l;
            if (a.has('i')) std::transform(hay.begin(), hay.end(), hay.begin(),
                                           [](unsigned char ch) { return std::tolower(ch); });
            const bool found = hay.find(pat) != std::string::npos;
            if (found == a.has('v')) continue;
            ++hits;
            std::string out;
            if (a.pos.size() > 2) out += a.pos[fi] + ":";
            if (a.has('n')) out += std::to_string(ln) + ":";
            c->print(out + l);
        }
    }
    Tcl_SetObjResult(ip, Tcl_NewIntObj(hits));
    return TCL_OK;
}

int cmdWc(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    Argv a = parseArgv(objc, objv);
    for (const auto& f : a.pos) {
        std::ifstream in(f, std::ios::binary);
        if (!in) { c->print("wc: " + f + ": cannot open"); continue; }
        std::size_t lines = 0, words = 0, chars = 0;
        std::string l;
        while (std::getline(in, l)) {
            ++lines;
            chars += l.size() + 1;
            std::istringstream ws(l);
            std::string w;
            while (ws >> w) ++words;
        }
        std::string o;
        if (a.flags.empty() || a.has('l')) o += std::to_string(lines) + " ";
        if (a.flags.empty() || a.has('w')) o += std::to_string(words) + " ";
        if (a.flags.empty() || a.has('c')) o += std::to_string(chars) + " ";
        c->print(o + f);
    }
    if (a.pos.empty()) { Tcl_SetObjResult(ip, Tcl_NewStringObj("usage: wc [-l|-w|-c] <file>...", -1)); return TCL_ERROR; }
    return TCL_OK;
}

int cmdEcho(ClientData cd, Tcl_Interp*, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    std::string s;
    for (int i = 1; i < objc; ++i) { if (!s.empty()) s += " "; s += Tcl_GetString(objv[i]); }
    c->print(s);
    return TCL_OK;
}

int cmdWhich(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    if (objc < 2) { Tcl_SetObjResult(ip, Tcl_NewStringObj("usage: which <name>...", -1)); return TCL_ERROR; }
    for (int i = 1; i < objc; ++i) {
        const std::string name = Tcl_GetString(objv[i]);
        // A dp_shell command first — in this console that is what the name resolves to.
        Tcl_CmdInfo info;
        if (Tcl_GetCommandInfo(ip, name.c_str(), &info)) { c->print(name + ": dp_shell command"); continue; }
        const char* path = std::getenv("PATH");
        bool found = false;
        if (path) {
#ifdef _WIN32
            const char sep = ';';
#else
            const char sep = ':';
#endif
            std::istringstream ps(path);
            std::string dir;
            std::error_code ec;
            while (std::getline(ps, dir, sep)) {
                if (dir.empty()) continue;
                for (const char* ext : {"", ".exe", ".bat"}) {
                    fs::path p = fs::path(dir) / (name + ext);
                    if (fs::exists(p, ec) && !fs::is_directory(p, ec)) {
                        c->print(p.string());
                        found = true;
                        break;
                    }
                }
                if (found) break;
            }
        }
        if (!found) c->print(name + " not found");
    }
    return TCL_OK;
}

int cmdMkdir(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    Argv a = parseArgv(objc, objv);
    std::error_code ec;
    for (const auto& d : a.pos) {
        const bool ok = a.has('p') ? fs::create_directories(d, ec) : fs::create_directory(d, ec);
        if (!ok && ec) c->print("mkdir: " + d + ": " + ec.message());
    }
    if (a.pos.empty()) { Tcl_SetObjResult(ip, Tcl_NewStringObj("usage: mkdir [-p] <dir>...", -1)); return TCL_ERROR; }
    return TCL_OK;
}

int cmdRm(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    Argv a = parseArgv(objc, objv);
    if (a.pos.empty()) { Tcl_SetObjResult(ip, Tcl_NewStringObj("usage: rm [-r] [-f] <path>...", -1)); return TCL_ERROR; }
    std::error_code ec;
    for (const auto& p : a.pos) {
        if (fs::is_directory(p, ec) && !a.has('r')) { c->print("rm: " + p + ": is a directory (use -r)"); continue; }
        const auto n = a.has('r') ? fs::remove_all(p, ec) : (fs::remove(p, ec) ? 1u : 0u);
        if (!n && !a.has('f')) c->print("rm: " + p + ": " + (ec ? ec.message() : "no such file"));
    }
    return TCL_OK;
}

int cmdCpMv(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    const bool isCp = std::string(Tcl_GetString(objv[0])) == "cp";
    Argv a = parseArgv(objc, objv);
    if (a.pos.size() < 2) {
        Tcl_SetObjResult(ip, Tcl_NewStringObj(isCp ? "usage: cp [-r] <src>... <dst>"
                                                   : "usage: mv <src>... <dst>", -1));
        return TCL_ERROR;
    }
    const fs::path dst = a.pos.back();
    std::error_code ec;
    for (std::size_t i = 0; i + 1 < a.pos.size(); ++i) {
        const fs::path src = a.pos[i];
        const fs::path target = fs::is_directory(dst, ec) ? dst / src.filename() : dst;
        if (isCp) {
            const auto o = a.has('r') ? fs::copy_options::recursive | fs::copy_options::overwrite_existing
                                      : fs::copy_options::overwrite_existing;
            fs::copy(src, target, o, ec);
        } else {
            fs::rename(src, target, ec);
        }
        if (ec) { c->print(std::string(isCp ? "cp: " : "mv: ") + src.string() + ": " + ec.message()); ec.clear(); }
    }
    return TCL_OK;
}

int cmdTouch(ClientData cd, Tcl_Interp*, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    for (int i = 1; i < objc; ++i) {
        const std::string p = Tcl_GetString(objv[i]);
        std::error_code ec;
        if (!fs::exists(p, ec)) { std::ofstream f(p); if (!f) c->print("touch: " + p + ": cannot create"); }
        else fs::last_write_time(p, fs::file_time_type::clock::now(), ec);
    }
    return TCL_OK;
}

int cmdFind(ClientData cd, Tcl_Interp*, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    std::string root = ".", name, type;
    int maxDepth = 64;
    for (int i = 1; i < objc; ++i) {
        const std::string s = Tcl_GetString(objv[i]);
        if (s == "-name" && i + 1 < objc) name = Tcl_GetString(objv[++i]);
        else if (s == "-type" && i + 1 < objc) type = Tcl_GetString(objv[++i]);
        else if (s == "-maxdepth" && i + 1 < objc) maxDepth = std::atoi(Tcl_GetString(objv[++i]));
        else if (!s.empty() && s[0] != '-') root = s;
    }
    std::error_code ec;
    int n = 0;
    for (auto it = fs::recursive_directory_iterator(root, ec);
         it != fs::recursive_directory_iterator(); it.increment(ec)) {
        if (ec) break;
        if (it.depth() >= maxDepth) { it.disable_recursion_pending(); }
        const bool dir = it->is_directory(ec);
        if (type == "f" && dir) continue;
        if (type == "d" && !dir) continue;
        const std::string leaf = it->path().filename().string();
        if (!name.empty() && !Tcl_StringMatch(leaf.c_str(), name.c_str())) continue;
        c->print(it->path().string());
        if (++n >= 5000) { c->print("# note: stopped at 5000 matches"); break; }
    }
    return TCL_OK;
}

int cmdEnv(ClientData cd, Tcl_Interp*, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    if (objc > 1) {
        for (int i = 1; i < objc; ++i) {
            const char* v = std::getenv(Tcl_GetString(objv[i]));
            c->print(std::string(Tcl_GetString(objv[i])) + "=" + (v ? v : ""));
        }
        return TCL_OK;
    }
    // The whole environment is Tcl's ::env array; print the names we can reach portably.
    for (const char* k : {"PATH", "HOME", "USER", "PWD", "TCL_LIBRARY", "DFT_KNOWLEDGE_DIR",
                          "DFT_USER_MATERIAL", "TESSENT_HOME", "LD_LIBRARY_PATH"}) {
        const char* v = std::getenv(k);
        if (v) c->print(std::string(k) + "=" + v);
    }
    return TCL_OK;
}

int cmdDate(ClientData cd, Tcl_Interp*, int, Tcl_Obj* const[]) {
    auto* c = ctxOf(cd);
    const std::time_t t = std::time(nullptr);
    char buf[64] = {0};
    std::strftime(buf, sizeof buf, "%Y-%m-%d %H:%M:%S", std::localtime(&t));
    c->print(buf);
    return TCL_OK;
}

/// The panel watches for this token and empties its log — `clear` has to mean the same thing
/// typed as it does on the toolbar button.
int cmdClear(ClientData cd, Tcl_Interp*, int, Tcl_Obj* const[]) {
    ctxOf(cd)->out += "\f";
    return TCL_OK;
}

// ---------------------------------------------------------------------------------------------
// Self-documentation: -help, help, report_commands, and the completion feed.
// ---------------------------------------------------------------------------------------------

std::string oneLine(const CmdSpec& s) {
    std::string l = "  " + s.name;
    if (l.size() < 26) l += std::string(26 - l.size(), ' ');
    return l + " " + s.summary;
}

std::string longHelp(const CmdSpec& s) {
    std::string o = s.name + " — " + s.summary + "\n";
    o += "  usage: " + (s.usage.empty() ? s.name : s.usage) + "\n";
    if (!s.opts.empty()) {
        o += "  options:\n";
        for (const auto& op : s.opts) {
            std::string l = std::string("    ") + op.name + (op.arg[0] ? std::string(" ") + op.arg : "");
            if (l.size() < 42) l += std::string(42 - l.size(), ' ');
            o += l + op.help + "\n";
        }
    }
    o += "  group: " + s.group;
    return o;
}

/// report_commands [-pattern glob] [-group name] [-verbose] [-completion]
int cmdReportCommands(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    std::string pat, group;
    bool verbose = false, completion = false;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (a == "-pattern" && i + 1 < objc) pat = Tcl_GetString(objv[++i]);
        else if (a == "-group" && i + 1 < objc) group = Tcl_GetString(objv[++i]);
        else if (a == "-verbose") verbose = true;
        else if (a == "-completion") completion = true;
        else if (!a.empty() && a[0] != '-') pat = a;
    }
    // The machine-readable feed the console's Tab completion reads: one line per command,
    // "name<TAB>-opt -opt …". Same registry as the human text, so completion can never offer a
    // switch the command does not have.
    if (completion) {
        for (const auto& s : c->cmds) {
            std::string l = s->name + "\t";
            for (const auto& o : s->opts) l += std::string(o.name) + " ";
            c->print(l);
        }
        return TCL_OK;
    }
    std::string lastGroup;
    int n = 0;
    for (const auto& s : c->cmds) {
        if (s->alias) continue;
        if (!group.empty() && s->group != group) continue;
        if (!pat.empty() && !Tcl_StringMatch(s->name.c_str(), pat.c_str())) continue;
        if (s->group != lastGroup) { c->print((n ? "\n" : "") + s->group + ":"); lastGroup = s->group; }
        c->print(verbose ? longHelp(*s) + "\n" : oneLine(*s));
        ++n;
    }
    c->print("\n" + std::to_string(n) + " command(s). `<command> -help` for one in full.");
    Tcl_SetObjResult(ip, Tcl_NewIntObj(n));
    return TCL_OK;
}

int cmdHelp(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    if (objc > 1) {
        const std::string want = Tcl_GetString(objv[1]);
        for (const auto& s : c->cmds)
            if (s->name == want) { c->print(longHelp(*s)); return TCL_OK; }
        c->print("no such command: " + want + "  (try `report_commands`)");
        return TCL_OK;
    }
    c->print("dp_shell — a Tcl shell over the elaborated design.\n"
             "  report_commands            every DFT planner command, by group\n"
             "  report_commands -verbose   …with every switch explained\n"
             "  <command> -help            one command in full\n"
             "  help <command>             the same\n"
             "  Tab                        complete a command, a switch or a path\n"
             "\nCommon Unix commands (ls cat head tail grep wc find which mkdir rm cp mv echo\n"
             "env date clear) work here, as does the whole Tcl language (set/if/foreach/proc/\n"
             "expr/regexp/…). Anything else is handed to the system via Tcl's `exec`.");
    return TCL_OK;
}

/// Every command goes through here, so `-help` works on all of them and can never fall out of
/// step with the registry that documents them.
int cmdTrampoline(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    CmdSpec* spec = specOf(cd);
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (a == "-help" || a == "--help" || a == "-h") {
            static_cast<DpShell::Impl*>(spec->impl)->print(longHelp(*spec));
            return TCL_OK;
        }
    }
    return spec->proc(cd, ip, objc, objv);
}

int cmdPuts(ClientData cd, Tcl_Interp*, int objc, Tcl_Obj* const objv[]) {
    auto* c = ctxOf(cd);
    std::string s;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (i == 1 && (a == "-nonewline")) continue;
        if (!s.empty()) s += " ";
        s += a;
    }
    c->print(s);
    return TCL_OK;
}

}  // namespace

DpShell::DpShell(DesignDb& db) : p_(new Impl(db)) {
    p_->ip = Tcl_CreateInterp();
    Tcl_Interp* ip = p_->ip;
    // Load the script library when it is reachable. It brings `unknown`, `parray`, `history` and
    // friends; without it the core language still works, so a missing TCL_LIBRARY is not fatal.
    if (Tcl_Init(ip) != TCL_OK) Tcl_ResetResult(ip);

    // ONE registry. Every entry is the command, its group, its usage line, what it is for and
    // every switch it takes — which is what `-help`, `help`, `report_commands` and the console's
    // Tab completion all read. Documenting a command anywhere else would let the two drift.
    const auto reg = [&](const char* name, Tcl_ObjCmdProc* proc, const char* group,
                         const char* usage, const char* summary,
                         std::vector<CmdOpt> opts = {}) {
        auto spec = std::make_unique<CmdSpec>();
        spec->name = name;
        spec->group = group;
        spec->usage = usage;
        spec->summary = summary;
        spec->opts = std::move(opts);
        spec->proc = proc;
        spec->impl = p_;
        Tcl_CreateObjCommand(ip, name, cmdTrampoline, spec.get(), nullptr);
        p_->cmds.push_back(std::move(spec));
    };
    // A second name for a command already registered: same behaviour and same help, listed once
    // in report_commands so the list is a list of commands, not of spellings.
    const auto alias = [&](const char* name, const char* of) {
        for (std::size_t i = 0; i < p_->cmds.size(); ++i) {
            if (p_->cmds[i]->name != of) continue;
            auto spec = std::make_unique<CmdSpec>(*p_->cmds[i]);
            spec->name = name;
            spec->alias = true;
            spec->summary = std::string("alias for ") + of;
            Tcl_CreateObjCommand(ip, name, cmdTrampoline, spec.get(), nullptr);
            p_->cmds.push_back(std::move(spec));
            return;
        }
    };

    // ---- design query (the Tessent get_* family, tshell_ref "Command Dictionary Ga-Get_p") ----
    const std::vector<CmdOpt> QUERY_OPTS = {
        {"-below_instances", "<inst>...", "only objects under these instances"},
        {"-of_instances", "<inst>...", "only objects on/under these instances"},
        {"-of_modules", "<module>...", "only objects whose module is one of these"},
        {"-parent_of_instances", "<inst>...", "return the owning instance of each match, once"},
        {"-direction", "input|output|inout", "ports/pins of this direction only"},
        {"-filter", "{attr op value}", "name|full_name|direction|design|parent|kind; ops == != =~ !~"},
        {"-regexp", "", "patterns are regular expressions, not globs"},
        {"-nocase", "", "match case-insensitively"},
        {"-silent", "", "no note when nothing matched"},
        {"-hierarchical", "", "accepted; this model is hierarchical anyway"},
        {"-limit", "<n>", "cap the result (default 1000)"},
    };
    reg("get_instances", cmdQuery<K_CELL>, "design query",
        "get_instances [patterns] [switches]",
        "hierarchical instances matching a glob/regexp", QUERY_OPTS);
    reg("get_ports", cmdQuery<K_PORT>, "design query",
        "get_ports [patterns] [switches]", "top-level ports", QUERY_OPTS);
    reg("get_pins", cmdQuery<K_PIN>, "design query",
        "get_pins [patterns] [switches]", "instance pins (hierarchical)", QUERY_OPTS);
    reg("get_nets", cmdQuery<K_NET>, "design query",
        "get_nets [patterns] [switches]", "nets / variables", QUERY_OPTS);
    reg("get_modules", cmdQuery<K_MOD>, "design query",
        "get_modules [patterns] [switches]", "module definitions", QUERY_OPTS);
    // Tessent scripts spell several of these both ways, and so does everyone writing them from
    // memory; both work rather than making the reader remember which family a command is in.
    alias("get_cells", "get_instances");
    alias("get_instance", "get_instances");
    alias("get_cell", "get_instances");
    alias("get_port", "get_ports");
    alias("get_pin", "get_pins");
    alias("get_net", "get_nets");
    alias("get_module", "get_modules");

    // ---- OCC definition points ---------------------------------------------------------------
    reg("add_occ_point", cmdAddOcc, "OCC", "add_occ_point <pin>... [-clock N] [-comment T]",
        "record an OCC clock-definition point",
        {{"-clock", "<name>", "clock this point belongs to"},
         {"-comment", "<text>", "free text kept with the point"}});
    alias("add_to_occ_def_point", "add_occ_point");   // files written before the rename
    reg("remove_occ_def_point", cmdRemoveOcc, "OCC", "remove_occ_def_point <pin>...",
        "drop OCC points by pin");
    alias("delete_occ_def_point", "remove_occ_def_point");
    reg("report_occ_def_points", cmdReportOcc, "OCC", "report_occ_def_points",
        "list the recorded OCC points");
    reg("write_occ_def_points", cmdWriteOcc, "OCC", "write_occ_def_points [file]",
        "write dfx_occ_def_point.tcl (replayable)");
    reg("set_occ_out_dir", cmdSetOccOutDir, "OCC", "set_occ_out_dir [dir]",
        "auto-write dfx_occ_def_point.tcl here on every change");

    // ---- DFT control -------------------------------------------------------------------------
    reg("add_dft_ctrl_mux", cmdAddMux, "DFT control",
        "add_dft_ctrl_mux <target> -override_source <src> -select <sel>",
        "record a DFT control mux (planning only, nothing is inserted; DFT-side values compute "
        "from their source circuits — add_pin_constraint yourself to override)",
        {{"-override_source", "<src>", "what drives the target in test"},
         {"-select", "<pin>", "the mux select"},
         {"-source_value", "0|1", "DEPRECATED: parsed but no longer constrains anything"},
         {"-comment", "<text>", "free text kept with the mux"}});
    reg("remove_dft_ctrl_mux", cmdRemoveMux, "DFT control", "remove_dft_ctrl_mux <target>...",
        "drop recorded control muxes");
    alias("delete_dft_ctrl_mux", "remove_dft_ctrl_mux");   // both spellings are natural
    reg("report_dft_ctrl_mux", cmdReportMux, "DFT control", "report_dft_ctrl_mux",
        "list the recorded control muxes");
    reg("add_dft_ip", cmdAddDftIp, "DFT control",
        "add_dft_ip <module> -instance <name> [-at <scope>] [-comment T]",
        "record a planned DFX IP instantiation",
        {{"-instance", "<name>", "planned instance name"},
         {"-at", "<scope>", "scope to instantiate in (default: top)"},
         {"-comment", "<text>", "free text kept with the IP"}});
    reg("remove_dft_ip", cmdRemoveDftIp, "DFT control", "remove_dft_ip <instance>...",
        "drop planned DFX IP instantiations");
    alias("delete_dft_ip", "remove_dft_ip");
    reg("report_dft_ips", cmdReportDftIps, "DFT control", "report_dft_ips",
        "list the planned DFX IP instantiations");
    // VIRTUAL instantiation: the planned IPs are wired to each other here, and the flow gets a
    // create_instance / create_connection script. The RTL is never edited.
    reg("add_dft_connection", cmdAddConn, "DFT control",
        "add_dft_connection <from_pin> <to_pin> | <pin> -constant <0|1> [-comment T]",
        "wire two planned IP pins, or tie one to a constant",
        {{"-constant", "0|1", "tie this pin instead of wiring it"},
         {"-comment", "<text>", "free text kept with the connection"}});
    reg("remove_dft_connection", cmdRemoveConn, "DFT control", "remove_dft_connection <pin>...",
        "drop planned connections touching these pins");
    alias("delete_dft_connection", "remove_dft_connection");
    reg("report_dft_connections", cmdReportConns, "DFT control", "report_dft_connections",
        "list the planned connections");
    reg("report_dft_instantiation", cmdReportInst, "DFT control", "report_dft_instantiation",
        "the create_instance / create_connection script, printed");
    reg("write_dft_instantiation", cmdWriteInst, "DFT control", "write_dft_instantiation [file]",
        "write that script (default: <occ out dir>/dfx_instantiation.tcl)");
    reg("add_clocks", cmdAddClocks, "DFT control", "add_clocks <node>... <0|1> [-label L]",
        "declare a test clock and its off-state",
        {{"-label", "<text>", "name shown for this clock"}});
    reg("report_clocks", cmdReportClocks, "DFT control", "report_clocks [-sdc|-user]",
        "list declared and SDC clocks",
        {{"-sdc", "", "SDC clocks only"}, {"-user", "", "declared clocks only"}});
    reg("add_dft_signals", cmdAddDftSignals, "DFT control",
        "add_dft_signals <name>... [-source_nodes <n>] [-value 0|1]",
        "declare a DFT signal (scan_en / test_mode) and its test value",
        {{"-source_nodes", "<node>", "where the signal is driven from"},
         {"-value", "0|1", "value forced in test mode (default 1)"}});
    reg("report_dft_signals", cmdReportDftSignals, "DFT control", "report_dft_signals",
        "list the declared DFT signals");

    // ---- clock/reset DRC ---------------------------------------------------------------------
    reg("report_clock_tree", cmdReportCr, "clock/reset DRC",
        "report_clock_tree [-sdc F] [-unconstrained]",
        "clock groups reaching the registers",
        {{"-sdc", "<file>", "read this SDC first"},
         {"-unconstrained", "", "only the groups that fail"}});
    reg("report_reset", cmdReportCr, "clock/reset DRC", "report_reset [-sdc F] [-violations]",
        "asynchronous reset groups and their sources",
        {{"-sdc", "<file>", "read this SDC first"},
         {"-violations", "", "only the groups that fail"}});
    reg("add_pin_constraint", cmdAddPinConstraint, "clock/reset DRC",
        "add_pin_constraint <pin>... <0|1|X|Z>",
        "force a pin for run_drc (X clears, Z = floating)");
    reg("report_pin_constraints", cmdReportPinConstraints, "clock/reset DRC",
        "report_pin_constraints", "list the pin constraints in force");
    reg("run_drc", cmdRunDrc, "clock/reset DRC", "run_drc",
        "run the clock/reset DRC with this session's setup");
    reg("read_dfx_ip", cmdReadDfxIp, "DFT control", "read_dfx_ip <dir|file>...",
        "compile the DFX IP library so planned-IP pins are EVALUATED, not declared");
    reg("report_dft_ip_circuit", cmdReportIpCircuit, "DFT control",
        "report_dft_ip_circuit <inst/pin>",
        "per-phase value of a planned-IP pin computed from its circuit, plus the deciding inputs");
    reg("report_memory_instance", cmdReportMemoryInstance, "MemoryBIST",
        "report_memory_instance ?<membistlib dir>? ?-def <f>? ?-physical_cluster_size_ratio <n>?",
        "memories in the design: blackbox instances matched against *.tcd_memory + Verilog models");
    reg("set_memory_instance_options", cmdSetMemoryInstanceOptions, "MemoryBIST",
        "set_memory_instance_options <inst> ?-controller <name>? ?-step <n>? "
        "?-partitioning_group <g>? ?-physical_cluster_override <c>? ?-power_domain <p>? "
        "?-test_clock_override <clk>?",
        "force how a memory partitions (CCR3/CCR4) or put it on a named controller");
    reg("add_mbist_controller", cmdAddMbistController, "MemoryBIST",
        "add_mbist_controller <name> <memory>... ?-step <n>?",
        "put these memories on a controller of your own (rules still checked and reported)");
    reg("remove_mbist_controller", cmdRemoveMbistController, "MemoryBIST",
        "remove_mbist_controller ?<name>?",
        "release user controller assignments back to the automatic partition");
    reg("rename_mbist_controller", cmdRenameMbistController, "MemoryBIST",
        "rename_mbist_controller <old> <new>",
        "rename a user controller in place (its assigned memories move with it)");
    reg("report_mbist_plan", cmdReportMbistPlan, "MemoryBIST",
        "report_mbist_plan ?<membistlib dir>? ?-period <ns>? ?-clock_period <clk> <ns>? "
        "?-max_power_per_step <mW>? ?-max_memories_per_step <n>? ?-def <f>?",
        "the MemoryBIST partition: controller / step / memory with power, cycles and runtime");
    reg("set_phase_constraint", cmdSetPhaseConstraint, "clock/reset DRC",
        "set_phase_constraint <shift|sac|asc> <pin>... <0|1|X>",
        "what a DFT signal is held at in one test phase (no args = report)",
        {{"shift", "", "the chain is shifting: every reset must be inactive"},
         {"sac", "", "stuck-at capture: the reset may be either value, but must be controllable"},
         {"asc", "", "at-speed capture: inactive throughout, or the transition is destroyed"}});
    reg("report_reset_states", cmdReportResetStates, "clock/reset DRC",
        "report_reset_states [-sdc F] [-verbose]",
        "per-register SHIFT-phase reset state: is every register inactive?",
        {{"-sdc", "<file>", "read this SDC first"},
         {"-verbose", "", "list every group, not only the failing ones"}});
    reg("report_drc_rules", cmdReportDrcRules, "clock/reset DRC",
        "report_drc_rules [-sdc F] [-summary]", "per-rule DRC results",
        {{"-sdc", "<file>", "read this SDC first"}, {"-summary", "", "counts only"}});
    reg("set_drc_handling", cmdSetDrcHandling, "clock/reset DRC",
        "set_drc_handling <rule> <Error|Warning|Note|Ignore>", "severity for one DRC rule");
    reg("write_drc_script", cmdWriteDrcScript, "clock/reset DRC", "write_drc_script [file]",
        "emit this session's DRC setup as a replayable script");

    // ---- wrapper / library / session ----------------------------------------------------------
    reg("analyze_wrapper_cells", cmdWrapperCells, "wrapper",
        "analyze_wrapper_cells [-core I] [thresholds] [-verbose]",
        "wrapper cells the core needs, before insertion",
        {{"-core", "<instance>", "core to analyse (default: the largest candidate)"},
         {"-input_fanout_flop_threshold", "<n>", "shared-cell fanout limit (Tessent default 32)"},
         {"-output_fanin_flop_threshold", "<n>", "shared-cell fanin limit (default 32)"},
         {"-feedback_flop_threshold", "<n>", "internal-feedback limit"},
         {"-levels", "<n>", "how many logic levels to trace"},
         {"-edt_channels", "<n>", "channels assumed when sizing"},
         {"-exclude_ports", "{p ...}", "ports that must not get a wrapper cell"},
         {"-verbose", "", "per-port transcript"}});
    alias("report_wrapper_cells", "analyze_wrapper_cells");
    reg("report_cells", cmdReportCells, "library", "report_cells [role]",
        "cells in the DFT library, optionally by role");
    reg("set_dft_lib", cmdSetDftLib, "library", "set_dft_lib [dft_lib_setting.yaml]",
        "point the session at a DFT cell library");
    reg("set_scope", cmdSetScope, "session", "set_scope [name]",
        "which analysis the following commands belong to");
    reg("read_sdc", cmdReadSdc, "session", "read_sdc [file]",
        "the functional SDC the value calculus is based on — parses it immediately and reports "
        "the resolved clocks (period/generated/master, same engine as the SDC tab)");
    alias("load_sdc", "read_sdc");
    reg("report_commands", cmdReportCommands, "session",
        "report_commands [pattern] [-group G] [-verbose] [-completion]",
        "every DFT planner command, by group",
        {{"-pattern", "<glob>", "only commands matching this"},
         {"-group", "<name>", "only this group"},
         {"-verbose", "", "include every switch and what it does"},
         {"-completion", "", "machine-readable feed for Tab completion"}});
    reg("help", cmdHelp, "session", "help [command]",
        "the short orientation, or one command in full");

    // ---- shell conveniences --------------------------------------------------------------------
    reg("ls", cmdLs, "shell", "ls [-l] [-a] [path...]", "list a directory",
        {{"-l", "", "one per line, with type and size"}, {"-a", "", "include dotfiles"}});
    reg("cat", cmdCat, "shell", "cat <file>...", "print a file");
    reg("head", cmdHeadTail, "shell", "head [-n N] <file>...", "first N lines (default 10)",
        {{"-n", "<N>", "how many lines"}});
    reg("tail", cmdHeadTail, "shell", "tail [-n N] <file>...", "last N lines (default 10)",
        {{"-n", "<N>", "how many lines"}});
    reg("grep", cmdGrep, "shell", "grep [-i] [-n] [-v] <pattern> <file>...",
        "lines matching a substring",
        {{"-i", "", "ignore case"}, {"-n", "", "show line numbers"}, {"-v", "", "invert the match"}});
    reg("wc", cmdWc, "shell", "wc [-l] [-w] [-c] <file>...", "count lines / words / characters",
        {{"-l", "", "lines"}, {"-w", "", "words"}, {"-c", "", "characters"}});
    reg("find", cmdFind, "shell", "find [dir] [-name glob] [-type f|d] [-maxdepth N]",
        "walk a directory tree",
        {{"-name", "<glob>", "match the leaf name"},
         {"-type", "f|d", "files or directories only"},
         {"-maxdepth", "<N>", "how deep to descend"}});
    reg("which", cmdWhich, "shell", "which <name>...", "where a command comes from");
    reg("echo", cmdEcho, "shell", "echo <text>...", "print its arguments");
    reg("mkdir", cmdMkdir, "shell", "mkdir [-p] <dir>...", "create directories",
        {{"-p", "", "create parents as needed"}});
    reg("rm", cmdRm, "shell", "rm [-r] [-f] <path>...", "delete files or trees",
        {{"-r", "", "recurse into directories"}, {"-f", "", "no error if it is missing"}});
    reg("cp", cmdCpMv, "shell", "cp [-r] <src>... <dst>", "copy",
        {{"-r", "", "recurse into directories"}});
    reg("mv", cmdCpMv, "shell", "mv <src>... <dst>", "move or rename");
    reg("touch", cmdTouch, "shell", "touch <file>...", "create a file or bump its mtime");
    reg("env", cmdEnv, "shell", "env [NAME...]", "environment variables");
    reg("date", cmdDate, "shell", "date", "the local date and time");
    reg("clear", cmdClear, "shell", "clear", "empty the console");
    reg("puts", cmdPuts, "shell", "puts [-nonewline] <text>",
        "print (captured into the console, not stdout)");

    // Anything else goes to the system, the way a shell would. `exec` is Tcl's own, so this adds
    // reach without adding a second idea of how a command line is parsed.
    Tcl_Eval(ip,
             "proc ::unknown {cmd args} {\n"
             "  if {[catch {eval [list exec $cmd] $args} out]} {\n"
             "    return -code error \"invalid command name \\\"$cmd\\\"\"\n"
             "  }\n"
             "  if {$out ne {}} { puts $out }\n"
             "  return {}\n"
             "}\n");
    Tcl_ResetResult(ip);
}

DpShell::~DpShell() {
    if (p_->ip) Tcl_DeleteInterp(p_->ip);
    delete p_;
}

DpResult DpShell::eval(const std::string& script) {
    DpResult r;
    p_->out.clear();
    const int rc = Tcl_Eval(p_->ip, script.c_str());
    r.output = p_->out;
    if (rc != TCL_OK) {
        r.ok = false;
        r.error = Tcl_GetStringResult(p_->ip);
    } else {
        const std::string res = Tcl_GetStringResult(p_->ip);
        if (!res.empty()) { if (!r.output.empty()) r.output += "\n"; r.output += res; }
    }
    return r;
}

DpResult DpShell::sourceFile(const std::string& path) {
    DpResult r;
    p_->out.clear();
    const int rc = Tcl_EvalFile(p_->ip, path.c_str());
    r.output = p_->out;
    if (rc != TCL_OK) { r.ok = false; r.error = Tcl_GetStringResult(p_->ip); }
    return r;
}

#else   // no Tcl

DpShell::DpShell(DesignDb& db) : p_(new Impl(db)) {}
DpShell::~DpShell() { delete p_; }
DpResult DpShell::eval(const std::string&) {
    return {false, "", "this build has no Tcl interpreter (dp_shell unavailable)"};
}
DpResult DpShell::sourceFile(const std::string&) { return eval(""); }

#endif

const std::vector<OccPoint>& DpShell::occPoints() const { return p_->occ; }
const std::vector<PinConstraint>& DpShell::pinConstraints() const { return p_->pinCons; }

const std::vector<DftIp>& DpShell::dftIps() const { return p_->ips; }

const std::vector<DftConn>& DpShell::dftConns() const { return p_->conns; }

std::string DpShell::renderInstantiationTcl() const { return renderInstText(p_->ips, p_->conns); }

const std::vector<CtrlMux>& DpShell::ctrlMuxes() const { return p_->mux; }

/// Is there a 0/1 DECLARATION on this pin (any phase, session constraint, or constant tie)?
/// This is what separates "the circuit computes 1" from "the plan SAYS 1" in the GUI.
static bool pinDeclared(DpShell::Impl* c, const std::string& fullPin) {
    for (const char* ph : {"shift", "sac", "asc"})
        if (auto it = c->phaseCons.find(ph); it != c->phaseCons.end())
            for (const auto& pc : it->second)
                if (pc.pin == fullPin && (pc.value == '0' || pc.value == '1')) return true;
    for (const auto& pc : c->pinCons)
        if (pc.pin == fullPin && (pc.value == '0' || pc.value == '1')) return true;
    for (const auto& cn : c->conns)
        if (normSep(cn.to) == fullPin && (cn.constant == "0" || cn.constant == "1")) return true;
    return false;
}

DpShell::IpCone DpShell::ipCone(const std::string& instance) const {
    IpCone out;
    if (!p_->ipDb) return out;
    const DftIp* ip = nullptr;
    for (const auto& x : p_->ips)
        if (x.instance == instance) { ip = &x; break; }
    if (!ip) return out;
    LocalNetlist nl = p_->ipDb->getNetlist(ip->module);
    if (nl.connections.empty()) return out;
    out.instance = ip->instance;
    out.module = ip->module;
    out.truncated = nl.truncated;

    // instanceId -> cell module name, from the library's own elaboration.
    std::map<std::string, std::string> mod;
    for (const auto& o : p_->ipDb->findObjects("*", "instance", 2000).objects)
        mod[o.id] = o.design;

    // Group the flat connection list into cells; boundary rows (owner == the module itself)
    // are the module's port bindings.
    std::map<std::string, IpConeCell> cells;
    std::map<std::string, int> nets;
    for (const auto& c : nl.connections) {
        IpConePin pin{c.port, c.direction, c.net, c.tie};
        if (!c.net.empty()) nets[c.net] = 1;
        if (c.instanceId == nl.ownerInstanceId) {
            out.ports.push_back(std::move(pin));
            continue;
        }
        auto& cell = cells[c.instanceId];
        if (cell.name.empty()) {
            // display name: the path below the module top
            const auto dot = c.instanceId.rfind('.');
            cell.name = dot == std::string::npos ? c.instanceId : c.instanceId.substr(dot + 1);
            if (auto it = mod.find(c.instanceId); it != mod.end()) cell.module = it->second;
        }
        cell.pins.push_back(std::move(pin));
    }
    for (auto& [id, cell] : cells) out.cells.push_back(std::move(cell));

    // Continuous assigns: a gate-level library still stitches cells together with assigns
    // (`assign dfx_rst_scan_n = dfx_rst_scan_n_o_internal;`), and without them the driver
    // chain of an output port DIES at the first alias — the box drew empty ("dfx_rst_scan_n
    // 完全没有显示"). A buf is a pure alias (the GUI wires through it), an inv is a real NOT
    // gate, anything else is a generic assign cell with the nets its RHS reads.
    for (const auto& a : p_->ipDb->moduleAssigns(ip->module)) {
        if (a.kind == "expr" && !a.cells.empty()) {
            // The slang decomposition of the RHS: each primitive is its own cell, wired by
            // synthetic `<ns>#c<N>` nets between primitives and by REAL nets at the leaves
            // (those get per-phase values; the synthetic hops have none to have).
            const std::string ns = "assign@" + a.lhs;
            for (const auto& lc : a.cells) {
                IpConeCell cell;
                cell.name = ns + "." + lc.id;
                cell.module = lc.kind;
                cell.label = lc.label;
                const std::string outNet = lc.outName.empty() ? ns + "#" + lc.id : lc.outName;
                cell.pins.push_back({"z", "out", outNet, ""});
                if (!lc.outName.empty()) nets[lc.outName] = 1;
                for (const auto& pin : lc.inputs) {
                    if (pin.ref.rfind("sig:", 0) == 0) {
                        cell.pins.push_back({pin.name, "in", pin.ref.substr(4), ""});
                        nets[pin.ref.substr(4)] = 1;
                    } else if (pin.ref.rfind("const:", 0) == 0) {
                        cell.pins.push_back({pin.name, "in", "", pin.ref.substr(6)});
                    } else if (pin.ref.rfind("cell:", 0) == 0) {
                        cell.pins.push_back({pin.name, "in", ns + "#" + pin.ref.substr(5), ""});
                    }
                }
                out.cells.push_back(std::move(cell));
            }
            continue;
        }
        IpConeCell cell;
        cell.name = "assign@" + a.lhs;
        cell.module = a.kind == "buf" ? "assign_buf"
                    : a.kind == "inv" ? "assign_inv" : "assign";
        cell.pins.push_back({"z", "out", a.lhs, ""});
        nets[a.lhs] = 1;
        int k = 0;
        for (const auto& in : a.ins) {
            cell.pins.push_back({a.ins.size() == 1 ? std::string("a") : "a" + std::to_string(k++),
                                 "in", in, ""});
            nets[in] = 1;
        }
        out.cells.push_back(std::move(cell));
    }

    // Per-phase value of every net, from the SAME calculus as report_dft_ip_circuit — the
    // whole point of the drawing is seeing WHERE the X arises. Skipped above a size cap: a
    // library cell netlist is small, and a module where it is not would stall the request.
    static const char* kPhases[] = {"shift", "sac", "asc"};
    const std::string base = ip->at.empty() ? ip->instance : normSep(ip->at) + "." + ip->instance;
    if (nets.size() <= 400) {
        for (const auto& [n, unused] : nets) {
            IpConeNet v{n, "", "", ""};
            std::string* vals[3] = {&v.s, &v.sac, &v.asc};
            for (int k = 0; k < 3; ++k) {
                *vals[k] = ipPinValue(p_, base + "." + n, kPhases[k]);
                if (vals[k]->empty()) *vals[k] = "X";
            }
            v.declared = pinDeclared(p_, base + "." + n);
            out.nets.push_back(std::move(v));
        }
    }
    return out;
}

std::vector<DpShell::IpCircuit> DpShell::ipCircuits() const {
    std::vector<IpCircuit> out;
    if (!p_->ipDb) return out;
    static const char* kPhases[] = {"shift", "sac", "asc"};
    // Port list once per module — several instances of the same IP share it.
    const FindResult pr = p_->ipDb->findObjects("*", "port", 500);
    for (const auto& x : p_->ips) {
        IpCircuit c{x.instance, x.module, {}};
        const std::string base =
            x.at.empty() ? x.instance : normSep(x.at) + "." + x.instance;
        for (const auto& o : pr.objects) {
            if (o.design != x.module) continue;
            IpPortState ps;
            ps.port = o.name;
            ps.dir = o.dir;
            std::string* vals[3] = {&ps.s, &ps.sac, &ps.asc};
            for (int k = 0; k < 3; ++k) {
                std::string stuck;
                *vals[k] = ipPinValue(p_, base + "." + o.name, kPhases[k], 0, &stuck);
                if (vals[k]->empty()) *vals[k] = "X";
                if (*vals[k] == "X" && ps.stuck.empty() && o.dir != "in") ps.stuck = stuck;
            }
            ps.declared = pinDeclared(p_, base + "." + o.name);
            c.ports.push_back(std::move(ps));
        }
        out.push_back(std::move(c));
    }
    return out;
}

std::size_t DpShell::planRev() const {
    // A hash of everything the plan holds. Cheap (these lists are tens of entries) and, unlike a
    // counter, it cannot go stale when a new recording command is added.
    std::size_t h = 1469598103934665603ull;
    const auto mix = [&h](const std::string& s) {
        for (unsigned char ch : s) { h ^= ch; h *= 1099511628211ull; }
        h ^= '|'; h *= 1099511628211ull;
    };
    for (const auto& o : p_->occ) { mix(o.pin); mix(o.clock); mix(o.comment); }
    for (const auto& m : p_->mux) { mix(m.target); mix(m.overrideSource); mix(m.select); }
    for (const auto& pc : p_->pinCons) { mix(pc.pin); mix(std::string(1, pc.value)); }
    for (const auto& c : p_->clocks) { mix(c.node); mix(c.offState); mix(c.label); }
    for (const auto& s : p_->signals) { mix(s.name); mix(s.source); mix(std::to_string(s.value)); }
    for (const auto& [k, v] : p_->drcSeverity) { mix(k); mix(v); }
    for (const auto& i : p_->ips) { mix(i.module); mix(i.instance); mix(i.at); }
    for (const auto& c : p_->conns) { mix(c.from); mix(c.to); mix(c.constant); }
    mix(p_->sdcFile);
    mix(p_->dftLib);
    return h;
}

std::vector<std::pair<std::string, int>> DpShell::drcPinConstraints() const {
    std::vector<std::pair<std::string, int>> out;
    for (const auto& pc : p_->pinCons)
        if (pc.value == '0' || pc.value == '1') out.emplace_back(pc.pin, pc.value == '1' ? 1 : 0);
    return out;
}
std::vector<std::string> DpShell::drcOccPoints() const {
    std::vector<std::string> out;
    for (const auto& o : p_->occ) out.push_back(o.pin);
    return out;
}
CrQuery DpShell::drcPhaseQuery(const std::string& phase) const {
    return phaseQueryFor(p_, phase);
}

std::vector<std::pair<std::string, std::string>> DpShell::drcPlannedMuxes() const {
    // THE SAME resolution consQuery uses — select/source COMPUTED from the IP circuit first,
    // user constraints as fallback. This accessor once had its own constraint-only copy, so a
    // select that computed 1 (TDR circuit) was treated as "not held" and the mux vanished from
    // the shift walk while the phase walks credited it: s(X)-sac(0)/asc(0), red forever.
    std::vector<std::pair<std::string, std::string>> out;
    for (const auto& pm : consQuery(p_).plannedMuxes) out.emplace_back(pm.target, pm.value);
    return out;
}

std::vector<std::pair<std::string, bool>> DpShell::drcForces() const {
    std::vector<std::pair<std::string, bool>> out;
    for (const auto& s : p_->signals) out.emplace_back(s.name, s.value != 0);
    return out;
}

std::string DpShell::renderOccTcl() const {
    return renderOccText(p_->occ, [&](const std::string& id) { return p_->show(id); });
}

std::string DpShell::renderCtrlMuxTcl() const {
    std::ostringstream o;
    o << "# DFT control muxes (replayable dp_shell commands)\n";
    for (auto& m : p_->mux)
        o << "add_dft_ctrl_mux " << p_->show(m.target) << " -override_source " << m.overrideSource
          << " -select " << m.select << "\n";
    return o.str();
}

bool DpShell::writeOccTcl(const std::string& path, std::string& err) const {
    std::ofstream f(path);
    if (!f) { err = "cannot write " + path; return false; }
    f << renderOccTcl();
    if (!f) { err = "write failed: " + path; return false; }
    return true;
}

std::string DpShell::helpText() {
    // The banner only. The command list lives in the registry and is printed by
    // `report_commands`; a second hand-maintained copy here is exactly how a help text ends up
    // describing switches a command no longer has.
    return
        "dp_shell — a Tcl shell over the elaborated design.\n"
        "  report_commands            every DFT planner command, by group\n"
        "  <command> -help            one command in full        Tab   complete\n"
        "  get_instances/get_ports/get_pins/get_nets/get_modules [pat] [-filter ...]\n"
        "  Unix basics (ls cat grep find wc head tail which…) and the whole Tcl language work here.";
}

}  // namespace hdl::service
