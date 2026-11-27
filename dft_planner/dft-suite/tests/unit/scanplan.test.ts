import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countFamilies, coreOf, defaultEdtDefaults, defaultFamilies, familyOfInstance, paintFamily,
  parseScanPlan, serializeScanPlan, assignCoverage, clearFamilyAssignments, removeGlob,
  setFamilyGlobs, unassignFamily, defaultWrapperOptions, familiesForEdt, setEdtFamilies, sizingForEdt, setEdtSizing,
  setFamilyOption, familyTclOptions, addFamily, FAMILY_TCL_OPTIONS,
  type ScanPlan, type ScanPlanDoc,
} from "../../src/hierarchy/core/scanplan.ts";
import type { RegCountResult } from "../../src/core-bridge/model.ts";

// A design with several elaborated roots — the shape that broke the old "shortest instanceId is
// the core" guess: `dbg` sorts shorter than `chip` and would have won.
const RC: RegCountResult = {
  total: 1000,
  counts: [
    { instanceId: "chip", own: 0, subtree: 1000, memoryBits: 0 },
    { instanceId: "chip.cpu", own: 100, subtree: 700, memoryBits: 0 },
    { instanceId: "chip.cpu.alu", own: 300, subtree: 300, memoryBits: 2048 },
    { instanceId: "chip.occ_inst", own: 40, subtree: 40, memoryBits: 0 },
    { instanceId: "chip.u_hyper_ctl", own: 60, subtree: 60, memoryBits: 0 },
    { instanceId: "chip.io", own: 200, subtree: 200, memoryBits: 0 },
    { instanceId: "dbg", own: 5, subtree: 5, memoryBits: 0 },
  ],
};

const fresh = (): ScanPlan => ({ families: defaultFamilies(), coverage: {} });

test("the core is the biggest elaborated root, not the shortest name", () => {
  assert.equal(coreOf(RC)?.instanceId, "chip");
  // an explicit top still wins
  assert.equal(coreOf(RC, "dbg")?.instanceId, "dbg");
});

test("globs and painting both feed a family; the rest family absorbs what is left", () => {
  const counts = countFamilies(fresh(), RC, "chip");
  const bits = (n: string) => counts.find((c) => c.family.name === n)?.bits ?? -1;
  // default globs: *tessent_occ* matches nothing here, *hyper* matches u_hyper_ctl
  assert.equal(bits("HYPER_CHAIN"), 60);
  assert.equal(bits("OCC_CHAIN"), 0);
  assert.equal(bits("INT_CHAIN"), 1000 - 60);

  const painted = paintFamily(fresh(), "occ", "chip.occ_inst");
  const c2 = countFamilies(painted, RC, "chip");
  const b2 = (n: string) => c2.find((c) => c.family.name === n)?.bits ?? -1;
  assert.equal(b2("OCC_CHAIN"), 40);
  assert.equal(b2("INT_CHAIN"), 1000 - 60 - 40);
});

test("a flop is counted once: painting a parent supersedes its child", () => {
  let plan = paintFamily(fresh(), "occ", "chip.cpu.alu");
  plan = paintFamily(plan, "occ", "chip.cpu");           // ancestor of the previous pick
  const occ = plan.families.find((f) => f.id === "occ")!;
  assert.deepEqual(occ.instances, ["chip.cpu"]);          // the child was dropped, not kept
  const counts = countFamilies(plan, RC, "chip");
  assert.equal(counts.find((c) => c.family.name === "OCC_CHAIN")?.bits, 700);
  assert.equal(counts.find((c) => c.family.name === "INT_CHAIN")?.bits, 1000 - 60 - 700);
});

test("painting into a second family moves the instance out of the first", () => {
  let plan = paintFamily(fresh(), "occ", "chip.io");
  plan = paintFamily(plan, "hyper", "chip.io");
  assert.deepEqual(plan.families.find((f) => f.id === "occ")!.instances, []);
  assert.deepEqual(plan.families.find((f) => f.id === "hyper")!.instances, ["chip.io"]);
});

