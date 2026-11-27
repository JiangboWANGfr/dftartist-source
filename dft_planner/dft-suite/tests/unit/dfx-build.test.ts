import { test } from "node:test"; import assert from "node:assert/strict";
import { buildCtrlIpSpec } from "../../src/genconn/dfx/build.ts";

const rows = [
  { pin: "enable", dir: "in", width: 1, nodeId: "top.PLL_1", instName: "PLL_1",
    role: "control" as const, stitch: ["mux"] as const },
  { pin: "LOCKED", dir: "out", width: 1, nodeId: "top.PLL_1", instName: "PLL_1",
    role: "observe" as const, stitch: [] },
  { pin: "cfg", dir: "in", width: 2, nodeId: "top.U_X", instName: "U_X",
    role: "control" as const, stitch: ["replace", "mux"] as const },
];

test("buildCtrlIpSpec: targets, per-bit stitch, mux naming consumes ds numbers in row order", () => {
  const { spec, muxCount } = buildCtrlIpSpec({
    moduleBase: "pll_ctrl", dsIndex: 1, rows: rows as never, muxDs: [7, 8],
  });
  assert.equal(muxCount, 2);
  assert.equal(spec.moduleBase, "pll_ctrl");
  const [en, lk, cfg] = spec.pins;
  assert.equal(en.stitch, "mux");
  assert.equal(en.muxName, "u_dfx_PLL_1_enable_persistent_mux_inst_ds7");
  assert.equal(en.target, "PLL_1/enable");
  assert.equal(lk.mode, "observe");
  assert.equal(lk.target, "PLL_1/LOCKED");
  assert.equal(lk.stitch, undefined);
  assert.deepEqual(cfg.stitch, ["replace", "mux"]);
  assert.deepEqual(cfg.muxName, [null, "u_dfx_U_X_cfg_persistent_mux_inst_ds8"]);
});

test("duplicate port names across instances get instance prefix (A2)", () => {
  const dup = [
    { ...rows[0] },
    { pin: "enable", dir: "in", width: 1, nodeId: "top.PLL_2", instName: "PLL_2",
      role: "control" as const, stitch: ["mux"] as const },
  ];
  const { spec } = buildCtrlIpSpec({ moduleBase: "m", dsIndex: 2, rows: dup as never, muxDs: [1, 2] });
  assert.deepEqual(spec.pins.map((p) => p.portName), ["PLL_1_enable", "PLL_2_enable"]);
});

test("ignore rows are dropped", () => {
  const withIgnore = [rows[0], { ...rows[1], role: "ignore" as const }];
  const { spec, muxCount } = buildCtrlIpSpec({ moduleBase: "m", dsIndex: 1, rows: withIgnore as never, muxDs: [1] });
  assert.equal(spec.pins.length, 1);
  assert.equal(muxCount, 1);
});
