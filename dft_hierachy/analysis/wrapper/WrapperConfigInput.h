#pragma once
#include "ChainPlan.h"
#include <filesystem>
#include <variant>
namespace dft::wrapper {
// Owns one of the existing requests. No Design is opened and no input is borrowed.
using WrapperConfig = std::variant<BoundaryRequest,CellPlanRequest,ChainPlanRequest>;
hier::Result<WrapperConfig> parseWrapperConfig(std::string_view,hier::Cancel = {});
// Bounded regular local file only; no includes, environment expansion or RTL paths.
hier::Result<WrapperConfig> loadWrapperConfig(const std::filesystem::path &,hier::Cancel = {});
}
