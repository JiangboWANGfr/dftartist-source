#pragma once
#include <optional>
#include <string>
#include <vector>

namespace slang {
class SourceManager;
}
namespace slang::ast {
class Symbol;
class Scope;
class InstanceSymbol;
class PortConnection;
}

namespace hdl::service {

struct DefInfo {
    std::string id, designName, filePath;
    bool hasPath = false;
};

struct PortDict {
    std::string name, direction, busLabel;
    int width = 0;
    std::string type;       // slang Type::toString(), e.g. "logic[31:0]" / "my_struct_t"
    std::string portKind;   // "port" | "interface"
    std::string interfaceType;  // interface ports: interface def name (else "")
    std::string modport;        // interface ports: modport name (else "")
};

// child_instances: flatten arrays, descend generate blocks, emit instance/blackbox/primitive leaves.
void collectChildren(const slang::ast::Scope& scope, std::vector<const slang::ast::Symbol*>& out);

bool isRealInstance(const slang::ast::Symbol& s);  // kind == Instance

std::string leafName(const slang::ast::Symbol& s);  // name or last path segment

std::string kindOf(const slang::ast::Symbol& s);  // "module" | "primitive" | "blackbox"

// (defId, designName, filePath?) for an instance-kind symbol (node_def_name + def_id + add_def_for).
DefInfo defInfo(const slang::ast::Symbol& s, const slang::SourceManager& sm);

// "name|absPath" for a DefinitionSymbol (defs registry).
std::string defIdOfDefinition(const slang::ast::Symbol& defn, const slang::SourceManager& sm);

// Ports of a real instance body: only single Ports (skip MultiPort/InterfacePort).
std::vector<PortDict> portDicts(const slang::ast::InstanceSymbol& inst);

bool isParameterized(const slang::ast::InstanceSymbol& inst);  // body has parameters

// A port connection -> the net/var symbol it binds (nullptr if composite/unconnected).
// Output ports connect via an AssignmentExpression -> take its lhs first.
const slang::ast::Symbol* connNet(const slang::ast::PortConnection* pc);

// Constant tie on an input port connection: "1'b0" / "1'b1" / "4'b101" (SVInt binary
// literal, no leading zeros; signed values emit their raw bit pattern). nullopt = not a
// constant (real net, dangling, output, composite, or contains x/z).
std::optional<std::string> connTie(const slang::ast::PortConnection* pc);

}  // namespace hdl::service
