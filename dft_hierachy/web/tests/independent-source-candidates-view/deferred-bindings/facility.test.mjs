import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cases } from "./cases.mjs";
import { quiet, bindings } from "./assertions.mjs";
import { modelControl, names } from "./public-model.mjs";
test("B40 six unique input/expected/basis records", () => {
  assert.equal(cases.length, 6);
  assert.equal(new Set(cases.map((c) => c.id)).size, 6);
  for (const c of cases) {
    assert(c.input);
    assert(c.expected);
    assert.match(c.basis, /^DESIGN/);
  }
});
test("B40 quiet accepts zero operations", () => quiet([]));
for (const name of names)
  test("B40 quiet rejects " + name, () =>
    assert.throws(() => quiet([{ name }])),
  );
function rows() {
  const n = {},
    p = {},
    actions = [{}, {}];
  return {
    n,
    p,
    records: actions.map((value, i) => ({
      name: "createCandidateAction",
      receiver: n,
      args: [p, i],
      status: "returned",
      value,
    })),
  };
}
test("B40 binding accepts original receiver/page/two distinct indices", () => {
  const x = rows();
  assert.equal(bindings(x.records, x.n, x.p).length, 2);
});
for (const [name, mutate] of [
  [
    "wrong-page",
    (x) => {
      x.records[0].args[0] = {};
    },
  ],
  [
    "duplicate-index",
    (x) => {
      x.records[1].args[1] = 0;
    },
  ],
  [
    "throw",
    (x) => {
      x.records[0].status = "thrown";
    },
  ],
  [
    "wrong-receiver",
    (x) => {
      x.records[0].receiver = {};
    },
  ],
])
  test("B40 binding rejects " + name, () => {
    const x = rows();
    mutate(x);
    assert.throws(() => bindings(x.records, x.n, x.p));
  });
for (const mode of ["ready", "reload"])
  test("B40 real SDK/model premise " + mode, async () => {
    const P = process.env.HIER_B_PRODUCT_ROOT;
    assert(P && path.isAbsolute(P), "explicit fixed product root");
    const client = await import(
        pathToFileURL(P + "/web/packages/client/dist/index.js")
      ),
      model = await import(
        pathToFileURL(P + "/web/packages/viewmodel/dist/index.js")
      );
    assert.equal(
      (await modelControl({ ...client, ...model }, mode)).pass,
      true,
    );
  });
