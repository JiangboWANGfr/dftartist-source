// Original decoder is an A compatibility reference; scalar/byte KATs below
// also use explicit Unicode validity rules independent of either implementation.
#include "hier/db/SourceIndex.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
#include <cstdint>
#include <string_view>
namespace original {
using namespace hier;
bool sourceUtf8(std::string_view bytes, Cancel cancel) {
    size_t i = 0;
    while (i < bytes.size()) {
        if (cancel.stop_requested())
            return false;
        auto first = static_cast<unsigned char>(bytes[i++]);
        if (first < 0x80)
            continue;
        size_t count;
        uint32_t code, minimum;
        if (first >= 0xc2 && first <= 0xdf) {
            count = 1;
            code = first & 0x1fu;
            minimum = 0x80;
        } else if (first >= 0xe0 && first <= 0xef) {
            count = 2;
            code = first & 0x0fu;
            minimum = 0x800;
        } else if (first >= 0xf0 && first <= 0xf4) {
            count = 3;
            code = first & 0x07u;
            minimum = 0x10000;
        } else {
            return false;
        }
        if (bytes.size() - i < count)
            return false;
        while (count--) {
            auto next = static_cast<unsigned char>(bytes[i++]);
            if ((next & 0xc0u) != 0x80u)
                return false;
            code = (code << 6) | (next & 0x3fu);
        }
        if (code < minimum || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
            return false;
    }
    return true;
}
}
using namespace hier;
namespace {
std::string encode(uint32_t code) {
    std::string out;
    if(code<0x80)out+=char(code);
    else if(code<0x800){out+=char(0xc0|(code>>6));out+=char(0x80|(code&0x3f));}
    else if(code<0x10000){out+=char(0xe0|(code>>12));out+=char(0x80|((code>>6)&0x3f));out+=char(0x80|(code&0x3f));}
    else {out+=char(0xf0|(code>>18));out+=char(0x80|((code>>12)&0x3f));out+=char(0x80|((code>>6)&0x3f));out+=char(0x80|(code&0x3f));}
    return out;
}
}
TEST_CASE("A source UTF-8 preserves all scalar and short-byte KATs", "[a-source-utf8]") {
    for(uint32_t code=0;code<=0x110fff;++code){const auto input=encode(code);const bool valid=code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff);CHECK(db::sourceUtf8(input)==valid);CHECK(original::sourceUtf8(input,{})==valid);}
    for(unsigned a=0;a<256;++a){const std::string one(1,char(a));CHECK(db::sourceUtf8(one)==(a<128));
        for(unsigned b=0;b<256;++b){const std::string two{char(a),char(b)};const bool valid=(a<128&&b<128)||(a>=0xc2&&a<=0xdf&&b>=0x80&&b<=0xbf);CHECK(db::sourceUtf8(two)==valid);CHECK(original::sourceUtf8(two,{})==valid);}}
}
TEST_CASE("A ASCII word scans preserve nonalignment and UTF-8 boundaries", "[a-source-utf8]") {
    const std::vector<std::string> fragments={"",std::string(1,'\0'),encode(0x7f),encode(0x80),encode(0x7ff),encode(0x800),encode(0xd7ff),encode(0xe000),encode(0xffff),encode(0x10000),encode(0x10ffff),encode(0xd800),encode(0x110000),"\xc0\x80","\xe0\x80\x80","\xf0\x80\x80\x80","\xf5\x80\x80\x80","\xed\xa0\x80","\xe2\x82","\x80"};
    for(size_t align=0;align<16;++align)for(size_t n:std::array<size_t,15>{0,1,7,8,9,15,16,55,64,4095,4096,4097,65535,65536,65537})for(const auto &fragment:fragments){
        std::string all(align,'!');for(size_t i=0;i<n;++i)all+=char(i%128);all+=fragment;all+="ascii suffix";const auto input=std::string_view(all).substr(align);CHECK(db::sourceUtf8(input)==original::sourceUtf8(input,{}));
        for(size_t trim=0;trim<=fragment.size();++trim){const auto truncated=std::string_view(all).substr(align,n+trim);CHECK(db::sourceUtf8(truncated)==original::sourceUtf8(truncated,{}));}
    }
}
TEST_CASE("A source UTF-8 retains empty/pre-cancel and retry behavior", "[a-source-utf8]") {
    std::stop_source stop;stop.request_stop();
    for(size_t n:std::array<size_t,12>{0,1,7,8,9,4095,4096,4097,65535,65536,65537,1048576}){
        const std::string input(n,'a');CHECK(db::sourceUtf8(input,stop.get_token())==original::sourceUtf8(input,stop.get_token()));CHECK(db::sourceUtf8(input));
        const auto mixed=input+encode(0x1f600);CHECK_FALSE(db::sourceUtf8(mixed,stop.get_token()));CHECK(db::sourceUtf8(mixed));
        CHECK_FALSE(db::sourceUtf8(input+"\xff"));CHECK(db::sourceUtf8(input));
    }
}
