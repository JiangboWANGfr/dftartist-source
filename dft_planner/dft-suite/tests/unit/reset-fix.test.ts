import { test } from "node:test"; import assert from "node:assert/strict";
import { proposeResetFixes, failingResets, fixOutcome, fixPoint, redundantMuxes, resetTarget, arrivesAtFlop, needsInverter, RST_SCAN_N_SHIFT } from "../../src/hierarchy/core/resetFix.ts";
import type { CrPathItem } from "../../src/core-bridge/model.ts";

const rst = (o: Partial<CrPathItem>): CrPathItem => ({
  kind: "reset", owner: "top.u_a", net: "rst_n", edge: "negedge", path: [], elems: [],
  terminus: "pi", detail: "", clockName: "", rootValue: "X", value: "X", inactive: "1",
  ok: false, flopCount: 1, file: "", line: 0, ...o,
});

test("only FAILING resets are proposed — a working one is left alone", () => {
  const items = [
    rst({ net: "bad", ok: false }),
    rst({ net: "good", ok: true }),
    { ...rst({ net: "clk" }), kind: "clock" as const },   // clocks are not this fix
  ];
  assert.deepEqual(failingResets(items).map((i) => i.net), ["bad"]);
  const p = proposeResetFixes({ items, ips: [], patched: [] });
  assert.equal(p.filter((a) => a.kind === "mux").length, 1);
  assert.ok(p.some((a) => a.command.includes("top/u_a/bad")));
});

test("the IPs come first, and only when they are not already planned", () => {
  const items = [rst({})];
  const fresh = proposeResetFixes({ items, ips: [], patched: [] });
  assert.deepEqual(fresh.slice(0, 2).map((a) => a.kind), ["ip", "ip"]);
  assert.ok(fresh[0].command.startsWith("add_dft_ip dfx_dynamic_hyper_ctl"));

  const already = proposeResetFixes({
    items, patched: [],
    ips: [{ instance: "u_dyn", module: "dfx_dynamic_hyper_ctl", at: "" },
          { instance: "u_tdr", module: "dfx_static_hyper_ctl_tdr", at: "PROCESSOR_1" }],
  });
  assert.equal(already.filter((a) => a.kind === "ip").length, 0, "nothing re-planned");
  // …and the muxes reference the instances that exist, at their real paths
  assert.ok(already[0].command.includes("-override_source u_dyn/dfx_rst_scan_n"));
  assert.ok(already[0].command.includes("-select PROCESSOR_1/u_tdr/dfx_scan_mode"));
});

test("ONE mux per SOURCE — not one per flop group that suffers from it", () => {
  // The real shape on this design: a reset made in one place and fanned out everywhere. 118
  // groups, one source. Patching each destination is 118 muxes for a one-source problem.
  const src = "PROCESSOR_1.clock_module_0.sync_cell_puc.data_sync <- flop @clk, async reset rst";
  const items = [
    rst({ owner: "GPIO_1", net: "puc_rst", terminus: "sequential", detail: src, flopCount: 208 }),
    rst({ owner: "GPIO_2", net: "puc_rst", terminus: "sequential", detail: src, flopCount: 208 }),
    rst({ owner: "U_2", net: "puc_rst", terminus: "sequential", detail: src, flopCount: 146 }),
    // a genuinely separate problem: no source to name
    rst({ owner: "PROCESSOR_1.clock_module_0.sync_cell_puc", net: "rst",
          terminus: "undriven", detail: "", flopCount: 2 }),
  ];
  const muxes = proposeResetFixes({ items, ips: [], patched: [] }).filter((a) => a.kind === "mux");
  assert.equal(muxes.length, 2, "one per source, not one per group");
  assert.equal(muxes[0].target, "PROCESSOR_1/clock_module_0/sync_cell_puc/data_sync");
  assert.equal(muxes[0].flops, 562, "every flop the source feeds");
  assert.match(muxes[0].why, /3 reset group\(s\)/);
  // the undriven net has no source — it is patched where it is
  assert.equal(muxes[1].target, "PROCESSOR_1/clock_module_0/sync_cell_puc/rst");
});

test("fixPoint: the source path, cut at the human tail", () => {
  assert.equal(
    fixPoint(rst({ terminus: "sequential", detail: "a.b.c <- flop @clk, async reset rst (…)" })),
    "a/b/c");
  // a primary input is a source too — control it there, once
  assert.equal(fixPoint(rst({ terminus: "pi", detail: "top.rst_n" })), "top/rst_n");
  // undriven names nothing: patch the net itself
  assert.equal(fixPoint(rst({ owner: "top.u_a", net: "rst_n", terminus: "undriven", detail: "" })),
               "top/u_a/rst_n");
});

