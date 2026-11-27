// A isolated schema proposal evidence; never writes the production schema.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  validateDefinition,
  SCHEMA_VERSION,
  PROTOCOL_VERSION,
} from "@hier/protocol-types";

const location = new URL(
  "../../../protocol/schema/hier.schema.json",
  import.meta.url,
);
const original = await readFile(location);
const schema = JSON.parse(original);
const extension = JSON.parse(
  await readFile(new URL("schema-extension.json", import.meta.url)),
);
assert.equal(PROTOCOL_VERSION, 2);
assert.equal(SCHEMA_VERSION, 7);
assert.equal(
  Object.hasOwn(schema.$defs.SourceHit.properties, "refKind"),
  false,
);
assert.equal(Object.hasOwn(schema.$defs, "SourceRefKind"), false);
Object.assign(schema.$defs, extension.$defs);
Object.assign(schema.$defs.SourceHit.properties, extension.sourceHitProperties);
assert.deepEqual(schema.$defs.SourceHit.required, ["ref", "kind", "span"]);
assert.equal(schema.$defs.SourceHit.additionalProperties, true);
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema);
const proposed = ajv.compile({ $ref: schema.$id + "#/$defs/SourceHit" });
const hit = {
  ref: "opaque-address",
  kind: "definition",
  span: {
    file: "opaque-file",
    path: "/fixture.sv",
    contentHash: "a".repeat(64),
    start: { offset: 0, line: 1, column: 1 },
    end: { offset: 1, line: 1, column: 2 },
  },
};
const cases = [
  ["legacy-omitted", hit, true, true],
  ["definition", { ...hit, refKind: "definition" }, true, true],
  ["object-at-definition-range", { ...hit, refKind: "object" }, true, true],
  [
    "object-without-inst",
    { ...hit, kind: "statement", refKind: "object" },
    true,
    true,
  ],
  [
    "opaque-ref-not-parsed",
    { ...hit, ref: "i:looks-like-an-object", refKind: "definition" },
    true,
    true,
  ],
  [
    "inst-is-not-discriminator",
    { ...hit, inst: "opaque-context", refKind: "definition" },
    true,
    true,
  ],
  [
    "unknown-extension",
    { ...hit, refKind: "object", future: { value: 1 } },
    true,
    true,
  ],
  ...[null, false, 0, "", "future", "Definition", [], {}].map((value, i) => [
    `invalid-tag-${i + 1}`,
    { ...hit, refKind: value },
    false,
    true,
  ]),
  ["old-required-ref", { kind: hit.kind, span: hit.span }, false, false],
  ["old-required-span", { ref: hit.ref, kind: hit.kind }, false, false],
  ["old-kind", { ...hit, kind: "object" }, false, false],
  ["old-ref-nonempty", { ...hit, ref: "" }, false, false],
];
const rows = cases.map(([id, value, expected, expectedOld]) => {
  const before = JSON.stringify(value);
  const accepted = Boolean(proposed(value));
  assert.equal(accepted, expected, id);
  const errors = structuredClone(proposed.errors);
  const oldAccepted = validateDefinition("SourceHit", value);
  assert.equal(oldAccepted, expectedOld, id);
  assert.equal(JSON.stringify(value), before, id + " input must not change");
  return { id, accepted, oldAccepted, errors };
});
assert.deepEqual(await readFile(location), original);
console.log(
  JSON.stringify(
    {
      kind: "A isolated SourceHit schema extension compatibility",
      productionSchemaSha256: createHash("sha256")
        .update(original)
        .digest("hex"),
      cases: rows.length,
      rows,
      productionSchemaChanged: false,
      currentValidatorKnowsRefKind: false,
      newSdkOrCoreExecuted: false,
    },
    null,
    2,
  ),
);
