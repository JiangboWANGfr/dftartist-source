// B public-API adapter: exposes OpenOptions.connectionCacheBytes to the same
// handwritten Python oracle. No private frontend/db/observer access.
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <iostream>
#include <stdexcept>
#include <string>
int main(int argc, char** argv) {
    if (argc != 6) return 2;
    hier::model::OpenOptions options;
    options.files = {argv[1]}; options.tops = {"B_m7_top"};
    options.forcePerInstanceBodies = std::string(argv[3]) == "1";
    options.connectionCacheBytes = std::stoull(argv[4]);
    auto opened = hier::Design::open(options);
    if (!opened) throw std::runtime_error(opened.error().message);
    auto& design = **opened;
    const auto roots = design.roots();
    if (roots.size() != 1) throw std::runtime_error("expected one top");
    const auto children = design.children(roots.front().ref, {"", 100});
    if (!children) throw std::runtime_error("children enumeration failed");
    std::string inst;
    for (const auto& child : children->items)
        if (child.name == std::string(argv[2]) + argv[5]) inst = child.ref;
    if (inst.empty()) throw std::runtime_error("expected explicit fixture occurrence");
    auto signals = design.signals(inst, {"", 100000});
    auto ports = design.ports(inst);
    auto procs = design.procs(inst, {"", 100000});
    if (!signals || !ports || !procs) throw std::runtime_error("public enumeration failed");
    hier::protocol::JsonWriter w;
    w.beginObject().key("signals"); hier::protocol::write(w, signals->items);
    w.key("ports"); hier::protocol::write(w, *ports);
    w.key("processes").beginArray();
    for (const auto& p : procs->items) {
        auto info = design.proc(p.ref);
        if (!info) throw std::runtime_error(info.error().message);
        hier::protocol::write(w, info->result);
    }
    w.endArray().endObject(); std::cout << w.str() << '\n';
}
