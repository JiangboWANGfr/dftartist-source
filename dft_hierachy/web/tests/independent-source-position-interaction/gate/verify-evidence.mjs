import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const raw = fs.readFileSync(
    root + "/docs/m5_b_source_position_observation_gate_recheck.json",
  ),
  a = JSON.parse(raw);
const sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(a.kind, "B25 independent SourceView observation gate recheck");
assert.equal(a.fixed, "5c81d81e4b46e58b66f4b911a85ecf03e02d5202");
assert.equal(a.freeze, "b98dfb50ffa5f2603b11319ad17c9f47cfaa7ca7");
const blocks = new Map();
for (const [id, b] of Object.entries(a.blocks)) {
  const raw = gunzipSync(Buffer.from(b.gzipBase64, "base64"));
  assert.equal(raw.length, b.bytes);
  assert.equal(sha(raw), id);
  blocks.set(id, raw);
}
for (const m of a.materials) {
  assert.ok(blocks.has(m.sha256));
  assert.equal(blocks.get(m.sha256).length, m.bytes);
}
const material = (label) => {
  const m = a.materials.find((m) => m.label === label);
  assert.ok(m, label);
  return blocks.get(m.sha256);
};
const output = new Map();
for (const c of a.captures) {
  assert.ok(
    c.capture_complete && c.command.length && c.cwd && c.utc && c.seconds >= 0,
  );
  const b = gunzipSync(Buffer.from(c.stdout_gzip_base64, "base64"));
  assert.equal(b.length, c.stdout_bytes, c.name);
  assert.equal(sha(b), c.stdout_sha256, c.name);
  assert.ok(!output.has(c.name));
  output.set(c.name, b.toString());
}
const parse = (n) => {
  assert.ok(output.has(n), n);
  return JSON.parse(output.get(n));
};
const before = parse("prewiring-baseline16"),
  current = parse("fixed-gate16");
for (const [r, p, f] of [
  [before, 9, 7],
  [current, 16, 0],
]) {
  assert.equal(r.executed, 16);
  assert.equal(r.passed, p);
  assert.equal(r.failed, f);
  assert.equal(r.skipped, 0);
  assert.equal(r.blocked, 0);
  assert.equal(r.productExecuted, 0);
  assert.deepEqual(r.cleanupErrors, []);
}
assert.equal(before.fixed, "473bfb03289186bb1b1ca669870d714b161a2785");
assert.equal(current.fixed, a.fixed);
assert.deepEqual(
  before.results.map((r) => [r.id, r.input, r.expected, r.basis]),
  current.results.map((r) => [r.id, r.input, r.expected, r.basis]),
);
assert.deepEqual(
  before.results.filter((r) => !r.pass).map((r) => r.id),
  [
    "B-OBS-GATE-happy",
    "B-OBS-GATE-repeat",
    "B-OBS-GATE-new-missing",
    "B-OBS-GATE-new-directory",
    "B-OBS-GATE-new-exit23",
    "B-OBS-GATE-new-signal",
    "B-OBS-GATE-new-throw",
  ],
);
for (const r of current.results) {
  assert.ok(r.pass);
  assert.equal(r.commands.length, r.input.repeat ?? 1);
  for (const c of r.commands) {
    assert.equal(c.status, r.expected.status);
    assert.equal(c.signal, null);
    assert.equal(c.error, null);
  }
}
for (const r of [before, current])
  for (const row of r.results)
    for (const c of row.commands)
      for (const stream of ["stdout", "stderr"]) {
        const b = gunzipSync(Buffer.from(c[stream].gzipBase64, "base64"));
        assert.equal(b.length, c[stream].bytes);
        assert.equal(sha(b), c[stream].sha256);
      }
