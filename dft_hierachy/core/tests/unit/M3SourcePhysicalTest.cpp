// B independent physical identity regression: DESIGN 5.5.6, not C probe code.
#include <catch2/catch_test_macros.hpp>
#include "hier/Design.h"
#include <filesystem>
#include <fstream>
#include <iterator>
#include <unistd.h>
using namespace hier;
namespace {
std::string data(const std::filesystem::path& p) {
    std::ifstream in(p,std::ios::binary); REQUIRE(in.is_open());
    return {std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>()};
}
void put(const std::filesystem::path& p,const std::string& s) {
    std::ofstream out(p,std::ios::binary|std::ios::trunc);
    REQUIRE(out.is_open()); out << s; REQUIRE(out.good());
}
struct Files {
    std::filesystem::path folder;
    Files() {
        auto pattern=(std::filesystem::temp_directory_path()/"hier-b-r3-physical-XXXXXX").string();
        std::vector<char> buffer(pattern.begin(),pattern.end()); buffer.push_back('\0');
        auto* made=mkdtemp(buffer.data()); REQUIRE(made != nullptr); folder=made;
        for (const auto* name : {"source_increment.sv","source_increment.svh"})
            std::filesystem::copy_file(std::filesystem::path(HIER_FIXTURES)/"m3"/name,folder/name);
    }
    ~Files() {std::error_code ec;std::filesystem::remove_all(folder,ec);}
    std::unique_ptr<Design> open() {
        model::OpenOptions options;
        options.files={(folder/"source_increment.sv").string()};
        options.tops={"r3_top"}; options.defines={"B_R3_CMD=1"};
        auto r=Design::open(options); REQUIRE(r.ok());
        auto d=std::move(r.value()); REQUIRE(d->diagnostics().errorCount==0);
        return d;
    }
};
model::SourceSpan leaf(Design& d) {
    auto defs=d.definitions(); REQUIRE(defs.ok());
    for(const auto& x:defs->items) if(x.name=="r3_leaf") {
        auto span=d.source(x.ref,model::SourceKind::Definition);
        REQUIRE(span.ok()); return *span;
    }
    FAIL("missing independent leaf"); return {};
}
}

TEST_CASE("B C58: hard and soft aliases of one physical include are checked once",
          "[b-m3-source-physical]") {
    for(bool hard:{false,true}) DYNAMIC_SECTION("hard="<<hard) {
        Files files;
        const auto original=files.folder/"source_increment.svh";
        const auto alias=files.folder/"zz_alias.svh";
        if(hard) std::filesystem::create_hard_link(original,alias);
        else std::filesystem::create_symlink(original,alias);
        REQUIRE(std::filesystem::equivalent(original,alias));
        const auto main=files.folder/"source_increment.sv";
        put(main,data(main)+"\n`include \"zz_alias.svh\"\n");
        auto d=files.open();
        const auto span=leaf(*d);
        auto initial=d->checkInputs();
        REQUIRE(initial.ok()); CHECK(initial->complete); CHECK(initial->changed.empty());
        const auto previous=data(original);
        const auto edited=previous+"// same physical inode changed\n";
        put(original,edited);
        CHECK(data(alias)==edited);
        auto changed=d->checkInputs(); REQUIRE(changed.ok()); CHECK(changed->complete);
        // No guessing f:N and no choice of one hard-link display path as an oracle.
        CHECK(changed->changed==std::vector<std::string>{span.file});
        auto read=d->readSource(span.file); REQUIRE(read.ok());
        CHECK(read->text==edited); CHECK_FALSE(read->matchesSnapshot);
        CHECK(span.contentHash=="25906914ac58feace91dac4bdba2ab91b9c0617c874326ad062397b35a8a96c4");
        CHECK(read->contentHash!=span.contentHash);
        put(original,previous);
        auto restored=d->checkInputs(); REQUIRE(restored.ok());
        CHECK(restored->complete); CHECK(restored->changed.empty());
    }
}

TEST_CASE("B C58: equal bytes in independent physical includes are not hash-deduplicated",
          "[b-m3-source-physical]") {
    Files files;
    const auto original=files.folder/"source_increment.svh";
    const auto independent=files.folder/"zz_copy.svh";
    std::filesystem::copy_file(original,independent);
    REQUIRE_FALSE(std::filesystem::equivalent(original,independent));
    REQUIRE(data(original)==data(independent));
    const auto main=files.folder/"source_increment.sv";
    put(main,data(main)+"\n`include \"zz_copy.svh\"\n");
    auto d=files.open();
    const auto span=leaf(*d);
    CHECK(span.path==std::filesystem::canonical(original).string());
    auto initial=d->checkInputs(); REQUIRE(initial.ok());
    CHECK(initial->complete); CHECK(initial->changed.empty());
    const auto edited=data(original)+"// equal changed bytes, distinct physical files\n";
    put(original,edited); put(independent,edited);
    auto changed=d->checkInputs(); REQUIRE(changed.ok()); CHECK(changed->complete);
    REQUIRE(changed->changed.size()==2);
    CHECK(changed->changed[0]==span.file); // original path sorts before zz_copy
    CHECK(changed->changed[0]!=changed->changed[1]);
    std::vector<std::string> hashes;
    for(const auto& ref:changed->changed) {
        const auto read=d->readSource(ref); REQUIRE(read.ok());
        CHECK(read->text==edited); CHECK_FALSE(read->matchesSnapshot);
        hashes.push_back(read->contentHash);
    }
    CHECK(hashes[0]==hashes[1]); // equal hash is not equal physical identity
}
