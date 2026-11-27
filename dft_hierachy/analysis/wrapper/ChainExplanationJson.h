#pragma once
#include "ChainExplanation.h"
#include "hier/protocol/Json.h"
namespace dft::wrapper {
void writeChainExplanation(hier::protocol::JsonWriter &,const ChainExplanationReport &);
// Human-readable presentation of the same owned evidence; names and paths are quoted/escaped.
std::string formatChainExplanation(const ChainExplanationReport &);
}
