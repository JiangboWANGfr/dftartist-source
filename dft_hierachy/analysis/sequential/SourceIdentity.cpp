#include "SourceIdentity.h"
#include "ConstantValue.h"
#include <set>

namespace dft::sequential::detail {
using namespace hier::model;
SourceKey sourceKey(const ControlSource &v) {
    std::optional<SourcePointKey> point;
    if (v.point) point = SourcePointKey{v.point->slice.ref, v.point->slice.bits.lsb, v.point->slice.bits.width, v.point->side};
    return {v.kind, point, v.sourceRef, v.value, v.inverted};
}
bool sameSource(const ControlSource &a, const ControlSource &b) { return sourceKey(a) == sourceKey(b); }
std::optional<ControlSource> projectSource(const Control &control, const std::function<bool()> &tick) {
    if (control.point.slice.bits.width != 1) return {};
    ControlSource value;
    value.kind = control.verdict;
    if (control.logic) {
        const auto &result = control.logic->result;
        if (result.verdict != control.verdict) return {};
        if (result.verdict == "constant" && result.value && result.value->size() == 1 &&
            result.value->find_first_not_of("01xz") == std::string::npos) {
            value.value = result.value;
            return value;
        }
        if (result.verdict != "primary_input" && result.verdict != "generated" && result.verdict != "undriven") return {};
        if (!result.origin || result.origin->slice.bits.width != 1 ||
            (result.verdict != "undriven" && !result.sourceRef)) return {};
        value.point = result.origin; value.sourceRef = result.sourceRef;
        value.inverted = result.inversions % 2 != 0;
        return value;
    }
    // A v2 direct structural PI/constant/undriven may not need a logic proof.
    // Normalize it to the same descriptor as a later conditional proof.
    if (!control.trace || control.trace->completeness.status != "complete" ||
        control.trace->result.hasConservative || !control.trace->result.frontier.empty()) return {};
    if (control.verdict != "primary_input" && control.verdict != "constant" && control.verdict != "undriven") return {};
    const auto &graph = control.trace->result;
    std::set<std::string> outgoing;
    for (const auto &edge : graph.edges) { if (!tick()) return {}; outgoing.insert(edge.from); }
    const TraceNode *terminal = nullptr; // Borrowed only during this projection; copied below.
    for (const auto &node : graph.nodes) {
        if (!tick()) return {};
        if (outgoing.contains(node.id)) continue;
        if (terminal) return {}; // Multiple terminals never establish a unique source identity.
        terminal = &node;
    }
    if (!terminal) return {};
    if (control.verdict == "constant" && terminal->kind == "const" && terminal->value) {
        const auto bit = detail::constantBit(*terminal->value, 1, 0);
        if (!bit) return {};
        value.value = std::string(1, *bit); return value;
    }
    if (!terminal->point || terminal->point->slice.bits.width != 1) return {};
    if (control.verdict == "primary_input" && terminal->kind == "top_port" && terminal->ref) {
        value.point = terminal->point; value.sourceRef = terminal->ref; return value;
    }
    if (control.verdict == "undriven" && (terminal->kind == "slice" || terminal->kind == "unconnected")) {
        value.point = terminal->point; value.sourceRef = terminal->ref; return value;
    }
    return {};
}
}
