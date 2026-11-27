#include "CheckInternal.h"
#include "ControlResolver.h"
#include "ClockUsage.h"
#include "PrimaryInputs.h"
#include <algorithm>
#include <chrono>
#include <deque>
#include <map>
#include <set>
#include <tuple>

namespace dft::sequential {
namespace {
using namespace hier;
using namespace hier::model;
template<class T> T take(Result<T> value) {
    if (!value) throw value.error();
    return std::move(value.value());
}
void checkpoint(Cancel cancel) {
    if (cancel.stop_requested()) throw Error{ErrorCode::Cancelled, "Sequential analysis cancelled"};
}
using PointKey = std::tuple<std::string, uint64_t, uint64_t, std::optional<std::string>>;
PointKey key(const TracePoint &p) { return {p.slice.ref, p.slice.bits.lsb, p.slice.bits.width, p.side}; }

} // namespace

void detail::validateRequest(const Request &r) {
    if (r.scope.empty() || !r.maxFacts || r.maxFacts > 100000 || !r.maxInstances ||
        r.maxInstances > 100000 || !r.maxChecks || r.maxChecks > 10000 ||
        !r.maxTraceNodes || r.maxTraceNodes > 1000000 || r.maxTraceEdges > 4000000 ||
        r.maxDepth > 1000 || !r.maxMillis || r.maxMillis > 60000 ||
        (r.resolveLogic && (!r.maxLogicWork || r.maxLogicWork > 1000000)) ||
        (r.analyzeClockUsage && (!r.resolveLogic || !r.maxUsageWork || r.maxUsageWork > 1000000)) ||
        r.clockRoots.size() > 64 || (!r.clockRoots.empty() && !r.resolveLogic) ||
        r.inputValues.size() > 64 || (!r.inputValues.empty() && !r.resolveLogic))
        throw Error{ErrorCode::BadRequest, "Invalid scope or analysis budget"};
}

hier::model::InstInfo detail::resolveScope(hier::Design &design, const std::string &scope, hier::Cancel cancel) {
    auto resolved = take(design.resolvePath(scope, cancel));
    if (resolved.completeness.status != "complete")
        throw Error{ErrorCode::Unsupported, "Scope resolution is incomplete"};
    if (resolved.result.empty()) throw Error{ErrorCode::NotFound, "Scope instance was not found"};
    if (resolved.result.size() != 1)
        throw Error{ErrorCode::BadRequest, "Scope must resolve to exactly one instance"};
    return take(design.instance(resolved.result.front(), cancel));
}

hier::Result<Report> analyze(hier::Design &design, const Request &request, hier::Cancel cancel) try {
    detail::validateRequest(request);
    checkpoint(cancel);
    Report report;
    report.request = request;
    report.snapshot = take(design.snapshot(cancel));
    auto root = detail::resolveScope(design, request.scope, cancel);
    report.scope = root.pathText;
    std::set<std::string> tops;
    for (const auto &top : take(design.roots(cancel))) tops.insert(top.ref);
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(int64_t(request.maxMillis));
    const auto expired = [&] { return std::chrono::steady_clock::now() >= deadline; };
    auto partial = [&](const std::string &reason) {
        report.complete = false;
        if (std::find(report.reasons.begin(), report.reasons.end(), reason) == report.reasons.end())
            report.reasons.push_back(reason);
    };
    report.clockRoots = take(detail::resolvePrimaryInputs(design, request.clockRoots, tops, deadline, cancel,
                                                         detail::InputPurpose::ClockRoot));
    std::vector<PrimaryInputRequest> inputRequests;
    for (const auto &value : request.inputValues) inputRequests.push_back(value.input);
    auto inputs = take(detail::resolvePrimaryInputs(design, inputRequests, tops, deadline, cancel,
                                                   detail::InputPurpose::Value));
    for (size_t i = 0; i < inputs.size(); ++i)
        report.inputValues.push_back({std::move(inputs[i]), request.inputValues[i].high});
    std::map<PointKey, size_t> indices;
    std::set<std::pair<size_t, std::string>> findings;
    auto control = [&](const EventInfo &event) -> std::optional<size_t> {
        checkpoint(cancel);
        TracePoint point{{event.signal, event.bits}, {}};
        const auto found = indices.find(key(point));
        if (found != indices.end()) return found->second;
        if (report.checks.size() >= request.maxChecks) { partial("budget_checks"); return {}; }
        const auto id = report.checks.size();
        auto value = detail::resolveControl(event, {design, request, tops, report.clockRoots, report.inputValues,
            report.traceNodes, report.traceEdges, report.logicWork, deadline, cancel});
        if (value.logic) for (const auto &reason : value.reasons)
            if (reason.starts_with("budget_")) partial(reason);
        if (value.verdict == "unknown" || value.verdict == "logic_boundary" || value.verdict == "gated")
            partial("control_requires_analysis");
        // Index the original event identity; the explicit side is a projection of
        // that same immutable object's kind, not a second lookup authority.
        indices.emplace(key(point), id);
        report.checks.push_back(std::move(value));
        return id;
    };
    auto finding = [&](std::optional<size_t> index, const std::string &rule) {
        if (!index) return;
        const auto &verdict = report.checks[*index].verdict;
        if ((verdict == "constant" || verdict == "undriven") && findings.emplace(*index, rule).second)
            report.findings.push_back({rule, *index});
        if (request.resolveLogic && verdict == "generated") {
            const std::string generated = rule == "CLK-UNCTRL" ? "CLK-GEN" : "RST-GEN";
            if (findings.emplace(*index, generated).second) report.findings.push_back({generated, *index});
        }
        if (rule == "CLK-UNCTRL" && verdict == "gated") {
            const auto &proof = *report.checks[*index].logic;
            if (!proof.result.gate || *proof.result.gate >= proof.gates.size())
                throw Error{ErrorCode::Internal, "Missing final gate evidence"};
            const auto &enable = proof.gates[*proof.result.gate].enable;
            if ((enable.verdict == "generated" || enable.verdict == "undriven") &&
                findings.emplace(*index, "CLK-GATED").second)
                report.findings.push_back({"CLK-GATED", *index, "warning"});
        }
    };
    std::deque<InstInfo> pending{root};
    bool stop = false;
    while (!pending.empty() && !stop) {
        checkpoint(cancel);
        if (expired()) { partial("budget_time"); break; }
        auto inst = std::move(pending.front()); pending.pop_front();
        ++report.visitedInstances;
        if (inst.kind == InstKind::Blackbox || inst.kind == InstKind::Primitive || inst.kind == InstKind::Interface) {
            partial("unmodeled_instance");
        } else {
            PageRequest page;
            do {
                checkpoint(cancel);
                if (report.registers.size() >= request.maxFacts || expired()) {
                    partial(expired() ? "budget_time" : "budget_facts"); stop = true; break;
                }
                page.limit = int(std::min<uint64_t>(200, request.maxFacts - report.registers.size()));
                auto reply = take(design.registers(inst.ref, page, false, cancel));
                if (reply.completeness.status != "complete") partial("core_registers_partial");
                for (auto &fact : reply.result.items) {
                    checkpoint(cancel);
                    if (fact.inst != inst.ref) return Error{ErrorCode::Internal, "Register occurrence does not match its instance"};
                    Record record;
                    record.fact = std::move(fact);
                    record.instancePath = inst.pathText;
                    record.signalPath = take(design.object(record.fact.signal, cancel)).pathText;
                    const auto source = design.source(record.fact.process, SourceKind::Statement, cancel);
                    if (source) record.source = *source;
                    else if (source.error().code == ErrorCode::NotFound || source.error().code == ErrorCode::Unsupported)
                        record.sourceUnavailable = source.error().message;
                    else return source.error();
                    record.clockCheck = control(record.fact.clock);
                    finding(record.clockCheck, "CLK-UNCTRL");
                    for (const auto &event : record.fact.async) {
                        record.asyncChecks.push_back(control(event));
                        finding(record.asyncChecks.back(), "RST-UNCTRL");
                    }
                    report.registers.push_back(std::move(record));
                }
                // Keep exact Core reasons, including instance-qualified refs.
                for (const auto &reason : reply.completeness.reasons)
                    partial(reason.code + ": " + reason.at + ": " + reason.detail);
                page.cursor = reply.result.next;
            } while (!page.cursor.empty());
        }
        if (request.recursive && !stop) {
            PageRequest page;
            do {
                const auto capacity = request.maxInstances - report.visitedInstances - pending.size();
                page.limit = int(std::min<uint64_t>(200, capacity + 1));
                auto children = take(design.children(inst.ref, page, cancel));
                for (auto &child : children.items) {
                    if (report.visitedInstances + pending.size() >= request.maxInstances) {
                        partial("budget_instances"); break;
                    }
                    pending.push_back(std::move(child));
                }
                page.cursor = children.next;
                if (report.visitedInstances + pending.size() >= request.maxInstances) {
                    if (!page.cursor.empty()) partial("budget_instances");
                    break;
                }
            } while (!page.cursor.empty());
        }
    }
    if (!pending.empty()) partial("unvisited_instances");
    if (request.analyzeClockUsage) {
        std::set<size_t> clocks;
        for (const auto &record : report.registers) if (record.clockCheck) clocks.insert(*record.clockCheck);
        uint64_t work = 0;
        for (const auto index : clocks) {
            checkpoint(cancel);
            ClockUsage proof;
            const auto &c = report.checks[index];
            if (!c.trace) {
                proof.complete = false; proof.reasons.push_back("unsupported_clock_point");
            } else proof = detail::clockUsage(design, c.point, request, work, deadline, cancel);
            proof.check = index;
            if (!proof.complete) partial("clock_usage_incomplete");
            for (const auto &reason : proof.reasons) if (reason.starts_with("budget_")) partial(reason);
            if (!proof.witnesses.empty()) report.findings.push_back({"CLK-AS-DATA", index, "warning"});
            report.clockUsage.push_back(std::move(proof));
        }
    }
    checkpoint(cancel);
    return report;
} catch (const hier::Error &error) { return error; }
} // namespace dft::sequential
