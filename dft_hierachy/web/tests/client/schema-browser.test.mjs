import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { canonicalParams, validateDefinition } from "@hier/protocol-types";

test("A: browser client bundles without Node, Electron or runtime schema compiler", async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../../packages/client/dist/index.js", import.meta.url))],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    metafile: true,
  });
  assert.ok(bundle.outputFiles[0].contents.length > 0);
  for (const input of Object.keys(bundle.metafile.inputs))
    assert.doesNotMatch(input, /(?:\/node\/|node_modules\/(?:ajv|electron))/);
  assert.doesNotMatch(bundle.outputFiles[0].text, /new Function\(|\beval\(/);
});

test("A: schema supplies nested defaults, strips extensions and preserves array order", () => {
  const params = canonicalParams("trace.cone", {
    start: { slice: { ref: "sig", bits: { lsb: 0, width: 1 } } },
    direction: "back",
    policy: "structural",
    ignored: true,
  });
  assert.deepEqual(params.budget, { maxDepth: 64, maxEdges: 4000, maxNodes: 1000 });
  assert.deepEqual(params.start, { slice: { ref: "sig", bits: { lsb: 0, width: 1 } } });
  assert.equal(validateDefinition("TraceConeParams", params), true);
  assert.equal(params.ignored, undefined);
  assert.deepEqual(canonicalParams("inst.signals", { inst: "i" }), {
    cursor: "",
    filter: { text: "" },
    inst: "i",
    limit: 200,
  });
  assert.deepEqual(canonicalParams("search", { text: "a", kinds: ["signal", "instance"] }).kinds, [
    "signal",
    "instance",
  ]);
});

test("A: calendar validation matches UTC millisecond Gregorian contract", () => {
  for (const invalid of [
    "0000-01-01T00:00:00.000Z",
    "2024-12-31T23:59:60.000Z",
    "1900-02-29T00:00:00.000Z",
  ])
    assert.equal(validateDefinition("UtcTimestamp", invalid), false);
  assert.equal(validateDefinition("UtcTimestamp", "2000-02-29T00:00:00.000Z"), true);
});
