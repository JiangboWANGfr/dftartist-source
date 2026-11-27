#pragma once
#include "hier/model/Model.h"
#include "hier/model/Ids.h"
#include <cstddef>
#include <vector>

namespace hier::db {

// Snapshot index, in numeric InstKey order. Does not copy ports or connection facts.
// [position, end) includes this occurrence and its descendants, even for shared bodies.
struct Occurrence {
    model::InstKey key;
    model::BodyId body = model::kNoBody;
    uint32_t definition = 0;
    size_t end = 0;
};
struct Occurrences {
    std::vector<Occurrence> items;
    std::vector<std::vector<size_t>> byDefinition, byBody;
};

} // namespace hier::db
