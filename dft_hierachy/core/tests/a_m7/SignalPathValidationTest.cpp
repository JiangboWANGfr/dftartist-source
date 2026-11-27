#include "HierarchyPath.h"
#include "Lookup.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <array>
#include <random>
#include <type_traits>

using namespace hier;
namespace {
static_assert(!std::is_copy_constructible_v<detail::HierarchyPathValidator>);
static_assert(!std::is_move_constructible_v<detail::HierarchyPathValidator>);
struct SpacedPaths final : frontend::Frontend {
    model::FrontendInfo metadata;
    std::vector<model::TopInfo> roots{{"top", 0}};
    std::vector<model::DefInfo> defs{{"D", model::DefKind::Module, "", 0}};
    const model::FrontendInfo &info() const override { return metadata; }
    const std::vector<model::TopInfo> &tops() const override { return roots; }
    const std::vector<model::DefInfo> &definitions() const override { return defs; }
    size_t bodyCount() const override { return 1; }
    model::Diagnostics diagnostics(size_t) const override { return {}; }
    model::BodySkeleton skeleton(model::BodyId) const override { return {}; }
    model::BodyConnections connections(model::BodyId) const override {
        model::BodyConnections result;
        for (const auto path : {"g.h.leaf", "g.h.other", "g.h. \t leaf", "g.h.\nother"}) {
            model::SignalInfo signal;
            signal.name = "name";
            signal.localPath = path;
            result.signals.push_back(std::move(signal));
        }
        result.estimatedBytes = 4096;
        return result;
    }
};

void checkBatch(const std::vector<std::string> &inputs) {
    detail::HierarchyPathValidator batch;
    detail::HierarchyPathMatcher emptyTarget({});
    std::string_view previous;
    for (const auto &text : inputs) {
        INFO("input: " << text);
        INFO("previous: " << previous);
        auto parsed = detail::parseHierarchyPath(text);
        const bool valid = batch.validate(text);
        detail::HierarchyPathValidator cold;
        CHECK(valid == bool(parsed));
        CHECK(valid == bool(detail::validateHierarchyPath(text)));
        CHECK(valid == emptyTarget.match(text).has_value());
        CHECK(valid == cold.validate(text));
        if (!parsed) {
            CHECK(parsed.error().code == ErrorCode::BadRequest);
            CHECK(parsed.error().message == "invalid hierarchy path syntax");
        }
        previous = text;
    }
}

TEST_CASE("validated boundaries retain optional whitespace in syntax and semantic matching", "[a-m7]") {
    const std::vector<detail::PathSegment> target{{"g", {}}, {"h", {}}, {"leaf", {}}};
    detail::HierarchyPathMatcher matcher(target);
    detail::HierarchyPathValidator validator;
    const std::vector<std::string> inputs{"g.h.leaf", "g.h.other", "g.h. \t leaf",
        "g.h.\nother", "g.h.   ", "g.h.leaf", "g.h. \t \\a.b ", "g.h.leaf"};
    for (size_t i = 0; i < inputs.size(); ++i) {
        INFO("input: " << inputs[i]);
        CHECK(validator.validate(inputs[i]) == (i != 4));
        auto value = matcher.match(inputs[i]);
        REQUIRE(value.has_value() == (i != 4));
        if (value)
            CHECK(*value == (i == 0 || i == 2 || i == 5 || i == 7));
    }
}

TEST_CASE("search and path queries accept whitespace changes in valid frontend path batches", "[a-m7]") {
    model::OpenOptions options;
    options.files = {HIER_SIGNAL_PATH_VALIDATION_FIXTURE};
    auto opened = Design::open(options);
    REQUIRE(opened);
    for (size_t budget : {size_t{0}, size_t{1}, size_t{1 << 20}}) {
        db::DesignDb db(std::make_unique<SpacedPaths>(), budget);
        auto paths = detail::resolvePath(db, "top.g.h.leaf", {});
        REQUIRE(paths);
        CHECK(paths->result == std::vector<std::string>{"s:0:0", "s:0:2"});
        model::SearchQuery query;
        query.kinds = {model::HitKind::Signal};
        query.text = "no match";
        auto empty = detail::search(**opened, db, query, {"", 1}, {});
        REQUIRE(empty);
        CHECK(empty->result.items.empty());
        query.text = "name";
        auto first = detail::search(**opened, db, query, {"", 1}, {});
        REQUIRE(first);
        CHECK(first->result.items.size() == 1);
        REQUIRE_FALSE(first->result.next.empty());
        auto rest = detail::search(**opened, db, query, {first->result.next, 4}, {});
        REQUIRE(rest);
        REQUIRE(rest->result.items.size() == 3);
        CHECK(rest->result.items[1].path == std::vector<std::string>{"top", "g", "h", "leaf"});
        CHECK(rest->result.items[1].pathText == "top.g.h. \t leaf");
        CHECK(rest->result.next.empty());
    }
}
} // namespace

