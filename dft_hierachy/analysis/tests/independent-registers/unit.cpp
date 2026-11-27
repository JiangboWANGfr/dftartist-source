#include "RegisterResolvedEvents.h"
#include <iostream>
#include <stdexcept>
#include <stop_token>
#include <tuple>
using namespace dft::sequential;
static unsigned n=0;
static void need(bool v,const char* why){++n;if(!v)throw std::runtime_error(why);}
static void bad(const auto& r,const char* why){need(!r&&r.error().code==hier::ErrorCode::BadRequest,why);}
static auto pointKey(const hier::model::TracePoint& p){return std::tuple(p.slice.ref,p.slice.bits.lsb,p.slice.bits.width,p.side);}
static auto open(const char* fixture,const char* top){hier::model::OpenOptions o;o.files={fixture};o.tops={top};auto d=hier::Design::open(o);need(d.ok(),"open own fixture");return std::move(d.value());}
int main(int argc,char** argv){try{
 need(argc==2,"fixture");std::stop_source stop;stop.request_stop();auto d=open(argv[1],"R_alias");StatisticsRequest req;req.scope="R_alias";
 auto cancelled=registerStatistics(*d,req,stop.get_token());need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"statistics pre-cancel");
 auto invalid=req;invalid.maxFacts=0;bad(registerStatistics(*d,invalid),"statistics invalid budget");
 auto st=registerStatistics(*d,req);need(st.ok()&&st->complete,"statistics after errors");need(st->totals.facts==2&&st->totals.factBits==10&&st->totals.coveredBits==8&&st->totals.overlapBits==2,"own alias write intervals");
 auto ec=groupRegisterEvents(*st,{},stop.get_token());need(!ec&&ec.error().code==hier::ErrorCode::Cancelled,"events pre-cancel");EventGroupLimits el;el.maxMembers=0;bad(groupRegisterEvents(*st,el),"events invalid limit");
 auto malformed=*st;malformed.facts[0].item=999999;bad(groupRegisterEvents(malformed),"original page item bounds");malformed=*st;++malformed.totals.factBits;bad(groupRegisterEvents(malformed),"inconsistent factBits rejected");
 RegisterControlOptions opt;opt.resolveLogic=true;
 auto pc=profileRegisterControls(*d,*st,opt,stop.get_token());need(!pc&&pc.error().code==hier::ErrorCode::Cancelled,"profile pre-cancel");
 auto io=opt;io.maxChecks=0;bad(profileRegisterControls(*d,*st,io),"profile invalid limit");malformed=*st;malformed.snapshot.snapshotId+="wrong";bad(profileRegisterControls(*d,malformed,opt),"profile wrong Design snapshot");
 auto profile=profileRegisterControls(*d,*st,opt);need(profile.ok()&&profile->complete&&profile->events.groups.size()==2&&profile->cohorts.size()==1,"alias event groups resolved");need(profile->cohorts[0].totals.coveredBits==8&&profile->cohorts[0].totals.overlapBits==2,"cohort recomputes original signal union");
 auto rc=groupResolvedRegisterEvents(*st,*profile,{},stop.get_token());need(!rc&&rc.error().code==hier::ErrorCode::Cancelled,"resolved pre-cancel");ResolvedEventLimits rl;rl.maxRows=0;bad(groupResolvedRegisterEvents(*st,*profile,rl),"resolved invalid limit");
 auto wrong=*profile;wrong.snapshotId+="wrong";bad(groupResolvedRegisterEvents(*st,wrong),"resolved snapshot mismatch");wrong=*profile;wrong.groupControls[0].clockCheck=99999;bad(groupResolvedRegisterEvents(*st,wrong),"resolved bad event check");
 need(profile->checks[0].source.has_value(),"proof source available");wrong=*profile;wrong.checks[0].source->inverted=!wrong.checks[0].source->inverted;bad(groupResolvedRegisterEvents(*st,wrong),"source projection must agree with original proof");
 auto truncated=opt;truncated.maxMembers=1;auto pp=profileRegisterControls(*d,*st,truncated);need(pp.ok()&&!pp->complete,"real profile member truncation");auto rr=groupResolvedRegisterEvents(*st,*pp);need(rr.ok()&&!rr->complete,"resolved never upgrades input quality");
 d.reset();auto events=groupRegisterEvents(*st);need(events.ok()&&events->complete&&events->groups.size()==2,"events after Design release");auto resolved=groupResolvedRegisterEvents(*st,*profile);need(resolved.ok()&&resolved->complete&&resolved->groups.size()==1,"resolved after Design release and failed calls");need(resolved->groups[0].totals.coveredBits==8&&resolved->crossGroupBits==0,"same resolved tuple no cross group");
 st=hier::Error{hier::ErrorCode::BadRequest,"released"};profile=hier::Error{hier::ErrorCode::BadRequest,"released"};need(events->groups[0].clock.signal.size()>0,"owned original event strings");need(resolved->groups[0].clock.source.kind=="primary_input"&&!resolved->signals[0].facts.empty(),"owned resolved value and index containers");
 auto m=open(argv[1],"R_mode");req.scope="R_mode";auto ms=registerStatistics(*m,req);need(ms.ok(),"mode statistics");opt.clockRoots={ClockRootInput{"R_mode.r0",0}};std::optional<hier::model::TracePoint> first;
 for(bool value:{false,true,false}){
  opt.inputValues={InputValueRequest{{"R_mode.sel",0},value}};auto p=profileRegisterControls(*m,*ms,opt);need(p.ok()&&p->complete&&p->cohorts.size()==1,"mode profile");need(p->cohorts[0].source.point.has_value(),"mode source identity");auto current=*p->cohorts[0].source.point;if(!first)first=current;need((pointKey(current)==pointKey(*first))==!value,"no source cache across 0/1/0");auto r=groupResolvedRegisterEvents(*ms,*p);need(r.ok()&&r->complete&&r->groups.size()==1,"resolved same context");
 }
 auto unknown=open(argv[1],"R_async_unknown");req.scope="R_async_unknown";auto us=registerStatistics(*unknown,req);need(us.ok(),"unknown-async statistics");RegisterControlOptions uo;uo.resolveLogic=true;auto up=profileRegisterControls(*unknown,*us,uo);need(up.ok()&&!up->complete&&up->cohorts.size()==1,"known clock does not prove async");auto ur=groupResolvedRegisterEvents(*us,*up);need(ur.ok()&&!ur->complete&&ur->groups.empty()&&!ur->rows.empty()&&!ur->rows[0].reasons.empty(),"unproven async remains unresolved");
 std::cout<<"{\"passed\":true,\"assertions\":"<<n<<"}\n";return 0;
 }catch(const std::exception& e){std::cerr<<"after "<<n<<" assertions: "<<e.what()<<'\n';return 1;}}
