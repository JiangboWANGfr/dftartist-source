import assert from "node:assert/strict";
import test from "node:test";
import { BridgeInput, SESSION, closed } from "../fixture.mjs";
import { cases, early, detachBrokenFixture } from "./cases.mjs";
test("B BER inventory is unique and each input has expectation/normative basis", () => {
  assert.equal(cases.length, 40);
  assert.equal(new Set(cases.map((x) => x.id)).size, 40);
  for (const row of cases) {
    assert.ok(row.input && row.expected && row.basis);
    assert.equal(typeof row.run, "function");
  }
});
test("B early Bridge fixture calls back before connect result settlement", async () => {
  const b = new BridgeInput(),
    seen = [];
  early(b, [closed()]);
  const p = b.bridge.connect(() => seen.push("event"));
  seen.push("after-connect-return");
  await p;
  seen.push("result");
  assert.deepEqual(seen, ["event", "after-connect-return", "result"]);
  b.bridge.release(SESSION);
});
test("B broken release fixture compensation is separately reported, never a product release call", async () => {
  const b = new BridgeInput(),
    c = { fixtureFaultDetach: [] };
  await b.bridge.connect(() => {});
  detachBrokenFixture(c, b);
  assert.equal(b.count("release"), 0);
  assert.equal(c.fixtureFaultDetach[0].callbacks, 1);
  assert.equal(b.records[0].active, false);
});
