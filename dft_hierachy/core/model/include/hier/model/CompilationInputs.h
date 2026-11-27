#pragma once
#include "hier/model/Library.h"

namespace hier::model {

// Facts captured by the frontend at open. Source bytes are borrowed separately
// through sourceFiles(), from the same immutable frontend lifetime.
struct CompilationInputs {
    std::vector<std::string> arguments;
    std::vector<std::string> sourceOrder;
    std::vector<std::string> defines;
    std::vector<std::string> undefines;
    std::vector<std::string> explicitTops;
    std::string frontendIdentity;
    std::map<std::string, std::optional<CellInfo>> libraryCells;
    bool complete = false;
};

} // namespace hier::model
