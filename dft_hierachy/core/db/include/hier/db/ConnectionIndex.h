#pragma once
#include "hier/model/Model.h"
#include "hier/model/Result.h"
#include <limits>
#include <map>
#include <memory>

namespace hier::db {
inline constexpr size_t noEntry = std::numeric_limits<size_t>::max();
enum class ConnectionKind { Dependency, OwnPort, ChildPin, Internal, Outside, Reason };

// Positions in immutable BodyConnections, not a second set of connection facts.
struct ConnectionEntry {
    ConnectionKind kind = ConnectionKind::Dependency;
    size_t first = 0, second = 0, third = noEntry, reg = noEntry;
    model::BitRange target; // Write portion selected by register boundaries.
    std::string via;        // Body-relative sort key; qualified only by L3.
    model::Reason reason;  // Only Reason entries; coalesced by (code, at).
    std::vector<model::BitRange> ranges;
};

struct ConnectionList {
    std::vector<ConnectionEntry> entries;
    // Exact interval union at each tree node. A page can skip unrelated ranges and
    // already consumed facts without walking the entire object's fanout again.
    std::vector<std::vector<model::BitRange>> coverage;
    Result<size_t> next(size_t start, model::BitRange bits, Cancel cancel = {}) const;
};
struct ConnectionIndex {
    // true = backward; refs are body-relative, including child pins p:S:N.
    std::map<std::pair<std::string, bool>, ConnectionList> objects;
    std::map<std::string, size_t> bindings;
    std::map<std::string, std::vector<size_t>> cellPins; // Child instance -> original pin positions.
    size_t estimatedBytes = 0;
    const ConnectionList *find(const std::string &ref, bool upstream) const;
};
struct IndexedConnections {
    std::shared_ptr<const model::BodyConnections> facts;
    std::shared_ptr<const ConnectionIndex> index;
};
Result<std::shared_ptr<const ConnectionIndex>>
indexConnections(const model::BodyConnections &, const model::BodySkeleton &, Cancel);
// Borrow a mapped segment, or construct a direct segment in caller-owned storage.
// Avoid copying a potentially bus-sized constant when selecting a small bit range.
const model::BindSegment &internalSegment(const model::PortInternal &, size_t index,
                                          model::BindSegment &direct);
size_t internalSegmentCount(const model::PortInternal &);
} // namespace hier::db
