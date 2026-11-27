import { test } from "node:test";
import assert from "node:assert/strict";
import { ipFiles, archConnectionFiles, connLeafName, specFile, specFilesBySection, padFiles, withDftPortFile, regCountFile, archDocFile } from "../../src/store/outputLayout.ts";

test("ipFiles 按扩展名分 IP/VERILOG|ICL|TCL", () => {
  const r = ipFiles([{ name: "pll_ctrl_ds1.v", text: "v" }, { name: "pll_ctrl_ds1.icl", text: "i" }, { name: "pll_ctrl_ds1.tcl", text: "t" }]);
  assert.deepEqual(r.map((f) => f.relPath), ["IP/VERILOG/pll_ctrl_ds1.v", "IP/ICL/pll_ctrl_ds1.icl", "IP/TCL/pll_ctrl_ds1.tcl"]);
});
test("connLeafName:生成器原始名 → 干净落盘名(预览/下载/写工程共用)", () => {
  assert.equal(connLeafName("../../design/soc/top.top_level_ports_and_connectionss"), "top.connection.tcl");
  assert.equal(connLeafName("../../design/soc/top.tcl"), "top.feedthrough.tcl");
});
test("archConnectionFiles:主连接文件 → Arch/<base>.connection.tcl,feedthrough → .feedthrough.tcl", () => {
  const r = archConnectionFiles([
    { name: "../../design/soc/top.top_level_ports_and_connectionss", text: "c" },
    { name: "../../design/soc/top.tcl", text: "f" },
  ]);
  assert.deepEqual(r.map((f) => f.relPath), ["Arch/top.connection.tcl", "Arch/top.feedthrough.tcl"]);
});
test("specFile / withDftPortFile / regCountFile / archDocFile", () => {
  assert.equal(specFile("chip_top", "x").relPath, "Spec/chip_top.spec");
  assert.equal(withDftPortFile("chip_top", "x").relPath, "design_info/chip_top.with_dft_port.v");
  assert.equal(regCountFile("x").relPath, "design_info/register_count.tcl");
  assert.equal(archDocFile("chip_top", "x").relPath, "Arch/chip_top.arch");
});
test("padFiles:空段不产出", () => {
  assert.deepEqual(padFiles("aux", "").map((f) => f.relPath), ["Spec/bscan/auxiliary.spec"]);
  assert.deepEqual(padFiles("aux", "opt").map((f) => f.relPath), ["Spec/bscan/auxiliary.spec", "Spec/bscan/bscan_options.tcl"]);
});

test("specFilesBySection 落 ssn/edt/bscan 三文件，各带 wrapper；空段跳过", () => {
  const files = specFilesBySection("chan", { SSN: "SSN { }", EDT: "EDT { }", EmbeddedBoundaryScan: "EmbeddedBoundaryScan { }" });
  assert.deepEqual(files.map((f) => f.relPath), ["Spec/ssn/chan.spec", "Spec/edt/chan.spec", "Spec/bscan/chan.spec"]);
  assert.ok(files[0].text.startsWith("read_config_data -in_wrapper $dftspec -rep -from_string {"));
  assert.ok(files[0].text.includes("SSN { }"));
  assert.equal(specFilesBySection("chan", { SSN: "  " }).length, 0, "空/空白段跳过");
});

test("specFilesBySection：SSN/EDT/BScan 走块；1838jtag 命令文本原样落盘（不加 wrapper）", () => {
  const r = specFilesBySection("top", { SSN: "SSN {}", EDT: "EDT {}", EmbeddedBoundaryScan: "EmbeddedBoundaryScan {}" }, "set spec [create_dft_specification -stap_host_list {\n  pipe(a)\n}]\n");
  assert.deepEqual(r.map((f) => f.relPath), [
    "Spec/ssn/top.spec", "Spec/edt/top.spec", "Spec/bscan/top.spec", "Spec/1838jtag/top.spec",
  ]);
  const j = r.find((f) => f.relPath === "Spec/1838jtag/top.spec")!;
  assert.ok(j.text.startsWith("set spec [create_dft_specification"), "命令文本原样，不含 read_config_data");
});
test("specFilesBySection：1838jtag 占位/报错文本（// 开头）不落盘", () => {
  const r = specFilesBySection("top", { SSN: "SSN {}" }, "// 本 scope 无 1838jtag 边界接口，无内容。");
  assert.equal(r.filter((f) => f.relPath.startsWith("Spec/1838jtag/")).length, 0);
});
