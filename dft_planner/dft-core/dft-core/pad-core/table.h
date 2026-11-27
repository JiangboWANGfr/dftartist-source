#pragma once
// Config-table manual columns: overlay apply + ssn summary (spec §7/§11/§12).
#include <string>
#include <vector>

#include "model.h"

namespace pad {

// overlay JSON: {"pads":{"<path>":{"bscan_en":"yes","reuse":"in","func":"ssn","enable":"sig"}}}
// Throws std::runtime_error with a one-line reason on any violation.
// On throw, earlier entries may already be applied (rows partially updated) —
// callers must discard the ExtractResult on failure, not reuse it.
void applyOverlay(ExtractResult& r, const std::string& jsonText);

struct SsnSummary {
    int inWidth = 0;   // -> ssn_bus_data_in[inWidth-1:0]   (P2)
    int outWidth = 0;  // -> ssn_bus_data_out[outWidth-1:0] (P2)
};
// effective direction = (dir=="inout" ? reuse : dir); counts func=="ssn" rows (spec §11)
SsnSummary ssnSummary(const std::vector<PadInstance>& rows);

}  // namespace pad
