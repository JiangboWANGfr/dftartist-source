// A integration runner replays B's unchanged handwritten oracle against generated JS.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  METHODS,
  canonicalParams,
  validateDefinition,
} from "../packages/protocol-types/dist/index.js";
import { HierClient } from "../packages/client/dist/index.js";
import { PARAM_DESCRIPTORS } from "../packages/protocol-types/dist/registry.generated.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const result = spawnSync(
  process.env.HIER_SCHEMA_PYTHON ?? "python3",
  ["core/tests/m4/test_schema_contract.py"],
  { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);
if (result.error || result.status !== 0) {
  console.error(result.error ?? result.stderr ?? result.stdout);
  process.exit(1);
}
const corpus = JSON.parse(result.stdout);
const rows = corpus.cases.map((row) => {
  let actual, expected;
  if (row.definition) {
    const name =
      typeof row.definition === "string" ? row.definition : row.definition.$ref.split("/").at(-1);
    actual = validateDefinition(name, row.input);
    expected = row.expectedAccept;
  } else {
    expected = row.expected;
    if (row.name === "method-set") actual = Object.keys(METHODS).sort();
    else if (row.name === "method-count") actual = Object.keys(METHODS).length;
    else if (row.name.endsWith(".default"))
      actual = PARAM_DESCRIPTORS[row.name.slice(0, -8)].default;
    else {
      const suffix = row.name.slice(row.name.lastIndexOf(".") + 1);
      const field = {
        "client-name": "clientMethod",
        "partial-rule": "allowsPartial",
        "cache-rule": "cacheComplete",
      }[suffix];
      if (!field) throw new Error(`Unmapped independent case: ${row.name}`);
      actual = METHODS[row.name.slice(0, -(suffix.length + 1))][field];
    }
  }
  return { name: row.name, passed: isDeepStrictEqual(actual, expected), actual, expected };
});
const failed = rows.filter((r) => !r.passed);
const normalization = [];
for (const row of corpus.cases.filter((r) => r.expectedAccept && r.definition)) {
  const name =
    typeof row.definition === "string" ? row.definition : row.definition.$ref.split("/").at(-1);
  const method = Object.keys(METHODS).find((m) => METHODS[m].params === name);
  if (!method) continue;
  const input = structuredClone(row.input),
    normalized = canonicalParams(method, input);
  normalization.push({
    name: row.name,
    passed:
      validateDefinition(name, normalized) &&
      isDeepStrictEqual(normalized, canonicalParams(method, normalized)) &&
      isDeepStrictEqual(input, row.input),
  });
}
const missingMethods = Object.values(METHODS).filter(
  (m) => typeof HierClient.prototype[m.clientMethod] !== "function",
);
const normalizationFailures = normalization.filter((r) => !r.passed);
console.log(
  JSON.stringify(
    {
      schemaSha256: corpus.schemaSha256,
      checks: rows.length,
      structural: corpus.cases.filter((r) => r.definition).length,
      metadata: corpus.cases.filter((r) => !r.definition).length,
      passed: rows.length - failed.length,
      failed: failed.length,
      skipped: 0,
      failures: failed,
      parameterNormalization: { checks: normalization.length, failed: normalizationFailures },
      missingClientMethods: missingMethods,
    },
    null,
    2,
  ),
);
process.exitCode = failed.length || normalizationFailures.length || missingMethods.length ? 1 : 0;
