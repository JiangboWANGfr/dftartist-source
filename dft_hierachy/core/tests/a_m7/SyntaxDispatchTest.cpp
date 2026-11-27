#include "HierarchyPath.h"
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <array>
#include <random>

using namespace hier;
namespace {
void compare(const std::vector<std::string> &inputs) {
    detail::HierarchyPathValidator batch;
    const std::vector<detail::PathSegment> target{{"root", {}}, {"g", {2}}, {"leaf", {}}};
    detail::HierarchyPathMatcher matcher(target);
    for (const auto &text : inputs) {
        INFO("input: " << text);
        const auto parsed = detail::parseHierarchyPath(text);
        CHECK(batch.validate(text) == bool(parsed));
        detail::HierarchyPathValidator cold;
        CHECK(cold.validate(text) == bool(parsed));
        const auto matched = matcher.match(text);
        REQUIRE(matched.has_value() == bool(parsed));
        if (parsed)
            CHECK(*matched == (parsed->segments == target));
    }
}
std::string encoded(const std::vector<model::ObjectHit> &items) {
    protocol::JsonWriter writer;
    protocol::write(writer, items);
    return writer.str();
}
} // namespace

TEST_CASE("syntax dispatch preserves cold, resumed, suffix and reset transitions with fixed expected grammar", "[a-m7]") {
    const std::vector<std::pair<std::string, bool>> inputs{
        {"root.g[2].branch.leaf", true}, {"root.g[2].branch.other", true},
        {"long_outer.g[2].branch.other", true}, {"long_outer.g[123].branch.other", true},
        {"long_outer.g[123].branch.", false}, {"plain", true}, {"plain[2]", true},
        {"r.x", true}, {"r.x.y.z", true}, {"r.x.y.new", true}, {"r.changed.y.new", true},
        {"r.bad[2147483648].y.new", false}, {"r.good.y.new", true},
        {"r.good.y. \t new", true}, {"longer.good.y. \t new", true},
        {"longer.next.y. \t new", true}, {"longer.next.y. \t ", false},
        {"a", true}, {"a.", false}, {"a. b", true}, {"a. b.c", true},
        {"\\a.b [1].g.leaf", true}, {"\\long/name [1].g.leaf", true},
        {"\\long/name [1].g.\\x.y ", true}, {"\\long/name [1].g.\\x.y", false},
        {"root.g[2].leaf", true}, {"root.g[2]. \t leaf", true}, {"root.g[3].leaf", true},
        {"root.g[+00].leaf", true}, {"root.g[-2147483648].leaf", true},
        {"root.g[2147483648].leaf", false}, {"root.g[-2147483649].leaf", false},
        {"root.g[+].leaf", false}, {"root.g[0][1].leaf", true}, {"root.g[0].leaf[9]", true},
        {"root.g[0].leaf[]", false}, {"/root/g[2]/leaf", true}, {"//root/g[2]/leaf", false},
        {"", false}, {" ", false}, {std::string("a\0b", 3), false},
        {std::string("\\a\0b ", 5), true}, {"root.g[2].leaf", true}};
    detail::HierarchyPathValidator batch;
    std::vector<std::string> texts;
    for (const auto &[text, valid] : inputs) {
        INFO("input: " << text);
        CHECK(batch.validate(text) == valid);
        texts.push_back(text);
    }
    compare(texts);
    std::reverse(texts.begin(), texts.end());
    compare(texts);
}

TEST_CASE("record-only continuation and full suffix comparison keep scalar semantics in shuffled batches", "[a-m7]") {
    std::mt19937 random(0x2a01c);
    std::string alphabet = "ab09_$. /[]\\+-\t";
    alphabet.push_back('\0');
    alphabet.push_back(char(0xff));
    for (size_t depth : std::array<size_t, 7>{0, 1, 2, 3, 8, 64, 128}) {
        std::string prefix = "root.";
        for (size_t i = 0; i < depth; ++i)
            prefix += "g" + std::to_string(i) + "[-2][3].";
        std::vector<std::string> inputs;
        for (size_t i = 0; i < 1800; ++i) {
            auto text = prefix + "leaf" + std::to_string(i);
            if (i % 5 == 0) text.replace(0, 4, "longer_outer");
            if (i % 7 == 0) text = "root.bank[" + std::to_string(i) + "]." + prefix + "leaf";
            if (i % 11 == 0) text += ".bad[2147483648]";
            if (i % 13 == 0) text.resize(size_t(random()) % text.size());
            if (!text.empty() && i % 17 == 0)
                text[size_t(random()) % text.size()] = alphabet[random() % alphabet.size()];
            inputs.push_back(std::move(text));
            if (i % 19 == 0) inputs.push_back("plain");
            if (i % 23 == 0) inputs.push_back("root.g[2].leaf");
        }
        compare(inputs);
        std::shuffle(inputs.begin(), inputs.end(), random);
        compare(inputs);
        std::reverse(inputs.begin(), inputs.end());
        compare(inputs);
    }
}

TEST_CASE("real search pages retain all kinds, scope and owning fields through rejected scans and cache changes", "[a-m7]") {
    std::vector<model::ObjectHit> retained;
    std::string expected;
    for (bool per : {false, true})
        for (size_t cache : {size_t{0}, size_t{128}, size_t{1 << 20}}) {
            model::OpenOptions options;
            options.files = {HIER_SYNTAX_DISPATCH_FIXTURE};
            options.tops = {"alpha", "beta"};
            options.forcePerInstanceBodies = per;
            options.connectionCacheBytes = cache;
            auto opened = Design::open(options);
            REQUIRE(opened);
            auto &design = **opened;
            for (bool signalsOnly : {false, true})
                for (bool scoped : {false, true})
                    for (const auto text : {"no literal hit", "state", "g[", "a.b", "slash/", "alpha", " ", ""}) {
                        model::SearchQuery query;
                        query.text = text;
                        if (signalsOnly) query.kinds = {model::HitKind::Signal};
                        if (scoped) query.scope = "i:0";
                        auto whole = design.search(query, {"", 10000});
                        REQUIRE(whole);
                        REQUIRE(whole->result.next.empty());
                        PageRequest page{"", 1};
                        std::vector<model::ObjectHit> items;
                        size_t pages = 0;
                        do {
                            auto reply = design.search(query, page);
                            REQUIRE(reply);
                            CHECK(reply->completeness.status == whole->completeness.status);
                            CHECK((reply->result.next.empty() || reply->result.next != page.cursor));
                            items.insert(items.end(), reply->result.items.begin(), reply->result.items.end());
                            page.cursor = reply->result.next;
                            page.limit = ++pages % 3 ? 3 : 7;
                            REQUIRE(pages < 200);
                        } while (!page.cursor.empty());
                        CHECK(encoded(items) == encoded(whole->result.items));
                        std::stop_source stop;
                        stop.request_stop();
                        auto cancelled = design.search(query, {}, stop.get_token());
                        REQUIRE_FALSE(cancelled);
                        CHECK(cancelled.error().code == ErrorCode::Cancelled);
                        auto retry = design.search(query, {"", 10000});
                        REQUIRE(retry);
                        CHECK(encoded(retry->result.items) == encoded(items));
                        retained = std::move(items);
                    }
            REQUIRE_FALSE(retained.empty());
            if (expected.empty()) expected = encoded(retained);
            CHECK(encoded(retained) == expected);
        }
    CHECK(encoded(retained) == expected);
}
