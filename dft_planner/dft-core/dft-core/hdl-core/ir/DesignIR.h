#pragma once
#include <map>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace hdl::ir {

struct PortInfo {
    std::string name;
    std::string direction;  // "in" | "out" | "inout"
    int width = 0;
    std::string busLabel;
};

struct ModuleDefinition {
    std::string id;                       // "name|absPath" or "name|"
    std::string designName;
    std::optional<std::string> filePath;  // present only if non-empty
};

struct InstanceNode {
    std::string id;  // hierarchicalPath
    std::string instanceName;
    std::string definitionId;
    std::optional<std::string> parentInstanceId;  // nullopt => null (root)
    std::vector<std::string> childInstanceIds;
    bool isLeaf = false;
};

struct DesignHierarchy {
    int schemaVersion = 1;
    std::vector<std::string> rootInstanceIds;
    // insertion-ordered so output order is deterministic (DFS order)
    std::vector<std::pair<std::string, InstanceNode>> instances;
    std::vector<std::pair<std::string, ModuleDefinition>> definitions;
};

}  // namespace hdl::ir
