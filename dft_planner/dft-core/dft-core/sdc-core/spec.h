// The SDC command dictionary: what each command accepts, and in whose dialect.
//
// This table IS the checker's knowledge. It is deliberately data, not code, so that adding a
// command or a vendor option is a one-line edit and never a change to the lint engine.
#pragma once
#include <string>
#include <vector>

#include "model.h"

namespace sdc {

/// Value grammar for one argument. `Flag` means the option takes no value at all — getting that
/// wrong is the difference between `-add` swallowing the next word and reporting a real error.
enum class ArgType {
    Flag,        ///< no value follows
    Str,         ///< any word
    Float,       ///< any real number
    PosFloat,    ///< > 0   (clock periods, transitions)
    NonNegFloat, ///< >= 0  (uncertainties, loads)
    Int,         ///< any integer
    PosInt,      ///< > 0   (-divide_by, path multipliers)
    FloatList,   ///< list of reals (-waveform, -edge_shift)
    IntList,     ///< list of integers (-edges)
    Objects,     ///< a design-object collection or a name list
    ClockRef,    ///< a clock collection or clock name
    Enum,        ///< one of `values` (space-separated)
    None,        ///< no positional of this kind
};

struct OptionSpec {
    std::string name;       ///< "-period"
    ArgType type = ArgType::Flag;
    unsigned dialects = kAll;
    bool required = false;
    std::string mutexGroup; ///< options sharing a group may not co-occur ("" = unconstrained)
    std::string requiresOpt;///< this option is only legal alongside that one ("" = unconstrained)
    std::string values;     ///< Enum only: space-separated legal values
};

struct CommandSpec {
    std::string name;
    unsigned dialects = kAll;
    /// Positionals that must appear in order before the free-form list, e.g. set_input_delay's
    /// delay value, or set_case_analysis's 0/1.
    std::vector<ArgType> leading;
    std::string leadingValues;      ///< Enum values for a leading Enum positional
    ArgType trailing = ArgType::None;  ///< the repeated object list, when the command takes one
    bool trailingRequired = false;
    /// At least one option from this group must be present (e.g. set_clock_groups needs exactly
    /// one exclusivity kind). Empty = no such rule.
    std::string requireOneOf;
    std::vector<OptionSpec> options;
    std::string note;               ///< shown as the hint on a dialect finding
};

/// The whole dictionary, built once. Lookup is by exact command name.
const std::vector<CommandSpec>& commandSpecs();
const CommandSpec* findCommand(const std::string& name);

/// Commands that are Tcl-level or tool-setup rather than constraints — the linter registers them
/// so a file that uses them still runs, but they carry no constraint meaning.
bool isPassthroughCommand(const std::string& name);

const char* argTypeName(ArgType t);
std::string dialectNames(unsigned mask);

}  // namespace sdc
