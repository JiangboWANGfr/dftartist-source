#pragma once
#include <string>

#include "model.h"

namespace genconn {

// Slang-anchored DFT injection: parses the netlist with slang's concrete syntax tree, finds
// anchors (module port list, each instance's connection list) by source offset, and splices.
// Handles all valid Verilog (ANSI/non-ANSI headers, named/positional/wildcard connections,
// instance arrays, escaped identifiers, attributes, strings) — unlike the regex injector.
// Positional connections are converted to named using the instantiated module's port order.
std::string injectDftSlang(const std::string& vText, const HardenLibrary& lib,
                           const std::string& parentDefId);

// Parse vText with slang and return the number of parse errors (0 = valid). For verifying output.
int parseErrorCount(const std::string& vText);

}  // namespace genconn
