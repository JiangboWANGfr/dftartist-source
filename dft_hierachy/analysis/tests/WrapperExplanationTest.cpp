#include "ChainExplanationInternal.h"
#include "ChainExplanationJson.h"
#include "ChainCompatibilityJson.h"
#include <iostream>
#include <stdexcept>
#include <set>
#include <algorithm>
namespace {
using namespace dft::wrapper;size_t checks=0;
void need(bool b,const char *m){++checks;if(!b)throw std::runtime_error(m);}
template<class T>T take(hier::Result<T> r){if(!r)throw std::runtime_error(r.error().message);return std::move(r.value());}
auto design(){hier::model::OpenOptions o;o.tops={"compatibility_top"};o.files={DFT_WRAPPER_EXPLANATION_FIXTURE};auto d=take(hier::Design::open(o));need(!d->diagnostics(100).errorCount,"valid RTL");return d;}
ChainExplanationRequest request(std::vector<std::string> ports={"qa","qb","qp","qg"}){ChainExplanationRequest r;auto &p=r.resets.clock.chains;p.cells.boundary.scope="compatibility_top";p.cells.boundary.ports=ports;p.chains={{"first",100},{"unknown",100},{"unused",100}};p.defaultChain="first";if(std::find(ports.begin(),ports.end(),"qg")!=ports.end())p.assignments={{"qg",CellDirection::Output,{},"unknown"}};return r;}
std::string wire(const ChainExplanationReport &r){hier::protocol::JsonWriter w;writeChainExplanation(w,r);return w.str();}
std::string wire(const ChainCompatibilityReport &r){hier::protocol::JsonWriter w;writeChainCompatibility(w,r);return w.str();}
void audit(hier::Design &d,const ChainExplanationReport &x){const auto &e=x.explanation;const auto &plan=x.source.source.source.source;const auto &b=plan.source.source;uint64_t count=0;std::set<std::string> refs;
 need(e.work<=e.limits.maxWork&&e.rows.size()<=e.limits.maxChains&&e.locations.size()<=e.limits.maxLocations,"limits");
 for(const auto &loc:e.locations){need(refs.insert(loc.ref).second,"location dedup");auto source=d.source(loc.ref,hier::model::SourceKind::Definition);need(bool(source)==loc.span.has_value(),"source availability");if(loc.span)need(source->path==loc.span->path&&source->start.line==loc.span->start.line&&source->contentHash==loc.span->contentHash,"exact declaration source");}
 for(size_t ch=0;ch<e.rows.size();++ch){const auto &row=e.rows[ch];need(row.chain==ch,"chain prefix");count+=row.segments.size();
  if(row.compatibilityRow){const auto &original=x.source.compatibility.rows.at(*row.compatibilityRow);need(row.status==original.status&&row.controlsComplete==original.complete&&row.reasons==original.reasons,"original decisions");}else need(row.status=="pending"&&!row.controlsComplete,"pending not facts");
  need(row.segments.size()==plan.layout.chains[ch].segments.size(),"whole chain segments");
  for(size_t si=0;si<row.segments.size();++si){const auto &s=row.segments[si];const auto &seg=plan.layout.chains[ch].segments[si];const auto br=plan.source.plan.rows.at(seg.sourceRow).sourceRow;need(s.segment==si&&s.boundaryRow==br&&e.locations[s.portLocation].ref==b.ports[b.rows[br].port].ref,"boundary join");need(s.stateLocation.has_value()==seg.signal.has_value(),"state optional");if(s.stateLocation)need(e.locations[*s.stateLocation].ref==*seg.signal,"state join");if(s.clockRow){const auto &r=x.source.source.source.clocks.rows[*s.clockRow];need(r.chain==ch&&r.segment==si,"clock join");}if(s.resetRow){const auto &r=x.source.source.resets.rows[*s.resetRow];need(r.chain==ch&&r.segment==si,"reset join");}}
 }
 need(e.counts.chains==e.rows.size()&&e.counts.segments==count&&count<=e.limits.maxSegments,"atomic counts");need(e.counts.chains==e.counts.compatible+e.counts.conflict+e.counts.unresolved+e.counts.empty+e.counts.pending,"status counts");if(e.stop)need(e.stop->chain==e.rows.size(),"next uncommitted");if(!x.source.compatibility.complete)need(!e.complete,"source partial");
}
}
int main()try{
 auto d=design();auto r=request();auto full=take(explainWrapperChains(*d,r));audit(*d,full);need(!full.explanation.complete&&full.explanation.counts.conflict==1&&full.explanation.counts.unresolved==1&&full.explanation.counts.empty==1,"original conflict and unknown");
 need(wire(full.source)==wire(take(inspectWrapperChainCompatibility(*d,{r.resets,{},r.inspection}))),"whole original source");auto text=formatChainExplanation(full);need(text.find("conflicting_levels")!=std::string::npos&&text.find("async:")!=std::string::npos&&text.find("(declaration)")!=std::string::npos,"actionable text");
 for(uint64_t n=1;n<=full.explanation.work;++n){r.limits.maxWork=n;auto p=take(explainWrapperChains(*d,r));audit(*d,p);need(p.explanation.rows.size()<=full.explanation.rows.size(),"work prefix");for(size_t i=0;i<p.explanation.rows.size();++i)need(p.explanation.rows[i].segments.size()==full.explanation.rows[i].segments.size(),"no half segments");}
 r=request();for(uint64_t n=1;n<full.explanation.locations.size();++n){r.limits.maxLocations=n;auto p=take(explainWrapperChains(*d,r));audit(*d,p);need(p.explanation.stop->reason=="budget_locations","location cap");}
 r=request();r.limits.maxSegments=1;auto p=take(explainWrapperChains(*d,r));audit(*d,p);need(p.explanation.rows.empty()&&p.explanation.counts.segments==0&&p.explanation.stop->reason=="budget_segments","discard half chain retain locations");
 r=request();r.limits.maxChains=1;p=take(explainWrapperChains(*d,r));audit(*d,p);need(p.explanation.rows.size()==1&&p.explanation.stop->reason=="budget_chains","chain cap");
 r=request();r.inspection.maxGroups=1;p=take(explainWrapperChains(*d,r));audit(*d,p);need(p.explanation.counts.pending==2,"pending original compatibility");
 r=request({"qa"});auto good=take(explainWrapperChains(*d,r));audit(*d,good);need(good.explanation.complete&&good.explanation.counts.compatible==1,"known complete");r.resets.clock.chains.cells.rules={{"qa",CellDirection::Output,CellAction::Exclude,{}}};auto fixed=take(explainWrapperChains(*d,r));audit(*d,fixed);need(fixed.explanation.complete&&fixed.explanation.counts.empty==3&&fixed.explanation.locations.empty(),"constraint modification reverify");
 r=request({"qa"});r.resets.clock.chains.chains[0].name="line\n\x1b[31m";r.resets.clock.chains.defaultChain=r.resets.clock.chains.chains[0].name;auto quoted=formatChainExplanation(take(explainWrapperChains(*d,r)));need(quoted.find('\\')!=std::string::npos&&quoted.find('\x1b')==std::string::npos&&quoted.find("line\n")==std::string::npos,"escaped text values");
 for(int i=0;i<10;++i){r=request();auto &l=r.limits;switch(i){case 0:l.maxChains=0;break;case 1:l.maxChains=1025;break;case 2:l.maxSegments=0;break;case 3:l.maxSegments=100001;break;case 4:l.maxLocations=0;break;case 5:l.maxLocations=100001;break;case 6:l.maxWork=0;break;case 7:l.maxWork=10000001;break;case 8:l.maxMillis=0;break;default:l.maxMillis=60001;break;}r.resets.clock.chains.cells.boundary.scope="missing";need(explainWrapperChains(*d,r).error().code==hier::ErrorCode::BadRequest,"static before lookup");}
 r=request();auto expired=take(detail::explainWrapperChainsWithDeadline(*d,r,std::chrono::steady_clock::time_point::min()));audit(*d,expired);need(expired.explanation.work==0&&expired.explanation.rows.empty()&&expired.explanation.stop->reason=="budget_time","deadline");std::stop_source stop;stop.request_stop();need(explainWrapperChains(*d,{},stop.get_token()).error().code==hier::ErrorCode::Cancelled,"pre cancel");auto saved=wire(full);auto rendered=formatChainExplanation(full);d.reset();r={};need(saved==wire(full)&&rendered==formatChainExplanation(full),"owned evidence and text");std::cout<<checks<<" wrapper explanation assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
