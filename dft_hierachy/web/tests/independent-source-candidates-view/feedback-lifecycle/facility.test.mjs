import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cases } from "./cases.mjs";
import { confirmations, latestFeedback, noGlobal } from "./assertions.mjs";
import { modelControl } from "./public-model.mjs";
test("B43 three unique input/expected/basis records", () => {
  assert.equal(cases.length, 3);
  assert.equal(new Set(cases.map((c) => c.id)).size, 3);
  for (const c of cases) {
    assert(c.input && c.expected);
    assert.match(c.basis, /^DESIGN/);
  }
});
function receipt() {
  const n = {},
    s = {},
    page = {},
    issued = [{}, {}],
    errors = [{}, {}],
    records = issued.map((value, i) => ({
      name: "createCandidateAction",
      receiver: n,
      args: [page, i],
      status: "returned",
      value,
    }));
  for (let i = 0; i < 2; i++)
    records.push({
      name: "confirmCandidate",
      receiver: n,
      args: [issued[i], s],
      status: "thrown",
      error: errors[i],
    });
  return { n, s, page, issued, errors, records };
}
const check = (c) =>
  confirmations(c.records, c.n, c.s, c.page, [0, 1], c.issued);
test("B43 original two-confirmation record accepts", () => {
  const c = receipt();
  assert.deepEqual(check(c), c.errors);
});
for (const [name, mutate] of [
  [
    "action",
    (c) => {
      c.records[3].args[0] = c.issued[0];
    },
  ],
  [
    "target",
    (c) => {
      c.records[3].args[1] = {};
    },
  ],
  [
    "receiver",
    (c) => {
      c.records[3].receiver = {};
    },
  ],
  [
    "returned",
    (c) => {
      c.records[3].status = "returned";
    },
  ],
  [
    "extra-confirm",
    (c) => {
      c.records.push({ ...c.records[3] });
    },
  ],
  [
    "event-time-re-sign",
    (c) => {
      c.records.push({ ...c.records[0] });
    },
  ],
])
  test("B43 confirmation rejects " + name, () => {
    const c = receipt();
    mutate(c);
    assert.throws(() => check(c));
  });
const action = {},
  error = {},
  other = {};
const f = (a = action, e = error) =>
  Object.freeze({ command: "confirm", action: a, error: e });
test("B43 latest original failure accepts", () =>
  latestFeedback([f()], action, error));
for (const [name, calls] of [
  ["old-action", [f(other)]],
  ["old-error", [f(action, other)]],
  ["two-feedbacks", [f(), f()]],
])
  test("B43 latest feedback rejects " + name, () =>
    assert.throws(() => latestFeedback(calls, action, error)),
  );
test("B43 global quiet accepts both channels empty", () =>
  noGlobal({ errors: [], rejections: [] }));
test("B43 global quiet rejects error despite no rejection", () =>
  assert.throws(() => noGlobal({ errors: [{}], rejections: [] })));
test("B43 global quiet rejects rejection despite no error", () =>
  assert.throws(() => noGlobal({ errors: [], rejections: [{}] })));
test("B43 real consecutive Selection notification premise", async () => {
  const P = process.env.HIER_B_PRODUCT_ROOT;
  assert(P && path.isAbsolute(P));
  const client = await import(
      pathToFileURL(P + "/web/packages/client/dist/index.js")
    ),
    model = await import(
      pathToFileURL(P + "/web/packages/viewmodel/dist/index.js")
    );
  assert.equal((await modelControl({ ...client, ...model })).pass, true);
});
