import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { cases as wire } from "./wire-cases.mjs";
import { cases as sdk } from "./sdk-cases.mjs";
import { cases as core, fixture, point } from "./core-fixture.mjs";
assert.equal(wire.length, 208);
assert.equal(wire.filter((c) => c.legacyExpected !== null).length, 191);
assert.equal(sdk.length, 23);
assert.equal(core.length, 24);
for (const rows of [wire, sdk, core]) {
  assert.equal(new Set(rows.map((c) => c.id)).size, rows.length);
  for (const c of rows)
    for (const k of ["id", "input", "expected", "basis"])
      assert.ok(Object.hasOwn(c, k), c.id + ":" + k);
}
const types = await fs.readFile(new URL("./types.ts", import.meta.url), "utf8");
const typeIds = [...types.matchAll(/@ts-expect-error\s+(RK\d+)/g)].map(
  (m) => m[1],
);
assert.equal(typeIds.length, 40);
assert.equal(new Set(typeIds).size, 40);
for (const macro of [false, true]) {
  const f = fixture(macro);
  assert.ok(
    f.leaf.includes("\r\n") && f.top.includes('`include "b_rk_leaf.svh"'),
  );
  for (const marker of [
    "module b_rk_leaf",
    "input logic d",
    "wire stage",
    f.assign,
    "q <= stage",
  ])
    assert.ok(point(f.leaf, marker).offset >= 0);
}
console.log(
  JSON.stringify(
    {
      kind: "B26 frozen input inventory NOT product acceptance",
      wire,
      sdk,
      core,
      typeIds,
      native: {
        serialization: 7,
        legacySubset: 2,
        coreApi: 24,
        configurations: ["Debug", "Release", "ASan-UBSan"],
      },
    },
    null,
    2,
  ),
);
