#pragma once
#include <string>

#include "model.h"

namespace genconn {

// Does this level's .v need DFT injection (has connection nets or ported ports)?
bool defNeedsDft(const HardenDef& root, const HardenLibrary& lib);

// Inject DFT wiring + interface-lifting into a regular Verilog netlist (C++ port of vinject.ts).
// parentDefId = the def whose .v is vText. Throws on irregular netlist / ANSI header / name clash.
std::string injectDft(const std::string& vText, const HardenLibrary& lib,
                      const std::string& parentDefId);

}  // namespace genconn
