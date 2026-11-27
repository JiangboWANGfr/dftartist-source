#include "ChainPlanInternal.h"
#include "ChainPlanJson.h"
#include "CellPlanJson.h"
#include <iostream>
#include <map>
#include <set>
#include <stdexcept>
namespace {
using namespace dft::wrapper;
using hier::model::BitRange;
size_t checks=0;
void need(bool b,const char *m){++checks;if(!b)throw std::runtime_error(m);}
auto open(const char *top){hier::model::OpenOptions o;o.tops={top};o.files={DFT_WRAPPER_CHAINS_FIXTURE};auto d=hier::Design::open(o);need(bool(d),"open");need(d.value()->diagnostics(10).errorCount==0,"compile");return std::move(d.value());}
ChainPlanRequest request(const char *scope,std::vector<std::string> ports={}) {ChainPlanRequest r;r.cells.boundary.scope=scope;r.cells.boundary.ports=std::move(ports);r.chains={{"scan",100}};r.defaultChain="scan";return r;}
ChainPlanReport run(hier::Design &d,const ChainPlanRequest &r){auto x=planWrapperChains(d,r);if(!x)throw std::runtime_error(x.error().message);++checks;return std::move(x.value());}
std::string json(const ChainPlanReport &r){hier::protocol::JsonWriter w;writeChainPlan(w,r);return w.str();}
std::string source(const CellPlanReport &r){hier::protocol::JsonWriter w;writeCellPlan(w,r);return w.str();}
// Reconstruct small-fixture logical bit identities from uses and compare source candidates.
void audit(const ChainPlanReport &r) {
    const auto &p=r.layout;uint64_t total=0,shared=0,dedicated=0,reused=0,placed=0,excluded=0,blocked=0;std::set<std::pair<std::string,uint64_t>> owned;std::set<size_t> used;
    for(const auto &c:p.chains){uint64_t end=0;for(const auto &s:c.segments){need(s.offset==end && s.length>0 && s.sourceRow<p.rows.size(),"contiguous committed chain");end+=s.length;if(s.kind=="shared"){need(s.signal && s.bits && s.bits->width==s.length,"shared identity");for(uint64_t b=s.bits->lsb;b<s.bits->lsb+s.length;++b)need(owned.emplace(*s.signal,b).second,"one owner per state bit");shared+=s.length;}else{need(s.kind=="dedicated" && s.length==1 && !s.signal && !s.bits,"dedicated identity");++dedicated;}}
        need(end==c.length && end<=c.capacity,"chain length capacity");total+=end;}
    for(size_t i=0;i<p.rows.size();++i){const auto &row=p.rows[i];need(row.sourceRow==i,"row prefix");if(row.assignment)used.insert(*row.assignment);
        if(row.status!="placed"){need(row.uses.empty() && row.newBits==0 && row.reusedBits==0,"no half failed mapping");if(row.status=="excluded")++excluded;else ++blocked;continue;}
        ++placed;need(row.chain.has_value(),"placed chain");const auto &chain=p.chains[*row.chain];uint64_t bits=0,newBits=0;std::set<std::pair<std::string,uint64_t>> identities,expected;
        for(const auto &u:row.uses){need(u.segment<chain.segments.size(),"use segment");const auto &s=chain.segments[u.segment];need(u.width>0 && u.offset+u.width<=s.length,"use bounds");bits+=u.width;if(s.sourceRow==i)newBits+=u.width;else need(s.sourceRow<i,"reuse previous");if(s.signal)for(uint64_t b=0;b<u.width;++b)need(identities.emplace(*s.signal,s.bits->lsb+u.offset+b).second,"row does not duplicate bits");}
        const auto &cell=r.source.plan.rows[i];for(const auto &c:cell.candidates)for(auto range:c.ranges)for(uint64_t b=range.lsb;b<range.lsb+range.width;++b)expected.emplace(c.signal,b);
        if(cell.decision=="shared_candidate")need(identities==expected,"all candidate bits placed");else need(bits==1 && identities.empty(),"dedicated uses one bit");
        need(row.newBits==newBits && row.reusedBits==bits-newBits,"row resource deltas");reused+=row.reusedBits;
    }
    std::vector<size_t> unused;for(size_t i=0;i<p.assignments.size();++i)if(!used.contains(i))unused.push_back(i);need(unused==p.unusedAssignments,"assignment atomic usage");
    const auto &c=p.counts;need(c.rows==p.rows.size() && c.placed==placed && c.excluded==excluded && c.blocked==blocked,"row counts");need(c.totalBits==total && c.sharedBits==shared && c.dedicatedBits==dedicated && c.reusedBits==reused,"resource counts");
}
}
int main()try{
    auto d=open("chain_top");auto r=request("chain_top",{"q","alias_q"});auto p=run(*d,r);need(p.layout.complete && p.layout.counts.totalBits==4 && p.layout.counts.reusedBits==4 && p.layout.counts.placed==8,"aliased outputs reuse");audit(p);
    auto blockedBudget=request("chain_top",{"c","q"});blockedBudget.limits.maxWork=1;auto bp=run(*d,blockedBudget);
    need(bp.layout.rows.size()==1 && bp.layout.rows[0].reason=="source_blocked" && bp.layout.counts.blocked==1 && bp.layout.counts.totalBits==0 && bp.layout.stop->sourceRow==1,"one work commits complete source-blocked row");audit(bp);
    auto original=planWrapperCells(*d,r.cells);need(original && source(*original)==source(p.source),"original cell plan unchanged");
    r.assignments={{"q",CellDirection::Output,{},"scan"},{"alias_q",CellDirection::Output,{},"other"}};r.chains.push_back({"other",100});auto conflict=run(*d,r);need(!conflict.layout.complete && conflict.layout.counts.blocked==4 && conflict.layout.chains[1].length==0 && conflict.layout.rows[4].reason=="chain_conflict","cross-chain conflicts isolated");audit(conflict);
    r=request("chain_top",{"q","alias_q"});r.chains[0].capacity=2;auto cap=run(*d,r);need(!cap.layout.complete && cap.layout.counts.totalBits==2 && cap.layout.counts.placed==4 && cap.layout.counts.reusedBits==2,"capacity permits later reuse");audit(cap);
    r.defaultChain.reset();auto unassigned=run(*d,r);need(unassigned.layout.counts.blocked==8 && unassigned.layout.rows[0].reason=="unassigned","no guessed chain");
    r=request("chain_top",{"c","constant_o"});r.cells.rules={{"c",CellDirection::Input,CellAction::Exclude,{}}};auto dedicated=run(*d,r);need(dedicated.layout.complete && dedicated.layout.counts.excluded==1 && dedicated.layout.counts.dedicatedBits==1,"exclude and dedicated");audit(dedicated);
    auto f=open("chain_fragments");auto fr=request("chain_fragments",{"a","b","d"});auto fragmented=run(*f,fr);need(fragmented.layout.complete && fragmented.layout.rows.size()==3 && fragmented.layout.rows[2].newBits==2 && fragmented.layout.rows[2].reusedBits==2 && fragmented.layout.rows[2].uses.size()==4,"fragmented range reuse");audit(fragmented);
    fr.chains[0].capacity=3;auto failed=run(*f,fr);need(failed.layout.counts.totalBits==2 && failed.layout.rows[2].reason=="capacity" && failed.layout.chains[0].segments.size()==2,"capacity rollback multiple segments");audit(failed);
    fr=request("chain_fragments",{"a","b","d","q"});fr.chains[0].capacity=3;failed=run(*f,fr);need(failed.layout.counts.totalBits==3 && failed.layout.rows[4].status=="placed" && failed.layout.rows[4].newBits==1,"failed row does not reserve bits");audit(failed);
    fr=request("chain_fragments",{"a","b","d","q"});fr.chains.push_back({"other",100});fr.assignments={{"b",CellDirection::Output,{},"other"}};
    failed=run(*f,fr);need(failed.layout.rows[2].reason=="chain_conflict" && failed.layout.rows[4].newBits==1 && failed.layout.chains[0].segments.size()==3 && failed.layout.chains[1].length==1,"conflict rolls back staged gap ownership");audit(failed);
    fr=request("chain_fragments",{"a","b","d"});fr.limits.maxSegments=3;failed=run(*f,fr);need(failed.layout.rows.size()==2 && failed.layout.counts.totalBits==2 && failed.layout.stop->reason=="budget_segments","segment budget atomic row");audit(failed);
    fr.limits={};fr.assignments={{"d",CellDirection::Input,{},"scan"}};auto base=run(*f,fr);
    for(uint64_t work=1;work<=base.layout.work;++work){fr.limits.maxWork=work;auto x=run(*f,fr);need(x.layout.work==work && x.layout.complete==(work==base.layout.work),"exact work boundary");audit(x);for(size_t i=0;i<x.layout.rows.size();++i)need(x.layout.rows[i].uses.size()==base.layout.rows[i].uses.size() && x.layout.rows[i].newBits==base.layout.rows[i].newBits,"atomic prefix");if(work<base.layout.work)need(x.layout.stop->sourceRow==x.layout.rows.size(),"stop source index");}
    fr.limits={};fr.limits.maxRows=2;failed=run(*f,fr);need(failed.layout.unusedAssignments==std::vector<size_t>{0} && failed.layout.stop->reason=="budget_rows","pending rule unused");audit(failed);
    fr.limits={};fr.cells.limits.maxRows=2;failed=run(*f,fr);need(!failed.layout.complete && failed.layout.rows.size()==2 && failed.layout.reasons[0]=="source_partial","source partial not upgraded");audit(failed);
    fr.cells.limits={};auto expired=detail::planWrapperChainsWithDeadline(*f,fr,std::chrono::steady_clock::time_point::min());need(expired && expired->source.plan.complete && expired->layout.work==0 && expired->layout.rows.empty() && expired->layout.stop->reason=="budget_time","planning deadline only");audit(*expired);
    auto io=open("chain_io");auto ir=request("chain_io");ir.chains.push_back({"out",2});ir.assignments={{"p",CellDirection::Output,{},"out"}};auto ip=run(*io,ir);need(ip.layout.complete && ip.layout.chains[0].length==2 && ip.layout.chains[1].length==2 && ip.layout.counts.dedicatedBits==4,"inout explicit chains");audit(ip);
    auto unknown=open("chain_unknown");auto ur=request("chain_unknown");auto up=run(*unknown,ur);need(!up.layout.complete && up.layout.rows[0].reason=="source_blocked","unknown blocked");ur.cells.rules={{"q",CellDirection::Output,CellAction::Dedicated,{}}};up=run(*unknown,ur);need(!up.layout.complete && up.layout.rows[0].status=="placed","explicit dedicated retains source partial");audit(up);
    r=request("chain_top",{"q"});r.assignments={{"q",CellDirection::Output,BitRange{3,2},"scan"}};auto bad=planWrapperChains(*d,r);need(!bad && bad.error().code==hier::ErrorCode::BadRequest,"selected range bounds");
    r.assignments={{"missing",CellDirection::Both,{},"scan"}};auto unused=run(*d,r);need(!unused.layout.complete && unused.layout.unusedAssignments==std::vector<size_t>{0},"missing rule unused");
    for(int test=0;test<15;++test){auto v=request("chain_top");switch(test){case 0:v.chains.clear();break;case 1:v.chains[0].capacity=0;break;case 2:v.chains[0].capacity=9007199254740992ULL;break;case 3:v.chains.push_back(v.chains[0]);break;case 4:v.defaultChain="missing";break;case 5:v.defaultChain="";break;case 6:v.limits.maxWork=0;break;case 7:v.limits.maxSegments=100001;break;case 8:v.chains[0].name=std::string("x\0y",3);break;case 9:v.chains[0].name=std::string(1,static_cast<char>(255));break;case 10:v.assignments={{"q",CellDirection::Both,{},"scan"},{"q",CellDirection::Input,BitRange{1,1},"scan"}};break;case 11:v.assignments={{"q",static_cast<CellDirection>(99),{},"scan"}};break;case 12:v.assignments={{"q",CellDirection::Both,BitRange{0,0},"scan"}};break;case 13:v.assignments={{"q",CellDirection::Both,{},"missing"}};break;case 14:v.chains.resize(1025);break;}need(!validateChainPlanRequest(v),"invalid declaration");std::stop_source stop;stop.request_stop();auto x=planWrapperChains(*d,v,stop.get_token());need(!x && x.error().code==hier::ErrorCode::Cancelled,"cancel before invalid input");}
    const auto saved=json(p);d.reset();r={};need(json(p)==saved,"owned source and layout");std::cout<<checks<<" wrapper chains assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
