#pragma once
// Tessent cell library parser (spec §5): ALL models, pad dict derived from pin attributes.
#include <map>
#include <string>

#include "model.h"

namespace pad {

// Parse the full library text. Throws std::runtime_error on malformed input.
CellLib parseCellLib(const std::string& text);

// cell_type==pad models with a pad_*_io pin -> role info, keyed by cell name (case-sensitive).
std::map<std::string, PadCellInfo> buildPadDict(const CellLib& lib);

}  // namespace pad
