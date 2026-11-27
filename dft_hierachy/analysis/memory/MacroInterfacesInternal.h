#pragma once
#include "MacroInterfaces.h"
#include <chrono>
namespace dft::memory::detail {
void validateMacroRequest(const MacroRequest &);
hier::Result<MacroInterfaces> inspectMacroInterfacesWithDeadline(hier::Design &,const MacroRequest &,
    std::chrono::steady_clock::time_point,hier::Cancel = {});
}
