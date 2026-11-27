#pragma once
#include <string>
#include "model.h"
namespace ctrlgen {
// RTL: control -> <pin> = AND2(<pin>_tdr, dfx_mode); observe -> <pin>_tdr = AND2(<pin>, dfx_mode).
// Byte-format tracks dfx_ip_gen.pl + the frozen EMA golden (docs/specs §1.1).
std::string generateVerilog(const CtrlIpSpec& spec);
}  // namespace ctrlgen
