#pragma once
#include "QueryCancel.h"
#include <algorithm>
#include <charconv>

namespace hier::detail {
// The existing offset cursor, including its literal query binding and errors.
// Parsing can be deferred by retaining the Result until data traversal finishes.
struct OffsetPage {
    size_t offset;
    int limit;
    static Result<OffsetPage> read(const PageRequest &page, const std::string &binding) {
        if (page.limit <= 0)
            return Error{ErrorCode::BadRequest, "limit must be positive"};
        size_t offset = 0;
        if (!page.cursor.empty()) {
            const std::string prefix = binding + "@";
            if (!page.cursor.starts_with(prefix))
                return Error{ErrorCode::BadRequest, "cursor does not belong to this query"};
            const auto n = std::string_view(page.cursor).substr(prefix.size());
            auto [end, ec] = std::from_chars(n.data(), n.data() + n.size(), offset);
            if (n.empty() || ec != std::errc{} || end != n.data() + n.size())
                return Error{ErrorCode::BadRequest, "malformed cursor"};
        }
        return OffsetPage{offset,page.limit};
    }
    bool contains(size_t position) const {
        return offset <= position && position < offset + size_t(limit);
    }
    template <class T, class Make>
    Result<Page<T>> materialize(size_t total, const std::string &binding,
                                Make make, Cancel cancel = {}) const {
        if (offset > total)
            return Error{ErrorCode::BadRequest, "malformed cursor"};
        Page<T> out;
        const auto stop = std::min(total,offset+size_t(limit));
        for (size_t i = offset; i < stop; ++i) {
            checkpoint(cancel);
            out.items.push_back(make(i));
        }
        if (stop < total)
            out.next = binding + "@" + std::to_string(stop);
        return out;
    }
};
} // namespace hier::detail
