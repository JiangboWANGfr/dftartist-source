#include "service/SdcTcl.h"

#ifdef HDL_HAVE_TCL

#include <tcl.h>

#include <algorithm>
#include <cstring>
#include <string>
#include <vector>

namespace hdl::service {
namespace {

// Accumulates results while the interpreter runs; owned by parseSdcTcl*.
struct Ctx {
    SdcInfo info;
    const SdcObjects* objs = nullptr;
};

// Tcl-style glob match (same semantics as `string match`), so "*clk*" / "u_?/clk" behave the
// way an SDC author expects.
bool globMatch(const std::string& pat, const std::string& s) {
    return Tcl_StringMatch(s.c_str(), pat.c_str()) != 0;
}

/// Names matching any of `pats`, in design order, de-duplicated. A pattern with no wildcard that
/// matches nothing is still returned verbatim: hierarchical pins that our port/pin enumeration
/// missed must not silently disappear from the constraint set.
std::vector<std::string> resolve(const std::vector<std::string>& pool,
                                 const std::vector<std::string>& pats) {
    std::vector<std::string> out;
    auto push = [&out](const std::string& n) {
        if (std::find(out.begin(), out.end(), n) == out.end()) out.push_back(n);
    };
    for (const std::string& p : pats) {
        const bool wild = p.find_first_of("*?[") != std::string::npos;
        bool any = false;
        for (const std::string& n : pool)
            if (globMatch(p, n)) { push(n); any = true; }
        if (!any && !wild) push(p);
    }
    return out;
}

std::vector<std::string> argsToVec(int objc, Tcl_Obj* const objv[], int from) {
    std::vector<std::string> v;
    for (int i = from; i < objc; ++i) v.emplace_back(Tcl_GetString(objv[i]));
    return v;
}

/// Flatten a Tcl value that may be a list ("a b c") into individual words.
void appendFlat(Tcl_Interp* ip, Tcl_Obj* o, std::vector<std::string>& out) {
    int n = 0;
    Tcl_Obj** el = nullptr;
    if (Tcl_ListObjGetElements(ip, o, &n, &el) == TCL_OK && n >= 0) {
        for (int i = 0; i < n; ++i) out.emplace_back(Tcl_GetString(el[i]));
        if (n > 0) return;
    }
    const char* s = Tcl_GetString(o);
    if (s && *s) out.emplace_back(s);
}

Tcl_Obj* listOf(const std::vector<std::string>& v) {
    Tcl_Obj* l = Tcl_NewListObj(0, nullptr);
    for (const std::string& s : v) Tcl_ListObjAppendElement(nullptr, l, Tcl_NewStringObj(s.c_str(), -1));
    return l;
}

// ---- object query commands -----------------------------------------------------------------

int cmdGetPorts(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = static_cast<Ctx*>(cd);
    std::vector<std::string> pats;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (!a.empty() && a[0] == '-') continue;   // -hierarchical, -quiet, -regexp, ...
        appendFlat(ip, objv[i], pats);
    }
    Tcl_SetObjResult(ip, listOf(resolve(c->objs->ports, pats)));
    return TCL_OK;
}

int cmdGetPins(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = static_cast<Ctx*>(cd);
    std::vector<std::string> pats;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (!a.empty() && a[0] == '-') continue;
        appendFlat(ip, objv[i], pats);
    }
    // SDC writes pins with '/', our design model uses '.': accept either.
    for (std::string& p : pats)
        for (char& ch : p)
            if (ch == '/') ch = '.';
    Tcl_SetObjResult(ip, listOf(resolve(c->objs->pins, pats)));
    return TCL_OK;
}

int cmdAllInputs(ClientData cd, Tcl_Interp* ip, int, Tcl_Obj* const[]) {
    Tcl_SetObjResult(ip, listOf(static_cast<Ctx*>(cd)->objs->inputs));
    return TCL_OK;
}

int cmdAllClocks(ClientData cd, Tcl_Interp* ip, int, Tcl_Obj* const[]) {
    auto* c = static_cast<Ctx*>(cd);
    std::vector<std::string> names;
    for (const SdcClock& ck : c->info.clocks) names.push_back(ck.name);
    Tcl_SetObjResult(ip, listOf(names));
    return TCL_OK;
}

int cmdGetClocks(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = static_cast<Ctx*>(cd);
    std::vector<std::string> pool;
    for (const SdcClock& ck : c->info.clocks) pool.push_back(ck.name);
    std::vector<std::string> pats;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (!a.empty() && a[0] == '-') continue;
        appendFlat(ip, objv[i], pats);
    }
    Tcl_SetObjResult(ip, listOf(resolve(pool, pats)));
    return TCL_OK;
}

