// B structural gate. SourceHit semantics/identity and SDK failure lifecycle are
// owned by other independent gates, not inferred from these JSON validators.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { cases } from "./wire-cases.mjs";
assert.equal(cases.length, 208);
assert.equal(new Set(cases.map((c) => c.id)).size, 208);
assert.ok(cases.every((c) => typeof c.expected === "boolean" && c.basis));
if (process.argv.includes("--list")) {
  console.log(
    JSON.stringify(
      {
        kind: "B SourceRefKind literal wire inventory",
        count: cases.length,
        cases,
      },
      null,
      2,
    ),
  );
} else {
  const mode = process.argv[2];
  assert.ok(["proposal", "production"].includes(mode), "explicit schema mode");
  assert.equal(process.argv.length, 3, "only an explicit mode is accepted");
  const product = process.env.HIER_B_PRODUCT_ROOT,
    tools = process.env.HIER_B_BROWSER_TOOLS;
  assert.ok(product && tools, "explicit product and readonly tools");
  const readSchema = (root) => {
    const file = path.join(root, "protocol/schema/hier.schema.json");
    const bytes = fs.readFileSync(file);
    return {
      file,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      schema: JSON.parse(bytes),
    };
  };
  const current = readSchema(product);
  const hasNewField = (schema) =>
    Boolean(
      schema.$defs.SourceRefKind || schema.$defs.SourceHit?.properties?.refKind,
    );
  const legacyRoot =
    process.env.HIER_B_LEGACY_PRODUCT_ROOT ??
    (!hasNewField(current.schema) ? product : undefined);
  const report = {
    kind: "B SourceRefKind structural gate",
    mode,
    product,
    tools,
    proposalFacilityOnly: mode === "proposal",
    plannedInputs: cases.length,
    schema: {
      file: current.file,
      bytes: current.bytes,
      sha256: current.sha256,
    },
    legacyRoot: legacyRoot ?? null,
    capability: [],
    lanes: {},
    exitCode: 1,
    scope:
      mode === "proposal"
        ? "in-memory proposal facility + old generated-validator compatibility; NOT new production acceptance"
        : "authoritative production JSON schema + generated JS validator; NOT SDK/Core identity acceptance",
  };
  try {
    assert.ok(
      legacyRoot,
      "explicit unchanged legacy root is required once production supports the new field",
    );
    const legacy = readSchema(legacyRoot);
    assert.equal(
      hasNewField(legacy.schema),
      false,
      "legacy compatibility needs the real old schema, never the current new one",
    );
    report.legacySchema = {
      file: legacy.file,
      bytes: legacy.bytes,
      sha256: legacy.sha256,
    };
    const require = createRequire(path.join(tools, "package.json"));
    const Ajv = require("ajv/dist/2020.js").default;
    const addFormats = require("ajv-formats");
    function compiler(schema) {
      const ajv = new Ajv({
        strict: false,
        allErrors: true,
        coerceTypes: false,
        useDefaults: false,
        removeAdditional: false,
      });
      addFormats(ajv);
      ajv.addSchema(schema);
      return (name) => ajv.getSchema(schema.$id + "#/$defs/" + name);
    }
    const schema = structuredClone(
      mode === "proposal" ? legacy.schema : current.schema,
    );
    if (mode === "proposal") {
      schema.$defs.SourceRefKind = {
        type: "string",
        enum: ["definition", "object"],
      };
      schema.$defs.SourceHit.properties.refKind = {
        $ref: "#/$defs/SourceRefKind",
      };
    }
    const capability = [
      [
        "enum-definition",
        schema.$defs.SourceRefKind?.type === "string" &&
          JSON.stringify(
            [...(schema.$defs.SourceRefKind?.enum ?? [])].sort(),
          ) === JSON.stringify(["definition", "object"]),
      ],
      [
        "single-schema-reference",
        schema.$defs.SourceHit.properties.refKind?.$ref ===
          "#/$defs/SourceRefKind",
      ],
      [
        "old-required-fields",
        JSON.stringify([...schema.$defs.SourceHit.required].sort()) ===
          JSON.stringify(["kind", "ref", "span"]),
      ],
      [
        "unknown-extensions",
        schema.$defs.SourceHit.additionalProperties === true,
      ],
      [
        "no-new-default",
        !Object.hasOwn(schema.$defs.SourceRefKind ?? {}, "default") &&
          !Object.hasOwn(
            schema.$defs.SourceHit.properties.refKind ?? {},
            "default",
          ),
      ],
    ];
    report.capability = capability.map(([id, passed]) => ({ id, passed }));
    async function generated(root) {
      const file = path.join(root, "web/packages/protocol-types/dist/index.js");
      const validatorsFile = path.join(
        root,
        "web/packages/protocol-types/dist/validators.generated.js",
      );
      const bytes = fs.readFileSync(validatorsFile);
      const module = await import(pathToFileURL(file).href);
      assert.equal(
        typeof module.validateDefinition,
        "function",
        "public generated validation boundary",
      );
      return {
        validate: module.validateDefinition,
        pin: {
          file: validatorsFile,
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      };
    }
    function lane(name, definitions, checker, inventory, expectedOf) {
      const result = {
        planned: inventory.length,
        executed: 0,
        passed: 0,
        failed: 0,
        blocked: 0,
        skipped: 0,
        results: [],
      };
      for (const c of inventory) {
        const expected = expectedOf(c);
        if (!Object.hasOwn(definitions, c.definition)) {
          result.blocked++;
          result.results.push({
            id: c.id,
            definition: c.definition,
            expected,
            capabilityFailure:
              "definition absent; unknown-name false is not a semantic rejection",
          });
          continue;
        }
        const input = structuredClone(c.input),
          before = JSON.stringify(input);
        result.executed++;
        try {
          const actual = checker(c.definition, input);
          assert.equal(
            typeof actual,
            "boolean",
            "actual structural validator result",
          );
          const unchanged = before === JSON.stringify(input);
          const passed = actual === expected && unchanged;
          result[passed ? "passed" : "failed"]++;
          result.results.push({
            id: c.id,
            definition: c.definition,
            expected,
            actual,
            unchanged,
            passed,
          });
        } catch (error) {
          result.failed++;
          result.results.push({
            id: c.id,
            definition: c.definition,
            expected,
            error: String(error.stack ?? error),
            passed: false,
          });
        }
      }
      report.lanes[name] = result;
    }
    const schemaValidator = compiler(schema);
    lane(
      mode === "proposal" ? "proposalSchema" : "productionSchema",
      schema.$defs,
      (name, input) => schemaValidator(name)(input),
      cases,
      (c) => c.expected,
    );
    if (mode === "production") {
      const production = await generated(product);
      report.productionGeneratedPin = production.pin;
      lane(
        "productionGenerated",
        current.schema.$defs,
        production.validate,
        cases,
        (c) => c.expected,
      );
    }
    const old = await generated(legacyRoot);
    report.legacyGeneratedPin = old.pin;
    const compatible = cases.filter((c) => c.legacyExpected !== null);
    report.legacyNewDefinitionNotApplicable = cases.length - compatible.length;
    assert.equal(
      report.legacyNewDefinitionNotApplicable,
      17,
      "new enum cases never count as old negative passes/skips",
    );
    lane(
      "legacyGeneratedCompatibility",
      legacy.schema.$defs,
      old.validate,
      compatible,
      (c) => c.legacyExpected,
    );
    report.exitCode =
      report.capability.every((c) => c.passed) &&
      Object.values(report.lanes).every(
        (l) => l.failed === 0 && l.blocked === 0,
      )
        ? 0
        : 1;
  } catch (error) {
    report.error = String(error.stack ?? error);
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.exitCode;
}
