#include "hier/Design.h"
#include "hier/db/SourceIndex.h"
#include <catch2/catch_test_macros.hpp>
#include <fstream>
#include <set>

using namespace hier;
namespace {
std::unique_ptr<Design> open(bool per = false) {
    model::OpenOptions options;
    options.files = {A_SOURCE_FIXTURE};
    options.tops = {"source_edge_top"};
    options.defines = {"A_SOURCE_COMMAND_LINE=1"};
    options.forcePerInstanceBodies = per;
    auto result = Design::open(options);
    REQUIRE(result);
    REQUIRE((*result)->diagnostics().errorCount == 0);
    return std::move(result.value());
}
std::string text(const Design &design, const std::string &ref, model::SourceKind kind) {
    auto span = design.source(ref, kind);
    INFO(ref);
    REQUIRE(span);
    auto file = design.readSource(span->file);
    REQUIRE(file);
    return file->text.substr(span->start.offset, span->end.offset - span->start.offset);
}
} // namespace

TEST_CASE("source hashes use exact SHA-256 bytes and strict UTF-8", "[a-m3-source]") {
    CHECK(*db::sourceHash("", {}) == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    CHECK(*db::sourceHash("abc", {}) == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    CHECK(*db::sourceHash(std::string(1000000, 'a'), {}) ==
          "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
    CHECK(db::sourceUtf8("\xf0\x90\x80\x80"));
    CHECK_FALSE(db::sourceUtf8("\xed\xa0\x80"));
    CHECK_FALSE(db::sourceUtf8("\xe0\x80\x80"));
    CHECK_FALSE(db::sourceUtf8("\xf4\x90\x80\x80"));
    CHECK_FALSE(db::sourceUtf8("\xe2\x82"));
}

TEST_CASE("source declarators connections registers and nested macro use physical tokens", "[a-m3-source]") {
    for (bool per : {false, true}) {
        auto d = open(per);
        using K = model::SourceKind;
        CHECK(text(*d, "p:0:0", K::Definition) == "a");
        CHECK(text(*d, "p:0:1", K::Definition) == "b");
        CHECK(text(*d, "p:0.0:0", K::Definition) == "a");
        CHECK(text(*d, "p:0.0:1", K::Definition) == "b");
        CHECK(text(*d, "p:0.0:0", K::Instantiation) == ".a(a & b)");
        CHECK(text(*d, "p:0.0:1", K::Instantiation) == ".b()");
        CHECK(text(*d, "p:0.1:1", K::Instantiation) == "b");
        CHECK(text(*d, "x:0:0", K::Statement) == ".a(a & b)");
        CHECK(text(*d, "x:0.0:0", K::Statement) == "`A_OUTER(nested, a)");
        CHECK(text(*d, "x:0.0:1", K::Statement) == "always_ff @(posedge a) q <= b;");
        CHECK(text(*d, "i:0.14", K::Instantiation) == "gate(primitive_value, a)");
        CHECK(text(*d, "p:0.14:0", K::Instantiation) == "primitive_value");
        CHECK(text(*d, "p:0.15:0", K::Instantiation) == ".A(b)");
        auto blackbox = d->source("i:0.15", K::Definition);
        REQUIRE_FALSE(blackbox);
        CHECK(blackbox.error().code == ErrorCode::NotFound);
        auto registers = d->registers("i:0.0");
        REQUIRE(registers);
        REQUIRE(registers->result.items.size() == 1);
        CHECK(text(*d, registers->result.items[0].ref, K::Statement) ==
              "always_ff @(posedge a) q <= b;");
        auto signals = d->signals("i:0.0");
        REQUIRE(signals);
        for (const auto &signal : signals->items)
            if (signal.name == "first" || signal.name == "second")
                CHECK(text(*d, signal.ref, K::Definition) == signal.name);
    }
}

TEST_CASE("source pages preserve ties between kinds and local ids and reject invalid coordinates", "[a-m3-source]") {
    auto d = open();
    auto inputs = d->checkInputs();
    REQUIRE(inputs);
    CHECK(inputs->complete);
    CHECK(inputs->changed.empty());
    auto span = d->source("i:0.0", model::SourceKind::Definition);
    REQUIRE(span);
    auto read = d->readSource(span->file);
    REQUIRE(read);
    size_t lines = 1;
    for (char ch : read->text)
        lines += ch == '\n';
    for (size_t line = 1; line <= lines; ++line) {
        PageRequest request;
        request.limit = 1000;
        auto all = d->resolveSource(span->file, line, {}, request);
        REQUIRE(all);
        std::vector<std::tuple<std::string, model::SourceKind, size_t, size_t>> expected, got;
        auto append = [](auto &output, const auto &page) {
            for (const auto &hit : page.result.items)
                output.emplace_back(hit.ref, hit.kind, hit.span.start.offset, hit.span.end.offset);
        };
        append(expected, *all);
        request.limit = 1;
        do {
            auto page = d->resolveSource(span->file, line, {}, request);
            REQUIRE(page);
            append(got, *page);
            request.cursor = page->result.next;
        } while (!request.cursor.empty());
        CHECK(got == expected);
        CHECK(std::set(expected.begin(), expected.end()).size() == expected.size());
    }
    for (auto [line, col] : {std::pair<size_t, size_t>{0,1}, {1,0}, {lines+1,1}, {1,10000}}) {
        auto bad = d->resolveSource(span->file, line, col);
        REQUIRE_FALSE(bad);
        CHECK(bad.error().code == ErrorCode::BadRequest);
    }
}

TEST_CASE("source instance arrays share a span and sort by numeric occurrence", "[a-m3-source]") {
    auto d = open();
    auto span = d->source("i:0.2", model::SourceKind::Instantiation);
    REQUIRE(span);
    auto page = d->resolveSource(span->file, span->start.line, span->start.column);
    REQUIRE(page);
    std::vector<std::string> got, expected;
    for (const auto &hit : page->result.items)
        if (hit.kind == model::SourceKind::Instantiation)
            got.push_back(hit.ref);
    for (size_t i = 2; i < 14; ++i)
        expected.push_back("i:0." + std::to_string(i));
    CHECK(got == expected);
}
