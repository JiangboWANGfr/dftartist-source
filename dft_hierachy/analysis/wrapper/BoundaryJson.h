#pragma once
#include "Boundary.h"
#include "hier/protocol/Json.h"
namespace dft::wrapper {
void writeBoundary(hier::protocol::JsonWriter &,const BoundaryReport &);
}
