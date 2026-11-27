#include "ChainCompatibilityInternal.h"
#include "../common/Utf8.h"
#include <algorithm>
#include <map>
#include <set>
namespace dft::wrapper {
namespace {
using namespace hier;using Clock=std::chrono::steady_clock;
template<class T>T take(Result<T> r){if(!r)throw r.error();return std::move(r.value());}
void cancelled(Cancel c){if(c.stop_requested())throw Error{ErrorCode::Cancelled,"Wrapper compatibility inspection cancelled"};}
[[noreturn]]void bad(const char *message){throw Error{ErrorCode::BadRequest,message};}
std::vector<ResolvedActivityGroup> resolve(const ChainCompatibilityRequest &r,Cancel c) {
    cancelled(c);take(validateChainResetRequest(r.resets,c));const auto &l=r.limits;
    if(!l.maxGroups||l.maxGroups>1024||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)bad("Wrapper compatibility limit out of range");
    if(r.groups.size()>1024)bad("Too many compatibility groups");
    std::map<std::string,size_t> chains;const auto &decl=r.resets.clock.chains.chains;
    for(size_t i=0;i<decl.size();++i){cancelled(c);chains.emplace(decl[i].name,i);}
    std::vector<ResolvedActivityGroup> result;
    if(r.groups.empty()){for(size_t i=0;i<decl.size();++i){cancelled(c);result.push_back({decl[i].name,{i}});}return result;}
    size_t bytes=0,members=0;std::set<std::string> names;
    const auto name=[&](const std::string &s){cancelled(c);if(s.empty()||s.size()>4096||s.find('\0')!=std::string::npos||!dft::detail::validUtf8(s))bad("Invalid compatibility name");bytes+=s.size();if(bytes>1024*1024)bad("Compatibility names exceed byte limit");};
    for(const auto &g:r.groups){name(g.name);if(!names.insert(g.name).second)bad("Duplicate compatibility group");if(g.chains.empty())bad("Empty compatibility group");
        ResolvedActivityGroup resolved{g.name,{}};std::set<size_t> seen;
        for(const auto &s:g.chains){name(s);if(++members>16384)bad("Too many compatibility members");auto it=chains.find(s);if(it==chains.end())bad("Unknown compatibility chain");if(!seen.insert(it->second).second)bad("Duplicate compatibility chain");resolved.chains.push_back(it->second);}
        result.push_back(std::move(resolved));
    }
    return result;
}
struct Stop {std::string reason;};
class Inspector {
    const ChainResetReport &source_; // Borrowed only during synchronous analysis.
    ChainCompatibility out_;Clock::time_point deadline_;Cancel cancel_;
    void checkpoint(){cancelled(cancel_);if(Clock::now()>=deadline_)throw Stop{"budget_time"};}
    void tick(){checkpoint();if(out_.work>=out_.limits.maxWork)throw Stop{"budget_work"};++out_.work;}
    void partial(const std::string &s){out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),s)==out_.reasons.end())out_.reasons.push_back(s);}

