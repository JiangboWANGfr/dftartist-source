import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { heapGraph, reactions, delta } from "./heap.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  block = (b) => ({
    bytes: b.length,
    sha256: sha(b),
    gzipBase64: gzipSync(b).toString("base64"),
  });
function decode(v) {
  assert(v && Number.isSafeInteger(v.bytes) && v.bytes >= 0);
  assert.match(v.sha256, /^[a-f0-9]{64}$/);
  const b = gunzipSync(Buffer.from(v.gzipBase64, "base64"));
  assert.equal(b.length, v.bytes);
  assert.equal(sha(b), v.sha256);
  return b;
}
function local(root, file) {
  assert(!path.isAbsolute(file) && !file.split(/[\\/]/).includes(".."));
  const real = fs.realpathSync(path.join(root, file));
  assert(real.startsWith(fs.realpathSync(root) + path.sep));
  return fs.readFileSync(real);
}
export function verifyEvidence(a, { root } = {}) {
  assert.equal(a.kind, "B46-Q1-native-heap-diagnostic-NOT-approved-oracle");
  assert.equal(a.fixed.product, "29e0255124f7ef326138ea4f2922aea1d95cd1ae");
  assert.equal(a.fixed.freeze, "7f8c9a2963dd7a4529216ac77ecd440c73ac179f");
  assert.equal(a.fixed.revision, "51f7d0d3fcff2a3ecb6e7941dffb24fcdc9dc2b1");
  assert.deepEqual(a.scope, {
    parserTests: 10,
    knownControls: 14,
    pendingStructures: 12,
    unsupportedSettled: 2,
    formalUIOracle: false,
    approvedObserver: false,
    Q1Closed: false,
    candidateUIExecuted: 0,
    SDKExecuted: 0,
    CoreExecuted: 0,
    ElectronExecuted: 0,
    splitRoleDiscriminator: false,
  });
  assert.equal(a.inputs.length, 5);
  assert.equal(a.references.length, 2);
  for (const p of [...a.inputs, ...a.references]) {
    assert.match(p.sha256, /^[a-f0-9]{64}$/);
    if (root) {
      const b = local(root, p.file);
      assert.equal(b.length, p.bytes);
      assert.equal(sha(b), p.sha256);
    }
  }
  assert(a.materials.length >= 20);
  assert.equal(
    new Set(a.materials.map((m) => m.name)).size,
    a.materials.length,
  );
  let blocks = 0;
  for (const m of a.materials) {
    const b = decode(m);
    blocks++;
    if (root && m.file) assert.deepEqual(local(root, m.file), b);
  }
  const material = (name) => {
    const m = a.materials.find((m) => m.name === name);
    assert(m, "required material " + name);
    return decode(m);
  };
  const audit = JSON.parse(material("source-audit.json"));
  assert.equal(audit.exitCode, 0);
  assert.equal(audit.commands.length, 35);
  assert.equal(audit.imports.length, 4);
  assert.equal(audit.importedFinalPaths.length, 12);
  assert.equal(audit.compiled.length, 98);
  assert.deepEqual(audit.inputPins, a.inputs);
  assert.equal(audit.consumerExpectationsUnchanged, true);
  for (const command of audit.commands)
    for (const stream of [command.stdout, command.stderr]) {
      decode(stream);
      blocks++;
    }
  assert.equal(audit.frozenStages.length, 3);
  assert.deepEqual(
    audit.frozenStages.map((s) => s.rows.length),
    [4, 5, 5],
  );
  for (const stage of audit.frozenStages)
    for (const row of stage.rows) {
      decode(row);
      blocks++;
    }
  assert.equal(audit.snapshots.length, 15);
  for (const pin of audit.snapshots) {
    const b = material("snapshot:" + pin.run + ":" + pin.name);
    assert.equal(b.length, pin.bytes);
    assert.equal(sha(b), pin.sha256);
    JSON.parse(b);
  }
  assert(a.captures.length >= 7);
  assert.equal(new Set(a.captures.map((c) => c.name)).size, a.captures.length);
  for (const c of a.captures) {
    assert.equal(c.captureComplete, true);
    assert.equal(c.signal, null);
    for (const stream of [c.stdout, c.stderr]) {
      decode(stream);
      blocks++;
    }
  }
  const capture = (name) => {
    const c = a.captures.find((c) => c.name === name);
    assert(c, "required capture " + name);
    return c;
  };
  assert.equal(capture("parser-facilities").exit, 0);
  assert.match(
    decode(capture("parser-facilities").stdout).toString(),
    /# tests 10\n[\s\S]*# pass 10\n# fail 0\n/,
  );
  const first = capture("native-control-diagnostic"),
    failed = JSON.parse(decode(first.stdout));
  assert.equal(first.exit, 1);
  assert.match(failed.error, /facility watchdog HeapProfiler.collectGarbage/);
  assert.equal(failed.cases.length, 0);
  assert.equal(failed.snapshots.length, 2);
  assert.deepEqual(failed.cleanupErrors, []);
  assert.deepEqual(failed.pageErrors, []);
  let replayed = 0;
  for (const name of [
    "adapted-native-control-diagnostic",
    "pinned-native-control-diagnostic",
  ]) {
    const c = capture(name),
      r = JSON.parse(decode(c.stdout));
    assert.equal(c.exit, 0);
    assert.equal(r.exitCode, 0);
    assert.equal(r.cases.length, 14);
    assert.equal(r.cdp.length, 60);
    assert.equal(r.chromium, "156.0.8078.4");
    assert.equal(r.browserInfo.jsVersion, "15.6.75");
    assert.equal(
      r.browserInfo.revision,
      "@f842f52ef39fd97b449eb27cff414bf05a98ddce",
    );
    for (const flag of ["approvedObserver", "formalUIOracle", "Q1Closed"])
      assert.equal(r[flag], false);
    for (const n of [
      "candidateUIExecuted",
      "SDKExecuted",
      "CoreExecuted",
      "ElectronExecuted",
    ])
      assert.equal(r[n], 0);
    assert.deepEqual(
      r.markers,
      Array.from({ length: 3 }, () => ({ events: [], integrity: true })),
    );
    assert.deepEqual(r.cleanupErrors, []);
    assert.deepEqual(r.pageErrors, []);
    const graphs = new Map(
      r.snapshots.map((pin) => [
        pin.name,
        heapGraph(JSON.parse(material("snapshot:" + name + ":" + pin.name))),
      ]),
    );
    assert.equal(graphs.size, 5);
    for (const row of r.cases) {
      const { id, state } = r.refs[row.id];
      for (const [stage, label] of [
        ["before", "before"],
        ["immediate", "immediate-A"],
        ["repeated", "immediate-B-repeat"],
        ["later", "later"],
        ["afterUnpausedGC", "later-after-explicit-GC"],
      ])
        assert.deepEqual(row[stage], reactions(graphs.get(label), id, state));
      if (state === "pending") {
        assert.deepEqual(row.delta, delta(row.before, row.immediate));
        const { rows, ...shape } = row.delta;
        assert.deepEqual(
          { status: "pending-structure-only", ...shape },
          row.expected,
        );
      } else assert.equal(row.expected.status, "unsupported-settled");
      replayed++;
    }
    assert.equal(r.summary.pendingStructures, 12);
    assert.equal(r.summary.unsupportedSettled, 2);
    assert.equal(r.summary.repeatSnapshotStable, true);
    assert.equal(r.summary.unpausedGCStable, true);
    assert.equal(r.summary.splitRoleDiscriminator, false);
  }
  return {
    verified: true,
    captures: a.captures.length,
    materials: a.materials.length,
    blocks,
    rawSnapshots: 15,
    replayedKnownStructures: replayed,
    formalUIOracle: false,
    Q1Closed: false,
  };
}
export function checkEvidenceControls(a, options = {}) {
  const result = verifyEvidence(a, options),
    mutations = [
      (x) => {
        x.fixed.product = "0".repeat(40);
      },
      (x) => {
        x.scope.formalUIOracle = true;
      },
      (x) => {
        x.materials = x.materials.filter(
          (m) => m.name !== "snapshot:pinned-native-control-diagnostic:before",
        );
      },
      (x) => {
        x.materials[0].sha256 = "0".repeat(64);
      },
      (x) => {
        x.captures = x.captures.filter(
          (c) => c.name !== "native-control-diagnostic",
        );
      },
      (x) => {
        x.inputs.pop();
      },
      (x) => {
        const c = x.captures.find(
            (c) => c.name === "pinned-native-control-diagnostic",
          ),
          r = JSON.parse(decode(c.stdout));
        r.cases[0].delta.dual = 0;
        c.stdout = block(Buffer.from(JSON.stringify(r)));
      },
    ];
  assert.throws(() => verifyEvidence({}, options));
  for (const mutate of mutations) {
    const copy = structuredClone(a);
    mutate(copy);
    assert.throws(() => verifyEvidence(copy, options));
  }
  return { positive: 1, rejectedNegative: 8, ...result };
}