test("a source that already carries a mux is never proposed again", () => {
  const items = [rst({ owner: "top.u_a", net: "rst_n", terminus: "undriven", detail: "" })];
  assert.equal(
    proposeResetFixes({ items, ips: [], patched: ["top/u_a/rst_n"] })
      .filter((a) => a.kind === "mux").length, 0);
  // recorded with '.' separators — the same net
  assert.equal(
    proposeResetFixes({ items, ips: [], patched: ["top.u_a.rst_n"] })
      .filter((a) => a.kind === "mux").length, 0);
});

test("the reason says WHY, including the register-driven case", () => {
  const seq = proposeResetFixes({
    items: [rst({ terminus: "sequential", value: "X", inactive: "1", flopCount: 3 })],
    ips: [], patched: [] }).find((a) => a.kind === "mux")!;
  assert.match(seq.why, /register \(R3\)/);
  assert.match(seq.why, /needs 1/);
  assert.match(seq.why, /3 flop\(s\)/);

  const und = proposeResetFixes({
    items: [rst({ terminus: "undriven" })], ips: [], patched: [] }).find((a) => a.kind === "mux")!;
  assert.match(und.why, /undriven/);
});

test("every action is on by default and carries the exact command", () => {
  const p = proposeResetFixes({ items: [rst({})], ips: [], patched: [] });
  assert.ok(p.filter((a) => a.kind !== "note").every((a) => a.on));
  assert.ok(p.filter((a) => a.kind !== "note")
    .every((a) => /^add_dft_(ip|ctrl_mux) /.test(a.command)));
});

test("resetTarget renders the dp_shell spelling", () => {
  assert.equal(resetTarget(rst({ owner: "top.u_a.u_b", net: "rst_n" })), "top/u_a/u_b/rst_n");
});

// dfx_rst_scan_n is ONE active-low pin, held at 1 during scan shift (0/1 in stuck-at capture,
// 1 throughout transition capture). It is not a per-reset choice — picking 0 for one reset and 1
// for another would need two pins.
test("the source is always held at its shift value, 1", () => {
  assert.equal(RST_SCAN_N_SHIFT, "1");
  const a = proposeResetFixes({
    items: [rst({ inactive: "0", terminus: "undriven", detail: "" })], ips: [], patched: [] })
    .find((x) => x.kind === "mux")!;
  assert.doesNotMatch(a.command, /-source_value/);   // values COMPUTE; no hidden constraint
});

// THE INVERTER MUST NEVER BE IGNORED. The mux sits at the source, the requirement is stated at
// the flop, and an inverter between them turns one into the other.
test("an inverter on the path decides whether the pin's 1 arrives as the inactive value", () => {
  const src = "a.b.c <- flop @clk";
  // active-high reset (inactive=0) with an inverter: 1 at the source arrives as 0 — correct
  const ok = rst({ owner: "GPIO_1", net: "puc_rst", terminus: "sequential", detail: src,
                   inactive: "0", inverted: true, flopCount: 208 });
  assert.equal(arrivesAtFlop(ok), "0");
  assert.equal(needsInverter(ok), false);

  // the same reset WITHOUT an inverter: 1 arrives as 1 and holds it asserted
  const bad = rst({ owner: "GPIO_2", net: "puc_rst", terminus: "sequential", detail: src,
                    inactive: "0", inverted: false });
  assert.equal(arrivesAtFlop(bad), "1");
  assert.equal(needsInverter(bad), true);
});

test("an active-HIGH reset register is controlled from dfx_rst_scan_p", () => {
  const src = "a.b.c <- flop @clk";
  // register polarity decides the rail: inactive=0 (active-high) -> the p rail.
  const bad = rst({ owner: "GPIO_2", net: "puc_rst", terminus: "sequential", detail: src,
                    inactive: "0", inverted: false, flopCount: 9 });
  const p = proposeResetFixes({ items: [bad], ips: [], patched: [] });
  const mux = p.find((a) => a.kind === "mux" && !a.command.startsWith("#"))!;
  assert.match(mux.command, /-override_source \S+\/dfx_rst_scan_p /,
               "active-high register, no inverter -> dfx_rst_scan_p");
  assert.match(mux.why, /register inactive=0 -> source must be 0 -> dfx_rst_scan_p/);
  assert.doesNotMatch(mux.why, /OPPOSITE rail/, "single polarity: no conflict warning");
  assert.doesNotMatch(mux.command, /-source_value/);   // values COMPUTE; no hidden constraint
});

