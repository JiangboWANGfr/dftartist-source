import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const file = path.join(
  root,
  "docs/m5_b_source_position_interaction_runtime_recheck.json",
);
const raw = fs.readFileSync(file),
  a = JSON.parse(raw);
const sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(a.kind, "B24 SourceView position interaction independent recheck");
assert.equal(a.product, "473bfb03289186bb1b1ca669870d714b161a2785");
assert.equal(a.runtime, "7aea654fe1d04ed2af659d243c518a95afc123ba");
assert.equal(a.maintenance, "51606dc6c74d97c2ab32b4a0200a40a7889e664d");
assert.equal(
  a.design.sha256,
  "71b60ca6906375d4b098d0deb87f442e166fbc04998625fc51ad0dcac2c901ce",
);
const blocks = new Map();
for (const [id, b] of Object.entries(a.blocks)) {
  const bytes = gunzipSync(Buffer.from(b.gzipBase64, "base64"));
  assert.equal(bytes.length, b.bytes);
  assert.equal(sha(bytes), id);
  blocks.set(id, bytes);
}
for (const m of a.materials) {
  assert.ok(blocks.has(m.sha256), m.label);
  assert.equal(blocks.get(m.sha256).length, m.bytes);
}
const material = (label) => {
  const m = a.materials.find((m) => m.label === label);
  assert.ok(m, label);
  return blocks.get(m.sha256);
};
const outputs = new Map();
for (const c of a.captures) {
  assert.ok(c.capture_complete && Array.isArray(c.command) && c.command.length);
  assert.ok(c.cwd && c.utc && Number.isFinite(c.seconds) && c.seconds >= 0);
  assert.ok(!outputs.has(c.name));
  const bytes = gunzipSync(Buffer.from(c.stdout_gzip_base64, "base64"));
  assert.equal(bytes.length, c.stdout_bytes, c.name);
  assert.equal(sha(bytes), c.stdout_sha256, c.name);
  outputs.set(c.name, bytes.toString());
}
function report(name) {
  assert.ok(outputs.has(name), name);
  return JSON.parse(outputs.get(name));
}
function count(name, n, p, f) {
  const r = report(name);
  assert.equal(r.executed, n, name);
  assert.equal(r.passed, p, name);
  assert.equal(r.failed, f, name);
  assert.equal(r.skipped, 0, name);
  if (Object.hasOwn(r, "blocked")) assert.equal(r.blocked, 0, name);
  return r;
}
const original = count("original119", 119, 111, 8),
  maintained = count("maintained119", 119, 119, 0);
assert.equal(original.fixed, a.product);
assert.equal(maintained.fixed, a.product);
assert.deepEqual(
  maintained.results.map((r) => [r.id, r.group, r.input, r.expected, r.basis]),
  original.results.map((r) => [r.id, r.group, r.input, r.expected, r.basis]),
);
assert.deepEqual(
  original.results.filter((r) => !r.pass).map((r) => r.id),
  [
    "B-SPI-trusted-mouse-0.5",
    "B-SPI-trusted-mouse-1",
    "B-SPI-trusted-mouse-1.5",
    "B-SPI-trusted-mouse-scrolled",
    "B-SPI-trusted-key",
    "B-SPI-mouse-unavailable",
    "B-SPI-feedback-new-action-clears",
    "B-SPI-feedback-mouse-hint-clears",
  ],
);
assert.ok(maintained.results.every((r) => r.pass));
assert.deepEqual(maintained.cleanupErrors, []);
count("production42", 42, 42, 0);
for (const [name, n] of [
  ["old89", 89],
  ["old19", 19],
  ["old9", 9],
  ["old28", 28],
  ["old-package6-offline", 6],
  ["navigation310", 284],
  ["navigation-ready26", 26],
  ["position258", 258],
  ["candidates281", 281],
])
  count(name, n, n, 0);
for (const [name, p, f] of [
  ["original-package2", 1, 1],
  ["maintained-package2", 2, 0],
]) {
  const r = count(name, 2, p, f);
  assert.equal(r.packs.length, 9);
  assert.equal(r.commands.length, 13);
  assert.deepEqual(r.cleanupErrors, []);
  for (const c of r.commands)
    for (const stream of ["stdout", "stderr"]) {
      const b = gunzipSync(Buffer.from(c[stream].gzipBase64, "base64"));
      assert.equal(b.length, c[stream].bytes);
      assert.equal(sha(b), c[stream].sha256);
      assert.equal(c.timedOut, false);
      assert.equal(c.outputLimitExceeded, false);
    }
  const browser = r.groups.find(
    (g) => g.id === "outside-trusted-browser",
  ).report;
  assert.equal(browser.truePack, true);
  assert.equal(browser.executed, 5);
  assert.equal(browser.passed, name === "maintained-package2" ? 5 : 0);
  assert.equal(browser.skipped, 0);
  assert.equal(browser.blocked, 0);
}
const control = report("observation-controls");
assert.equal(control.sourceViewMounted, false);
assert.equal(control.productExecuted, 0);
assert.equal(control.executedTrusted, 24);
assert.equal(control.passedTrusted, 24);
assert.equal(control.failedTrusted, 0);
assert.equal(control.syntheticObservations, 24);
assert.deepEqual(control.cleanupErrors, []);
const trusted = control.evidence.rows.filter((r) => r.source === "trusted");
assert.equal(trusted.filter((r) => r.delay === "sync").length, 6);
assert.equal(trusted.filter((r) => r.delay !== "sync").length, 18);
assert.ok(
  trusted.every((r) => r.passed && r.observed === (r.delay === "sync")),
);
assert.ok(control.legacy.trustedSync.every((r) => r.inEvent === false));
assert.ok(control.legacy.syntheticSync.every((r) => r.inEvent === true));
assert.deepEqual(
  control.commitControls.map((r) => [r.before, r.immediate, r.after]),
  [
    [false, false, true],
    [true, true, false],
  ],
);
assert.deepEqual(control.evidence.cleanup, {
  channels: 0,
  probeActive: false,
  probeListeners: 0,
});
const initial = JSON.parse(material("initial-snapshot")),
  authorized = JSON.parse(material("authorized-b-edits"));
