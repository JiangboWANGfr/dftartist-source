// Publicly documented main-process configuration; source is compiled as a test input.
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createRequire } from "node:module";
const root = process.env.HIER_B_PRODUCT_ROOT;
assert.ok(root);
const require = createRequire(path.join(root, "web/package.json"));
const { build } = require("esbuild");
const bundled = await build({
  entryPoints: [path.join(root, "web/apps/demo/src/resource-limits.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
assert.deepEqual(bundled.warnings, []);
// Export names come from the generated app declaration, not the implementation body.
const { resourceLimitsFromEnvironment: read } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundled.outputFiles[0].contents).toString("base64")
);
const defaults = {
  openTimeoutMillis: 30000,
  cancelTimeoutMillis: 2000,
  maxRssBytes: 4294967296,
};
const vars = {
  openTimeoutMillis: "HIER_CORE_OPEN_TIMEOUT_MS",
  cancelTimeoutMillis: "HIER_CORE_CANCEL_TIMEOUT_MS",
  maxRssBytes: "HIER_CORE_MAX_RSS_BYTES",
};
test("B-M7 D01 confirmed demo defaults", () =>
  assert.deepEqual(read({}), defaults));
for (const [field, env] of Object.entries(vars)) {
  test("B-M7 D02 independent integer override " + field, () =>
    assert.deepEqual(read({ [env]: "1234" }), { ...defaults, [field]: 1234 }),
  );
  test("B-M7 D03 independent off " + field, () => {
    const expected = { ...defaults };
    delete expected[field];
    assert.deepEqual(read({ [env]: "off" }), expected);
  });
  test("B-M7 D04 invalid decimal configuration " + field, () => {
    const max = field === "maxRssBytes" ? Number.MAX_SAFE_INTEGER : 2147483647;
    for (const text of [
      "0",
      "-1",
      "1.5",
      "Infinity",
      "1e3",
      "0x10",
      " off",
      "OFF",
      "",
      String(max + 1),
    ])
      assert.throws(() => read({ [env]: text }), text);
    assert.equal(read({ [env]: String(max) })[field], max);
  });
}
test("B-M7 D05 all off preserves unbudgeted demo policy", () =>
  assert.deepEqual(
    read(Object.fromEntries(Object.values(vars).map((v) => [v, "off"]))),
    {},
  ));
