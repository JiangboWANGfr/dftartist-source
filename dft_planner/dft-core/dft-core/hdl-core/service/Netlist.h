#pragma once
#include <string>
#include <vector>

namespace slang {
class SourceManager;
}
namespace slang::ast {
class InstanceSymbol;
}

namespace hdl::service {

struct NetInfo {
    std::string name;
    int width = 0;
    std::string busLabel;
    std::string netKind;  // net type name ("wire"/"supply0"/...) or "var"
};

struct NetConnection {
    std::string instanceId;  // == ownerInstanceId -> a boundary port; else a child instance
    std::string port;
    std::string direction;  // in | out | inout
    std::string net;        // resolved net/var name ("" if composite/unconnected)
    std::string tie;        // constant tie literal ("1'b0"/"4'b101"); "" if net or dangling
};

// L3: one module level's local netlist (nets + port->net bindings). Owner must be a real instance.
struct LocalNetlist {
    std::string ownerInstanceId;
    std::vector<NetInfo> nets;
    std::vector<NetConnection> connections;
    bool truncated = false;
};

LocalNetlist extractLocalNetlist(const slang::ast::InstanceSymbol& owner,
                                 const slang::SourceManager& sm);

}  // namespace hdl::service
