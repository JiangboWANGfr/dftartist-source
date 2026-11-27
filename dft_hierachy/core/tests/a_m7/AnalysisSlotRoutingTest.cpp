#include "AnalysisSlotRouting.h"
#include <catch2/catch_test_macros.hpp>
#include <slang/ast/Compilation.h>
#include <slang/ast/symbols/CompilationUnitSymbols.h>
#include <slang/syntax/SyntaxTree.h>
#include <stdexcept>

namespace {
using namespace slang;
using namespace slang::ast;
using Routing = hier::frontend::detail::AnalysisSlotRouting;
using Walker = hier::frontend::detail::SlotWalker;
using Slots = std::vector<hier::frontend::detail::RawSlot>;
struct Design {
    Compilation compilation;
    Design() {
        compilation.addSyntaxTree(syntax::SyntaxTree::fromText(R"(
module leaf; endmodule
module slot_wrap;
  leaf flat();
  leaf lanes[2:-1]();
  if (1) begin: chosen leaf selected(); end
  if (0) begin: unchosen leaf hidden(); end
  for (genvar i=0;i<3;i++) begin:g
    wire n;
    leaf first(), second();
    and gate0(n,1'b1,1'b0);
  end
endmodule
module slot_top; slot_wrap a(),b(),c(); endmodule
)"));
        REQUIRE(compilation.getAllDiagnostics().empty());
    }
    const InstanceBodySymbol &body(std::string_view name) {
        const auto &tops = compilation.getRoot().topInstances;
        REQUIRE(tops.size() == 1);
        const auto symbol = tops[0]->body.lookupName(name);
        REQUIRE(symbol);
        REQUIRE(symbol->kind == SymbolKind::Instance);
        return symbol->as<InstanceSymbol>().body;
    }
};
Slots collect(const InstanceBodySymbol &body) {
    Walker walker;
    walker.walk(body, -1);
    return std::move(walker.slots);
}
const InstanceBodySymbol *linear(const Slots &first, const Slots &second, const Symbol &child) {
    for (size_t i = 0; i < first.size() && i < second.size(); ++i)
        if (first[i].symbol == &child && second[i].symbol->kind == SymbolKind::Instance)
            return &second[i].symbol->as<InstanceSymbol>().body;
    return nullptr;
}
} // namespace

TEST_CASE("shared slot traversal preserves source scopes arrays and selected branches", "[a-m7]") {
    Design design;
    Walker walker;
    walker.walk(design.body("a"), -1);
    REQUIRE(walker.slots.size() == 15);
    REQUIRE(walker.scopes.size() == 4);
    CHECK(walker.slots[0].symbol->name == "flat");
    for (size_t i = 0; i < 4; ++i) {
        CHECK(walker.slots[i+1].arrayIndex == std::vector<int32_t>{int32_t(i)-1});
        CHECK(walker.slots[i+1].scope == -1);
    }
    CHECK(walker.scopes[0].name == "chosen");
    CHECK(walker.slots[5].symbol->name == "selected");
    CHECK(walker.slots[5].scope == 0);
    for (size_t i = 0; i < 3; ++i) {
        CHECK(walker.scopes[i+1].name == "g");
        CHECK(walker.scopes[i+1].arrayIndex == std::vector<int32_t>{int32_t(i)});
        CHECK(walker.slots[6+i*3].symbol->name == "first");
        CHECK(walker.slots[7+i*3].symbol->name == "second");
        CHECK(walker.slots[8+i*3].symbol->kind == SymbolKind::PrimitiveInstance);
        CHECK(walker.slots[6+i*3].scope == int32_t(i+1));
    }
}

TEST_CASE("parent pair routing matches the original scan and retains only the recent pair", "[a-m7]") {
    Design design;
    const auto &a = design.body("a"), &b = design.body("b"), &c = design.body("c");
    const auto first = collect(a), second = collect(b), third = collect(c);
    size_t collections = 0;
    auto counted = [&](const auto &body) { ++collections; return collect(body); };
    Routing routing;
    for (const auto &slot : first) {
        const auto expected = linear(first, second, *slot.symbol);
        CHECK(routing.counterpart(a,b,*slot.symbol,counted) == expected);
        CHECK(collections == 2);
    }
    const auto borrowed = routing.counterpart(a,b,*first[0].symbol,counted);
    CHECK(routing.counterpart(b,c,*second[0].symbol,counted) == linear(second,third,*second[0].symbol));
    CHECK(collections == 4);
    CHECK(borrowed == &second[0].symbol->as<InstanceSymbol>().body);
    CHECK(routing.counterpart(a,b,*first[0].symbol,counted) == borrowed);
    CHECK(collections == 6); // Old pair was replaced, not accumulated globally.
    CHECK(routing.counterpart(a,a,*first[0].symbol,counted) ==
          &first[0].symbol->as<InstanceSymbol>().body); // Preserve self-correspondence.
    CHECK(collections == 8);
    CHECK(routing.counterpart(a,a,*second[0].symbol,counted) == nullptr);
}

TEST_CASE("routing retains first eligible duplicates and a failed switch leaves no partial table", "[a-m7]") {
    Design design;
    const auto &a = design.body("a"), &b = design.body("b"), &c = design.body("c");
    const auto first = collect(a), second = collect(b);
    Slots repeated{first[0],first[0],first[0],first[1]};
    Slots mixed{second[8],second[1],second[2]}; // Invalid first representative, then two eligible.
    Routing routing;
    auto custom = [&](const auto &body) { return &body == &a ? repeated : mixed; };
    CHECK(routing.counterpart(a,b,*first[0].symbol,custom) == linear(repeated,mixed,*first[0].symbol));
    CHECK(routing.counterpart(a,b,*first[1].symbol,custom) == nullptr); // Short representative.
    size_t calls = 0;
    CHECK_THROWS_AS(routing.counterpart(b,c,*second[0].symbol,[&](const auto &body) {
        if (++calls == 2) throw std::runtime_error("slot collection failed");
        return collect(body);
    }), std::runtime_error);
    CHECK(calls == 2);
    CHECK(routing.counterpart(a,b,*first[0].symbol,[](const auto &) -> Slots {
        throw std::runtime_error("old completed pair should remain");
    }) == linear(repeated,mixed,*first[0].symbol));
    const auto third = collect(c);
    CHECK(routing.counterpart(b,c,*second[0].symbol,collect) == linear(second,third,*second[0].symbol));
    Slots empty;
    Routing absent;
    CHECK(absent.counterpart(a,b,*first[0].symbol,[&](const auto &) { return empty; }) == nullptr);
}
