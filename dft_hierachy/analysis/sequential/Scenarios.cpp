#include "ScenariosInternal.h"
#include "CheckInternal.h"
#include "SourceIdentity.h"
#include <algorithm>
#include <map>
#include <set>
#include <tuple>

namespace dft::sequential {
namespace {
using namespace hier;
using namespace hier::model;
using Key = std::tuple<std::string, uint64_t, uint64_t, std::optional<std::string>>;
Key key(const TracePoint &p) { return {p.slice.ref, p.slice.bits.lsb, p.slice.bits.width, p.side}; }
template<class T> T take(Result<T> result) {
    if (!result) throw result.error();
    return std::move(result.value());
}
void checkpoint(Cancel cancel) {
    if (cancel.stop_requested()) throw Error{ErrorCode::Cancelled, "Scenario analysis cancelled"};
}
void validate(const ScenarioRequest &r) {
    detail::validateRequest(r.common); // Validate original limits before reducing a case's time.
    if (!r.common.resolveLogic || !r.common.inputValues.empty() || r.scenarios.size() < 2 ||
        r.scenarios.size() > 8 || !r.maxMillis || r.maxMillis > 60000 ||
        !r.maxComparisons || r.maxComparisons > 100000)
        throw Error{ErrorCode::BadRequest, "Invalid scenario count, common context or scenario budget"};
    std::set<std::string> names;
    for (const auto &scenario : r.scenarios) {
        detail::validateScenarioName(scenario.name, names);
        auto composed = r.common;
        composed.inputValues = scenario.inputValues;
        detail::validateRequest(composed);
    }
}
} // namespace

Result<ScenarioReport> detail::compareScenariosWithDeadline(Design &design, const ScenarioRequest &request,
    std::chrono::steady_clock::time_point deadline, Cancel cancel) try {
    validate(request);
    checkpoint(cancel);
    ScenarioReport report;
    report.request = request;
    report.snapshot = take(design.snapshot(cancel));
    report.scope = resolveScope(design, request.common.scope, cancel).pathText;
    const auto partial = [&](const std::string &reason) {
        report.complete = false;
        if (std::find(report.reasons.begin(), report.reasons.end(), reason) == report.reasons.end())
            report.reasons.push_back(reason);
    };
    const auto tick = [&] {
        checkpoint(cancel);
        if (std::chrono::steady_clock::now() < deadline) return true;
        partial("budget_time"); return false;
    };
    for (const auto &scenario : request.scenarios) {
        ScenarioResult item{scenario.name, scenario.inputValues, {}};
        if (tick()) {
            auto composed = request.common;
            composed.inputValues = scenario.inputValues;
            const auto remaining = std::chrono::duration_cast<std::chrono::milliseconds>(
                deadline - std::chrono::steady_clock::now()).count();
            composed.maxMillis = std::min(composed.maxMillis, uint64_t(std::max(int64_t{1}, int64_t(remaining))));
            auto result = analyze(design, composed, cancel);
            if (!result) {
                auto error = result.error();
                error.message = "Scenario " + scenario.name + ": " + error.message;
                return error;
            }
            if (result->snapshot.snapshotId != report.snapshot.snapshotId)
                return Error{ErrorCode::Internal, "Design snapshot changed between scenarios"};
            if (!result->complete) partial("scenario_incomplete");
            item.report = std::move(result.value());
        } else partial("scenario_not_run");
        report.scenarios.push_back(std::move(item));
    }
    uint64_t rows = 0;
    for (size_t i = 1; i < report.scenarios.size(); ++i) {
        ScenarioComparison comparison; comparison.scenario = i;
        // The map key is the complete public point tuple, never the opaque ref's encoding.
        struct Pair { TracePoint point; std::optional<size_t> base, other; };
        std::map<Key, Pair> points;
        const auto *base = report.scenarios[0].report ? &*report.scenarios[0].report : nullptr;
        const auto *other = report.scenarios[i].report ? &*report.scenarios[i].report : nullptr;
        for (const auto *r : {base, other}) {
            if (!r) continue;
            for (size_t j = 0; j < r->checks.size(); ++j) {
                if (!tick()) break;
                const auto &point = r->checks[j].point;
                auto [it, inserted] = points.try_emplace(key(point), Pair{point, {}, {}});
                (void)inserted;
                (r == base ? it->second.base : it->second.other) = j;
            }
        }
        for (const auto &[pointKey, pair] : points) {
            (void)pointKey;
            if (!tick()) break;
            if (rows >= request.maxComparisons) { partial("budget_comparisons"); break; }
            ScenarioControl row;
            row.point = pair.point; row.baselineCheck = pair.base; row.scenarioCheck = pair.other;
            if (pair.base) row.baselineSource = detail::projectSource(base->checks[*pair.base], tick);
            else row.reasons.push_back("baseline_missing");
            if (pair.other) row.scenarioSource = detail::projectSource(other->checks[*pair.other], tick);
            else row.reasons.push_back("scenario_missing");
            if (pair.base && !row.baselineSource) row.reasons.push_back("baseline_unresolved");
            if (pair.other && !row.scenarioSource) row.reasons.push_back("scenario_unresolved");
            if (row.baselineSource && row.scenarioSource)
                row.status = detail::sameSource(*row.baselineSource, *row.scenarioSource) ? "unchanged" : "changed";
            else { row.status = "unresolved"; partial("comparison_unresolved"); }
            comparison.controls.push_back(std::move(row)); ++rows;
        }
        report.comparisons.push_back(std::move(comparison));
    }
    (void)tick(); // Even a batch with no comparison rows observes an overrun.
    return report;
} catch (const Error &error) { return error; }

Result<ScenarioReport> compareScenarios(Design &design, const ScenarioRequest &request, Cancel cancel) {
    // Validate before chrono conversion so an untrusted uint64 budget cannot overflow it.
    try { validate(request); } catch (const Error &error) { return error; }
    return detail::compareScenariosWithDeadline(design, request,
        std::chrono::steady_clock::now() + std::chrono::milliseconds(int64_t(request.maxMillis)), cancel);
}
} // namespace dft::sequential
