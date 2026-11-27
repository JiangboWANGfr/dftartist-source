#include "spec.h"

#include <algorithm>
#include <unordered_map>
#include <unordered_set>

namespace sdc {
namespace {

// ---- tiny builders, so the table below reads like a reference manual ------------------------

OptionSpec F(const char* n, unsigned d = kAll, const char* mutexGroup = "",
             const char* requiresOpt = "") {
    OptionSpec o;
    o.name = n;
    o.type = ArgType::Flag;
    o.dialects = d;
    o.mutexGroup = mutexGroup;
    o.requiresOpt = requiresOpt;
    return o;
}

OptionSpec V(const char* n, ArgType t, unsigned d = kAll, bool required = false,
             const char* mutexGroup = "", const char* values = "") {
    OptionSpec o;
    o.name = n;
    o.type = t;
    o.dialects = d;
    o.required = required;
    o.mutexGroup = mutexGroup;
    o.values = values;
    return o;
}

/// -from/-to/-through and their rise/fall variants: identical on every timing exception, and
/// getting one of them subtly wrong (`-rise_form`) is the single most common SDC typo.
void addExceptionPathOptions(std::vector<OptionSpec>& v) {
    for (const char* n : {"-from", "-to", "-through", "-rise_from", "-fall_from", "-rise_to",
                          "-fall_to", "-rise_through", "-fall_through"})
        v.push_back(V(n, ArgType::Objects));
}

/// -rise/-fall/-setup/-hold: the delay-sense selectors.
void addSenseOptions(std::vector<OptionSpec>& v, bool riseFall, bool setupHold) {
    if (riseFall) {
        v.push_back(F("-rise", kAll, "rise_fall"));
        v.push_back(F("-fall", kAll, "rise_fall"));
    }
    if (setupHold) {
        v.push_back(F("-setup", kAll, "setup_hold"));
        v.push_back(F("-hold", kAll, "setup_hold"));
    }
}

void addMinMax(std::vector<OptionSpec>& v) {
    v.push_back(F("-min", kAll, "min_max"));
    v.push_back(F("-max", kAll, "min_max"));
}

/// SDC 2.1 gave every constraint a -comment; older DC/Genus releases accept it too.
void addComment(std::vector<OptionSpec>& v) { v.push_back(V("-comment", ArgType::Str)); }

/// Object-query commands (get_ports/get_pins/...) share one option set.
std::vector<OptionSpec> objectQueryOptions(bool hierarchical, bool ofObjects) {
    std::vector<OptionSpec> v{
        F("-regexp"), F("-nocase"), F("-quiet"),
        V("-filter", ArgType::Str),
    };
    if (hierarchical) v.push_back(F("-hierarchical"));
    if (ofObjects) v.push_back(V("-of_objects", ArgType::Objects));
    return v;
}

CommandSpec C(const char* name, unsigned d, std::vector<ArgType> leading, ArgType trailing,
              bool trailingRequired, std::vector<OptionSpec> options) {
    CommandSpec c;
    c.name = name;
    c.dialects = d;
    c.leading = std::move(leading);
    c.trailing = trailing;
    c.trailingRequired = trailingRequired;
    c.options = std::move(options);
    return c;
}

// ---- the dictionary --------------------------------------------------------------------------

std::vector<CommandSpec> buildSpecs() {
    std::vector<CommandSpec> S;
    auto add = [&S](CommandSpec c) { S.push_back(std::move(c)); };

    // ===== clock definition ====================================================================
    {
        std::vector<OptionSpec> o{
            V("-period", ArgType::PosFloat, kAll, /*required*/ true),
            V("-name", ArgType::Str),
            V("-waveform", ArgType::FloatList),
            F("-add"),
        };
        addComment(o);
        // No source objects => virtual clock; that is legal, so `trailing` is optional here and
        // the "virtual clock without -name" case is caught as a semantic check instead.
        add(C("create_clock", kAll, {}, ArgType::Objects, false, o));
    }
    {
        std::vector<OptionSpec> o{
            V("-name", ArgType::Str),
            V("-source", ArgType::Objects, kAll, /*required*/ true),
            V("-edges", ArgType::IntList, kAll, false, "gen_ratio"),
            V("-divide_by", ArgType::PosInt, kAll, false, "gen_ratio"),
            V("-multiply_by", ArgType::PosInt, kAll, false, "gen_ratio"),
            V("-duty_cycle", ArgType::Float),
            V("-edge_shift", ArgType::FloatList),
            V("-master_clock", ArgType::ClockRef),
            F("-invert"),
            F("-add"),
            F("-combinational"),
        };
        addComment(o);
        add(C("create_generated_clock", kAll, {}, ArgType::Objects, true, o));
    }
    {
        std::vector<OptionSpec> o{
            V("-name", ArgType::Str),
            F("-physically_exclusive", kAll, "clock_group_kind"),
            F("-logically_exclusive", kAll, "clock_group_kind"),
            F("-asynchronous", kAll, "clock_group_kind"),
            F("-allow_paths", kDcPt | kGenus, "", "-asynchronous"),
            V("-group", ArgType::Objects, kAll, /*required*/ true),
            F("-weak", kGenus),
        };
        addComment(o);
        CommandSpec c = C("set_clock_groups", kAll, {}, ArgType::None, false, o);
        c.requireOneOf = "clock_group_kind";
        add(std::move(c));
    }
    add(C("set_propagated_clock", kAll, {}, ArgType::Objects, true, {}));
    {
        std::vector<OptionSpec> o{V("-clock", ArgType::ClockRef), F("-source"), F("-late"),
                                  F("-early"), F("-dynamic", kDcPt)};
        addSenseOptions(o, true, false);
        addMinMax(o);
        add(C("set_clock_latency", kAll, {ArgType::Float}, ArgType::Objects, true, o));
    }
    {
        std::vector<OptionSpec> o;
        addSenseOptions(o, true, false);
        addMinMax(o);
        add(C("set_clock_transition", kAll, {ArgType::NonNegFloat}, ArgType::ClockRef, true, o));
    }
    {
        std::vector<OptionSpec> o{
            V("-from", ArgType::ClockRef, kAll, false, "unc_endpoint"),
            V("-to", ArgType::ClockRef, kAll, false, "unc_endpoint"),
            V("-rise_from", ArgType::ClockRef, kAll, false, "unc_endpoint"),
            V("-fall_from", ArgType::ClockRef, kAll, false, "unc_endpoint"),
            V("-rise_to", ArgType::ClockRef),
            V("-fall_to", ArgType::ClockRef),
        };
        addSenseOptions(o, true, true);
        add(C("set_clock_uncertainty", kAll, {ArgType::NonNegFloat}, ArgType::Objects, false, o));
    }
    {
        // Careful: unlike every other constraint, -setup/-hold here take a VALUE
        // (`set_clock_gating_check -setup 1 -hold 0.3 $clks`) and may legally appear together.
        std::vector<OptionSpec> o{F("-high", kAll, "gating_level"), F("-low", kAll, "gating_level"),
                                  V("-setup", ArgType::NonNegFloat),
                                  V("-hold", ArgType::NonNegFloat)};
        addSenseOptions(o, true, false);
        add(C("set_clock_gating_check", kAll, {}, ArgType::Objects, false, o));
    }
    {
        // SDC 2.1 spelling; PrimeTime replaced it with set_sense but still accepts this.
        std::vector<OptionSpec> o{
            F("-positive", kAll, "clock_sense"), F("-negative", kAll, "clock_sense"),
            F("-stop_propagation", kAll, "clock_sense"),
            V("-pulse", ArgType::Str, kAll, false, "clock_sense"),
            V("-clocks", ArgType::ClockRef, kAll, false, "", ""),
        };
        add(C("set_clock_sense", kAll, {}, ArgType::Objects, true, o));
    }
    {
        std::vector<OptionSpec> o{
            V("-type", ArgType::Enum, kDcPt, false, "", "clock data setup hold min_pulse_width"),
            F("-positive", kDcPt, "clock_sense"), F("-negative", kDcPt, "clock_sense"),
            F("-stop_propagation", kDcPt, "clock_sense"),
            V("-pulse", ArgType::Str, kDcPt), V("-clocks", ArgType::ClockRef, kDcPt),
            F("-clock_leaf", kDcPt),
        };
        add(C("set_sense", kDcPt, {}, ArgType::Objects, true, o));
    }

    // ===== I/O timing ==========================================================================
    for (const char* nm : {"set_input_delay", "set_output_delay"}) {
        std::vector<OptionSpec> o{
            V("-clock", ArgType::ClockRef),
            F("-clock_fall"),
            F("-level_sensitive"),
            F("-add_delay"),
            F("-network_latency_included", kDcPt),
            F("-source_latency_included", kDcPt),
            V("-reference_pin", ArgType::Objects, kDcPt),
        };
        addSenseOptions(o, true, false);
        addMinMax(o);
        addComment(o);
        add(C(nm, kAll, {ArgType::Float}, ArgType::Objects, true, o));
    }

    // ===== timing exceptions ===================================================================
    {
        std::vector<OptionSpec> o;
        addExceptionPathOptions(o);
        addSenseOptions(o, true, true);
        o.push_back(F("-reset_path", kDcPt));
        addComment(o);
        add(C("set_false_path", kAll, {}, ArgType::None, false, o));
    }
    {
        std::vector<OptionSpec> o;
        addExceptionPathOptions(o);
        addSenseOptions(o, true, true);
        o.push_back(F("-start", kAll, "mcp_ref"));
        o.push_back(F("-end", kAll, "mcp_ref"));
        o.push_back(F("-reset_path", kDcPt));
        addComment(o);
        add(C("set_multicycle_path", kAll, {ArgType::PosInt}, ArgType::None, false, o));
    }
    for (const char* nm : {"set_max_delay", "set_min_delay"}) {
        std::vector<OptionSpec> o;
        addExceptionPathOptions(o);
        addSenseOptions(o, true, false);
        o.push_back(F("-ignore_clock_latency"));
        o.push_back(F("-reset_path", kDcPt));
        addComment(o);
        add(C(nm, kAll, {ArgType::Float}, ArgType::None, false, o));
    }
    {
        std::vector<OptionSpec> o{V("-name", ArgType::Str), V("-weight", ArgType::Float),
                                  V("-critical_range", ArgType::Float), F("-default")};
        addExceptionPathOptions(o);
        addComment(o);
        add(C("group_path", kAll, {}, ArgType::None, false, o));
    }
    {
        std::vector<OptionSpec> o{V("-from", ArgType::Objects), V("-to", ArgType::Objects),
                                  V("-rise_from", ArgType::Objects), V("-fall_from", ArgType::Objects),
                                  V("-rise_to", ArgType::Objects), V("-fall_to", ArgType::Objects),
                                  V("-clock", ArgType::ClockRef)};
        addSenseOptions(o, false, true);
        add(C("set_data_check", kAll, {ArgType::Float}, ArgType::None, false, o));
    }
    add(C("set_max_time_borrow", kAll, {ArgType::NonNegFloat}, ArgType::Objects, true, {}));
    {
        std::vector<OptionSpec> o{F("-high", kDcPt | kGenus, "mpw_level"),
                                  F("-low", kDcPt | kGenus, "mpw_level")};
        add(C("set_min_pulse_width", kDcPt | kGenus, {ArgType::NonNegFloat}, ArgType::Objects, false, o));
    }
    add(C("set_disable_timing", kAll, {},  ArgType::Objects, true,
          {V("-from", ArgType::Str), V("-to", ArgType::Str)}));
    add(C("set_disable_clock_gating_check", kDcPt | kGenus, {}, ArgType::Objects, true, {}));

    // ===== environment / design rules ==========================================================
    add(C("set_case_analysis", kAll, {ArgType::Enum}, ArgType::Objects, true, {}));
    S.back().leadingValues = "0 1 zero one rising falling";

    for (const char* nm : {"set_logic_zero", "set_logic_one", "set_logic_dc"})
        add(C(nm, kAll, {}, ArgType::Objects, true, {}));

    {
        std::vector<OptionSpec> o{F("-subtract_pin_load"), F("-pin_load"), F("-wire_load")};
        addMinMax(o);
        add(C("set_load", kAll, {ArgType::NonNegFloat}, ArgType::Objects, true, o));
    }
    {
        std::vector<OptionSpec> o;
        addSenseOptions(o, true, false);
        addMinMax(o);
        add(C("set_drive", kAll, {ArgType::NonNegFloat}, ArgType::Objects, true, o));
    }
    {
        std::vector<OptionSpec> o{
            V("-lib_cell", ArgType::Str, kAll, /*required*/ true),
            V("-library", ArgType::Str), V("-pin", ArgType::Str), V("-from_pin", ArgType::Str),
            V("-input_transition_rise", ArgType::NonNegFloat),
            V("-input_transition_fall", ArgType::NonNegFloat),
            V("-multiply_by", ArgType::PosFloat, kDcPt),
            V("-clock", ArgType::ClockRef), F("-clock_fall"),
            F("-dont_scale", kDcPt), F("-no_design_rule", kDcPt),
        };
        addSenseOptions(o, true, false);
        addMinMax(o);
        add(C("set_driving_cell", kAll, {}, ArgType::Objects, true, o));
    }
    {
        std::vector<OptionSpec> o{V("-clock", ArgType::ClockRef), F("-clock_fall")};
        addSenseOptions(o, true, false);
        addMinMax(o);
        add(C("set_input_transition", kAll, {ArgType::NonNegFloat}, ArgType::Objects, true, o));
    }
    add(C("set_fanout_load", kAll, {ArgType::NonNegFloat}, ArgType::Objects, true, {}));
    add(C("set_port_fanout_number", kAll, {ArgType::Int}, ArgType::Objects, true, {}));
    {
        std::vector<OptionSpec> o;
        addMinMax(o);
        add(C("set_resistance", kAll, {ArgType::NonNegFloat}, ArgType::Objects, true, o));
    }
    for (const char* nm : {"set_max_capacitance", "set_min_capacitance", "set_max_fanout"})
        add(C(nm, kAll, {ArgType::NonNegFloat}, ArgType::Objects, true, {}));
    {
        std::vector<OptionSpec> o{F("-clock_path", kDcPt | kGenus, "mt_path"),
                                  F("-data_path", kDcPt | kGenus, "mt_path")};
        addSenseOptions(o, true, false);
        add(C("set_max_transition", kAll, {ArgType::PosFloat}, ArgType::Objects, true, o));
    }
    add(C("set_max_area", kAll, {ArgType::NonNegFloat}, ArgType::None, false, {}));
    {
        std::vector<OptionSpec> o{
            V("-library", ArgType::Str),
            V("-analysis_type", ArgType::Enum, kAll, false, "", "single bc_wc on_chip_variation"),
            V("-max", ArgType::Str, kAll, false, ""), V("-min", ArgType::Str),
            V("-max_library", ArgType::Str), V("-min_library", ArgType::Str),
            V("-object_list", ArgType::Objects),
        };
        add(C("set_operating_conditions", kAll, {}, ArgType::None, false, o));
    }
    {
        std::vector<OptionSpec> o{
            F("-cell_delay", kAll, ""), F("-cell_check"), F("-net_delay"),
            F("-data", kAll, "derate_domain"), F("-clock", kAll, "derate_domain"),
            F("-early", kAll, "derate_when"), F("-late", kAll, "derate_when"),
            F("-static", kAll, "derate_kind"), F("-dynamic", kAll, "derate_kind"),
            F("-increment"),
        };
        addSenseOptions(o, true, false);
        add(C("set_timing_derate", kAll, {ArgType::Float}, ArgType::Objects, false, o));
    }
    {
        std::vector<OptionSpec> o{V("-name", ArgType::Str, kAll, true), V("-library", ArgType::Str)};
        addMinMax(o);
        add(C("set_wire_load_model", kAll, {}, ArgType::Objects, false, o));
    }
    add(C("set_wire_load_mode", kAll, {ArgType::Enum}, ArgType::None, false, {}));
    S.back().leadingValues = "top enclosed segmented";
    {
        std::vector<OptionSpec> o{V("-library", ArgType::Str)};
        addMinMax(o);
        add(C("set_wire_load_selection_group", kAll, {ArgType::Str}, ArgType::Objects, false, o));
    }
    add(C("set_wire_load_min_block_size", kAll, {ArgType::NonNegFloat}, ArgType::None, false, {}));
    {
        std::vector<OptionSpec> o{F("-no_propagate")};
        add(C("set_ideal_network", kAll, {}, ArgType::Objects, true, o));
    }
    for (const char* nm : {"set_ideal_latency", "set_ideal_transition"}) {
        std::vector<OptionSpec> o;
        addSenseOptions(o, true, false);
        addMinMax(o);
        add(C(nm, kAll, {ArgType::Float}, ArgType::Objects, true, o));
    }
    {
        std::vector<OptionSpec> o{
            V("-capacitance", ArgType::Str), V("-resistance", ArgType::Str),
            V("-time", ArgType::Str),        V("-voltage", ArgType::Str),
            V("-current", ArgType::Str),     V("-power", ArgType::Str),
        };
        add(C("set_units", kAll, {}, ArgType::None, false, o));
    }
    add(C("set_hierarchy_separator", kAll, {ArgType::Str}, ArgType::None, false, {}));

    // ===== multi-voltage =======================================================================
    {
        std::vector<OptionSpec> o{V("-min", ArgType::Float), V("-object_list", ArgType::Objects)};
        add(C("set_voltage", kAll, {ArgType::Float}, ArgType::None, false, o));
    }
    {
        std::vector<OptionSpec> o{V("-name", ArgType::Str), V("-coordinate", ArgType::FloatList),
                                  V("-guard_band_x", ArgType::FloatList),
                                  V("-guard_band_y", ArgType::FloatList)};
        add(C("create_voltage_area", kAll, {}, ArgType::Objects, true, o));
    }
    add(C("set_level_shifter_strategy", kAll, {}, ArgType::None, false,
          {V("-rule", ArgType::Enum, kAll, false, "", "all low_to_high high_to_low")}));
    add(C("set_level_shifter_threshold", kAll, {}, ArgType::None, false,
          {V("-voltage", ArgType::Float), V("-percent", ArgType::Float)}));
    for (const char* nm : {"set_max_dynamic_power", "set_max_leakage_power"})
        add(C(nm, kAll, {ArgType::NonNegFloat}, ArgType::Str, false, {}));

    // ===== object access =======================================================================
    for (const char* nm : {"get_ports", "get_port"})
        add(C(nm, kAll, {}, ArgType::Str, false, objectQueryOptions(false, true)));
    for (const char* nm : {"get_pins", "get_pin", "get_nets", "get_net", "get_cells", "get_cell"})
        add(C(nm, kAll, {}, ArgType::Str, false, objectQueryOptions(true, true)));
    add(C("get_clocks", kAll, {}, ArgType::Str, false, objectQueryOptions(false, false)));
    add(C("get_generated_clocks", kDcPt | kGenus, {}, ArgType::Str, false,
          objectQueryOptions(false, false)));
    add(C("get_designs", kDcPt | kGenus, {}, ArgType::Str, false, objectQueryOptions(false, false)));
    // Attribute read-back. We have no attribute model, so the linter checks its shape and hands
    // back an empty value — see lint.cpp for why that is the safe answer rather than a guess.
    add(C("get_attribute", kDcPt | kGenus, {ArgType::Objects, ArgType::Str}, ArgType::None, false,
          {F("-quiet"), F("-class")}));
    for (const char* nm : {"all_fanin", "all_fanout"})
        add(C(nm, kDcPt | kGenus, {}, ArgType::None, false,
              {V("-to", ArgType::Objects), V("-from", ArgType::Objects), F("-flat"),
               F("-only_cells"), F("-startpoints_only"), F("-endpoints_only"),
               F("-break_on_clear"), V("-levels", ArgType::Int), F("-trace_arcs")}));
    add(C("all_connected", kDcPt | kGenus, {ArgType::Objects}, ArgType::None, false, {F("-leaf")}));
    for (const char* nm : {"get_lib_cells", "get_lib_pins", "get_libs"})
        add(C(nm, kAll, {}, ArgType::Str, false, objectQueryOptions(false, true)));
    {
        std::vector<OptionSpec> o{F("-level_sensitive"), F("-edge_triggered"),
                                  V("-clock", ArgType::ClockRef)};
        add(C("all_inputs", kAll, {}, ArgType::None, false, o));
        add(C("all_outputs", kAll, {}, ArgType::None, false, o));
    }
    add(C("all_clocks", kAll, {}, ArgType::None, false, {}));
    {
        std::vector<OptionSpec> o{
            V("-clock", ArgType::ClockRef), V("-rise_clock", ArgType::ClockRef),
            V("-fall_clock", ArgType::ClockRef), F("-cells"), F("-data_pins"), F("-clock_pins"),
            F("-slave_clock_pins"), F("-async_pins"), F("-output_pins"), F("-level_sensitive"),
            F("-edge_triggered"), F("-no_hierarchy", kDcPt),
        };
        add(C("all_registers", kAll, {}, ArgType::None, false, o));
    }
    add(C("current_design", kAll, {}, ArgType::Str, false, {}));
    add(C("current_instance", kAll, {}, ArgType::Str, false, {}));

    // ===== collection manipulation ==============================================================
    // Not in the SDC standard, but Synopsys invented them and Cadence implemented them, so real
    // constraint files are full of `if {[sizeof_collection ...]}` and foreach_in_collection.
    // These are CONTROL FLOW: the linter has to execute them or everything inside their bodies
    // goes unchecked. Their behaviour lives in lint.cpp; the entries here give them arity and
    // dialect checking like any other command.
    const unsigned kCollections = kDcPt | kGenus;
    add(C("sizeof_collection", kCollections, {ArgType::Objects}, ArgType::None, false, {}));
    add(C("get_object_name", kCollections, {ArgType::Objects}, ArgType::None, false, {}));
    add(C("collection_to_list", kCollections, {ArgType::Objects}, ArgType::None, false,
          {V("-name_only", ArgType::Flag)}));
    add(C("copy_collection", kCollections, {ArgType::Objects}, ArgType::None, false, {}));
    add(C("index_collection", kCollections, {ArgType::Objects, ArgType::Int}, ArgType::None, false, {}));
    add(C("add_to_collection", kCollections, {ArgType::Objects}, ArgType::Objects, false,
          {F("-unique")}));
    // Note the asymmetry with add_to_collection: this one takes a VARIABLE NAME and appends in
    // place (like lappend), so its first argument is a name, not a collection.
    add(C("append_to_collection", kCollections, {ArgType::Str, ArgType::Objects}, ArgType::None,
          false, {F("-unique")}));
    add(C("remove_from_collection", kCollections, {ArgType::Objects, ArgType::Objects},
          ArgType::None, false, {F("-intersect")}));
    add(C("filter_collection", kCollections, {ArgType::Objects, ArgType::Str}, ArgType::None, false,
          {F("-regexp"), F("-nocase")}));
    add(C("sort_collection", kCollections, {ArgType::Objects, ArgType::Str}, ArgType::None, false,
          {F("-dictionary")}));
    add(C("compare_collections", kCollections, {ArgType::Objects, ArgType::Objects}, ArgType::None,
          false, {F("-order_dependent")}));
    add(C("query_objects", kCollections, {ArgType::Objects}, ArgType::None, false,
          {V("-truncate", ArgType::Int), F("-verbose")}));
    // var / collection / body — a loop, so its body must actually be evaluated.
    add(C("foreach_in_collection", kCollections,
          {ArgType::Str, ArgType::Objects, ArgType::Str}, ArgType::None, false, {}));

    // ===== vendor commands that legitimately appear inside "SDC" files =========================
    // Not SDC-standard: reported as a portability warning when the Generic dialect is selected,
    // accepted silently when the owning vendor's dialect is.
    for (const char* nm : {"set_dont_touch", "set_dont_touch_network", "set_dont_use",
                           "set_size_only", "set_prefer", "set_boundary_optimization",
                           "set_optimize_registers", "set_ungroup", "set_scan_configuration",
                           "set_annotated_delay", "set_annotated_transition", "set_app_var"})
        add(C(nm, kDcPt, {}, ArgType::Str, false, {}));
    for (const char* nm : {"remove_clock", "remove_input_delay", "remove_output_delay",
                           "remove_case_analysis", "remove_clock_groups", "remove_propagated_clock"})
        add(C(nm, kDcPt, {}, ArgType::Objects, false, {F("-all")}));

    for (const char* nm : {"set_interactive_constraint_modes", "set_attribute", "set_dont_modify",
                           "set_wireload_mode", "define_clock", "external_delay",
                           "set_clock_gating_style", "set_top_module"})
        add(C(nm, kGenus, {}, ArgType::Str, false, {}));

    return S;
}

const std::unordered_set<std::string>& passthroughNames() {
    // Tcl/tool commands with no constraint meaning. Registering them keeps a real vendor script
    // from aborting halfway through, which would hide every constraint after the failure point.
    static const std::unordered_set<std::string> s{
        "sh", "exec", "redirect", "suppress_message", "echo", "date", "printvar",
        "read_sdc", "write_sdc", "check_timing", "report_timing", "report_clock",
        "update_timing", "link_design", "read_verilog", "read_db", "read_lib",
    };
    return s;
}

}  // namespace

const std::vector<CommandSpec>& commandSpecs() {
    static const std::vector<CommandSpec> s = buildSpecs();
    return s;
}

const CommandSpec* findCommand(const std::string& name) {
    static const std::unordered_map<std::string, const CommandSpec*> ix = [] {
        std::unordered_map<std::string, const CommandSpec*> m;
        for (const CommandSpec& c : commandSpecs()) m.emplace(c.name, &c);
        return m;
    }();
    auto it = ix.find(name);
    return it == ix.end() ? nullptr : it->second;
}

bool isPassthroughCommand(const std::string& name) {
    return passthroughNames().count(name) != 0;
}

const char* argTypeName(ArgType t) {
    switch (t) {
        case ArgType::Flag:        return "flag";
        case ArgType::Str:         return "string";
        case ArgType::Float:       return "a number";
        case ArgType::PosFloat:    return "a positive number";
        case ArgType::NonNegFloat: return "a non-negative number";
        case ArgType::Int:         return "an integer";
        case ArgType::PosInt:      return "a positive integer";
        case ArgType::FloatList:   return "a list of numbers";
        case ArgType::IntList:     return "a list of integers";
        case ArgType::Objects:     return "an object list";
        case ArgType::ClockRef:    return "a clock";
        case ArgType::Enum:        return "one of the allowed values";
        case ArgType::None:        return "nothing";
    }
    return "a value";
}

std::string dialectNames(unsigned mask) {
    std::string s;
    auto push = [&s](const char* n) {
        if (!s.empty()) s += "/";
        s += n;
    };
    if (mask & kGeneric) push("SDC standard");
    if (mask & kDcPt) push("Synopsys DC/PT");
    if (mask & kGenus) push("Cadence Genus");
    return s.empty() ? "no known dialect" : s;
}

}  // namespace sdc
