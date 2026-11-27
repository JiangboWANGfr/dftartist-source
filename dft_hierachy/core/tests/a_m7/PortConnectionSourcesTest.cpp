// Private L1 source association regression, including diagnosed syntax lists.
#include "Sources.h"
#include <catch2/catch_test_macros.hpp>
#include <slang/syntax/SyntaxTree.h>
#include <slang/syntax/SyntaxVisitor.h>

namespace {
using namespace slang::syntax;
struct InstanceSyntax {
    std::shared_ptr<SyntaxTree> tree;
    const SyntaxNode *instance = nullptr;
    std::vector<const SyntaxNode *> items;
    explicit InstanceSyntax(std::string_view connections) {
        tree = SyntaxTree::fromText("module t; leaf u(" + std::string(connections) + "); endmodule");
        AllSyntaxVisitor visitor([&](const SyntaxNode &node) {
            if (node.kind == SyntaxKind::HierarchicalInstance) {
                instance = &node;
                for (auto item : node.as<HierarchicalInstanceSyntax>().connections)
                    items.push_back(item);
            }
        });
        visitor.visit(tree->root());
    }
};
} // namespace

TEST_CASE("port source association retains original slots and first eligible syntax", "[a-m7]") {
    SECTION("named duplicates select their first spelling") {
        InstanceSyntax syntax(".b(b), .a(a), .a(c)");
        REQUIRE(syntax.items.size() == 3);
        hier::frontend::PortConnectionSources sources(syntax.instance);
        CHECK(sources.connection(0, "a") == syntax.items[1]);
        CHECK(sources.connection(2, "a") == syntax.items[1]);
        CHECK(sources.connection(1, "b") == syntax.items[0]);
        CHECK(sources.connection(0, "absent") == nullptr);
    }
    SECTION("empty and wildcard entries still occupy positions") {
        InstanceSyntax syntax("a, , c");
        REQUIRE(syntax.items.size() == 3);
        hier::frontend::PortConnectionSources sources(syntax.instance);
        CHECK(sources.connection(0, "a") == syntax.items[0]);
        CHECK(sources.connection(1, "b") == nullptr);
        CHECK(sources.connection(2, "c") == syntax.items[2]);
        CHECK(sources.connection(3, "d") == nullptr);
        InstanceSyntax wildcard(".a, .*");
        hier::frontend::PortConnectionSources implicit(wildcard.instance);
        CHECK(implicit.connection(0, "a") == wildcard.items[0]);
        CHECK(implicit.connection(1, "b") == nullptr);
    }
    SECTION("diagnosed mixed lists retain earliest eligible named or ordered item") {
        InstanceSyntax syntax("a, .b(b), c, .a(d)");
        REQUIRE(syntax.items.size() == 4);
        hier::frontend::PortConnectionSources sources(syntax.instance);
        CHECK(sources.connection(0, "a") == syntax.items[0]);
        CHECK(sources.connection(2, "b") == syntax.items[1]);
        CHECK(sources.connection(2, "a") == syntax.items[2]);
        CHECK(sources.connection(4, "a") == syntax.items[3]);
    }
    SECTION("non-instance or absent syntax has no connection source") {
        auto tree = SyntaxTree::fromText("module t; endmodule");
        hier::frontend::PortConnectionSources module(&tree->root()), absent(nullptr);
        CHECK(module.connection(0, "a") == nullptr);
        CHECK(absent.connection(0, "a") == nullptr);
    }
    SECTION("short and wide lists retain the same mixed and duplicate rules on reset") {
        auto module = SyntaxTree::fromText("module t; endmodule");
        InstanceSyntax narrow(".a(k), m");
        hier::frontend::PortConnectionSources sources(nullptr);
        for (size_t count : {7u, 8u, 9u, 32u}) {
            std::string list = ".a(a), q, .a(b), , .*";
            for (size_t i = 5; i < count; ++i)
                list += ", .f" + std::to_string(i) + "(v)";
            InstanceSyntax wide(list);
            REQUIRE(wide.items.size() == count);
            sources.reset(wide.instance);
            CHECK(sources.connection(1, "a") == wide.items[0]);
            CHECK(sources.connection(1, "missing") == wide.items[1]);
            CHECK(sources.connection(3, "missing") == nullptr);
            CHECK(sources.connection(4, "missing") == nullptr);
            CHECK(sources.connection(count, "a") == wide.items[0]);
            CHECK(sources.connection(0, "f" + std::to_string(count - 1)) == wide.items.back());
            const auto *borrowed = sources.connection(0, "a");
            sources.reset(wide.instance);
            CHECK(sources.connection(0, "a") == borrowed);
            sources.reset(narrow.instance);
            CHECK(sources.connection(0, "a") == narrow.items[0]);
            CHECK(sources.connection(1, "a") == narrow.items[0]);
            CHECK(sources.connection(1, "missing") == narrow.items[1]);
            CHECK(sources.connection(0, "f5") == nullptr);
            // Reset owns lookup metadata only; returned compilation nodes live on.
            CHECK(borrowed == wide.items[0]);
            sources.reset(nullptr);
            CHECK(sources.connection(0, "a") == nullptr);
            sources.reset(wide.instance);
            CHECK(sources.connection(0, "a") == wide.items[0]);
            sources.reset(&module->root());
            CHECK(sources.connection(0, "a") == nullptr);
        }
    }
}
