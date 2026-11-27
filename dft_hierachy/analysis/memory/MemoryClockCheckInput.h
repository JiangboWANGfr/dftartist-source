#pragma once
#include "MemoryClockCheck.h"
#include <filesystem>
#include <string_view>
namespace dft::memory {
hier::Result<std::vector<MemoryClockExpectation>> parseMemoryClockExpectations(std::string_view,hier::Cancel = {});
hier::Result<std::vector<MemoryClockExpectation>> loadMemoryClockExpectations(const std::filesystem::path &,hier::Cancel = {});
}
