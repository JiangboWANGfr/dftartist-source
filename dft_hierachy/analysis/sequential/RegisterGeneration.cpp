#include "RegisterGenerationInternal.h"
#include "RegisterControlProfileInternal.h"
#include "GenerationInternal.h"
#include <algorithm>

namespace dft::sequential {
namespace {
using namespace hier;
using Time = std::chrono::steady_clock::time_point;
template<class T> T take(Result<T> v) {if (!v) throw v.error();return std::move(v.value());}
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Register control generation cancelled"};}
Result<RegisterGeneration> execute(Design &d,const RegisterStatistics &s,const RegisterControlProfile &p,
    const RegisterGenerationLimits &limits,std::optional<Time> graphDeadline,std::optional<Time> mappingDeadline,Cancel c,std::optional<Time> outer={}) try {
    detail::validateRegisterGenerationLimits(limits);checkpoint(c);
    detail::validateRegisterProfileReferences(s,p,c);
    if (!p.options.resolveLogic) return Error{ErrorCode::BadRequest,"Register control generation requires logic profile"};
    if (take(d.snapshot(c)).snapshotId!=s.snapshot.snapshotId)
        return Error{ErrorCode::BadRequest,"Register control generation requires matching Design snapshot"};
    Request request;request.scope=p.scope;request.resolveLogic=true;request.maxDepth=p.options.maxDepth;
    request.clockRoots=p.options.clockRoots;request.inputValues=p.options.inputValues;
    const detail::GenerationInput view{request,p.snapshotId,p.scope,s.complete&&p.events.complete&&p.complete,p.checks.size(),
        [&](size_t i)->const Control & {return p.checks[i].control;},p.clockRoots,p.inputValues};
    const auto graphUntil=graphDeadline.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(limits.generation.maxMillis)));
    const auto until=outer?std::min(graphUntil,*outer):graphUntil;
    RegisterGeneration out;out.limits=limits;out.graph=take(detail::generationFromInput(d,view,limits.generation,until,c));
    const auto partial=[&](const std::string &why) {
        out.complete=false;if(std::find(out.reasons.begin(),out.reasons.end(),why)==out.reasons.end()) out.reasons.push_back(why);
    };
    if (!view.complete) partial("profile_incomplete");
    if (!out.graph.complete) partial("generation_incomplete");
    for (const auto &g:p.events.groups) {checkpoint(c);out.inputEvents+=1+g.async.size();}
    std::vector<std::optional<size_t>> seeds(p.checks.size());
    for (const auto &seed:out.graph.seeds) {checkpoint(c);seeds[seed.check]=seed.node;}
    const auto mappingEnd=mappingDeadline.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(limits.maxMillis)));
    const auto mappingUntil=outer?std::min(mappingEnd,*outer):mappingEnd;
    const auto spend=[&] {
        checkpoint(c);
        if (std::chrono::steady_clock::now()>=mappingUntil) {partial("budget_mapping_time");return false;}
        if (out.work>=limits.maxWork) {partial("budget_mapping_work");return false;}
        ++out.work;return true;
    };
    bool stopped=false;
    for (size_t gi=0;gi<p.events.groups.size()&&!stopped;++gi) {
        const auto &g=p.events.groups[gi];
        for (size_t ei=0;ei<=g.async.size();++ei) {
            if (out.events.size()>=limits.maxEvents) {partial("budget_mapping_events");stopped=true;break;}
            if (!spend()) {stopped=true;break;}
            RegisterGenerationEvent row;row.rawGroup=gi;if(ei) row.asyncIndex=ei-1;
            if (gi<p.groupControls.size()) row.check=ei?p.groupControls[gi].asyncChecks[ei-1]:p.groupControls[gi].clockCheck;
            if (row.check) row.node=seeds[*row.check];
            if (!row.check) row.reasons.push_back("profile_event_unvisited");
            else if (!row.node) row.reasons.push_back("generation_seed_unvisited");
            if (!row.node) {out.mappingComplete=false;partial("event_mapping_unresolved");}
            out.events.push_back(std::move(row));
        }
    }
    if (out.events.size()!=out.inputEvents) {out.mappingComplete=false;partial("event_mapping_unfinished");}
    checkpoint(c);return out;
} catch(const Error &e) {return e;}
}
void detail::validateRegisterGenerationLimits(const RegisterGenerationLimits &l) {
    validateGenerationLimits(l.generation);
    if(!l.maxEvents||l.maxEvents>1000000||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Invalid register generation mapping budget"};
}
Result<RegisterGeneration> detail::registerGenerationWithDeadlines(Design &d,const RegisterStatistics &s,const RegisterControlProfile &p,
    const RegisterGenerationLimits &l,Time graph,Time mapping,Cancel c) {return execute(d,s,p,l,graph,mapping,c);}
Result<RegisterGeneration> detail::registerGenerationBefore(Design &d,const RegisterStatistics &s,const RegisterControlProfile &p,
    const RegisterGenerationLimits &l,Time end,Cancel c) {return execute(d,s,p,l,{},{},c,end);}
Result<RegisterGeneration> registerControlGeneration(Design &d,const RegisterStatistics &s,const RegisterControlProfile &p,
    const RegisterGenerationLimits &l,Cancel c) {return execute(d,s,p,l,{},{},c);}
}
