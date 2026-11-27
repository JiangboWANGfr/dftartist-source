#include "RegisterControlProfileInternal.h"
#include "RegisterEventGroupsInternal.h"
#include "CheckInternal.h"
#include "ControlResolver.h"
#include "PrimaryInputs.h"
#include "SourceIdentity.h"
#include "IntervalCoverage.h"
#include <algorithm>
#include <map>
#include <set>

namespace dft::sequential {
namespace {
using namespace hier;
using namespace hier::model;
template<class T> T take(Result<T> r) { if (!r) throw r.error(); return std::move(r.value()); }
void checkpoint(Cancel c) { if (c.stop_requested()) throw Error{ErrorCode::Cancelled, "Register control profiling cancelled"}; }
Request resolutionRequest(const RegisterControlOptions &o, const std::string &scope) {
    Request r; r.scope = scope; r.resolveLogic = o.resolveLogic; r.clockRoots = o.clockRoots; r.inputValues = o.inputValues;
    r.maxChecks = o.maxChecks; r.maxTraceNodes = o.maxTraceNodes; r.maxTraceEdges = o.maxTraceEdges;
    r.maxDepth = o.maxDepth; r.maxLogicWork = o.maxLogicWork; r.maxMillis = o.maxMillis; return r;
}
class Profile {
    Design &design_;
    const RegisterStatistics &input_;
    RegisterControlProfile out_;
    Request request_;
    std::chrono::steady_clock::time_point deadline_;
    Cancel cancel_;
    std::set<std::string> tops_;
    using PointKey = std::tuple<std::string, uint64_t, uint64_t>;
    std::map<PointKey, size_t> checks_;
    std::map<std::pair<detail::SourceKey, std::string>, size_t> cohorts_;
    std::map<std::pair<size_t, size_t>, size_t> pairs_;
    void partial(const std::string &s) {
        out_.complete = false;
        if (std::find(out_.reasons.begin(), out_.reasons.end(), s) == out_.reasons.end()) out_.reasons.push_back(s);
    }
    bool time() {
        checkpoint(cancel_); if (std::chrono::steady_clock::now() < deadline_) return true;
        partial("budget_time"); return false;
    }
    bool spend() {
        if (!time()) return false;
        if (out_.work >= out_.options.maxWork) { partial("budget_work"); return false; }
        ++out_.work; return true;
    }
    std::optional<size_t> check(const EventInfo &event) {
        if (!spend()) return {};
        const PointKey key{event.signal, event.bits.lsb, event.bits.width};
        if (const auto it = checks_.find(key); it != checks_.end()) return it->second;
        if (out_.checks.size() >= out_.options.maxChecks) { partial("budget_checks"); return {}; }
        auto control = detail::resolveControl(event, {design_, request_, tops_, out_.clockRoots, out_.inputValues,
            out_.traceNodes, out_.traceEdges, out_.logicWork, deadline_, cancel_});
        for (const auto &reason : control.reasons) if (reason.starts_with("budget_")) partial(reason);
        auto source = detail::projectSource(control, [&] { return spend(); });
        if (!source) partial("source_unresolved");
        const auto index = out_.checks.size(); checks_.emplace(key, index);
        out_.checks.push_back({std::move(control), std::move(source)}); return index;
    }
    void controls() {
        for (size_t i = 0; i < out_.events.groups.size(); ++i) {
            if (!spend()) break;
            const auto &g = out_.events.groups[i]; GroupControls row; row.group = i; row.asyncChecks.resize(g.async.size());
            row.clockCheck = check(g.clock);
            if (row.clockCheck) {
                ++out_.visitedEvents; row.eventsComplete = true;
                for (size_t j = 0; j < g.async.size(); ++j) {
                    row.asyncChecks[j] = check(g.async[j]);
                    if (!row.asyncChecks[j]) { row.eventsComplete = false; break; }
                    ++out_.visitedEvents;
                }
            }
            if (row.eventsComplete) ++out_.processedGroups;
            const bool finished = row.eventsComplete;
            out_.groupControls.push_back(std::move(row));
            if (!finished) break;
        }
        if (out_.processedGroups != out_.events.groups.size()) partial("events_unfinished");
    }
    const RegisterInfo &fact(size_t f) const {
        const auto &v = input_.facts[f]; return input_.pages[v.page].response.result.items[v.item];
    }
    void collect() {
        bool stopped = false;
        for (auto &row : out_.groupControls) {
            if (!spend()) break;
            if (!row.clockCheck || !out_.checks[*row.clockCheck].source) continue;
            const auto &source = *out_.checks[*row.clockCheck].source; const auto &group = out_.events.groups[row.group];
            auto [it, inserted] = cohorts_.try_emplace({detail::sourceKey(source), group.clock.edge}, out_.cohorts.size());
            if (inserted) out_.cohorts.push_back({source, group.clock.edge, {}, {}, {}});
            const auto cohort = it->second; row.cohort = cohort; auto &c = out_.cohorts[cohort]; c.groups.push_back(row.group);
            for (const auto pair : group.signals) {
                if (!spend()) { stopped = true; break; }
                const auto &s = out_.events.signals[pair];
                for (const auto f : s.facts) {
                    if (!spend()) { stopped = true; break; }
                    if (out_.attributedFacts >= out_.options.maxMembers) { partial("budget_members"); stopped = true; break; }
                    auto [p, fresh] = pairs_.try_emplace({cohort, s.signal}, out_.signals.size());
                    if (fresh) { out_.signals.push_back({cohort, s.signal, {}, {}}); c.signals.push_back(p->second); ++c.totals.signals; }
                    out_.signals[p->second].facts.push_back(f); ++out_.attributedFacts; ++c.totals.facts;
                    c.totals.factBits = detail::checkedCountAdd(c.totals.factBits, fact(f).bits.width);
                }
                if (stopped) break;
            }
            if (stopped) break;
        }
    }
    void coverage() {
        for (auto &s : out_.signals) {
            if (!spend()) break;
            std::vector<BitRange> ranges;
            for (const auto f : s.facts) { if (!spend()) break; ranges.push_back(fact(f).bits); }
            if (ranges.size() != s.facts.size()) break;
            bool interrupted = false;
            auto value = detail::coverageForIntervals(ranges, out_.options.maxSegments - out_.segmentCount, [&] {
                if (spend()) return true; interrupted = true; return false;
            });
            if (!value) { if (!interrupted) partial("budget_segments"); break; }
            auto &t = out_.cohorts[s.cohort].totals; ++t.summarizedSignals; t.summarizedFacts += s.facts.size();
            t.coveredBits = detail::checkedCountAdd(t.coveredBits, value->coveredBits);
            t.overlapBits = detail::checkedCountAdd(t.overlapBits, value->overlapBits);
            t.maxMultiplicity = std::max(t.maxMultiplicity, value->maxMultiplicity);
            out_.segmentCount += value->segments.size(); s.coverage = std::move(value);
        }
        if (std::any_of(out_.signals.begin(), out_.signals.end(), [](const auto &s) { return !s.coverage; })) partial("cohort_coverage_unfinished");
    }
  public:
    Profile(Design &design, const RegisterStatistics &input, RegisterEventGroups events, const RegisterControlOptions &options,
        std::chrono::steady_clock::time_point deadline, Cancel cancel)
        : design_(design), input_(input), request_(resolutionRequest(options, input.scope)), deadline_(deadline), cancel_(cancel) {
        out_.snapshotId = input.snapshot.snapshotId; out_.scope = input.scope; out_.options = options; out_.events = std::move(events);
    }
    RegisterControlProfile run() {
        checkpoint(cancel_); if (!out_.events.complete) partial("event_groups_incomplete");
        for (const auto &top : take(design_.roots(cancel_))) tops_.insert(top.ref);
        out_.clockRoots = take(detail::resolvePrimaryInputs(design_, out_.options.clockRoots, tops_, deadline_, cancel_, detail::InputPurpose::ClockRoot));
        std::vector<PrimaryInputRequest> requests;
        for (const auto &v : out_.options.inputValues) requests.push_back(v.input);
        auto inputs = take(detail::resolvePrimaryInputs(design_, requests, tops_, deadline_, cancel_, detail::InputPurpose::Value));
        for (size_t i = 0; i < inputs.size(); ++i) out_.inputValues.push_back({std::move(inputs[i]), out_.options.inputValues[i].high});
        controls(); collect(); coverage(); (void)time(); return std::move(out_);
    }
};
Result<RegisterControlProfile> execute(Design &d, const RegisterStatistics &s, const RegisterControlOptions &o,
    std::optional<std::chrono::steady_clock::time_point> deadline, Cancel cancel) try {
    detail::validateRegisterControlOptions(o); checkpoint(cancel);
    if (take(d.snapshot(cancel)).snapshotId != s.snapshot.snapshotId)
        return Error{ErrorCode::BadRequest, "Register statistics must belong to this Design snapshot"};
    auto groups = take(groupRegisterEvents(s, o.eventGroups, cancel));
    const auto until = deadline.value_or(std::chrono::steady_clock::now() + std::chrono::milliseconds(int64_t(o.maxMillis)));
    return detail::profileFromEvents(d, s, std::move(groups), o, until, cancel);
} catch (const Error &e) { return e; }
}
void detail::validateRegisterControlOptions(const RegisterControlOptions &o) {
    validateEventGroupLimits(o.eventGroups); validateRequest(resolutionRequest(o, "statistics"));
    if (!o.maxLogicWork || o.maxLogicWork > 1000000 || !o.maxWork || o.maxWork > 10000000 || !o.maxMembers || o.maxMembers > 1000000 || !o.maxSegments || o.maxSegments > 2000000)
        throw Error{ErrorCode::BadRequest, "Invalid register control profile budget"};
}
Result<RegisterControlProfile> detail::profileFromEvents(Design &d, const RegisterStatistics &s, RegisterEventGroups groups,
    const RegisterControlOptions &o, std::chrono::steady_clock::time_point deadline, Cancel cancel) try {
    return Profile(d,s,std::move(groups),o,deadline,cancel).run();
} catch (const Error &e) { return e; }
Result<RegisterControlProfile> detail::profileWithDeadline(Design &d, const RegisterStatistics &s,
    const RegisterControlOptions &o, std::chrono::steady_clock::time_point deadline, Cancel cancel) { return execute(d, s, o, deadline, cancel); }
Result<RegisterControlProfile> profileRegisterControls(Design &d, const RegisterStatistics &s, const RegisterControlOptions &o, Cancel cancel) {
    return execute(d, s, o, {}, cancel);
}
}
