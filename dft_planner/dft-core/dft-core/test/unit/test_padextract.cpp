#undef NDEBUG  // asserts must fire even in Release builds
#include "celllib.h"
#include "extract.h"

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

int main(int argc, char** argv) {
    assert(argc == 3);  // argv[1] = mini_chip.f, argv[2] = mini.tcelllib
    CellLib lib = parseCellLib(slurp(argv[2]));
    ExtractResult r = extractPads(argv[1], lib);

    assert(r.pads.size() == 7);

    // DFS 先序 + cell/dir
    assert(r.pads[0].path == "mini_chip.u_clk_pad" && r.pads[0].cell == "IPAD" &&
           r.pads[0].dir == "in");
    assert(r.pads[1].path == "mini_chip.u_dout_pad" && r.pads[1].cell == "OPAD" &&
           r.pads[1].dir == "out");
    assert(r.pads[2].path == "mini_chip.u_gpio0" && r.pads[2].cell == "iopad" &&
           r.pads[2].dir == "inout");
    assert(r.pads[3].path == "mini_chip.u_macro.u_p0");
    assert(r.pads[4].path == "mini_chip.u_macro.u_p1");

    // pin -> net(黑盒具名连接)
    assert(r.pads[0].padNet == "CLK_IN" && r.pads[0].coreOutNet == "clk_core");
    assert(r.pads[0].autoEnableNet.empty());
    assert(r.pads[1].padNet == "DATA_OUT" && r.pads[1].coreInNet == "dout");
    assert(r.pads[1].autoEnableNet.empty());  // .OEN(1'b1) 是常量 tie, 不是网
    assert(r.pads[2].padNet == "GPIO_0" && r.pads[2].coreInNet == "g0_out" &&
           r.pads[2].coreOutNet == "g0_in");
    assert(r.pads[2].autoEnableNet == "g0_oe");
    assert(r.pads[2].enable == "g0_oe");  // enable 默认继承 autoEnableNet (spec §12)
    assert(r.pads[3].padNet == "P0" && r.pads[3].autoEnableNet == "oe[0]");  // 常量位选
    assert(r.pads[3].coreInNet == "dout[0]" && r.pads[3].coreOutNet == "din[0]");
    assert(r.pads[4].padNet == "P1" && r.pads[4].autoEnableNet == "oe[1]");

    // gpio 上溯: 顶层直连 + 跨 pad_macro 一层 (spec §6.5)
    assert(r.pads[0].gpio == "CLK_IN");
    assert(r.pads[1].gpio == "DATA_OUT");
    assert(r.pads[2].gpio == "GPIO_0");
    assert(r.pads[3].gpio == "GPIO_1");  // u_p0.PAD -> P0(port of pad_macro) -> GPIO_1
    assert(r.pads[4].gpio == "GPIO_2");
    assert(r.pads[5].path == "mini_chip.u_internal_pad");
    assert(r.pads[5].gpio.empty());  // 内部网, 上溯失败 -> gpio 空 + warning
    assert(r.pads[6].path == "mini_chip.u_sel.u_ps");
    assert(r.pads[6].padNet == "P");
    assert(r.pads[6].gpio.empty());  // 父层位选 .P(GBUS[2]): 不能静默解析成整条 GBUS
    bool selWarn = false;
    for (const auto& w : r.warnings)
        if (w.find("u_sel.u_ps") != std::string::npos &&
            w.find("bit-select/composite") != std::string::npos)
            selWarn = true;
    assert(selWarn);

    // 大小写不一致的 IOPAD: 不是行, 有 warning
    bool caseWarn = false;
    for (const auto& w : r.warnings)
        if (w.find("IOPAD") != std::string::npos && w.find("case mismatch") != std::string::npos)
            caseWarn = true;
    assert(caseWarn);
    bool bndWarn = false;
    for (const auto& w : r.warnings)
        if (w.find("u_internal_pad") != std::string::npos &&
            w.find("not a boundary port") != std::string::npos)
            bndWarn = true;
    assert(bndWarn);
    assert(r.warnings.size() == 3);

    std::printf("test_padextract OK\n");
    return 0;
}