test("tree colouring is inherited from the nearest claimed ancestor", () => {
  const plan = paintFamily(fresh(), "occ", "chip.cpu");
  const at = familyOfInstance(countFamilies(plan, RC, "chip"));
  assert.equal(at("chip.cpu")?.family.name, "OCC_CHAIN");
  assert.equal(at("chip.cpu.alu")?.family.name, "OCC_CHAIN");   // covered by the parent
  assert.equal(at("chip.io"), undefined);
});

test("coverage assignment drops overlapping entries in both directions", () => {
  let plan = assignCoverage(fresh(), "INT_A", "chip.cpu.alu");
  plan = assignCoverage(plan, "INT_B", "chip.cpu");
  assert.deepEqual(plan.coverage, { "chip.cpu": "INT_B" });
});

test("the plan round-trips through the project document", () => {
  let plan = paintFamily(fresh(), "occ", "chip.occ_inst");
  plan = assignCoverage(plan, "INT_EDT", "chip.cpu");
  const doc: ScanPlanDoc = { version: 1, plan, edtDefaults: defaultEdtDefaults(), wrapper: defaultWrapperOptions() };
  const back = parseScanPlan(serializeScanPlan(doc));
  assert.deepEqual(back.plan.coverage, { "chip.cpu": "INT_EDT" });
  assert.deepEqual(back.plan.families.find((f) => f.id === "occ")!.instances, ["chip.occ_inst"]);
  assert.equal(back.edtDefaults.ext.families.includes("WRAPPER"), true);
});

test("a corrupt or foreign plan degrades to defaults instead of throwing", () => {
  for (const bad of ["", "{", "null", "[]", '{"plan":{"families":[]}}']) {
    const d = parseScanPlan(bad);
    assert.equal(d.plan.families.some((f) => f.kind === "rest"), true);
    // 0 = derive the channel count from the chain count, the way Run Analysis does.
    assert.equal(d.edtDefaults.int.channels, 0);
    assert.equal(d.edtDefaults.int.chainsPerChannel, 150);
  }
});

// ---- rules must be reversible ------------------------------------------------------------
// The defect these pin down: a tag produced by a glob could not be clicked off. Dropping the
// pick list left the rule matching, so the tag came straight back and the family looked stuck.

test("an instance claimed by a RULE can be taken out of the family", () => {
  const plan = setFamilyGlobs(fresh(), "occ", "*.io *.occ_inst");
  assert.equal(familyOfInstance(countFamilies(plan, RC, "chip"))("chip.io")?.family.id, "occ");

  const out = unassignFamily(plan, "occ", "chip.io", RC.counts, "chip");
  assert.deepEqual(out.families.find((f) => f.id === "occ")!.excludes, ["chip.io"]);
  assert.equal(familyOfInstance(countFamilies(out, RC, "chip"))("chip.io"), undefined);
  // its bits go back to the remainder rather than vanishing from the totals
  const c = countFamilies(out, RC, "chip");
  assert.equal(c.find((f) => f.family.id === "occ")!.bits, 40);
  assert.equal(c.find((f) => f.family.kind === "rest")!.bits, 1000 - 60 - 40);
});

test("an inherited tag is removable too, and only the excepted subtree leaves", () => {
  const plan = paintFamily(fresh(), "occ", "chip.cpu");            // 700 bits, alu inside it
  const out = unassignFamily(plan, "occ", "chip.cpu.alu", RC.counts, "chip");
  const at = familyOfInstance(countFamilies(out, RC, "chip"));
  assert.equal(at("chip.cpu")?.family.id, "occ");                  // parent still claimed
  assert.equal(at("chip.cpu.alu"), undefined);                     // the child is not
  assert.equal(countFamilies(out, RC, "chip").find((f) => f.family.id === "occ")!.bits, 700 - 300);
});

test("un-assigning a pick with nothing else claiming it writes no exception", () => {
  const plan = paintFamily(fresh(), "occ", "chip.occ_inst");
  const out = unassignFamily(plan, "occ", "chip.occ_inst", RC.counts, "chip");
  assert.deepEqual(out.families.find((f) => f.id === "occ")!.instances, []);
  assert.deepEqual(out.families.find((f) => f.id === "occ")!.excludes, []);
});

