import { test } from "node:test"; import assert from "node:assert/strict";
import { existsSync } from "node:fs"; import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const BIN = path.resolve(process.cwd(), "../dft-core/build");
const CORE = path.resolve(process.cwd(), "../dft-core");
const FILELIST = path.join(CORE, "test/rtl/pad/mini_chip.f");
const LIB = path.join(CORE, "test/fixtures/pad/mini.tcelllib");
const havePad = existsSync(path.join(BIN, "pad")) && existsSync(FILELIST) && existsSync(LIB);

process.env.DFT_CORE_BIN_DIR = BIN; // bin.cjs resolves from this
const { padTable, padGen } = require("../../electron/cli.cjs");

test("padTable parses the mini fixture", { skip: !havePad }, async () => {
  const r = await padTable(FILELIST, LIB);
  assert.ok(Array.isArray(r.pads) && r.pads.length >= 5);
  const g0 = r.pads.find((p: { path: string }) => p.path === "mini_chip.u_gpio0");
  assert.ok(g0 && g0.gpio === "GPIO_0" && g0.dir === "inout");
  assert.ok(Array.isArray(r.warnings) && r.warnings.length >= 1);
});

test("padGen with inline cfg produces both sections", { skip: !havePad }, async () => {
  const cfg = { pads: { "mini_chip.u_gpio0": { reuse: "in", bscan_en: "yes" } } };
  const text = await padGen(FILELIST, LIB, cfg, "chip", "");
  assert.match(text, /read_config_data -in_wrapper \$dftspec\/BoundaryScan/);
  assert.match(text, /internal_auxiliary_input_ports : GPIO_0;/);
  assert.match(text, /set_boundary_scan_port_options -pad_io_ports/);
  assert.match(text, /dont_touch/);
});

test("padGen without cfg omits section A", { skip: !havePad }, async () => {
  const text = await padGen(FILELIST, LIB, null, "chip", "");
  assert.ok(!text.includes("read_config_data"));
  assert.match(text, /set_boundary_scan_port_options -pad_io_ports/);
});
