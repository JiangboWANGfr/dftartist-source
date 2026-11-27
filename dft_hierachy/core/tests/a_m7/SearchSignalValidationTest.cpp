#include "Lookup.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <array>

using namespace hier;
namespace {
template <class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
struct Signal {
    std::string name, local;
    std::vector<std::string> segments;
};
const std::vector<Signal> signals{
    {"needle", "g[0].h[1].needle", {"g[0]", "h[1]", "needle"}},
    {"other", "g[0].h[1].other", {"g[0]", "h[1]", "other"}},
    {"tail", "g[0].h[1].tail", {"g[0]", "h[1]", "tail"}},
    {"needle2", "g[0].h[1].needle2", {"g[0]", "h[1]", "needle2"}},
    {"other", "g[1].h[1].other", {"g[1]", "h[1]", "other"}},
    {"a.b", "g[1].h[1].\\a.b ", {"g[1]", "h[1]", "a.b"}},
    {"tail", "g[1].h[1].tail", {"g[1]", "h[1]", "tail"}},
    {"plain", "plain", {"plain"}},
    {"other", "g[0].h[1].other", {"g[0]", "h[1]", "other"}},
    {"", "anonymous..ignored", {}}};

struct Frontend final : frontend::Frontend {
    model::FrontendInfo metadata;
    std::vector<model::TopInfo> tops_{{"t0", 0}, {"t1", 0}};
    std::vector<model::DefInfo> defs_{{"D", model::DefKind::Module, "", 0}};
    model::BodySkeleton body;
    model::BodyConnections facts;
    std::stop_source *stop = nullptr;
    Frontend() {
        for (const auto &item : signals) {
            model::SignalInfo signal;
            signal.name = item.name;
            signal.localPath = item.local;
            facts.signals.push_back(std::move(signal));
        }
        for (size_t i = 0; i < 80; ++i) {
            model::PortInfo port;
            port.name = std::string(128 + i, 'a') + (i % 2 ? ".escaped" : "");
            body.ports.push_back(std::move(port));
        }
        facts.estimatedBytes = 4096;
    }
    const model::FrontendInfo &info() const override { return metadata; }
    const std::vector<model::TopInfo> &tops() const override { return tops_; }
    const std::vector<model::DefInfo> &definitions() const override { return defs_; }
    size_t bodyCount() const override { return 1; }
    model::Diagnostics diagnostics(size_t) const override { return {}; }
    model::BodySkeleton skeleton(model::BodyId) const override { return body; }
    model::BodyConnections connections(model::BodyId) const override {
        if (stop)
            stop->request_stop();
        return facts;
    }
};
auto openDesign() {
    model::OpenOptions options;
    options.files = {HIER_SEARCH_SIGNAL_VALIDATION_FIXTURE};
    auto value = Design::open(options);
    REQUIRE(value);
    return std::move(value.value());
}
std::vector<model::ObjectHit> expected(std::string_view text, bool scoped) {
    std::vector<model::ObjectHit> out;
    for (size_t top = 0; top < (scoped ? 1u : 2u); ++top)
        for (size_t i = 0; i < signals.size(); ++i) {
            const auto &item = signals[i];
            const auto parent = "t" + std::to_string(top);
            const auto pathText = parent + (item.name.empty() ? "" : "." + item.local);
            if (item.name.find(text) == item.name.npos && pathText.find(text) == pathText.npos)
                continue;
            model::ObjectHit hit;
            hit.kind = model::HitKind::Signal;
            hit.ref = "s:" + std::to_string(top) + ":" + std::to_string(i);
            hit.inst = "i:" + std::to_string(top);
            hit.def = "d:0";
            hit.name = item.name;
            hit.path = {parent};
            hit.path.insert(hit.path.end(), item.segments.begin(), item.segments.end());
            hit.pathText = pathText;
            out.push_back(std::move(hit));
        }
    return out;
}
} // namespace

