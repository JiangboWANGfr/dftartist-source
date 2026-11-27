import assert from "node:assert/strict";
import { top, escapedPath } from "./fixtures.mjs";
export const cases = [];
const add = (id, input, expected, section, run) =>
  cases.push({ id, input, expected, basis: "DESIGN §6.27." + section, run });
export function failure(r, code) {
  assert.equal(r.ok, false);
  assert.equal(r.error.origin, "demo");
  if (code) assert.equal(r.error.code, code);
  assert(
    ["bad_request", "busy", "stale_choice", "host_failure", "ipc_unavailable"].includes(
      r.error.code,
    ),
  );
  assert.equal(typeof r.error.message, "string");
  assert(!Object.hasOwn(r.error, "stack"));
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
}
export function success(r) {
  assert.equal(r.ok, true);
  return r.value;
}
add(
  "DC01-surface",
  { realm: "actual sandbox preload" },
  "only four demo/six transport members; no Node globals",
  1,
  async (c) => {
    const x = await c.evaluate(
      "({demo:Object.keys(window.hierDemo).sort(),transport:Object.keys(window.hierBridge).sort(),node:typeof window.process,require:typeof window.require})",
    );
    assert.deepEqual(x.demo, ["closeDesign", "openDesign", "pickDesign", "version"]);
    assert.deepEqual(x.transport, ["close", "connect", "release", "send", "start", "version"]);
    assert.equal(x.node, "undefined");
    assert.equal(x.require, "undefined");
    c.safePreferences();
  },
);
add(
  "DC02-invalid-options",
  {
    options: [
      {},
      null,
      { kind: "project" },
      { kind: "source", top: "" },
      { kind: "source", top: "a" + String.fromCharCode(0) + "b" },
      { kind: "source", top: "a" + String.fromCharCode(13) + "b" },
      { kind: "source", top: "a" + String.fromCharCode(10) + "b" },
    ],
  },
  "bad_request before native picker",
  1,
  async (c) => {
    for (const options of cases.find((x) => x.id === "DC02-invalid-options").input.options)
      failure(await c.bridge("pickDesign", [options]), "bad_request");
    assert.equal(c.nativeCalls.length, 0);
  },
);
add(
  "DC03-native-cancel",
  { native: "cancel" },
  "ok null, no session, no invented token",
  1,
  async (c) => {
    c.offer(null);
    assert.equal(success(await c.bridge("pickDesign", [{ kind: "source" }])), null);
    failure(await c.bridge("openDesign", ["not-issued"]), "stale_choice");
  },
);
add(
  "DC04-native-error",
  { native: "throws B73 picker failure" },
  "host_failure safe DTO, no synthetic success",
  1,
  async (c) => {
    c.offer(new Error("B73 picker failure"));
    failure(await c.bridge("pickDesign", [{ kind: "source" }]), "host_failure");
  },
);
add(
  "DC05-replaced-token",
  { picks: ["source", "source"] },
  "new opaque token; first token stale before any close",
  1,
  async (c) => {
    const a = await c.pick("source"),
      b = await c.pick("source");
    assert.notEqual(a.token, b.token);
    failure(await c.bridge("openDesign", [a.token]), "stale_choice");
    const s = success(await c.bridge("openDesign", [b.token]));
    await c.close(s.sessionId);
  },
);
add(
  "DC06-cancel-no-revival",
  { pick: "source", then: "cancel" },
  "cancel invalidates previous unconsumed token",
  1,
  async (c) => {
    const a = await c.pick("source");
    c.offer(null);
    assert.equal(success(await c.bridge("pickDesign", [{ kind: "source" }])), null);
    failure(await c.bridge("openDesign", [a.token]), "stale_choice");
  },
);
add(
  "DC07-token-once",
  { token: "same valid token twice" },
  "open returns only sessionId/label; replay stale without closing active",
  1,
  async (c) => {
    const a = await c.pick("source"),
      s = success(await c.bridge("openDesign", [a.token]));
    assert.equal(typeof s.sessionId, "string");
    assert.equal(typeof s.label, "string");
    assert(!Object.hasOwn(s, "snapshotId"));
    failure(await c.bridge("openDesign", [a.token]), "stale_choice");
    await c.roundtrip();
    await c.close(s.sessionId);
  },
);
add(
  "DC08-invalid-open-preserves-current",
  { open: "unissued token while active" },
  "stale_choice, current id still closes normally",
  1,
  async (c) => {
    const s = success(await c.bridge("openDesign", [(await c.pick("source")).token]));
    failure(await c.bridge("openDesign", ["unissued"]), "stale_choice");
    await c.roundtrip();
    await c.close(s.sessionId);
  },
);
add(
  "DC09-busy-not-queued",
  { hold: "native picker", concurrent: ["pick", "open", "close"] },
  "busy for concurrent controls; exactly one native call",
  1,
  async (c) => {
    const gate = c.offerHeld(c.files.source),
      pending = c.bridge("pickDesign", [{ kind: "source", top }]);
    await gate.entered;
    failure(await c.bridge("pickDesign", [{ kind: "filelist" }]), "busy");
    failure(await c.bridge("openDesign", ["B"]), "busy");
    failure(await c.bridge("closeDesign", ["B"]), "busy");
    assert.equal(c.nativeCalls.length, 1);
    gate.release();
    assert.equal(typeof success(await pending).token, "string");
  },
);
add(
  "DC10-close-and-old-id",
  { flow: "open A; close A twice; open B; close A" },
  "terminal id idempotent; old id cannot close B",
  1,
  async (c) => {
    const a = success(await c.bridge("openDesign", [(await c.pick("source")).token]));
    await c.close(a.sessionId);
    await c.close(a.sessionId);
    const b = success(await c.bridge("openDesign", [(await c.pick("source")).token]));
    assert.notEqual(a.sessionId, b.sessionId);
    const old = await c.bridge("closeDesign", [a.sessionId]);
    if (!old.ok) failure(old);
    await c.roundtrip();
    await c.close(b.sessionId);
  },
);
add(
  "DC11-foreign-window",
  { sender: "second actual window, same page/preload" },
  "generic bad_request and no native picker call",
  1,
  async (c) => {
    for (const method of ["pickDesign", "openDesign", "closeDesign"]) {
      const args = method === "pickDesign" ? [{ kind: "source" }] : ["foreign"];
      failure(await c.foreign(method, args), "bad_request");
    }
    assert.equal(c.nativeCalls.length, 0);
  },
);
add(
  "DC12-document-invalidates-picker",
  { hold: "picker", action: "reload approved local page" },
  "old completion grants no reusable token/current authority",
  1,
  async (c) => {
    const gate = c.offerHeld(c.files.source),
      pending = c.bridge("pickDesign", [{ kind: "source", top }]);
    let old,
      settled = false;
    pending.then(
      (reply) => {
        old = reply;
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await gate.entered;
    await c.reload();
    gate.release();
    await c.evaluate("typeof window.hierDemo"); // Actual new document, not the old reply.
    assert.equal(c.nativeCalls.length, 1);
    if (!settled) {
      const e = new Error(
        "Reload destroyed the old executeJavaScript reply context; pending picker token is not observable through the allowed public surface",
      );
      e.bindingBlocked = true;
      throw e;
    }
    if (old?.ok && old.value) failure(await c.bridge("openDesign", [old.value.token]));
    else if (old) failure(old);
    assert.equal(c.nativeCalls.length, 1);
  },
);
add(
  "DC13-navigation-window-block",
  { attempt: ["data external navigation", "window.open"] },
  "approved URL retained, no new window or capabilities",
  1,
  (c) => c.externalBlocked(),
);
add(
  "DU01-initial-roots",
  { open: "source", selection: "none" },
  "roots only, no automatic first selection or single-target data",
  3,
  async (c) => {
    await c.openUI();
    await c.ui("initial");
  },
);
add(
  "DU02-close-reopen",
  { flow: "open; select root; close; reopen" },
  "old panels cleared; new ready has empty selection",
  2,
  async (c) => {
    await c.openUI();
    await c.click("tree", top);
    await c.ui("property", top);
    await c.closeUI();
    await c.openUI();
    await c.ui("initial");
  },
);
add(
  "DU03-relative-filelist",
  { kind: "filelist", content: "../rtl/design.sv" },
  "-F resolves from filelist; real roots/children u0,u1",
  1,
  async (c) => {
    await c.openUI("filelist");
    await c.expand(top);
    await c.ui("treeContains", ["u0", "u1"]);
  },
);
add(
  "DU04-picker-cancel-preserves",
  { while: "selected root and source", native: "held then cancel" },
  "old panels readable; controls disabled; cancellation preserves source/selection",
  2,
  async (c) => {
    await c.openUI();
    await c.click("tree", top);
    await c.ui("property", top);
    await c.ui("source", "module B_demo_top");
    const before = await c.ui("singleTargetState"),
      gate = c.offerHeld(null);
    await c.beginOpenUI();
    await gate.entered;
    await c.ui("openCloseDisabled");
    gate.release();
    await c.ui("cancelled");
    assert.deepEqual(await c.ui("singleTargetState"), before);
  },
);
add(
  "DU05-compile-failure-retry",
  { first: "broken.sv", second: "design.sv" },
  "visible original failure, released partial session; new selection succeeds",
  2,
  async (c) => {
    await c.openUI("source", "broken", false);
    await c.ui("failure");
    await c.openUI();
    await c.ui("initial");
  },
);
add(
  "DU06-tree-and-signal",
  { tree: top, path: escapedPath },
  "object owner properties/source; signal connections local; selection explicit",
  3,
  async (c) => {
    await c.openUI();
    await c.click("tree", top);
    await c.ui("property", top);
    await c.ui("source", "module B_demo_top");
    await c.submit("path", escapedPath);
    await c.ui("pathContains", "odd.name");
    await c.choose("path", "odd.name");
    await c.ui("connections", "odd.name");
  },
);
add(
  "DU07-definition-occurrences",
  { search: "B_demo_leaf", choose: "definition then u1" },
  "definition remains selected; both u0/u1 shown; only explicit occurrence selects instance",
  3,
  async (c) => {
    await c.openUI();
    await c.submit("search", "B_demo_leaf");
    await c.choose("search", "B_demo_leaf", "选择定义");
    await c.ui("instances", ["u0", "u1"]);
    await c.ui("noProperties");
    await c.choose("instances", "u1");
    await c.ui("property", "u1");
  },
);
add(
  "DU08-path-original-text",
  { text: escapedPath },
  "preserve escaped terminator/tab; no automatic result selection",
  3,
  async (c) => {
    await c.openUI();
    await c.submit("path", escapedPath);
    await c.ui("pathContains", "odd.name");
    await c.ui("inputEquals", { kind: "path", value: escapedPath });
    await c.ui("noProperties");
  },
);
add(
  "DU09-source-origin-preserve",
  { source: "leaf sum declaration", confirm: "second occurrence" },
  "confirmation updates properties but preserves source document/position/candidates",
  3,
  async (c) => {
    await c.openUI();
    await c.expand(top);
    await c.click("tree", "u0");
    await c.ui("property", "u0");
    await c.ui("source", "sum");
    await c.locate("sum");
    await c.ui("candidates", 2);
    const before = await c.ui("sourceState");
    await c.choose("candidates", "u1");
    await c.ui("property", "u1");
    assert.deepEqual(await c.ui("sourceState"), before);
  },
);
add(
  "DU10-latest-selection",
  { sameTurn: ["u0", "u1"] },
  "old async obj/source continuations do not overwrite new target",
  3,
  async (c) => {
    await c.openUI();
    await c.expand(top);
    await c.ui("selectSameTurn", ["u0", "u1"]);
    await c.ui("property", "u1");
    await c.ui("notProperty", "u0");
  },
);
add(
  "DU11-layout-focus-build",
  { panels: "eight named regions/tabs", focus: "search input" },
  "positive viewport heights, no remote CSP script, shared selection does not steal external focus",
  4,
  async (c) => {
    await c.openUI();
    await c.ui("layout");
    await c.prepareExternalSelection(top);
    await c.ui("focusInput", "search");
    await c.ui("activateExternalPath");
    await c.ui("property", top);
    await c.ui("focusRemains", "search");
  },
);
add(
  "DU12-source-kind-error",
  { object: top, kind: "instantiation", then: "definition" },
  "root has no instantiation: original not_found shown, no definition fallback; explicit switch restores",
  3,
  async (c) => {
    await c.openUI();
    await c.click("tree", top);
    await c.ui("property", top);
    await c.ui("source", "module B_demo_top");
    await c.ui("sourceKind", "instantiation");
    await c.ui("sourceFailure", "not_found");
    await c.ui("sourceKind", "definition");
    await c.ui("source", "module B_demo_top");
  },
);
// Minimal regression for real production defect C-103; original 25 stay separate.
export const regressions = [
  {
    id: "DR01-C103-explicit-current-definition",
    input: {
      source: top + " definition",
      confirm: "B_demo_leaf definition from source",
      next: "explicitly load current definition with same SourceKind",
    },
    expected:
      "confirmation preserves original document/position/candidates; a reachable user action then loads the current definition, not the retained old target",
    basis: "DESIGN §6.27.3; real production defect C-103",
    async run(c) {
      await c.openUI();
      await c.click("tree", top);
      await c.ui("property", top);
      await c.ui("source", "module B_demo_top");
      await c.locate("B_demo_leaf");
      await c.ui("candidates", 1);
      const retained = await c.ui("sourceState");
      assert(
        retained.marks.some((x) => x.includes("module B_demo_top")),
        "original source highlights top, not the newly chosen leaf",
      );
      await c.choose("candidates", "definition");
      await c.ui("instances", ["u0", "u1"]);
      await c.ui("noProperties");
      assert.deepEqual(await c.ui("sourceState"), retained);
      const action = await c.ui("explicitKindAction", "definition");
      if (action) c.point(action);
      await c.ui("sourceHighlight", "module B_demo_leaf");
    },
  },
];
export const deferred = [
  {
    id: "DQ01-connect-cancel",
    input: "sessionId acquired, real Core ready still pending, cancel UI",
    expected: "dispose partial SDK/Transport, close known id, no late mount",
    basis: "DESIGN §6.27.2",
    reason: "Only picker injection allowed; no approved deterministic real-Core ready hold",
  },
  {
    id: "DQ02-exit-pending-rejected-retry",
    input: "old exited pending then rejects; try replacing, then new pick",
    expected:
      "no overlapping new process; failure visible; settled rejection releases record and permits retry",
    basis: "DESIGN §6.27.2",
    reason: "No approved real-process exit fault/settlement control; do not fake exited",
  },
  {
    id: "DQ03-window-app-exit-await",
    input: "window/app quit while owned exited genuinely pending",
    expected: "retain application until cleanup settles; original diagnostic preserved",
    basis: "DESIGN §6.27.2",
    reason:
      "No approved deterministic pending-exit input; final normal close is exercised separately",
  },
  {
    id: "DQ04-external-selection",
    input: "empty/multiple/bits+side on bound shared SelectionModel",
    expected: "clear single-target panels; preserve original bits/side and source-origin rules",
    basis: "DESIGN §6.27.3",
    reason:
      "Current demo bridge/readonly UI exposes no external Selection handle or multi-select editor; no invented private hook",
  },
];
