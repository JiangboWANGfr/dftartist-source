#pragma once
// Extract pad instances (blackbox library cells) from a netlist + pad dict (spec §6).
#include <string>

#include "celllib.h"
#include "model.h"

namespace pad {

// filelist -> slang compile -> full-depth DFS -> pad rows (case-sensitive cell match).
// Throws std::runtime_error on filelist/parse failure.
ExtractResult extractPads(const std::string& filelistPath, const CellLib& lib);

}  // namespace pad
