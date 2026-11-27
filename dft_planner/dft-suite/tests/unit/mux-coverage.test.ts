// Several planned muxes sit on ONE reset wire because the chain crosses several register
// outputs, and each register output is X while shifting no matter what feeds it. That reads as
// duplicated work, so the tool has to say who each mux is for — and, with the same data, name
// a mux that no failing group needs at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { muxCoverage, muxCoveredGroups, muxRole } from "../../src/hierarchy/core/resetFix.ts";
import type { CrPathItem } from "../../src/core-bridge/model.ts";

const item = (o: Partial<CrPathItem>): CrPathItem => ({
  kind: "reset", owner: "top.u", net: "rst", edge: "posedge", path: [], elems: [],
  terminus: "sequential", detail: "top.u.sync.data_sync <- flop @clk, async reset rst",
  value: "X", inactive: "0", flopCount: 1, ok: false,
  ...o,
} as unknown as CrPathItem);

test("each mux reports the groups and flops it is the fix point for", () => {
  // two groups behind the SAME source, one behind another
  const items = [
    item({ net: "puc_rst", flopCount: 1000, detail: "top.u.sync_puc.data_sync <- flop" }),
    item({ net: "puc_rst_b", flopCount: 300, detail: "top.u.sync_puc.data_sync <- flop" }),
    item({ net: "por", flopCount: 5, detail: "top.u.sync_por.data_sync <- flop" }),
  ];
  const cov = muxCoverage(items, ["top/u/sync_puc/data_sync", "top/u/sync_por/data_sync"]);
  assert.equal(cov.length, 2);
  // biggest first
  assert.equal(cov[0].target, "top/u/sync_puc/data_sync");
  assert.equal(cov[0].groups, 2);
  assert.equal(cov[0].flops, 1300);
  assert.deepEqual(cov[0].serves, ["puc_rst", "puc_rst_b"]);
  assert.equal(cov[0].redundant, false);
  assert.equal(cov[1].flops, 5);
  assert.equal(cov[1].redundant, false);
});

test("a mux no failing group needs is reported as redundant", () => {
  const items = [item({ net: "por", flopCount: 5, detail: "top.u.sync_por.data_sync <- flop" })];
  const cov = muxCoverage(items, ["top/u/sync_por/data_sync", "top/u/somewhere_else/q"]);
  const stray = cov.find((c) => c.target === "top/u/somewhere_else/q")!;
  assert.equal(stray.redundant, true);
  assert.equal(stray.groups, 0);
  assert.equal(stray.flops, 0);
});

test("groups that pass ON THEIR OWN do not justify a mux", () => {
  // ok:true without plannedFix means the group is fine as the netlist stands — a mux pointed
  // at its source buys nothing
  const items = [item({ net: "por", flopCount: 5, ok: true,
                        detail: "top.u.sync_por.data_sync <- flop" })];
  const cov = muxCoverage(items, ["top/u/sync_por/data_sync"]);
  assert.equal(cov[0].redundant, true);
});

test("a group HELD by a planned mux justifies exactly that mux (daemon attribution)", () => {
  // After the fix lands the group turns ok — the mux must NOT then read as redundant, or every
  // successful fix would immediately look like a mistake. The daemon names the mux that holds
  // the value (plannedMuxTarget); attribution follows it, not the fix-point heuristic.
  const held = item({ net: "puc_rst", flopCount: 1000, ok: true,
                      plannedFix: true, plannedMuxTarget: "top.u.sync_puc.data_out",
                      detail: "top.u.sync_puc.data_sync <- flop" });
  const cov = muxCoverage([held], ["top/u/sync_puc/data_out", "top/u/elsewhere/q"]);
  const mine = cov.find((c) => c.target === "top/u/sync_puc/data_out")!;
  assert.equal(mine.redundant, false);
  assert.equal(mine.flops, 1000);
  assert.equal(cov.find((c) => c.target === "top/u/elsewhere/q")!.redundant, true);
  // and the role line says it is THIS group's fix point when asked from its own debug view
  assert.match(muxRole([held], "top/u/sync_puc/data_out", held), /^本组的修复点/);
});

// The label on the mux box: the reason two muxes in series on one wire are not the same fix.
test("muxRole names the flops a mux exists for, and whether they are on THIS path", () => {
  const onPath = item({ owner: "top.u.sync_puc", net: "rst", flopCount: 2,
                        detail: "top.u.puc_a <- assign (multi-source converge point)",
                        terminus: "logic" });
  const elsewhere = item({ owner: "top.u.watchdog", net: "por", flopCount: 5,
                           detail: "top.u.sync_por.data_sync <- flop" });
  const items = [onPath, elsewhere];

  // asking about the mux that fixes the violation on screen
  const mine = muxRole(items, "top/u/puc_a", onPath);
  assert.match(mine, /^本组的修复点/);
  assert.match(mine, /2 flop/);
  assert.match(mine, /sync_puc\/rst/);

  // the OTHER mux on the same drawn wire: it works for a different branch, and says so
  const other = muxRole(items, "top/u/sync_por/data_sync", onPath);
  assert.match(other, /^其他分支/);
  assert.match(other, /5 flop/);
  assert.match(other, /watchdog\/por/);

  // a mux nothing needs
  assert.equal(muxRole(items, "top/u/nowhere", onPath), "无复位组需要它 — 可删");
});

// The on-demand proof list: exact owner/net/flops per group, held vs still-failing.
test("muxCoveredGroups lists the registers a mux serves, biggest first", () => {
  const items = [
    item({ owner: "top.u.watchdog", net: "por", flopCount: 2,
           detail: "top.u.sync_por.data_sync <- flop" }),
    item({ owner: "top.u.lfxt", net: "rst", flopCount: 3, ok: true, plannedFix: true,
           plannedMuxTarget: "top.u.sync_por.data_sync",
           detail: "top.u.sync_por.data_sync <- flop" }),
    item({ owner: "top.u.elsewhere", net: "x", flopCount: 9,
           detail: "top.u.other.data_sync <- flop" }),   // another mux's business
  ];
  const g = muxCoveredGroups(items, "top/u/sync_por/data_sync");
  // biggest first; each entry now carries everything the DFF box draws
  assert.equal(g.length, 2);
  assert.deepEqual(g.map((x) => [x.owner, x.net, x.flops, x.held]), [
    ["top/u/lfxt", "rst", 3, true],
    ["top/u/watchdog", "por", 2, false],
  ]);
  assert.equal(g[0].edge, "posedge");
  assert.equal(g[0].inactive, "0");
  assert.equal(g[0].s, "X");
  assert.equal(g[0].set, false);
  assert.deepEqual(muxCoveredGroups(items, "top/u/nowhere"), []);
});

test("paths are compared in one spelling (dots vs slashes must not hide a match)", () => {
  const items = [item({ net: "por", flopCount: 7, detail: "top.u.sync_por.data_sync <- flop" })];
  const cov = muxCoverage(items, ["top.u.sync_por.data_sync"]);   // dotted form
  assert.equal(cov[0].redundant, false);
  assert.equal(cov[0].flops, 7);
});
