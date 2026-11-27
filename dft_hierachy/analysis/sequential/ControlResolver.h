#pragma once
#include "Check.h"
#include <chrono>
#include <set>

namespace dft::sequential::detail {
// All references are borrowed for one resolveControl call; nothing is cached/stored.
struct ControlContext {
    hier::Design &design;
    const Request &request;
    const std::set<std::string> &tops;
    const std::vector<ClockRoot> &clockRoots;
    const std::vector<InputValue> &inputValues;
    uint64_t &traceNodes, &traceEdges, &logicWork;
    std::chrono::steady_clock::time_point deadline;
    hier::Cancel cancel;
};
Control resolveControl(const hier::model::EventInfo &, const ControlContext &);
}
