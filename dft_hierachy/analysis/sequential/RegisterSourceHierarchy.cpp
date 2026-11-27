#include "RegisterSourceHierarchyInternal.h"
#include "RegisterSourceImpactInternal.h"
#include "AttributionCountsInternal.h"
#include <algorithm>
#include <map>
#include <set>
namespace dft::sequential {
namespace {
using namespace hier;
using Time=std::chrono::steady_clock::time_point;
using Info=model::InstInfo;
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Register source hierarchy cancelled"};}
template<class T> T take(Result<T> value) {if(!value) throw value.error();return std::move(*value);}
void require(bool v) {if(!v) throw Error{ErrorCode::BadRequest,"Source hierarchy requires matching scope and instance metadata"};}
class Hierarchy {
    RegisterSourceHierarchyReport out_;
    Design &design_; // Synchronously borrowed, never stored in the result.
    const RegisterStatistics &statistics_;
    Time end_;
    Cancel cancel_;
    std::map<std::string,std::vector<Info>> chains_; // Only immutable topology, scoped to this call/snapshot.
    void partial(const std::string &r) {out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),r)==out_.reasons.end()) out_.reasons.push_back(r);}
    bool time() {checkpoint(cancel_);if(std::chrono::steady_clock::now()<end_) return true;partial("budget_source_hierarchy_time");return false;}
    bool spend() {
        if(!time()) return false;
        if(out_.work>=out_.limits.maxWork) {partial("budget_source_hierarchy_work");return false;}
        ++out_.work;return true;
    }
    bool query() {
        if(!spend()) return false;
        if(out_.queries>=out_.limits.maxQueries) {partial("budget_source_hierarchy_queries");return false;}
        ++out_.queries;return true;
    }
    static bool identity(const Info &a,const Info &b) {return a.ref==b.ref&&a.path==b.path&&a.pathText==b.pathText&&a.def==b.def&&a.defName==b.defName;}
    bool scope() {
        if(statistics_.instances.empty()) {
            // Statistics resolves the canonical scope before visiting its first instance.
            // A valid budget-truncated empty prefix has no ref to query or publish.
            require(!statistics_.complete);
            if(!time()) return false;
            partial("source_hierarchy_scope_unvisited");return true;
        }
        if(!query()) return false;
        auto value=take(design_.instance(statistics_.instances.front().info.ref,cancel_));
        require(value.pathText==statistics_.scope&&identity(value,statistics_.instances.front().info));out_.scope=std::move(value);return true;
    }
    const std::vector<Info> *chain(size_t instance) {
        require(instance<statistics_.instances.size());const auto &original=statistics_.instances[instance].info;
        if(const auto it=chains_.find(original.ref);it!=chains_.end()) {require(identity(it->second.back(),original));return &it->second;}
        std::vector<Info> value;
        if(original.ref==out_.scope->ref) {require(identity(*out_.scope,original));value.push_back(*out_.scope);}
        else {
            if(!query()) return nullptr;auto own=take(design_.instance(original.ref,cancel_));require(identity(own,original));
            if(!query()) return nullptr;auto ancestors=take(design_.ancestors(original.ref,cancel_));bool inside=false;
            for(auto &ancestor:ancestors) {
                if(!spend()) return nullptr;
                if(ancestor.ref==out_.scope->ref) inside=true;
                if(inside) value.push_back(std::move(ancestor));
            }
            require(inside);value.push_back(std::move(own));
        }
        if(value.size()>out_.limits.maxAncestors-out_.ancestorEntries) {partial("budget_source_hierarchy_ancestors");return nullptr;}
        std::set<std::string> refs;
        for(const auto &v:value) {if(!spend()) return nullptr;require(refs.insert(v.ref).second);}
        out_.ancestorEntries+=value.size();return &chains_.emplace(original.ref,std::move(value)).first->second;
    }
    bool comparison(size_t index) {
        auto &dest=out_.comparisons[index];const auto &input=out_.analysis.comparisons[index];dest.state="partial";
        if(!time()) return false;
        struct Node {Info info;std::optional<std::string> parent;uint64_t depth=0;std::optional<size_t> local;std::vector<size_t> members;};
        std::map<std::string,Node> groups;
        for(size_t row=0;row<input.instances.size();++row) {
            if(!spend()) return false;const auto &local=input.instances[row];const auto *path=chain(local.instance);if(!path) return false;
            for(size_t depth=0;depth<path->size();++depth) {
                if(!spend()) return false;const auto &info=(*path)[depth];const std::optional<std::string> parent=depth?std::optional<std::string>((*path)[depth-1].ref):std::nullopt;
                auto [it,inserted]=groups.try_emplace(info.ref);auto &node=it->second;
                if(inserted) {node.info=info;node.parent=parent;node.depth=depth;}
                else if(!identity(node.info,info)||node.parent!=parent||node.depth!=depth)
                    throw Error{ErrorCode::Internal,"Core ancestor metadata changed during source hierarchy"};
                node.members.push_back(row);if(depth+1==path->size()) {require(!node.local);node.local=row;}
            }
        }
        dest.inputCollected=true;if(!dest.inputComplete) partial("source_hierarchy_inputs_incomplete");
        std::vector<const Node *> ordered;
        for(const auto &[ref,node]:groups) {(void)ref;if(!spend()) return false;ordered.push_back(&node);}
        std::sort(ordered.begin(),ordered.end(),[](const auto *a,const auto *b) {return a->info.path<b->info.path;});
        for(const auto *node:ordered) {
            if(out_.nodeRows>=out_.limits.maxNodes) {partial("budget_source_hierarchy_nodes");return false;}
            if(!spend()) return false;
            if(node->members.size()>out_.limits.maxMembers-out_.members) {partial("budget_source_hierarchy_members");return false;}
            SourceHierarchyNode row;row.info=node->info;row.parent=node->parent;row.depth=node->depth;row.local=node->local;
            for(const auto member:node->members) {
                if(!spend()) return false;row.members.push_back(member);detail::addSourceAttributionCounts(row.counts,input.instances[member].counts);
            }
            if(row.info.ref==out_.scope->ref) dest.totals=row.counts;
            out_.members+=row.members.size();++out_.nodeRows;dest.nodes.push_back(std::move(row));
        }
        dest.state=dest.inputComplete?"complete":"partial";return true;
    }
  public:
    Hierarchy(RegisterSourceImpactReport input,Design &d,const RegisterStatistics &s,const RegisterSourceHierarchyLimits &l,Time end,Cancel c):design_(d),statistics_(s),end_(end),cancel_(c) {
        out_.analysis=std::move(input);out_.limits=l;
        for(const auto &v:out_.analysis.comparisons) {
            SourceHierarchyComparison dest;dest.scenario=v.scenario;dest.inputRows=v.instances.size();dest.inputComplete=v.state=="complete";dest.sourcesComplete=v.sourcesComplete;
            out_.comparisons.push_back(std::move(dest));
        }
    }
    RegisterSourceHierarchyReport run() {
        checkpoint(cancel_);if(!out_.analysis.complete) partial("analysis_incomplete");
        if(!scope()) return std::move(out_);
        for(size_t i=0;i<out_.comparisons.size();++i) if(!comparison(i)) {partial("source_hierarchy_unfinished");break;}
        (void)time();return std::move(out_);
    }
};
Result<RegisterSourceHierarchyReport> execute(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceHierarchyLimits &l,std::optional<Time> end,Cancel c) try {
    detail::validateRegisterSourceHierarchyLimits(l);checkpoint(c);
    auto input=compareRegisterSourceImpact(d,s,r,l.impact,c);if(!input) return input.error();
    return Hierarchy(std::move(*input),d,s,l,end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(l.maxMillis))),c).run();
} catch(const Error &e) {return e;}
}
void detail::validateRegisterSourceHierarchyLimits(const RegisterSourceHierarchyLimits &l) {
    validateRegisterSourceImpactLimits(l.impact);
    if(!l.maxQueries||l.maxQueries>100000||!l.maxAncestors||l.maxAncestors>2000000||!l.maxNodes||l.maxNodes>100000||
        !l.maxMembers||l.maxMembers>2000000||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Invalid register source hierarchy budget"};
}
Result<RegisterSourceHierarchyReport> detail::sourceHierarchyWithDeadline(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceHierarchyLimits &l,Time end,Cancel c) {return execute(d,s,r,l,end,c);}
Result<RegisterSourceHierarchyReport> compareRegisterSourceHierarchy(Design &d,const RegisterStatistics &s,const RegisterScenarioRequest &r,
    const RegisterSourceHierarchyLimits &l,Cancel c) {return execute(d,s,r,l,{},c);}
}
