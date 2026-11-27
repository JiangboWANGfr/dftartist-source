#pragma once
#include "Check.h"
#include <string_view>
namespace dft::sequential::detail {
uint64_t validateReportReferences(const Report &, hier::Cancel, std::string_view label = "Source inventory");
}
