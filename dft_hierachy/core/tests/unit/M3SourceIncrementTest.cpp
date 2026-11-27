// Agent B: DESIGN 5.5.1/5.5.6; expected byte spans and order are handwritten.
// Public API only. No observer, implementation headers or A test helpers.
#include <catch2/catch_test_macros.hpp>
#include "hier/Design.h"
#include <algorithm>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <set>
#include <stop_token>
#include <tuple>
#include <unistd.h> // mkdtemp declaration on the supported macOS/Linux test hosts

using namespace hier;
namespace {
constexpr auto MainHash = "1120a4db735a84f98f43d57472d5e80e66836710ac56b9558121b89f5f2f7248";
constexpr auto IncludeHash = "25906914ac58feace91dac4bdba2ab91b9c0617c874326ad062397b35a8a96c4";
std::string bytes(const std::filesystem::path& path) {
    std::ifstream in(path, std::ios::binary);
    REQUIRE(in.is_open());
    return {std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()};
}
void put(const std::filesystem::path& path, const std::string& value) {
    std::ofstream out(path, std::ios::binary | std::ios::trunc);
    REQUIRE(out.is_open());
    out << value;
    REQUIRE(out.good());
}
struct Files {
    std::filesystem::path folder;
    Files() {
        auto pattern = (std::filesystem::temp_directory_path() / "hier-b-r3-source-XXXXXX").string();
        std::vector<char> buffer(pattern.begin(), pattern.end());
        buffer.push_back('\0');
        auto* created = mkdtemp(buffer.data());
        REQUIRE(created != nullptr);
        folder = created;
        for (const auto* name : {"source_increment.sv", "source_increment.svh"})
            std::filesystem::copy_file(std::filesystem::path(HIER_FIXTURES) / "m3" / name, folder / name);
    }
    ~Files() { std::error_code error; std::filesystem::remove_all(folder, error); }
    std::unique_ptr<Design> open(bool per=false, size_t cache=64U*1024U*1024U,
                                 std::string_view file="source_increment.sv") const {
        model::OpenOptions options;
        options.files = {(folder / file).string()};
        options.tops = {"r3_top"};
        options.defines = {"B_R3_CMD=1"};
        options.forcePerInstanceBodies = per;
        options.connectionCacheBytes = cache;
        auto result = Design::open(options);
        REQUIRE(result.ok());
        auto d = std::move(result.value());
        REQUIRE(d->diagnostics().errorCount == 0);
        return d;
    }
};
std::string root(Design& d) {
    REQUIRE(d.roots().size() == 1);
    CHECK(d.roots()[0].name == "r3_top");
    return d.roots()[0].ref;
}
std::string leafDef(Design& d) {
    const auto defs = d.definitions();
    REQUIRE(defs.ok());
    for (const auto& x : defs->items) if (x.name == "r3_leaf") return x.ref;
    FAIL("missing independent r3_leaf definition");
    return {};
}
std::string signal(Design& d, std::string_view inst, std::string_view name) {
    auto list = d.signals(inst);
    REQUIRE(list.ok());
    for (const auto& x : list->items) if (x.name == name) return x.ref;
    FAIL("missing independent fixture signal");
    return {};
}
std::string process(Design& d, std::string_view inst, std::string_view target) {
    auto list = d.procs(inst);
    REQUIRE(list.ok());
    for (const auto& x : list->items) {
        auto p = d.proc(x.ref);
        REQUIRE(p.ok());
        for (const auto& w : p->result.writes) if (w.target.ref == target) return x.ref;
    }
    FAIL("missing process writing fixture signal");
    return {};
}
model::SourcePos pos(const std::string& data, size_t offset) {
    REQUIRE(offset <= data.size());
    const auto previous = offset == 0 ? std::string::npos : data.rfind('\n', offset-1);
    const auto lines = std::count(data.begin(), data.begin()+static_cast<std::ptrdiff_t>(offset), '\n');
    return {offset, static_cast<size_t>(lines)+1, previous == std::string::npos ? offset+1 : offset-previous};
}
void positionIs(const model::SourcePos& actual, const model::SourcePos& expected) {
    CHECK(actual.offset == expected.offset);
    CHECK(actual.line == expected.line);
    CHECK(actual.column == expected.column);
}
template<class T> void errorIs(const T& r, ErrorCode code) {
    REQUIRE_FALSE(r.ok());
    CHECK(r.error().code == code);
    CHECK_FALSE(r.error().message.empty());
}
using HitKey = std::tuple<std::string, model::SourceKind, size_t, size_t>;
std::vector<HitKey> keys(const std::vector<model::SourceHit>& hits) {
    std::vector<HitKey> result;
    for (const auto& h : hits) result.emplace_back(h.ref, h.kind, h.span.start.offset, h.span.end.offset);
    return result;
}
auto resolve(Design& d, const model::SourceSpan& span, const model::SourcePos& at,
             const PageRequest& request={}) {
    auto r = d.resolveSource(span.file, at.line, at.column, request);
    REQUIRE(r.ok());
    CHECK(r->completeness.status == "complete");
    CHECK(r->completeness.reasons.empty());
    return r;
}
}

