#include "ObjectCatalogJson.h"
namespace dft::objects {
using hier::protocol::JsonWriter;
using hier::protocol::write;
void writeCatalog(JsonWriter &w,const ObjectCatalog &r) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-object-catalog-v1");
    w.key("snapshot");write(w,r.snapshot);w.key("scope");write(w,r.scope);
    w.key("request").beginObject().key("scope").value(r.request.scope).key("text").value(r.request.text)
        .key("recursive").value(r.request.recursive).key("kinds").beginArray();
    for(auto k:r.request.kinds) w.value(kindName(k));w.endArray().key("limits").beginObject();
    const auto &l=r.request.limits;
    w.key("maxInstances").value(l.maxInstances).key("maxObjects").value(l.maxObjects).key("maxQueries").value(l.maxQueries)
        .key("maxWork").value(l.maxWork).key("maxMillis").value(l.maxMillis).key("pageSize").value(l.pageSize).endObject().endObject();
    w.key("complete").value(r.complete).key("reasons");write(w,r.reasons);
    w.key("queries").value(r.queries).key("work").value(r.work).key("visitedObjects").value(r.visitedObjects);
    w.key("instances").beginArray();
    for(const auto &i:r.instances) {
        w.beginObject().key("info");write(w,i.info);
        w.key("objectsComplete").value(i.objectsComplete).key("childrenComplete").value(i.childrenComplete);
        if(i.signalStatus) {w.key("signalStatus");write(w,*i.signalStatus);}w.endObject();
    }
    w.endArray().key("objects").beginArray();
    for(const auto &o:r.objects) {
        w.beginObject().key("kind").value(kindName(o.kind)).key("instance").value(o.instance).key("object");write(w,o.object);
        if(o.port) {w.key("port");write(w,*o.port);}
        if(o.signal) {w.key("signal");write(w,*o.signal);}w.endObject();
    }
    w.endArray().endObject();
}
}
