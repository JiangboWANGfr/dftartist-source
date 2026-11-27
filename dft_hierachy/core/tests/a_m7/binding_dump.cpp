// Test-only L1 consumer. Serialize retained facts through the existing JSON writer,
// plus private source ranges / capacity accounting to detect scheduling changes.
#include "hier/frontend/Frontend.h"
#include "hier/protocol/Json.h"
#include <cstdio>
#include <string_view>

namespace {
class Library final : public hier::model::LibraryProvider {
    std::optional<hier::model::CellInfo> cell(std::string_view name) const override {
        if (name != "absent_cell")
            return {};
        using hier::model::Direction;
        return hier::model::CellInfo{{{"A", Direction::In, 8, {}},
                                      {"Y", Direction::Out, 8, {}}}, {}};
    }
};
} // namespace

int main(int argc, char **argv) {
    if (argc != 5)
        return 2;
    hier::model::OpenOptions options;
    options.files = {argv[1]};
    options.tops = {argv[2]};
    options.forcePerInstanceBodies = std::string_view(argv[3]) == "per-instance";
    if (std::string_view(argv[4]) == "library")
        options.library = std::make_shared<Library>();
    auto opened = hier::frontend::openDesign(options);
    if (!opened)
        return 3;
    const auto &frontend = **opened;
    if (frontend.diagnostics(0).errorCount)
        return 4;
    hier::protocol::JsonWriter writer;
    writer.beginArray();
    for (hier::model::BodyId id = 0; id < frontend.bodyCount(); ++id) {
        auto facts = frontend.connections(id);
        writer.beginObject().key("body").value(id);
        writer.key("definition").value(frontend.definitions()[frontend.skeleton(id).def].name);
        writer.key("signals");
        hier::protocol::write(writer, facts.signals);
        writer.key("internals");
        hier::protocol::write(writer, facts.internals);
        writer.key("bindings");
        hier::protocol::write(writer, facts.bindings);
        writer.key("processes");
        hier::protocol::write(writer, facts.processes);
        writer.key("registers");
        hier::protocol::write(writer, facts.registers);
        writer.key("completeness");
        hier::protocol::write(writer, facts.completeness);
        writer.key("sources").beginArray();
        for (const auto &source : facts.sources) {
            writer.beginObject().key("ref").value(source.ref);
            writer.key("kind").value(static_cast<int>(source.kind));
            writer.key("file").value(source.range.file);
            writer.key("start").value(source.range.start);
            writer.key("end").value(source.range.end).endObject();
        }
        writer.endArray().key("check").beginObject();
        writer.key("slangCompared").value(facts.check.slangCompared);
        writer.key("selfChecked").value(facts.check.selfChecked);
        writer.key("skippedExternal").value(facts.check.skippedExternal);
        writer.key("mismatched").value(facts.check.mismatched);
        writer.key("issues");
        hier::protocol::write(writer, facts.check.issues);
        writer.endObject().key("estimatedBytes").value(facts.estimatedBytes).endObject();
    }
    writer.endArray();
    std::puts(writer.str().c_str());
}
