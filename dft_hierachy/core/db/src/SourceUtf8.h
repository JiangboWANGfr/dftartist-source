#pragma once
#include <cstddef>
#include <cstdint>
#include <string_view>

namespace hier::db::detail {
// Consume one original UTF-8 code point. The caller has checked offset < size;
// continuation reads are bounded here. ASCII includes the NUL byte.
inline bool consumeSourceUtf8(std::string_view bytes, size_t &i) {
    auto first = static_cast<unsigned char>(bytes[i++]);
    if (first < 0x80)
        return true;
    size_t count;
    uint32_t code, minimum;
    if (first >= 0xc2 && first <= 0xdf) {
        count = 1;
        code = first & 0x1fu;
        minimum = 0x80;
    } else if (first >= 0xe0 && first <= 0xef) {
        count = 2;
        code = first & 0x0fu;
        minimum = 0x800;
    } else if (first >= 0xf0 && first <= 0xf4) {
        count = 3;
        code = first & 0x07u;
        minimum = 0x10000;
    } else {
        return false;
    }
    if (bytes.size() - i < count)
        return false;
    while (count--) {
        auto next = static_cast<unsigned char>(bytes[i++]);
        if ((next & 0xc0u) != 0x80u)
            return false;
        code = (code << 6) | (next & 0x3fu);
    }
    if (code < minimum || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
        return false;
    return true;
}
} // namespace hier::db::detail
