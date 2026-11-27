#include "RegisterResolvedEventsInternal.h"
#include <iostream>
#include <stdexcept>
namespace { void need(bool b,const char *s) {if (!b) throw std::runtime_error(s);} }
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open;open.files={DFT_RESOLVED_FIXTURE};open.tops={"resolved_alias"};
    auto d=hier::Design::open(open);need(bool(d),"open real RTL");
    StatisticsRequest req;req.scope="resolved_alias";auto s=registerStatistics(**d,req);need(bool(s),"statistics");
    RegisterControlOptions o;o.resolveLogic=true;auto p=profileRegisterControls(**d,*s,o);need(bool(p)&&p->complete,"profile");
    d.value().reset();
    auto r=groupResolvedRegisterEvents(*s,*p);need(bool(r)&&r->complete&&r->groups.size()==1&&r->resolvedRows==2&&
        r->groups[0].totals.coveredBits==4&&r->groups[0].totals.overlapBits==2&&r->crossGroupBits==0,"full clock+reset aliases merge; same group is not cross-group");
    auto lower=*s;lower.complete=false;auto quality=groupResolvedRegisterEvents(lower,*p);
    need(bool(quality)&&!quality->complete&&quality->groups[0].totals.coveredBits==4,"statistics partial retained with positive source evidence");
    auto lowerProfile=*p;lowerProfile.events.complete=false;quality=groupResolvedRegisterEvents(*s,lowerProfile);
    need(bool(quality)&&!quality->complete,"nested event quality explicitly conjoined");
    std::stop_source stop;stop.request_stop();auto cancelled=groupResolvedRegisterEvents(*s,*p,{},stop.get_token());
    need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel Error only");
    auto expired=detail::resolvedEventsWithDeadline(*s,*p,{}, {}, {});
    need(bool(expired)&&!expired->complete&&expired->work==0&&expired->rows.empty(),"deterministic expired deadline");
    auto bad=*p;bad.snapshotId+="wrong";need(!groupResolvedRegisterEvents(*s,bad),"snapshot mismatch");
    bad=*p;bad.events.signals[0].facts[0]=s->facts.size();need(!groupResolvedRegisterEvents(*s,bad),"bad original fact reference");
    bad=*p;bad.checks[0].source->kind="constant";need(!groupResolvedRegisterEvents(*s,bad),"source must match shared proof projection");
    bad=*p;bad.groupControls[0].clockCheck=p->checks.size();need(!groupResolvedRegisterEvents(*s,bad),"check index bounds");
    bad=*p;bad.events.groups[0].async[0].edge="posedge";need(!groupResolvedRegisterEvents(*s,bad),"raw event must match original fact");
    ResolvedEventLimits l;l.maxRows=0;need(!groupResolvedRegisterEvents(*s,*p,l),"invalid limits");
    l={};l.maxGroups=1;auto capacity=groupResolvedRegisterEvents(*s,*p,l);need(bool(capacity)&&capacity->complete,"full group capacity still accepts same proven tuple");
    l={};l.maxMembers=1;auto bounded=groupResolvedRegisterEvents(*s,*p,l);
    need(bool(bounded)&&!bounded->complete&&bounded->assignedFacts==1&&bounded->groups[0].totals.coveredBits==3&&
        !bounded->rows.back().membersComplete&&bounded->checkedSignals==0,"explicit membership prefix, missing source facts do not prove zero overlap");
    l={};l.maxSegments=1;auto atomic=groupResolvedRegisterEvents(*s,*p,l);
    need(bool(atomic)&&!atomic->complete&&!atomic->signals[0].coverage&&atomic->groups[0].totals.coveredBits==0,"atomic coverage under segment cap");
    need(bool(groupResolvedRegisterEvents(*s,*p)),"reuse after error/cancel/truncation");
    s=hier::Error{hier::ErrorCode::Internal,"released"};p=hier::Error{hier::ErrorCode::Internal,"released"};
    need(r->groups[0].rawGroups.size()==2&&!r->groups[0].clock.source.point->slice.ref.empty()&&
        !r->groups[0].async[0].source.point->slice.ref.empty()&&r->signals[0].facts.size()==2,"result owns descriptors and index containers");
    std::cout<<"Resolved event tuples, source projection, intervals, bounds, cancellation and ownership passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
