#pragma once
#include "hier/model/Model.h"
#include <tuple>
namespace dft::sequential::detail {
using EventKey = std::tuple<std::string, uint64_t, uint64_t, std::string, std::string>;
inline EventKey eventKey(const hier::model::EventInfo &e) { return {e.signal, e.bits.lsb, e.bits.width, e.edge, e.type}; }
}
