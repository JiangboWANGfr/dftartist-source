#include "ChainComparisonInternal.h"
#include "ChainComparisonJson.h"
#include "ChainPlanJson.h"
#include <iostream>
#include <stdexcept>
namespace {
using namespace dft::wrapper;size_t checks=0;
void need(bool ok,const char *why){++checks;if(!ok)throw std::runtime_error(why);}
template<class T>T take(hier::Result<T> r){if(!r)throw std::runtime_error(r.error().message);return std::move(r.value());}
std::string wire(const ChainPlanReport &r){hier::protocol::JsonWriter w;writeChainPlan(w,r);return w.str();}
std::string wire(const ChainComparisonReport &r){hier::protocol::JsonWriter w;writeChainComparison(w,r);return w.str();}
ChainComparisonRequest request() {
    ChainPlanRequest a;a.cells.boundary.scope="chain_top";a.cells.boundary.ports={"q","alias_q"};a.chains={{"scan",100},{"spare",5}};a.defaultChain="scan";
    auto b=a;b.cells.rules={{"q",CellDirection::Output,CellAction::Dedicated,{}},{"alias_q",CellDirection::Output,CellAction::Dedicated,{}}};b.chains={{"spare",7},{"scan",16},{"extra",2}};
    auto c=a;c.cells.rules={{"alias_q",CellDirection::Output,CellAction::Exclude,{}}};c.chains={{"aux",16}};c.defaultChain="aux";
    return {{{"shared",a},{"dedicated",b},{"excluded",c}},0,{}};
}
void audit(const ChainComparisonReport &r) {
    need(r.summaries.size()==r.configurations.size(),"summary cardinality");
    for(size_t i=0;i<r.configurations.size();++i) {
        const auto &s=r.summaries[i];need(s.configuration==i,"summary index");need(s.comparable==(r.configurations[i].layout.complete&&r.configurations[r.reference].layout.complete),"complete gate");need(s.delta.has_value()==s.comparable,"delta gate");
    }
    for(const auto &row:r.chains) {
        need(row.entries.size()==r.configurations.size(),"whole matrix row");
        if(row.referenceChain)need(r.configurations[r.reference].layout.chains[*row.referenceChain].name==row.name,"reference name link");
        for(size_t i=0;i<row.entries.size();++i) {
            const auto &e=row.entries[i];need(e.configuration==i&&e.comparable==r.summaries[i].comparable,"entry index/qualification");need(e.delta.has_value()==e.comparable,"entry delta gate");
            if(e.chain)need(r.configurations[i].layout.chains[*e.chain].name==row.name,"current name link");
        }
    }
}
}
int main()try {
    hier::model::OpenOptions open;open.tops={"chain_top"};open.files={DFT_WRAPPER_COMPARISON_FIXTURE};auto design=take(hier::Design::open(open));need(!design->diagnostics(100).errorCount,"actual RTL");
    auto r=request();auto good=take(compareWrapperChains(*design,r));audit(good);
    need(good.complete&&good.work==16&&good.chains.size()==4,"complete matrix/work");
    need(good.summaries[1].delta->totalBits==4&&good.summaries[1].delta->dedicatedBits==8&&good.summaries[1].delta->sharedBits==-4&&good.summaries[1].delta->reusedBits==-4,"hand calculated dedicated delta");
    need(good.summaries[2].delta->totalBits==0&&good.summaries[2].delta->excluded==4&&good.summaries[2].delta->placed==-4,"hand calculated exclusion delta");
    need(good.chains[0].name=="scan"&&good.chains[1].name=="spare"&&good.chains[2].name=="extra"&&good.chains[3].name=="aux","reference-first chain order");
    need(good.chains[0].entries[1].chain==1&&good.chains[0].entries[1].delta->capacity==-84&&good.chains[0].entries[1].delta->length==4,"reordered chain by name");
    need(good.chains[1].entries[1].delta->length==0&&good.chains[1].entries[1].delta->capacity==2,"unused declaration");
    need(good.chains[0].entries[2].presence=="removed"&&!good.chains[0].entries[2].chain&&good.chains[0].entries[2].delta->length==-4,"removed chain");
    need(good.chains[3].entries[2].presence=="added"&&good.chains[3].entries[2].delta->length==4&&good.chains[3].entries[0].presence=="absent","added/absent chain");
    for(size_t i=0;i<r.configurations.size();++i) {
        auto original=take(planWrapperChains(*design,r.configurations[i].request));const auto &config=good.configurations[i];
        need(wire(original)==wire(ChainPlanReport{{good.source,config.plan},config.layout}),"original source/plan/layout equality");
    }
    for(uint64_t work=1;work<=good.work;++work) {
        r.limits.maxWork=work;auto x=take(compareWrapperChains(*design,r));audit(x);need(x.work==work&&x.chains.size()==work/4,"atomic work prefix");
        need(x.complete==(work==good.work),"work completion");
        if(work<good.work)need(x.stop&&x.stop->reason=="budget_work"&&x.stop->chain==work/4,"stop index");
        need(x.summaries[1].delta->totalBits==4,"valid summary survives matrix truncation");
    }
    r=request();r.limits.maxChains=1;auto truncated=take(compareWrapperChains(*design,r));need(!truncated.complete&&truncated.work==4&&truncated.chains.size()==1&&truncated.stop->reason=="budget_chains"&&truncated.stop->chain==1,"chain prefix");
    r=request();auto expired=take(detail::compareWrapperChainsWithDeadline(*design,r,std::chrono::steady_clock::time_point::min()));audit(expired);need(!expired.complete&&expired.work==0&&expired.chains.empty()&&expired.stop->reason=="budget_time"&&expired.configurations[1].layout.complete&&expired.summaries[1].comparable,"deadline only matrix");
    r.reference=1;auto reverse=take(compareWrapperChains(*design,r));audit(reverse);need(reverse.summaries[0].delta->totalBits==-4&&reverse.chains[0].name=="spare","reverse delta and chain order");
    r=request();r.configurations[1].request.chains[1].capacity=1;auto partial=take(compareWrapperChains(*design,r));audit(partial);need(!partial.complete&&!partial.summaries[1].delta&&partial.summaries[2].delta.has_value(),"one partial leaves other pair comparable");
    r.reference=1;auto refPartial=take(compareWrapperChains(*design,r));audit(refPartial);for(const auto &s:refPartial.summaries)need(!s.delta,"partial reference disables all deltas");
    r=request();for(auto &config:r.configurations)config.request.cells.boundary.limits.maxBits=2;auto sourcePartial=take(compareWrapperChains(*design,r));audit(sourcePartial);need(!sourcePartial.source.complete&&!sourcePartial.complete,"source partial retained");
    r=request();r.configurations[1].request.cells.limits.maxWork=1;auto planPartial=take(compareWrapperChains(*design,r));audit(planPartial);need(!planPartial.summaries[1].delta,"cell plan partial disables delta");
    r=request();r.configurations[1].request.chains[0].capacity=9007199254740991ULL;auto large=take(compareWrapperChains(*design,r));need(large.chains[1].entries[1].delta->capacity==9007199254740986LL,"safe exact large capacity delta");
    r=request();for(size_t i=r.configurations.size();i<8;++i)r.configurations.push_back({"copy"+std::to_string(i),r.configurations[0].request});auto eight=take(compareWrapperChains(*design,r));audit(eight);need(eight.complete&&eight.work==36&&eight.configurations.size()==8,"eight configurations");
    for(int kind=0;kind<12;++kind) {
        auto invalid=request();
        switch(kind) {
            case 0:invalid.configurations.resize(1);break;
            case 1:while(invalid.configurations.size()<9)invalid.configurations.push_back(invalid.configurations[0]);break;
            case 2:invalid.reference=3;break;
            case 3:invalid.configurations[1].name="shared";break;
            case 4:invalid.configurations[1].name="";break;
            case 5:invalid.configurations[1].name=std::string(4097,'x');break;
            case 6:invalid.configurations[1].name=std::string("x\0y",3);break;
            case 7:invalid.configurations[1].request.cells.boundary.ports={"alias_q","q"};break;
            case 8:invalid.configurations[1].request.cells.boundary.limits.maxWork=1;break;
            case 9:invalid.configurations[1].request.cells.boundary.scope="absent";break;
            case 10:invalid.limits.maxWork=0;break;
            case 11:invalid.configurations[1].request.defaultChain="missing";break;
        }
        auto bad=compareWrapperChains(*design,invalid);need(!bad&&bad.error().code==hier::ErrorCode::BadRequest,"whole request validated first");
    }
    r=request();r.configurations[2].request.assignments={{"q",CellDirection::Output,hier::model::BitRange{4,1},"aux"}};auto width=compareWrapperChains(*design,r);need(!width&&width.error().code==hier::ErrorCode::BadRequest,"runtime width fails whole call");
    std::stop_source stop;stop.request_stop();need(compareWrapperChains(*design,{},stop.get_token()).error().code==hier::ErrorCode::Cancelled,"pre-cancel before validation");
    const auto saved=wire(good);design.reset();r={};need(wire(good)==saved,"owning comparison after release");
    std::cout<<checks<<" wrapper comparison assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
