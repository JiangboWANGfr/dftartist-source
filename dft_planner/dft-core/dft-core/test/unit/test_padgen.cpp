#undef NDEBUG  // asserts must fire even in Release builds
#include "gen.h"

#include <cassert>
#include <cstdio>
#include <string>
#include <vector>

using namespace pad;

// 逐字节比对,失败时打印首个不一致处 (风格同 test_ctrlgen_gen.cpp)
static void eq(const std::string& got, const std::string& want, const char* what) {
    if (got == want) return;
    size_t n = std::min(got.size(), want.size()), i = 0;
    while (i < n && got[i] == want[i]) ++i;
    std::fprintf(stderr, "%s mismatch at byte %zu\n--- got ---\n%s\n--- want ---\n%s\n",
                 what, i, got.c_str(), want.c_str());
    assert(false);
}

static PadInstance mk(const std::string& gpio, const char* dir, const char* reuse = "",
                      bool bscan = false, const char* func = "") {
    PadInstance p;
    p.gpio = gpio;
    p.dir = dir;
    p.reuse = reuse;
    p.bscanEn = bscan;
    p.func = func;
    return p;
}

int main() {
    std::vector<PadInstance> rows = {
        mk("G0", "inout", "in", true),
        mk("G1", "inout", "out"),
        mk("G2", "inout", "in", false, "ssn"),  // ssn -> excluded from A (spec §9)
        mk("G3", "in"),                         // no reuse -> excluded from A
    };

    eq(generateAuxPorts(rows, {"chip", ""}),
       "read_config_data -in_wrapper $dftspec/BoundaryScan -rep -from_string {\n"
       "   AuxiliaryInputOutputPorts {\n"
       "     internal_auxiliary_input_ports : G0;\n"
       "     internal_auxiliary_output_ports : G1;\n"
       "   }\n"
       " }\n",
       "aux chip");

    eq(generateAuxPorts(rows, {"phy", "external"}),
       "read_config_data -in_wrapper $dftspec/EmbeddedBoundaryScan -rep -from_string {\n"
       "   AuxiliaryInputOutputPorts {\n"
       "     external_auxiliary_input_ports : G0;\n"
       "     external_auxiliary_output_ports : G1;\n"
       "   }\n"
       " }\n",
       "aux phy external");

    std::vector<PadInstance> onlyIn = {mk("G0", "inout", "in")};
    eq(generateAuxPorts(onlyIn, {"chip", ""}),
       "read_config_data -in_wrapper $dftspec/BoundaryScan -rep -from_string {\n"
       "   AuxiliaryInputOutputPorts {\n"
       "     internal_auxiliary_input_ports : G0;\n"
       "   }\n"
       " }\n",
       "aux only-in");

    std::vector<PadInstance> noReuse = {mk("G0", "in"), mk("G1", "out")};
    eq(generateAuxPorts(noReuse, {"chip", ""}), "", "aux empty");

    bool threw = false;
    try { generateAuxPorts(rows, {"phy", ""}); } catch (const std::exception&) { threw = true; }
    assert(threw);  // phy 必须给 aux
    threw = false;
    try { generateAuxPorts(rows, {"board", ""}); } catch (const std::exception&) { threw = true; }
    assert(threw);  // 非法 level

    // 输出 B: 8 个/行折行 + dont_touch
    std::vector<PadInstance> ten;
    for (int i = 0; i < 10; ++i)
        ten.push_back(mk("P" + std::to_string(i), "inout", "", i < 2));
    eq(generatePortOptions(ten),
       "set_boundary_scan_port_options -pad_io_ports { \\\n"
       "   P0 P1 P2 P3 P4 P5 P6 P7 \\\n"
       "   P8 P9}\n"
       "set_boundary_scan_port_options [get_ports [list P0 P1]] -cell_options dont_touch\n",
       "portopts wrap");

    // 输出 B: 恰好 8 个 — 单行且无悬挂续行符 (边界锁定)
    std::vector<PadInstance> eight;
    for (int i = 0; i < 8; ++i)
        eight.push_back(mk("Q" + std::to_string(i), "in"));
    eq(generatePortOptions(eight),
       "set_boundary_scan_port_options -pad_io_ports { \\\n"
       "   Q0 Q1 Q2 Q3 Q4 Q5 Q6 Q7}\n",
       "portopts exactly-8");

    // 输出 B: 无 bscan_en -> 无 dont_touch 行; gpio 为空的行跳过
    std::vector<PadInstance> three = {mk("A", "in"), mk("", "in"), mk("B", "out")};
    eq(generatePortOptions(three),
       "set_boundary_scan_port_options -pad_io_ports { \\\n"
       "   A B}\n",
       "portopts no-dont-touch");
    eq(generatePortOptions({}), "", "portopts empty");

    std::printf("test_padgen OK\n");
    return 0;
}