TEST_CASE("signal validation batches retain rejected and returned row ordering and owning pages", "[a-m7]") {
    auto design = openDesign();
    std::vector<model::ObjectHit> retained;
    for (size_t budget : {size_t{0}, size_t{1}, size_t{4096}, size_t{1 << 20}}) {
        db::DesignDb db(std::make_unique<Frontend>(), budget);
        for (const auto text : {"", "needle", "other", "t0", "t1.g", "h[1].tail", " ", "no match"})
            for (bool scoped : {false, true}) {
                model::SearchQuery query;
                query.text = text;
                query.kinds = {model::HitKind::Signal, model::HitKind::Signal};
                if (scoped)
                    query.scope = "i:0";
                PageRequest page{"", 1};
                std::vector<model::ObjectHit> actual;
                size_t count = 0;
                do {
                    auto value = detail::search(*design, db, query, page, {});
                    REQUIRE(value);
                    CHECK(value->completeness.status == "complete");
                    CHECK(value->result.items.size() <= size_t(page.limit));
                    CHECK((value->result.next.empty() || value->result.next != page.cursor));
                    actual.insert(actual.end(), value->result.items.begin(), value->result.items.end());
                    page.cursor = value->result.next;
                    page.limit = ++count % 2 ? 3 : 1;
                    REQUIRE(count < 30);
                } while (!page.cursor.empty());
                CHECK(json(actual) == json(expected(text, scoped)));
                if (query.text.empty() && !scoped)
                    retained = std::move(actual);
            }
    }
    CHECK(json(retained) == json(expected("", false))); // All DB leases have ended.
}

TEST_CASE("search batch validation cannot hide malformed shared or diverging signal tails", "[a-m7]") {
    auto design = openDesign();
    for (const auto bad : {"g[0].h[1].tail.", "g[0].h[1].tail[2147483648]",
                           "g[0].h[1].\\bad", "g[1].", "g[0].h[1]."})
        for (size_t index : {size_t{1}, size_t{2}, size_t{5}, size_t{8}})
            for (int limit : {1, 200})
                for (const auto text : {"needle", "no match"}) {
                    auto source = std::make_unique<Frontend>();
                    // One returned row followed by rejected rows, then a bad
                    // lookahead tail. No earlier second match can end the page.
                    for (size_t i = 1; i < source->facts.signals.size(); ++i)
                        source->facts.signals[i].name = "other";
                    source->facts.signals[3].localPath = "g[0].h[1].other2";
                    source->facts.signals[index].localPath = bad;
                    db::DesignDb db(std::move(source), 0);
                    model::SearchQuery query;
                    query.text = text;
                    query.kinds = {model::HitKind::Signal};
                    auto value = detail::search(*design, db, query, {"", limit}, {});
                    REQUIRE_FALSE(value);
                    CHECK(value.error().code == ErrorCode::Internal);
                    CHECK(value.error().message == "invalid frontend object path: " + std::string(bad));
                }
}

TEST_CASE("temporary port text stays outside signal prefix leases and keeps validation errors", "[a-m7]") {
    auto design = openDesign();
    for (size_t budget : {size_t{0}, size_t{1 << 20}}) {
        db::DesignDb db(std::make_unique<Frontend>(), budget);
        for (const auto text : {"", "escaped", "no match"}) {
            model::SearchQuery query;
            query.text = text;
            query.kinds = {model::HitKind::Port};
            auto value = detail::search(*design, db, query, {"", 200}, {});
            REQUIRE(value);
            CHECK(value->result.items.size() == (query.text.empty() ? 160u : query.text == "escaped" ? 80u : 0u));
        }
    }
    auto source = std::make_unique<Frontend>();
    source->body.ports[4].name = "has space";
    db::DesignDb db(std::move(source), 0);
    model::SearchQuery query;
    query.text = "no match";
    query.kinds = {model::HitKind::Port};
    auto value = detail::search(*design, db, query, {}, {});
    REQUIRE_FALSE(value);
    CHECK(value.error().code == ErrorCode::Internal);
    CHECK(value.error().message == "invalid frontend object path: \\has space ");
}

TEST_CASE("search signal batch cancellation retains validation priority and same snapshot retry", "[a-m7]") {
    auto design = openDesign();
    auto source = std::make_unique<Frontend>();
    auto &control = *source;
    db::DesignDb db(std::move(source), 0);
    model::SearchQuery query;
    query.text = "no match";
    query.kinds = {model::HitKind::Signal};
    std::stop_source stop;
    control.stop = &stop;
    auto value = detail::search(*design, db, query, {}, stop.get_token());
    REQUIRE_FALSE(value);
    CHECK(value.error().code == ErrorCode::Cancelled);
    auto invalid = detail::search(*design, db, query, {"", 0}, stop.get_token());
    REQUIRE_FALSE(invalid);
    CHECK(invalid.error().code == ErrorCode::BadRequest);
    control.stop = nullptr;
    auto retry = detail::search(*design, db, query, {}, {});
    REQUIRE(retry);
    CHECK(retry->result.items.empty());
    query.text = "";
    auto all = detail::search(*design, db, query, {}, {});
    REQUIRE(all);
    CHECK(json(all->result.items) == json(expected("", false)));
}
