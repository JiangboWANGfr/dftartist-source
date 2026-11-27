#pragma once
#include <string>

#include "json/JsonValue.h"
#include "schema.h"

namespace specgen {

std::string ind(int n);  // two spaces * n

// Schema-driven Tessent block emitter (gen.ts genBlock). `data` may be a
// non-object Value (missing config) — treated as having no fields.
std::string genBlock(const BlockSchema& bs, const hdl::json::Value& data, int depth);

// Single datapath component's bare .spec fragment (gen.ts genIpFragment) — what
// the config dialog previews: `CompName (instanceName) { ...props/blocks... }`.
// Throws if ipType is unknown (schema.ts). `config` may be a non-object Value
// (missing) — treated as empty.
std::string generateFragment(const std::string& ipType, const std::string& instanceName,
                             const hdl::json::Value& config);

}  // namespace specgen
