#include "service/Netlist.h"

#include <string>
#include <vector>

#include "service/SlangHelpers.h"
#include "slang/ast/Scope.h"
#include "slang/ast/Symbol.h"
#include "slang/ast/symbols/InstanceSymbols.h"
#include "slang/ast/symbols/PortSymbols.h"
#include "slang/ast/symbols/ValueSymbol.h"
#include "slang/ast/symbols/VariableSymbols.h"  // NetSymbol, VariableSymbol
#include "slang/ast/types/NetType.h"
#include "slang/ast/types/Type.h"
#include "slang/text/SourceManager.h"

using namespace slang::ast;
using SK = slang::ast::SymbolKind;

namespace {

std::string busLabel(const std::string& name, const Type& t) {
    if (t.isScalar() || t.getBitWidth() == 1) return name;
    if (t.isIntegral()) {
        slang::ConstantRange r = t.getFixedRange();
        return name + "[" + std::to_string(r.left) + ":" + std::to_string(r.right) + "]";
    }
    return name;
}

std::string dirStr(ArgumentDirection d) {
    switch (d) {
        case ArgumentDirection::In: return "in";
        case ArgumentDirection::Out: return "out";
        case ArgumentDirection::InOut: return "inout";
        case ArgumentDirection::Ref: return "ref";
    }
    return "inout";
}

}  // namespace

namespace hdl::service {

LocalNetlist extractLocalNetlist(const InstanceSymbol& owner, const slang::SourceManager&) {
    LocalNetlist nl;
    nl.ownerInstanceId = owner.getHierarchicalPath();
    const InstanceBodySymbol& body = owner.body;

    // nets: NetSymbol + plain VariableSymbol, in member order
    for (const Symbol& m : body.members()) {
        if (m.kind == SK::Net) {
            const auto& net = m.as<NetSymbol>();
            NetInfo n;
            n.name = std::string(net.name);
            n.width = static_cast<int>(net.getType().getBitWidth());
            n.busLabel = busLabel(n.name, net.getType());
            n.netKind = std::string(net.netType.name);
            nl.nets.push_back(std::move(n));
        } else if (m.kind == SK::Variable) {
            const auto& var = m.as<VariableSymbol>();
            NetInfo n;
            n.name = std::string(var.name);
            n.width = static_cast<int>(var.getType().getBitWidth());
            n.busLabel = busLabel(n.name, var.getType());
            n.netKind = "var";
            nl.nets.push_back(std::move(n));
        }
    }

    // boundary ports of owner -> internal net
    for (const Symbol* p : body.getPortList()) {
        if (p->kind != SK::Port) continue;
        const auto& port = p->as<PortSymbol>();
        NetConnection c;
        c.instanceId = nl.ownerInstanceId;
        c.port = std::string(port.name);
        c.direction = dirStr(port.direction);
        c.net = port.internalSymbol ? std::string(port.internalSymbol->name) : "";
        nl.connections.push_back(std::move(c));
    }

    // child instance ports -> net (real instances only, via child_instances)
    std::vector<const Symbol*> kids;
    collectChildren(body, kids);
    for (const Symbol* k : kids) {
        if (!isRealInstance(*k)) continue;
        const auto& ci = k->as<InstanceSymbol>();
        std::string cid = ci.getHierarchicalPath();
        for (auto* pc : ci.getPortConnections()) {
            const Symbol& p = pc->port;
            if (p.kind != SK::Port) continue;
            const Symbol* net = connNet(pc);
            NetConnection c;
            c.instanceId = cid;
            c.port = std::string(p.name);
            c.direction = dirStr(p.as<PortSymbol>().direction);
            c.net = net ? std::string(net->name) : "";
            if (!net)
                if (auto t = connTie(pc)) c.tie = *t;
            nl.connections.push_back(std::move(c));
        }
    }
    return nl;
}

}  // namespace hdl::service
