#include "MemoryClockSourcesInternal.h"
#include "MemoryInvestigationInternal.h"
#include "SourceLogic.h"
#include <algorithm>
#include <map>
#include <tuple>
namespace dft::memory {
namespace {
template<class T> T take(hier::Result<T> r) { if(!r)throw r.error();return std::move(r.value()); }
void checkpoint(hier::Cancel cancel) { if(cancel.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory clock analysis cancelled"}; }
void partial(MemoryClocks &c,const std::string &why) {
    c.complete=false;
    if(std::find(c.reasons.begin(),c.reasons.end(),why)==c.reasons.end())c.reasons.push_back(why);
}
}
void detail::validateMemoryClockRequest(const MemoryClockRequest &r) {
    prepareMemoryInvestigation(r.investigation);
    if(!r.limits.maxWork||r.limits.maxWork>1000000||!r.limits.maxDepth||r.limits.maxDepth>256||
       !r.limits.maxMillis||r.limits.maxMillis>60000)
        throw hier::Error{hier::ErrorCode::BadRequest,"Invalid memory clock limits"};
}
MemoryClocks detail::resolveMemoryClocks(hier::Design &design,const MemoryInvestigation &source,const MemoryClockLimits &limits,hier::Cancel cancel) {
        MemoryClocks c;
        if(!source.mapping.complete)partial(c,"source_partial");
        const auto deadline=std::chrono::steady_clock::now()+std::chrono::milliseconds(limits.maxMillis);
        std::set<std::string> tops;for(const auto &root:take(design.roots(cancel))){checkpoint(cancel);tops.insert(root.ref);}
        sequential::Request logic;logic.maxDepth=limits.maxDepth;logic.maxLogicWork=limits.maxWork;
        using Key=std::tuple<std::string,uint64_t,std::string>;
        std::map<Key,size_t> groups;
        const auto available=[&]()->std::string {
            checkpoint(cancel);
            if(std::chrono::steady_clock::now()>=deadline)return "budget_time";
            if(c.work>=limits.maxWork)return "budget_work";
            return {};
        };
        for(size_t i=0;i<source.mapping.memories.size();++i) {
            if(const auto why=available();!why.empty()){partial(c,why);break;}
            ++c.work;
            const auto &memory=source.mapping.memories[i];
            MemoryClockRow row;row.memory=i;row.macro=memory.macro;
            if(memory.status!="matched") {
                row.status="unmatched";row.reason="interface_unmatched";partial(c,row.reason);
            } else {
                const auto &model=source.mapping.request.models[*memory.model];
                const auto &macro=source.interfaces.macros[memory.macro];
                const auto role=std::find_if(memory.roles.begin(),memory.roles.end(),[&](const auto &r){return model.roles[r.role].role==MemoryRole::Clock;});
                if(role==memory.roles.end()||!role->compatible||!role->pin)
                    throw hier::Error{hier::ErrorCode::Internal,"Matched memory has no compatible clock"};
                row.pin=role->pin;
                const auto &pin=macro.pins[*row.pin];
                const hier::model::TracePoint point{{pin.port.ref,{0,1}},tops.contains(pin.object.inst)?"inside":"outside"};
                row.proof=sequential::detail::resolveSource(design,point,logic,tops,c.work,deadline,cancel);
                const auto &value=row.proof->result;
                row.status="unresolved";row.reason=value.verdict;
                if(value.verdict=="primary_input"&&value.origin&&value.sourceRef&&value.origin->slice.bits.width==1) {
                    const bool negative=(model.roles[role->role].sense==PinSense::Negedge) != bool(value.inversions%2);
                    const std::string edge=negative?"negedge":"posedge";
                    const Key key{*value.sourceRef,value.origin->slice.bits.lsb,edge};
                    auto at=groups.find(key);
                    if(at==groups.end()) {
                        if(const auto why=available();!why.empty()){row.reason=why;partial(c,why);}
                        else {
                            ++c.work;auto object=take(design.object(*value.sourceRef,cancel));
                            if(const auto after=available();after=="budget_time"){row.reason=after;partial(c,after);}
                            else {
                                const auto index=c.groups.size();
                                c.groups.push_back({*value.origin,std::move(object.pathText),edge,{}});
                                at=groups.emplace(key,index).first;
                            }
                        }
                    }
                    if(at!=groups.end()) {
                        row.group=at->second;row.status="resolved";row.reason.clear();
                        c.groups[*row.group].members.push_back(c.rows.size());++c.resolvedInstances;
                    }
                } else if(value.verdict=="constant"||value.verdict=="undriven")row.status="unusable";
                for(const auto &why:row.proof->reasons) {
                    if(why=="budget_time")partial(c,"budget_time");
                    if(why=="budget_logic_work")partial(c,"budget_work");
                }
                if(row.status!="resolved")partial(c,row.status=="unusable"?"source_unusable":"source_unresolved");
            }
            c.rows.push_back(std::move(row));
        }
        checkpoint(cancel);
        if(std::chrono::steady_clock::now()>=deadline)partial(c,"budget_time");
        return c;
}
hier::Result<MemoryClockReport> inspectMemoryClockSources(hier::Design &design,const MemoryClockRequest &request,hier::Cancel cancel) {
    try {
        checkpoint(cancel);detail::validateMemoryClockRequest(request);
        MemoryClockReport report{take(investigateMemories(design,request.investigation,cancel)),request.limits,{}};
        report.clocks=detail::resolveMemoryClocks(design,report.source,request.limits,cancel);
        return report;
    } catch(const hier::Error &e) { return e; }
}
}
