#pragma once
#include "MemoryTestSchedule.h"
#include <filesystem>
#include <string_view>
namespace dft::memory {
// Strict, owned input; same 1 MiB regular-file rules as test configurations.
hier::Result<std::vector<MemoryScheduleDependency>> parseMemoryScheduleDependencies(std::string_view,hier::Cancel = {});
hier::Result<std::vector<MemoryScheduleDependency>> loadMemoryScheduleDependencies(const std::filesystem::path &,hier::Cancel = {});
}
