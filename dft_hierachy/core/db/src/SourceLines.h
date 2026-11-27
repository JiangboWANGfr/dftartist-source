#pragma once
#include "hier/model/Result.h"
#include <cstddef>
#include <algorithm>
#include <cstring>
#include <string_view>
#include <vector>

namespace hier::db::detail {
// The original byte-coordinate rule. Caller has checked i < bytes.size(). A
// CRLF consumes both bytes, even when LF lies on the next scan boundary.
inline void recordSourceLineBreak(std::string_view bytes, size_t &i,
                                  std::vector<size_t> &starts, std::vector<size_t> &ends) {
    if (bytes[i] == '\r' || bytes[i] == '\n') {
        ends.push_back(i);
        if (bytes[i] == '\r' && i + 1 < bytes.size() && bytes[i + 1] == '\n')
            ++i;
        starts.push_back(i + 1);
    }
}
// Starts already contains 0 and ends is empty. Both remain private to the
// unpublished SourceFile builder until the complete snapshot is accepted.
inline size_t findSourceLineByte(std::string_view bytes, char wanted, size_t from, size_t stop) {
    if (from >= stop)
        return stop;
    auto found = static_cast<const char *>(std::memchr(bytes.data() + from, wanted, stop - from));
    return found ? size_t(found - bytes.data()) : stop;
}
inline bool indexSourceLines(std::string_view bytes, std::vector<size_t> &starts,
                              std::vector<size_t> &ends, Cancel cancel) {
    size_t i = 0;
    while (i < bytes.size()) {
        // Match the original loop, including its skipped boundary when a CRLF
        // straddles it. No new diagnostic or publication phase is introduced.
        if ((i % 65536) == 0 && cancel.stop_requested())
            return false;
        const auto stop = i + std::min(size_t(65536) - i % 65536, bytes.size() - i);
        if (stop - i < 128) {
            for (; i < stop; ++i)
                recordSourceLineBreak(bytes, i, starts, ends);
            continue;
        }
        auto cr = findSourceLineByte(bytes, '\r', i, stop);
        auto lf = findSourceLineByte(bytes, '\n', i, stop);
        while (i < stop) {
            const auto next = std::min(cr, lf);
            if (next == stop) {
                i = stop;
                break;
            }
            // Avoid per-delimiter searches in dense text. This is the same
            // scalar rule, with no extra allocation or newline representation.
            if (next - i < 16) {
                for (; i < stop; ++i)
                    recordSourceLineBreak(bytes, i, starts, ends);
                break;
            }
            i = next;
            recordSourceLineBreak(bytes, i, starts, ends);
            ++i;
            if (i < stop) {
                // Each search resumes strictly beyond its consumed match.
                // A missing delimiter stays cached through the whole segment.
                if (cr < i)
                    cr = findSourceLineByte(bytes, '\r', i, stop);
                if (lf < i)
                    lf = findSourceLineByte(bytes, '\n', i, stop);
            }
        }
    }
    ends.push_back(bytes.size());
    return true;
}
} // namespace hier::db::detail
