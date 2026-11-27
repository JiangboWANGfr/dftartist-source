#include "MacroInterfacesJson.h"
#include "ObjectCatalogJson.h"
namespace dft::memory {
using hier::protocol::JsonWriter;
using hier::protocol::write;
void writeMacroInterfaces(JsonWriter &w,const MacroInterfaces &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-macro-interfaces-v1");
    w.key("catalog");dft::objects::writeCatalog(w,r.catalog);
    w.key("request").beginObject().key("definitionNames");write(w,r.request.definitionNames);
    w.key("clockPins");write(w,r.request.clockPins);w.key("limits").beginObject();
    const auto &l=r.request.limits;
    w.key("maxMacros").value(l.maxMacros);
    w.key("maxPins").value(l.maxPins);
    w.key("maxBindings").value(l.maxBindings);
    w.key("maxQueries").value(l.maxQueries);
    w.key("maxWork").value(l.maxWork);
    w.key("maxMillis").value(l.maxMillis);
    w.key("maxTraceNodes").value(l.maxTraceNodes);
    w.key("maxTraceEdges").value(l.maxTraceEdges);
    w.key("maxDepth").value(l.maxDepth);

    w.endObject().endObject().key("complete").value(r.complete).key("reasons");write(w,r.reasons);
    w.key("queries").value(r.queries).key("work").value(r.work).key("traceNodes").value(r.traceNodes).key("traceEdges").value(r.traceEdges);
    w.key("macros").beginArray();
    for(const auto &m:r.macros) {
        w.beginObject().key("instance").value(uint64_t(m.instance));
        if(m.parent){w.key("parent");write(w,*m.parent);w.key("parentStatus");write(w,*m.parentStatus);}
        w.key("missingClockPins");write(w,m.missingClockPins);w.key("pins").beginArray();
        for(const auto &p:m.pins) {
            w.beginObject().key("port");write(w,p.port);w.key("object");write(w,p.object);
            w.key("bindings");write(w,p.bindings);
            if(p.clock){w.key("clock");write(w,*p.clock);}w.endObject();
        }
        w.endArray().endObject();
    }
    w.endArray().endObject();
}

}
