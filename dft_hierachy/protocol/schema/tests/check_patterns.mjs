// A's regex parity checks; this does not implement or validate the full TS schema.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schemaPath = process.argv[2] ?? new URL("../hier.schema.json", import.meta.url);
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const cases = JSON.parse(readFileSync(new URL("./pattern_cases.json", import.meta.url), "utf8"));
const names = Object.entries(schema.$defs).filter(([, def]) => "pattern" in def).map(([name]) => name);
assert.deepEqual(Object.keys(cases).sort(), names.sort());
let checks = 0;
let failures = 0;
for (const [name, examples] of Object.entries(cases)) {
  const expression = new RegExp(schema.$defs[name].pattern);
  for (const [expectation, values] of Object.entries(examples)) {
    for (const value of values) {
      checks += 1;
      const accepted = expression.test(value);
      if (accepted !== (expectation === "valid")) {
        failures += 1;
        console.error(`${name}: ${JSON.stringify(value)}: expected ${expectation}, accepted=${accepted}`);
      }
    }
  }
}
console.log(`Pattern checks: ${checks}; failures: ${failures}; definitions: ${names.length}; full TS validators: 0`);
process.exitCode = failures === 0 ? 0 : 1;
