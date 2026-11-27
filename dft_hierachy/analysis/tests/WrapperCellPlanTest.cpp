#include "CellPlanInternal.h"
#include "CellPlanJson.h"
#include "BoundaryJson.h"
#include <iostream>
#include <map>
#include <set>
#include <stdexcept>
namespace {
using namespace dft::wrapper;
using hier::model::BitRange;
size_t checks=0;
void need(bool v,const char *m){++checks;if(!v)throw std::runtime_error(m);}
auto open(const char *top) {
    hier::model::OpenOptions o;o.files={DFT_WRAPPER_PLAN_FIXTURE};o.tops={top};auto d=hier::Design::open(o);
    need(bool(d),"open");need(d.value()->diagnostics(10).errorCount==0,"compile");return std::move(d.value());
}
CellPlanRequest request(const char *scope,std::vector<std::string> ports={}) {CellPlanRequest r;r.boundary.scope=scope;r.boundary.ports=std::move(ports);return r;}
CellPlanReport run(hier::Design &d,const CellPlanRequest &r) {auto p=planWrapperCells(d,r);need(bool(p),"plan");return std::move(p.value());}
std::string json(const CellPlanReport &r){hier::protocol::JsonWriter w;writeCellPlan(w,r);return w.str();}
std::string source(const BoundaryReport &r){hier::protocol::JsonWriter w;writeBoundary(w,r);return w.str();}
// Small-fixture bit-set oracle deliberately does not implement production interval merging.
void accounting(const CellPlanReport &r) {
    std::map<std::string,std::set<uint64_t>> all;std::set<size_t> used;uint64_t sum=0,ins=0,outs=0,excluded=0,dedicated=0,blocked=0,shared=0;
    for(size_t i=0;i<r.plan.rows.size();++i) {
        const auto &row=r.plan.rows[i];need(row.sourceRow==i && i<r.source.rows.size(),"source prefix");
        if(r.source.rows[i].upstream)++outs;else ++ins;if(row.rule)used.insert(*row.rule);
        uint64_t bits=0;
        for(const auto &c:row.candidates) {
            std::set<uint64_t> witness;
            for(auto t:c.terminals) {
                const auto &sr=r.source.rows[i];need(t<sr.terminals.size(),"terminal index");const auto &term=sr.terminals[t];
                const auto &hop=sr.steps.at(term.step).response.result.hops.at(term.hop.value());
                const auto s=term.kind=="register_output"?hop.from:hop.next.at(term.continuation.value()).slice;
                need(s.ref==c.signal,"signal witness");for(uint64_t b=s.bits.lsb;b<s.bits.lsb+s.bits.width;++b)witness.insert(b);
            }
            std::set<uint64_t> ranges;for(auto v:c.ranges)for(uint64_t b=v.lsb;b<v.lsb+v.width;++b)ranges.insert(b);
            need(witness==ranges && c.bits==witness.size(),"candidate union cardinality");bits+=c.bits;
            if(row.decision=="shared_candidate")all[c.signal].insert(witness.begin(),witness.end());
        }
        need(bits==row.candidateBits,"row cardinality");
        if(row.decision=="shared_candidate"){++shared;sum+=bits;}
        else if(row.decision=="excluded")++excluded;else if(row.decision=="dedicated")++dedicated;else ++blocked;
    }
    uint64_t unique=0;need(all.size()==r.plan.sharedSignals.size(),"global signal count");
    for(const auto &s:r.plan.sharedSignals) {
        std::set<uint64_t> ranges;for(auto v:s.ranges)for(uint64_t b=v.lsb;b<v.lsb+v.width;++b)ranges.insert(b);
        need(ranges==all.at(s.signal) && s.bits==ranges.size(),"global union");unique+=s.bits;
        std::vector<size_t> expected;for(size_t i=0;i<r.plan.rows.size();++i)if(r.plan.rows[i].decision=="shared_candidate")for(const auto &c:r.plan.rows[i].candidates)if(c.signal==s.signal)expected.push_back(i);
        need(expected==s.rows,"global row links");
    }
    std::vector<size_t> unused;for(size_t i=0;i<r.plan.rules.size();++i)if(!used.contains(i))unused.push_back(i);
    need(unused==r.plan.unusedRules,"no uncommitted rule consumption");const auto &c=r.plan.counts;
    need(c.inputRows==ins && c.outputRows==outs && c.excluded==excluded && c.dedicated==dedicated && c.blocked==blocked && c.sharedCandidate==shared,"decision counts");
    need(c.sharedCandidateBits==sum && c.uniqueSharedBits==unique && c.addedCells==dedicated,"resource counts");
}
}
int main()try {
    auto d=open("plan_top");auto req=request("plan_top",{"q","alias_q"});auto p=run(*d,req);
    need(p.plan.complete && p.plan.rows.size()==8 && p.plan.counts.sharedCandidateBits==8 && p.plan.counts.uniqueSharedBits==4,"aliases count once");accounting(p);
    auto original=investigateBoundary(*d,req.boundary);need(original && source(*original)==source(p.source),"source preserved on same snapshot");
    auto mixed=run(*d,request("plan_top",{"d"}));need(mixed.plan.complete && mixed.plan.rows[0].decision=="dedicated" && mixed.plan.rows[1].decision=="shared_candidate","mixed boundary not shared");accounting(mixed);
    auto controls=run(*d,request("plan_top",{"c"}));need(!controls.plan.complete && controls.plan.rows[0].reason=="control_usage","clock blocked");
    auto sel=open("plan_control");auto control=run(*sel,request("plan_control",{"sel"}));need(control.plan.rows[0].reason=="non_data_path","upstream condition not data");
    auto fan=open("plan_fanout");auto f=request("plan_fanout",{"d"});auto many=run(*fan,f);need(many.plan.complete && many.plan.rows[0].candidateBits==6 && many.plan.rows[0].reason=="candidate_limit" && many.plan.counts.addedCells==1,"fanout threshold");
    f.rules={{"d",CellDirection::Input,CellAction::Share,{}}};many=run(*fan,f);need(!many.plan.complete && many.plan.counts.blocked==1,"requested share cannot override threshold");
    f.policy.maxInputCandidates=6;many=run(*fan,f);need(many.plan.complete && many.plan.counts.uniqueSharedBits==6,"configured threshold");accounting(many);
    auto overlap=open("plan_overlap");auto ov=run(*overlap,request("plan_overlap",{"d"}));need(ov.plan.rows[0].candidateBits==4 && ov.plan.counts.uniqueSharedBits==4,"overlapping register facts union");need(ov.plan.rows[0].candidates[0].ranges==std::vector<BitRange>{{0,4}},"canonical adjacent ranges");accounting(ov);
    auto multi=open("plan_multi");auto mp=run(*multi,request("plan_multi",{"d"}));need(mp.plan.rows[0].candidates.size()==2 && mp.plan.counts.uniqueSharedBits==2,"occurrences not collapsed");accounting(mp);
    auto io=open("plan_io");auto ir=request("plan_io");ir.rules={{"p",CellDirection::Input,CellAction::Exclude,{}},{"p",CellDirection::Output,CellAction::Dedicated,{}}};auto ip=run(*io,ir);
    need(ip.plan.complete && ip.plan.counts.inputRows==2 && ip.plan.counts.outputRows==2 && ip.plan.counts.excluded==2 && ip.plan.counts.addedCells==2,"direction-specific inout");accounting(ip);
    auto unknown=request("plan_top",{"unknown_o"});unknown.rules={{"unknown_o",CellDirection::Both,CellAction::Exclude,{}}};auto up=run(*d,unknown);need(!up.source.complete && !up.plan.complete && up.plan.counts.excluded==1 && up.plan.unusedRules.empty(),"exclude cannot upgrade evidence");
    unknown.rules[0].action=CellAction::Dedicated;up=run(*d,unknown);need(!up.plan.complete && up.plan.counts.addedCells==1,"explicit dedicated retains partial");
    req.rules={{"q",CellDirection::Output,CellAction::Exclude,BitRange{0,1}},{"alias_q",CellDirection::Output,CellAction::Dedicated,BitRange{3,1}}};p=run(*d,req);need(p.plan.complete && p.plan.counts.excluded==1 && p.plan.counts.dedicated==1,"bit rules");accounting(p);
    for(uint64_t cap=1;cap<=p.plan.work;++cap) {
        req.limits.maxWork=cap;auto prefix=run(*d,req);need(prefix.plan.work==cap && prefix.plan.complete==(cap==p.plan.work),"work exact boundary");accounting(prefix);
        for(size_t i=0;i<prefix.plan.rows.size();++i)need(prefix.plan.rows[i].decision==p.plan.rows[i].decision && prefix.plan.rows[i].candidateBits==p.plan.rows[i].candidateBits,"atomic decision prefix");
        if(cap<p.plan.work)need(prefix.plan.stop && prefix.plan.stop->sourceRow==prefix.plan.rows.size(),"pending row stop");
    }
    req.limits={};req.limits.maxRows=3;auto prefix=run(*d,req);need(prefix.plan.rows.size()==3 && prefix.plan.stop->reason=="budget_rows" && prefix.plan.unusedRules==std::vector<size_t>{1},"row cap unused rule");accounting(prefix);
    req.limits={};req.boundary.limits.maxBits=1;prefix=run(*d,req);need(!prefix.plan.complete && prefix.source.rows.size()==1 && prefix.plan.rows.size()==1,"source partial retained");accounting(prefix);
    req=request("plan_top",{"q"});req.rules={{"missing",CellDirection::Both,CellAction::Share,{}}};prefix=run(*d,req);need(!prefix.plan.complete && prefix.plan.unusedRules==std::vector<size_t>{0},"unselected rule unused");
    auto expired=detail::planWrapperCellsWithDeadline(*d,req,std::chrono::steady_clock::time_point::min());need(expired && expired->source.complete && expired->plan.rows.empty() && expired->plan.work==0 && expired->plan.stop->reason=="budget_time","planning-only deadline");accounting(*expired);
    req.rules={{"q",CellDirection::Both,CellAction::Share,BitRange{3,2}}};auto bad=planWrapperCells(*d,req);need(!bad && bad.error().code==hier::ErrorCode::BadRequest,"known port bounds");
    for(int test=0;test<15;++test) {
        auto invalid=request("plan_top");invalid.rules={{"unused",CellDirection::Both,CellAction::Exclude,{}}};
        switch(test){case 0:invalid.policy.maxInputCandidates=0;break;case 1:invalid.policy.maxOutputCandidates=1000001;break;case 2:invalid.limits.maxRows=100001;break;case 3:invalid.limits.maxWork=0;break;case 4:invalid.limits.maxMillis=60001;break;
        case 5:invalid.rules[0].port="";break;case 6:invalid.rules[0].port=std::string("a\0b",3);break;case 7:invalid.rules[0].port=std::string(1,static_cast<char>(255));break;case 8:invalid.rules[0].direction=static_cast<CellDirection>(99);break;case 9:invalid.rules[0].action=static_cast<CellAction>(99);break;
        case 10:invalid.rules[0].bits=BitRange{0,0};break;case 11:invalid.rules[0].bits=BitRange{9007199254740991ULL,1};break;case 12:invalid.rules.push_back(invalid.rules[0]);break;case 13:invalid.rules[0].port=std::string(4097,'a');break;case 14:invalid.rules.resize(10001,invalid.rules[0]);break;}
        need(!validateCellPlanRequest(invalid),"invalid request rejected");std::stop_source stop;stop.request_stop();auto cancelled=planWrapperCells(*d,invalid,stop.get_token());need(!cancelled && cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel before validation");
    }
    req.rules={{"absent",CellDirection::Both,CellAction::Exclude,BitRange{0,2}},{"absent",CellDirection::Input,CellAction::Share,BitRange{1,1}}};need(!validateCellPlanRequest(req),"overlap even unused");req.rules[1].bits=BitRange{2,1};need(bool(validateCellPlanRequest(req)),"adjacent rules allowed");
    const auto saved=json(p);d.reset();req={};need(json(p)==saved,"owning report");
    std::cout<<checks<<" wrapper plan assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
