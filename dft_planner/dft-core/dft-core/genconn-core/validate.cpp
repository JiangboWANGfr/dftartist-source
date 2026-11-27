#include "validate.h"

#include <set>
#include <stdexcept>

// C++ port of edit.ts effectivePd + validate.ts validateDef.

namespace genconn {

std::optional<std::string> effectivePd(const HardenInstance* inst, const BusInterface& iface) {
    if (inst) {
        auto it = inst->ifacePd.find(iface.id);
        if (it != inst->ifacePd.end()) return it->second;
    }
    return iface.powerDomain;
}

void validateDef(const HardenDef& def) {
    // hierarchical def must not have a (non-ported) secondary interface
    if (def.designType == "hierarchical") {
        for (const auto& i : def.interfaces) {
            if (i.role == "secondary" && !i.portedFrom.has_value())
                throw std::runtime_error("hierarchical def '" + def.designName +
                                         "' must not have a secondary interface ('" + i.id + "')");
        }
    }
    // at most one client per busType (BISR keyed by powerDomain)
    std::set<std::string> seen;
    for (const auto& i : def.interfaces) {
        if (i.placement.value_or("") == "other" &&
            !(i.isDataSource.value_or(false) && i.role == "client"))
            throw std::runtime_error("def '" + def.designName +
                                     "': placement=other only for data-source client (interface '" +
                                     i.id + "')");
        if (i.role != "client") continue;
        std::string key = (i.busType == "BISR")
                              ? ("BISR:" + i.powerDomain.value_or("undefined"))
                              : (i.busType == "SSN")
                                    ? ("SSN:" + i.interfaceName.value_or(""))
                                    : i.busType;
        if (seen.count(key))
            throw std::runtime_error("def '" + def.designName + "' has multiple clients for '" +
                                     key + "'");
        seen.insert(key);
    }
}

}  // namespace genconn
