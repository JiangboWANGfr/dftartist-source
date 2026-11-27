#pragma once
#include <string>
#include "model.h"
namespace ctrlgen {
// ICL: control -> DataInPort <pin>_tdr {DefaultLoadValue 1'b0|0;}; observe -> DataOutPort {}.
std::string generateIcl(const CtrlIpSpec& spec);
}  // namespace ctrlgen
