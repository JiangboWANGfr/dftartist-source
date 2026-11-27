#pragma once
#include "SourceInventory.h"
#include <chrono>

namespace dft::sequential::detail {
void validateInventoryLimits(const InventoryLimits &);
hier::Result<SourceInventory> inventoryWithDeadline(const Report &, const InventoryLimits &,
    std::chrono::steady_clock::time_point, hier::Cancel);
}
