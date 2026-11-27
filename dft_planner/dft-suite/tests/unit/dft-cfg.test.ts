// dft_cfg YAML 的 library 识别 —— 样本取自真实工程(nx9000)的 dft_lib_setting.yaml /
// dft_user_ins_setting.yaml 形态:block scalar 里的 Tessent 命令、注释行、$prj_path 变量。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDfxIpFiles, parseMembistDir, prjPathOf } from "../../src/hierarchy/core/dftCfg.ts";

const LIB_YAML = `lib_manager:
   pad: |
     #read_cell_library /old/path/*.tcelllib

   standard_cell: |
       read_cell_library /lib/standard_cells/tessent/adk.tcelllib
       set_design_sources -format verilog -y /lib/standard_cells/verilog/ -extension {v}

   memory_prefix: "processor_core*"

   memverilog: |
        read_verilog /lib/memories/*.v -interface_only -exclude_from_file_dictionary

   membistlib: |
       set_design_sources -format tcd_memory -y  /lib/memories -extension {tcd_memory lvmemlib lvlib}
`;

test("membistlib: 提及 tcd_memory 的行取 -y 目录(多空格也行)", () => {
  assert.equal(parseMembistDir(LIB_YAML), "/lib/memories");
});

test("membistlib 缺失时退回 memverilog 的 read_verilog 目录", () => {
  const noBist = LIB_YAML.split("\n").filter((l) => !/tcd_memory/.test(l)).join("\n");
  assert.equal(parseMembistDir(noBist), "/lib/memories");
});

test("standard_cell 的 -format verilog -y 不会被误认成 membistlib", () => {
  const onlyStd = `standard_cell: |
       set_design_sources -format verilog -y /lib/standard_cells/verilog/ -extension {v}`;
  assert.equal(parseMembistDir(onlyStd), null);
});

const INS_YAML = `mbist_setting:
   dfx_ip: |
       read_verilog $prj_path/user_material/dfx_ip/dfx_common_cell.v
       read_verilog $prj_path/user_material/dfx_ip/dfx_static_hyper_ctl_tdr.v
       read_icl $prj_path/user_material/dfx_ip/dfx_static_hyper_ctl_tdr.icl
       #read_verilog /somewhere/commented_out.v
logic_test_setting:
   dfx_ip: |
     #read_verilog $prj_path/user_material/dfx_ip/dfx_common_cell.v
`;

test("dfx_ip: 取非注释的 read_verilog *.v 行,$prj_path 替换,去重", () => {
  assert.deepEqual(parseDfxIpFiles(INS_YAML, "/home/u/nx9000"), [
    "/home/u/nx9000/user_material/dfx_ip/dfx_common_cell.v",
    "/home/u/nx9000/user_material/dfx_ip/dfx_static_hyper_ctl_tdr.v",
  ]);
});

test("glob(memverilog 式)与 read_icl 不进 dfx_ip 文件表", () => {
  const y = `x: |
    read_verilog /lib/memories/*.v
    read_icl /a/b.icl`;
  assert.deepEqual(parseDfxIpFiles(y, "/p"), []);
});

test("prjPathOf: <projectpath>/<harden> → projectpath(容忍尾斜杠)", () => {
  assert.equal(prjPathOf("/home/u/nx9000/processor_core"), "/home/u/nx9000");
  assert.equal(prjPathOf("/home/u/nx9000/processor_core/"), "/home/u/nx9000");
});