public:
    Inspector(const ChainResetReport &source,std::vector<ResolvedActivityGroup> groups,const ChainCompatibilityLimits &l,Clock::time_point deadline,Cancel c)
        :source_(source),deadline_(deadline),cancel_(c){out_.groups=std::move(groups);out_.limits=l;if(!source.resets.complete)partial("source_partial");}
    ChainCompatibility run() {
        size_t index=0;
        try {
            for(;index<out_.groups.size();++index){checkpoint();if(out_.rows.size()==out_.limits.maxGroups)throw Stop{"budget_groups"};auto r=detail::evaluateActivityGroup(source_,out_.groups[index].chains,index,[&]{tick();});checkpoint();
                if(!r.complete)partial("control_unresolved");auto &counts=out_.counts;++counts.groups;
                if(r.status=="compatible")++counts.compatible;else if(r.status=="conflict")++counts.conflict;else if(r.status=="empty")++counts.empty;else ++counts.unresolved;
                out_.rows.push_back(std::move(r));
            }
            checkpoint();
        }catch(const Stop &s){partial(s.reason);out_.stop=ChainCompatibilityStop{s.reason,index};}
        cancelled(cancel_);return std::move(out_);
    }
};
Result<ChainCompatibilityReport> execute(Design &d,const ChainCompatibilityRequest &r,Cancel c,std::optional<Clock::time_point> deadline={})try {
    auto groups=resolve(r,c);auto source=take(inspectWrapperChainResets(d,r.resets,c));
    auto compatibility=Inspector(source,std::move(groups),r.limits,deadline.value_or(Clock::now()+std::chrono::milliseconds(r.limits.maxMillis)),c).run();
    return ChainCompatibilityReport{std::move(source),std::move(compatibility)};
}catch(const Error &e){return e;}
}
ChainCompatibilityRow detail::evaluateActivityGroup(const ChainResetReport &source,
    const std::vector<size_t> &members,size_t index,const std::function<void()> &tick) {
    tick();ChainCompatibilityRow r;r.group=index;bool asserted=false,levels=false,clockUnknown=false,resetUnknown=false;
    std::set<size_t> clocks;std::map<size_t,size_t> holds;
    using Key=std::pair<std::string,uint64_t>;std::map<Key,size_t> inputKeys;
    const auto &clock=source.source.clocks;const auto &resets=source.resets;const auto &layout=source.source.source.layout;
    for(const auto chain:members) {
        tick();const auto &segments=layout.chains[chain].segments;const auto &c=clock.chains[chain];const auto &s=resets.chains[chain];
        for(const auto &segment:segments){tick();if(segment.kind=="shared")r.allocatedSharedBits+=segment.length;else r.allocatedDedicatedBits+=segment.length;}
        asserted=asserted||s.assertedBits>0;levels=levels||s.conflictBits>0;
        clockUnknown=clockUnknown||c.processedSegments!=segments.size()||c.unresolvedBits>0;
        resetUnknown=resetUnknown||!s.complete;
        for(auto g:c.groups){tick();if(clocks.insert(g).second)r.clockGroups.push_back(g);}
        for(const auto &h:s.holds){tick();auto [it,added]=holds.emplace(h.input,r.holds.size());
            if(added){r.holds.push_back(h);const auto &input=resets.inputs[h.input];inputKeys.emplace(Key{input.sourceRef,input.point.slice.bits.lsb},h.input);}
            else{auto &saved=r.holds[it->second];saved.low=saved.low||h.low;saved.high=saved.high||h.high;}
            const auto &saved=r.holds[it->second];levels=levels||(saved.low&&saved.high);
        }
    }
    for(auto g:r.clockGroups){tick();const auto &clockGroup=clock.groups[g];auto h=inputKeys.find(Key{clockGroup.sourceRef,clockGroup.point.slice.bits.lsb});if(h!=inputKeys.end())r.heldClocks.push_back({g,h->second});}
    const auto reason=[&](bool condition,const char *s){if(condition)r.reasons.emplace_back(s);};
    reason(asserted,"constant_asserted");reason(levels,"conflicting_levels");reason(!r.heldClocks.empty(),"held_clock");reason(r.clockGroups.size()>1,"mixed_clocks");
    reason(clockUnknown,"clock_unresolved");reason(resetUnknown,"reset_unresolved");reason(r.allocatedDedicatedBits>0,"dedicated_controls_undefined");
    r.complete=!clockUnknown&&!resetUnknown&&!r.allocatedDedicatedBits;
    if(asserted||levels||!r.heldClocks.empty()||r.clockGroups.size()>1)r.status="conflict";
    else if(!r.complete)r.status="unresolved";
    else if(!r.allocatedSharedBits&&!r.allocatedDedicatedBits)r.status="empty";
    else r.status="compatible";
    return r;
}

Result<bool> validateChainCompatibilityRequest(const ChainCompatibilityRequest &r,Cancel c)try{resolve(r,c);return true;}catch(const Error &e){return e;}
Result<ChainCompatibilityReport> inspectWrapperChainCompatibility(Design &d,const ChainCompatibilityRequest &r,Cancel c){return execute(d,r,c);}
namespace detail {
Result<ChainCompatibilityReport> inspectWrapperChainCompatibilityWithDeadline(Design &d,const ChainCompatibilityRequest &r,Clock::time_point deadline,Cancel c){return execute(d,r,c,deadline);}
}
}
