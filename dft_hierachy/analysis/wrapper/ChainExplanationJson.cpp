#include "ChainExplanationJson.h"
#include "ChainCompatibilityJson.h"
#include <sstream>
#include <set>
namespace dft::wrapper {
void writeChainExplanation(hier::protocol::JsonWriter &w,const ChainExplanationReport &report){
    using hier::protocol::write;const auto &r=report.explanation;const auto &l=r.limits;
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-wrapper-chain-explanation-v1").key("source");writeChainCompatibility(w,report.source);
    w.key("explanation").beginObject().key("limits").beginObject().key("maxChains").value(l.maxChains).key("maxSegments").value(l.maxSegments).key("maxLocations").value(l.maxLocations).key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).endObject()
        .key("complete").value(r.complete).key("work").value(r.work).key("reasons");write(w,r.reasons);
    w.key("locations").beginArray();for(const auto &x:r.locations){w.beginObject().key("ref").value(x.ref);if(x.span){w.key("span");write(w,*x.span);}if(x.error){w.key("error");write(w,*x.error);}w.endObject();}w.endArray();
    w.key("rows").beginArray();for(const auto &x:r.rows){w.beginObject().key("chain").value(uint64_t(x.chain)).key("status").value(x.status).key("controlsComplete").value(x.controlsComplete).key("reasons");write(w,x.reasons);if(x.compatibilityRow)w.key("compatibilityRow").value(uint64_t(*x.compatibilityRow));
        w.key("segments").beginArray();for(const auto &s:x.segments){w.beginObject().key("segment").value(uint64_t(s.segment)).key("boundaryRow").value(uint64_t(s.boundaryRow)).key("portLocation").value(uint64_t(s.portLocation));if(s.stateLocation)w.key("stateLocation").value(uint64_t(*s.stateLocation));if(s.clockRow)w.key("clockRow").value(uint64_t(*s.clockRow));if(s.resetRow)w.key("resetRow").value(uint64_t(*s.resetRow));w.endObject();}w.endArray().endObject();}w.endArray();
    const auto &c=r.counts;w.key("counts").beginObject().key("chains").value(c.chains).key("segments").value(c.segments).key("compatible").value(c.compatible).key("conflict").value(c.conflict).key("unresolved").value(c.unresolved).key("empty").value(c.empty).key("pending").value(c.pending).endObject();
    if(r.stop)w.key("stop").beginObject().key("reason").value(r.stop->reason).key("chain").value(uint64_t(r.stop->chain)).endObject();w.endObject().endObject();
}
std::string formatChainExplanation(const ChainExplanationReport &report){
    const auto quote=[](const std::string &s){hier::protocol::JsonWriter w;w.value(s);return w.str();};
    const auto &e=report.explanation;const auto &compat=report.source;const auto &reset=compat.source.resets;const auto &clock=compat.source.source.clocks;
    const auto &plan=compat.source.source.source;const auto &boundary=plan.source.source;std::ostringstream text;
    text<<"Wrapper chain diagnostics\nScope: "<<quote(boundary.scope.pathText)<<"\nSnapshot: "<<quote(boundary.snapshot.snapshotId)
        <<"\nEvidence: "<<(e.complete?"complete":"partial")<<"; input hash: "<<(boundary.snapshot.inputHashComplete?"complete":"partial")<<'\n';
    for(const auto &reason:e.reasons)text<<"Reason: "<<quote(reason)<<'\n';
    const auto stage=[&](const char *name,bool complete,const std::vector<std::string> &reasons){text<<name<<": "<<(complete?"complete":"partial");for(const auto &reason:reasons)text<<" "<<quote(reason);text<<'\n';};
    stage("Boundary",boundary.complete,boundary.reasons);stage("Cells",plan.source.plan.complete,plan.source.plan.reasons);stage("Layout",plan.layout.complete,plan.layout.reasons);
    stage("Clocks",clock.complete,clock.reasons);stage("Async",reset.complete,reset.reasons);stage("Compatibility",compat.compatibility.complete,compat.compatibility.reasons);
    const auto location=[&](size_t index){const auto &loc=e.locations.at(index);if(loc.span)text<<quote(loc.span->path)<<':'<<loc.span->start.line<<':'<<loc.span->start.column<<" (declaration)";else text<<"unavailable "<<quote(loc.error->message);};
    for(const auto &row:e.rows){const auto &ch=plan.layout.chains.at(row.chain);text<<"Chain["<<row.chain<<"] "<<quote(ch.name)<<": "<<row.status<<"; controls "<<(row.controlsComplete?"complete":"partial")<<'\n';
        for(const auto &reason:row.reasons)text<<"  reason: "<<quote(reason)<<'\n';
        if(row.compatibilityRow){const auto &c=compat.compatibility.rows.at(*row.compatibilityRow);for(auto g:c.clockGroups){const auto &cg=clock.groups.at(g);text<<"  clock "<<quote(cg.sourceRef)<<" bit="<<cg.point.slice.bits.lsb<<" edge="<<quote(cg.edge)<<'\n';}for(const auto &h:c.holds){const auto &input=reset.inputs.at(h.input);text<<"  hold "<<quote(input.sourceRef)<<" bit="<<input.point.slice.bits.lsb<<" low="<<(h.low?"true":"false")<<" high="<<(h.high?"true":"false")<<'\n';}}
        for(const auto &s:row.segments){const auto &br=boundary.rows.at(s.boundaryRow);const auto &port=boundary.ports.at(br.port);const auto &segment=ch.segments.at(s.segment);
            text<<"  Segment["<<s.segment<<"] port="<<quote(port.name)<<" bit="<<br.bit<<" direction="<<(br.upstream?"output":"input")<<" kind="<<quote(segment.kind)<<" length="<<segment.length<<'\n'<<"    port: ";location(s.portLocation);text<<'\n';
            if(s.stateLocation){text<<"    state "<<quote(*segment.signal)<<": ";location(*s.stateLocation);text<<'\n';}
            if(s.clockRow){const auto &r=clock.rows.at(*s.clockRow);text<<"    clock: "<<quote(r.status)<<" reason="<<quote(r.reason)<<'\n';std::set<size_t> shown;for(const auto &m:r.matches)if(m.check&&shown.insert(*m.check).second){const auto &c=clock.checks.at(*m.check);text<<"      event "<<quote(c.event.signal)<<" "<<quote(c.event.edge)<<": "<<quote(c.status)<<" reason="<<quote(c.reason)<<'\n';}}
            else text<<"    clock: not reached\n";
            if(s.resetRow){const auto &r=reset.rows.at(*s.resetRow);text<<"    async: "<<quote(r.status)<<" reason="<<quote(r.reason)<<'\n';std::set<size_t> shown;for(const auto &v:r.events)if(shown.insert(v.check).second){const auto &c=reset.checks.at(v.check);text<<"      event "<<quote(c.event.signal)<<" type="<<quote(c.event.type)<<": "<<quote(c.status)<<" reason="<<quote(c.reason)<<'\n';}}
            else text<<"    async: not reached\n";
        }
    }
    text<<"Totals: chains="<<e.counts.chains<<" segments="<<e.counts.segments<<" compatible="<<e.counts.compatible<<" conflict="<<e.counts.conflict<<" unresolved="<<e.counts.unresolved<<" empty="<<e.counts.empty<<" pending="<<e.counts.pending;
    if(e.stop)text<<"\nStopped: "<<e.stop->reason<<" next chain="<<e.stop->chain;
    text<<"\nFunctional evidence only; declaration locations refer to the compiled snapshot.";return text.str();
}
}
