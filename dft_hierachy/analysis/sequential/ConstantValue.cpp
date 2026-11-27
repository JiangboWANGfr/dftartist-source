#include "ConstantValue.h"
#include <charconv>

namespace dft::sequential::detail {
std::optional<char> constantBit(std::string_view text, uint64_t width, uint64_t bit) {
    const auto quote = text.find("'b");
    if (quote == std::string_view::npos || bit >= width) return {};
    uint64_t declared = 0;
    const auto [end, ec] = std::from_chars(text.data(), text.data() + quote, declared);
    if (ec != std::errc{} || end != text.data() + quote || declared != width ||
        text.size() - quote - 2 != width) return {};
    const auto value = text[text.size() - 1 - size_t(bit)];
    if (value != '0' && value != '1' && value != 'x' && value != 'z') return {};
    return value;
}
}
