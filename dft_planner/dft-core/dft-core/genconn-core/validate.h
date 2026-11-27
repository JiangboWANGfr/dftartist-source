#pragma once
#include <optional>
#include <string>

#include "model.h"

namespace genconn {

// inst.ifacePd[iface.id] ?? iface.powerDomain  (port of edit.ts effectivePd)
std::optional<std::string> effectivePd(const HardenInstance* inst, const BusInterface& iface);

// Structural invariants (§3/§8). Throws std::runtime_error on violation.
void validateDef(const HardenDef& def);

}  // namespace genconn
