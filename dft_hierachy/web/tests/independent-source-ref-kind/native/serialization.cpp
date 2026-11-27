#include "hier/protocol/Json.h"
#include <iostream>
#include <optional>
#include <stdexcept>
#include <string>
#include <type_traits>
using namespace hier::model;
using namespace hier::protocol;
namespace {
void require(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
std::string json(const SourceHit& hit) { JsonWriter w; write(w, hit); return w.str(); }
SourceSpan span() { return {"B-file", "/B/file.sv", {0,1,1}, {1,1,2}, std::string(64, 'a')}; }
}
int main() {
    int passed = 0, failed = 0;
    const auto run = [&](const char* id, auto body) {
        try { body(); ++passed; std::cout << "{\"id\":\"" << id << "\",\"pass\":true}\n"; }
        catch (const std::exception& error) { ++failed; std::cout << "{\"id\":\"" << id << "\",\"pass\":false}\n"; std::cerr << error.what() << '\n'; }
    };
    run("B-RK-CPP-default", [] {
        SourceHit h;
#ifndef B_LEGACY
        static_assert(std::is_same_v<decltype(h.refKind), std::optional<SourceRefKind>>);
        require(!h.refKind, "default tag must be absent");
#endif
        require(json(h).find("\"refKind\"") == std::string::npos, "default optional omitted, never null/object");
    });
    run("B-RK-CPP-four-field-aggregate", [] {
        SourceHit h{"B-ref", SourceKind::Statement, span(), std::string("B-inst")};
#ifndef B_LEGACY
        require(!h.refKind, "old four-field aggregate leaves new optional empty");
#endif
        const auto text=json(h); require(text.find("\"refKind\"")==std::string::npos,"old aggregate serialization unchanged");
        require(text.find("\"inst\":\"B-inst\"")!=std::string::npos,"old context preserved");
    });
#ifndef B_LEGACY
    run("B-RK-CPP-definition", [] {
        SourceHit h{"i:looks-object", SourceKind::Statement, span(), std::string("context"), SourceRefKind::Definition};
        const auto text=json(h);require(text.find("\"refKind\":\"definition\"")!=std::string::npos,"authoritative definition string");
        require(text.find("i:looks-object")!=std::string::npos,"single opaque ref unchanged");
    });
    run("B-RK-CPP-object", [] {
        SourceHit h{"d:looks-definition", SourceKind::Definition, span(), std::nullopt, SourceRefKind::Object};
        const auto text=json(h);require(text.find("\"refKind\":\"object\"")!=std::string::npos,"object string independent of kind/inst/ref");
        require(text.find("\"inst\"")==std::string::npos,"missing context remains missing");
    });
    run("B-RK-CPP-nullopt", [] { SourceHit h;h.refKind=std::nullopt;require(json(h).find("\"refKind\"")==std::string::npos,"empty tag not serialized null"); });
    for (const auto [id,value] : {std::pair{"B-RK-CPP-invalid-positive",999},std::pair{"B-RK-CPP-invalid-negative",-1}})
        run(id, [=] { SourceHit h;h.refKind=static_cast<SourceRefKind>(value);bool caught=false;try{(void)json(h);}catch(const std::invalid_argument&){caught=true;}require(caught,"invalid enum must throw invalid_argument"); });
#endif
    std::cout << "{\"passed\":" << passed << ",\"failed\":" << failed << "}\n";
    return failed ? 1 : 0;
}
