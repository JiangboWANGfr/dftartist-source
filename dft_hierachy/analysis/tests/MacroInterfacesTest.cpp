#include "MacroInterfacesInternal.h"
#include <iostream>
#include <stdexcept>
#include <set>
namespace {
size_t checks=0;
void need(bool v,const char *s){++checks;if(!v)throw std::runtime_error(s);}
auto open(const char *top) {
    hier::model::OpenOptions o;o.tops={top};o.files={DFT_MACRO_FIXTURE};auto d=hier::Design::open(o);
    need(bool(d),"open fixture");return std::move(d.value());
}
}
int main()try {
    using namespace dft::memory;using hier::ErrorCode;
    auto d=open("macro_top");MacroRequest r;r.scope="macro_top";r.recursive=true;r.definitionNames={"ram_model"};r.clockPins={"CLK"};
    auto all=inspectMacroInterfaces(*d,r);need(bool(all),"macro result");need(all->complete,"known macro interface and clocks complete");
    need(all->macros.size()==7,"seven hand-written RAM-model occurrences");
    std::set<std::string> names;
    for(const auto &m:all->macros) {
        const auto &inst=all->catalog.instances[m.instance].info;names.insert(inst.pathText);
        need(m.pins.size()==3&&m.parent&&m.parentStatus&&m.missingClockPins.empty(),"full three pins and parent metadata");
        auto parent=d->bindings(m.parent->ref);need(bool(parent),"query parent directly");
        for(const auto &p:m.pins) {
            need(p.object.inst==inst.ref&&p.object.ref==p.port.ref,"contextual pin owner");
            need(d->object(p.port.ref)->pathText==p.object.pathText,"original canonical path");
            need(p.bindings.size()==1&&p.bindings[0].pin==p.port.ref&&p.bindings[0].port==p.port.name&&p.bindings[0].inst==inst.ref,"exact parent binding occurrence");
            const auto &binding=p.bindings[0];bool found=false;
            for(const auto &b:parent->bindings)if(b.pin==binding.pin&&b.inst==binding.inst){found=true;need(b.segments.size()==binding.segments.size(),"original binding segmentation");}
            need(found,"binding exists in Core parent");
            if(p.port.name=="CLK")need(p.clock&&p.clock->completeness.status=="complete"&&!p.clock->result.nodes.empty(),"structural clock trace present");
            else need(!p.clock,"data pins not inferred as clocks");
        }
    }
    need(names.size()==7&&names.contains("macro_top.left.a")&&names.contains("macro_top.right.a")&&names.contains("macro_top.\\ram.dot ")&&names.contains("macro_top.g[1].m"),"shared, generated, escaped occurrences remain separate");
    auto paged=r;paged.traversal.pageSize=1;auto pages=inspectMacroInterfaces(*d,paged);
    need(bool(pages)&&pages->complete&&pages->macros.size()==7,"paging independent");
    for(size_t i=0;i<7;++i)need(pages->macros[i].pins[0].port.ref==all->macros[i].pins[0].port.ref,"paging preserves macro order");
    auto scoped=r;scoped.scope="macro_top.left.a";scoped.recursive=false;auto child=inspectMacroInterfaces(*d,scoped);
    need(child&&child->complete&&child->macros.size()==1&&child->macros[0].parent->pathText=="macro_top.left","parent outside selected scope retained");
    auto exact=r;exact.limits.maxMacros=7;exact.limits.maxPins=21;exact.limits.maxBindings=21;exact.limits.maxQueries=all->queries;exact.limits.maxWork=all->work;exact.limits.maxTraceNodes=all->traceNodes;exact.limits.maxTraceEdges=all->traceEdges;
    need(inspectMacroInterfaces(*d,exact)->complete,"exact published and cumulative budgets complete");
    for(unsigned n=0;n<7;++n) {
        auto cut=r;
        if(n==0)cut.limits.maxMacros=1;if(n==1)cut.limits.maxPins=1;if(n==2)cut.limits.maxBindings=1;
        if(n==3)cut.limits.maxQueries=1;if(n==4)cut.limits.maxWork=1;if(n==5)cut.limits.maxTraceNodes=1;if(n==6)cut.traversal.maxInstances=1;
        auto v=inspectMacroInterfaces(*d,cut);need(v&&!v->complete&&!v->reasons.empty(),"budget reports partial");
        for(size_t i=0;i<v->macros.size();++i)need(v->macros[i].pins.size()==3&&v->macros[i].instance==all->macros[i].instance,"only full macro prefix published");
    }
    auto missing=r;missing.clockPins={"NO_CLK"};auto mc=inspectMacroInterfaces(*d,missing);
    need(mc&&!mc->complete&&mc->macros.size()==7&&mc->macros[0].missingClockPins==missing.clockPins,"missing declared clock recorded");
    auto none=r;none.definitionNames={"RAM"};need(inspectMacroInterfaces(*d,none)->complete&&inspectMacroInterfaces(*d,none)->macros.empty(),"exact definition names, no heuristics");
    auto top=r;top.recursive=false;top.definitionNames={"macro_top"};auto root=inspectMacroInterfaces(*d,top);
    need(root&&root->complete&&!root->macros[0].parent&&root->macros[0].pins[0].bindings.empty(),"real top boundary allowed");
    auto expired=detail::inspectMacroInterfacesWithDeadline(*d,r,{});need(expired&&!expired->complete&&expired->macros.empty()&&expired->queries==0&&expired->work==0,"deterministic detail expiry retains catalog");
    std::stop_source stop;stop.request_stop();auto cancelled=inspectMacroInterfaces(*d,{},stop.get_token());need(!cancelled&&cancelled.error().code==ErrorCode::Cancelled,"pre-cancel precedes validation");
    for(unsigned n=0;n<6;++n){auto bad=r;bad.scope="missing";if(n==0)bad.definitionNames={};if(n==1)bad.clockPins={"C","C"};if(n==2)bad.definitionNames={"\xff"};if(n==3)bad.limits.maxQueries=0;if(n==4)bad.traversal.maxQueries=2;if(n==5)bad.limits.maxDepth=1025;auto v=inspectMacroInterfaces(*d,bad);need(!v&&v.error().code==ErrorCode::BadRequest,"full validation before Core lookup");}
    auto logic=open("macro_logic");r.scope="macro_logic";auto boundary=inspectMacroInterfaces(*logic,r);need(boundary&&!boundary->complete&&boundary->macros.size()==1&&boundary->macros[0].pins[0].clock,"process boundary preserved");
    auto owned=std::move(all.value());d.reset();r={};need(owned.macros.size()==7&&!owned.macros[0].pins[0].object.pathText.empty(),"owned after Design/request release");
    std::cout<<checks<<" macro interface assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
