import { test } from "node:test";
import assert from "node:assert/strict";
import { splitPadOutput } from "../../src/hierarchy/core/pad.ts";

test("按 set_boundary_scan_port_options 切两段", () => {
  const text = "read_config_data -in_wrapper $dftspec {\n  AuxiliaryInputOutputPorts { GPIO1 }\n}\n\nset_boundary_scan_port_options -pad_io_ports { GPIO1 }";
  const r = splitPadOutput(text);
  assert.ok(r.auxiliary.startsWith("read_config_data"));
  assert.ok(!r.auxiliary.includes("set_boundary_scan_port_options"));
  assert.ok(r.bscanOptions.startsWith("set_boundary_scan_port_options"));
});
test("无标记 → 全归 auxiliary,bscanOptions 空", () => {
  const r = splitPadOutput("read_config_data { x }");
  assert.equal(r.bscanOptions, "");
  assert.ok(r.auxiliary.includes("read_config_data"));
});
