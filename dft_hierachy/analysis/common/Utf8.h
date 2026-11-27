#pragma once
#include <string_view>
namespace dft::detail {
// Unicode scalar UTF-8; no overlong encodings, surrogates or values above U+10FFFF.
inline bool validUtf8(std::string_view text) {
    size_t i = 0;
    const auto byte = [&](size_t n) { return static_cast<unsigned char>(text[n]); };
    while (i < text.size()) {
        const auto lead = byte(i++);
        if (lead < 0x80) continue;
        size_t following = 0;
        unsigned char lower = 0x80, upper = 0xbf;
        if (lead >= 0xc2 && lead <= 0xdf) following = 1;
        else if (lead >= 0xe0 && lead <= 0xef) {
            following = 2;
            if (lead == 0xe0) lower = 0xa0;
            if (lead == 0xed) upper = 0x9f;
        } else if (lead >= 0xf0 && lead <= 0xf4) {
            following = 3;
            if (lead == 0xf0) lower = 0x90;
            if (lead == 0xf4) upper = 0x8f;
        } else return false;
        if (text.size() - i < following || byte(i) < lower || byte(i) > upper) return false;
        ++i;
        while (--following) { if (byte(i) < 0x80 || byte(i) > 0xbf) return false; ++i; }
    }
    return true;
}
}
