#include "ControlResolver.h"
#include "SourceLogic.h"
#include <algorithm>

namespace dft::sequential::detail {
namespace {
using namespace hier;
using namespace hier::model;
template<class T> T take(Result<T> value) { if (!value) throw value.error(); return std::move(value.value()); }
void checkpoint(Cancel cancel) {
    if (cancel.stop_requested()) throw Error{ErrorCode::Cancelled, "Sequential analysis cancelled"};
}
// Structural stops at processes are not proofs of uncontrollability. Retain those
// boundaries as unresolved analysis work instead of traversing or guessing logic.
void classify(Design &design, Control &control, const std::set<std::string> &tops, Cancel cancel) {
    const auto &reply = *control.trace;
    if (reply.completeness.status != "complete" || !reply.result.frontier.empty() || reply.result.hasConservative) {
        control.reasons.push_back("trace_incomplete_or_conservative");
        return;
    }
    std::set<std::string> outgoing;
    for (const auto &edge : reply.result.edges) outgoing.insert(edge.from);
    size_t primary = 0, constant = 0, undriven = 0, logic = 0, unknown = 0;
    for (const auto &node : reply.result.nodes) {
        checkpoint(cancel);
        if (node.kind == "top_port" && node.ref) {
            const auto object = take(design.object(*node.ref, cancel));
            const auto ports = take(design.ports(object.inst, cancel));
            const auto port = std::find_if(ports.begin(), ports.end(), [&](const auto &p) { return p.ref == *node.ref; });
            if (tops.contains(object.inst) && port != ports.end() && port->direction == Direction::In) ++primary;
            else ++unknown; // Inout, ref and output do not prove an externally driven PI.
        } else if (node.kind == "const") ++constant;
        else if (node.kind == "unconnected") ++undriven;
        else if (node.kind == "process" || node.kind == "register") ++logic;
        else if (node.kind == "slice") {
            if (!outgoing.contains(node.id)) ++undriven;
        } else ++unknown;
    }
    if (unknown || (primary && (constant || undriven || logic))) {
        control.reasons.push_back("unknown_or_mixed_sources");
    } else if (logic) {
        control.verdict = "logic_boundary";
        control.reasons.push_back("internal_logic_requires_analysis");
    } else if (primary) control.verdict = "primary_input";
    else if (constant || undriven) control.verdict = undriven ? "undriven" : "constant";
    else control.reasons.push_back("no_proven_terminal");
}
}
Control resolveControl(const hier::model::EventInfo &event, const ControlContext &ctx) {
    auto &design = ctx.design;
    const auto &request = ctx.request;
    const auto &tops = ctx.tops;
    const auto cancel = ctx.cancel;
    const auto deadline = ctx.deadline;
    const auto expired = [&] { return std::chrono::steady_clock::now() >= deadline; };
    checkpoint(cancel);
    const hier::model::TracePoint point{{event.signal, event.bits}, {}};
    Control value;
    value.point = point;
    if (event.signal.empty() || !event.bits.width) {
        value.reasons.push_back("unsupported_event_signal");
    } else {
        auto object = take(design.object(event.signal, cancel));
        value.path = object.pathText;
        if (object.kind == "port") value.point.side = "inside";
        if (object.kind != "port" && object.kind != "signal") {
            value.reasons.push_back("unsupported_event_object");
        } else if (expired() || ctx.traceNodes >= request.maxTraceNodes) {
            value.reasons.push_back(expired() ? "budget_time" : "budget_trace_nodes");
        } else {
            Budget budget;
            budget.maxNodes = int64_t(std::min<uint64_t>(1000, request.maxTraceNodes - ctx.traceNodes));
            budget.maxEdges = int64_t(std::min<uint64_t>(4000, request.maxTraceEdges - ctx.traceEdges));
            budget.maxDepth = int64_t(request.maxDepth);
            const auto remaining = std::chrono::duration_cast<std::chrono::milliseconds>(deadline - std::chrono::steady_clock::now()).count();
            budget.maxMillis = std::clamp<int64_t>(remaining, 1, 100);
            value.trace = take(design.cone(value.point, TraceDirection::Back, TracePolicy::Structural, budget, cancel));
            ctx.traceNodes += value.trace->result.nodes.size();
            ctx.traceEdges += value.trace->result.edges.size();
            classify(design, value, tops, cancel);
            if (request.resolveLogic && (value.verdict == "logic_boundary" ||
                (!ctx.inputValues.empty() && value.verdict == "primary_input"))) {
                value.logic = detail::resolveSource(design, value.point, request, tops, ctx.logicWork, deadline, cancel,
                                                   ctx.clockRoots, ctx.inputValues);
                value.verdict = value.logic->result.verdict;
                value.reasons = value.logic->reasons;
            }
        }
    }
    return value;
}
}