test("a SET pin is fixed from the dfx_set_scan rail pair; an inverter flips the rail", () => {
  const src = "a.b.c <- flop @clk";
  // active-high set, mux directly on the wire: source must be 0 -> dfx_set_scan_p
  const st = rst({ owner: "GPIO_3", net: "preset", terminus: "sequential", detail: src,
                   inactive: "0", inverted: false, flopCount: 4, set: true });
  // the same polarity through one inverter: the source must be 1 -> dfx_set_scan_n.
  // "反相器一定不能忽略" — the rail choice must account for it, or the plan asserts the set.
  const stInv = rst({ owner: "GPIO_4", net: "preset_b", terminus: "sequential",
                      detail: "x.y.z <- flop @clk",
                      inactive: "0", inverted: true, flopCount: 2, set: true });
  const p = proposeResetFixes({ items: [st, stInv], ips: [], patched: [] });
  const muxes = p.filter((a) => a.kind === "mux");
  const cmds = muxes.map((a) => a.command).join(" | ");
  assert.match(cmds, /dfx_set_scan_p/, "set + active-high direct -> dfx_set_scan_p");
  assert.match(cmds, /dfx_set_scan_n/, "set + active-high through an inverter -> dfx_set_scan_n");
  assert.doesNotMatch(cmds, /dfx_rst_scan/, "set pins never borrow the reset rails");
  const inv = muxes.find((a) => /through an inverter/.test(a.why));
  assert.ok(inv, "the inverted path is stated in the reasoning");
});

test("one source claimed by BOTH rails: majority wins, minority flagged", () => {
  const src = "m.rst_gen.rst_o <- flop @clk";
  const a = rst({ owner: "A", net: "r1", terminus: "sequential", detail: src,
                  inactive: "1", inverted: false, flopCount: 10 });   // needs 1 -> rst_scan_n
  const b = rst({ owner: "B", net: "r2", terminus: "sequential", detail: src,
                  inactive: "0", inverted: false, flopCount: 3 });    // needs 0 -> rst_scan_p
  const p = proposeResetFixes({ items: [a, b], ips: [], patched: [] });
  const mux = p.find((x) => x.kind === "mux")!;
  assert.match(mux.command, /dfx_rst_scan_n/, "majority (10 flops) picks the n rail");
  assert.match(mux.why, /3 flop\(s\) here need the OPPOSITE rail/);
  const note = p.find((x) => x.kind === "note" && /DIFFERENT rails/.test(x.command));
  assert.ok(note, "the conflict is stated as its own note");
});

test("a mux on the flop's OWN net is not affected by upstream inverters", () => {
  const i = rst({ owner: "top.u_a", net: "rst_n", terminus: "undriven", detail: "",
                  inactive: "1", inverted: true });
  assert.equal(arrivesAtFlop(i), "1");
  assert.equal(needsInverter(i), false);
});

test("fixOutcome separates what the plan fixed from what it could not", () => {
  const src = "a.b.c <- flop";
  const after = [
    rst({ owner: "GPIO_1", net: "puc_rst", ok: true, plannedFix: true, flopCount: 208 }),
    rst({ owner: "GPIO_2", net: "puc_rst", ok: true, plannedFix: true, flopCount: 208 }),
    rst({ owner: "U_3", net: "bb_rst", ok: false, terminus: "blackbox", detail: "u_bb.q", flopCount: 9 }),
    rst({ owner: "U_4", net: "bb_rst", ok: false, terminus: "blackbox", detail: "u_bb.q", flopCount: 1 }),
    rst({ owner: "U_5", net: "x", ok: false, terminus: "sequential", detail: src, flopCount: 4 }),
    { ...rst({ net: "clk" }), kind: "clock" as const },   // not a reset: never counted
  ];
  const o = fixOutcome(118, after);
  assert.equal(o.before, 118);
  assert.equal(o.fixed, 2);
  assert.equal(o.fixedFlops, 416);
  assert.equal(o.left, 3);
  // what is LEFT is grouped by source too, biggest first
  assert.equal(o.remaining.length, 2);
  assert.equal(o.remaining[0].target, "u_bb/q");
  assert.equal(o.remaining[0].flops, 10);
  assert.match(o.remaining[0].why, /blackbox/);
});

test("a group that passes on its own is NOT counted as fixed by the plan", () => {
  const o = fixOutcome(1, [rst({ ok: true, plannedFix: false, flopCount: 5 })]);
  assert.equal(o.fixed, 0);
  assert.equal(o.left, 0);
});

