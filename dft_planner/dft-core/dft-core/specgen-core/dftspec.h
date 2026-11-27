#pragma once
#include <string>

#include "model.h"

namespace specgen {

// scope -> full DftSpecification text. Real impl lands in a later task; for now a
// shell (empty) so the CLI + differential scaffold compile and run.
std::string genDftSpec(const SpecgenScope& scope);

}  // namespace specgen
