import test from "node:test";
import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import { confirmation, feedback, rebound } from "./assertions.mjs";
import { modelPremise } from "./public-model.mjs";
import { pointerInit } from "./input.mjs";
import { publicEntry } from "../../independent-electron-renderer/public-entry.mjs";
test("B37 six explicit original-input cases", () => {
  assert.equal(cases.length, 6);
  assert.equal(new Set(cases.map((c) => c.id)).size, 6);
  for (const c of cases)
    assert(
      c.detail &&
        c.basis &&
        c.input &&
        c.expected.confirm === (c.id <= "B37-P03" ? 0 : 1),
    );
});
function receipt(stale = true) {
  const n = {},
    s = {},
    old = {},
    latest = {},
    error = Object.assign(Error("original stale"), { code: "stale_action" }),
    records = [
      {
        name: "confirmCandidate",
        receiver: n,
        args: [old, s],
        status: stale ? "thrown" : "returned",
        ...(stale ? { error } : {}),
      },
    ],
    failures = stale
      ? [Object.freeze({ command: "confirm", action: old, error })]
      : [];
  return { n, s, old, latest, error, records, failures, stale };
}
function valid(c) {
  const error = confirmation(c.records, c.n, c.s, c.old, c.stale);
  feedback(c.failures, c.old, error, c.stale);
}
for (const stale of [true, false])
  test("B37 pure original-action outcome " + stale, () =>
    valid(receipt(stale)),
  );
for (const [name, change] of [
  ["latest action substitution", (c) => (c.records[0].args[0] = c.latest)],
  ["cloned original action", (c) => (c.records[0].args[0] = { ...c.old })],
  ["duplicate confirmation", (c) => c.records.push({ ...c.records[0] })],
  ["wrong Selection", (c) => (c.records[0].args[1] = {})],
  ["swallowed stale error", (c) => (c.records[0].status = "returned")],
  [
    "converted error feedback",
    (c) =>
      (c.failures = [
        Object.freeze({ ...c.failures[0], error: { ...c.error } }),
      ]),
  ],
  [
    "latest action feedback",
    (c) =>
      (c.failures = [Object.freeze({ ...c.failures[0], action: c.latest })]),
  ],
  ["unfrozen failure", (c) => (c.failures = [{ ...c.failures[0] }])],
])
  test("B37 negative rejects " + name, () => {
    const c = receipt();
    change(c);
    assert.throws(() => valid(c));
  });
for (const type of ["mouse", "pen", "touch"])
  test("B37 explicit primary synthetic " + type + " pair", () => {
    for (const event of [
      "pointerdown",
      "pointerup",
      "pointercancel",
      "click",
    ]) {
      const p = pointerInit(event, type);
      assert.equal(p.pointerId, 37);
      assert.equal(p.pointerType, type);
      assert.equal(p.isPrimary, true);
      assert.equal(p.button, 0);
      assert.equal(p.buttons, event === "pointerdown" ? 1 : 0);
      assert(p.bubbles && p.cancelable && p.composed);
    }
  });
const P = process.env.HIER_B_PRODUCT_ROOT;
assert(P, "explicit fixed product");
function batch(mode, retain = false) {
  const n = {},
    pages = mode === "append" ? [{}, {}] : [{}],
    old = [{}, {}],
    current = Array.from({ length: pages.length * 2 }, () => ({})),
    rows =
      mode === "append" && retain
        ? [3, 2]
        : Array.from({ length: pages.length * 2 }, (_, i) => i).reverse(),
    records = rows.map((row) => ({
      name: "createCandidateAction",
      receiver: n,
      status: "returned",
      args: [pages[Math.floor(row / 2)], row % 2],
      value: current[row],
    }));
  return { n, pages, old, current, records, mode };
}
for (const [mode, retain] of [
  ["same-reply", false],
  ["append", true],
  ["append", false],
])
  test("B37 permitted rebind batch " + mode + " retained " + retain, () => {
    const c = batch(mode, retain),
      out = rebound(c.records, c.n, c.pages, c.old, c.mode);
    assert.equal(out.length, c.pages.length * 2);
    assert.equal(out[0], retain ? c.old[0] : c.current[0]);
  });
for (const [name, change] of [
  [
    "old action reused in new generation",
    (c) => (c.records[0].value = c.old[1]),
  ],
  ["duplicate tuple", (c) => c.records.push({ ...c.records[0] })],
  ["cloned page", (c) => (c.records[0].args[0] = { ...c.pages[0] })],
])
  test("B37 batch negative rejects " + name, () => {
    const c = batch("same-reply");
    change(c);
    assert.throws(() => rebound(c.records, c.n, c.pages, c.old, c.mode));
  });
const { HierClient } = await import(publicEntry(P, "@hier/client")),
  { SourceNavigationModel, SelectionModel } = await import(
    publicEntry(P, "@hier/viewmodel")
  );
test("B37 removed-row assertion rejects an actual confirmation", () => {
  const c = receipt(false);
  assert.throws(() => confirmation(c.records, c.n, c.s, c.old, false, 0));
});
for (const mode of ["same-old", "same-current", "append-old", "reload-removed"])
  test("B37 actual model premise " + mode, async () => {
    assert.equal(
      (
        await modelPremise(
          { HierClient, SourceNavigationModel, SelectionModel },
          mode,
        )
      ).pass,
      true,
    );
  });
