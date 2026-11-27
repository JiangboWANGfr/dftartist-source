#include "SearchPathText.h"
#include "Lookup.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
#include <random>

using namespace hier;
namespace {
template<class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
struct Frontend final : frontend::Frontend {
    model::FrontendInfo metadata;
    std::vector<model::TopInfo> tops_{{"par.ent", 0}};
    std::vector<model::DefInfo> defs_{{"Def.With.Dot", model::DefKind::Module, "", 0}};
    model::BodySkeleton body;
    model::BodyConnections facts;
    std::stop_source *stop = nullptr;
    Frontend() {
        for (const auto name : {"abc", "a.b", ""}) {
            model::PortInfo port;
            port.name = name;
            body.ports.push_back(std::move(port));
        }
        for (const auto &[name, path] : std::array<std::pair<const char *, const char *>, 3>{
                 {{"signal", "bank[-2].\\a.b "}, {"", "ignored..path"}, {"z", "nested[2].z"}}}) {
            model::SignalInfo signal;
            signal.name = name;
            signal.localPath = path;
            facts.signals.push_back(std::move(signal));
        }
        facts.processes.resize(2);
        facts.registers.resize(1);
        facts.estimatedBytes = 1024;
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
std::vector<model::ObjectHit> knownHits() {
    using model::HitKind;
    std::vector<model::ObjectHit> result;
    auto add = [&](HitKind kind, std::string ref, std::string name,
                   std::vector<std::string> path, std::string pathText) {
        model::ObjectHit hit;
        hit.kind = kind; hit.ref = std::move(ref); hit.name = std::move(name);
        hit.path = std::move(path); hit.pathText = std::move(pathText); hit.def = "d:0";
        if (kind != HitKind::Definition)
            hit.inst = "i:0";
        result.push_back(std::move(hit));
    };
    // Handwritten complete public fields, independent of production path builders.
    add(HitKind::Definition, "d:0", "Def.With.Dot", {"Def.With.Dot"}, "\\Def.With.Dot ");
    add(HitKind::Instance, "i:0", "par.ent", {"par.ent"}, "\\par.ent ");
    add(HitKind::Port, "p:0:0", "abc", {"par.ent", "abc"}, "\\par.ent .abc");
    add(HitKind::Port, "p:0:1", "a.b", {"par.ent", "a.b"}, "\\par.ent .\\a.b ");
    add(HitKind::Port, "p:0:2", "", {"par.ent"}, "\\par.ent ");
    add(HitKind::Signal, "s:0:0", "signal", {"par.ent", "bank[-2]", "a.b"}, "\\par.ent .bank[-2].\\a.b ");
    add(HitKind::Signal, "s:0:1", "", {"par.ent"}, "\\par.ent ");
    add(HitKind::Signal, "s:0:2", "z", {"par.ent", "nested[2]", "z"}, "\\par.ent .nested[2].z");
    add(HitKind::Process, "x:0:0", "@process:0", {"par.ent", "@process:0"}, "\\par.ent .@process:0");
    add(HitKind::Process, "x:0:1", "@process:1", {"par.ent", "@process:1"}, "\\par.ent .@process:1");
    add(HitKind::Register, "r:0:0", "@register:0", {"par.ent", "@register:0"}, "\\par.ent .@register:0");
    return result;
}
auto openDesign() {
    model::OpenOptions options;
    options.files = {HIER_SEARCH_PATH_MATCHING_FIXTURE};
    auto result = Design::open(options);
    REQUIRE(result);
    return std::move(result.value());
}
} // namespace

TEST_CASE("literal path windows equal full concatenation across arbitrary bytes", "[a-m7]") {
    std::mt19937 random(843921);
    const std::string alphabet("ab .[\\/\0\xff", 9);
    auto bytes = [&](size_t size) {
        std::string value;
        for (size_t i = 0; i < size; ++i)
            value += alphabet[random() % alphabet.size()];
        return value;
    };
    for (size_t iteration = 0; iteration < 8000; ++iteration) {
        const auto parent = bytes(random() % 256);
        const auto sample = bytes(random() % 128);
        auto text = bytes(random() % 48);
        const auto joined = parent + '.' + sample;
        if (iteration % 3) {
            const auto start = random() % (joined.size() + 1);
            text = joined.substr(start, random() % 64);
        }
        detail::SearchPathText match(parent, text);
        for (size_t localIndex = 0; localIndex < 12; ++localIndex) {
            const auto local = localIndex ? bytes(random() % 256) : sample;
            for (bool appended : {false, true}) {
                const auto full = appended ? parent + '.' + local : parent;
                CHECK(match.matches(local, appended) == (full.find(text) != std::string::npos));
            }
        }
    }
}

TEST_CASE("path windows include both dot edges and reset reused local tails", "[a-m7]") {
    const std::vector<std::string> parents{"", "a", "a.b", "\\par.ent ", std::string(8192, 'a')};
    for (const auto &parent : parents) {
        const std::vector<std::string> locals{"", "a", "b", "\\a.b ", "a.b.c", std::string(4096, 'b')};
        std::vector<std::string> patterns{"", ".", "a.", ".a", " .", "ent .\\", "/", "[", "*", "a.b", "ab"};
        patterns.push_back(std::string(".\0", 2));
        patterns.push_back(std::string(16384, 'z'));
        for (const auto &text : patterns) {
            detail::SearchPathText match(parent, text);
            for (size_t round = 0; round < 2; ++round)
                for (const auto &local : locals)
                    for (bool appended : {false, true})
                        CHECK(match.matches(local, appended) ==
                              ((appended ? parent + '.' + local : parent).find(text) != std::string::npos));
        }
    }
}

TEST_CASE("all search kinds retain complete owning rows and changing page limits", "[a-m7]") {
    auto design = openDesign();
    const auto all = knownHits();
    std::vector<model::ObjectHit> retained;
    for (size_t budget : {size_t{0}, size_t{1}, size_t{1024}, size_t{1 << 20}}) {
        db::DesignDb db(std::make_unique<Frontend>(), budget);
        std::vector<std::optional<std::vector<model::HitKind>>> kinds{std::nullopt, std::vector<model::HitKind>{}};
        for (size_t k = 0; k < 6; ++k)
            kinds.push_back(std::vector{model::HitKind(k)});
        kinds.push_back(std::vector{model::HitKind::Signal, model::HitKind::Port, model::HitKind::Signal});
        std::vector<std::string> texts{"", ".", " ", "par.ent", "Def.With.Dot", "ent .a", ".\\a.b ",
            " .bank", "@process:", "@register:", "ignored", "*", "no match", std::string("\0", 1)};
        for (const auto &text : texts)
            for (const auto &selected : kinds)
                for (bool scoped : {false, true}) {
                    model::SearchQuery query;
                    query.text = text; query.kinds = selected;
                    if (scoped)
                        query.scope = "i:0";
                    std::vector<model::ObjectHit> expected;
                    for (const auto &hit : all) {
                        if (selected && std::find(selected->begin(), selected->end(), hit.kind) == selected->end())
                            continue;
                        if (hit.name.find(text) != std::string::npos || hit.pathText.find(text) != std::string::npos ||
                            (hit.kind == model::HitKind::Instance && std::string_view("Def.With.Dot").find(text) != std::string::npos))
                            expected.push_back(hit);
                    }
                    std::vector<model::ObjectHit> actual;
                    PageRequest page{"", 1};
                    size_t pages = 0;
                    do {
                        auto result = detail::search(*design, db, query, page, {});
                        REQUIRE(result);
                        CHECK(result->completeness.status == "complete");
                        CHECK(result->result.items.size() <= size_t(page.limit));
                        if (!result->result.next.empty())
                            CHECK(result->result.next != page.cursor);
                        actual.insert(actual.end(), result->result.items.begin(), result->result.items.end());
                        page.cursor = result->result.next;
                        page.limit = ++pages % 3 ? 2 : 1;
                        REQUIRE(pages < 20);
                    } while (!page.cursor.empty());
                    CHECK(json(actual) == json(expected));
                    if (text.empty() && !selected)
                        retained = actual;
                }
    }
    CHECK(json(retained) == json(all)); // All DBs have already been destroyed.
}

TEST_CASE("search validates matching and nonmatching lookahead before publishing a page", "[a-m7]") {
    auto design = openDesign();
    for (const auto text : {"signal", "par.ent", "no match"}) {
        auto source = std::make_unique<Frontend>();
        source->facts.signals[1].name = "other";
        source->facts.signals[1].localPath = "bad..path";
        db::DesignDb db(std::move(source), 0);
        model::SearchQuery query;
        query.kinds = {model::HitKind::Signal}; query.text = text;
        auto result = detail::search(*design, db, query, {"", 1}, {});
        REQUIRE_FALSE(result);
        CHECK(result.error().code == ErrorCode::Internal);
        CHECK(result.error().message == "invalid frontend object path: bad..path");
    }
    auto source = std::make_unique<Frontend>();
    auto &control = *source;
    db::DesignDb db(std::move(source), 0);
    model::SearchQuery query;
    query.kinds = {model::HitKind::Signal}; query.text = " .";
    std::stop_source stop;
    control.stop = &stop;
    auto cancelled = detail::search(*design, db, query, {}, stop.get_token());
    REQUIRE_FALSE(cancelled);
    CHECK(cancelled.error().code == ErrorCode::Cancelled);
    control.stop = nullptr;
    auto retried = detail::search(*design, db, query, {}, {});
    REQUIRE(retried);
    CHECK(retried->result.items.size() == 2); // The anonymous signal has no appended dot.
}
