#pragma once
#include <string>

#include "model.h"

namespace ctrlgen {

// Parse + validate + normalize (stitch/muxName -> per-bit). Throws std::runtime_error
// with a one-line reason on any spec violation (docs/specs §4.4).
CtrlIpSpec parseSpec(const std::string& jsonText);

}  // namespace ctrlgen
