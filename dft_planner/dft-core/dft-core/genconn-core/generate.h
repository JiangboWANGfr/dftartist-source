#pragma once
#include <optional>
#include <string>
#include <vector>

#include "model.h"

namespace genconn {

struct GenResult {
    std::string file;
    std::string text;
};

// §6: connection file for one level. nullopt = no tiling children -> no file.
std::optional<GenResult> generate(const HardenDef& root, const HardenLibrary& lib, bool isRoot);

// TCL feed-through for lifted (portedFrom) interfaces. nullopt = none.
std::optional<GenResult> generateTcl(const HardenDef& root, const HardenLibrary& lib, bool isRoot);

// All defs that produce a connection file (+ tcl), like generateAll in TS.
std::vector<GenResult> generateAll(const HardenLibrary& lib, const std::string& rootId);

}  // namespace genconn
