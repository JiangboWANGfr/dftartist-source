#include "PinLibraryJson.h"
namespace dft::memory {
namespace {
void attrs(hier::protocol::JsonWriter &w,const std::map<std::string,std::string> &a) {
    w.beginObject();for(const auto &[k,v]:a)w.key(k).value(v);w.endObject();
}
}
void writePinLibrary(hier::protocol::JsonWriter &w,const PinLibrary &library) {
    const auto &d=library.declaration();w.beginObject().key("source").value(d.source).key("cells").beginArray();
    for(const auto &[name,cell]:d.cells) {
        w.beginObject().key("definitionName").value(name).key("cell").beginObject().key("pins").beginArray();
        for(const auto &pin:cell.pins) {
            w.beginObject().key("name").value(pin.name).key("direction").value(libraryDirectionName(pin.dir)).key("width").value(uint64_t(*pin.width)).key("attrs");attrs(w,pin.attrs);w.endObject();
        }
        w.endArray().key("attrs");attrs(w,cell.attrs);w.endObject().endObject();
    }
    w.endArray().endObject();
}
}
