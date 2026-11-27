// Historical archive/source integrity only. No product execution or C-82 closure.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "../../../.."),
  archive = JSON.parse(
    fs.readFileSync(
      path.join(root, "docs/m5_b_renderer_1087f78_review.json"),
      "utf8",
    ),
  );
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  outputs = new Map();
for (const { name, expectedExit, capture } of archive.commands) {
  assert.equal(outputs.has(name), false, name);
  assert.equal(capture.capture_complete, true, name);
  assert.equal(capture.exit_code, expectedExit, name);
  const bytes = gunzipSync(Buffer.from(capture.stdout_gzip_base64, "base64"));
  assert.equal(bytes.length, capture.stdout_bytes, name);
  assert.equal(sha(bytes), capture.stdout_sha256, name);
  outputs.set(name, bytes.toString("utf8"));
}
for (const pin of [
  ...archive.frozenInputPins,
  ...archive.c82InputPins,
  ...archive.c83InputPins,
]) {
  const b = fs.readFileSync(path.join(root, pin.path));
  assert.equal(b.length, pin.bytes, pin.path);
  assert.equal(sha(b), pin.sha256, pin.path);
}
assert.equal(
  archive.fixedProductSHA,
  "1087f78c19cb4e3400bb4093c575b51144c9c7e6",
);
assert.equal(
  archive.originalFreezeSHA,
  "c99143c5baff94fbe1f41a5c3da77a0b70f475e9",
);
assert.equal(archive.c82FreezeSHA, "d3d69d60233f173bd6f77bda4c368606dc0b00d3");
const runtime = JSON.parse(outputs.get("frozen-renderer-99"));
assert.equal(runtime.executed, 99);
assert.equal(runtime.skipped, 0);
assert.equal(runtime.exitCode, 0);
assert.equal(runtime.results.length, 99);
assert.ok(runtime.results.every((x) => x.pass));
const types = JSON.parse(outputs.get("production-renderer-types-16"));
assert.equal(types.kind, "public-renderer-type-consumer");
assert.deepEqual(types.positive, []);
assert.equal(types.executedNegative, 16);
assert.equal(types.results.length, 16);
assert.ok(
  types.results.every(
    (x) => x.diagnostics.length && x.diagnostics.every((d) => d.code !== 2307),
  ),
);
const browser = JSON.parse(outputs.get("public-browser-module-gate"));
assert.equal(browser.executed, 1);
assert.equal(browser.exitCode, 0);
const c82 = JSON.parse(outputs.get("C82-frozen-25-initial-baseline"));
assert.equal(archive.c83FreezeSHA, "ee7561e9335bc4e1699cf88bf6000156d9822c79");
const c83 = JSON.parse(outputs.get("C83-frozen-12-initial-baseline"));
assert.equal(c83.executed, 12);
assert.equal(c83.skipped, 0);
assert.equal(c83.passed, 4);
assert.equal(c83.failed, 8);
assert.equal(c83.exitCode, 1);
assert.ok(
  c83.results
    .filter((x) => !x.pass)
    .every(
      (x) => !x.error.includes("cleanup:") && !x.error.includes("watchdog"),
    ),
);
assert.equal(c82.executed, 25);
assert.equal(c82.skipped, 0);
assert.equal(c82.passed, 5);
assert.equal(c82.failed, 20);
assert.equal(c82.exitCode, 1);
assert.equal(c82.results.length, 25);
assert.ok(
  c82.results.filter((x) => x.pass).every((x) => x.id.endsWith("-closed")),
);
assert.ok(
  c82.results
    .filter((x) => !x.pass)
    .every(
      (x) => !x.error.includes("cleanup:") && !x.error.includes("watchdog"),
    ),
);
function jsonReports(text) {
  const found = [];
  let start = -1,
    depth = 0,
    quoted = false,
    escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (start < 0) {
      if (ch === "{" && (i === 0 || text[i - 1] === "\n")) {
        start = i;
        depth = 1;
      }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      found.push(JSON.parse(text.slice(start, i + 1)));
      start = -1;
    }
  }
  return found;
}
const full = outputs.get("full-independent-1195");
assert.match(full, /tests 810\n/u);
assert.match(full, /pass 810\n/u);
assert.match(full, /skipped 0\n/u);
const reports = jsonReports(full);
for (const n of [281, 5]) {
  const row = reports.find((x) => x.plannedCases === n);
  assert.ok(row);
  assert.equal(row.executedCases, n);
  assert.equal(row.skippedCases, 0);
  assert.equal(row.exitCode, 0);
  assert.equal(row.results.length, n);
  assert.ok(row.results.every((x) => x.pass));
}
const last = reports.find(
  (x) => x.kind === "B-electron-renderer-public-blackbox",
);
assert.equal(last.executed, 99);
assert.equal(last.skipped, 0);
assert.ok(last.results.every((x) => x.pass));
assert.equal(810 + 281 + 5 + 99, 1195);
for (const [name, n] of [
  ["m4-standard-268", 268],
  ["selection-standard-241-and-types", 241],
  ["tree-standard-287-and-types", 287],
]) {
  const out = outputs.get(name);
  assert.match(out, new RegExp("tests " + n + "\\n", "u"));
  assert.match(out, new RegExp("pass " + n + "\\n", "u"));
  assert.match(out, /skipped 0\n/u);
}
assert.match(
  outputs.get("schema-655-and-normalization"),
  /ModuleNotFoundError/u,
);
const schema = jsonReports(
  outputs.get("schema-655-and-normalization-fixed-environment"),
).find((x) => x.checks === 655);
assert.equal(schema.passed, 655);
assert.equal(schema.failed, 0);
assert.equal(schema.skipped, 0);
assert.equal(schema.parameterNormalization.checks, 27);
assert.deepEqual(schema.parameterNormalization.failed, []);
const initial = JSON.parse(outputs.get("initial-provenance")),
  final = JSON.parse(outputs.get("final-provenance"));
