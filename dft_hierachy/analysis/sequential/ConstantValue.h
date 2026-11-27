#pragma once
#include <cstdint>
#include <optional>
#include <string_view>

namespace dft::sequential::detail {
// Parses only Core's structured, sized binary constant field, never source text.
std::optional<char> constantBit(std::string_view, uint64_t width, uint64_t bit);
}
