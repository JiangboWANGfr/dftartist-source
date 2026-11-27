#pragma once
#include "Check.h"

namespace dft::sequential {
// Retain the original public struct tag as well as its ordinary type spelling.
struct ScenarioSource {
    std::string kind;
    std::optional<hier::model::TracePoint> point;
    std::optional<std::string> sourceRef, value;
    bool inverted = false;
};using ControlSource = ScenarioSource;
}
