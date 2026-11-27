#pragma once
#include "ChainCoverage.h"
#include "hier/protocol/Json.h"
namespace dft::wrapper {
void writeChainCoverage(hier::protocol::JsonWriter &,const ChainCoverageReport &);
}