TEST_CASE("syntax batch reuses only a complete last boundary and clears malformed suffixes", "[a-m7]") {
    std::vector<std::string> inputs{
        "g[0].h[1].leaf", "g[0].h[1].other", "g[0].h[1].", "g[0].h[1].leaf",
        "g[0].h[1].leaf[2147483648]", "g[0].h[1].leaf", "g[0].h[1].\\bad",
        "g[0].h[1].leaf", "g[0].h[2].leaf", "g[1].h[1].leaf", "g[1].h[1].other",
        "g[1].", "g[1].h[1].leaf", "g[0][1].h[-2].leaf", "g[0][1].h[-2].other",
        "g[0][1].h[-2].", "g[0][1].h[-2].leaf", "a", "a ", "a[0]", "a[1]",
        "a[-2147483648]", "a[2147483647]", "a[-2147483649]", "a[+2147483648]",
        "a[+00]/b[02].leaf", "a[+00]/b[02].other", "a[+00]/b[02].", "a[+00]/b[02].leaf",
        " / g [ -2 ] / \\a.b [3] . leaf", " / g [ -2 ] / \\a.b [3] . other",
        " / g [ -2 ] / \\a.b [3] .", " / g [ -2 ] / \\a.b [3] . leaf",
        "\\g.h [0].leaf", "\\g.h [0].other", "\\g.h [0].", "\\g.h [0].leaf",
        "g.h.\\a.b /leaf", "g.h.\\a.b /other", "g.h.\\a.b /", "g.h.\\a.b /leaf",
        std::string("g.\\a\0b .leaf", 12), std::string("g.\\a\0b .other", 13),
        "", "/", "//a", " a / ", "a..b", "a[0:1]", "\\", "\\a", "a.b", "a.c"};
    checkBatch(inputs);
    std::reverse(inputs.begin(), inputs.end());
    checkBatch(inputs);
    std::mt19937 random(0x418f);
    std::shuffle(inputs.begin(), inputs.end(), random);
    checkBatch(inputs);
}

TEST_CASE("syntax batches preserve full grammar across deep cold shared and byte-mutated inputs", "[a-m7]") {
    std::mt19937 random(0x24bd8);
    std::string alphabet = "ab.$/[] \\-+09";
    alphabet.push_back('\0');
    alphabet.push_back(char(0xff));
    for (size_t depth : std::array<size_t, 7>{0, 1, 2, 3, 8, 64, 128}) {
        std::string prefix;
        for (size_t i = 0; i < depth; ++i)
            prefix += "g" + std::to_string(i) + "[-2][3].";
        std::vector<std::string> inputs;
        for (size_t i = 0; i < 1600; ++i) {
            auto text = prefix + (i % 2 ? "leaf" : "other");
            if (depth && i % 3 == 0)
                text.replace(0, 2, "fork");
            if (i % 5 == 0)
                text += "[2147483648]";
            if (i % 7 == 0)
                text.resize(size_t(random()) % text.size());
            if (!text.empty() && i % 11 == 0)
                text[size_t(random()) % text.size()] = alphabet[random() % alphabet.size()];
            inputs.push_back(std::move(text));
            if (i % 13 == 0)
                inputs.push_back(prefix + "leaf");
        }
        checkBatch(inputs);
        std::reverse(inputs.begin(), inputs.end());
        checkBatch(inputs);
        std::shuffle(inputs.begin(), inputs.end(), random);
        checkBatch(inputs);
    }
}
