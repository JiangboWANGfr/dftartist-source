// B resource observer: open/snapshot/diagnostics only, public API, no product hooks.
#include "hier/Design.h"
#include <iomanip>
#include <iostream>

namespace {
struct Miss final : hier::model::LibraryProvider {
    std::optional<hier::model::CellInfo> cell(std::string_view) const override { return {}; }
};
struct Sparse final : hier::model::LibraryProvider {
    std::optional<hier::model::CellInfo> cell(std::string_view name) const override {
        if (name != "b_sparse_cell") return {};
        hier::model::CellInfo c;
        c.pins.push_back({"A", hier::model::Direction::In, uint32_t{8}, {}});
        return c;
    }
};
}
int main(int argc, char** argv) {
    if (argc != 4 || std::string_view(argv[1]) != "info") return 2;
    hier::model::OpenOptions o;
    o.files = {argv[2]};
    o.tops = {"top"};
    const std::string_view mode(argv[3]);
    if (mode == "empty") o.library = std::make_shared<hier::model::EmptyLibrary>();
    else if (mode == "miss") o.library = std::make_shared<Miss>();
    else if (mode == "sparse") o.library = std::make_shared<Sparse>();
    else if (mode != "none") return 2;
    auto reply = hier::Design::open(o);
    if (!reply.ok()) { std::cerr << reply.error().message; return 2; }
    const auto s = reply.value()->snapshot();
    const auto diagnostics = reply.value()->diagnostics();
    if (s.tops.size() != 1) return 2;
    std::cout << "{\"bodySharing\":" << std::quoted(s.frontend.sharedBodies ? "fast" : "per-instance")
              << ",\"bodyCount\":" << s.bodyCount << ",\"errorCount\":" << diagnostics.errorCount
              << ",\"tops\":[{\"name\":" << std::quoted(s.tops[0].name) << "}]}\n";
}
