// A compatibility reference retaining original whole-input SHA/metadata encoding;
// known SHA vectors below are independent KATs, not generated from this reference.
#include "SourceHash.h"
#include "SourceFileHash.h"
#include "hier/db/DesignDb.h"
#include <catch2/catch_test_macros.hpp>
#include <bit>
#include <array>
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <chrono>

namespace original {
using namespace hier;
Result<std::string> sourceHash(std::string_view bytes, Cancel cancel) {
    // SHA-256 (FIPS 180-4). Process complete blocks directly; only the final
    // padded block(s) are copied, so hashing does not duplicate the input file.
    constexpr std::array<uint32_t, 64> k = {
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2};
    std::array<uint32_t, 8> h = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
    auto block = [&](const unsigned char *data) {
        std::array<uint32_t, 64> w{};
        for (size_t i = 0; i < 16; ++i)
            for (size_t j = 0; j < 4; ++j)
                w[i] = (w[i] << 8) | data[4 * i + j];
        for (size_t i = 16; i < 64; ++i) {
            auto a = w[i - 15], b = w[i - 2];
            w[i] = w[i - 16] + (std::rotr(a, 7) ^ std::rotr(a, 18) ^ (a >> 3)) + w[i - 7] +
                   (std::rotr(b, 17) ^ std::rotr(b, 19) ^ (b >> 10));
        }
        auto [a, b, c, d, e, f, g, j] = h;
        for (size_t i = 0; i < 64; ++i) {
            auto t1 = j + (std::rotr(e, 6) ^ std::rotr(e, 11) ^ std::rotr(e, 25)) +
                      ((e & f) ^ (~e & g)) + k[i] + w[i];
            auto t2 = (std::rotr(a, 2) ^ std::rotr(a, 13) ^ std::rotr(a, 22)) +
                      ((a & b) ^ (a & c) ^ (b & c));
            j = g;
            g = f;
            f = e;
            e = d + t1;
            d = c;
            c = b;
            b = a;
            a = t1 + t2;
        }
        const std::array<uint32_t, 8> next = {a, b, c, d, e, f, g, j};
        for (size_t i = 0; i < 8; ++i)
            h[i] += next[i];
    };
    const auto *data = reinterpret_cast<const unsigned char *>(bytes.data());
    size_t offset = 0;
    while (bytes.size() - offset >= 64) {
        if (cancel.stop_requested())
            return Error{ErrorCode::Cancelled, "source hashing cancelled"};
        block(data + offset);
        offset += 64;
    }
    std::array<unsigned char, 128> tail{};
    const size_t remaining = bytes.size() - offset;
    for (size_t i = 0; i < remaining; ++i)
        tail[i] = data[offset + i];
    tail[remaining] = 0x80;
    const size_t count = remaining < 56 ? 64 : 128;
    const uint64_t bits = uint64_t(bytes.size()) * 8;
    for (size_t i = 0; i < 8; ++i)
        tail[count - 1 - i] = static_cast<unsigned char>(bits >> (8 * i));
    block(tail.data());
    if (count == 128)
        block(tail.data() + 64);
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "source hashing cancelled"};
    std::string result;
    for (auto word : h)
        for (int shift = 28; shift >= 0; shift -= 4)
            result += "0123456789abcdef"[(word >> shift) & 15];
    return result;
}
class InputEncoding {
  public:
    std::string bytes;
    void field(std::string_view text) {
        bytes += std::to_string(text.size());
        bytes += ':';
        bytes += text;
    }
    void count(size_t value) { field(std::to_string(value)); }
    void list(const std::vector<std::string> &items) {
        count(items.size());
        for (const auto &item : items)
            field(item);
    }
    void attrs(const std::map<std::string, std::string> &items) {
        count(items.size());
        for (const auto &[key, value] : items) {
            field(key);
            field(value);
        }
    }
};