test("clicking an excepted instance back in beats the exception", () => {
  let plan = setFamilyGlobs(fresh(), "occ", "*.io");
  plan = unassignFamily(plan, "occ", "chip.io", RC.counts, "chip");
  plan = paintFamily(plan, "occ", "chip.io");
  assert.deepEqual(plan.families.find((f) => f.id === "occ")!.excludes, []);
  assert.equal(familyOfInstance(countFamilies(plan, RC, "chip"))("chip.io")?.family.id, "occ");
});

test("one rule can be deleted without disturbing the others", () => {
  const plan = removeGlob(setFamilyGlobs(fresh(), "occ", "*.io *.occ_inst"), "occ", "*.io");
  assert.equal(plan.families.find((f) => f.id === "occ")!.globs, "*.occ_inst");
  assert.equal(familyOfInstance(countFamilies(plan, RC, "chip"))("chip.io"), undefined);
});

test("clear all empties a family; exceptions round-trip through the document", () => {
  let plan = setFamilyGlobs(fresh(), "occ", "*.io");
  plan = unassignFamily(plan, "occ", "chip.io", RC.counts, "chip");
  const back = parseScanPlan(serializeScanPlan({ version: 1, plan, edtDefaults: defaultEdtDefaults(), wrapper: defaultWrapperOptions() }));
  assert.deepEqual(back.plan.families.find((f) => f.id === "occ")!.excludes, ["chip.io"]);

  const cleared = clearFamilyAssignments(plan, "occ");
  const f = cleared.families.find((x) => x.id === "occ")!;
  assert.deepEqual([f.globs, f.instances, f.excludes], ["", [], []]);
});

test("a plan written before exceptions existed still loads", () => {
  const old = '{"version":1,"plan":{"families":[{"id":"int","name":"INT_CHAIN","kind":"rest",' +
              '"color":"#98c379","globs":"","instances":[]}],"coverage":{}}}';
  const d = parseScanPlan(old);
  assert.deepEqual(d.plan.families[0].excludes, []);
});

test("wrapper analysis options round-trip and degrade field by field", () => {
  const doc: ScanPlanDoc = {
    version: 1, plan: fresh(), edtDefaults: defaultEdtDefaults(),
    wrapper: { ...defaultWrapperOptions(), levelsThreshold: 64, excludePorts: ["dft_*"] },
  };
  const back = parseScanPlan(serializeScanPlan(doc));
  assert.equal(back.wrapper.levelsThreshold, 64);
  assert.deepEqual(back.wrapper.excludePorts, ["dft_*"]);
  assert.equal(back.wrapper.inputFanoutFlopThreshold, 4);   // untouched field keeps the default

  // a document written before options existed, and one with a garbage field
  assert.deepEqual(parseScanPlan(serializeScanPlan({ ...doc, wrapper: undefined as never })).wrapper,
                   defaultWrapperOptions());
  const partial = JSON.parse(serializeScanPlan(doc));
  partial.wrapper.levelsThreshold = "lots";
  assert.equal(parseScanPlan(JSON.stringify(partial)).wrapper.levelsThreshold, 32);
  assert.deepEqual(parseScanPlan(JSON.stringify(partial)).wrapper.excludePorts, ["dft_*"]);
});

// ---- cached results ------------------------------------------------------------------------
// An analysis that has to be re-run on every launch is one people stop running, so the results
// ride along in the plan document. They are DERIVED data, so a damaged cache must degrade to
// "nothing cached" rather than render half a table.

