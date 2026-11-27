#pragma once
#include "MemoryTestRules.h"
#include <filesystem>
namespace dft::memory {
// Owned explicit rules; bounded regular-file input follows MemoryLibraryInput.
hier::Result<std::vector<MemoryTestRule>> parseMemoryTestRules(std::string_view,hier::Cancel = {});
hier::Result<std::vector<MemoryTestRule>> loadMemoryTestRules(const std::filesystem::path &,hier::Cancel = {});
}
