#pragma once
// STAP(IEEE 1838) datapath 生成：命令式 stap_host_list。单链，无分支。
#include <string>

#include "model.h"

namespace specgen {

// scope -> "set spec [create_dft_specification -stap_host_list { ... }]\n"；无 JTAG1838 client 链 -> 空串。
std::string genJtag1838Spec(const SpecgenScope& scope);

}  // namespace specgen