std::string metadata(const frontend::Frontend &fe) {
    const auto inputs = fe.compilationInputs();
    InputEncoding encoded;
    encoded.field("hier-input-v1");
    encoded.field(inputs.frontendIdentity);
    encoded.list(inputs.arguments);
    encoded.list(inputs.sourceOrder);
    encoded.list(inputs.defines);
    encoded.list(inputs.undefines);
    encoded.list(inputs.explicitTops);
    // Hash the bytes Slang actually read, never re-open input paths here.
    std::map<std::string, std::string> files;
    for (const auto &file : fe.sourceFiles())
        files.emplace(file.path, sourceHash(file.text, {}).value());
    encoded.count(files.size());
    for (const auto &[path, hash] : files) {
        encoded.field(path);
        encoded.field(hash);
    }
    encoded.count(inputs.libraryCells.size());
    for (const auto &[name, cell] : inputs.libraryCells) {
        encoded.field(name);
        encoded.field(cell ? "present" : "absent");
        if (!cell)
            continue;
        encoded.attrs(cell->attrs);
        encoded.count(cell->pins.size());
        for (const auto &pin : cell->pins) {
            encoded.field(pin.name);
            encoded.field(std::to_string(static_cast<int>(pin.dir)));
            encoded.field(pin.width ? std::to_string(*pin.width) : "unknown");
            encoded.attrs(pin.attrs);
        }
    }
    return sourceHash(encoded.bytes, {}).value();
}
}

