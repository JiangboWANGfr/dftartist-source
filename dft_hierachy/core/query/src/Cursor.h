#pragma once
#include "hier/model/Result.h"
#include <charconv>
#include <string_view>

namespace hier::detail {

// Length framing prevents query text (including separators and embedded NULs)
// from colliding with another method's or query's identity. Cursors are opaque.
inline void cursorField(std::string &out, std::string_view field) {
    out += std::to_string(field.size()) + ":";
    out.append(field);
}
inline bool takeCursorField(std::string_view &input, std::string_view &field) {
    auto colon = input.find(':');
    if (colon == std::string_view::npos)
        return false;
    size_t size = 0;
    auto n = input.substr(0, colon);
    auto [end, ec] = std::from_chars(n.data(), n.data() + n.size(), size);
    if (n.empty() || ec != std::errc{} || end != n.data() + n.size() ||
        size > input.size() - colon - 1)
        return false;
    input.remove_prefix(colon + 1);
    field = input.substr(0, size);
    input.remove_prefix(size);
    return true;
}
inline std::string makeCursor(std::string_view method, std::string_view snapshot,
                              std::string_view query, const std::vector<size_t> &position) {
    std::string result = "m3:";
    for (auto field : {method, snapshot, query})
        cursorField(result, field);
    for (auto n : position)
        cursorField(result, std::to_string(n));
    return result;
}
inline Result<std::vector<size_t>> readCursor(std::string_view cursor, std::string_view method,
                                            std::string_view snapshot, std::string_view query,
                                            size_t coordinates) {
    if (cursor.empty())
        return std::vector<size_t>(coordinates, 0);
    const Error malformed{ErrorCode::BadRequest, "malformed cursor"};
    if (!cursor.starts_with("m3:"))
        return malformed;
    cursor.remove_prefix(3);
    std::string_view savedMethod, savedSnapshot, savedQuery;
    if (!takeCursorField(cursor, savedMethod) || !takeCursorField(cursor, savedSnapshot) ||
        !takeCursorField(cursor, savedQuery))
        return malformed;
    if (savedMethod != method || savedQuery != query)
        return Error{ErrorCode::BadRequest, "cursor does not belong to this query"};
    if (savedSnapshot != snapshot)
        return Error{ErrorCode::StaleCursor, "cursor belongs to another snapshot"};
    std::vector<size_t> position;
    for (size_t i = 0; i < coordinates; ++i) {
        std::string_view field;
        size_t n = 0;
        if (!takeCursorField(cursor, field))
            return malformed;
        auto [end, ec] = std::from_chars(field.data(), field.data() + field.size(), n);
        if (field.empty() || ec != std::errc{} || end != field.data() + field.size())
            return malformed;
        position.push_back(n);
    }
    if (!cursor.empty())
        return malformed;
    return position;
}

} // namespace hier::detail
