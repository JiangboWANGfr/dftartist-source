#include "SourceEvidenceLocationsInternal.h"
#include "RegisterSourceRangeSelectionInternal.h"
#include <algorithm>
#include <map>
#include <set>
namespace dft::sequential {
namespace {
using namespace hier;
using Time=std::chrono::steady_clock::time_point;
using Key=std::pair<std::string,model::SourceKind>;
void require(bool condition) {if(!condition) throw Error{ErrorCode::BadRequest,"Source locations require matching snapshot and unmodified evidence references"};}
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Source evidence location cancelled"};}
class Locate {
    Design &design_;
    const SourceRangeEvidence &input_;
    SourceEvidenceLocations out_;
    Time deadline_;
    Cancel cancel_;
    std::map<Key,size_t> published_;
    std::set<size_t> facts_;
    std::set<std::string> refs_;
    void partial(const std::string &reason) {out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),reason)==out_.reasons.end()) out_.reasons.push_back(reason);}
    bool time() {checkpoint(cancel_);if(std::chrono::steady_clock::now()<deadline_) return true;partial("budget_source_location_time");return false;}
    bool spend() {if(!time()) return false;if(out_.work>=out_.limits.maxWork) {partial("budget_source_location_work");return false;}++out_.work;return true;}
    std::optional<size_t> location(const std::string &ref,model::SourceKind kind,std::vector<EvidenceSourceLocation> &pending) {
        if(!spend()) return {};
        Key key{ref,kind};const auto found=published_.find(key);if(found!=published_.end()) return found->second;
        for(size_t i=0;i<pending.size();++i) if(pending[i].ref==ref&&pending[i].kind==kind) return out_.locations.size()+i;
        if(out_.locations.size()+pending.size()>=out_.limits.maxLocations) {partial("budget_source_location_locations");return {};}
        if(out_.queries>=out_.limits.maxQueries) {partial("budget_source_location_queries");return {};}
        ++out_.queries;auto span=design_.source(ref,kind,cancel_);
        if(!span&&span.error().code!=ErrorCode::NotFound) throw span.error();
        if(!time()) return {};
        EvidenceSourceLocation value;value.ref=ref;value.kind=kind;if(span) value.span=std::move(*span);
        const auto index=out_.locations.size()+pending.size();pending.push_back(std::move(value));return index;
    }
    bool row(size_t index) {
        if(out_.rows.size()>=out_.limits.maxFacts) {partial("budget_source_location_facts");return false;}
        if(!spend()) return false;
        const auto &fact=input_.facts[index];const auto &info=fact.info;
        require(!info.ref.empty()&&!info.inst.empty()&&!info.signal.empty()&&!info.process.empty());
        require(facts_.insert(fact.fact).second&&refs_.insert(info.ref).second);
        std::vector<EvidenceSourceLocation> pending;pending.reserve(2);
        const auto signal=location(info.signal,model::SourceKind::Definition,pending);if(!signal) return false;
        const auto process=location(info.process,model::SourceKind::Statement,pending);if(!process) return false;
        if(!time()) return false;
        SourceEvidenceLocationRow dest{index,fact.fact,info.ref,info.inst,*signal,*process};
        for(auto &value:pending) {
            if(!value.span) {++out_.missing;partial("source_location_not_found");}
            published_.emplace(Key{value.ref,value.kind},out_.locations.size());out_.locations.push_back(std::move(value));
        }
        out_.rows.push_back(std::move(dest));return true;
    }
  public:
    Locate(Design &d,const SourceRangeEvidence &e,const SourceEvidenceLocationLimits &l,Time deadline,Cancel c)
        :design_(d),input_(e),deadline_(deadline),cancel_(c) {
        out_.snapshotId=e.snapshotId;out_.scope=e.scope;out_.query=e.query;out_.limits=l;
        out_.inputComplete=e.complete;out_.sourcesComplete=e.sourcesComplete;out_.inputFacts=e.facts.size();
        if(!e.complete) partial("input_partial");
    }
    SourceEvidenceLocations run() {
        checkpoint(cancel_);++out_.queries;const auto snapshot=design_.snapshot(cancel_);if(!snapshot) throw snapshot.error();
        require(!out_.scope.empty()&&snapshot->snapshotId==out_.snapshotId);
        if(time()) for(size_t i=0;i<input_.facts.size();++i) if(!row(i)) break;
        return std::move(out_);
    }
};
Result<SourceEvidenceLocations> execute(Design &d,const SourceRangeEvidence &e,const SourceEvidenceLocationLimits &l,std::optional<Time> deadline,Cancel c) try {
    detail::validateSourceEvidenceLocationLimits(l);detail::validateSourceRangeQuery(e.query);checkpoint(c);
    return Locate(d,e,l,deadline.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.maxMillis))),c).run();
} catch(const Error &error) {return error;}
}
void detail::validateSourceEvidenceLocationLimits(const SourceEvidenceLocationLimits &l) {
    require(l.maxFacts&&l.maxFacts<=200000&&l.maxLocations&&l.maxLocations<=400000&&l.maxQueries&&l.maxQueries<=400001&&l.maxWork&&l.maxWork<=10000000&&l.maxMillis&&l.maxMillis<=60000);
}
Result<SourceEvidenceLocations> detail::sourceEvidenceLocationsWithDeadline(Design &d,const SourceRangeEvidence &e,const SourceEvidenceLocationLimits &l,Time t,Cancel c) {return execute(d,e,l,t,c);}
Result<SourceEvidenceLocations> locateSourceEvidence(Design &d,const SourceRangeEvidence &e,const SourceEvidenceLocationLimits &l,Cancel c) {return execute(d,e,l,{},c);}
}
