// B oracle facility controls only, not product semantics.
import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicExports } from "./identity-epoch.mjs";
const main = () => ({
    CLIENT_PROTOCOL_VERSION: 2,
    HierClient() {},
    HierError() {},
    isHierError() {},
  }),
  node = () => ({ createProcessTransport() {} });
test("reviewed exact four/one accepted", () =>
  assert.doesNotThrow(() => assertPublicExports(main(), node())));
for (const name of [
  "HierClient",
  "HierError",
  "CLIENT_PROTOCOL_VERSION",
  "isHierError",
])
  test("missing " + name + " remains rejected", () => {
    const m = main();
    delete m[name];
    assert.throws(() => assertPublicExports(m, node()));
  });
test("arbitrary extra main export rejected", () =>
  assert.throws(() =>
    assertPublicExports({ ...main(), B_extra: undefined }, node()),
  ));
test("node extra export rejected", () =>
  assert.throws(() =>
    assertPublicExports(main(), { ...node(), B_extra() {} }),
  ));
test("missing node export rejected", () =>
  assert.throws(() => assertPublicExports(main(), {})));
test("wrong protocol rejected", () =>
  assert.throws(() =>
    assertPublicExports({ ...main(), CLIENT_PROTOCOL_VERSION: 3 }, node()),
  ));
test("nonfunction identity rejected", () =>
  assert.throws(() =>
    assertPublicExports({ ...main(), isHierError: true }, node()),
  ));
