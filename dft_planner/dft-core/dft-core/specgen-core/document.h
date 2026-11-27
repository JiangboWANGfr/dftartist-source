#pragma once
#include <string>

#include "model.h"

namespace specgen {

// Parse a GenConnDocument JSON, pick the def whose id == ui.rootDefId (fallback:
// first def), and read its SpecGen scope (interfaces / dftIps / dftWires).
SpecgenScope parseScope(const std::string& jsonText);

}  // namespace specgen
