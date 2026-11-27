#pragma once
#include "ChainPlan.h"
#include "hier/protocol/Json.h"
namespace dft::wrapper::detail {
void writeCellPlanFields(hier::protocol::JsonWriter &,const CellPlan &);
void writeChainLayoutFields(hier::protocol::JsonWriter &,const ChainLayout &);
}
