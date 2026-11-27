#pragma once
#include "ControlGeneration.h"
#include <functional>
namespace dft::sequential::detail {
// Borrows controls/callback only during bounded validation, does not authenticate arbitrary forged facts.
void validateGenerationGraphReferences(const ControlGeneration &,size_t,const std::function<const Control &(size_t)> &,hier::Cancel);
}
