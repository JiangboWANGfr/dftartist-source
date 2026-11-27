#pragma once
#include <charconv>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

// Object identity (docs/DESIGN.md 4.3). An instance key is the path of child-slot
// indices from a top; references are opaque strings to every client.
namespace hier::model {

using InstKey = std::vector<uint32_t>;  // {top index, slot, slot, ...}; never empty

inline std::string formatInstKey(const InstKey& key) {
    std::string s;
    for (size_t i = 0; i < key.size(); i++) {
        if (i)
            s += '.';
        s += std::to_string(key[i]);
    }
    return s;
}

inline std::optional<InstKey> parseInstKey(std::string_view text) {
    InstKey key;
    while (true) {
        size_t dot = text.find('.');
        std::string_view part = text.substr(0, dot);
        uint32_t n = 0;
        auto [end, ec] = std::from_chars(part.data(), part.data() + part.size(), n);
        if (part.empty() || ec != std::errc{} || end != part.data() + part.size())
            return std::nullopt;
        key.push_back(n);
        if (dot == std::string_view::npos)
            return key;
        text.remove_prefix(dot + 1);
    }
}

inline std::string instRef(const InstKey& key) {
    return "i:" + formatInstKey(key);
}

inline std::optional<InstKey> parseInstRef(std::string_view ref) {
    if (!ref.starts_with("i:"))
        return std::nullopt;
    return parseInstKey(ref.substr(2));
}

inline std::string defRef(uint32_t index) {
    return "d:" + std::to_string(index);
}

// One path segment as source text: an identifier that is not a simple identifier is
// written as an escaped identifier (backslash, name, space), so a name that contains
// '.' stays one segment.
inline std::string escapeSegment(std::string_view name, const std::vector<int32_t>& index = {}) {
    bool simple = !name.empty() && !(name[0] >= '0' && name[0] <= '9') && name[0] != '$';
    for (char c : name) {
        bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
                  c == '_' || c == '$';
        simple = simple && ok;
    }
    std::string s = simple ? std::string(name) : "\\" + std::string(name) + " ";
    for (int32_t i : index)
        s += "[" + std::to_string(i) + "]";
    return s;
}

}  // namespace hier::model
