#pragma once
#include "model.h"

namespace hdl::service {
class DesignDb;
}

namespace drc {

// Run the clock/reset DFT-DRC over an elaborated design. v1 (④.2): CLK-UNCTRL / RST-UNCTRL —
// every flop's clock and async-reset net must trace back to a primary input.
DrcReport runDrc(hdl::service::DesignDb& db);

}  // namespace drc
