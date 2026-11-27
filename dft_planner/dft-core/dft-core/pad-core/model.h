#pragma once
// pad-core data model (spec: docs/superpowers/specs/2026-07-10-pad-core-design.md)
#include <string>
#include <vector>

namespace pad {

// ---- cell library (spec §5) ----
struct CellPin {
    std::string name;
    std::string dir;                 // "in" | "out" | "inout" | "" (undeclared)
    std::vector<std::string> attrs;  // mode() pin attributes, e.g. "pad_from_io"
};

struct CellDef {
    std::string name;      // module name, case preserved
    std::string cellType;  // cell_type value: "pad" / "and" / ...
    std::vector<CellPin> pins;
};

struct CellLib {
    std::vector<CellDef> cells;
    const CellDef* find(const std::string& name) const {
        for (const auto& c : cells)
            if (c.name == name) return &c;
        return nullptr;
    }
};

// pad cell roles derived from standard pin attributes (spec §5)
struct PadCellInfo {
    std::string cell;
    std::string dir;             // "in" | "out" | "inout"
    std::string padPin;          // pin carrying pad_from_io/pad_to_io/pad_pad_io
    std::string coreInPin;       // pad_to_pad ("" if none)
    std::string coreOutPin;      // pad_from_pad ("" if none)
    std::string enablePin;       // pad_enable_high/low ("" if none)
    std::string enablePolarity;  // "high" | "low" | ""
    std::string pull;            // "" | "pull0" | "pull1"
};

// ---- extracted pad instance = one config-table row (spec §7/§14) ----
struct PadInstance {
    std::string path;   // hierarchical path, unique key (dot-separated)
    std::string cell;
    std::string gpio;   // resolved top-level port ("" if unresolved)
    std::string dir;    // in | out | inout (from lib)
    std::string padNet;
    std::string coreInNet;
    std::string coreOutNet;
    std::string autoEnableNet;
    // manual columns (overlay, spec §7)
    bool bscanEn = false;
    std::string reuse;   // "" | "in" | "out" (inout only)
    std::string func;    // "" | "ssn" | free text
    std::string enable;  // defaults to autoEnableNet
};

struct ExtractResult {
    std::vector<PadInstance> pads;      // DFS pre-order
    std::vector<std::string> warnings;  // case-mismatch / unresolved gpio / ...
};

// ---- generation options (spec §8) ----
struct GenOptions {
    std::string level;  // "chip" | "phy" | "sub"
    std::string aux;    // "external" | "internal" (phy/sub only)
};

}  // namespace pad
