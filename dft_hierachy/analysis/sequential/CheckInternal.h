#pragma once
#include "Check.h"

namespace dft::sequential::detail {
// Throw hier::Error for the shared request/scope policy; public entry points translate it.
void validateRequest(const Request &);
hier::model::InstInfo resolveScope(hier::Design &, const std::string &, hier::Cancel);
}
