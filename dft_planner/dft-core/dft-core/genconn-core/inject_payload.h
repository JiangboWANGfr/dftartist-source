#pragma once
// DFT-injection payload (slang-free): what to inject, derived from the connection model.
// Shared by the regex injector (vinject.cpp) and the slang-anchored one (inject-core).
#include <map>
#include <string>
#include <vector>

#include "model.h"

namespace genconn {

struct InstPort {
    std::string port, net;
};
struct NetDecl {
    std::string name;
    int width;
};
struct PortDecl {
    std::string name, dir;
    int width;
};
struct DftWiring {
    std::map<std::string, std::vector<InstPort>> perInstance;  // instKey -> [.port(net)]
    std::vector<NetDecl> nets;                                 // dedup, insertion order
};
struct PortedResult {
    std::vector<PortDecl> portDecls;
    std::map<std::string, std::vector<InstPort>> perInstance;
};

std::string bareName(const std::string& s);  // strip trailing [W-1:0]
std::string instKey(const std::string& s);   // trim + lowercase (match key)

DftWiring collectDftWiring(const HardenDef& root, const HardenLibrary& lib);
PortedResult collectPortedPorts(const HardenDef& root);

std::string fmtWidth(int w);                       // "[W-1:0] " or ""
std::string wireBlock(const std::vector<NetDecl>& nets);  // "  wire ...;" lines

const HardenDef* findDef(const HardenLibrary& lib, const std::string& id);

}  // namespace genconn
