#pragma once
#include <optional>
#include <string>
#include <vector>

namespace specgen {

// Port role view of DFT_CATALOG (catalog.ts) — only what the graph algorithm needs.
struct DftPort {
    std::string name;
    std::string dir;  // "in" | "out"
    std::optional<std::string> role;  // master | secondary | clock | data | chain
};

struct DftCatalogEntry {
    std::string ipType;
    std::vector<DftPort> ports;
};

// throws std::runtime_error if ipType unknown (catalog.ts:50).
const DftCatalogEntry& catalogEntry(const std::string& ipType);

}  // namespace specgen
