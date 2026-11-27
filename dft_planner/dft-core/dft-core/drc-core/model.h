#pragma once
#include <string>
#include <vector>

namespace drc {

// One clock/reset DFT-DRC violation (structural controllability).
struct Violation {
    std::string rule;       // "CLK-UNCTRL" | "RST-UNCTRL" | ... (extended in ④.3)
    std::string severity;   // "error" | "warn"
    std::string signal;     // the offending clock/reset net (local name in `instanceId`)
    std::string instanceId; // owner instance of the flop
    std::string file;
    int line = 0;
    std::vector<std::string> path;  // reverse-trace path ["inst:net", ...] to the dead end
    std::string message;
};

struct DrcReport {
    std::vector<Violation> violations;
    int flops = 0;   // edge-triggered blocks checked
    int clocks = 0;  // clock nets checked
    int resets = 0;  // async-reset nets checked
};

}  // namespace drc
