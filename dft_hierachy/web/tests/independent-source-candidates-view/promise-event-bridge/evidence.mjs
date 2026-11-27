// Explicit metadata / raw-heap replay APIs. Importing this file runs no product.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { cases, shape } from "./cases.mjs";
import {
  heapGraph,
  reactions,
  delta,
} from "../promise-heap-diagnostic/heap.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
function decode(b) {
  assert(
    b &&
      Number.isSafeInteger(b.bytes) &&
      b.bytes >= 0 &&
      /^[0-9a-f]{64}$/.test(b.sha256) &&
      typeof b.gzipBase64 === "string",
  );
  const raw = gunzipSync(Buffer.from(b.gzipBase64, "base64"));
  assert.equal(raw.length, b.bytes);
  assert.equal(sha(raw), b.sha256);
  return raw;
}
function inside(root, file) {
  assert(path.isAbsolute(root));
  assert(
    typeof file === "string" &&
      !path.isAbsolute(file) &&
      !file.split("/").includes(".."),
  );
  return path.join(root, file);
}
function run(a, name) {
  const c = a.captures.find((c) => c.name === name);
  assert(c, "required capture " + name);
  return JSON.parse(decode(c.stdout));
}
export function verifyEvidence(a, { root } = {}) {
  assert.equal(a.kind, "B48-pending-public-command-event-bridge-evidence");
  assert.equal(a.fixedProduct, "a3468d074d71ac9d22c51b2c7df0acaf25fc79dc");
  assert.equal(a.finalInput, "68afcb78140df40cd43ff0a4596efe4025a4d632");
  assert.equal(a.firstInput, "1146d39bfbf7d46e9ff181f5f3dba4cc2ee5f84b");
  for (const k of [
    "Q1Closed",
    "approvedObserver",
    "formalUIOracle",
    "completeRawHeapsEmbedded",
  ])
    assert.equal(a[k], false, k);
  assert.equal(a.candidateUIExecuted, 0);
  assert.equal(a.CoreExecuted, 0);
  assert.equal(a.ElectronExecuted, 0);
  assert(Array.isArray(a.captures) && a.captures.length >= 17);
  assert.equal(new Set(a.captures.map((c) => c.name)).size, a.captures.length);
  let blocks = 0;
  const visit = (x) => {
    if (!x || typeof x !== "object") return;
    if (Object.hasOwn(x, "gzipBase64")) {
      decode(x);
      blocks++;
      return;
    }
    for (const v of Object.values(x)) visit(v);
  };
  visit(a.captures);
  for (const c of a.captures) {
    assert(
      Array.isArray(c.command) && c.command.length && path.isAbsolute(c.cwd),
    );
    assert.equal(c.captureComplete, true);
    assert.equal(c.signal, null);
    assert.equal(c.error, null);
    assert(Number.isFinite(c.seconds) && c.seconds >= 0);
  }
  for (const [name, exit] of [
    ["worktree", 0],
    ["protect-before", 0],
    ["install", 0],
    ["build", 0],
    ["unit", 0],
    ["list", 0],
    ["browser-first", 1],
    ["cursor-boundary-probe", 1],
    ["cursor-boundary-probe-corrected", 0],
    ["unit-final", 0],
    ["browser-final", 0],
    ["source-audit", 0],
    ["package-heaps", 0],
  ])
    assert.equal(a.captures.find((c) => c.name === name)?.exit, exit, name);
  assert.match(
    decode(a.captures.find((c) => c.name === "unit").stdout).toString(),
    /# pass 15\n/,
  );
  assert.match(
    decode(a.captures.find((c) => c.name === "unit-final").stdout).toString(),
    /# pass 16\n/,
  );
  assert(Array.isArray(a.materials) && a.materials.length >= 15);
  assert.equal(
    new Set(a.materials.map((m) => m.name)).size,
    a.materials.length,
  );
  visit(a.materials);
  const audit = JSON.parse(
    decode(a.materials.find((m) => m.name === "source-audit.json")),
  );
  assert.equal(audit.exitCode, 0);
  assert.equal(audit.commands.length, 42);
  visit(audit);
  assert.equal(audit.imports.length, 4);
  assert.equal(audit.importedFinalPaths.length, 11);
  assert.equal(audit.compiled.length, 98);
  assert.equal(audit.oldHelpersUnchanged, true);
  assert.equal(audit.knownConsumersUnchanged, true);
  assert.deepEqual(a.inputPins, audit.inputPins);
  assert.equal(a.inputPins.length, 12);
  assert.equal(new Set(a.inputPins.map((p) => p.file)).size, 12);
  assert.equal(
    audit.normative.sha256,
    "baa78949e5354e1ed384e0f57b141002c1f3c1391a1fd25a790dca9ed08de1db",
  );
  assert.equal(audit.normative.bytes, 15412);
  assert.equal(a.rawHeapRefs.length, 56);
  assert.equal(new Set(a.rawHeapRefs.map((s) => s.file)).size, 56);
  for (const r of a.rawHeapRefs) {
    assert(
      /^(browser-first|browser-final)\/B48-P0[1-7]-(baseline|cutoff-A|cutoff-B-repeat|later)\.heapsnapshot\.gz$/.test(
        r.file,
      ),
    );
    assert(r.bytes > 0 && r.compressedBytes > 0);
    assert(/^[0-9a-f]{64}$/.test(r.sha256));
    assert(/^[0-9a-f]{64}$/.test(r.compressedSHA256));
  }
  for (const name of ["browser-first", "browser-final"]) {
    const r = run(a, name);
    assert.equal(r.fixed, a.fixedProduct);
    assert.deepEqual(
      [r.planned, r.executed, r.passed, r.failed],
      name === "browser-first" ? [7, 7, 5, 2] : [7, 7, 7, 0],
    );
    assert.equal(r.exitCode, name === "browser-first" ? 1 : 0);
    for (const k of ["Q1Closed", "approvedObserver", "formalUIOracle"])
      assert.equal(r[k], false);
    for (const k of ["candidateUIExecuted", "CoreExecuted", "ElectronExecuted"])
      assert.equal(r[k], 0);
    assert.equal(r.chromium, "156.0.8078.4");
    assert.equal(r.browserInfo.jsVersion, "15.6.75");
    assert.equal(
      r.browserInfo.revision,
      "@f842f52ef39fd97b449eb27cff414bf05a98ddce",
    );
    assert.equal(r.tools.playwright, "1.64.1");
    assert.deepEqual(r.pageErrors, []);
    assert.deepEqual(r.cleanupErrors, []);
    assert.equal(r.snapshots.length, 28);
    assert.equal(r.cases.length, 7);
    const bundle = a.materials.find((m) => m.name === name + "/fixture.js");
    assert.equal(bundle.bytes, r.build.bytes);
    assert.equal(bundle.sha256, r.build.sha256);
    for (let i = 0; i < cases.length; i++) {
      const row = r.cases[i],
        config = cases[i];
      assert.deepEqual(row.config, config);
      assert.equal(row.id, config.id);
      assert.equal(
        row.pass,
        name === "browser-first"
          ? !["B48-P02", "B48-P04"].includes(row.id)
          : true,
      );
      if (!row.pass)
        assert.match(row.error, /public command cursor versus fresh reload/);
      assert.equal(row.original.state, "pending");
      assert.equal(row.before.original, row.original.id);
      assert.equal(row.before.reactions.length, 1);
      assert.equal(row.baselineMarker.phase, "baseline");
      assert.equal(row.baselineMarker.received, false);
      assert.equal(row.baselineMarker.integrity, true);
      assert.equal(row.cutoffMarkers.length, 3);
      assert.deepEqual(row.cutoffMarkers[1], row.cutoffMarkers[0]);
      assert.deepEqual(row.cutoffMarkers[2], row.cutoffMarkers[0]);
      const cm = row.cutoffMarkers[0];
      assert.equal(cm.phase, "cutoff");
      assert.equal(cm.lateInstalled, false);
      assert.equal(cm.commands, 1);
      assert.equal(cm.args, 0);
      assert.equal(cm.receiver, true);
      for (const k of [
        "received",
        "sameEvent",
        "pending",
        "notified",
        "document",
        "selection",
        "integrity",
      ])
        assert.equal(cm[k], true);
      assert(
        cm.events.indexOf("consumer-received") <
          cm.events.indexOf("ancestor-event-tail"),
      );
      assert(!cm.events.includes("consumer-success"));
      if (config.mode.startsWith("unmount-")) {
        assert.equal(cm.mounted, false);
        assert.equal(cm.domChildren, 0);
        assert(
          cm.events.indexOf("layout-cleanup") <
            cm.events.indexOf("baseline-before-return"),
        );
      }
      assert.deepEqual(row.immediate, row.repeated);
      assert.deepEqual(delta(row.before, row.immediate), row.delta);
      assert.deepEqual(shape(row.delta), config.shape);
      assert.deepEqual(delta(row.before, row.later), row.laterDelta);
      assert.equal(
        row.laterMarker.lateInstalled,
        config.mode === "microtask-late",
      );
      assert.deepEqual(
        shape(row.laterDelta),
        config.mode === "microtask-late" ? [1, 1, 0, 0] : config.shape,
      );
      if (row.pass) {
        assert.equal(row.completion.candidateUI, false);
        assert.equal(
          row.completion.successfulConsumer,
          config.mode !== "unmount-skip",
        );
        assert.equal(row.completion.marker.sent, 1);
      }
      assert.deepEqual(row.cleanupErrors, []);
      for (const k of ["errors", "unhandled", "cleanupErrors"])
        assert.deepEqual(row.cleanup[k], []);
      assert.equal(row.cleanup.wireMessages, 0);
      assert.equal(row.cleanup.wireCloses, 0);
      assert.equal(row.cleanup.rootEmpty, true);
      assert.equal(row.cleanup.methodRestored, true);
      for (const s of r.snapshots.filter((s) => s.id === row.id)) {
        const ref = a.rawHeapRefs.find(
          (x) => x.run === name && x.id === s.id && x.label === s.label,
        );
        assert(ref);
        assert.equal(ref.bytes, s.bytes);
        assert.equal(ref.sha256, s.sha256);
      }
    }
  }
  if (root)
    for (const p of [...a.inputPins, ...a.references]) {
      const b = fs.readFileSync(inside(root, p.file));
      assert.equal(b.length, p.bytes);
      assert.equal(sha(b), p.sha256);
    }
  return {
    valid: true,
    captures: a.captures.length,
    materials: a.materials.length,
    verifiedBlocks: blocks,
    inputPins: 12,
    rawHeapRefs: 56,
    rawHeapsReplayed: 0,
    rawHeapReplay: "NOT RUN: requires explicit verifyHeapSidecar(heapRoot)",
    candidateUIExecuted: 0,
    Q1Closed: false,
  };
}
export function verifyHeapSidecar(a, { heapRoot } = {}) {
  verifyEvidence(a);
  assert(
    heapRoot && path.isAbsolute(heapRoot),
    "explicit external raw heap directory",
  );
  let bytes = 0,
    compressedBytes = 0,
    count = 0;
  for (const name of ["browser-first", "browser-final"]) {
    const r = run(a, name);
    for (const row of r.cases) {
      const projections = {};
      for (const [label, key] of [
        ["baseline", "before"],
        ["cutoff-A", "immediate"],
        ["cutoff-B-repeat", "repeated"],
        ["later", "later"],
      ]) {
        const s = a.rawHeapRefs.find(
            (s) => s.run === name && s.id === row.id && s.label === label,
          ),
          compressed = fs.readFileSync(inside(heapRoot, s.file));
        assert.equal(compressed.length, s.compressedBytes);
        assert.equal(sha(compressed), s.compressedSHA256);
        const raw = gunzipSync(compressed);
        assert.equal(raw.length, s.bytes);
        assert.equal(sha(raw), s.sha256);
        projections[key] = reactions(
          heapGraph(JSON.parse(raw)),
          row.original.id,
          "pending",
        );
        assert.deepEqual(
          projections[key],
          row[key],
          "actual archived heap projection " +
            name +
            "/" +
            row.id +
            "/" +
            label,
        );
        count++;
        bytes += raw.length;
        compressedBytes += compressed.length;
      }
      assert.deepEqual(
        delta(projections.before, projections.immediate),
        row.delta,
      );
      assert.deepEqual(
        delta(projections.before, projections.later),
        row.laterDelta,
      );
    }
  }
  assert.equal(count, 56);
  return {
    valid: true,
    rawHeapsReplayed: count,
    bytes,
    compressedBytes,
    productExecuted: 0,
    candidateUIExecuted: 0,
    Q1Closed: false,
  };
}
export function checkEvidenceControls(a) {
  verifyEvidence(a);
  const controls = [];
  const reject = (name, mutate) => {
    const b = structuredClone(a);
    mutate(b);
    assert.throws(() => verifyEvidence(b), name);
    controls.push({ name, rejected: true });
  };
  reject("empty object", (b) => {
    for (const k of Object.keys(b)) delete b[k];
  });
  reject("formal oracle overclaim", (b) => {
    b.formalUIOracle = true;
  });
  reject("required first failure removed", (b) => {
    b.captures = b.captures.filter((c) => c.name !== "browser-first");
  });
  reject("stream checksum corrupted", (b) => {
    b.captures[0].stdout.sha256 = "0".repeat(64);
  });
  reject("raw heap reference missing", (b) => {
    b.rawHeapRefs.pop();
  });
  reject("sidecar traversal", (b) => {
    b.rawHeapRefs[0].file = "../escape";
  });
  reject("input pin missing", (b) => {
    b.inputPins.pop();
  });
  reject("semantic late-at-cutoff forged with valid compression", (b) => {
    const c = b.captures.find((c) => c.name === "browser-final"),
      r = JSON.parse(decode(c.stdout));
    r.cases[0].cutoffMarkers[0].lateInstalled = true;
    const raw = Buffer.from(JSON.stringify(r));
    c.stdout = {
      bytes: raw.length,
      sha256: sha(raw),
      gzipBase64: gzipSync(raw).toString("base64"),
    };
  });
  return {
    positive: 1,
    negative: controls.length,
    controls,
    productExecuted: 0,
  };
}
