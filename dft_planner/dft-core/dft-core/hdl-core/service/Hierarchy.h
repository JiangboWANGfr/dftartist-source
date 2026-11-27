#pragma once
#include "ir/DesignIR.h"

namespace slang::ast {
class Compilation;
}

namespace hdl::service {

// Walk real tops (false-tops filtered) into the IR DesignHierarchy.
hdl::ir::DesignHierarchy buildHierarchy(slang::ast::Compilation& comp);

}  // namespace hdl::service
