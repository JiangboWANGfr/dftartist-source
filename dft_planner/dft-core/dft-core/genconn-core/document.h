#pragma once
#include <string>

#include "model.h"

namespace genconn {

// Parse a GenConnDocument JSON (as produced by document.ts serialize) into the model.
GenConnDocument parseDocument(const std::string& jsonText);

}  // namespace genconn
