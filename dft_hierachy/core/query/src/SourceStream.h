#pragma once
#include "hier/db/DesignDb.h"
#include <algorithm>
#include <array>

namespace hier::detail {
// Borrows source metadata and occurrence lists pinned by the current query.
using SourceIdentity = std::array<size_t, 4>; // definition/object, def/occurrence, i/p/s/x/r, local id
struct SourceStream {
    const db::SourceSequence *sequence;
    const std::vector<size_t> *occurrences = nullptr;
    std::optional<uint32_t> child;
    size_t kind = 0, local = 0;
    size_t size() const { return occurrences ? occurrences->size() : 1; }
    SourceIdentity identity(size_t position, const db::Occurrences &index) const {
        if (!occurrences)
            return {0, sequence->id, 0, 0};
        auto occurrence = (*occurrences)[position];
        if (child) {
            const auto &parent = index.items[occurrence].key;
            // Compare against parent + child without constructing that key.
            // Equal parent prefixes precede the child; a child's descendants
            // follow it. Missing children retain the original insertion point.
            auto it = std::lower_bound(index.items.begin(), index.items.end(), *child,
                [&](const db::Occurrence &item, uint32_t target) {
                    const auto &key = item.key;
                    size_t part = 0;
                    while (part < key.size() && part < parent.size() && key[part] == parent[part])
                        ++part;
                    if (part < parent.size())
                        return part == key.size() || key[part] < parent[part];
                    return part == key.size() || key[part] < target;
                });
            occurrence = size_t(it - index.items.begin());
        }
        return {1, occurrence, kind, local};
    }
};
} // namespace hier::detail
