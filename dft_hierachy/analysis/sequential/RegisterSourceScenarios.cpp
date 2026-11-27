#include "RegisterSourceScenariosInternal.h"
#include "RegisterGenerationScenariosInternal.h"
#include "RegisterControlSourcesInternal.h"
#include "SourceIdentity.h"
#include "IntervalCoverage.h"
#include "SourceCoverage.h"
#include <algorithm>
#include <map>
namespace dft::sequential {
namespace {
using namespace hier;
using Time=std::chrono::steady_clock::time_point;
using Union=detail::CanonicalSourceCoverage;
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Register source scenarios cancelled"};}
class Batch {
    const RegisterStatistics &s_;
    RegisterSourceScenarioReport out_;
    Time end_;
    Cancel cancel_;
    std::map<detail::SourceKey,size_t> keys_;
    std::vector<RegisterSourceMatrixRow> candidates_;
    void partial(const std::string &r) {out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),r)==out_.reasons.end()) out_.reasons.push_back(r);}
    bool time() {checkpoint(cancel_);if(std::chrono::steady_clock::now()<end_) return true;partial("budget_source_scenario_time");return false;}
    bool spend() {
        if(!time()) return false;
        if(out_.work>=out_.limits.maxWork) {partial("budget_source_scenario_work");return false;}
        ++out_.work;return true;
    }
    uint64_t remaining(uint64_t cap) const {
        const auto ms=std::chrono::duration_cast<std::chrono::milliseconds>(end_-std::chrono::steady_clock::now()).count();
        return std::min(cap,uint64_t(std::max(int64_t{1},int64_t(ms))));
    }
    void contexts() {
        out_.scenarios.resize(out_.analysis.scenarios.size());
        for(size_t i=0;i<out_.scenarios.size();++i) {
            auto &dest=out_.scenarios[i];const auto &g=out_.analysis.scenarios[i].generation;
            if(!g) {dest.reasons.push_back("generation_not_run");partial("sources_not_run");continue;}
            if(!time()) {dest.reasons.push_back("budget_source_scenario_time");partial("sources_not_run");continue;}
            auto l=out_.limits.sources;l.fanout.maxMillis=remaining(l.fanout.maxMillis);l.maxMillis=remaining(l.maxMillis);
            auto r=detail::sourcesBefore(s_,*out_.analysis.analysis.scenarios[i].profile,*g,l,end_,cancel_);
            if(!r) {auto e=r.error();e.message="Register source scenario "+out_.analysis.analysis.scenarios[i].name+": "+e.message;throw e;}
            dest.sources=std::move(*r);if(!dest.sources->complete) partial("source_context_incomplete");
        }
    }
    void index() {
        for(size_t si=0;si<out_.scenarios.size();++si) {
            const auto &context=out_.scenarios[si].sources;if(!context) continue;
            for(size_t gi=0;gi<context->groups.size();++gi) {
                if(!spend()) {out_.indexComplete=false;out_.inputSources=candidates_.size();partial("source_index_unfinished");return;}
                const auto &source=context->groups[gi].source;const auto key=detail::sourceKey(source);
                auto [it,fresh]=keys_.try_emplace(key,candidates_.size());
                if(fresh) {RegisterSourceMatrixRow row;row.source=source;row.groups.resize(out_.scenarios.size());candidates_.push_back(std::move(row));}
                candidates_[it->second].groups[si]=gi;++out_.indexedGroups;
            }
        }
        out_.inputSources=candidates_.size();
    }
    bool canonical(const RegisterSourceGroup &group,Union &value,uint64_t &intervals) {
        return detail::canonicalSourceCoverage(group,value,[&] {return spend();},[&] {
            if(intervals>=out_.limits.maxIntervals-out_.intervals) {partial("budget_source_scenario_intervals");return false;}
            ++intervals;return true;
        });
    }
    void matrix() {
        for(const auto &input:candidates_) {
            if(out_.rows.size()>=out_.limits.maxRows) {partial("budget_source_scenario_rows");break;}
            if(input.groups.size()>out_.limits.maxCells-out_.cells) {partial("budget_source_scenario_cells");break;}
            if(!spend()) break;
            auto row=input;std::vector<Union> values(out_.scenarios.size());std::vector<bool> known(out_.scenarios.size());uint64_t intervals=0;bool all=true;
            for(size_t i=0;i<out_.scenarios.size();++i) {
                if(!spend()) {all=false;break;}
                const auto &v=out_.scenarios[i].sources;known[i]=out_.indexComplete&&v&&v->complete;
                if(known[i]&&row.groups[i]&&!canonical(v->groups[*row.groups[i]],values[i],intervals)) {all=false;break;}
            }
            if(!all) break;
            for(size_t i=1;i<out_.scenarios.size();++i) {
                if(!spend()) {all=false;break;}
                const auto status=!known[0]||!known[i]?"unresolved":values[0]==values[i]?"unchanged":"changed";
                if(!known[0]||!known[i]) partial("source_coverage_unresolved");row.status.emplace_back(status);
            }
            if(!all) break;
            out_.cells+=row.groups.size();out_.intervals+=intervals;out_.rows.push_back(std::move(row));
        }
        if(!out_.indexComplete||out_.rows.size()!=out_.inputSources) partial("source_matrix_unfinished");
    }
  public:
    Batch(const RegisterStatistics &s,RegisterGenerationScenarioReport input,const RegisterSourceScenarioLimits &l,Time end,Cancel c)
        :s_(s),end_(end),cancel_(c) {out_.analysis=std::move(input);out_.limits=l;}
    RegisterSourceScenarioReport run() {
        checkpoint(cancel_);if(!out_.analysis.complete) partial("analysis_incomplete");contexts();index();matrix();(void)time();return std::move(out_);
    }
};
Result<RegisterSourceScenarioReport> execute(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &request,
    const RegisterSourceScenarioLimits &l,std::optional<Time> end,Cancel c) try {
    detail::validateRegisterSourceScenarioLimits(l);checkpoint(c);
    auto input=compareRegisterGenerationScenarios(d,s,request,l.generation,c);if(!input) return input.error();
    return Batch(s,std::move(*input),l,end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.maxMillis))),c).run();
} catch(const Error &e) {return e;}
}
void detail::validateRegisterSourceScenarioLimits(const RegisterSourceScenarioLimits &l) {
    validateRegisterGenerationScenarioLimits(l.generation);validateRegisterSourceLimits(l.sources);
    if(!l.maxRows||l.maxRows>100000||!l.maxCells||l.maxCells>1000000||!l.maxIntervals||l.maxIntervals>2000000||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Invalid register source scenario budget"};
}
Result<RegisterSourceScenarioReport> detail::sourceScenariosWithDeadline(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceScenarioLimits &l,Time end,Cancel c) {return execute(d,s,r,l,end,c);}
Result<RegisterSourceScenarioReport> compareRegisterSourceScenarios(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceScenarioLimits &l,Cancel c) {return execute(d,s,r,l,{},c);}
}
