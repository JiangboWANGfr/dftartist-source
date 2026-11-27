#include "MemoryTestRulesInput.h"
#include "MemoryTestRulesJson.h"
#include "MemoryTestPlanJson.h"
#include <iostream>
#include <algorithm>
#include <map>
#include <stdexcept>
namespace {
using namespace dft::memory;size_t checks=0;
void need(bool v,const char *why){++checks;if(!v)throw std::runtime_error(why);}
MemoryTestRuleRequest request(){MemoryTestRuleRequest r;auto &i=r.test.investigation;i.scope="rule_top";i.recursive=true;
 i.mapping.models={{"rule_ram",8,8,1,{{MemoryRole::Clock,"CLK",PinSense::Posedge},{MemoryRole::Address,"A",PinSense::None},{MemoryRole::DataIn,"D",PinSense::None},{MemoryRole::DataOut,"Q",PinSense::None}}}};
 r.test.planning.profiles={{"rule_ram",2,100000}};
 r.rules={{{"rule_top"},true,"default",""},{{"rule_top","left"},true,"left","P"},{{"rule_top","left","ram"},false,"exact",""},{{"rule_top","left.dot"},true,"escaped",""},{{"rule_top","bank[1]"},true,"array",""},{{"absent"},true,"absent",""},{{"rule_top","left"},false,"group-only",""}};return r;}
std::string json(const MemoryTestReport &r){hier::protocol::JsonWriter w(true);writeMemoryTestPlan(w,r);return w.str();}
std::string replace(std::string s,const std::string &a,const std::string &b){auto i=s.find(a);need(i!=std::string::npos,"mutation token");s.replace(i,a.size(),b);return s;}
}
int main()try {
 hier::model::OpenOptions o;o.tops={"rule_top"};o.files={DFT_MEMORY_RULE_FIXTURE};auto d=hier::Design::open(o);need(d&&d.value()->diagnostics(100).errorCount==0,"open rule fixture");auto r=request();auto p=planMemoryTestsByRules(*d.value(),r);need(p&&p->report.plan.complete,"complete rule plan");
 need(p->choices.size()==8&&p->report.plan.scheduledInstances==8&&p->report.plan.scheduledCapacityBits==512&&p->report.plan.controllers.size()==5,"real hierarchy allocation");need(p->unusedRules==std::vector<size_t>({5,6}),"unused includes out-of-scope and non-recursive parent");
 auto manual=r.test;const auto &facts=p->report.investigation;std::vector<size_t> chosen;
 for(size_t i=0;i<p->choices.size();++i){const auto &c=p->choices[i];const auto &inst=facts.interfaces.catalog.instances[facts.interfaces.macros[facts.mapping.memories[i].macro].instance].info;size_t expected=0;
  if(inst.path[1]=="left")expected=inst.path.back()=="ram"?2:1;else if(inst.path[1]=="left.dot")expected=3;else if(inst.path[1]=="bank[1]")expected=4;
  need(c.memory==i&&c.rule==expected&&c.assignment==i,"segment identity and precedence");const auto &rule=r.rules[expected];manual.planning.assignments.push_back({inst.pathText,rule.clockDomain,rule.partition});chosen.push_back(expected);
 }
 auto q=planMemoryTests(*d.value(),manual);need(q&&json(q.value())==json(p->report),"identical original report from explicit assignments");need(p->visitedSegments<=24,"trie visits segments rather than rules times instances");
 auto reverse=r;std::reverse(reverse.rules.begin(),reverse.rules.end());auto rev=planMemoryTestsByRules(*d.value(),reverse);need(rev&&json(rev->report)==json(p->report),"precedence independent of declaration order");
 auto many=r;while(many.rules.size()<1024)many.rules.push_back({{"unused"+std::to_string(many.rules.size())},true,"unused",""});auto manyPlan=planMemoryTestsByRules(*d.value(),many);need(manyPlan&&manyPlan->visitedSegments==p->visitedSegments&&json(manyPlan->report)==json(p->report),"max rules no per-row rule scan");
 auto same=r;same.rules.push_back({{"rule_top","left","ram"},true,"subtree",""});auto sp=planMemoryTestsByRules(*d.value(),same);need(sp&&json(sp->report)==json(p->report)&&sp->unusedRules.back()==7,"exact beats subtree at same path");
 auto limited=r;limited.test.planning.limits.maxWork=2;auto lp=planMemoryTestsByRules(*d.value(),limited);need(lp&&!lp->report.plan.complete&&lp->choices.size()==8&&lp->report.plan.memories.size()==2&&lp->report.plan.unusedAssignments.size()==6,"resolution kept when planner publishes prefix");
 auto cap=r;cap.test.planning.limits.maxWork=8;need(planMemoryTestsByRules(*d.value(),cap)->report.plan.complete,"exact cap complete");
 auto subset=r;subset.test.investigation.scope="rule_top.left";auto sub=planMemoryTestsByRules(*d.value(),subset);need(sub&&sub->choices.size()==2&&sub->report.plan.complete,"rules above investigation scope match actual full paths");
 auto missing=r;missing.rules={{{"absent"},true,"x",""}};auto mp=planMemoryTestsByRules(*d.value(),missing);need(mp&&!mp->report.plan.complete&&mp->report.plan.scheduledInstances==0&&mp->report.plan.request.assignments.empty(),"unmatched rules do not guess domain");for(const auto &v:mp->choices)need(!v.rule&&!v.assignment,"no invented source index");
 auto empty=r;empty.test.investigation.recursive=false;auto ep=planMemoryTestsByRules(*d.value(),empty);need(ep&&ep->report.plan.complete&&ep->choices.empty()&&ep->unusedRules.size()==r.rules.size(),"empty observed candidate set keeps informational unused rules");
 for(int k=0;k<10;++k){auto bad=r;bad.test.investigation.scope="absent";switch(k){case 0:bad.rules.clear();break;case 1:bad.rules.push_back(bad.rules[0]);break;case 2:bad.rules[0].path.clear();break;case 3:bad.rules[0].path={""};break;case 4:bad.rules[0].clockDomain="";break;case 5:bad.rules[0].partition=std::string(1,char(0xff));break;case 6:bad.rules[0].path[0]=std::string("a\0b",3);break;case 7:bad.rules[0].path.assign(257,"s");break;case 8:bad.test.planning.assignments={{"a","clk",""}};break;case 9:bad.test.planning.profiles[0].powerMicrowatts=0;break;}auto result=planMemoryTestsByRules(*d.value(),bad);need(!result&&result.error().code==hier::ErrorCode::BadRequest,"all rule/plan validation before lookup");}
 const std::string input=R"({"formatVersion":1,"kind":"memory-test-rules","rules":[{"path":["rule_top"],"recursive":true,"clockDomain":"clk","partition":""}]})";
 auto parsed=parseMemoryTestRules(input);need(parsed&&parsed->size()==1&&parsed->front().path==std::vector<std::string>({"rule_top"}),"rule input parse");
 for(const auto &bad:{input+"x",replace(input,"\"recursive\":true","\"recursive\":1"),replace(input,"\"path\":[\"rule_top\"]","\"path\":\"rule_top\""),replace(input,"\"formatVersion\":1","\"formatVersion\":1.0000000000000001"),replace(input,"\"clockDomain\":\"clk\"","\"clockDomain\":\"clk\",\"clockDoma\\u0069n\":\"clk\""),replace(input,"\"clk\"","\"\\uD800\""),replace(input,"\"partition\":\"\"","\"partition\":\"\",\"extra\":0")})need(!parseMemoryTestRules(bad),"strict rule file rejection");
 need(bool(parseMemoryTestRules(input+std::string(1048576-input.size(),' '))),"exact input byte cap");need(!parseMemoryTestRules(input+std::string(1048577-input.size(),' ')),"over cap");need(!loadMemoryTestRules("/absent-memory-rules"),"missing file");
 std::stop_source stop;stop.request_stop();need(planMemoryTestsByRules(*d.value(),{},stop.get_token()).error().code==hier::ErrorCode::Cancelled,"pre-cancel before validation");need(parseMemoryTestRules("bad",stop.get_token()).error().code==hier::ErrorCode::Cancelled,"parse pre-cancel");need(loadMemoryTestRules("/absent",stop.get_token()).error().code==hier::ErrorCode::Cancelled,"file pre-cancel");
 need(bool(planMemoryTestsByRules(*d.value(),r)),"errors do not contaminate design");auto bytes=json(p->report);r={};d.value().reset();need(json(p->report)==bytes&&p->rules[3].path[1]=="left.dot","owning rule/report lifetime");std::cout<<checks<<" memory test rule assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
