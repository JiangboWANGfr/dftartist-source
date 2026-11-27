#pragma once
#include "MemoryMap.h"
namespace dft::memory {
struct MemoryInvestigationRequest {
    std::string scope;
    bool recursive=false;
    std::vector<std::string> clockPins;
    objects::CatalogLimits traversal;
    MacroLimits interfaces;
    MemoryMapRequest mapping;
};
struct MemoryInvestigation {
    MacroInterfaces interfaces;
    MemoryMap mapping;
};
// Borrows an already-open Design synchronously; validates all request stages before
// querying. Candidate definitions come only from mapping.models. Owns both reports
// with their original indices. Partial results continue; errors/cancel return no bundle.
// Budgets remain per-stage. Library input belongs to Design::open, not this call.
hier::Result<MemoryInvestigation> investigateMemories(hier::Design &,
    const MemoryInvestigationRequest &,hier::Cancel = {});
}
