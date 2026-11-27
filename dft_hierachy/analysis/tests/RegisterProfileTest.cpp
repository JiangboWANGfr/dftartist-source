#include "RegisterControlProfileInternal.h"
#include <iostream>
#include <stdexcept>
namespace { void need(bool b, const char *s) { if (!b) throw std::runtime_error(s); } }
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open; open.files = {DFT_PROFILE_FIXTURE}; open.tops = {"profile_alias"};
    auto design = hier::Design::open(open); need(bool(design), "open RTL");
    StatisticsRequest request; request.scope = "profile_alias";
    auto stats = registerStatistics(**design, request); need(bool(stats) && stats->complete, "original statistics");
    RegisterControlOptions logic; logic.resolveLogic=true;
    auto p = profileRegisterControls(**design, *stats, logic);
    need(bool(p) && p->complete && p->cohorts.size()==1 && p->cohorts[0].totals.coveredBits==4 &&
        p->cohorts[0].totals.overlapBits==2 && p->cohorts[0].totals.factBits==6, "source union across distinct raw aliases");
    std::stop_source stop; stop.request_stop(); auto cancelled=profileRegisterControls(**design,*stats,{},stop.get_token());
    need(!cancelled && cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel Error");
    auto expired=detail::profileWithDeadline(**design,*stats,{}, {}, {});
    need(bool(expired) && !expired->complete && expired->checks.empty() && expired->work==0,"expired deterministic deadline");
    auto bad=*stats; bad.snapshot.snapshotId+="wrong";
    auto rejected=profileRegisterControls(**design,bad); need(!rejected && rejected.error().code==hier::ErrorCode::BadRequest,"wrong snapshot");
    bad=*stats; bad.facts[0].page=bad.pages.size(); need(!profileRegisterControls(**design,bad),"bad original index");
    RegisterControlOptions options; options.maxWork=0; need(!profileRegisterControls(**design,*stats,options),"invalid limits");
    options={}; options.resolveLogic=true; options.inputValues={{{"profile_alias.r0",0},true},{{"profile_alias.r0",0},false}};
    need(!profileRegisterControls(**design,*stats,options),"duplicate semantic input bit rejected by shared resolver");
    options=logic; options.maxMembers=1;
    auto bounded=profileRegisterControls(**design,*stats,options);
    need(bool(bounded) && !bounded->complete && bounded->attributedFacts==1 && bounded->cohorts[0].totals.coveredBits==3,"explicit source membership prefix");
    options=logic; options.maxSegments=1; auto again=profileRegisterControls(**design,*stats,options);
    need(bool(again) && !again->complete && !again->signals[0].coverage && again->cohorts[0].totals.coveredBits==0,"three multiplicity segments are not partly published under cap one");
    need(bool(profileRegisterControls(**design,*stats,logic)),"reuse after invalid/cancel/truncation");
    open.tops={"profile_modes"}; auto modes=hier::Design::open(open); need(bool(modes),"open second Design");
    request.scope="profile_modes"; auto modeStats=registerStatistics(**modes,request); need(bool(modeStats),"mode statistics");
    need(!profileRegisterControls(**design,*modeStats,logic),"actual other Design snapshot rejected");
    std::vector<std::optional<std::string>> sources;
    for (const bool high : {false,true,false}) {
        auto context=logic; context.inputValues={{{"profile_modes.sel",0},high}};
        auto value=profileRegisterControls(**modes,*modeStats,context);
        need(bool(value) && value->complete && value->cohorts.size()==1,"same Design static input interpretation");
        sources.push_back(value->cohorts[0].source.sourceRef);
    }
    need(sources[0]==sources[2] && sources[0]!=sources[1],"0-1-0 does not cache a prior input context");
    design.value().reset(); stats=hier::Error{hier::ErrorCode::Internal,"released"};
    need(!p->checks[0].control.trace->result.nodes.empty() && !p->cohorts[0].source.point->slice.ref.empty() &&
        p->signals[0].facts.size()==2 && p->events.groups.size()==2,"owns original proofs, events, descriptors and index containers");
    std::cout<<"Register control source grouping, coverage, snapshot, bounds, cancel and ownership passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
