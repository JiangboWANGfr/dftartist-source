import assert from "node:assert/strict";
import path from "node:path";
import { publicEntry } from "./public-entry.mjs";
import { instance, snapshot } from "./fixture.mjs";
assert.ok(process.env.HIER_B_PRODUCT_ROOT);
const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT),
  { validateDefinition } = await import(
    publicEntry(product, "@hier/protocol-types")
  );
assert.equal(validateDefinition("SnapshotInfo", snapshot), true);
assert.equal(validateDefinition("InstInfo", instance), true);
assert.equal(
  validateDefinition("InstInfo", { ...instance, childCount: "1" }),
  false,
);
assert.equal(
  validateDefinition("SnapshotInfo", { ...snapshot, schemaVersion: "7" }),
  false,
);
console.log(
  JSON.stringify({
    kind: "B fixture versus authoritative generated Schema only",
    positive: 2,
    negative: 2,
    rendererSemantics: 0,
  }),
);
