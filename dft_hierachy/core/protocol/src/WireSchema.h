#pragma once
#include "SessionContract.h"

namespace hier::protocol::session {
struct Method {
    std::string_view name, clientName, params, response;
    bool allowsPartial, cacheComplete;
    JsonValue (*normalize)(const JsonValue &);
};
bool validateDefinition(std::string_view name, const JsonValue &value);
const Method *findMethod(std::string_view name);
} // namespace hier::protocol::session
