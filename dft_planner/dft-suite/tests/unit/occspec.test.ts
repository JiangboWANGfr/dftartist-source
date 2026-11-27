import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOccSpec, defaultOccSpecOptions, occControllerName, parseOccSpecOptions,
} from "../../src/hierarchy/core/occspec.ts";
import type { DpOccPoint } from "../../src/core-bridge/model.ts";

const P = (pin: string, clock = "", comment = ""): DpOccPoint => ({ pin, clock, comment });

// The shape of the user's own occ.spec.
const POINTS: DpOccPoint[] = [
  P("u_dfx_clk_test_testpoint_persistent_buf/Z", "clock_test_testpoint"),
  P("u_top/u_ap_wrp/u_app_aon/u_pmu_top/ap_clocks/u_ap_scn_mux/u_aclk/clk_out", "aclk"),
  P("u_top/u_ap_wrp/u_app_aon/u_pmu_top/ap_clocks/u_ap_scn_mux/u_c2_atclk/clk_out", "c2_atclk"),
];

test("the block matches the reference shape", () => {
  const o = defaultOccSpecOptions();
  o.controllers["clock_test_testpoint"] = { captureWindowSize: 3 };
  const s = buildOccSpec(POINTS, o);

  assert.match(s, /^read_config_data -in_wrapper \$dftspec -rep -from_string \{\n/);
  assert.match(s, /\n {2}Occ \{\n/);
  assert.match(s, /ijtag_host_interface : Sib\(occ\);/);
  assert.match(s, /include_clocks_in_icl_model : on;/);
  assert.match(s, /capture_window_size: 5;/);
  // a controller that narrows the window says so; the others inherit and stay quiet
  assert.match(s, /Controller\(clock_test_testpoint\) \{\n\s+capture_window_size: 3;\n\s+clock_intercept_node : u_dfx_clk_test_testpoint_persistent_buf\/Z;/);
  assert.match(s, /Controller\(aclk\) \{\n\s+clock_intercept_node : u_top\/.*u_aclk\/clk_out;/);
  assert.equal(/capture_window_size/g.test(s), true);
  assert.equal(s.match(/capture_window_size/g)!.length, 2, "block-level + the one override");
  assert.ok(s.trimEnd().endsWith("}"), "both braces close");
});

test("a controller is named after its clock, or after the pin when there is none", () => {
  assert.equal(occControllerName(P("a/b/clk_out", "aclk")), "aclk");
  assert.equal(occControllerName(P("u_x/u_y/clk_out")), "clk_out");
  assert.equal(occControllerName(P("u_x.u_y.my-clk")), "my_clk");
});

test("a duplicated point does not emit two controllers of the same name", () => {
  const dup = [...POINTS, P("somewhere/else/clk_out", "aclk")];
  const s = buildOccSpec(dup, defaultOccSpecOptions());
  assert.equal(s.match(/Controller\(aclk\)/g)!.length, 1);
  // the FIRST declaration wins, so the list stays in the order the shell recorded it
  assert.match(s, /Controller\(aclk\) \{\n\s+clock_intercept_node : u_top\//);
});

test("an override replaces the pin the shell recorded", () => {
  const o = defaultOccSpecOptions();
  o.controllers["aclk"] = { interceptNode: "u_other/buf/Z" };
  const s = buildOccSpec(POINTS, o);
  assert.match(s, /Controller\(aclk\) \{\n\s+clock_intercept_node : u_other\/buf\/Z;/);
});

test("extra properties ride along verbatim", () => {
  const o = defaultOccSpecOptions();
  o.controllers["aclk"] = { extra: { chain_count: "2", some_future_key: "on" } };
  const s = buildOccSpec(POINTS, o);
  assert.match(s, /chain_count : 2;/);
  assert.match(s, /some_future_key : on;/);
});

test("the wrapper is optional, for pasting into a spec file", () => {
  const o = { ...defaultOccSpecOptions(), wrapInReadConfigData: false };
  const s = buildOccSpec(POINTS, o);
  assert.equal(s.startsWith("Occ {"), true);
  assert.equal(s.includes("read_config_data"), false);
});

test("no points still produces a valid, empty block", () => {
  const s = buildOccSpec([], defaultOccSpecOptions());
  assert.equal(s.includes("Controller("), false);
  assert.match(s, /Occ \{[\s\S]*\}/);
});

test("options round-trip, and a damaged document degrades to defaults", () => {
  const o = defaultOccSpecOptions();
  o.captureWindowSize = 7;
  o.includeClocksInIclModel = false;
  o.controllers["aclk"] = { captureWindowSize: 2, interceptNode: "x/Z", extra: { k: "v" } };
  const back = parseOccSpecOptions(JSON.parse(JSON.stringify(o)));
  assert.deepEqual(back, o);

  for (const bad of [null, 42, "nope", { controllers: 3 }, { captureWindowSize: "big" }]) {
    const d = parseOccSpecOptions(bad);
    assert.equal(d.captureWindowSize, 5);
    assert.equal(d.ijtagHostInterface, "Sib(occ)");
    assert.deepEqual(d.controllers, {});
  }
});
