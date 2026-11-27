#include "HierarchyPath.h"
#include "Lookup.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <array>
#include <random>

using namespace hier;
namespace {
std::string encoded(const std::vector<model::ObjectHit> &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
model::ObjectHit hit(model::HitKind kind, std::string ref, std::string name,
                     std::vector<std::string> path, std::string text) {
    model::ObjectHit value;
    value.kind = kind;
    value.ref = std::move(ref);
    value.name = std::move(name);
    value.path = std::move(path);
    value.pathText = std::move(text);
    value.inst = "i:0";
    value.def = "d:0";
    return value;
}
struct Paths final : frontend::Frontend {
    bool broken;
    model::FrontendInfo metadata;
    std::vector<model::TopInfo> roots{{"top", 0}};
    std::vector<model::DefInfo> defs{{"D", model::DefKind::Module, "", 0}};
    explicit Paths(bool invalid = false) : broken(invalid) {}
    const model::FrontendInfo &info() const override { return metadata; }
    const std::vector<model::TopInfo> &tops() const override { return roots; }
    const std::vector<model::DefInfo> &definitions() const override { return defs; }
    size_t bodyCount() const override { return 1; }
    model::Diagnostics diagnostics(size_t) const override { return {}; }
    model::BodySkeleton skeleton(model::BodyId) const override {
        model::BodySkeleton value;
        for (const auto name : {"clk", "a.b", "bus[3]", ""}) {
            model::PortInfo port;
            port.name = name;
            value.ports.push_back(std::move(port));
        }
        return value;
    }
    model::BodyConnections connections(model::BodyId) const override {
        model::BodyConnections value;
        auto add = [&](std::string name, std::string path) {
            model::SignalInfo signal;
            signal.name = std::move(name);
            signal.localPath = std::move(path);
            value.signals.push_back(std::move(signal));
        };
        if (broken) {
            add("hit", "good");
            add("hit", "bad.");
        } else {
            add("display", "g[+0002].\\a.b [ -0003 ].leaf");
            add("plain", "plain");
            add("escaped", "\\literal[2] ");
            add("", "broken..ignored");
        }
        value.estimatedBytes = 4096;
        return value;
    }
};
auto design() {
    model::OpenOptions options;
    options.files = {HIER_DISPLAY_PATH_FIXTURE};
    auto opened = Design::open(options);
    REQUIRE(opened);
    return std::move(opened.value());
}
} // namespace

TEST_CASE("direct display owns its prefix and canonical indices without changing escaped names", "[a-m7]") {
    const std::vector<std::pair<std::string, std::vector<std::string>>> cases{
        {"a", {"a"}}, {"/a/b", {"a", "b"}},
        {" a[+0002][-0][-0002] .b ", {"a[2][0][-2]", "b"}},
        {"\\a.b [2147483647][-2147483648].leaf", {"a.b[2147483647][-2147483648]", "leaf"}},
        {"\\bus[3] ", {"bus[3]"}}, {"\\slash/name /tail", {"slash/name", "tail"}},
        {std::string("\\a\0b ", 5), {std::string("a\0b", 3)}}};
    for (const auto &[text, segments] : cases) {
        auto value = detail::displayHierarchyPath(text);
        REQUIRE(value);
        CHECK(*value == segments);
        const std::vector<std::string> prefix{"owner.with.dot", "literal[03]"};
        auto prefixed = detail::displayHierarchyPath(text, prefix);
        REQUIRE(prefixed);
        auto expected = prefix;
        expected.insert(expected.end(), segments.begin(), segments.end());
        CHECK(*prefixed == expected);
    }
    std::vector<std::string> prefix{"unparsed/prefix", ""};
    std::string text = "\\long.name .leaf[+0002]";
    auto owned = detail::displayHierarchyPath(text, prefix);
    REQUIRE(owned);
    text.assign("changed");
    prefix.clear();
    CHECK(*owned == std::vector<std::string>{"unparsed/prefix", "", "long.name", "leaf[2]"});
    prefix = {"retained"};
    for (const auto bad : {"", " ", "/", "a.", "a. \t ", "\\missing", "a[]",
                           "a[2147483648]", "a[-2147483649]", "a[+]", "a..b"}) {
        auto value = detail::displayHierarchyPath(bad, prefix);
        REQUIRE_FALSE(value);
        CHECK(value.error().code == ErrorCode::BadRequest);
        CHECK(value.error().message == "invalid hierarchy path syntax");
        CHECK(prefix == std::vector<std::string>{"retained"});
    }
}

TEST_CASE("direct display equals complete parsing and original display across mixed deep byte inputs", "[a-m7]") {
    std::mt19937 random(0x56e31);
    std::string alphabet = "ab09_$. /[]\\+-\t";
    alphabet.push_back('\0');
    alphabet.push_back(char(0xff));
    const std::vector<std::string> prefix{"prefix.with.dots", "scope[-1]"};
    for (size_t depth : std::array<size_t, 7>{0, 1, 2, 3, 8, 64, 128}) {
        std::string base;
        for (size_t i = 0; i < depth; ++i) base += "g" + std::to_string(i) + "[+0002][-0].";
        for (size_t i = 0; i < 1800; ++i) {
            auto text = base + "leaf";
            if (i % 3 == 0) text += ".\\a.b [-0003]";
            if (i % 5 == 0) text += "[2147483648]";
            if (i % 7 == 0) text.resize(size_t(random()) % text.size());
            if (!text.empty() && i % 11 == 0)
                text[size_t(random()) % text.size()] = alphabet[random() % alphabet.size()];
            const auto parsed = detail::parseHierarchyPath(text);
            auto value = detail::displayHierarchyPath(text, prefix);
            REQUIRE(bool(value) == bool(parsed));
            if (parsed) {
                auto expected = prefix;
                for (const auto &part : parsed->segments) expected.push_back(detail::displaySegment(part));
                CHECK(*value == expected);
            } else {
                CHECK(value.error().code == parsed.error().code);
                CHECK(value.error().message == parsed.error().message);
            }
        }
    }
}

TEST_CASE("search display keeps raw literal matching, complete owning fields and anonymous paths", "[a-m7]") {
    auto real = design();
    const std::vector<model::ObjectHit> signals{
        hit(model::HitKind::Signal, "s:0:0", "display", {"top", "g[2]", "a.b[-3]", "leaf"}, "top.g[+0002].\\a.b [ -0003 ].leaf"),
        hit(model::HitKind::Signal, "s:0:1", "plain", {"top", "plain"}, "top.plain"),
        hit(model::HitKind::Signal, "s:0:2", "escaped", {"top", "literal[2]"}, "top.\\literal[2] "),
        hit(model::HitKind::Signal, "s:0:3", "", {"top"}, "top")};
    const std::vector<model::ObjectHit> ports{
        hit(model::HitKind::Port, "p:0:0", "clk", {"top", "clk"}, "top.clk"),
        hit(model::HitKind::Port, "p:0:1", "a.b", {"top", "a.b"}, "top.\\a.b "),
        hit(model::HitKind::Port, "p:0:2", "bus[3]", {"top", "bus[3]"}, "top.\\bus[3] "),
        hit(model::HitKind::Port, "p:0:3", "", {"top"}, "top")};
    std::vector<model::ObjectHit> retained;
    for (size_t cache : {size_t{0}, size_t{1}, size_t{1 << 20}}) {
        db::DesignDb db(std::make_unique<Paths>(), cache);
        model::SearchQuery query;
        query.kinds = std::vector{model::HitKind::Signal};
        for (const auto text : {"", "+0002", "g[2]", "a.b", "no match", "display"}) {
            query.text = text;
            std::vector<model::ObjectHit> expected;
            for (const auto &item : signals)
                if (item.name.find(text) != item.name.npos || item.pathText.find(text) != item.pathText.npos)
                    expected.push_back(item);
            PageRequest page{"", 1};
            std::vector<model::ObjectHit> all;
            size_t pages = 0;
            do {
                auto value = detail::search(*real, db, query, page, {});
                REQUIRE(value);
                CHECK(value->completeness.status == "complete");
                CHECK((value->result.next.empty() || value->result.next != page.cursor));
                all.insert(all.end(), value->result.items.begin(), value->result.items.end());
                page.cursor = value->result.next;
                page.limit = ++pages % 2 ? 3 : 1;
                REQUIRE(pages < 10);
            } while (!page.cursor.empty());
            CHECK(encoded(all) == encoded(expected));
            retained = std::move(all);
        }
        query.kinds = std::vector{model::HitKind::Port};
        query.text = "";
        auto value = detail::search(*real, db, query, {}, {});
        REQUIRE(value);
        CHECK(encoded(value->result.items) == encoded(ports));
    }
    CHECK(encoded(retained) == encoded(std::vector<model::ObjectHit>{signals[0]}));
}

TEST_CASE("accepted, rejected and lookahead malformed paths retain original errors and cancel priority", "[a-m7]") {
    auto real = design();
    for (size_t cache : {size_t{0}, size_t{1}, size_t{1 << 20}}) {
        db::DesignDb db(std::make_unique<Paths>(true), cache);
        model::SearchQuery query;
        query.kinds = std::vector{model::HitKind::Signal};
        for (const auto text : {"hit", "no match"})
            for (int limit : {1, 100}) {
                query.text = text;
                auto value = detail::search(*real, db, query, {"", limit}, {});
                REQUIRE_FALSE(value);
                CHECK(value.error().code == ErrorCode::Internal);
                CHECK(value.error().message == "invalid frontend object path: bad.");
            }
        std::stop_source stop;
        stop.request_stop();
        auto cancelled = detail::search(*real, db, query, {}, stop.get_token());
        REQUIRE_FALSE(cancelled);
        CHECK(cancelled.error().code == ErrorCode::Cancelled);
        auto retry = detail::search(*real, db, query, {}, {});
        REQUIRE_FALSE(retry);
        CHECK(retry.error().code == ErrorCode::Internal);
    }
}
