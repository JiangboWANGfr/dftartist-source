// A harness feeds B's frozen cases into the same production decoder/validators.
#include "WireSchema.h"
#include "hier/protocol/Json.h"
#include <iostream>

int main() {
    using namespace hier::protocol::session;
    std::string line;
    while (std::getline(std::cin, line)) {
        auto decoded = decodeFrame(line);
        if (const auto object = std::get_if<JsonValue::Object>(&decoded)) {
            const auto &name = std::get<std::string>(object->at("definition").value);
            std::cout << (validateDefinition(name, object->at("input")) ? "true\n" : "false\n");
        } else {
            std::cerr << "replay envelope decode failed\n";
            return 2;
        }
    }
}
