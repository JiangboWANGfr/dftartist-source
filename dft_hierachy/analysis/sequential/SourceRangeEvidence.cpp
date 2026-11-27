#include "SourceRangeEvidenceInternal.h"
#include "RegisterSourceRangeSelectionInternal.h"
#include "RegisterStatisticsInternal.h"
#include "SourceIdentity.h"
#include <algorithm>
#include <array>
#include <map>
#include <set>
#include <tuple>
namespace dft::sequential {
namespace {
using namespace hier;
using Time=std::chrono::steady_clock::time_point;
using Role=SourceHierarchyRole;
void require(bool value) {if(!value) throw Error{ErrorCode::BadRequest,"Source evidence requires matching statistics, ranges and selection references"};}
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Source range evidence cancelled"};}
size_t roleIndex(Role role) {require(role==Role::Added||role==Role::Removed||role==Role::Retained);return size_t(role);}
class Explain {
    const RegisterStatistics &statistics_;
    const RegisterSourceHierarchyRangeReport &ranges_;
    const SourceRangeSelection &selection_;
    const RegisterSourceScenarioReport &sources_;
    SourceRangeEvidence out_;
    Time deadline_;
    Cancel cancel_;
    std::map<size_t,size_t> dictionary_;
    std::map<std::tuple<size_t,size_t,size_t>,const RegisterFactCoverage *> signals_;
    void partial(const std::string &reason) {out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),reason)==out_.reasons.end()) out_.reasons.push_back(reason);}
    bool time() {checkpoint(cancel_);if(std::chrono::steady_clock::now()<deadline_) return true;partial("budget_source_evidence_time");return false;}
    bool spend() {if(!time()) return false;if(out_.work>=out_.limits.maxWork) {partial("budget_source_evidence_work");return false;}++out_.work;return true;}
    const RegisterFactCoverage *signalFacts(size_t source,size_t scenario,size_t signal) {
        const auto key=std::make_tuple(source,scenario,signal);const auto cached=signals_.find(key);if(cached!=signals_.end()) return cached->second;
        require(source<sources_.rows.size()&&scenario<sources_.scenarios.size());const auto &matrix=sources_.rows[source];
        require(scenario<matrix.groups.size()&&matrix.groups[scenario]&&sources_.scenarios[scenario].sources);
        const auto &context=*sources_.scenarios[scenario].sources;require(context.snapshotId==out_.snapshotId&&context.scope==out_.scope&&*matrix.groups[scenario]<context.groups.size());
        const auto &group=context.groups[*matrix.groups[scenario]];require(detail::sameSource(matrix.source,group.source)&&group.membersComplete);
        const RegisterFactCoverage *found=nullptr;
        for(const auto &candidate:group.signals) {if(!spend()) return nullptr;if(candidate.signal==signal) {require(!found&&candidate.coverage);found=&candidate;}}
        require(found&&!found->facts.empty());signals_.emplace(key,found);return found;
    }
    bool row(size_t index) {
        if(out_.rows.size()>=out_.limits.maxRows) {partial("budget_source_evidence_rows");return false;}
        if(!spend()) return false;
        const auto ci=selection_.query.scenario-1;const auto &selected=selection_.rows[index];
        require(selected.rangeRow<ranges_.comparisons[ci].rows.size());const auto &range=ranges_.comparisons[ci].rows[selected.rangeRow];
        require(selected.rangeSignal<range.signals.size()&&range.matrixRow<ranges_.analysis.comparisons[ci].rows.size());const auto &original=range.signals[selected.rangeSignal];
        require(selected.value.signal==original.signal&&original.signal<statistics_.signals.size());const auto &state=statistics_.signals[original.signal];require(state.instance<statistics_.instances.size());
        const auto &matrix=ranges_.analysis.comparisons[ci].rows[range.matrixRow];const auto &nodes=ranges_.analysis.analysis.comparisons[ci].nodes;
        require(matrix.source<sources_.rows.size()&&matrix.node<nodes.size());
        require((!selection_.query.source||*selection_.query.source==matrix.source)&&(!selection_.query.signal||*selection_.query.signal==original.signal)&&(!selection_.query.node||*selection_.query.node==nodes[matrix.node].info.pathText));
        SourceRangeEvidenceRow dest;dest.selectionRow=index;dest.source=sources_.rows[matrix.source].source;dest.node=nodes[matrix.node].info;dest.owner=statistics_.instances[state.instance].info;dest.signal=state.object;
        std::vector<SourceEvidenceFact> pending;std::map<size_t,size_t> newFacts;uint64_t entries=0,contexts=0;
        const auto &attribution=ranges_.analysis.analysis.analysis.analysis.analysis.comparisons[ci];std::optional<size_t> previous;
        std::array<size_t,3> cursor{};
        require(!selected.value.members.empty());
        for(const auto memberIndex:selected.value.members) {
            if(!spend()) return false;
            if(dest.proofs.size()>=out_.limits.maxProofs-out_.proofs) {partial("budget_source_evidence_proofs");return false;}
            require(memberIndex<matrix.members.size()&&(!previous||*previous<memberIndex)&&std::binary_search(original.members.begin(),original.members.end(),memberIndex));previous=memberIndex;
            const auto &member=matrix.members[memberIndex];const auto role=roleIndex(member.role);require(member.row<attribution.rows.size());const auto &ar=attribution.rows[member.row];
            require(ar.signal==original.signal&&member.segment<ar.segments.size()&&(!selection_.query.role||*selection_.query.role==member.role));const auto &bits=ar.segments[member.segment].bits;
            auto clipped=detail::intersectSourceRanges(bits,selection_.query.bits.value_or(bits));require(bool(clipped));
            const auto &selectedBits=role==0?selected.value.added:role==1?selected.value.removed:selected.value.retained;auto &pos=cursor[role];
            while(pos<selectedBits.size()) {if(!spend()) return false;if(detail::intervalEnd(selectedBits[pos])>clipped->lsb) break;++pos;}
            require(pos<selectedBits.size()&&selectedBits[pos].lsb<=clipped->lsb&&detail::intervalEnd(selectedBits[pos])>=detail::intervalEnd(*clipped));
            SourceEvidenceProof proof;proof.member=memberIndex;proof.role=member.role;proof.bits=*clipped;
            const auto context=[&](size_t scenario) {
                if(!spend()) return false;
                const auto facts=signalFacts(matrix.source,scenario,original.signal);if(!facts) return false;
                SourceEvidenceContext value;value.scenario=scenario;value.group=*sources_.rows[matrix.source].groups[scenario];std::set<size_t> seen;
                for(const auto fact:facts->facts) {
                    if(!spend()) return false;require(fact<statistics_.facts.size()&&statistics_.facts[fact].signal==original.signal&&seen.insert(fact).second);
                    const auto &ref=statistics_.facts[fact];const auto &info=statistics_.pages[ref.page].response.result.items[ref.item];const auto overlap=detail::intersectSourceRanges(info.bits,*clipped);if(!overlap) continue;
                    if(entries>=out_.limits.maxFacts-out_.factEntries) {partial("budget_source_evidence_facts");return false;}
                    size_t dictionary=0;const auto existing=dictionary_.find(fact);
                    if(existing!=dictionary_.end()) dictionary=existing->second;
                    else {const auto local=newFacts.find(fact);if(local!=newFacts.end()) dictionary=local->second;else {dictionary=out_.facts.size()+pending.size();newFacts.emplace(fact,dictionary);pending.push_back({fact,info});}}
                    value.facts.push_back({dictionary,*overlap});++entries;
                }
                require(!value.facts.empty());++contexts;proof.contexts.push_back(std::move(value));return true;
            };
            if(member.role!=Role::Added&&!context(0)) return false;
            if(member.role!=Role::Removed&&!context(selection_.query.scenario)) return false;
            dest.proofs.push_back(std::move(proof));
        }
        for(auto &fact:pending) {dictionary_.emplace(fact.fact,out_.facts.size());out_.facts.push_back(std::move(fact));}
        out_.proofs+=dest.proofs.size();out_.contexts+=contexts;out_.factEntries+=entries;out_.rows.push_back(std::move(dest));return true;
    }
  public:
    Explain(const RegisterStatistics &s,const RegisterSourceHierarchyRangeReport &r,const SourceRangeSelection &v,const SourceRangeEvidenceLimits &l,Time deadline,Cancel c):statistics_(s),ranges_(r),selection_(v),sources_(r.analysis.analysis.analysis.analysis.analysis.analysis.analysis),deadline_(deadline),cancel_(c) {
        const auto ci=v.query.scenario-1;require(sources_.analysis.analysis.snapshotId==s.snapshot.snapshotId&&sources_.analysis.analysis.scope==s.scope);
        require(ci<r.comparisons.size()&&r.comparisons.size()<=7&&r.analysis.comparisons.size()==r.comparisons.size()&&r.analysis.analysis.comparisons.size()==r.comparisons.size()&&r.analysis.analysis.analysis.analysis.analysis.comparisons.size()==r.comparisons.size());
        require(v.rows.size()<=100000&&v.inputRows==r.comparisons[ci].rows.size()&&v.inputComplete==(r.comparisons[ci].state=="complete")&&v.sourcesComplete==r.comparisons[ci].sourcesComplete);
        out_.snapshotId=s.snapshot.snapshotId;out_.scope=s.scope;out_.query=v.query;out_.limits=l;out_.inputRows=v.rows.size();out_.inputComplete=v.complete;out_.sourcesComplete=v.sourcesComplete;
        if(!s.complete||!r.complete||!v.complete) partial("analysis_incomplete");
    }
    SourceRangeEvidence run() {for(size_t i=0;i<selection_.rows.size();++i) if(!row(i)) break;(void)time();return std::move(out_);}
};
Result<SourceRangeEvidence> execute(const RegisterStatistics &s,const RegisterSourceHierarchyRangeReport &r,const SourceRangeSelection &v,const SourceRangeEvidenceLimits &l,std::optional<Time> deadline,Cancel c) try {
    detail::validateSourceRangeEvidenceLimits(l);detail::validateSourceRangeQuery(v.query);checkpoint(c);detail::validateStatisticsReferences(s,c);
    return Explain(s,r,v,l,deadline.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.maxMillis))),c).run();
} catch(const Error &e) {return e;}
}
void detail::validateSourceRangeEvidenceLimits(const SourceRangeEvidenceLimits &l) {require(l.maxRows&&l.maxRows<=100000&&l.maxProofs&&l.maxProofs<=1000000&&l.maxFacts&&l.maxFacts<=2000000&&l.maxWork&&l.maxWork<=10000000&&l.maxMillis&&l.maxMillis<=60000);}
Result<SourceRangeEvidence> detail::sourceRangeEvidenceWithDeadline(const RegisterStatistics &s,const RegisterSourceHierarchyRangeReport &r,const SourceRangeSelection &v,const SourceRangeEvidenceLimits &l,Time d,Cancel c) {return execute(s,r,v,l,d,c);}
Result<SourceRangeEvidence> explainRegisterSourceSelection(const RegisterStatistics &s,const RegisterSourceHierarchyRangeReport &r,const SourceRangeSelection &v,const SourceRangeEvidenceLimits &l,Cancel c) {return execute(s,r,v,l,{},c);}
}
