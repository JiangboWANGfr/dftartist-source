#pragma once
#include "MemoryTestSchedule.h"
#include <filesystem>
#include <string_view>
namespace dft::memory {
// Strict, owned input; same 1 MiB regular-file and cancellation rules as test configs.
hier::Result<std::vector<MemoryScheduleResource>> parseMemoryScheduleResources(std::string_view,hier::Cancel = {});
hier::Result<std::vector<MemoryScheduleResource>> loadMemoryScheduleResources(const std::filesystem::path &,hier::Cancel = {});
}
