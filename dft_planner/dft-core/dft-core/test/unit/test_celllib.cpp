#undef NDEBUG  // asserts must fire even in Release builds
#include "celllib.h"

#include <cassert>
#include <cstdio>
#include <fstream>
#include <sstream>

using namespace pad;

static std::string slurp(const char* p) {
    std::ifstream in(p);
    assert(in.good());
    std::stringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

static bool throws(const char* text) {
    try {
        parseCellLib(text);
    } catch (const std::exception&) {
        return true;
    }
    return false;
}

int main(int argc, char** argv) {
    assert(argc == 2);  // argv[1] = mini.tcelllib
    CellLib lib = parseCellLib(slurp(argv[1]));

    // 全部 model 都被解析(不止 pad)
    assert(lib.cells.size() == 6);
    const CellDef* a2 = lib.find("and2");
    assert(a2 && a2->cellType == "and");

    // pin: header 顺序 + dir + attrs
    const CellDef* ipad = lib.find("IPAD");
    assert(ipad && ipad->cellType == "pad");
    assert(ipad->pins.size() == 2);
    assert(ipad->pins[0].name == "PAD" && ipad->pins[0].dir == "in");
    assert(ipad->pins[1].name == "C" && ipad->pins[1].dir == "out");
    bool hasFromIo = false;
    for (const auto& a : ipad->pins[0].attrs)
        if (a == "pad_from_io") hasFromIo = true;
    assert(hasFromIo);

    // 大小写敏感
    assert(!lib.find("ipad"));

    // pad 字典
    auto dict = buildPadDict(lib);
    assert(dict.size() == 4);
    assert(dict.count("IPAD") && dict.count("OPAD") && dict.count("iopad") &&
           dict.count("iopad_pd"));
    assert(!dict.count("and2") && !dict.count("buf1"));

    assert(dict["IPAD"].dir == "in" && dict["IPAD"].padPin == "PAD");
    assert(dict["IPAD"].coreOutPin == "C" && dict["IPAD"].enablePin.empty());

    assert(dict["OPAD"].dir == "out" && dict["OPAD"].padPin == "PAD");
    assert(dict["OPAD"].coreInPin == "I");
    assert(dict["OPAD"].enablePin == "OEN" && dict["OPAD"].enablePolarity == "high");

    assert(dict["iopad"].dir == "inout" && dict["iopad"].padPin == "PAD");
    assert(dict["iopad"].coreInPin == "I" && dict["iopad"].coreOutPin == "C");
    assert(dict["iopad"].pull.empty());

    assert(dict["iopad_pd"].pull == "pull0");

    // malformed inputs must throw (not hang / silently succeed)
    assert(throws("model"));                          // EOF after keyword
    assert(throws("model m (A, B"));                  // EOF in port list
    assert(throws("model m (A) ( cell_type = x; "));  // EOF in body
    assert(throws("model m (A) ( mode( pin (A) "));   // EOF in mode block

    std::printf("test_celllib OK\n");
    return 0;
}