function jsonObjects(s) {
  const found = [];
  for (const match of s.matchAll(/^\{/gm)) {
    let depth = 0,
      string = false,
      escape = false;
    for (let i = match.index; i < s.length; i++) {
      const c = s[i];
      if (string) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === '"') string = false;
      } else if (c === '"') string = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        try {
          found.push(JSON.parse(s.slice(match.index, i + 1)));
        } catch {}
        break;
      }
    }
  }
  return found;
}
const observations = jsonObjects(output.get("standard-controls")).filter(
  (r) => r.kind === "B browser-observation facility NOT SourceView",
);
assert.equal(observations.length, 1);
const o = observations[0];
assert.equal(o.exitCode, 0);
assert.equal(o.productExecuted, 0);
assert.equal(o.executedTrusted, 24);
assert.equal(o.passedTrusted, 24);
assert.equal(o.failedTrusted, 0);
assert.equal(o.syntheticObservations, 24);
assert.deepEqual(o.cleanupErrors, []);
assert.ok(
  o.evidence.rows.every((r) => r.passed && r.observed === (r.delay === "sync")),
);
assert.equal(o.evidence.rows.length, 48);
assert.equal(
  o.evidence.rows.filter((r) => r.source === "trusted" && r.delay === "sync")
    .length,
  6,
);
assert.equal(
  o.evidence.rows.filter((r) => r.source === "trusted" && r.delay !== "sync")
    .length,
  18,
);
assert.deepEqual(
  o.commitControls.map((r) => [r.before, r.immediate, r.after]),
  [
    [false, false, true],
    [true, true, false],
  ],
);
assert.equal(o.evidence.transparency.length, 7);
assert.deepEqual(o.evidence.cleanup, {
  channels: 0,
  probeActive: false,
  probeListeners: 0,
});
const audit = parse("source-and-production-identity-buffer-fixed");
assert.equal(audit.origins.length, 2);
assert.equal(
  audit.origins.reduce((n, o) => n + o.files.length, 0),
  8,
);
assert.equal(audit.publicDeclarations.length, 48);
assert.equal(audit.productClean, true);
assert.equal(audit.mainStaged, "");
assert.equal(
  audit.design.sha256,
  "f0da663bb4fc4517cfe0e9ebaac3013059e05b1b25f54cd9a2374a90505248f5",
);
const prior = parse("prior-archive-verify");
assert.equal(
  prior.sha256,
  "b27ec085888057c54c107bef3b6f8bdf7aa16571655de4e907159962511be008",
);
assert.equal(prior.notProductExecution, true);
const allowed = new Set([
  "prewiring-baseline16",
  "source-and-production-identity",
]);
for (const c of a.captures)
  assert.equal(c.exit_code, allowed.has(c.name) ? 1 : 0, c.name);
const initial = JSON.parse(material("initial-snapshot"));
assert.deepEqual(
  initial.roots.map((r) => r.files.length),
  [1088, 733, 1070],
);
assert.equal(initial.mainDeclarations.length, 48);
let checked = 0;
if (process.argv.includes("--inputs")) {
  for (const r of initial.roots)
    for (const f of r.files) {
      const b = fs.readFileSync(path.join(r.root, f.file)),
        s = fs.statSync(path.join(r.root, f.file), { bigint: true });
      assert.equal(b.length, f.bytes);
      assert.equal(sha(b), f.sha256);
      assert.equal(String(s.mtimeNs), f.mtimeNs);
      checked++;
    }
  for (const f of initial.mainDeclarations) {
    const b = fs.readFileSync(path.join(initial.roots[0].root, f.file));
    assert.equal(sha(b), f.sha256);
    checked++;
  }
  const log = fs.readFileSync(initial.roots[0].root + "/docs/REVIEW_LOG.md");
  assert.equal(sha(log.subarray(0, initial.log.bytes)), initial.log.sha256);
}
console.log(
  JSON.stringify(
    {
      verified: true,
      notProductExecution: true,
      fixed: a.fixed,
      freeze: a.freeze,
      bytes: raw.length,
      sha256: sha(raw),
      captures: a.captures.length,
      materials: a.materials.length,
      blocks: blocks.size,
      baseline: { executed: 16, passed: 9, failed: 7 },
      current: { executed: 16, passed: 16, failed: 0 },
      standardObservations: {
        trusted: 24,
        synthetic: 24,
        commits: 2,
        transparency: 7,
        productExecuted: 0,
      },
      productionObjects: audit.productionObjectCount,
      checkedInputs: checked,
    },
    null,
    2,
  ),
);
