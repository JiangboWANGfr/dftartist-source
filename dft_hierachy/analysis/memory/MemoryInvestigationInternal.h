#pragma once
#include "MemoryInvestigation.h"
namespace dft::memory::detail {
// Shared with the CLI pre-open validation. Throws hier::Error on invalid requests.
MacroRequest prepareMemoryInvestigation(const MemoryInvestigationRequest &);
}
