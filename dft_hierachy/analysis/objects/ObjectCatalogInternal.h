#pragma once
#include "ObjectCatalog.h"
#include <chrono>
namespace dft::objects::detail {
void validateCatalogRequest(const CatalogRequest &);
// Shared execution path for deterministic expired-deadline regression; not a global clock override.
hier::Result<ObjectCatalog> enumerateObjectsWithDeadline(hier::Design &,const CatalogRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel);
}