assert.deepEqual(final.ownOld, initial.ownOld);
assert.deepEqual(final.productTracked, initial.productTracked);
assert.deepEqual(final.mainTracked, initial.mainTracked);
assert.deepEqual(final.untracked, initial.untracked);
assert.deepEqual(final.thirdParty, initial.thirdParty);
assert.equal(final.coreBinary.bytes, 9324536);
assert.equal(
  final.coreBinary.sha256,
  "b16e232f26728620f732e70b57f1321b8fdad2ae0971872b00d1d1bb9667b94e",
);
assert.equal(final.productStatus, "");
const history = JSON.parse(
  fs.readFileSync(
    path.join(root, "docs/m5_b_electron_renderer_freeze.json"),
    "utf8",
  ),
);
for (const [current, old] of [
  ["unchanged-runtime-enumeration", "final-runtime-input-enumeration"],
  ["unchanged-type-enumeration", "final-type-input-enumeration"],
])
  assert.equal(
    sha(Buffer.from(outputs.get(current))),
    history.commands.find((x) => x.name === old).capture.stdout_sha256,
  );
const enumeration = execFileSync(
  process.execPath,
  [path.join(import.meta.dirname, "run.mjs"), "--list"],
  { cwd: root },
);
assert.equal(
  sha(enumeration),
  sha(Buffer.from(outputs.get("C82-pre-freeze-enumeration"))),
);
const c83Enumeration = execFileSync(
  process.execPath,
  [path.resolve(import.meta.dirname, "../c83/run.mjs"), "--list"],
  { cwd: root },
);
assert.equal(
  sha(c83Enumeration),
  sha(Buffer.from(outputs.get("C83-pre-freeze-enumeration"))),
);
console.log(
  JSON.stringify({
    archiveVerified: true,
    captures: outputs.size,
    pins:
      archive.frozenInputPins.length +
      archive.c82InputPins.length +
      archive.c83InputPins.length,
    oldIndependentPassed: 1195,
    rendererOriginalPassed: 99,
    typeNegativePassed: 16,
    c82: { executed: 25, passed: 5, failed: 20, skipped: 0 },
    c83: { executed: 12, passed: 4, failed: 8, skipped: 0 },
    productAccepted: false,
    semanticsExecutedByThisVerifier: 0,
  }),
);
