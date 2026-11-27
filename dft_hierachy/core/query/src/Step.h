#pragma once
#include "hier/Design.h"
#include "hier/db/DesignDb.h"
namespace hier::detail {
struct StepAnchor {
    model::Slice pin; // Hop.from -> pin is a proven bitwise segment of this original binding.
    bool inside = false, outside = false;
};
Result<model::QueryResult<model::StepResult>>
step(const db::DesignDb &, std::string_view ref, bool upstream,
     const ConnectionRequest &, const StepLimit &, Cancel, bool outsideBinding = false,
     std::vector<std::optional<StepAnchor>> *anchors = nullptr);
} // namespace hier::detail