using namespace hier;
namespace {
std::string bytes(size_t n) { std::string s(n,'\0'); for(size_t i=0;i<n;++i)s[i]=char((i*73+19)%256);return s; }
struct InputFrontend final : frontend::Frontend {
    model::FrontendInfo identity;
    std::vector<model::TopInfo> roots;
    std::vector<model::DefInfo> defs;
    model::CompilationInputs inputs;
    std::vector<std::pair<std::string,std::string>> files;
    explicit InputFrontend(size_t variant) {
        inputs.frontendIdentity="frontend-identity";inputs.arguments={"ab","c",std::string("nul\0arg",7)};
        inputs.sourceOrder={"/z.sv","/a.sv","/z.sv"};inputs.defines={"Z=1","A=2"};inputs.undefines={"OLD"};
        inputs.explicitTops={"first","second"};inputs.complete=variant%2;
        model::CellInfo cell;cell.attrs={{"a",std::string("v\0x",3)},{"z","\xc3\xa9"}};
        cell.pins={{"A",model::Direction::In,0,{}},{"Y",model::Direction::Out,32,{{"role","output"}}},{"U",model::Direction::Unknown,std::nullopt,{}}};
        inputs.libraryCells={{"empty",std::nullopt},{"present",cell},{"zero",model::CellInfo{}}};
        files={{"/z.sv",bytes(variant*17)},{"/a.sv",bytes(55)},{"/z.sv","ignored duplicate"},{"/empty.sv",""}};
        if(variant&2)std::swap(inputs.arguments[0],inputs.arguments[1]);
        if(variant&4)inputs.arguments={"a","bc"};
        if(variant&8)std::swap(files[0],files[2]);
        if(variant&16)inputs.explicitTops.clear();
        if(variant&32)std::reverse(inputs.defines.begin(),inputs.defines.end());
    }
    const model::FrontendInfo &info() const override {return identity;}
    const std::vector<model::TopInfo> &tops() const override {return roots;}
    const std::vector<model::DefInfo> &definitions() const override {return defs;}
    size_t bodyCount() const override {return 0;}
    model::BodySkeleton skeleton(model::BodyId) const override {return {};}
    model::BodyConnections connections(model::BodyId) const override {return {};}
    model::Diagnostics diagnostics(size_t) const override {return {};}
    model::CompilationInputs compilationInputs() const override {return inputs;}
    std::vector<model::SourceFileInput> sourceFiles() const override {
        std::vector<model::SourceFileInput> out;for(const auto &[p,s]:files)out.push_back({p,s});return out;
    }
};
struct File {
    std::filesystem::path path=std::filesystem::temp_directory_path()/
        ("hier-a-source-hash-"+std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    ~File(){std::error_code ec;std::filesystem::remove_all(path,ec);}
    void write(const std::string &s){std::ofstream f(path,std::ios::binary);f.write(s.data(),std::streamsize(s.size()));REQUIRE(bool(f));}
};
}
TEST_CASE("A incremental source SHA retains known vectors, fragments and owning finish", "[a-source-hashing]") {
    for(const auto &[input,expected]:std::vector<std::pair<std::string,std::string>>{
        {"","e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},
        {"abc","ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"},
        {std::string(1000000,'a'),"cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"}}) {
        auto value=db::sourceHash(input,{});REQUIRE(value);CHECK(*value==expected);
    }
    for(size_t n=0;n<=513;++n){const auto input=bytes(n);const auto expected=original::sourceHash(input,{});REQUIRE(expected);
        CHECK(db::sourceHash(input,{}).value()==*expected);
        for(size_t width:std::array<size_t,12>{1,2,3,7,55,56,63,64,65,127,128,129}){
            db::detail::SourceHash state;REQUIRE(state.update(""));
            for(size_t at=0;at<input.size();at+=width)REQUIRE(state.update(std::string_view(input).substr(at,std::min(width,input.size()-at))));
            auto retained=state.finish();REQUIRE(retained);CHECK(*retained==*expected);CHECK(state.finish().value()==*retained);
            std::stop_source stop;stop.request_stop();auto cancelled=state.finish(stop.get_token());REQUIRE_FALSE(cancelled);CHECK(cancelled.error().code==ErrorCode::Cancelled);
            CHECK(state.finish().value()==*retained);REQUIRE(state.update("more"));CHECK(state.finish().value()==original::sourceHash(input+"more",{}).value());CHECK(*retained==*expected);
        }
        std::stop_source stop;stop.request_stop();auto cancelled=db::sourceHash(input,stop.get_token());REQUIRE_FALSE(cancelled);CHECK(cancelled.error().code==ErrorCode::Cancelled);CHECK(cancelled.error().message=="source hashing cancelled");
    }
}
TEST_CASE("A source file digest retains original byte/error/cancel boundary", "[a-source-hashing]") {
    File temp;db::SourceFile file;file.path=temp.path.string();
    auto missing=db::hashSourceFile(file,{});REQUIRE_FALSE(missing);CHECK(missing.error().code==ErrorCode::NotFound);CHECK(missing.error().message=="cannot read source file: "+file.path);
    for(size_t n:std::array<size_t,13>{0,1,55,56,63,64,65,65535,65536,65537,131071,131072,131073}) {
        auto input=bytes(n);temp.write(input);auto got=db::hashSourceFile(file,{});REQUIRE(got);CHECK(*got==original::sourceHash(input,{}).value());CHECK(db::readSourceBytes(file,{}).value()==input);
        std::stop_source stop;stop.request_stop();auto cancelled=db::hashSourceFile(file,stop.get_token());REQUIRE_FALSE(cancelled);CHECK(cancelled.error().code==ErrorCode::Cancelled);CHECK(cancelled.error().message=="source read cancelled");CHECK(db::hashSourceFile(file,{}).value()==*got);
    }
    std::filesystem::remove(temp.path);std::filesystem::create_directory(temp.path);auto bad=db::hashSourceFile(file,{});auto old=db::readSourceBytes(file,{});REQUIRE(bool(bad)==bool(old));if(old)CHECK(*bad==original::sourceHash(*old,{}).value());else {CHECK(bad.error().code==old.error().code);CHECK(bad.error().message==old.error().message);}
}
TEST_CASE("A streamed snapshot description retains every original encoded field", "[a-source-hashing]") {
    for(size_t variant=0;variant<64;++variant)for(size_t cache:std::array<size_t,3>{0,1,67108864}) {
        auto fe=std::make_unique<InputFrontend>(variant);auto expected=original::metadata(*fe);auto complete=fe->inputs.complete;auto inferred=fe->inputs.explicitTops.empty();db::DesignDb db(std::move(fe),cache);
        CHECK(db.inputHash()==expected);CHECK(db.inputHashComplete()==complete);CHECK(db.inferredTops()==inferred);auto snapshot=db.sourceSnapshot();REQUIRE(snapshot);
        for(const auto &file:(*snapshot)->files)CHECK(file.hash.size()==64);
    }
}