test("analysis results round-trip with the plan", () => {
  const doc: ScanPlanDoc = {
    version: 1, plan: fresh(), edtDefaults: defaultEdtDefaults(),
    wrapper: defaultWrapperOptions(),
    results: {
      wrapper: { at: "2026-08-09T10:00:00.000Z",
                 data: { core: "chip", cells: [{ name: "a[0]" }], wrapperCells: 1 } as never },
      budget: { at: "2026-08-09T10:01:00.000Z",
                data: { core: "chip", edts: [{ name: "INT_EDT" }] } as never },
    },
  };
  const back = parseScanPlan(serializeScanPlan(doc));
  assert.equal(back.results?.wrapper?.at, "2026-08-09T10:00:00.000Z");
  assert.equal(back.results?.wrapper?.data.cells.length, 1);
  assert.equal(back.results?.budget?.data.edts[0].name, "INT_EDT");
});

test("a damaged or absent cache degrades to nothing, never to half a result", () => {
  const base = { version: 1, plan: fresh(), edtDefaults: defaultEdtDefaults(),
                 wrapper: defaultWrapperOptions() };
  // no results at all
  assert.equal(parseScanPlan(serializeScanPlan(base as ScanPlanDoc)).results, undefined);
  // present but the wrong shape: cells must be an array, edts must be an array
  for (const bad of [{ wrapper: { at: "x", data: { core: "chip" } } },
                     { wrapper: { at: "x", data: "nope" } },
                     { budget: { at: "x", data: { edts: 3 } } },
                     { wrapper: "nope" }]) {
    const d = parseScanPlan(JSON.stringify({ ...base, results: bad }));
    assert.equal(d.results?.wrapper ?? d.results?.budget, undefined);
    // and the rest of the document still loads
    assert.equal(d.plan.families.some((f) => f.kind === "rest"), true);
  }
});

// ---- the EDT-to-family relationship ---------------------------------------------------------
// It is per CONTROLLER, because that is how it is decided: the EXT controller takes WRAPPER,
// the INT one takes the core, and both may take OCC. One set per int/ext kind cannot express
// "this INT EDT carries OCC and that one does not".

test("a controller with no families set falls back to its kind's default", () => {
  const d = defaultEdtDefaults();
  assert.deepEqual(familiesForEdt(fresh(), d, "int_edt", false), d.int.families);
  assert.deepEqual(familiesForEdt(fresh(), d, "ext_edt", true), d.ext.families);
});

test("a per-controller set overrides the default, and can be cleared back to it", () => {
  const d = defaultEdtDefaults();
  let plan = setEdtFamilies(fresh(), "int_edt", ["INT_CHAIN"]);
  assert.deepEqual(familiesForEdt(plan, d, "int_edt", false), ["INT_CHAIN"]);
  // its sibling is untouched
  assert.deepEqual(familiesForEdt(plan, d, "int_edt2", false), d.int.families);

  plan = setEdtFamilies(plan, "int_edt", null);
  assert.deepEqual(familiesForEdt(plan, d, "int_edt", false), d.int.families);
  assert.equal(plan.edtFamilies?.["int_edt"], undefined);
});

test("an EMPTY set is a real choice, not a fallback to the default", () => {
  const d = defaultEdtDefaults();
  const plan = setEdtFamilies(fresh(), "ext_edt", []);
  assert.deepEqual(familiesForEdt(plan, d, "ext_edt", true), []);
});

test("per-controller families round-trip through the document", () => {
  const plan = setEdtFamilies(fresh(), "ext_edt", ["WRAPPER", "OCC_CHAIN"]);
  const back = parseScanPlan(serializeScanPlan({
    version: 1, plan, edtDefaults: defaultEdtDefaults(), wrapper: defaultWrapperOptions(),
  }));
  assert.deepEqual(back.plan.edtFamilies?.["ext_edt"], ["WRAPPER", "OCC_CHAIN"]);
});

