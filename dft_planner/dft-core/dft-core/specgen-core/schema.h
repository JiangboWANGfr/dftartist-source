#pragma once
#include <optional>
#include <string>
#include <vector>

namespace specgen {

// Minimal view of datapath.schema.json — only what genBlock reads.
struct PropSchema {
    std::string name;
};

struct BlockSchema {
    std::optional<std::string> name;
    bool hasId = false;  // schema block `id != null`
    std::vector<PropSchema> props;
    std::vector<BlockSchema> blocks;
};

// Component schema for a DFT IP type; throws if missing (schema.ts:14).
const BlockSchema& componentSchema(const std::string& ipType);

// BScan 组件 schema（HostBScanInterface/EBScanPipeline/EBScanInstance/SecondaryEBScanInterface）；
// 缺则抛。按名取（有些名非 DftIpType）。
const BlockSchema& bscanComponentSchema(const std::string& name);

}  // namespace specgen