assert.deepEqual(
  initial.roots.map((r) => r.files.length),
  [1079, 726, 1061],
);
assert.equal(initial.mainDeclarations.length, 48);
assert.equal(authorized.length, 1);
assert.equal(
  authorized[0].before.file,
  "web/tests/independent-source-position-interaction/fixture.jsx",
);
assert.equal(
  authorized[0].before.sha256,
  sha(material("B-original/" + authorized[0].before.file)),
);
assert.equal(
  authorized[0].after.sha256,
  sha(material("B-current/" + authorized[0].before.file)),
);
for (const f of ["cases.mjs", "types.ts"])
  assert.deepEqual(
    material(
      "B-original/web/tests/independent-source-position-interaction/" + f,
    ),
    material(
      "B-current/web/tests/independent-source-position-interaction/" + f,
    ),
  );
const integration = JSON.parse(material("B24-evidence/integration.json"));
assert.equal(integration.pureProduct, a.product);
assert.equal(integration.maintenance, a.maintenance);
assert.equal(integration.productionFilesIdentical, 302);
assert.equal(integration.publicDeclarationsIdentical, 48);
assert.equal(integration.changed.length, 5);
assert.ok(integration.productClean && integration.integrationClean);
const allowedNonzero = new Map([
  ["original119", "original frozen observation: 8 failures"],
  ["original-package2", "same original trusted observation: browser5 failures"],
  ["old-package6", "registry installation timeout before product execution"],
  [
    "final-identity-audit",
    "B inventory audit initially enumerated new files against old commit; fixed to fixed old tree",
  ],
]);
for (const c of a.captures)
  if (c.exit_code !== 0) assert.ok(allowedNonzero.has(c.name), c.name);
for (const n of [
  "standard-source-view-model",
  "standard-source-view-package",
  "standard-source-view-controls",
])
  assert.equal(a.captures.find((c) => c.name === n)?.exit_code, 0, n);
const failedInstall = report("old-package6");
assert.equal(failedInstall.executed, 0);
assert.ok(
  failedInstall.commands.some(
    (c) => c.signal === "SIGTERM" && c.status === null,
  ),
);
let checked = 0;
if (process.argv.includes("--inputs")) {
  for (const r of initial.roots)
    for (const f of r.files) {
      const replacement =
        r.root === initial.roots[1].root &&
        authorized.find((e) => e.before.file === f.file);
      const expected = replacement?.after ?? f,
        absolute = path.join(r.root, f.file);
      const b = fs.readFileSync(absolute),
        s = fs.statSync(absolute, { bigint: true });
      assert.equal(b.length, expected.bytes, absolute);
      assert.equal(sha(b), expected.sha256, absolute);
      assert.equal(String(s.mtimeNs), expected.mtimeNs, absolute);
      checked++;
    }
  const log = fs.readFileSync(
    path.join(initial.roots[0].root, "docs/REVIEW_LOG.md"),
  );
  assert.equal(sha(log.subarray(0, initial.log.bytes)), initial.log.sha256);
  for (const f of a.runtimePins) {
    const b = fs.readFileSync(path.join(initial.roots[2].root, f.file));
    assert.equal(sha(b), f.sha256, f.file);
    checked++;
  }
}
console.log(
  JSON.stringify(
    {
      verified: true,
      notProductExecution: true,
      bytes: raw.length,
      sha256: sha(raw),
      product: a.product,
      maintenance: a.maintenance,
      captures: a.captures.length,
      materials: a.materials.length,
      blocks: blocks.size,
      original: { DOM: [111, 8], package: [1, 1] },
      maintained: { DOM: 119, types: 42, package: 2 },
      controls: { trusted: 24, synthetic: 24, commits: 2, transparency: 7 },
      checkedInputs: checked,
      nonzero: a.captures
        .filter((c) => c.exit_code !== 0)
        .map((c) => ({ name: c.name, reason: allowedNonzero.get(c.name) })),
    },
    null,
    2,
  ),
);
