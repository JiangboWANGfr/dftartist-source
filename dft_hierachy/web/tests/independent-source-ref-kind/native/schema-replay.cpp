// Minimal B boundary adapter: production decode/validation, no substitute parser/schema.
#include "WireSchema.h"
#include <iostream>
#include <string>
#include <variant>
int main() {
    using namespace hier::protocol::session;
    for (std::string line; std::getline(std::cin, line);) {
        const auto decoded = decodeFrame(line);
        const auto* object = std::get_if<JsonValue::Object>(&decoded);
        if (!object) { std::cerr << "B invalid replay envelope\n"; return 2; }
        const auto& name = std::get<std::string>(object->at("definition").value);
        const bool accept = validateDefinition(name, object->at("input"));
        std::cout << (accept ? "true" : "false") << '\n';
    }
}