TEST_CASE("B R3 source: nested outer macro keeps every numeric occurrence and both source kinds",
          "[b-m3-source-increment]") {
    Files files;
    const auto data = bytes(files.folder / "source_increment.svh");
    const std::string token = "`B_R3_OUTER(from_macro, a)";
    const auto start = data.find(token);
    REQUIRE(start != std::string::npos);
    const auto at = pos(data, start);
    const auto end = pos(data, start+token.size());
    for (bool per : {false,true}) for (size_t cache : {size_t{0}, size_t{64U*1024U*1024U}})
    DYNAMIC_SECTION("per=" << per << " cache=" << cache) {
        auto d = files.open(per, cache);
        const auto top = root(*d);
        const auto children = d->children(top);
        REQUIRE(children.ok());
        REQUIRE(children->items.size() == 12);
        const auto def = leafDef(*d);
        auto span = d->source(def, model::SourceKind::Definition);
        REQUIRE(span.ok());
        std::vector<std::string> expected{def}, signals, processes;
        for (size_t i=0; i<12; ++i) {
            const auto& inst = children->items[i];
            CHECK(inst.name == "u["+std::to_string(i)+"]");
            expected.push_back(inst.ref);
            const auto s = signal(*d, inst.ref, "from_macro");
            const auto p = process(*d, inst.ref, s);
            signals.push_back(s);
            processes.push_back(p);
            for (const auto& entry : {std::pair{s,model::SourceKind::Definition},
                                     std::pair{p,model::SourceKind::Statement}}) {
                const auto location = d->source(entry.first, entry.second);
                REQUIRE(location.ok());
                positionIs(location->start, at);
                positionIs(location->end, end);
                CHECK(location->path == std::filesystem::canonical(files.folder/"source_increment.svh").string());
                CHECK(location->contentHash == IncludeHash);
            }
        }
        expected.insert(expected.end(),signals.begin(),signals.end());
        expected.insert(expected.end(),processes.begin(),processes.end());
        // 1 definition + 12 instance definitions + 12 declaration + 12 statement.
        std::vector<HitKey> cold;
        for (bool hot : {false,true}) {
            PageRequest page;
            page.limit=1;
            std::set<std::string> cursors;
            std::vector<model::SourceHit> got;
            do {
                auto r=resolve(*d,*span,at,page);
                REQUIRE_FALSE(r->result.items.empty());
                REQUIRE(r->result.items.size() <= static_cast<size_t>(page.limit));
                got.insert(got.end(),r->result.items.begin(),r->result.items.end());
                page.cursor=r->result.next;
                if (!page.cursor.empty()) REQUIRE(cursors.insert(page.cursor).second);
                page.limit=hot ? 7 : 2;
                REQUIRE(cursors.size() <= 37);
            } while (!page.cursor.empty());
            REQUIRE(got.size() == 37);
            std::vector<std::string> refs;
            for (const auto& h : got) refs.push_back(h.ref);
            CHECK(refs == expected);
            const auto signature=keys(got);
            CHECK(std::set<HitKey>(signature.begin(),signature.end()).size() == 37);
            if (!hot) cold=signature; else CHECK(signature == cold);
            CHECK_FALSE(got.front().inst.has_value());
            for (size_t i=13; i<25; ++i) CHECK(got[i].kind == model::SourceKind::Definition);
            for (size_t i=25; i<37; ++i) CHECK(got[i].kind == model::SourceKind::Statement);
        }
    }
}

