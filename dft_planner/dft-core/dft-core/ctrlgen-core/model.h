#pragma once
// DFX ctrl IP model (spec: dft-suite docs/specs/2026-07-07-dfx-ctrl-ip-design.md §4.1).
// Data structs + small formatting helpers shared by the generators; parseSpec (spec.h)
// normalizes stitch/muxName to per-bit vectors.
#include <optional>
#include <string>
#include <vector>

namespace ctrlgen {

struct GateCell {
    std::string name = "cell_and2";
    std::string out = "Z";
    std::string a = "A1";
    std::string b = "A2";
};

struct PinSpec {
    std::string portName;
    std::string mode;                   // "control" | "observe"
    int width = 1;
    std::optional<std::string> target;  // scalar / homogeneous bus (-> target[i])
    std::vector<std::string> targets;   // per-bit heterogeneous; size == width
    // control only; normalized to size == width by parseSpec. "mux"|"replace"|"connect"
    std::vector<std::string> stitch;
    std::vector<std::string> muxName;   // size == width; "" on non-mux bits
};

struct CtrlIpSpec {
    int schemaVersion = 2;
    std::string moduleBase;
    std::optional<int> dsIndex;         // nullopt -> module name = moduleBase (EMA form)
    std::string dfxModeSource = "u_dfx_static_hyper_ctl_tdr/dfx_mode";
    GateCell gateCell;
    std::vector<PinSpec> pins;
};

inline std::string moduleName(const CtrlIpSpec& s) {
    return s.dsIndex ? s.moduleBase + "_ds" + std::to_string(*s.dsIndex) : s.moduleBase;
}

// Verilog/ICL width suffix: "" for scalar, "[N-1:0]" for buses (golden byte format).
inline std::string widthStr(int w) { return w > 1 ? "[" + std::to_string(w - 1) + ":0]" : ""; }

}  // namespace ctrlgen
