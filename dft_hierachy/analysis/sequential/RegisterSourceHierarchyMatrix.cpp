#include "RegisterSourceHierarchyMatrixInternal.h"
#include "RegisterSourceHierarchyInternal.h"
#include "SourceHierarchyRoleCountsInternal.h"
#include <algorithm>
#include <map>
#include <tuple>
namespace dft::sequential {
const char *sourceHierarchyRoleName(SourceHierarchyRole role) {
    switch(role) {case SourceHierarchyRole::Added:return "added";case SourceHierarchyRole::Removed:return "removed";case SourceHierarchyRole::Retained:return "retained";}
    throw hier::Error{hier::ErrorCode::Internal,"Invalid source hierarchy role"};
}
namespace {
using namespace hier;
using Time=std::chrono::steady_clock::time_point;
using Role=SourceHierarchyRole;
using SourceRole=std::pair<size_t,Role>;
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Register source hierarchy matrix cancelled"};}
void require(bool v) {if(!v) throw Error{ErrorCode::BadRequest,"Source hierarchy matrix requires valid published member references"};}
class Matrix {
    RegisterSourceHierarchyMatrixReport out_;
    Time end_;
    Cancel cancel_;
    void partial(const std::string &r) {out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),r)==out_.reasons.end()) out_.reasons.push_back(r);}
    bool time() {checkpoint(cancel_);if(std::chrono::steady_clock::now()<end_) return true;partial("budget_source_hierarchy_matrix_time");return false;}
    bool spend() {
        if(!time()) return false;
        if(out_.work>=out_.limits.maxWork) {partial("budget_source_hierarchy_matrix_work");return false;}
        ++out_.work;return true;
    }
    bool comparison(size_t index) {
        auto &dest=out_.comparisons[index];const auto &input=out_.analysis.comparisons[index];dest.state="partial";
        if(!time()) return false;
        const auto &impact=out_.analysis.analysis.comparisons[index];const auto &transitions=out_.analysis.analysis.analysis;
        const auto &cohorts=transitions.comparisons[index].cohorts;const auto &attribution=transitions.analysis.comparisons[index];
        const auto sourceCount=transitions.analysis.analysis.analysis.rows.size();
        std::map<size_t,std::vector<SourceRole>> roles;
        std::map<std::pair<size_t,size_t>,std::vector<SourceHierarchyMatrixMember>> groups;
        uint64_t inputNodes=0,inputMembers=0;
        for(size_t node=0;node<input.nodes.size();++node) {
            if(!spend()) return false;
            if(inputNodes>=out_.limits.maxInputNodes-out_.inputNodes) {partial("budget_source_hierarchy_matrix_input_nodes");return false;}
            ++inputNodes;
            for(const auto instance:input.nodes[node].members) {
                if(!spend()) return false;require(instance<impact.instances.size());
                for(const auto &ref:impact.instances[instance].members) {
                    if(!spend()) return false;require(ref.cohort<cohorts.size());const auto &cohort=cohorts[ref.cohort];
                    require(ref.member<cohort.members.size());const auto &member=cohort.members[ref.member];
                    require(member.row<attribution.rows.size()&&member.segment<attribution.rows[member.row].segments.size());
                    if(!roles.contains(ref.cohort)) {
                        std::vector<SourceRole> merged;size_t a=0,b=0;
                        while(a<cohort.baselineSources.size()||b<cohort.scenarioSources.size()) {
                            if(!spend()) return false;size_t source;Role role;
                            if(b==cohort.scenarioSources.size()||(a<cohort.baselineSources.size()&&cohort.baselineSources[a]<cohort.scenarioSources[b])) {source=cohort.baselineSources[a++];role=Role::Removed;}
                            else if(a==cohort.baselineSources.size()||cohort.scenarioSources[b]<cohort.baselineSources[a]) {source=cohort.scenarioSources[b++];role=Role::Added;}
                            else {source=cohort.baselineSources[a++];++b;role=Role::Retained;}
                            require(source<sourceCount&&(merged.empty()||merged.back().first<source));merged.emplace_back(source,role);
                        }
                        roles.emplace(ref.cohort,std::move(merged)); // Complete, comparison-local source role mapping only.
                    }
                    for(const auto &[source,role]:roles.at(ref.cohort)) {
                        if(!spend()) return false;
                        if(inputMembers>=out_.limits.maxInputMembers-out_.inputMembers) {partial("budget_source_hierarchy_matrix_input_members");return false;}
                        groups[{source,node}].push_back({member.row,member.segment,role});++inputMembers;
                    }
                }
            }
        }
        dest.inputCollected=true;dest.inputMembers=inputMembers;out_.inputNodes+=inputNodes;out_.inputMembers+=inputMembers;
        if(!dest.inputComplete) partial("source_hierarchy_matrix_inputs_incomplete");
        for(auto &[key,members]:groups) {
            if(out_.rows>=out_.limits.maxRows) {partial("budget_source_hierarchy_matrix_rows");return false;}
            if(!spend()) return false;
            if(members.size()>out_.limits.maxMembers-out_.members) {partial("budget_source_hierarchy_matrix_members");return false;}
            std::sort(members.begin(),members.end(),[](const auto &a,const auto &b) {return std::tie(a.row,a.segment)<std::tie(b.row,b.segment);});
            SourceHierarchyMatrixRow row;row.source=key.first;row.node=key.second;
            for(const auto &member:members) {
                if(!spend()) return false;
                require(row.members.empty()||std::tie(row.members.back().row,row.members.back().segment)<std::tie(member.row,member.segment));
                const auto width=attribution.rows[member.row].segments[member.segment].bits.width;
                detail::addSourceHierarchyRoleCounts(row.counts,member.role,width);row.members.push_back(member);
            }
            ++out_.rows;out_.members+=row.members.size();dest.rows.push_back(std::move(row));
        }
        dest.state=dest.inputComplete?"complete":"partial";return true;
    }
  public:
    Matrix(RegisterSourceHierarchyReport input,const RegisterSourceHierarchyMatrixLimits &l,Time end,Cancel c):end_(end),cancel_(c) {
        out_.analysis=std::move(input);out_.limits=l;
        for(const auto &v:out_.analysis.comparisons) {
            SourceHierarchyMatrixComparison dest;dest.scenario=v.scenario;dest.inputNodes=v.nodes.size();dest.inputComplete=v.state=="complete";dest.sourcesComplete=v.sourcesComplete;
            out_.comparisons.push_back(std::move(dest));
        }
    }
    RegisterSourceHierarchyMatrixReport run() {
        checkpoint(cancel_);if(!out_.analysis.complete) partial("analysis_incomplete");
        for(size_t i=0;i<out_.comparisons.size();++i) if(!comparison(i)) {partial("source_hierarchy_matrix_unfinished");break;}
        (void)time();return std::move(out_);
    }
};
Result<RegisterSourceHierarchyMatrixReport> execute(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceHierarchyMatrixLimits &l,std::optional<Time> end,Cancel c) try {
    detail::validateRegisterSourceHierarchyMatrixLimits(l);checkpoint(c);
    auto input=compareRegisterSourceHierarchy(d,s,r,l.hierarchy,c);if(!input) return input.error();
    return Matrix(std::move(*input),l,end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.maxMillis))),c).run();
} catch(const Error &e) {return e;}
}
void detail::validateRegisterSourceHierarchyMatrixLimits(const RegisterSourceHierarchyMatrixLimits &l) {
    validateRegisterSourceHierarchyLimits(l.hierarchy);
    if(!l.maxRows||l.maxRows>100000||!l.maxMembers||l.maxMembers>2000000||!l.maxInputNodes||l.maxInputNodes>100000||
        !l.maxInputMembers||l.maxInputMembers>2000000||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Invalid register source hierarchy matrix budget"};
}
Result<RegisterSourceHierarchyMatrixReport> detail::sourceHierarchyMatrixWithDeadline(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceHierarchyMatrixLimits &l,Time end,Cancel c) {return execute(d,s,r,l,end,c);}
Result<RegisterSourceHierarchyMatrixReport> compareRegisterSourceHierarchyMatrix(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceHierarchyMatrixLimits &l,Cancel c) {return execute(d,s,r,l,{},c);}
}