test("sizing is per controller, seeded from the int/ext value", () => {
  const d = defaultEdtDefaults();
  assert.equal(sizingForEdt(fresh(), d, "int_edt", false).targetChainLength, d.int.targetChainLength);
  assert.equal(sizingForEdt(fresh(), d, "ext_edt", true).targetChainLength, d.ext.targetChainLength);

  let plan = setEdtSizing(fresh(), "int_edt", { targetChainLength: 200 });
  assert.equal(sizingForEdt(plan, d, "int_edt", false).targetChainLength, 200);
  // the untouched fields keep the seed, and a sibling is unaffected
  assert.equal(sizingForEdt(plan, d, "int_edt", false).chainsPerChannel, d.int.chainsPerChannel);
  assert.equal(sizingForEdt(plan, d, "int_edt2", false).targetChainLength, d.int.targetChainLength);

  plan = setEdtSizing(plan, "int_edt", { channels: 4 });
  const both = sizingForEdt(plan, d, "int_edt", false);
  assert.equal(both.targetChainLength, 200, "a second patch must not wipe the first");
  assert.equal(both.channels, 4);

  const back = parseScanPlan(serializeScanPlan({
    version: 1, plan, edtDefaults: d, wrapper: defaultWrapperOptions() }));
  assert.deepEqual(back.plan.edtSizing?.["int_edt"], { targetChainLength: 200, channels: 4 });
});

test("family Tcl options: set / blank-not-emitted / remove, and the doc round-trip", () => {
  let plan = setFamilyOption(fresh(), "occ", "si_timing", "leading_edge");
  plan = setFamilyOption(plan, "occ", "chain_length", "");   // just added, not typed yet
  assert.deepEqual(plan.families.find((f) => f.id === "occ")?.tclOptions,
    { si_timing: "leading_edge", chain_length: "" });

  const opts = familyTclOptions(plan);
  assert.deepEqual(opts.OCC_CHAIN, { si_timing: "leading_edge" }, "a blank switch is not a Tcl argument");

  plan = setFamilyOption(plan, "occ", "si_timing", null);
  plan = setFamilyOption(plan, "occ", "chain_length", null);
  assert.equal(plan.families.find((f) => f.id === "occ")?.tclOptions, undefined);

  plan = setFamilyOption(fresh(), "occ", "mutable", "off");
  const back = parseScanPlan(serializeScanPlan({
    version: 1, plan, edtDefaults: defaultEdtDefaults(), wrapper: defaultWrapperOptions() }));
  assert.deepEqual(back.plan.families.find((f) => f.id === "occ")?.tclOptions, { mutable: "off" });
});

test("familyTclOptions: engine names for wrapper/rest, custom family carries its membership", () => {
  let plan = fresh();
  const wrapper = plan.families.find((f) => f.kind === "wrapper")!;
  const rest = plan.families.find((f) => f.kind === "rest")!;
  plan = setFamilyOption(plan, wrapper.id, "si_pipelining", "all_chains");
  plan = setFamilyOption(plan, rest.id, "chain_length", "300");

  plan = addFamily(plan, "DSP_CHAIN");
  const dsp = plan.families.find((f) => f.name === "DSP_CHAIN")!;
  plan = setFamilyGlobs(plan, dsp.id, "*dsp*");
  plan = setFamilyOption(plan, dsp.id, "single_clock_domain_chains", "on");

  const opts = familyTclOptions(plan);
  assert.deepEqual(opts.WRAPPER_CHAIN, { si_pipelining: "all_chains" });   // NOT "WRAPPER"
  assert.deepEqual(opts.INT_CHAIN, { chain_length: "300" });               // NOT "INT_CHAIN1"
  // the custom family's rules become its include_elements, since nothing derives one for it
  assert.deepEqual(opts.DSP_CHAIN, {
    single_clock_domain_chains: "on",
    include_elements: "[get_cells {*dsp*}]",
  });
  // an explicit include_elements is the user's and is left alone
  plan = setFamilyOption(plan, dsp.id, "include_elements", "[get_scan_elements -filter x]");
  assert.equal(familyTclOptions(plan).DSP_CHAIN.include_elements, "[get_scan_elements -filter x]");
});

test("FAMILY_TCL_OPTIONS covers the manual's full switch list", () => {
  assert.equal(FAMILY_TCL_OPTIONS.length, 33);
  assert.equal(new Set(FAMILY_TCL_OPTIONS.map((o) => o.name)).size, 33);
});
