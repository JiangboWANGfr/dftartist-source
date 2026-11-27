#include "HierarchyPath.h"
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <array>
#include <random>

using namespace hier;
namespace {
void checkBatch(const std::vector<std::string> &inputs) {
    detail::HierarchyPathValidator batch;
    std::string_view previous;
    for (const auto &text : inputs) {
        INFO("input: " << text);
        INFO("previous: " << previous);
        auto full = detail::parseHierarchyPath(text);
        const bool actual = batch.validate(text);
        detail::HierarchyPathValidator cold;
        CHECK(actual == bool(full));
        CHECK(actual == bool(detail::validateHierarchyPath(text)));
        CHECK(actual == cold.validate(text));
        if (!full) {
            CHECK(full.error().code == ErrorCode::BadRequest);
            CHECK(full.error().message == "invalid hierarchy path syntax");
        }
        previous = text;
    }
}
template <class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
} // namespace

TEST_CASE("syntax suffix reuse requires a complete prefix and translates full boundary offsets", "[a-m7]") {
    std::vector<std::string> inputs{
        "bank[0].g.h.leaf", "bank[12345].g.h.leaf", "bank[12345].g.h.",
        "bank[12345].g.h.leaf", "bank[-2].g.h.leaf", "b.g.h.leaf", "b.g.h.other",
        "bank[2147483648].g.h.other", "bank[2].g.h.other", "bank[2].g.h. \t leaf",
        "bank[30].g.h. \t leaf", "bank[30].g.h.   ", "bank[0].g.h.leaf",
        "\\a.b [2].g.h.leaf", "\\other/path [2].g.h.leaf", "\\bad.g.h.leaf",
        "bank[-2147483648].g.h.leaf", "bank[+00].g.h.leaf", "bank[+].g.h.leaf",
        "bank[0].g.h.leaf[2147483648]", "bank[1].g.h.leaf", "bank[2].g.h.leaf",
        "bank[30].g.h.\\a.b ", "bank[400].g.h.\\a.b ", "bank[400].g.h.\\a.b",
        "bank[500].g.h.\\a.b ", "bank[500].g.h.\\a.b /leaf", "bank[50].g.h.\\a.b /leaf",
        "bank[50].g.h.\\a.b /", "bank[5].g.h.\\a.b /leaf", "a.b.c.d", "a.b.x.d",
        "a.b.x.d", "a.b.x.", "a.b.x.d", "/root/a/b", "/other/a/b", "/other/a/",
        std::string("bank[0].\\a\0b .leaf", 18), std::string("bank[1234].\\a\0b .leaf", 21)};
    checkBatch(inputs);
    std::reverse(inputs.begin(), inputs.end());
    checkBatch(inputs);
    std::mt19937 random(0x38ace);
    std::shuffle(inputs.begin(), inputs.end(), random);
    checkBatch(inputs);
}

TEST_CASE("ordinary name validation never consumes complex or malformed grammar", "[a-m7]") {
    std::vector<std::string> inputs{"a", "other$09", "_", "A0", "a ", "a[0]", "a[1]",
        "a[2147483648]", "a", "a.b", "other.b", "other. b", "other. ", "a", "",
        " ", "/", "/a", "//a", "9a", "$a", "a-b", "a+", "a[]", "\\a ", "\\a",
        std::string("a\0b", 3), std::string("\\a\0b ", 5), "good", "g.h.a", "longer.h.a", "good"};
    checkBatch(inputs);
    std::reverse(inputs.begin(), inputs.end());
    checkBatch(inputs);
}

