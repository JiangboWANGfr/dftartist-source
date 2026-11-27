#include "ChainCoverageInternal.h"
#include "ChainCoverageJson.h"
#include "ChainPlanJson.h"
#include <iostream>
#include <map>
#include <stdexcept>
namespace {
using namespace dft::wrapper;size_t checks=0;
void need(bool b,const char *m){++checks;if(!b)throw std::runtime_error(m);}
template<class T>T take(hier::Result<T> r){if(!r)throw std::runtime_error(r.error().message);return std::move(r.value());}
std::string wire(const ChainPlanReport &r){hier::protocol::JsonWriter w;writeChainPlan(w,r);return w.str();}
std::string wire(const ChainCoverageReport &r){hier::protocol::JsonWriter w;writeChainCoverage(w,r);return w.str();}
ChainCoverageRequest request(std::string top="chain_top",std::vector<std::string> ports={"q","alias_q"}) {
    ChainCoverageRequest r;r.chains.cells.boundary.scope=std::move(top);r.chains.cells.boundary.ports=std::move(ports);r.chains.chains={{"scan",100}};r.chains.defaultChain="scan";return r;
}
auto design(const std::string &top){hier::model::OpenOptions o;o.tops={top};o.files={DFT_WRAPPER_COVERAGE_FIXTURE};auto d=take(hier::Design::open(o));need(d->diagnostics(100).errorCount==0,"RTL open");return d;}
void audit(const ChainCoverageReport &x) {
    const auto &c=x.coverage;uint64_t positions=0,placed=0,excluded=0,blocked=0,pending=0;std::map<std::pair<size_t,bool>,std::pair<uint64_t,uint64_t>> groups;
    for(size_t i=0;i<c.rows.size();++i) {
        const auto &r=c.rows[i];need(r.sourceRow==i,"boundary prefix index");const auto &b=x.source.source.source.rows[i];auto &g=groups[{b.port,b.upstream}];++g.first;g.second+=r.positions.size();positions+=r.positions.size();
        placed+=r.status=="placed";excluded+=r.status=="excluded";blocked+=r.status=="blocked";pending+=r.status=="pending";
        if(r.cellRow)need(x.source.source.plan.rows[*r.cellRow].sourceRow==i,"cell link");
        if(r.chainRow)need(x.source.layout.rows[*r.chainRow].sourceRow==r.cellRow,"chain link");
        if(r.status!="placed")need(r.positions.empty(),"no partial placements");
        for(const auto &p:r.positions) {
            const auto &cr=x.source.layout.rows[*r.chainRow];const auto &u=cr.uses[p.use];const auto &s=x.source.layout.chains[p.chain].segments[p.segment];
            need(cr.chain==p.chain&&u.segment==p.segment&&p.chainOffset==s.offset+u.offset&&p.width==u.width,"original position links");
            need(p.chainOffset+p.width<=x.source.layout.chains[p.chain].length,"chain interval bounds");
            if(p.kind=="shared")need(p.signal==s.signal&&p.bits&&p.bits->lsb==s.bits->lsb+u.offset&&p.bits->width==u.width,"state slice conversion");
            else need(!p.signal&&!p.bits,"dedicated no invented state");
        }
    }
    need(c.counts.rows==c.rows.size()&&c.counts.positions==positions&&c.counts.placed==placed&&c.counts.excluded==excluded&&c.counts.blocked==blocked&&c.counts.pending==pending,"counts exact prefix");
    need(groups.size()==c.ports.size(),"no ghost ports");
    for(const auto &p:c.ports){const auto &g=groups.at({p.port,p.upstream});need(g.first==p.counts.rows&&g.second==p.counts.positions,"port counts exact prefix");}
}
}
int main()try {
    auto d=design("chain_top");auto r=request();auto good=take(inspectWrapperCoverage(*d,r));audit(good);
    need(good.coverage.complete&&good.coverage.work==16&&good.coverage.counts.placed==8&&good.coverage.counts.positions==8&&good.coverage.ports.size()==2,"shared bit coverage");
    need(wire(good.source)==wire(take(planWrapperChains(*d,r.chains))),"original complete source unchanged");
    for(size_t i=0;i<8;++i){const auto &p=good.coverage.rows[i].positions.at(0);need(p.chainOffset==i%4&&p.bits->lsb==i%4&&p.width==1,"hand alias positions");}
    for(uint64_t work=1;work<=16;++work){r.limits.maxWork=work;auto x=take(inspectWrapperCoverage(*d,r));audit(x);need(x.coverage.work==work&&x.coverage.rows.size()==work/2&&x.coverage.complete==(work==16),"atomic work prefix");if(work<16)need(x.coverage.stop->sourceRow==work/2&&x.coverage.stop->reason=="budget_work","work stop index");}
    r=request();r.limits.maxRows=1;auto rowcap=take(inspectWrapperCoverage(*d,r));audit(rowcap);need(rowcap.coverage.rows.size()==1&&rowcap.coverage.stop->sourceRow==1&&rowcap.coverage.stop->reason=="budget_rows","row cap");
    r=request();r.limits.maxPositions=1;auto poscap=take(inspectWrapperCoverage(*d,r));audit(poscap);need(poscap.coverage.work==3&&poscap.coverage.rows.size()==1&&poscap.coverage.stop->reason=="budget_positions","position cap staged row");
    r=request();r.chains.cells.rules={{"alias_q",CellDirection::Output,CellAction::Exclude,{}}};r.limits.maxPositions=4;auto excluded=take(inspectWrapperCoverage(*d,r));audit(excluded);need(excluded.coverage.complete&&excluded.coverage.counts.excluded==4&&excluded.coverage.work==12,"full positions still admits excluded rows");need(excluded.coverage.rows[4].stage=="planning"&&excluded.coverage.rows[4].reason=="declared_exclude"&&excluded.coverage.rows[4].chainRow==4,"exclusion origin");
    r.chains.limits.maxRows=1;auto known=take(inspectWrapperCoverage(*d,r));audit(known);need(known.coverage.counts.placed==1&&known.coverage.counts.pending==3&&known.coverage.counts.excluded==4&&!known.coverage.rows[4].chainRow,"known exclusion survives chain prefix");
    r=request();r.chains.cells.limits.maxRows=1;auto unplanned=take(inspectWrapperCoverage(*d,r));audit(unplanned);need(unplanned.coverage.counts.pending==7&&unplanned.coverage.rows[1].reason=="planning_not_reached"&&!unplanned.coverage.rows[1].cellRow,"planning pending not blocked");
    r=request();r.chains.limits.maxRows=1;auto unchained=take(inspectWrapperCoverage(*d,r));audit(unchained);need(unchained.coverage.rows[1].reason=="chain_not_reached"&&unchained.coverage.rows[1].cellRow==1,"chaining pending");
    r=request();r.chains.chains[0].capacity=1;auto capacity=take(inspectWrapperCoverage(*d,r));audit(capacity);need(capacity.coverage.counts.placed==2&&capacity.coverage.counts.blocked==6&&capacity.coverage.rows[1].reason=="capacity","capacity and alias reuse");
    r=request();r.chains.defaultChain.reset();auto unassigned=take(inspectWrapperCoverage(*d,r));need(unassigned.coverage.counts.blocked==8&&unassigned.coverage.rows[0].reason=="unassigned","unassigned origin");
    r=request();r.chains.chains.push_back({"other",8});r.chains.assignments={{"alias_q",CellDirection::Output,{},"other"}};auto conflict=take(inspectWrapperCoverage(*d,r));audit(conflict);need(conflict.coverage.counts.blocked==4&&conflict.coverage.rows[4].reason=="chain_conflict","conflict no positions");
    r=request();r.chains.cells.rules={{"q",CellDirection::Output,CellAction::Dedicated,{}}};auto dedicated=take(inspectWrapperCoverage(*d,r));audit(dedicated);need(dedicated.coverage.rows[0].positions[0].kind=="dedicated"&&dedicated.coverage.rows[4].positions[0].chainOffset==4,"dedicated then shared positions");
    r=request("chain_top",{"c"});auto control=take(inspectWrapperCoverage(*d,r));audit(control);need(control.coverage.rows[0].status=="blocked"&&control.coverage.rows[0].stage=="planning"&&control.coverage.rows[0].reason=="control_usage","specific planning cause instead of source_blocked");
    r=request();r.chains.cells.boundary.limits.maxBits=1;auto sourcePartial=take(inspectWrapperCoverage(*d,r));audit(sourcePartial);need(!sourcePartial.coverage.complete&&sourcePartial.coverage.rows.size()==1&&sourcePartial.coverage.counts.placed==1,"only observed rows no quality upgrade");
    r=request();auto expired=take(detail::inspectWrapperCoverageWithDeadline(*d,r, std::chrono::steady_clock::time_point::min()));audit(expired);need(expired.source.layout.complete&&expired.coverage.rows.empty()&&expired.coverage.work==0&&expired.coverage.stop->reason=="budget_time","coverage deadline after original plan");
    auto io=design("chain_io");auto both=take(inspectWrapperCoverage(*io,request("chain_io",{"p"})));audit(both);need(both.coverage.ports.size()==2&&both.coverage.ports[0].port==both.coverage.ports[1].port&&both.coverage.ports[0].upstream!=both.coverage.ports[1].upstream,"inout separate directions");
    auto fragment=design("chain_fragments");r=request("chain_fragments",{"a","b","d"});auto multi=take(inspectWrapperCoverage(*fragment,r));audit(multi);const auto &last=multi.coverage.rows.back();need(last.positions.size()==4,"fragmented source spans");
    for(size_t i=0;i<4;++i)need(last.positions[i].chainOffset==std::vector<uint64_t>{0,2,1,3}[i]&&last.positions[i].bits->lsb==i,"independent fragmented state ordering");
    r.limits.maxPositions=3;auto rollback=take(inspectWrapperCoverage(*fragment,r));audit(rollback);need(rollback.coverage.rows.size()==2&&rollback.coverage.counts.positions==2&&rollback.coverage.ports.size()==2&&rollback.coverage.stop->sourceRow==2,"discard partial positions and new port group");
    for(int i=0;i<9;++i){r=request();switch(i){case 0:r.limits.maxRows=0;break;case 1:r.limits.maxRows=100001;break;case 2:r.limits.maxPositions=0;break;case 3:r.limits.maxPositions=100001;break;case 4:r.limits.maxWork=0;break;case 5:r.limits.maxWork=10000001;break;case 6:r.limits.maxMillis=0;break;case 7:r.limits.maxMillis=60001;break;default:r.chains.defaultChain="missing";break;}auto bad=inspectWrapperCoverage(*d,r);need(!bad&&bad.error().code==hier::ErrorCode::BadRequest,"static bad request");}
    std::stop_source stop;stop.request_stop();need(inspectWrapperCoverage(*d,{},stop.get_token()).error().code==hier::ErrorCode::Cancelled,"pre-cancel wins validation");
    r=request();r.chains.assignments={{"q",CellDirection::Output,hier::model::BitRange{4,1},"scan"}};need(inspectWrapperCoverage(*d,r).error().code==hier::ErrorCode::BadRequest,"runtime width error unchanged");
    const auto saved=wire(good);d.reset();r={};need(wire(good)==saved,"owned after release");std::cout<<checks<<" wrapper coverage assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