// Two violet boxes on one wire: a destination patched yesterday, its common source patched today.
test("a mux whose reset is patched upstream is reported as redundant", () => {
  const src = "PROCESSOR_1.clock_module_0.sync_cell_puc.data_sync <- flop";
  const items = [
    // this destination carries a mux, and its source carries one too
    rst({ owner: "GPIO_1.sync_cell_p1in_0", net: "rst", terminus: "sequential", detail: src,
          ok: true, plannedFix: true, flopCount: 2 }),
    // an unpatched destination on the same source: not redundant, it has no mux of its own
    rst({ owner: "GPIO_2", net: "puc_rst", terminus: "sequential", detail: src, flopCount: 8 }),
  ];
  const patched = ["GPIO_1/sync_cell_p1in_0/rst",
                   "PROCESSOR_1/clock_module_0/sync_cell_puc/data_sync"];
  const red = redundantMuxes(items, patched);
  assert.equal(red.length, 1);
  assert.equal(red[0].target, "GPIO_1/sync_cell_p1in_0/rst");
  assert.equal(red[0].upstream, "PROCESSOR_1/clock_module_0/sync_cell_puc/data_sync");

  // …and the proposal offers to delete it, FIRST
  const p = proposeResetFixes({ items, ips: [], patched });
  assert.ok(p[0].command.startsWith("delete_dft_ctrl_mux GPIO_1/sync_cell_p1in_0/rst"));
  assert.equal(p[0].on, true);
  assert.match(p[0].why, /redundant/);
});

test("the source's OWN mux is not called redundant against itself", () => {
  const items = [rst({ owner: "top.u_a", net: "rst_n", terminus: "undriven", detail: "",
                       ok: true, plannedFix: true })];
  assert.deepEqual(redundantMuxes(items, ["top/u_a/rst_n"]), []);
});

// The state a plan gets stuck in when a wire was right-clicked on the wrong side of an
// inverter: the recorded mux drives the reset to its ACTIVE value, the DRC keeps failing, and
// nothing named the culprit — the user was expected to notice and delete it by hand.
test("a HARMFUL recorded mux (drives the reset ACTIVE) is proposed for deletion, first", () => {
  const src = "clock_module_0.sync_cell_puc.data_sync <- flop";
  const items = [
    rst({ owner: "GPIO_1", net: "puc_rst", terminus: "sequential", detail: src,
          ok: false, plannedFix: true, plannedMuxTarget: "PROCESSOR_1/clock_module_0/puc_rst",
          value: "1", inactive: "0", flopCount: 208 }),
    rst({ owner: "GPIO_2", net: "puc_rst", terminus: "sequential", detail: src,
          ok: false, plannedFix: true, plannedMuxTarget: "PROCESSOR_1/clock_module_0/puc_rst",
          value: "1", inactive: "0", flopCount: 208 }),
  ];
  const patched = ["PROCESSOR_1/clock_module_0/sync_cell_puc/data_out",
                   "PROCESSOR_1/clock_module_0/puc_rst"];
  const p = proposeResetFixes({ items, ips: [], patched });
  const del = p.filter((a) => a.command.startsWith("delete_dft_ctrl_mux"));
  assert.equal(del.length, 1, "ONE deletion for the one culprit, not one per victim group");
  assert.equal(del[0].command, "delete_dft_ctrl_mux PROCESSOR_1/clock_module_0/puc_rst");
  assert.equal(del[0].on, true);
  assert.match(del[0].why, /HARMFUL/);
  assert.match(del[0].why, /416 flop\(s\)/);
  // and NO new mux is proposed for those groups this round — after the deletion the other
  // recorded mux (data_out) takes over; the automatic re-run shows what actually remains
  assert.ok(!p.some((a) => a.command.startsWith("add_dft_ctrl_mux")),
            "no add rows for groups whose fix is the deletion");
});

// The recorded target must be a real HIERARCHICAL PIN: the walk's xdn crossing out of the
// source instance (sync_cell_puc/data_out), never the module-internal net (…/data_sync).
// The insertion flow attaches control points to instance pins only.
test("fixPoint prefers the source instance's boundary pin over its internal net", () => {
  const i = rst({
    owner: "GPIO_1", net: "puc_rst", terminus: "sequential",
    detail: "top.clock_module_0.sync_cell_puc.data_sync <- flop @clk, async reset rst",
    elems: [
      "xup@top.GPIO_1:puc_rst",
      "inv@top.clock_module_0:puc_rst|file=x.v|line=9",
      "xdn@top.clock_module_0.sync_cell_puc:data_out",
      "buf@top.clock_module_0.sync_cell_puc:data_out",
    ],
  });
  assert.equal(fixPoint(i), "top/clock_module_0/sync_cell_puc/data_out");
  // no boundary crossing recorded (source at this level): the net path stays the fallback
  const flat = rst({ owner: "u", net: "r", terminus: "sequential",
                     detail: "top.u.some_net <- flop @clk", elems: [] });
  assert.equal(fixPoint(flat), "top/u/some_net");
});