TEST_CASE("syntax prefix and suffix choices equal full parsing across deep shuffled byte changes", "[a-m7]") {
    std::mt19937 random(0xb95e2);
    std::string alphabet = "ab.$/[] \\-+09";
    alphabet.push_back('\0');
    alphabet.push_back(char(0xff));
    for (size_t depth : std::array<size_t, 7>{0, 1, 2, 3, 8, 64, 128}) {
        std::string tail;
        for (size_t i = 0; i < depth; ++i)
            tail += "g" + std::to_string(i) + "[-2][3].";
        tail += "leaf";
        std::vector<std::string> inputs;
        for (size_t i = 0; i < 1800; ++i) {
            auto text = "bank[" + std::to_string(i % 101) + "]." + tail;
            if (i % 3 == 0)
                text = "outer." + text;
            if (i % 5 == 0)
                text += "[2147483648]";
            if (i % 7 == 0)
                text.resize(size_t(random()) % text.size());
            if (i % 11 == 0)
                text.replace(0, text.find('.') + 1, "bank[2147483648].");
            if (!text.empty() && i % 13 == 0)
                text[size_t(random()) % text.size()] = alphabet[random() % alphabet.size()];
            inputs.push_back(std::move(text));
            if (i % 17 == 0)
                inputs.push_back("bank[987654]." + tail);
            if (i % 19 == 0)
                inputs.push_back("plain_name");
        }
        checkBatch(inputs);
        std::shuffle(inputs.begin(), inputs.end(), random);
        checkBatch(inputs);
        std::reverse(inputs.begin(), inputs.end());
        checkBatch(inputs);
    }
}

TEST_CASE("real Core generate path searches keep complete owning pages and round trip identities", "[a-m7]") {
    std::string baseline;
    std::vector<model::ObjectHit> retained;
    for (bool per : {false, true})
        for (size_t budget : {size_t{0}, size_t{1}, size_t{1 << 20}}) {
            model::OpenOptions options;
            options.files = {HIER_PATH_VALIDATION_TAILS_FIXTURE};
            options.forcePerInstanceBodies = per;
            options.connectionCacheBytes = budget;
            auto opened = Design::open(options);
            REQUIRE(opened);
            auto &design = **opened;
            model::SearchQuery query;
            query.kinds = {model::HitKind::Signal};
            query.text = "no literal hit";
            auto empty = design.search(query, {"", 1});
            REQUIRE(empty);
            CHECK(empty->result.items.empty());
            query.text = "bank";
            query.scope = "i:0";
            PageRequest page{"", 1};
            std::vector<model::ObjectHit> all;
            size_t pages = 0;
            do {
                auto value = design.search(query, page);
                REQUIRE(value);
                CHECK(value->completeness.status == "complete");
                CHECK((value->result.next.empty() || value->result.next != page.cursor));
                all.insert(all.end(), value->result.items.begin(), value->result.items.end());
                page.cursor = value->result.next;
                page.limit = ++pages % 3 ? 1 : 4;
                REQUIRE(pages < 32);
            } while (!page.cursor.empty());
            REQUIRE(all.size() == 12);
            for (size_t i = 0; i < all.size(); ++i) {
                const auto bank = "bank[" + std::to_string(i) + "]";
                const auto &hit = all[i];
                CHECK(hit.kind == model::HitKind::Signal);
                CHECK(hit.name == "value");
                CHECK(hit.inst == "i:0");
                CHECK(hit.def == "d:0");
                CHECK(hit.path == std::vector<std::string>{"path_tail_top", bank, "stage[0]", "value"});
                CHECK(hit.pathText == "path_tail_top." + bank + ".stage[0].value");
                auto resolved = design.resolvePath(hit.pathText);
                REQUIRE(resolved);
                CHECK(std::find(resolved->result.begin(), resolved->result.end(), hit.ref) != resolved->result.end());
            }
            if (baseline.empty())
                baseline = json(all);
            CHECK(json(all) == baseline);
            std::stop_source stop;
            stop.request_stop();
            auto cancelled = design.search(query, {}, stop.get_token());
            REQUIRE_FALSE(cancelled);
            CHECK(cancelled.error().code == ErrorCode::Cancelled);
            auto retry = design.search(query);
            REQUIRE(retry);
            CHECK(json(retry->result.items) == baseline);
            retained = std::move(all);
        }
    CHECK(json(retained) == baseline); // Designs and their pinned facts have been released.
}
