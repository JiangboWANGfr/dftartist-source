#pragma once
#include "MemoryTestTiming.h"
#include <filesystem>
#include <string_view>
namespace dft::memory {
// Copies the borrowed investigation/profiles and config into one fully validated
// owning request. Does not open a design or enable a stage; caller selects the API.
hier::Result<MemoryTestTimingRequest> parseMemoryTestConfig(std::string_view,const MemoryInvestigationRequest &,const std::vector<MemoryTestProfile> &,hier::Cancel = {});
hier::Result<MemoryTestTimingRequest> loadMemoryTestConfig(const std::filesystem::path &,const MemoryInvestigationRequest &,const std::vector<MemoryTestProfile> &,hier::Cancel = {});
}