// ---- constraint commands we actually consume -----------------------------------------------

int cmdCreateClock(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = static_cast<Ctx*>(cd);
    const bool generated = std::strcmp(Tcl_GetString(objv[0]), "create_generated_clock") == 0;
    SdcClock ck;
    ck.generated = generated;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (a == "-name" && i + 1 < objc) ck.name = Tcl_GetString(objv[++i]);
        else if (a == "-period" && i + 1 < objc) {
            double d = 0;
            if (Tcl_GetDoubleFromObj(ip, objv[++i], &d) == TCL_OK) ck.period = d;
        } else if (a == "-source" && i + 1 < objc) {
            std::vector<std::string> s;
            appendFlat(ip, objv[++i], s);
            if (!s.empty()) ck.source = s.front();
        } else if (a == "-edges" || a == "-waveform" || a == "-divide_by" || a == "-multiply_by" ||
                   a == "-duty_cycle" || a == "-edge_shift" || a == "-master_clock" ||
                   a == "-comment") {
            if (i + 1 < objc) ++i;   // option with one (possibly list) argument
        } else if (!a.empty() && a[0] == '-') {
            // flags: -add, -invert, -combinational, -quiet ...
        } else {
            appendFlat(ip, objv[i], ck.targets);
        }
    }
    if (ck.name.empty() && !ck.targets.empty()) ck.name = ck.targets.front();
    if (ck.targets.empty() && !generated)
        c->info.errors.push_back("create_clock resolved to no object (check its -period/target)");
    c->info.clocks.push_back(std::move(ck));
    return TCL_OK;
}

int cmdSetCase(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = static_cast<Ctx*>(cd);
    if (objc < 3) return TCL_OK;
    int value = 0;
    std::vector<std::string> targets;
    bool haveValue = false;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (!a.empty() && a[0] == '-') continue;
        if (!haveValue) {
            value = (a == "1" || a == "rising") ? 1 : 0;
            haveValue = true;
        } else {
            appendFlat(ip, objv[i], targets);
        }
    }
    for (std::string& t : targets) {
        for (char& ch : t)
            if (ch == '/') ch = '.';
        c->info.cases.push_back({t, value});
    }
    return TCL_OK;
}

/// Accept-and-ignore: real SDC files are full of timing/enviroment constraints that do not
/// affect clock/reset STRUCTURE. Registering them keeps the file from aborting mid-way (which
/// would drop the create_clock commands that come after).
int cmdIgnore(ClientData, Tcl_Interp*, int, Tcl_Obj* const[]) { return TCL_OK; }

const char* kIgnored[] = {
    "set_false_path", "set_multicycle_path", "set_max_delay", "set_min_delay",
    "set_input_delay", "set_output_delay", "set_clock_uncertainty", "set_clock_latency",
    "set_clock_transition", "set_clock_groups", "set_propagated_clock", "set_disable_timing",
    "set_load", "set_driving_cell", "set_drive", "set_input_transition", "set_max_fanout",
    "set_max_transition", "set_max_capacitance", "set_min_capacitance", "set_units",
    "set_operating_conditions", "set_wire_load_model", "set_wire_load_mode", "set_timing_derate",
    "set_ideal_network", "set_dont_touch", "set_dont_use", "set_size_only", "set_max_area",
    "group_path", "current_design", "current_instance", "set_hierarchy_separator",
    "create_voltage_area", "set_level_shifter_strategy", "set_data_check", "set_resistance",
    "set_max_time_borrow", "set_sense", "set_clock_sense", "set_logic_dc",
};

// `set_logic_zero`/`set_logic_one` DO constrain values -> treat them as case analysis.
int cmdSetLogic(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = static_cast<Ctx*>(cd);
    const std::string cmd = Tcl_GetString(objv[0]);
    const int value = (cmd == "set_logic_one") ? 1 : 0;
    std::vector<std::string> targets;
    for (int i = 1; i < objc; ++i) {
        const std::string a = Tcl_GetString(objv[i]);
        if (!a.empty() && a[0] == '-') continue;
        appendFlat(ip, objv[i], targets);
    }
    for (std::string& t : targets) {
        for (char& ch : t)
            if (ch == '/') ch = '.';
        c->info.cases.push_back({t, value});
    }
    return TCL_OK;
}

