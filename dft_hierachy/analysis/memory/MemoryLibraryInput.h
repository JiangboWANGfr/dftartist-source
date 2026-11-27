#pragma once
#include "MemoryTestPlan.h"
#include "PinLibrary.h"
#include <filesystem>
namespace dft::memory {
struct MemoryLibraryInput {
    std::vector<MemoryModel> models;
    std::vector<MemoryTestProfile> testProfiles;
    std::shared_ptr<const PinLibrary> library;
};
inline constexpr size_t memoryLibraryMaxBytes=1048576;
// Copies the bounded UTF8 JSON input and owns all parsed declarations. No RTL is
// opened and no live snapshot is changed. Decoding checks cancellation at its
// boundaries; typed construction and chunked file reads also check cancellation.
hier::Result<MemoryLibraryInput> parseMemoryLibrary(std::string_view,hier::Cancel = {});
// Regular files only (symlinks to regular files allowed), at most 1 MiB; no
// includes, environment expansion, implicit loading or filesystem transaction.
hier::Result<MemoryLibraryInput> loadMemoryLibrary(const std::filesystem::path &,hier::Cancel = {});
}
