// SDC syntax + semantic checker.
//
// Built on a REAL embedded Tcl interpreter rather than a regex pass, because SDC is Tcl: any
// checker that does not substitute variables, evaluate [expr]/[get_ports ...] and follow
// foreach/if will either miss real errors or invent fake ones on every serious constraint file.
//
// What the interpreter gives us for free: L1 syntax errors with exact line numbers, variable and
// command substitution, `source`. What this file adds on top: a per-command option/type/dialect
// check (see spec.h), design-aware object resolution, and cross-command semantic checks.
#pragma once
#include <string>

#include "model.h"

namespace sdc {

struct LintOptions {
    unsigned dialects = kAll;   ///< command set to accept; anything outside it is reported
    bool designAware = true;    ///< resolve get_* patterns against the design (needs DesignObjects)
    bool followSource = true;   ///< recurse into `source`d files, keeping their own file/line
    int maxFindings = 2000;     ///< stop recording past this (a broken file can produce thousands)
};

/// False in a build compiled without Tcl — the report then carries a single explanatory finding
/// instead of pretending the file is clean.
bool lintAvailable();

LintReport lintFile(const std::string& path, const LintOptions& opt = {},
                    const DesignObjects& objs = {});

/// Lint SDC text. `displayPath` is what findings report as their file.
LintReport lintText(const std::string& text, const std::string& displayPath,
                    const LintOptions& opt = {}, const DesignObjects& objs = {});

}  // namespace sdc