TEST_CASE("B R3 source: physical file table excludes duplicate includes and command macro buffers",
          "[b-m3-source-increment]") {
    Files files;
    std::filesystem::create_symlink(files.folder/"source_increment.sv",files.folder/"alias.sv");
    auto d=files.open(false,0,"alias.sv");
    const auto main=d->source(root(*d),model::SourceKind::Definition);
    const auto included=d->source(leafDef(*d),model::SourceKind::Definition);
    REQUIRE(main.ok()); REQUIRE(included.ok());
    CHECK(main->path == std::filesystem::canonical(files.folder/"source_increment.sv").string());
    CHECK(included->path == std::filesystem::canonical(files.folder/"source_increment.svh").string());
    CHECK(main->file != included->file);
    for (const auto& item : {std::pair{*main,MainHash},std::pair{*included,IncludeHash}}) {
        auto read=d->readSource(item.first.file);
        REQUIRE(read.ok());
        CHECK(read->text == bytes(item.first.path));
        CHECK(read->contentHash == item.second);
        CHECK(item.first.contentHash == item.second);
        CHECK(read->matchesSnapshot);
    }
    auto initial=d->checkInputs();
    REQUIRE(initial.ok()); CHECK(initial->complete); CHECK(initial->changed.empty());
    std::vector<std::pair<std::string,std::string>> sorted{{main->path,main->file},{included->path,included->file}};
    std::sort(sorted.begin(),sorted.end());
    REQUIRE(std::filesystem::remove(files.folder/"source_increment.sv"));
    REQUIRE(std::filesystem::remove(files.folder/"source_increment.svh"));
    auto missing=d->checkInputs();
    REQUIRE(missing.ok());
    CHECK_FALSE(missing->complete);
    CHECK(missing->changed == std::vector<std::string>{sorted[0].second,sorted[1].second});
    CHECK(d->source(leafDef(*d),model::SourceKind::Definition).ok());
}

TEST_CASE("B R3 source: half-open end EOF and whitespace have no fabricated hits",
          "[b-m3-source-increment]") {
    Files files;
    auto d=files.open();
    const auto main=d->source(root(*d),model::SourceKind::Definition);
    const auto leaf=d->source(leafDef(*d),model::SourceKind::Definition);
    REQUIRE(main.ok()); REQUIRE(leaf.ok());
    auto blank=resolve(*d,*main,model::SourcePos{0,1,1});
    CHECK(blank->result.items.empty()); CHECK(blank->result.next.empty());
    auto ended=resolve(*d,*leaf,leaf->end);
    CHECK(ended->result.items.empty()); CHECK(ended->result.next.empty());
    const auto data=bytes(files.folder/"source_increment.svh");
    const auto eof=pos(data,data.size());
    auto last=resolve(*d,*leaf,eof);
    CHECK(last->result.items.empty()); CHECK(last->result.next.empty());
    errorIs(d->resolveSource(leaf->file,eof.line+1,1),ErrorCode::BadRequest);
    errorIs(d->resolveSource(leaf->file,eof.line,eof.column+1),ErrorCode::BadRequest);
    errorIs(d->resolveSource(leaf->file,0,1),ErrorCode::BadRequest);
    errorIs(d->resolveSource(leaf->file,1,0),ErrorCode::BadRequest);
}

