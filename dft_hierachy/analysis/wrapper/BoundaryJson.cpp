#include "BoundaryJson.h"
namespace dft::wrapper {
using hier::protocol::write;
void writeBoundary(hier::protocol::JsonWriter &w,const BoundaryReport &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-wrapper-boundary-v1");
    w.key("snapshot");write(w,r.snapshot);w.key("scope");write(w,r.scope);
    w.key("request").beginObject().key("scope").value(r.request.scope).key("ports");write(w,r.request.ports);
    const auto &l=r.request.limits;
    w.key("limits").beginObject().key("maxPorts").value(l.maxPorts).key("maxBits").value(l.maxBits)
        .key("maxWork").value(l.maxWork).key("maxDepth").value(l.maxDepth).key("maxMillis").value(l.maxMillis)
        .key("pageSize").value(l.pageSize).endObject().endObject();
    w.key("complete").value(r.complete).key("work").value(r.work).key("reasons");write(w,r.reasons);
    w.key("ports").beginArray();for(const auto &p:r.ports) write(w,p);w.endArray();
    w.key("unsupportedPorts").beginArray();for(auto p:r.unsupportedPorts) w.value(uint64_t(p));w.endArray();
    w.key("rows").beginArray();
    for(const auto &row:r.rows) {
        w.beginObject().key("port").value(uint64_t(row.port)).key("bit").value(row.bit).key("upstream").value(row.upstream)
            .key("complete").value(row.complete).key("hasConservative").value(row.hasConservative)
            .key("summary").value(row.summary).key("reasons");write(w,row.reasons);
        w.key("steps").beginArray();
        for(const auto &s:row.steps) {w.beginObject().key("point");write(w,s.point);w.key("response");write(w,s.response);w.endObject();}
        w.endArray().key("processes").beginArray();
        for(const auto &p:row.processes) {
            w.beginObject().key("step").value(uint64_t(p.step)).key("hop").value(uint64_t(p.hop)).key("response");
            write(w,p.response);w.endObject();
        }
        w.endArray().key("terminals").beginArray();
        for(const auto &t:row.terminals) {
            w.beginObject().key("kind").value(t.kind).key("step").value(uint64_t(t.step));
            if(t.hop) w.key("hop").value(uint64_t(*t.hop));
            if(t.continuation) w.key("continuation").value(uint64_t(*t.continuation));w.endObject();
        }
        w.endArray().endObject();
    }
    w.endArray();
    if(r.stop) {
        const auto &s=*r.stop;w.key("stop").beginObject().key("reason").value(s.reason);
        if(s.port) w.key("port").value(uint64_t(*s.port));if(s.bit) w.key("bit").value(*s.bit);
        if(s.upstream) w.key("upstream").value(*s.upstream);w.endObject();
    }
    w.endObject();
}
}
