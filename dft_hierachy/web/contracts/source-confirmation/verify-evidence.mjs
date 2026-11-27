// Read-only archive integrity/scope checks; runs no product tests.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const args = process.argv.slice(2);
const inputs = args.includes("--inputs");
const paths = args.filter((arg) => arg !== "--inputs");
assert.ok(paths.length <= 1);
const evidence = JSON.parse(
  readFileSync(
    resolve(
      root,
      paths[0] ?? "docs/m5_source_confirmation_contract_a_verification.json",
    ),
    "utf8",
  ),
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function unpack(block) {
  const bytes = gunzipSync(Buffer.from(block.gzipBase64, "base64"));
  assert.equal(bytes.length, block.bytes);
  assert.equal(sha(bytes), block.sha256);
  return bytes;
}
assert.equal(evidence.kind, "A29 source confirmation contract evidence");
assert.equal(evidence.productionConfirmationImplemented, false);
assert.equal(evidence.independentConfirmationAccepted, false);
assert.equal(evidence.m5Complete, false);
const captures = new Map();
for (const capture of evidence.captures) {
  assert.ok(!captures.has(capture.label));
  assert.ok(Array.isArray(capture.argv) && capture.argv.length > 0);
  assert.ok(capture.elapsedSeconds >= 0 && Number.isInteger(capture.exitCode));
  captures.set(capture.label, {
    ...capture,
    stdoutText: unpack(capture.stdout).toString(),
    stderrText: unpack(capture.stderr).toString(),
  });
}
const materials = new Map();
for (const material of evidence.materials) {
  assert.ok(!materials.has(material.name));
  const bytes = unpack(material.content);
  materials.set(material.name, bytes);
  if (inputs && material.repoPath) {
    assert.deepEqual(
      readFileSync(resolve(root, material.repoPath)),
      bytes,
      material.name,
    );
  }
}
for (const label of [
  "proposal-types-final",
  "capabilities-final",
  "web-check",
  "b29-archive",
  "b29-controls-archive",
  "audit-fixed",
  "format-check",
  "diff-check",
]) {
  assert.equal(captures.get(label)?.exitCode, 0, label);
}
const types = JSON.parse(captures.get("proposal-types-final").stdoutText);
assert.equal(types.positiveDiagnostics, 0);
assert.equal(types.negatives, 22);
assert.equal(types.productionConfirmationImplemented, false);
assert.equal(types.actualProtocolAndSelectionTypes, true);
assert.deepEqual(
  types.checks.map((check) => check.id),
  Array.from({ length: 22 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`),
);
for (const check of types.checks) {
  assert.ok(check.diagnosticCodes.length > 0);
  assert.ok(
    check.diagnosticCodes.every((code) => ![2305, 2307, 2578].includes(code)),
  );
}
const output = captures.get("capabilities-final").stdoutText;
assert.match(output, /tests 3/);
assert.match(output, /pass 3/);
for (const word of ["fail", "cancelled", "skipped", "todo"])
  assert.match(output, new RegExp(word + " 0"));
const events = output
  .split("\n")
  .filter((line) => line.startsWith("{"))
  .map((line) => JSON.parse(line));
assert.equal(events[0].productionConfirmationImplemented, false);
const core = events.filter((event) => "separate" in event);
assert.deepEqual(
  core.map((event) => event.separate),
  [false, true],
);
for (const event of core) {
  assert.equal(event.hitCount, 5);
  assert.deepEqual(event.pageSizes, [1, 1, 1, 1, 1]);
  for (const field of [
    "authorityFromPublicMetadata",
    "concurrentModelsShareReply",
    "newDocumentIdentity",
    "selectionCommitAndHistory",
  ])
    assert.equal(event[field], true);
  assert.equal(event.sameReplyAfterReload, false);
  assert.equal(event.staleGuardAlreadyImplemented, false);
  assert.equal(event.snapshotGuards, 2);
}
assert.equal(events.at(-1).listenerFailureAfterCommit, true);
assert.equal(captures.get("capabilities").exitCode, 1);
assert.match(captures.get("capabilities").stdoutText, /fail 2/);
assert.match(
  materials.get("capabilities-v1.test.mjs").toString(),
  /SDK caches and reuses/,
);
assert.equal(captures.get("audit").exitCode, 1);
assert.match(
  captures.get("audit").stderrText,
  /AssertionError: docs\/plans\/B-source-ref-kind-c93-recheck.md/,
);
assert.ok(materials.has("audit-v1.py"));
const before = JSON.parse(materials.get("baseline.json").toString());
const after = JSON.parse(materials.get("audit-result.json").toString());
const allowed = new Set(after.allowedExistingEdits);
assert.equal(Object.keys(before.files).length, 1198);
assert.equal(after.strictUnchangedCount, 1192);
assert.equal(allowed.size, 5);
for (const [name, pin] of Object.entries(before.files)) {
  if (name !== "docs/REVIEW_LOG.md" && !allowed.has(name))
    assert.deepEqual(after.files[name], pin, name);
}
assert.deepEqual(after.logPrefix, before.files["docs/REVIEW_LOG.md"]);
assert.equal(after.logUnstaged, true);
assert.equal(after.declarations.length, 48);
assert.equal(after.coreBinaries.length, 3);
assert.equal(after.imports.length, 2);
assert.equal(after.finalImportBlobs.length, 7);
for (const imported of after.imports)
  assert.equal(imported.sourceRawDelta, imported.targetRawDelta);
assert.match(
  captures.get("web-check").stdoutText,
  /Checked 196 definitions \/ 27 methods/,
);
assert.match(
  captures.get("web-check").stdoutText,
  /no dependency violations found/,
);
console.log(
  JSON.stringify({
    archiveVerified: true,
    currentProductExecutions: 0,
    captures: captures.size,
    materials: materials.size,
    historicalProposalNegatives: 22,
    historicalCapabilityTests: 3,
    originalFailuresPreserved: 2,
    productionConfirmationImplemented: false,
    inputsChecked: inputs,
  }),
);
