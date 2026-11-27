#pragma once
#include <string>
#include "model.h"
namespace ctrlgen {
// Tessent stitch tcl: header + sorted delete block + sorted add block (docs/specs §1.2/§4.3).
std::string generateStitchTcl(const CtrlIpSpec& spec);
}  // namespace ctrlgen
