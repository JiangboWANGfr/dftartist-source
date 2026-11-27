#undef NDEBUG  // asserts must fire even in Release builds
#include "table.h"

#include <cassert>
#include <cstdio>
#include <string>

using namespace pad;

static PadInstance mk(const char* path, const char* dir, const char* gpio) {
    PadInstance p;
    p.path = path;
    p.dir = dir;
    p.gpio = gpio;
    p.autoEnableNet = "auto_en";
    p.enable = "auto_en";
    return p;
}

static bool fails(ExtractResult& r, const char* json, const char* needle) {
    try {
        applyOverlay(r, json);
    } catch (const std::exception& e) {
        if (std::string(e.what()).find(needle) != std::string::npos) return true;
        std::fprintf(stderr, "wrong error: got '%s', want substring '%s'\n", e.what(), needle);
        return false;
    }
    std::fprintf(stderr, "no throw, want substring '%s'\n", needle);
    return false;
}

int main() {
    ExtractResult r;
    r.pads.push_back(mk("t.a", "inout", "G0"));
    r.pads.push_back(mk("t.b", "in", "G1"));
    r.pads.push_back(mk("t.c", "inout", "G2"));

    applyOverlay(r, R"({"pads":{
      "t.a": {"reuse":"in","bscan_en":"yes","func":"ssn"},
      "t.b": {"func":"ssn","enable":"my_en"},
      "t.c": {"reuse":"out","bscan_en":"n"}
    }})");
    assert(r.pads[0].reuse == "in" && r.pads[0].bscanEn && r.pads[0].func == "ssn");
    assert(r.pads[0].enable == "auto_en");  // 未覆盖 -> 保持默认
    assert(r.pads[1].func == "ssn" && r.pads[1].enable == "my_en");
    assert(!r.pads[2].bscanEn && r.pads[2].reuse == "out");

    SsnSummary s = ssnSummary(r.pads);
    assert(s.inWidth == 2 && s.outWidth == 0);  // t.a(inout+reuse in) + t.b(dir in)

    ExtractResult r2;
    r2.pads.push_back(mk("t.a", "in", "G0"));
    r2.pads.push_back(mk("t.d", "inout", "G3"));
    assert(fails(r2, R"({"pads":{"t.x":{}}})", "unknown pad path"));
    assert(fails(r2, R"({"pads":{"t.a":{"reuse":"in"}}})", "reuse only applies to inout"));
    assert(fails(r2, R"({"pads":{"t.d":{"reuse":"both"}}})", "reuse must be in|out"));
    assert(fails(r2, R"({"pads":{"t.d":{"bscan_en":"maybe"}}})", "bscan_en must be yes|no"));
    assert(fails(r2, R"({"pads":{"t.d":{"func":"ssn"}}})", "requires reuse"));
    assert(fails(r2, R"({"nopads":1})", "missing 'pads'"));
    assert(fails(r2, R"({"pads":{"t.d":1}})", "entry must be an object"));
    assert(fails(r2, R"({"pads":{"t.d":{"bscan_en":1}}})", "must be a string"));
    assert(fails(r2, R"({"pads":{"t.d":{"nope":"x"}}})", "unknown key"));

    std::printf("test_padtable OK\n");
    return 0;
}