TEST_CASE("B R3 source: edits restores and cleanup preserve snapshot bytes and original continuation",
          "[b-m3-source-increment]") {
    std::filesystem::path owned;
    {
        Files files; owned=files.folder;
        auto d=files.open();
        const auto main=d->source(root(*d),model::SourceKind::Definition);
        const auto leaf=d->source(leafDef(*d),model::SourceKind::Definition);
        REQUIRE(main.ok()); REQUIRE(leaf.ok());
        const auto oldMain=bytes(main->path),oldLeaf=bytes(leaf->path);
        PageRequest page; page.limit=1;
        auto first=resolve(*d,*leaf,leaf->start,page);
        REQUIRE_FALSE(first->result.next.empty());
        page.cursor=first->result.next; page.limit=2;
        const auto previous=keys(resolve(*d,*leaf,leaf->start,page)->result.items);
        put(main->path,oldMain+"// main changed\n");
        put(leaf->path,oldLeaf+"// include changed\n");
        auto check=d->checkInputs();
        REQUIRE(check.ok()); CHECK(check->complete);
        std::vector<std::pair<std::string,std::string>> sorted{{main->path,main->file},{leaf->path,leaf->file}};
        std::sort(sorted.begin(),sorted.end());
        CHECK(check->changed == std::vector<std::string>{sorted[0].second,sorted[1].second});
        for (const auto& old : {*main,*leaf}) {
            auto read=d->readSource(old.file);
            REQUIRE(read.ok()); CHECK_FALSE(read->matchesSnapshot);
            CHECK(read->contentHash != old.contentHash);
            CHECK(read->text == bytes(old.path));
        }
        CHECK(keys(resolve(*d,*leaf,leaf->start,page)->result.items) == previous);
        put(main->path,oldMain); put(leaf->path,oldLeaf);
        auto restored=d->checkInputs();
        REQUIRE(restored.ok()); CHECK(restored->complete); CHECK(restored->changed.empty());
        const auto restoredMain=d->readSource(main->file);
        const auto restoredLeaf=d->readSource(leaf->file);
        REQUIRE(restoredMain.ok()); REQUIRE(restoredLeaf.ok());
        CHECK(restoredMain->matchesSnapshot);
        CHECK(restoredLeaf->matchesSnapshot);
        CHECK(keys(resolve(*d,*leaf,leaf->start,page)->result.items) == previous);
    }
    CHECK_FALSE(std::filesystem::exists(owned));
}

TEST_CASE("B R3 source: public errors validate before cancellation and cancelled pages remain retryable",
          "[b-m3-source-increment]") {
    Files files;
    auto d=files.open();
    const auto def=leafDef(*d);
    auto span=d->source(def,model::SourceKind::Definition);
    REQUIRE(span.ok());
    errorIs(d->source(def,static_cast<model::SourceKind>(-1)),ErrorCode::BadRequest);
    errorIs(d->source(def,model::SourceKind::Statement),ErrorCode::NotFound);
    errorIs(d->readSource(span->path),ErrorCode::NotFound);
    PageRequest page; page.limit=1;
    auto first=resolve(*d,*span,span->start,page);
    REQUIRE_FALSE(first->result.next.empty());
    page.cursor=first->result.next;
    const auto expected=keys(resolve(*d,*span,span->start,page)->result.items);
    std::stop_source stop; stop.request_stop();
    auto invalid=page; invalid.limit=0;
    errorIs(d->resolveSource(span->file,span->start.line,span->start.column,invalid,stop.get_token()),
            ErrorCode::BadRequest);
    errorIs(d->resolveSource(span->file,span->start.line,span->start.column,page,stop.get_token()),
            ErrorCode::Cancelled);
    errorIs(d->readSource(span->file,stop.get_token()),ErrorCode::Cancelled);
    errorIs(d->checkInputs(stop.get_token()),ErrorCode::Cancelled);
    CHECK(keys(resolve(*d,*span,span->start,page)->result.items) == expected);
    errorIs(d->search(model::SearchQuery{},page),ErrorCode::BadRequest);
    errorIs(d->instancesOf(def,page),ErrorCode::BadRequest);
    auto read=d->readSource(span->file); REQUIRE(read.ok()); CHECK(read->matchesSnapshot);
}
