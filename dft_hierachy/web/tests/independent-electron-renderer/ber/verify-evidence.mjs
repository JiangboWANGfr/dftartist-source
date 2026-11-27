// Frozen-source + historical evidence integrity only. No product semantics or C closure.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "../../../.."),
  archive = JSON.parse(
    fs.readFileSync(
      path.join(root, "docs/m5_b_renderer_f936a33_recheck.json"),
      "utf8",
    ),
  ),
  outputs = new Map(),
  sha = (b) => createHash("sha256").update(b).digest("hex");
for (const { name, expectedExit, capture } of archive.commands) {
  assert.equal(outputs.has(name), false);
  assert.equal(capture.capture_complete, true, name);
  assert.equal(capture.exit_code, expectedExit, name);
  const b = gunzipSync(Buffer.from(capture.stdout_gzip_base64, "base64"));
  assert.equal(b.length, capture.stdout_bytes, name);
  assert.equal(sha(b), capture.stdout_sha256, name);
  outputs.set(name, b.toString("utf8"));
}
assert.equal(
  archive.fixedProductSHA,
  "f936a33876656246ccea172c4c9447ff59f9983f",
);
assert.equal(archive.berFreezeSHA, "42b0804ddeeaffa35e52c69f54b552d049f0fe94");
assert.equal(
  archive.ownClaimFreezeSHA,
  "cf9abb0a469d2bce0f102c33d3a3e733830fe8e1",
);
for (const p of [...archive.frozenInputPins, ...archive.berInputPins]) {
  const b = fs.readFileSync(path.join(root, p.path));
  assert.equal(b.length, p.bytes, p.path);
  assert.equal(sha(b), p.sha256, p.path);
}
const passed = (name, n) => {
  const r = JSON.parse(outputs.get(name));
  assert.equal(r.executed, n, name);
  assert.equal(r.skipped, 0);
  assert.equal(r.exitCode, 0);
  assert.equal(r.results.length, n);
  assert.ok(r.results.every((x) => x.pass));
  return r;
};
passed("original-renderer-99", 99);
passed("C82-frozen-25-recheck", 25);
passed("C83-frozen-12-recheck", 12);
const ber = passed("BER-frozen-40-initial-execution", 40);
passed("BER-own-claim-6-fixed-f936a33", 6);
passed("BER-own-claim-6-old-1087f78", 6);
assert.equal(
  ber.results.reduce(
    (n, x) => n + x.fixtureFaultDetach.reduce((m, r) => m + r.callbacks, 0),
    0,
  ),
  4,
);
assert.equal(
  ber.results.reduce((n, x) => n + x.surfaceThrows.length, 0),
  0,
);
const old = JSON.parse(outputs.get("BER-frozen-40-pre-fix-1087-baseline"));
assert.equal(old.executed, 40);
assert.equal(old.passed, 36);
assert.equal(old.failed, 4);
assert.equal(old.skipped, 0);
assert.deepEqual(
  old.results.filter((x) => !x.pass).map((x) => x.id),
  [
    "BER01-EARLY-client-single",
    "BER01-EARLY-client-repeated",
    "BER03-SEND-diagnostic",
    "BER03-SNAPSHOT-REENTRANT-core",
  ],
);
const types = JSON.parse(outputs.get("production-renderer-types-16"));
assert.equal(types.kind, "public-renderer-type-consumer");
assert.deepEqual(types.positive, []);
assert.equal(types.executedNegative, 16);
assert.ok(
  types.results.every(
    (x) => x.diagnostics.length && x.diagnostics.every((d) => d.code !== 2307),
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
const full = outputs.get("full-independent-1232"),
  reports = jsonReports(full);
assert.match(full, /tests 810\n/u);
assert.match(full, /pass 810\n/u);
assert.match(full, /skipped 0\n/u);
for (const n of [281, 5]) {
  const row = reports.find((x) => x.plannedCases === n);
  assert.equal(row.executedCases, n);
  assert.equal(row.skippedCases, 0);
  assert.equal(row.exitCode, 0);
  assert.ok(row.results.every((x) => x.pass));
}
for (const n of [99, 25, 12]) {
  const row = reports.find((x) => x.planned === n);
  assert.equal(row.executed, n);
  assert.equal(row.skipped, 0);
  assert.equal(row.exitCode, 0);
  assert.ok(row.results.every((x) => x.pass));
}
assert.equal(810 + 281 + 5 + 99 + 25 + 12, 1232);
assert.match(outputs.get("m4-standard-268"), /pass 268\n/u);
assert.match(outputs.get("m4-standard-268"), /skipped 0\n/u);
const schema = jsonReports(outputs.get("schema-655-normalization-27")).find(
  (x) => x.checks === 655,
);
assert.equal(schema.passed, 655);
assert.equal(schema.failed, 0);
assert.equal(schema.skipped, 0);
assert.equal(schema.parameterNormalization.checks, 27);
assert.deepEqual(schema.parameterNormalization.failed, []);
const initial = JSON.parse(outputs.get("initial-provenance")),
  final = JSON.parse(outputs.get("final-provenance"));
for (const key of [
  "ownOld",
  "productTracked",
  "mainTracked",
  "untracked",
  "thirdParty",
])
  assert.deepEqual(final[key], initial[key], key);
assert.equal(final.ownOld.files, 521);
assert.equal(final.oldBInputFiles, 153);
assert.equal(final.importedPins.length, 27);
assert.equal(final.productTracked.files, 766);
assert.equal(final.mainTracked.files, 765);
assert.equal(final.productStatus, "");
assert.equal(
  final.coreBinary.sha256,
  "c22abe2f63a4d19352677a9acc1d28df5e15a8d8ecb476586da85d79cbb46708",
);
assert.equal(
  final.sourcePins.find((x) => x.path === "docs/DESIGN.md").sha256,
  "df33fa23d2eb5b74ab9c4519f94e5f8cc2605af706601350f3174084dc1d8471",
);
for (const [file, capture] of [
  ["run.mjs", "BER-final-enumeration"],
  ["claim-run.mjs", "BER-own-claim-6-pre-freeze-enumeration"],
])
  assert.equal(
    sha(
      execFileSync(
        process.execPath,
        [path.join(import.meta.dirname, file), "--list"],
        { cwd: root },
      ),
    ),
    sha(Buffer.from(outputs.get(capture))),
  );
assert.equal(
  outputs.get("BER-pre-freeze-enumeration"),
  outputs.get("BER-final-enumeration"),
);
console.log(
  JSON.stringify({
    archiveVerified: true,
    captures: outputs.size,
    pins: archive.frozenInputPins.length + archive.berInputPins.length,
    standardPassed: 1232,
    BER: 40,
    ownClaimControls: 6,
    typeNegative: 16,
    preFixBER: { passed: 36, failed: 4 },
    fixtureOnlyFaultDetach: 4,
    semanticsExecutedByThisVerifier: 0,
  }),
);
