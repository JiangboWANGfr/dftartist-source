// A's test driver for B's frozen raw-byte corpus. Hex is only the harness
// carrier: decodeFrame receives the original finite bytes, including raw NUL.
#include "SessionContract.h"
#include "hier/protocol/Json.h"

#include <charconv>
#include <iostream>
#include <stdexcept>

using namespace hier::protocol::session;

namespace {
std::string fromHex(std::string_view hex) {
    if (hex.size() % 2 != 0)
        throw std::runtime_error("odd hex carrier length");
    std::string bytes;
    bytes.reserve(hex.size() / 2);
    for (size_t i = 0; i < hex.size(); i += 2) {
        unsigned value = 0;
        const auto result = std::from_chars(hex.data() + i, hex.data() + i + 2, value, 16);
        if (result.ec != std::errc{} || result.ptr != hex.data() + i + 2)
            throw std::runtime_error("invalid hex carrier");
        bytes.push_back(static_cast<char>(value));
    }
    return bytes;
}
} // namespace

int main() {
    try {
        for (std::string line; std::getline(std::cin, line);) {
            const auto bytes = fromHex(line);
            const auto decoded = decodeFrame(std::string_view(bytes.data(), bytes.size()));
            hier::protocol::JsonWriter writer;
            writer.beginObject();
            if (const auto *fault = std::get_if<DecodeFault>(&decoded)) {
                writer.key("accepted").value(false);
                writer.key("code").value(static_cast<int>(fault->code));
                writer.key("offset").value(fault->byteOffset);
            } else {
                writer.key("accepted").value(true);
                const auto &object = std::get<JsonValue::Object>(decoded);
                const auto x = object.find("x");
                if (x != object.end()) {
                    if (const auto *number = std::get_if<JsonNumber>(&x->second.value))
                        writer.key("x_token").value(number->token);
                }
            }
            writer.endObject();
            std::cout << writer.str() << '\n';
        }
        if (std::cin.bad() || !std::cout)
            throw std::runtime_error("replay I/O failed");
        return 0;
    } catch (const std::exception &error) {
        std::cerr << "decode replay: " << error.what() << '\n';
        return 1;
    }
}
