#include "CellPlanInternal.h"
#include "../common/Utf8.h"
#include <algorithm>
#include <map>
#include <tuple>

namespace dft::wrapper {
namespace {
using namespace hier;
using namespace hier::model;
constexpr uint64_t safe=9007199254740991ULL;
void cancelCheck(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Wrapper planning cancelled"};}
void bad(const char *m) {throw Error{ErrorCode::BadRequest,m};}
template<class T> T take(Result<T> r) {if(!r)throw r.error();return std::move(r.value());}
uint64_t checkedAdd(uint64_t a,uint64_t b) {
    if(a>safe || b>safe-a) throw Error{ErrorCode::BadRequest,"Wrapper count exceeds safe integer range"};return a+b;
}
void reason(std::vector<std::string> &v,const std::string &s) {if(std::find(v.begin(),v.end(),s)==v.end())v.push_back(s);}
void validate(const CellPlanRequest &r,Cancel c) {
    cancelCheck(c);take(validateBoundaryRequest(r.boundary,c));
    if(!r.policy.maxInputCandidates || r.policy.maxInputCandidates>1000000 || !r.policy.maxOutputCandidates || r.policy.maxOutputCandidates>1000000)bad("Candidate limits must be 1..1000000");
    if(!r.limits.maxRows || r.limits.maxRows>100000 || !r.limits.maxWork || r.limits.maxWork>10000000 || !r.limits.maxMillis || r.limits.maxMillis>60000)bad("Planning limit out of range");
    if(r.rules.size()>10000)bad("Too many wrapper rules");size_t bytes=0;
    using Interval=std::tuple<std::string,bool,uint64_t,uint64_t>;
    std::vector<Interval> ranges;
    for(const auto &rule:r.rules) {
        cancelCheck(c);const auto &s=rule.port;bytes+=s.size();
        if(s.empty() || s.size()>4096 || bytes>1024*1024 || s.find('\0')!=std::string::npos || !dft::detail::validUtf8(s))bad("Invalid wrapper rule port");
        if(rule.direction!=CellDirection::Input && rule.direction!=CellDirection::Output && rule.direction!=CellDirection::Both)bad("Invalid wrapper rule direction");
        if(rule.action!=CellAction::Exclude && rule.action!=CellAction::Dedicated && rule.action!=CellAction::Share)bad("Invalid wrapper rule action");
        if(rule.bits && !rule.bits->width)bad("Wrapper rule width must be positive");
        const auto begin=rule.bits?rule.bits->lsb:0,end=rule.bits?checkedAdd(rule.bits->lsb,rule.bits->width):safe;
        for(bool back:{false,true})if(rule.direction==CellDirection::Both || (back==(rule.direction==CellDirection::Output)))ranges.emplace_back(s,back,begin,end);
    }
    std::sort(ranges.begin(),ranges.end());cancelCheck(c);
    for(size_t i=1;i<ranges.size();++i) {
        cancelCheck(c);const auto &[p,d,b,e]=ranges[i];const auto &[pp,dd,bb,ee]=ranges[i-1];(void)e;(void)bb;
        if(p==pp && d==dd && b<ee)bad("Overlapping wrapper rules");
    }
}
struct Stop {std::string reason;};
class Planner {
    const BoundaryReport &source_;
    CellPlan out_;
    Cancel cancel_;
    std::chrono::steady_clock::time_point deadline_;
    std::map<std::string,std::vector<size_t>> rules_;
    std::vector<bool> used_;
    std::map<std::string,size_t> shared_;
    void checkpoint() {cancelCheck(cancel_);if(std::chrono::steady_clock::now()>=deadline_)throw Stop{"budget_time"};}
    void tick() {checkpoint();if(out_.work==out_.limits.maxWork)throw Stop{"budget_work"};++out_.work;}
    void partial(const std::string &r) {out_.complete=false;reason(out_.reasons,r);}
    std::vector<BitRange> merge(const std::vector<BitRange> &a,const std::vector<BitRange> &b={}) {
        std::vector<BitRange> ranges;
        for(const auto *v:{&a,&b})for(const auto &r:*v){tick();checkedAdd(r.lsb,r.width);ranges.push_back(r);}
        std::sort(ranges.begin(),ranges.end(),[](auto x,auto y){return std::tie(x.lsb,x.width)<std::tie(y.lsb,y.width);});checkpoint();
        std::vector<BitRange> result;
        for(const auto &r:ranges) {
            tick();
            if(!result.empty() && r.lsb<=checkedAdd(result.back().lsb,result.back().width))
                result.back().width=std::max(checkedAdd(r.lsb,r.width),checkedAdd(result.back().lsb,result.back().width))-result.back().lsb;
            else result.push_back(r);
        }
        return result;
    }
    uint64_t count(const std::vector<BitRange> &ranges) {uint64_t total=0;for(const auto &r:ranges){checkpoint();total=checkedAdd(total,r.width);}return total;}
    CellPlanRow row(size_t index) {
        tick();const auto &s=source_.rows[index];CellPlanRow result;result.sourceRow=index;
        const auto &port=source_.ports.at(s.port);
        if(auto it=rules_.find(port.name);it!=rules_.end())for(auto i:it->second) {
            tick();const auto &r=out_.rules[i];
            if(r.direction!=CellDirection::Both && s.upstream!=(r.direction==CellDirection::Output))continue;
            if(r.bits && (s.bit<r.bits->lsb || s.bit-r.bits->lsb>=r.bits->width))continue;
            result.rule=i;break;
        }
        std::map<std::string,CellCandidate> candidates;bool control=false,other=false,nonData=false;
        for(size_t t=0;t<s.terminals.size();++t) {
            tick();const auto &term=s.terminals[t];
            if(term.kind=="register_data" || term.kind=="register_output") {
                const auto &h=s.steps.at(term.step).response.result.hops.at(term.hop.value());
                const auto slice=term.kind=="register_output"?h.from:h.next.at(term.continuation.value()).slice;
                auto &candidate=candidates[slice.ref];candidate.signal=slice.ref;candidate.ranges.push_back(slice.bits);candidate.terminals.push_back(t);
                if(term.kind=="register_data") {const auto &n=h.next.at(*term.continuation);nonData|=n.precision!="exact" || n.align!="bitwise";}
            } else if(term.kind=="register_clock" || term.kind=="register_control" || term.kind=="register_async") control=true;
            else other=true;
        }
        for(const auto &step:s.steps)for(const auto &h:step.response.result.hops) {
            tick();
            if(h.kind!="process" && h.kind!="binding_up" && h.kind!="binding_down")continue;
            for(const auto &n:h.next) {tick();nonData|=n.role!="data" || n.precision!="exact" || n.align!="bitwise";}
        }
        for(auto &[signal,candidate]:candidates) {
            (void)signal;candidate.ranges=merge(candidate.ranges);candidate.bits=count(candidate.ranges);
            result.candidateBits=checkedAdd(result.candidateBits,candidate.bits);result.candidates.push_back(std::move(candidate));
        }
        const auto action=result.rule?std::optional<CellAction>{out_.rules[*result.rule].action}:std::nullopt;
        if(action==CellAction::Exclude) {result.decision="excluded";result.reason="declared_exclude";}
        else if(action==CellAction::Dedicated) {result.decision="dedicated";result.reason="declared_dedicated";}
        else if(!s.complete || s.hasConservative) {result.decision="blocked";result.reason="evidence_partial";}
        else if(control) {result.decision="blocked";result.reason="control_usage";}
        else if(nonData) {result.decision="blocked";result.reason="non_data_path";}
        else if(other || !result.candidateBits) {result.decision=action==CellAction::Share?"blocked":"dedicated";result.reason="no_register_candidate";}
        else if(result.candidateBits>(s.upstream?out_.policy.maxOutputCandidates:out_.policy.maxInputCandidates)) {result.decision=action==CellAction::Share?"blocked":"dedicated";result.reason="candidate_limit";}
        else {result.decision="shared_candidate";result.reason="data_candidates";}
        return result;
    }
    void commit(CellPlanRow value) {
        auto counts=out_.counts;const auto &sourceRow=source_.rows[value.sourceRow];
        if(sourceRow.upstream)++counts.outputRows;else ++counts.inputRows;
        if(value.decision=="excluded")++counts.excluded;
        else if(value.decision=="dedicated") {++counts.dedicated;++counts.addedCells;}
        else if(value.decision=="blocked")++counts.blocked;
        // Stage only ranges/bits for affected signals; never copy growing global row lists.
        std::vector<SharedCellSignal> updates;
        if(value.decision=="shared_candidate") {
            ++counts.sharedCandidate;counts.sharedCandidateBits=checkedAdd(counts.sharedCandidateBits,value.candidateBits);
            for(const auto &candidate:value.candidates) {
                SharedCellSignal update;update.signal=candidate.signal;
                const auto it=shared_.find(candidate.signal);
                if(it==shared_.end())update.ranges=merge(candidate.ranges);
                else {const auto &old=out_.sharedSignals[it->second];counts.uniqueSharedBits-=old.bits;update.ranges=merge(old.ranges,candidate.ranges);}
                update.bits=count(update.ranges);counts.uniqueSharedBits=checkedAdd(counts.uniqueSharedBits,update.bits);updates.push_back(std::move(update));
            }
        }
        checkpoint();const auto index=out_.rows.size();
        for(auto &update:updates) {
            auto it=shared_.find(update.signal);
            if(it==shared_.end()) {shared_.emplace(update.signal,out_.sharedSignals.size());update.rows.push_back(index);out_.sharedSignals.push_back(std::move(update));}
            else {auto &dest=out_.sharedSignals[it->second];dest.ranges=std::move(update.ranges);dest.bits=update.bits;dest.rows.push_back(index);}
        }
        if(value.rule)used_[*value.rule]=true;
        if(value.decision=="blocked")partial("blocked_row");
        out_.counts=counts;out_.rows.push_back(std::move(value));
    }
  public:
    Planner(const BoundaryReport &source,const CellPlanRequest &r,std::chrono::steady_clock::time_point deadline,Cancel c)
        :source_(source),cancel_(c),deadline_(deadline),used_(r.rules.size(),false) {
        out_.policy=r.policy;out_.rules=r.rules;out_.limits=r.limits;
        if(!source.complete)partial("source_partial");
    }
    CellPlan run() {
        // Bounds on known selected ports are input errors, even when the source is partial.
        std::map<std::string,uint64_t> widths;
        for(const auto &p:source_.ports) {cancelCheck(cancel_);widths.emplace(p.name,p.width);}
        for(size_t i=0;i<out_.rules.size();++i) {
            cancelCheck(cancel_);const auto &r=out_.rules[i];const auto found=widths.find(r.port);
            if(r.bits && found!=widths.end() && checkedAdd(r.bits->lsb,r.bits->width)>found->second)bad("Wrapper rule range exceeds selected port width");
        }
        size_t at=0;
        try {
            checkpoint();
            for(size_t i=0;i<out_.rules.size();++i){checkpoint();rules_[out_.rules[i].port].push_back(i);}
            for(;at<source_.rows.size();++at) {
                checkpoint();if(out_.rows.size()==out_.limits.maxRows)throw Stop{"budget_rows"};commit(row(at));
            }
        } catch(const Stop &s) {partial(s.reason);out_.stop=CellPlanStop{s.reason,at};}
        for(size_t i=0;i<used_.size();++i){cancelCheck(cancel_);if(!used_[i])out_.unusedRules.push_back(i);}
        if(!out_.unusedRules.empty())partial("unused_rule");
        if(!out_.stop && std::chrono::steady_clock::now()>=deadline_){partial("budget_time");out_.stop=CellPlanStop{"budget_time",at};}
        cancelCheck(cancel_);return std::move(out_);
    }
};
hier::Result<CellPlanReport> execute(Design &d,const CellPlanRequest &r,Cancel c,
    std::optional<std::chrono::steady_clock::time_point> deadline={}) try {
    validate(r,c);auto source=take(investigateBoundary(d,r.boundary,c));
    auto plan=detail::planCellsFromBoundary(source,r,deadline.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(r.limits.maxMillis)),c);
    return CellPlanReport{std::move(source),std::move(plan)};
} catch(const Error &e) {return e;}
}
std::string_view cellDirectionName(CellDirection d) {switch(d){case CellDirection::Input:return "input";case CellDirection::Output:return "output";case CellDirection::Both:return "both";}return "invalid";}
std::string_view cellActionName(CellAction a) {switch(a){case CellAction::Exclude:return "exclude";case CellAction::Dedicated:return "dedicated";case CellAction::Share:return "share";}return "invalid";}
hier::Result<bool> validateCellPlanRequest(const CellPlanRequest &r,Cancel c) try {validate(r,c);return true;}catch(const Error &e){return e;}
hier::Result<CellPlanReport> planWrapperCells(Design &d,const CellPlanRequest &r,Cancel c){return execute(d,r,c);}
namespace detail {
CellPlan planCellsFromBoundary(const BoundaryReport &source,const CellPlanRequest &r,std::chrono::steady_clock::time_point deadline,Cancel c){return Planner(source,r,deadline,c).run();}
hier::Result<CellPlanReport> planWrapperCellsWithDeadline(Design &d,const CellPlanRequest &r,std::chrono::steady_clock::time_point deadline,Cancel c){return execute(d,r,c,deadline);}
}
}
