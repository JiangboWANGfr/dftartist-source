#include "service/ScanBudget.h"

#include <algorithm>
#include <chrono>
#include <map>
#include <set>
#include <string>

namespace hdl::service {

namespace {

/// Tcl-compatible glob (* ? [set]) — the same shapes the user's own
/// `get_instance *tessent_occ* -h` filters use.
bool globMatch(const char* p, const char* s) {
    while (*p) {
        if (*p == '*') {
            ++p;
            if (!*p) return true;
            for (const char* t = s;; ++t) {
                if (globMatch(p, t)) return true;
                if (!*t) return false;
            }
        }
        if (!*s) return false;
        if (*p == '?') { ++p; ++s; continue; }
        if (*p == '[') {
            ++p;
            const bool neg = (*p == '^' || *p == '!');
            if (neg) ++p;
            bool hit = false;
            char prev = 0;
            for (; *p && *p != ']'; ++p) {
                if (*p == '-' && prev && p[1] && p[1] != ']') {
                    if (*s >= prev && *s <= p[1]) hit = true;
                    ++p;
                    prev = 0;
                } else {
                    if (*p == *s) hit = true;
                    prev = *p;
                }
            }
            if (*p == ']') ++p;
            if (hit == neg) return false;
            ++s;
            continue;
        }
        if (*p != *s) return false;
        ++p;
        ++s;
    }
    return !*s;
}

/// Instance paths arrive from three places (the design db, a Tcl script, a GUI tree) with
/// three separators. Normalise so a prefix test means what it looks like.
std::string norm(std::string s) {
    for (char& c : s)
        if (c == '/') c = '.';
    return s;
}

bool isUnder(const std::string& ancestor, const std::string& path) {
    if (ancestor.empty()) return true;
    if (path == ancestor) return true;
    return path.size() > ancestor.size() && path.compare(0, ancestor.size(), ancestor) == 0 &&
           path[ancestor.size()] == '.';
}

bool matchesAny(const std::string& path, const std::vector<std::string>& globs) {
    for (const std::string& g : globs)
        if (globMatch(norm(g).c_str(), path.c_str())) return true;
    return false;
}

/// An exception covers its whole subtree: excepting a block means the flops inside it are out
/// too, which is the only reading that matches what the planner shows.
bool excludedBy(const std::string& path, const std::vector<std::string>& ex) {
    for (const std::string& e : ex)
        if (isUnder(norm(e), path)) return true;
    return matchesAny(path, ex);
}

/// One `-option value` pair on a generated Tcl command, kept ORDERED because a spec is read and
/// diffed by people and a stable order is what makes that possible.
///
/// The two commands this file emits carry 33 and 36 switches respectively. We derive a handful
/// (the families a mode includes, its type, its EDT instances); every other one is a decision
/// only the engineer can make — `-ssh_instance`, `-ssh_chain_groups`, the timings, the lockup
/// cell types — and a generator that cannot express them is a generator whose output has to be
/// hand-edited, which defeats the point of generating it.
struct TclOpts {
    std::vector<std::pair<std::string, std::string>> kv;