/// Unknown commands must not abort the file: report once, keep going.
int cmdUnknown(ClientData cd, Tcl_Interp* ip, int objc, Tcl_Obj* const objv[]) {
    auto* c = static_cast<Ctx*>(cd);
    if (objc >= 2) {
        const std::string name = Tcl_GetString(objv[1]);
        const std::string note = "ignored unsupported SDC command: " + name;
        if (std::find(c->info.errors.begin(), c->info.errors.end(), note) == c->info.errors.end())
            c->info.errors.push_back(note);
    }
    Tcl_ResetResult(ip);
    return TCL_OK;
}

void registerCmds(Tcl_Interp* ip, Ctx* c) {
    Tcl_CreateObjCommand(ip, "create_clock", cmdCreateClock, c, nullptr);
    Tcl_CreateObjCommand(ip, "create_generated_clock", cmdCreateClock, c, nullptr);
    Tcl_CreateObjCommand(ip, "set_case_analysis", cmdSetCase, c, nullptr);
    Tcl_CreateObjCommand(ip, "set_logic_zero", cmdSetLogic, c, nullptr);
    Tcl_CreateObjCommand(ip, "set_logic_one", cmdSetLogic, c, nullptr);
    Tcl_CreateObjCommand(ip, "get_ports", cmdGetPorts, c, nullptr);
    Tcl_CreateObjCommand(ip, "get_port", cmdGetPorts, c, nullptr);
    Tcl_CreateObjCommand(ip, "get_pins", cmdGetPins, c, nullptr);
    Tcl_CreateObjCommand(ip, "get_pin", cmdGetPins, c, nullptr);
    Tcl_CreateObjCommand(ip, "get_nets", cmdGetPins, c, nullptr);
    Tcl_CreateObjCommand(ip, "get_clocks", cmdGetClocks, c, nullptr);
    Tcl_CreateObjCommand(ip, "all_clocks", cmdAllClocks, c, nullptr);
    Tcl_CreateObjCommand(ip, "all_inputs", cmdAllInputs, c, nullptr);
    Tcl_CreateObjCommand(ip, "all_outputs", cmdAllInputs, c, nullptr);
    Tcl_CreateObjCommand(ip, "all_registers", cmdAllClocks, c, nullptr);
    for (const char* n : kIgnored) Tcl_CreateObjCommand(ip, n, cmdIgnore, c, nullptr);
    Tcl_CreateObjCommand(ip, "unknown", cmdUnknown, c, nullptr);
}

SdcInfo runTcl(const std::string& script, bool isFile, const SdcObjects& objs) {
    Ctx c;
    c.objs = &objs;
    Tcl_Interp* ip = Tcl_CreateInterp();
    if (!ip) {
        c.info.errors.push_back("failed to create Tcl interpreter");
        return c.info;
    }
    // Tcl_Init loads the script library; SDC does not need it and it fails on installs without
    // init.tcl, so skip it deliberately — the core interpreter is enough.
    registerCmds(ip, &c);
    const int rc = isFile ? Tcl_EvalFile(ip, script.c_str())
                          : Tcl_Eval(ip, script.c_str());
    if (rc != TCL_OK) {
        std::string msg = Tcl_GetStringResult(ip);
        if (Tcl_Obj* opts = Tcl_GetReturnOptions(ip, rc)) {
            Tcl_Obj* key = Tcl_NewStringObj("-errorinfo", -1);
            Tcl_Obj* val = nullptr;
            Tcl_IncrRefCount(key);
            if (Tcl_DictObjGet(nullptr, opts, key, &val) == TCL_OK && val) msg = Tcl_GetString(val);
            Tcl_DecrRefCount(key);
        }
        c.info.errors.push_back("SDC evaluation failed: " + msg);
    }
    Tcl_DeleteInterp(ip);
    return c.info;
}

}  // namespace

bool sdcTclAvailable() { return true; }

SdcInfo parseSdcTcl(const std::string& path, const SdcObjects& objs) {
    return runTcl(path, /*isFile*/ true, objs);
}
SdcInfo parseSdcTclText(const std::string& text, const SdcObjects& objs) {
    return runTcl(text, /*isFile*/ false, objs);
}

}  // namespace hdl::service

#else   // !HDL_HAVE_TCL

namespace hdl::service {

bool sdcTclAvailable() { return false; }

SdcInfo parseSdcTcl(const std::string& path, const SdcObjects&) {
    SdcInfo i;
    i.errors.push_back("this build has no Tcl interpreter; cannot read SDC: " + path);
    return i;
}
SdcInfo parseSdcTclText(const std::string&, const SdcObjects&) {
    SdcInfo i;
    i.errors.push_back("this build has no Tcl interpreter");
    return i;
}

}  // namespace hdl::service

#endif
