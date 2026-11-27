#pragma once
// BScan datapath 生成（C++ port of newProject/src/dft/bscan.ts）：单链，无分支。
#include <string>
#include <vector>

#include "json/JsonValue.h"
#include "model.h"

namespace specgen {

struct BScanNode {
    std::string type;  // "EBScanPipeline" | "SecondaryEBScanInterface" | "EBScanInstance"
    std::string name;
    hdl::json::Value params;  // EBScanPipeline: IP config; secondary/EBScanInstance: empty
};
struct BScanChain {
    std::string clientName;
    std::vector<BScanNode> order;
};

// 无 BSCAN client 接口 -> false（该 scope 无 BScan datapath）；断链/分支/环 -> 抛。
bool linearizeBScanChain(const SpecgenScope& scope, BScanChain& out);
// scope -> EmbeddedBoundaryScan 文本块（ind(1) 层）；无 BScan 链 -> 空串。
std::string genBScanSpec(const SpecgenScope& scope);

}  // namespace specgen
