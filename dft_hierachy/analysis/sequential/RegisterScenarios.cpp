#include "RegisterScenariosInternal.h"
#include "RegisterControlProfileInternal.h"
#include "RegisterResolvedEventsInternal.h"
#include "ScenariosInternal.h"
#include "ResolvedEventIdentity.h"
#include "ChangedRegisterCoverage.h"
#include <algorithm>
#include <map>
#include <set>

namespace dft::sequential {
namespace {
using namespace hier;
using namespace hier::model;
template<class T> T take(Result<T> v) { if (!v) throw v.error(); return std::move(v.value()); }
template<class T> T scenarioValue(Result<T> v,const std::string &name) {
    if (!v) {auto e=v.error();e.message="Register scenario "+name+": "+e.message;throw e;}
    return std::move(v.value());
}
void checkpoint(Cancel c) { if (c.stop_requested()) throw Error{ErrorCode::Cancelled,"Register scenario analysis cancelled"}; }
class Batch {
    Design &design_;
    const RegisterStatistics &statistics_;
    RegisterScenarioReport out_;
    std::chrono::steady_clock::time_point deadline_;
    Cancel cancel_;
    void partial(const std::string &why) {
        out_.complete=false;
        if (std::find(out_.reasons.begin(),out_.reasons.end(),why)==out_.reasons.end()) out_.reasons.push_back(why);
    }
    void partial(RegisterScenarioComparison &c,const std::string &why) {
        c.complete=false;
        if (std::find(c.reasons.begin(),c.reasons.end(),why)==c.reasons.end()) c.reasons.push_back(why);
        partial(why);
    }
    bool time() {
        checkpoint(cancel_); if (std::chrono::steady_clock::now()<deadline_) return true;
        partial("budget_time");return false;
    }
    bool spend() {
        if (!time()) return false;
        if (out_.work>=out_.request.maxWork) {partial("budget_work");return false;}
        ++out_.work;return true;
    }
    uint64_t remaining(uint64_t limit) const {
        const auto ms=std::chrono::duration_cast<std::chrono::milliseconds>(deadline_-std::chrono::steady_clock::now()).count();
        return std::min(limit,uint64_t(std::max(int64_t{1},int64_t(ms))));
    }
    void scenarios() {
        for (const auto &scenario:out_.request.scenarios) {
            RegisterScenarioResult item{scenario.name,scenario.inputValues,{}, {}, {}};
            if (time()) {
                auto options=out_.request.common;options.inputValues=scenario.inputValues;options.maxMillis=remaining(options.maxMillis);
                const auto until=std::min(deadline_,std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(options.maxMillis)));
                item.profile=scenarioValue(detail::profileFromEvents(design_,statistics_,out_.events,options,until,cancel_),scenario.name);
                if (!item.profile->complete) partial("scenario_incomplete");
                if (time()) {
                    auto limits=out_.request.resolved;limits.maxMillis=remaining(limits.maxMillis);
                    item.resolved=scenarioValue(groupResolvedRegisterEvents(statistics_,*item.profile,limits,cancel_),scenario.name);
                    if (!item.resolved->complete) partial("scenario_incomplete");
                } else {item.reasons.push_back("budget_time_before_resolved");partial("scenario_incomplete");}
            } else {item.reasons.push_back("budget_time");partial("scenario_not_run");}
            out_.scenarios.push_back(std::move(item));
        }
    }
    detail::ChangedRegisterCoverage coverageContext(RegisterScenarioComparison &c) {
        return {statistics_,out_.events,c.changedSignals,c.changedTotals,out_.request.maxMembers,out_.request.maxSegments,
            out_.memberFacts,out_.segmentCount,[&] {return spend();},[&](const std::string &r) {partial(r);},
            [&](const std::string &r) {partial(c,r);}};
    }
    void collect(RegisterScenarioComparison &c) {
        std::vector<size_t> groups;for (const auto &row:c.rows) if(row.status=="changed") groups.push_back(row.rawGroup);
        auto context=coverageContext(c);detail::collectChangedFacts(context,groups);
    }
    void coverage(RegisterScenarioComparison &c) {auto context=coverageContext(c);detail::summarizeChangedFacts(context);}
    void compare(size_t index) {
        RegisterScenarioComparison c;c.scenario=index;c.inputGroups=out_.events.groups.size();
        const auto &base=out_.scenarios[0];const auto &other=out_.scenarios[index];
        if (!base.resolved) partial(c,"baseline_not_resolved");
        if (!other.resolved) partial(c,"scenario_not_resolved");
        if (!base.resolved||!other.resolved) {out_.comparisons.push_back(std::move(c));return;}
        if (!statistics_.complete||!out_.events.complete||!base.resolved->complete||!other.resolved->complete)
            partial(c,"scenario_analysis_incomplete");
        const auto group=[](const RegisterResolvedEvents &report,size_t raw)->std::optional<size_t> {
            if (raw>=report.rows.size()) return {};
            return report.rows[raw].resolvedGroup;
        };
        for (size_t raw=0;raw<out_.events.groups.size();++raw) {
            if (!spend()) break;
            if (out_.comparisonRows>=out_.request.maxComparisons) {partial("budget_comparisons");break;}
            RegisterScenarioRow row;row.rawGroup=raw;row.baselineGroup=group(*base.resolved,raw);row.scenarioGroup=group(*other.resolved,raw);
            if (!row.baselineGroup) row.reasons.push_back("baseline_unresolved");
            if (!row.scenarioGroup) row.reasons.push_back("scenario_unresolved");
            if (row.baselineGroup&&row.scenarioGroup) {
                const auto &a=base.resolved->groups[*row.baselineGroup];const auto &b=other.resolved->groups[*row.scenarioGroup];
                const auto ka=detail::resolvedEventKey(a.clock,a.async,[&] {return spend();});if (!ka) break;
                const auto kb=detail::resolvedEventKey(b.clock,b.async,[&] {return spend();});if (!kb) break;
                row.status=*ka==*kb ? "unchanged" : "changed";
            } else {row.status="unresolved";partial(c,"event_comparison_unresolved");}
            c.rows.push_back(std::move(row));++out_.comparisonRows;
        }
        if (c.rows.size()!=c.inputGroups) partial(c,"comparisons_unfinished");
        collect(c);coverage(c);out_.comparisons.push_back(std::move(c));
    }
  public:
    Batch(Design &d,const RegisterStatistics &s,RegisterEventGroups events,const RegisterScenarioRequest &r,
        std::chrono::steady_clock::time_point deadline,Cancel cancel):design_(d),statistics_(s),deadline_(deadline),cancel_(cancel) {
        out_.snapshotId=s.snapshot.snapshotId;out_.scope=s.scope;out_.request=r;out_.events=std::move(events);
        out_.scenarios.reserve(r.scenarios.size());
    }
    RegisterScenarioReport run() {
        checkpoint(cancel_);if (!statistics_.complete||!out_.events.complete) partial("shared_analysis_incomplete");
        scenarios();for (size_t i=1;i<out_.scenarios.size();++i) compare(i);(void)time();return std::move(out_);
    }
};
Result<RegisterScenarioReport> execute(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    std::optional<std::chrono::steady_clock::time_point> deadline,Cancel cancel) try {
    detail::validateRegisterScenarioRequest(r);checkpoint(cancel);
    if (take(d.snapshot(cancel)).snapshotId!=s.snapshot.snapshotId)
        return Error{ErrorCode::BadRequest,"Register scenario statistics must belong to this Design snapshot"};
    auto events=take(groupRegisterEvents(s,r.common.eventGroups,cancel));
    const auto until=deadline.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(r.maxMillis)));
    return Batch(d,s,std::move(events),r,until,cancel).run();
} catch(const Error &e) {return e;}
}
void detail::validateRegisterScenarioRequest(const RegisterScenarioRequest &r) {
    validateRegisterControlOptions(r.common);validateResolvedEventLimits(r.resolved);
    if (!r.common.resolveLogic||!r.common.inputValues.empty()||r.scenarios.size()<2||r.scenarios.size()>8||
        !r.maxMillis||r.maxMillis>60000||!r.maxComparisons||r.maxComparisons>100000||!r.maxWork||r.maxWork>10000000||
        !r.maxMembers||r.maxMembers>1000000||!r.maxSegments||r.maxSegments>2000000)
        throw Error{ErrorCode::BadRequest,"Invalid register scenario context, count or budget"};
    std::set<std::string> names;
    for (const auto &scenario:r.scenarios) {
        validateScenarioName(scenario.name,names);auto composed=r.common;composed.inputValues=scenario.inputValues;
        validateRegisterControlOptions(composed);
    }
}
Result<RegisterScenarioReport> detail::registerScenariosWithDeadline(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    std::chrono::steady_clock::time_point deadline,Cancel c) {return execute(d,s,r,deadline,c);}
Result<RegisterScenarioReport> compareRegisterScenarios(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,Cancel c) {
    return execute(d,s,r,{},c);
}
}
