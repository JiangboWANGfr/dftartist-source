#pragma once
#include "ControlSource.h"

namespace dft::sequential {
struct InventoryLimits {
    uint64_t maxGroups = 10000, maxMembers = 100000, maxWork = 1000000, maxMillis = 1000;
};
struct SourceMember {
    size_t record = 0, check = 0;
    std::optional<size_t> asyncIndex; // absent = original clock event, present = original async event
};
struct SourceGroup {
    ControlSource source;
    std::vector<size_t> checks;
    std::vector<SourceMember> members;
};
struct UnresolvedSource { size_t check = 0; std::vector<std::string> reasons; };
struct SourceInventory {
    std::string snapshotId, scope;
    InventoryLimits limits;
    bool complete = true;
    std::vector<std::string> reasons;
    uint64_t work = 0, inputChecks = 0, inputFacts = 0, inputEvents = 0;
    uint64_t processedChecks = 0, visitedEvents = 0;
    std::vector<SourceGroup> groups;
    std::vector<UnresolvedSource> unresolved;
};

// Borrows a report during this call; output owns source descriptors and indices.
// References require the same original report, not another snapshot or reanalysis.
// A group means identical proven source and polarity, not a distinct physical source.
hier::Result<SourceInventory> inventorySources(const Report &, const InventoryLimits & = {}, hier::Cancel = {});
}
