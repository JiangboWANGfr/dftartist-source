#undef NDEBUG  // asserts must fire even in Release builds
#include "gen_icl.h"
#include "gen_tcl.h"
#include "gen_v.h"
#include "spec.h"

#include <cassert>
#include <cstdio>
#include <string>

using namespace ctrlgen;

// 逐字节比对,失败时打印首个不一致处
static void eq(const std::string& got, const std::string& want, const char* what) {
    if (got == want) return;
    size_t n = std::min(got.size(), want.size()), i = 0;
    while (i < n && got[i] == want[i]) ++i;
    std::fprintf(stderr, "%s mismatch at byte %zu\n--- got ---\n%s\n--- want ---\n%s\n",
                 what, i, got.c_str(), want.c_str());
    assert(false);
}

int main() {
    auto s = parseSpec(R"({
      "schemaVersion": 2, "moduleBase": "demo", "dsIndex": 2,
      "pins": [
        {"portName":"en","mode":"control","width":1,"stitch":"mux",
         "target":"U_A/en","muxName":"u_dfx_U_A_en_persistent_mux_inst_ds1"},
        {"portName":"cfg","mode":"control","width":2,"target":"U_A/cfg",
         "stitch":["replace","connect"]},
        {"portName":"ok","mode":"observe","width":1,"target":"U_A/ok"}
      ]})");

    eq(generateVerilog(s), std::string() +
        "module demo_ds2 (\n"
        "  input wire  en_tdr,\n"
        "  input wire [1:0] cfg_tdr,\n"
        "  input wire dfx_mode,\n"
        "  input wire  ok,\n"
        "  output wire  en,\n"
        "  output wire [1:0] cfg,\n"
        "  output wire  ok_tdr\n"
        ");\n\n"
        "cell_and2 en_persistent_and2_inst (.Z(en), .A1(en_tdr), .A2(dfx_mode));\n"
        "generate\n"
        "genvar i_cfg;\n"
        "for(i_cfg=0; i_cfg<2; i_cfg=i_cfg+1) begin: cfg_gen\n"
        "    cell_and2 cfg_persistent_and2_inst (.Z(cfg[i_cfg]), .A1(cfg_tdr[i_cfg]), .A2(dfx_mode));\n"
        "end\n"
        "endgenerate\n\n"
        "cell_and2 ok_persistent_and2_inst (.Z(ok_tdr), .A1(ok), .A2(dfx_mode));\n"
        "endmodule\n\n", "verilog");

    eq(generateIcl(s), std::string() +
        "Module demo_ds2 {\n"
        "  DataInPort  en_tdr {DefaultLoadValue 1'b0;}\n"
        "  DataInPort  cfg_tdr[1:0] {DefaultLoadValue 0;}\n"
        "  DataOutPort  ok_tdr {}\n"
        "}\n\n", "icl");

    eq(generateStitchTcl(s), std::string() +
        "create_instance  u_demo_ds2 -of_module demo_ds2\n"
        "create_connection  u_dfx_static_hyper_ctl_tdr/dfx_mode u_demo_ds2/dfx_mode\n"
        "\n\n"
        "delete_connection U_A/cfg[0]\n"
        "\n\n\n"
        "add_input_pin_dft_mux_override \"U_A/en\" \"u_demo_ds2/en\" \"u_dfx_static_hyper_ctl_tdr/dfx_mode\" \"u_dfx_U_A_en_persistent_mux_inst_ds1\"\n"
        "create_connection \"U_A/ok\" \"u_demo_ds2/ok\"\n"
        "create_connection u_demo_ds2/cfg[0] U_A/cfg[0]\n"
        "create_connection u_demo_ds2/cfg[1] U_A/cfg[1]\n"
        "\n\n", "tcl");

    std::printf("test_ctrlgen_gen OK\n");
    return 0;
}
