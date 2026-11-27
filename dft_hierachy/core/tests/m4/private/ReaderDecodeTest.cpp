// B independent expected bytes/values, DESIGN5.6.2/5.6.8/5.6.9.
#include "PrivateTestSupport.h"
using namespace b_m4_private;
namespace {
std::vector<std::string> feedPart(FrameReader& reader, std::string_view input) {
    std::vector<std::string> frames;
    while (!input.empty()) {
        const auto step = reader.feed(bytes(input));
        REQUIRE(step.consumed <= input.size());
        REQUIRE(step.status != ReadStatus::fault);
        if (step.status == ReadStatus::frame) {
            REQUIRE(step.consumed > 0);
            REQUIRE(input[step.consumed - 1] == '\n');
            frames.push_back(step.frame);
        } else {
            CHECK(step.status == ReadStatus::need_more);
            REQUIRE(step.consumed == input.size()); CHECK(step.frame.empty());
        }
        input.remove_prefix(step.consumed);
    }
    return frames;
}
void fault(DecodeResult value, DecodeFaultCode code, size_t offset) {
    REQUIRE(std::holds_alternative<DecodeFault>(value));
    CHECK(std::get<DecodeFault>(value).code == code);
    CHECK(std::get<DecodeFault>(value).byteOffset == offset);
}
std::pair<std::string,size_t> nested(size_t count, bool mixed) {
    std::string out = "{\"extra\":", closes;
    size_t last = 0;
    for (size_t i=0;i<count;++i) {
        last = out.size();
        if (mixed && i % 2 == 0) { out += '['; closes += ']'; }
        else { out += "{\"x\":"; closes += '}'; }
    }
    out += '0';
    for (auto it=closes.rbegin();it!=closes.rend();++it) out += *it;
    out += '}'; return {out,last};
}
}
TEST_CASE("B private R01: every short byte split and UTF8 CRLF preserves two raw frames", "[b-m4-reader]") {
    const std::string a="{\"v\":\"位𝒟é\"}", b="{\"v\":[]}";
    const std::string all=a+"\n"+b+"\r\n";
    for (size_t split=0;split<=all.size();++split) {
        FrameReader reader;
        auto got=feedPart(reader,std::string_view(all).substr(0,split));
        auto tail=feedPart(reader,std::string_view(all).substr(split));
        got.insert(got.end(),tail.begin(),tail.end());
        CHECK(got == std::vector<std::string>{a,b}); CHECK(reader.finish()==EndStatus::clean);
    }
    FrameReader reader; std::vector<std::string> got;
    for (const char& item:all) {
        const auto part=feedPart(reader,{&item,1}); got.insert(got.end(),part.begin(),part.end());
    }
    CHECK(got==std::vector<std::string>{a,b}); CHECK(reader.finish()==EndStatus::clean);
}
TEST_CASE("B private R02: feed consumes one frame and leaves suffix owned by caller", "[b-m4-reader]") {
    FrameReader reader; const std::string all="{}\n{}\r\n{}\nx";
    auto rest=std::string_view(all);
    for (size_t length:{size_t{3},size_t{4},size_t{3}}) {
        const auto step=reader.feed(bytes(rest));
        CHECK(step.status==ReadStatus::frame); CHECK(step.consumed==length); CHECK(step.frame=="{}");
        rest.remove_prefix(step.consumed);
    }
    REQUIRE(rest=="x"); const auto tail=reader.feed(bytes(rest));
    CHECK(tail.status==ReadStatus::need_more); CHECK(tail.consumed==1); CHECK(tail.frame.empty());
    CHECK(reader.finish()==EndStatus::fault);
}
TEST_CASE("B private R03: empty span is not EOF and returned frame owns its bytes", "[b-m4-reader]") {
    FrameReader reader; std::string first="{\"x\":\"位";
    CHECK(reader.feed(bytes(first)).status==ReadStatus::need_more);
    const auto empty=reader.feed({});
    CHECK(empty.consumed==0); CHECK(empty.status==ReadStatus::need_more); CHECK(empty.frame.empty());
    const auto last=reader.feed(bytes("\"}\n"));
    CHECK(last.status==ReadStatus::frame); CHECK(last.frame=="{\"x\":\"位\"}");
    first.assign(first.size(),'X'); CHECK(last.frame=="{\"x\":\"位\"}");
    CHECK(reader.finish()==EndStatus::clean);
}
TEST_CASE("B private R04 R05 R06: exact byte cap and pending CR do not admit an extra content byte", "[b-m4-reader]") {
    const size_t cap=1048576; const std::string full="{\"x\":\""+std::string(cap-8,'a')+"\"}";
    REQUIRE(full.size()==cap);
    for (bool crlf:{false,true}) {
        FrameReader reader;
        auto part=reader.feed(bytes(full)); CHECK(part.status==ReadStatus::need_more);
        CHECK(part.consumed==full.size());
        if (crlf) {
            part=reader.feed(bytes("\r")); CHECK(part.status==ReadStatus::need_more); CHECK(part.consumed==1);
        }
        part=reader.feed(bytes("\n")); CHECK(part.status==ReadStatus::frame);
        CHECK(part.consumed==1); CHECK(part.frame==full); CHECK(reader.finish()==EndStatus::clean);
    }
    {
        FrameReader reader;
        const std::string tooBig="{\"x\":\""+std::string(cap-7,'a')+"\"}\n";
        CHECK(reader.feed(bytes(tooBig)).status==ReadStatus::fault);
        const auto again=reader.feed(bytes("{}\n"));
        CHECK(again.status==ReadStatus::fault); CHECK(again.consumed==0); CHECK(again.frame.empty());
        CHECK(reader.finish()==EndStatus::fault);
    }
    {
        FrameReader reader; CHECK(reader.feed(bytes(full+"\r")).status==ReadStatus::need_more);
        CHECK(reader.feed(bytes("x")).status==ReadStatus::fault);
    }
    // A code-point counter would accept this +1 byte case: only byte length is authoritative.
    const std::string unicode="{\"x\":\""+std::string(cap-11,'a')+"位\"}";
    REQUIRE(unicode.size()==cap);
    FrameReader utf; const auto good=utf.feed(bytes(unicode+"\n"));
    CHECK(good.status==ReadStatus::frame); CHECK(good.frame==unicode); CHECK(good.consumed==cap+1);
    std::string oversized=unicode; oversized.insert(oversized.size()-2,"a");
    REQUIRE(oversized.size()==cap+1);
    FrameReader utfBad; CHECK(utfBad.feed(bytes(oversized+"\n")).status==ReadStatus::fault);
}
TEST_CASE("B private R07 R08 R09 R11: stable EOF clean fault and post-finish feed", "[b-m4-reader]") {
    {
        FrameReader reader; CHECK(reader.finish()==EndStatus::clean); CHECK(reader.finish()==EndStatus::clean);
        const auto step=reader.feed(bytes("{}\n"));
        CHECK(step.status==ReadStatus::need_more); CHECK(step.consumed==0); CHECK(step.frame.empty());
        CHECK(reader.finish()==EndStatus::clean);
    }
    for (const auto& partial:std::vector<std::string>{"\r"," ","{",std::string(1,static_cast<char>(0xe4))}) {
        FrameReader reader; CHECK(reader.feed(bytes(partial)).status==ReadStatus::need_more);
        CHECK(reader.finish()==EndStatus::fault); CHECK(reader.finish()==EndStatus::fault);
        const auto step=reader.feed(bytes("{}\n"));
        CHECK(step.status==ReadStatus::fault); CHECK(step.consumed==0); CHECK(step.frame.empty());
    }
    for (const std::string emptyLine:{"\n","\r\n"}) {
        FrameReader reader; CHECK(reader.feed(bytes(emptyLine)).status==ReadStatus::fault);
        CHECK(reader.finish()==EndStatus::fault);
    }
    FrameReader complete; REQUIRE(feedPart(complete,"{}\n")==std::vector<std::string>{"{}"});
    CHECK(complete.finish()==EndStatus::clean);
}
TEST_CASE("B private R10: strip only the CR immediately before LF", "[b-m4-reader]") {
    FrameReader reader; const auto step=reader.feed(bytes("{}\r\r\n"));
    CHECK(step.status==ReadStatus::frame); CHECK(step.frame=="{}\r"); CHECK(step.consumed==5);
    CHECK(std::holds_alternative<JsonValue::Object>(decodeFrame(step.frame)));
}
TEST_CASE("B private D01 D02 D03: root depth one unknown fields and mixed arrays count to128", "[b-m4-decode]") {
    for (bool mixed:{false,true}) {
        const auto good=nested(127,mixed),bad=nested(128,mixed);
        CHECK(std::holds_alternative<JsonValue::Object>(decodeFrame(good.first)));
        fault(decodeFrame(bad.first),DecodeFaultCode::depth_limit,bad.second);
    }
}
TEST_CASE("B private D04: string braces escapes unicode and number tokens are owned not double", "[b-m4-decode]") {
    std::string input=R"({"text":"{[\"\\位𝒟é]}","big":9007199254740993,"decimal":1.00e+02,"negative":-0,"a":[true,null,{}]})";
    auto parsed=decodeFrame(input); REQUIRE(std::holds_alternative<JsonValue::Object>(parsed));
    const auto object=std::get<JsonValue::Object>(std::move(parsed)); input.assign(input.size(),'X');
    CHECK(std::get<std::string>(object.at("text").value)=="{[\"\\位𝒟é]}");
    CHECK(std::get<JsonNumber>(object.at("big").value).token=="9007199254740993");
    CHECK(std::get<JsonNumber>(object.at("decimal").value).token=="1.00e+02");
    CHECK(std::get<JsonNumber>(object.at("negative").value).token=="-0");
    const auto& array=std::get<JsonValue::Array>(object.at("a").value);
    REQUIRE(array.size()==3); CHECK(std::get<bool>(array[0].value));
    CHECK(std::holds_alternative<std::nullptr_t>(array[1].value));
    CHECK(std::holds_alternative<JsonValue::Object>(array[2].value));
}
TEST_CASE("B private D05: escaped equivalent keys and nested keys reject at second opening quote", "[b-m4-decode]") {
    for (const std::pair<std::string,std::string> sample:{
        std::pair{R"({"id":1,"\u0069d":2})",std::string{R"("\u0069d")"}},
        std::pair{R"({"outer":{"a":0,"\u0061":1}})",std::string{R"("\u0061")"}},
        std::pair{R"({"位":0,"\u4f4d":1})",std::string{R"("\u4f4d")"}}}) {
        const auto at=sample.first.find(sample.second); REQUIRE(at!=std::string::npos);
        fault(decodeFrame(sample.first),DecodeFaultCode::duplicate_key,at);
    }
    CHECK(std::holds_alternative<JsonValue::Object>(decodeFrame(R"({"a":{},"other":{"a":0}})")));
}
TEST_CASE("B private D06: invalid UTF8 wins and JSON faults nonobjects are not normalized", "[b-m4-decode]") {
    std::string invalid="]\t"; invalid.push_back(static_cast<char>(0xff));
    fault(decodeFrame(invalid),DecodeFaultCode::invalid_utf8,2);
    fault(decodeFrame("{\"a\":]"),DecodeFaultCode::invalid_json,5);
    fault(decodeFrame("{}x"),DecodeFaultCode::invalid_json,2);
    fault(decodeFrame("[]"),DecodeFaultCode::non_object,0);
    fault(decodeFrame("true"),DecodeFaultCode::non_object,0);
    fault(decodeFrame(""),DecodeFaultCode::invalid_json,0);
    CHECK(std::holds_alternative<JsonValue::Object>(decodeFrame("\t {}\r")));
}
