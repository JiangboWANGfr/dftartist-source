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
    for (const auto &text : inputs) {
        INFO("input: " << text);
        auto parsed = detail::parseHierarchyPath(text);
        CHECK(batch.validate(text) == bool(parsed));
        CHECK(bool(detail::validateHierarchyPath(text)) == bool(parsed));
        detail::HierarchyPathValidator cold;
        CHECK(cold.validate(text) == bool(parsed));
    }
}
std::string encoded(const std::vector<model::ObjectHit> &hits) {
    protocol::JsonWriter writer;
    protocol::write(writer, hits);
    return writer.str();
}
} // namespace

TEST_CASE("second-boundary syntax reuse validates both changed segments and every invalid tail", "[a-m7]") {
    const std::vector<std::string> valid{
        "root.bank[0].g.h.leaf", "root.bank[123456].g.h.leaf", "x.b.g.h.leaf",
        "longer.bank[-2147483648].g.h.leaf", "longer.bank[2147483647].g.h.leaf",
        "root.bank[+00].g.h.leaf", "root.bank[00][1].g.h.leaf", "root.b.g.h. \t leaf",
        "other.b.g.h. \t leaf", "root.\\a.b [1].g.h.leaf", "root.\\long/path [2].g.h.leaf",
        "root.bank[3].g.h.\\escaped.name ", "root.bank[4].g.h.\\escaped.name ",
        "/root/bank[5]/g/h/leaf", "root.bank[0]", "root.bank[1].tail", "plain"};
    const std::vector<std::string> invalid{
        "root.bank[2147483648].g.h.leaf", "root.bank[-2147483649].g.h.leaf",
        "root.bank[+].g.h.leaf", "root.bank[].g.h.leaf", "root.9bank.g.h.leaf",
        "root.\\a.b.g.h.leaf", "root.bank[3].g.h.\\escaped.name", "root.bank[3].g.h.",
        "root.bank[3].g.h. \t ", "root.bank[3].g.h.leaf[2147483648]", "root..g.h.leaf",
        "", "root.", "root.bank[1].", "root.bank[1].g/", "root.bank[1].g/ ",
        std::string("root.bank[0].g.h.leaf\0", 22)};
    for (const auto &text : valid) {
        detail::HierarchyPathValidator cold;
        CHECK(cold.validate(text));
    }
    for (const auto &text : invalid) {
        detail::HierarchyPathValidator cold;
        CHECK_FALSE(cold.validate(text));
    }
    std::vector<std::string> inputs;
    for (const auto &good : valid)
        for (const auto &bad : invalid) {
            inputs.insert(inputs.end(), {good, bad, "root.bank[12345].g.h.leaf",
                "outer.bank[1].g.h.leaf", "outer.bank[2].g.h.other", "outer.bank[23].g.h.other"});
        }
    compare(inputs);
    std::reverse(inputs.begin(), inputs.end());
    compare(inputs);
    std::mt19937 random(0x51a7e);
    std::shuffle(inputs.begin(), inputs.end(), random);
    compare(inputs);
}

TEST_CASE("partial sharing retains translated early boundaries through mixed depth and byte mutations", "[a-m7]") {
    std::mt19937 random(0x196ea);
    std::string alphabet = "abc09. /[]\\-+$\t";
    alphabet.push_back('\0');
    alphabet.push_back(char(0xff));
    for (size_t depth : std::array<size_t, 7>{0, 1, 2, 3, 8, 64, 128}) {
        std::string tail;
        for (size_t i = 0; i < depth; ++i)
            tail += "g" + std::to_string(i) + "[0][-2].";
        tail += "leaf";
        std::vector<std::string> inputs;
        for (size_t i = 0; i < 1600; ++i) {
            auto text = "root.bank[" + std::to_string(i % 211) + "]." + tail;
            if (i % 5 == 0) text.replace(0, 4, "much_longer_outer_scope");
            if (i % 7 == 0) text += ".bad[2147483648]";
            if (i % 11 == 0) text.resize(size_t(random()) % text.size());
            if (!text.empty() && i % 13 == 0)
                text[size_t(random()) % text.size()] = alphabet[random() % alphabet.size()];
            inputs.push_back(std::move(text));
            if (i % 17 == 0) inputs.push_back("root.bank[987654]." + tail);
            if (i % 19 == 0) inputs.push_back("x.b." + tail);
            if (i % 23 == 0) inputs.push_back("short");
        }
        compare(inputs);
        std::shuffle(inputs.begin(), inputs.end(), random);
        compare(inputs);
        std::reverse(inputs.begin(), inputs.end());
        compare(inputs);
    }
}

TEST_CASE("actual local paths under a fixed outer generate retain complete search pages and owning output", "[a-m7]") {
    std::string expected;
    std::vector<model::ObjectHit> retained;
    for (bool per : {false, true})
        for (size_t cache : {size_t{0}, size_t{1}, size_t{1 << 20}}) {
            model::OpenOptions options;
            options.files = {HIER_PATH_PARTIAL_TAILS_FIXTURE};
            options.forcePerInstanceBodies = per;
            options.connectionCacheBytes = cache;
            auto opened = Design::open(options);
            REQUIRE(opened);
            auto &design = **opened;
            model::SearchQuery query;
            query.kinds = {model::HitKind::Signal};
            query.scope = "i:0";
            query.text = "no such literal";
            auto empty = design.search(query, {"", 1});
            REQUIRE(empty);
            CHECK(empty->result.items.empty());
            CHECK(empty->completeness.status == "complete");
            query.text = "bank";
            PageRequest page{"", 1};
            std::vector<model::ObjectHit> all;
            size_t pages = 0;
            do {
                auto reply = design.search(query, page);
                REQUIRE(reply);
                CHECK(reply->completeness.status == "complete");
                CHECK((reply->result.next.empty() || reply->result.next != page.cursor));
                all.insert(all.end(), reply->result.items.begin(), reply->result.items.end());
                page.cursor = reply->result.next;
                page.limit = ++pages % 3 ? 1 : 4;
                REQUIRE(pages < 64);
            } while (!page.cursor.empty());
            REQUIRE(all.size() == 24);
            for (size_t i = 0; i < all.size(); ++i) {
                const auto bank = "bank[" + std::to_string(i) + "]";
                const auto &hit = all[i];
                CHECK(hit.kind == model::HitKind::Signal);
                CHECK(hit.name == "value");
                CHECK(hit.inst == "i:0");
                CHECK(hit.def == "d:0");
                CHECK(hit.path == std::vector<std::string>{"partial_tail_top", "root", bank,
                    "s0", "s1", "s2", "s3", "s4", "s5", "value"});
                CHECK(hit.pathText == "partial_tail_top.root." + bank + ".s0.s1.s2.s3.s4.s5.value");
                auto resolved = design.resolvePath(hit.pathText);
                REQUIRE(resolved);
                CHECK(std::find(resolved->result.begin(), resolved->result.end(), hit.ref) != resolved->result.end());
            }
            if (expected.empty()) expected = encoded(all);
            CHECK(encoded(all) == expected);
            std::stop_source stop;
            stop.request_stop();
            auto cancelled = design.search(query, {}, stop.get_token());
            REQUIRE_FALSE(cancelled);
            CHECK(cancelled.error().code == ErrorCode::Cancelled);
            auto retry = design.search(query);
            REQUIRE(retry);
            CHECK(encoded(retry->result.items) == expected);
            retained = std::move(all);
        }
    CHECK(encoded(retained) == expected);
}