    /// Set unless the user already gave this option — a derived value never overwrites theirs.
    void seed(const std::string& k, const std::string& v) {
        for (auto& e : kv)
            if (e.first == k) return;
        kv.emplace_back(k, v);
    }
    void set(const std::string& k, const std::string& v) {
        for (auto& e : kv)
            if (e.first == k) { e.second = v; return; }
        kv.emplace_back(k, v);
    }
    bool has(const std::string& k) const {
        for (const auto& e : kv)
            if (e.first == k) return true;
        return false;
    }
    /// Put every switch back into the manual's own order, so a generated command can be diffed
    /// against the reference — and against last week's output — line for line. Seeded values are
    /// appended as they are added, which would otherwise scatter them through the command.
    void sortBy(const std::vector<std::string>& order) {
        std::stable_sort(kv.begin(), kv.end(), [&](const auto& a, const auto& b) {
            return std::find(order.begin(), order.end(), a.first) <
                   std::find(order.begin(), order.end(), b.first);
        });
    }
    /// `-k v` pairs, wrapped so a 36-option command stays readable.
    std::string render(std::size_t indent) const {
        std::string s;
        std::size_t col = 0;
        for (const auto& [k, v] : kv) {
            const std::string one = " -" + k + (v.empty() ? "" : " " + v);
            if (col && col + one.size() > 92) { s += " \\\n" + std::string(indent, ' '); col = indent; }
            s += one;
            col += one.size();
        }
        return s;
    }
};

/// User options for one family / mode, in the manual's own order so the emitted command reads
/// like the reference does.
TclOpts userOpts(const std::map<std::string, std::string>& given,
                 const std::vector<std::string>& order) {
    TclOpts o;
    for (const std::string& k : order) {
        auto it = given.find(k);
        if (it != given.end() && !it->second.empty()) o.kv.emplace_back(k, it->second);
    }
    // anything the caller sent that is not in the known order still goes out, after the rest
    for (const auto& [k, v] : given)
        if (!v.empty() && !o.has(k)) o.kv.emplace_back(k, v);
    return o;
}

/// `create_scan_chain_family`, tshell_ref p.638.
const std::vector<std::string>& familyOptionOrder() {
    static const std::vector<std::string> k = {
        "ordered_elements", "include_elements", "include_chain_families",
        "edt_instances", "ssh_instance", "ssh_chain_groups", "si_connections", "so_connections",
        "si_associated_ports", "so_associated_ports", "mutable",
        "attribute_set_for_chain_assembly", "single_attribute_set_chains", "single_class_chains",
        "single_clock_domain_chains", "single_clock_edge_chains", "single_power_domain_chains",
        "single_cluster_chains", "single_wrapper_type_chains", "port_index_start_value",
        "port_scalar_index_modifier", "chain_length", "chain_count", "si_port_format",
        "so_port_format", "si_timing", "so_timing", "lockup_cell_type", "si_lockup_cell_type",
        "so_lockup_cell_type", "unused_chain_connection_handling", "si_pipelining",
        "si_pipelining_type",
    };
    return k;
}

/// `add_scan_mode`, tshell_ref p.358.
const std::vector<std::string>& modeOptionOrder() {
    static const std::vector<std::string> k = {
        "chain_length", "chain_count", "type", "associate_chains", "include_chain_families",
        "include_elements", "include_modes", "enable_connections", "enable_code",
        "enable_dft_signal", "si_timing", "so_timing", "edt_instances", "ssh_instance",
        "ssh_chain_groups", "si_connections", "so_connections", "si_associated_ports",
        "so_associated_ports", "si_port_format", "so_port_format", "port_index_start_value",
        "port_scalar_index_modifier", "attribute_set_for_chain_assembly",
        "single_attribute_set_chains", "single_class_chains", "single_clock_domain_chains",
        "single_clock_edge_chains", "single_power_domain_chains", "single_cluster_chains",
        "single_wrapper_type_chains", "lockup_cell_type", "si_lockup_cell_type",
        "so_lockup_cell_type", "unused_chain_connection_handling", "si_pipelining",
        "si_pipelining_type",
    };
    return k;
}

std::string ind(int n) { return std::string(static_cast<std::size_t>(n) * 2, ' '); }

std::string pad(const std::string& s, std::size_t w) {
    return s.size() >= w ? s : s + std::string(w - s.size(), ' ');
}

/// `Controller(NAME) { … }` in the grammar the flow's own DftSpecification uses.
std::string emitController(const EdtBudget& b, const EdtPlan& plan) {
    const std::string mode = b.external ? "ext_edt_mode" : "int_edt_mode";
    std::string s;
    s += ind(2) + "Controller(" + b.name + ") {\n";
    s += ind(3) + pad("longest_chain_range", 32) + ": " + std::to_string(b.longestMin) + ", " +
         std::to_string(b.longestMax) + ";\n";
    s += ind(3) + pad("scan_chain_count", 32) + ": " + std::to_string(b.chainCount) + ";\n";
    s += ind(3) + pad("input_channel_count", 32) + ": " + std::to_string(b.channels) + ";\n";
    s += ind(3) + pad("output_channel_count", 32) + ": " + std::to_string(b.channels) + ";\n";
    // The reference specs in this flow carry separate control channels on an INTERNAL controller
    // and off on an external one; -1 means "take that house default".
    const bool sep = plan.separateControlDataChannels < 0 ? !b.external
                                                          : plan.separateControlDataChannels != 0;
    s += ind(3) + pad("separate_control_data_channels", 32) + ": " + (sep ? "on" : "off") + ";\n";

    // Compactor / ShiftPowerOptions are on every controller in the reference specs, so they are
    // emitted by default rather than left for a hand edit afterwards. A negative value omits the
    // block entirely, for the design that genuinely does not want it.
    if (plan.pipelineLogicLevelsInCompactor >= 0) {
        s += ind(3) + "Compactor {\n";
        s += ind(4) + pad("pipeline_logic_levels_in_compactor", 22) + ": " +
             std::to_string(plan.pipelineLogicLevelsInCompactor) + ";\n";
        s += ind(3) + "}\n";
    }
    if (plan.minSwitchingThresholdPercentage >= 0) {
        s += ind(3) + "ShiftPowerOptions {\n";
        s += ind(4) + pad("present", 22) + ": on;\n";
        s += ind(4) + pad("min_switching_threshold_percentage", 22) + ": " +
             std::to_string(plan.minSwitchingThresholdPercentage) + ";\n";
        s += ind(3) + "}\n";
    }

    s += ind(3) + "Connections {\n";
    if (!plan.sshChainGroup.empty())
        s += ind(4) + pad("ssh_chain_group", 26) + ": " + plan.sshChainGroup + ";\n";
    s += ind(4) + pad("mode_enables", 26) + ": DftSignal(" + mode + ");\n";
    // The channel pipelines are part of the house shape too. Their leaf names follow the mode,
    // exactly as the reference specs name them, unless the plan overrides them.
    const std::string kind = b.external ? "ext" : "int";
    const std::string inPipe = plan.channelInPipe.empty()
                                   ? "dfx_" + kind + "_edt_channels_in_pipe" : plan.channelInPipe;
    const std::string outPipe = plan.channelOutPipe.empty()
                                    ? "dfx_" + kind + "_edt_channels_out_pipe" : plan.channelOutPipe;
    const auto channels = [&](const char* which, const std::string& leaf) {
        s += ind(4) + which + "(" + std::to_string(b.channels) + ":1) {\n";
        s += ind(5) + "PipelineStage {\n";
        s += ind(6) + pad("leaf_instance_name", 22) + ": " + leaf + ";\n";
        s += ind(5) + "}\n" + ind(4) + "}\n";
    };
    if (b.channels > 0) {
        channels("EdtChannelsIn", inPipe);
        channels("EdtChannelsOut", outPipe);
    }
    s += ind(4) + pad("scan_en", 26) + ": OptionalDftSignal(scan_en);\n";
    s += ind(3) + "}\n";
    s += ind(2) + "}\n";
    return s;
}

/// The `add_scan_mode` half. Emitted from the same model as the spec block above because the
/// two have to agree — an EDT sized for cells the scan mode never routes to it is the failure
/// this whole file exists to prevent.
std::string emitScanTcl(const ScanBudgetOptions& opt, const ScanBudgetResult& r) {
    std::string s;
    s += "# ---- generated from the scan budget; regenerate rather than edit ----\n";
    s += "register_attribute -name is_occ   -obj_type scan_element -value_type boolean\n";
    s += "register_attribute -name is_hyper -obj_type scan_element -value_type boolean\n";
    for (const std::string& g : opt.occInstances)
        s += "set_attribute_value [get_scan_element -below_instances [get_name_list "
             "[get_instance " + g + " -h]]] -name is_occ\n";
    for (const std::string& g : opt.hyperInstances)
        s += "set_attribute_value [get_scan_element -below_instances [get_name_list "
             "[get_instance " + g + " -h]]] -name is_hyper\n";
    // Exceptions are applied AFTER the rules, for the same reason the planner stores them
    // separately: the rule stays readable and the subtraction stays visible.
    for (const std::string& g : opt.occExcludes)
        s += "set_attribute_value [get_scan_element -below_instances [get_name_list "
             "[get_instance " + g + " -h]]] -name is_occ -value false\n";
    for (const std::string& g : opt.hyperExcludes)
        s += "set_attribute_value [get_scan_element -below_instances [get_name_list "
             "[get_instance " + g + " -h]]] -name is_hyper -value false\n";
    s += "\n";
    // `add_nonscan_instances` takes a collection, so an exception is subtracted from the
    // collection itself rather than undone afterwards.
    std::string nsMinus;
    for (const std::string& g : opt.nonscanExcludes) nsMinus += " [get_instance " + g + " -h]";
    for (const std::string& g : opt.nonscanInstances)
        s += nsMinus.empty()
                 ? "add_nonscan_instances [get_instance " + g + "]\n"
                 : "add_nonscan_instances [remove_from_collection [get_instance " + g + "]" +
                       nsMinus + "]\n";
    if (!opt.nonscanInstances.empty()) s += "\n";
    // One emitter for every family: the derived switches are SEEDED, so anything the engineer
    // set for that family wins and everything else they set rides along.
    const auto family = [&](const char* name, const char* filter) {
        auto it = opt.familyOptions.find(name);
        TclOpts o = it == opt.familyOptions.end()
                        ? TclOpts{} : userOpts(it->second, familyOptionOrder());
        o.seed("include_elements", std::string("[get_scan_element * -filter \"") + filter + "\"]");
        o.seed("chain_length", "unlimited");
        o.sortBy(familyOptionOrder());
        s += "create_scan_chain_family " + std::string(name) + o.render(4) + "\n";
    };
    family("OCC_CHAIN", "is_occ");
    family("HYPER_CHAIN", "is_hyper");
    family("INT_CHAIN", "!is_occ && !is_hyper");
    if (opt.familyOptions.count("WRAPPER_CHAIN")) {
        TclOpts o = userOpts(opt.familyOptions.at("WRAPPER_CHAIN"), familyOptionOrder());
        o.seed("include_elements",
               "[get_scan_elements -filter \"class == wrapper && !is_occ && !is_hyper\"]");
        o.sortBy(familyOptionOrder());
        s += "create_scan_chain_family WRAPPER_CHAIN" + o.render(4) + "\n";
    }
    // CUSTOM families — any name in familyOptions the model above does not derive. The planner
    // sends their membership as include_elements and whatever other switches were set; they are
    // emitted verbatim, so a family invented in the UI exists in the Tcl too instead of being a
    // UI-only fiction.
    for (const auto& [name, given] : opt.familyOptions) {
        if (name == "OCC_CHAIN" || name == "HYPER_CHAIN" || name == "INT_CHAIN" ||
            name == "WRAPPER_CHAIN")
            continue;
        TclOpts o = userOpts(given, familyOptionOrder());
        o.sortBy(familyOptionOrder());
        s += "create_scan_chain_family " + name + o.render(4) + "\n";
    }
    s += "\n";
    for (std::size_t i = 0; i < r.edts.size(); ++i) {
        const EdtBudget& b = r.edts[i];
        const EdtPlan& p = opt.edts[i];
        std::string fams;
        if (!b.external) fams += "INT_CHAIN ";
        if (p.includeOcc) fams += "OCC_CHAIN ";
        if (p.includeHyper) fams += "HYPER_CHAIN ";
        // Custom families ride in the same list — created above from familyOptions, carried by
        // whichever controller ticked them.
        for (const auto& x : p.extraFamilies) fams += x + " ";
        while (!fams.empty() && fams.back() == ' ') fams.pop_back();

        s += "# " + b.name + ": " + std::to_string(b.cells()) + " scan cells -> " +
             std::to_string(b.chainCount) + " chains of ~" + std::to_string(b.longestMin) + "-" +
             std::to_string(b.longestMax) + "\n";
        const std::string mode = b.external ? "ext_edt_mode" : "int_edt_mode";
        auto mit = opt.scanModeOptions.find(mode);
        TclOpts o = mit == opt.scanModeOptions.end()
                        ? TclOpts{} : userOpts(mit->second, modeOptionOrder());
        o.seed("type", b.external ? "external" : "internal");
        o.seed("enable_dft_signal", mode);
        if (!fams.empty()) o.seed("include_chain_families", "[list " + fams + "]");
        if (p.includeWrapper)
            o.seed("include_elements", "[get_scan_elements -filter \"class == wrapper\"]");
        o.seed("single_wrapper_type_chains", "on");
        o.seed("single_clock_edge_chains", "on");
        o.seed("single_clock_domain_chains", "off");
        o.seed("single_class_chains", "on");
        o.seed("si_lockup_cell_type", "flop");
        // -edt_instances and -ssh_instance are alternatives in the grammar; naming an SSH host
        // means this mode is driven by SSN, so an EDT instance list would contradict it.
        if (!o.has("ssh_instance") && !o.has("si_connections"))
            o.seed("edt_instances",
                   "[get_name_list [get_instance -of_icl_instances [get_name_list "
                   "[get_icl_instances -filter \"name =~ *" + b.name +
                   "* && tessent_instrument_type==mentor::edt\"]]]]");
        o.sortBy(modeOptionOrder());
        s += "add_scan_mode " + mode + o.render(4) + "\n\n";
    }
    return s;
}

}  // namespace

ScanBudgetOptions scanBudgetOptionsFromJson(const json::Value& cfg) {
    using V = json::Value;
    ScanBudgetOptions opt;
    auto strList = [&](const char* key, std::vector<std::string>& out) {
        if (const V* v = cfg.find(key); v && v->type == V::Type::Array)
            for (const auto& e : v->arr)
                if (e.type == V::Type::Str) out.push_back(e.s);
    };
    opt.core = cfg.str("core");
    opt.designName = cfg.str("designName");
    if (!cfg.str("specScope").empty()) opt.specScope = cfg.str("specScope");
    strList("occInstances", opt.occInstances);
    strList("hyperInstances", opt.hyperInstances);
    strList("nonscanInstances", opt.nonscanInstances);
    // { "OCC_CHAIN": { "ssh_instance": "...", "ssh_chain_groups": "occ_chain" }, ... }
    auto optMap = [&](const char* key,
                      std::map<std::string, std::map<std::string, std::string>>& dst) {
        const V* m = cfg.find(key);
        if (!m || m->type != V::Type::Object) return;
        for (const auto& [owner, opts] : m->obj) {
            if (opts.type != V::Type::Object) continue;
            for (const auto& [k, v] : opts.obj)
                if (v.type == V::Type::Str && !v.s.empty()) dst[owner][k] = v.s;
        }
    };
    optMap("familyOptions", opt.familyOptions);
    optMap("scanModeOptions", opt.scanModeOptions);
    strList("occExcludes", opt.occExcludes);
    strList("hyperExcludes", opt.hyperExcludes);
    strList("nonscanExcludes", opt.nonscanExcludes);
    if (const V* tol = cfg.find("chainLengthTolerancePercent");
        tol && tol->type == V::Type::Int)
        opt.chainLengthTolerancePercent = static_cast<int>(tol->i);

    if (const V* v = cfg.find("edts"); v && v->type == V::Type::Array)
        for (const auto& e : v->arr) {
            EdtPlan p;
            if (!e.str("name").empty()) p.name = e.str("name");
            auto flag = [&](const char* k, bool def) {
                const V* f = e.find(k);
                if (!f) return def;
                if (f->type == V::Type::Bool) return f->b;
                if (f->type == V::Type::Int) return f->i != 0;
                return def;
            };
            auto num = [&](const char* k, int def) {
                const V* f = e.find(k);
                return (f && f->type == V::Type::Int) ? static_cast<int>(f->i) : def;
            };
            p.external = flag("external", false);
            p.includeOcc = flag("includeOcc", true);
            p.includeHyper = flag("includeHyper", true);
            p.includeWrapper = flag("includeWrapper", p.external);
            // Tri-state: absent leaves -1 (the house default per kind), present pins it.
            if (e.find("separateControlDataChannels"))
                p.separateControlDataChannels = flag("separateControlDataChannels", false) ? 1 : 0;
            if (const V* v = e.find("sshChainGroup"); v && v->type == V::Type::Str)
                p.sshChainGroup = v->s;
            if (const V* v = e.find("channelInPipe"); v && v->type == V::Type::Str)
                p.channelInPipe = v->s;
            if (const V* v = e.find("channelOutPipe"); v && v->type == V::Type::Str)
                p.channelOutPipe = v->s;
            if (const V* v = e.find("pipelineLogicLevelsInCompactor"); v && v->type == V::Type::Int)
                p.pipelineLogicLevelsInCompactor = static_cast<int>(v->i);
            if (const V* v = e.find("minSwitchingThresholdPercentage"); v && v->type == V::Type::Int)
                p.minSwitchingThresholdPercentage = static_cast<int>(v->i);
            p.channels = num("channels", 0);
            p.targetChainLength = num("targetChainLength", 0);
            p.channelInPipe = e.str("channelInPipe");
            p.channelOutPipe = e.str("channelOutPipe");
            if (const V* ins = e.find("instances"); ins && ins->type == V::Type::Array)
                for (const auto& x : ins->arr)
                    if (x.type == V::Type::Str) p.instances.push_back(x.s);
            if (const V* xf = e.find("extraFamilies"); xf && xf->type == V::Type::Array)
                for (const auto& x : xf->arr)
                    if (x.type == V::Type::Str) p.extraFamilies.push_back(x.s);
            opt.edts.push_back(std::move(p));
        }
    return opt;
}

ScanBudgetResult computeScanBudget(DesignDb& db, const ScanBudgetOptions& opt) {
    const auto t0 = std::chrono::steady_clock::now();
    ScanBudgetResult r;
    const auto say = [&](const std::string& s) {
        if (opt.log) opt.log(s);
    };

    // ---- 1. register counts over the whole elaborated hierarchy -----------------------------
    RegCountResult rc = db.getRegisterCounts();
    std::map<std::string, const RegCount*> byId;
    for (const RegCount& c : rc.counts) byId[c.instanceId] = &c;

    std::string core = norm(opt.core);
    if (core.empty()) {
        ReadyInfo ready = db.ready();
        if (ready.candidateTops.empty()) {
            r.errors.push_back("no elaborated top to analyse");
            return r;
        }
        core = norm(ready.candidateTops.front().id);
    }
    r.core = core;
    auto coreIt = byId.find(core);
    if (coreIt == byId.end()) {
        r.errors.push_back("unknown core instance: " + core);
        return r;
    }
    r.coreRegisterBits = coreIt->second->subtree;
    say("core                 " + core);
    say("register bits        " + std::to_string(r.coreRegisterBits));

    // ---- 2. classify: which subtrees are OCC, which are hyper -------------------------------
    // Only the TOP-MOST match counts; a nested match is already inside its ancestor's subtree
    // and adding both would double-count it.
    std::vector<std::string> occRoots, hyperRoots, nonscanRoots;
    for (const RegCount& c : rc.counts) {
        if (!isUnder(core, c.instanceId)) continue;
        std::vector<std::string>* roots = nullptr;
        // Non-scan wins: an instance excluded from scan contributes no cells to any family.
        if (matchesAny(c.instanceId, opt.nonscanInstances) &&
            !excludedBy(c.instanceId, opt.nonscanExcludes)) roots = &nonscanRoots;
        else if (matchesAny(c.instanceId, opt.occInstances) &&
                 !excludedBy(c.instanceId, opt.occExcludes)) roots = &occRoots;
        else if (matchesAny(c.instanceId, opt.hyperInstances) &&
                 !excludedBy(c.instanceId, opt.hyperExcludes)) roots = &hyperRoots;
        if (!roots) continue;
        bool nested = false;
        for (const std::string& existing : *roots)
            if (isUnder(existing, c.instanceId)) { nested = true; break; }
        if (!nested) roots->push_back(c.instanceId);
    }
    // Bits of a root, less the excepted subtrees inside it. Holes are reduced to their outermost
    // members first, or a nested pair would be subtracted twice.
    auto sumRoots = [&](const std::vector<std::string>& roots,
                        const std::vector<std::string>& ex = {}) {
        long long n = 0;
        for (const std::string& p : roots)
            if (auto it = byId.find(p); it != byId.end()) n += it->second->subtree;
        if (ex.empty()) return n;
        std::vector<std::string> cand;
        for (const RegCount& c : rc.counts) {
            if (!excludedBy(c.instanceId, ex)) continue;
            for (const std::string& p : roots)
                if (isUnder(p, c.instanceId)) { cand.push_back(c.instanceId); break; }
        }
        // Shortest first, so the outermost hole is seen before anything nested inside it —
        // rc.counts is not guaranteed to be in hierarchical order.
        std::sort(cand.begin(), cand.end(),
                  [](const std::string& a, const std::string& b) { return a.size() < b.size(); });
        std::vector<std::string> holes;
        for (const std::string& p : cand) {
            bool nested = false;
            for (const std::string& h : holes)
                if (isUnder(h, p)) { nested = true; break; }
            if (!nested) holes.push_back(p);
        }
        for (const std::string& h : holes)
            if (auto it = byId.find(h); it != byId.end()) n -= it->second->subtree;
        return n < 0 ? 0LL : n;
    };
    r.occBits = sumRoots(occRoots, opt.occExcludes);
    r.hyperBits = sumRoots(hyperRoots, opt.hyperExcludes);
    r.nonscanBits = sumRoots(nonscanRoots, opt.nonscanExcludes);
    say("occ cells            " + std::to_string(r.occBits) + "  (" +
        std::to_string(occRoots.size()) + " instance(s))");
    say("hyper cells          " + std::to_string(r.hyperBits) + "  (" +
        std::to_string(hyperRoots.size()) + " instance(s))");
    if (!opt.nonscanInstances.empty())
        say("non-scan (deducted)  " + std::to_string(r.nonscanBits) + "  (" +
            std::to_string(nonscanRoots.size()) + " instance(s))");
    // Exceptions change the numbers, so they belong in the transcript beside them.
    const std::size_t nEx =
        opt.occExcludes.size() + opt.hyperExcludes.size() + opt.nonscanExcludes.size();
    if (nEx) {
        say("exceptions           " + std::to_string(nEx) +
            " subtree(s) held out of their family (bits returned to the remainder)");
        for (const auto* list : {&opt.occExcludes, &opt.hyperExcludes, &opt.nonscanExcludes})
            for (const std::string& e : *list) say("  except " + e);
    }

    // ---- 3. wrapper cells: the EXTEST payload -----------------------------------------------
    bool wantWrapper = false;
    for (const EdtPlan& p : opt.edts) wantWrapper = wantWrapper || p.includeWrapper;
    if (wantWrapper) {
        WrapperOptions wo = opt.wrapper;
        wo.log = nullptr;   // its own progress would drown this log
        WrapperEstimate we = db.wrapperCells(core, wo);
        r.wrapperIn = we.wrapperIn();
        r.wrapperOut = we.wrapperOut();
        say("wrapper cells        in " + std::to_string(r.wrapperIn) + ", out " +
            std::to_string(r.wrapperOut));
    }

    // ---- 4. validate the assignment ---------------------------------------------------------
    int externals = 0;
    for (const EdtPlan& p : opt.edts)
        if (p.external) ++externals;
    if (externals > 1)
        r.errors.push_back("more than one external EDT: the flow allows exactly one EXTEST "
                           "controller");

    // An instance assigned to one EDT while an ancestor of it is assigned to another is the
    // classic silent mis-config: insertion is what finally rejects it, several steps later.
    struct Owned {
        std::string path;
        std::size_t edt;
    };
    std::vector<Owned> owned;
    for (std::size_t i = 0; i < opt.edts.size(); ++i)
        for (const std::string& raw : opt.edts[i].instances) {
            const std::string p = norm(raw);
            if (byId.find(p) == byId.end()) {
                r.errors.push_back("EDT " + opt.edts[i].name + ": unknown instance " + p);
                continue;
            }
            if (!isUnder(core, p)) {
                r.errors.push_back("EDT " + opt.edts[i].name + ": " + p + " is not under " + core);
                continue;
            }
            owned.push_back({p, i});
        }
    for (std::size_t a = 0; a < owned.size(); ++a)
        for (std::size_t b = a + 1; b < owned.size(); ++b) {
            if (owned[a].edt == owned[b].edt) continue;
            if (isUnder(owned[a].path, owned[b].path) || isUnder(owned[b].path, owned[a].path))
                r.errors.push_back("overlapping assignment: " + owned[a].path + " (" +
                                   opt.edts[owned[a].edt].name + ") contains or is contained by " +
                                   owned[b].path + " (" + opt.edts[owned[b].edt].name + ")");
        }

    // ---- 5. per-EDT cells --------------------------------------------------------------------
    // Ordinary flops of a subtree = its register bits minus the OCC/hyper roots inside it,
    // which are budgeted as their own families.
    // RegCount::memoryBits is per-instance OWN, so a subtree total has to be summed. Reported
    // rather than counted: an unpacked array is a RAM, not a scan cell, and a user looking at a
    // "large" instance that contributes few cells needs to see where the bits went.
    auto memInside = [&](const std::string& path) {
        long long n = 0;
        for (const RegCount& c : rc.counts)
            if (isUnder(path, c.instanceId)) n += c.memoryBits;
        return n;
    };

    auto sumInside = [&](const std::string& path, const std::vector<std::string>& roots) {
        long long n = 0;
        for (const std::string& p : roots)
            if (isUnder(path, p))
                if (auto it = byId.find(p); it != byId.end()) n += it->second->subtree;
        return n;
    };
    auto specialInside = [&](const std::string& path) {
        return sumInside(path, occRoots) + sumInside(path, hyperRoots) +
               sumInside(path, nonscanRoots);
    };

    // An internal controller with no instance list takes what no other controller named — the
    // documented meaning of an empty list, which used to be documented and not implemented: the
    // loop below simply iterated an empty vector and the controller came out with zero cells.
    // A single INT EDT covering the whole core is the ordinary case, so "zero cells" was the
    // ordinary answer.
    long long namedOwn = 0;   // core cells explicitly claimed, specials already netted out
    for (const EdtPlan& p : opt.edts) {
        if (p.external) continue;
        for (const std::string& raw : p.instances) {
            const std::string path = norm(raw);
            auto it = byId.find(path);
            if (it != byId.end() && isUnder(core, path))
                namedOwn += it->second->subtree - specialInside(path);
        }
    }
    const long long coreOwn = coreIt->second->subtree - specialInside(core);
    int takesRest = -1;   // index of the internal controller that absorbs the remainder
    for (std::size_t i = 0; i < opt.edts.size(); ++i) {
        if (opt.edts[i].external || !opt.edts[i].instances.empty()) continue;
        if (takesRest < 0) { takesRest = static_cast<int>(i); continue; }
        // Two controllers both meaning "everything else" cannot both be right, and there is no
        // defensible way to split it for them.
        r.errors.push_back("more than one internal controller has no instance list (" +
                           opt.edts[static_cast<std::size_t>(takesRest)].name + ", " +
                           opt.edts[i].name + ") — only one can take the remainder, so name the "
                           "instances the others cover");
    }

    long long claimed = 0;
    for (std::size_t i = 0; i < opt.edts.size(); ++i) {
        const EdtPlan& p = opt.edts[i];
        EdtBudget b;
        b.name = p.name;
        b.external = p.external;
        b.channels = p.channels;

        if (!b.external) {
            for (const std::string& raw : p.instances) {
                const std::string path = norm(raw);
                auto it = byId.find(path);
                if (it == byId.end() || !isUnder(core, path)) continue;
                const long long own = it->second->subtree - specialInside(path);
                const long long mem = memInside(path);
                b.cellsCore += own;
                b.memoryBits += mem;
                b.nonscanBits += sumInside(path, nonscanRoots);
                b.contributions.push_back({path, own, mem});
                claimed += it->second->subtree;
            }
            if (static_cast<int>(i) == takesRest) {
                const long long rest = coreOwn - namedOwn;
                if (rest > 0) {
                    b.cellsCore += rest;
                    b.memoryBits += memInside(core);
                    b.nonscanBits += r.nonscanBits;
                    b.contributions.push_back({core + "  (everything not named elsewhere)", rest,
                                               memInside(core)});
                    claimed += rest;
                }
            }
        }
        if (p.includeOcc) b.cellsOcc = r.occBits;
        if (p.includeHyper) b.cellsHyper = r.hyperBits;
        if (p.includeWrapper) b.cellsWrapper = r.wrapperIn + r.wrapperOut;

        // ---- the three spec numbers, derived from the intent ----
        //
        // The range is centred on the length that will ACTUALLY be achieved, not on the target.
        // Deriving `chain_count = ceil(cells / target)` and then writing `target ± 10%` is how a
        // spec ends up asking for something arithmetically impossible: 1319 cells over 4 chains
        // is 330 per chain, which a range of 360-440 excludes.
        const long long cells = b.cells();
        if (p.targetChainLength > 0 && cells > 0) {
            // Exactly the order the flow's Run Analysis re-derives a config in:
            //   range   = target ± tol
            //   chains  = ceil(cells / range_max)      <- the MAX, so the range always holds
            //   channels= ceil(chains / chainsPerChannel) + separate-control
            // Dividing by the max rather than the target is what guarantees the emitted
            // longest_chain_range actually contains the achieved length.
            const int tol = std::max(0, opt.chainLengthTolerancePercent);
            b.longestMin = p.targetChainLength - p.targetChainLength * tol / 100;
            b.longestMax = p.targetChainLength + p.targetChainLength * tol / 100;
            b.chainCount = std::max<int>(
                1, static_cast<int>((cells + b.longestMax - 1) / std::max(1, b.longestMax)));
            b.achievedLength = static_cast<int>((cells + b.chainCount - 1) / b.chainCount);

            const int perCh = std::max(1, p.chainsPerChannel);
            const int derived = (b.chainCount + perCh - 1) / perCh +
                                (p.separateControlDataChannels > 0 ? 1 : 0);
            if (p.channels <= 0) {
                b.channels = std::max(1, derived);
            } else if (p.channels > b.chainCount) {
                // A decompressor drives at least one chain per input channel, so this is not a
                // poor configuration — it is not a configuration at all.
                b.warnings.push_back(
                    std::to_string(p.channels) + " channels were asked for but " +
                    std::to_string(cells) + " cells at a chain length of " +
                    std::to_string(p.targetChainLength) + " only make " +
                    std::to_string(b.chainCount) + " chains. Using " + std::to_string(derived) +
                    " channel(s), the count this many chains implies. Shorten the target length "
                    "if you need those channels used.");
                b.channels = std::max(1, derived);
            }

            // The flow's own dashboard flags this one, and for good reason: it means the design
            // is far smaller than the chain length it was planned for, so the shift is much
            // shorter than intended and the channel count that follows is nearly meaningless.
            if (b.achievedLength * 2 < p.targetChainLength)
                b.warnings.push_back(
                    "longest achieved chain " + std::to_string(b.achievedLength) +
                    " is under half the target of " + std::to_string(p.targetChainLength) +
                    " — only " + std::to_string(cells) +
                    " cells to spread. Lower the target chain length to plan this honestly.");
        } else if (p.channels > 0) {
            b.chainCount = p.channels;   // degenerate but well-defined: one chain per channel
            b.achievedLength = static_cast<int>((cells + b.chainCount - 1) / b.chainCount);
            b.longestMin = b.achievedLength;
            b.longestMax = b.achievedLength;
            b.warnings.push_back("no target chain length set — chain count defaulted to the "
                                 "channel count");
        }
        if (b.chainCount > 0 && b.channels > 0)
            b.compression = static_cast<double>(b.chainCount) / b.channels;
        if (b.channels <= 0) b.warnings.push_back("channel count not set");
        if (cells == 0) b.warnings.push_back("no scan cells assigned to this controller");
        if (b.chainCount > 0 && cells > 0 && b.chainCount > cells)
            b.warnings.push_back("more chains than cells — the chain count cannot be reached");
        // Belt and braces: below 1.0 the spec is self-contradictory rather than merely
        // inefficient, and until the clamp above existed that is exactly what this file emitted
        // (4 chains fed by 8 channels). If it ever recurs it must be loud, not silent.
        if (b.channels > 0 && b.chainCount > 0 && b.chainCount < b.channels)
            r.errors.push_back(b.name + ": scan_chain_count " + std::to_string(b.chainCount) +
                               " is below input_channel_count " + std::to_string(b.channels) +
                               " — that spec cannot be built");
        if (b.channels > 0 && b.compression > 0.0 && b.compression < 2.0)
            b.warnings.push_back("compression is only " + std::to_string(b.compression).substr(0, 4) +
                                 "x — at this ratio the EDT costs more than it saves; use fewer "
                                 "channels or shorter chains");
        if (b.compression > 400.0)
            b.warnings.push_back("compression ratio " + std::to_string(static_cast<int>(b.compression)) +
                                 "x is beyond the usual EDT range; add channels or lengthen chains");
        // ---- EAB (EDT Aborted) risk, from the OCC sub-chain stitching rules -------------------
        //
        // A pattern that has to FORCE values on scan cells spends decompressor encoding capacity.
        // OCC clock-control bits are the classic case: every one of them must be specified to
        // build the capture sequence. Spread across many chains they land on the SAME shift
        // cycle, cluster, and the test cube stops being compressible — those faults come back as
        // EAB and the coverage goes with them. Which chain they land on is a chain-family
        // decision, so the advice belongs here, before insertion, not in an ATPG post-mortem.
        if (b.cellsOcc > 0 && b.achievedLength > 0) {
            b.occChainRatio = static_cast<double>(b.cellsOcc) / b.achievedLength;
            const int pct = static_cast<int>(b.occChainRatio * 100);
            if (b.cellsOcc > b.achievedLength || b.occChainRatio >= 0.75) {
                b.eabAdvice.push_back(
                    "EAB risk: the OCC bits (" + std::to_string(b.cellsOcc) + ") are " +
                    std::to_string(pct) + "% of a " + std::to_string(b.achievedLength) +
                    "-cell chain. Past ~75% the manual says to put them on an UNCOMPRESSED chain "
                    "instead of a compressed one — budget 2 extra chip-level pins per core for it. "
                    "Run ATPG first to confirm the clustering is real: compressed chains are "
                    "preferred when they work.");
            } else if (b.occChainRatio > 0.25) {
                b.eabAdvice.push_back(
                    "EAB watch: the OCC bits are " + std::to_string(pct) + "% of a chain. Under "
                    "25% they sit comfortably in one compressed chain; approaching 75% the "
                    "encoding cost climbs and an uncompressed OCC chain becomes the safer cut. "
                    "Lengthening the chains lowers this ratio.");
            } else {
                b.eabAdvice.push_back(
                    "OCC bits are " + std::to_string(pct) + "% of a chain — under the 25% the "
                    "manual calls comfortable for a single compressed chain. Keeping them in "
                    "their own family is what stops them aligning on one shift cycle.");
            }
        }
        if (b.cellsOcc == 0 && r.occBits > 0 && !b.external) {
            // The families exist but this controller did not take them: the OCC bits are then
            // stitched among ordinary chains, which is the aligned-bit case the manual warns about.
            b.eabAdvice.push_back(
                "EAB risk: this controller excludes OCC_CHAIN while the design has " +
                std::to_string(r.occBits) + " OCC bits. Left among the ordinary chains they align "
                "on the same shift cycle and cluster. Include OCC_CHAIN here, or give the OCC "
                "bits a controller of their own.");
        }
        // Encoding capacity: one variable is one bit shifted into the decompressor, so a pattern
        // supplies about channels x chain-length of them. The manual puts the practical wall at
        // ~90% specified; forced bits alone eating a large share is already a warning.
        if (b.channels > 0 && b.achievedLength > 0) {
            const long long variables =
                static_cast<long long>(b.channels) * b.achievedLength;
            const long long forced = b.cellsOcc + b.cellsHyper;
            if (variables > 0 && forced * 100 / variables >= 50)
                b.eabAdvice.push_back(
                    "EAB risk: control cells (OCC + hyper = " + std::to_string(forced) +
                    ") are " + std::to_string(forced * 100 / variables) +
                    "% of the ~" + std::to_string(variables) +
                    " variables a pattern can supply to this controller. Past ~90% specified a "
                    "cube is essentially uncompressible; add channels or lengthen the chains.");
        }

        r.edts.push_back(std::move(b));
    }

    r.coreMemoryBits = memInside(core);
    const long long assignable = r.coreRegisterBits - r.occBits - r.hyperBits - r.nonscanBits;
    long long assignedCore = 0;
    for (const EdtBudget& b : r.edts)
        if (!b.external) assignedCore += b.cellsCore;
    r.unassignedBits = assignable - assignedCore;
    if (r.unassignedBits > 0)
        r.notes.push_back(std::to_string(r.unassignedBits) +
                          " scan flop bits are not assigned to any EDT");
    if (opt.nonscanInstances.empty())
        r.notes.push_back("no add_nonscan_instances rules given — lockups and channel pipelines "
                          "are still counted, so real chains will be slightly shorter");
    else
        r.notes.push_back(std::to_string(r.nonscanBits) +
                          " non-scan flop bits deducted by the add_nonscan_instances rules");
    if (r.coreMemoryBits > 0)
        r.notes.push_back(std::to_string(r.coreMemoryBits) +
                          " memory bits are excluded (unpacked arrays are not scan cells)");

    // ---- 6. emit both artefacts from the one model -------------------------------------------
    std::string spec;
    spec += ind(1) + "EDT {\n";
    spec += ind(2) + pad("ijtag_host_interface", 30) + ": Sib(edt);\n";
    for (std::size_t i = 0; i < r.edts.size(); ++i) spec += emitController(r.edts[i], opt.edts[i]);
    spec += ind(1) + "}\n";
    if (!opt.designName.empty())
        spec = "DftSpecification(" + opt.designName + "," + opt.specScope + ") {\n" + spec + "}\n";
    r.edtSpec = spec;
    r.scanTcl = emitScanTcl(opt, r);

    r.analysisMs =
        std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();

    if (opt.log) {
        say("");
        for (const EdtBudget& b : r.edts) {
            say(b.name + std::string(b.external ? "  [external]" : "  [internal]"));
            say("    cells        core " + std::to_string(b.cellsCore) + "  occ " +
                std::to_string(b.cellsOcc) + "  hyper " + std::to_string(b.cellsHyper) +
                "  wrapper " + std::to_string(b.cellsWrapper) + "  = " + std::to_string(b.cells()));
            say("    chains       " + std::to_string(b.chainCount) + " x " +
                std::to_string(b.achievedLength) + " cells  (range " +
                std::to_string(b.longestMin) + "-" + std::to_string(b.longestMax) + ")");
            say("    channels     " + std::to_string(b.channels) + "  (compression " +
                std::to_string(static_cast<int>(b.compression)) + "x)");
            for (const std::string& w : b.warnings) say("    WARN         " + w);
            for (const std::string& a : b.eabAdvice) say("    EAB          " + a);
        }
        say("");
        for (const std::string& e : r.errors) say("ERROR  " + e);
        for (const std::string& n : r.notes) say("note   " + n);
        say("budget: " + std::to_string(static_cast<long long>(r.analysisMs)) + " ms");
    }
    return r;
}

}  // namespace hdl::service
