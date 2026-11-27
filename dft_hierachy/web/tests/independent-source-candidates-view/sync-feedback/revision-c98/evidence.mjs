// Pure archive verification API. Direct node execution does not verify anything.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const decode = (m) => {
  const b = gunzipSync(Buffer.from(m.gzipBase64, "base64"));
  assert.equal(b.length, m.bytes);
  assert.equal(sha(b), m.sha256);
  return b;
};
export function verifyEvidence(a, { root } = {}) {
  assert.equal(a.kind, "B-C98-independent-original-S02-facility-revision");
  assert.deepEqual(a.fixed, {
    product: "0a0f0f17c80606781d91317065a69b65b380459c",
    initialB: "738d21c959b6e7858693d330b40d51414c00342a",
    firstFreeze: "6430529f1303c37864d07da95d3980dde6d55bdb",
    firstRepair: "172b742df7840d50e702c89da5858d3e4219a693",
    lateCounterexampleFreeze: "1dae4eb59c2cd3d95bb4bc33289aa83aab342f2b",
    revision: "ee9e1a1b7fed62e5de42cb97c7e4850fe7d1ddc0",
  });
  assert.deepEqual(a.scope, {
    newChannelUnits: 13,
    relatedUnits: 74,
    browserPremises: 4,
    facilitiesOnlyControls: 4,
    DOM: {
      planned: 2,
      executed: 0,
      passed: 0,
      failed: 0,
      blocked: 2,
      skipped: 0,
    },
    C98Closed: false,
    Q1Closed: false,
    fullM5Passed: false,
    productionCandidateUIExecuted: 0,
    ElectronPassed: false,
  });
  assert(a.captures.length >= 40);
  assert.equal(new Set(a.captures.map((r) => r.name)).size, a.captures.length);
  assert.deepEqual(
    a.captures
      .filter((r) => r.exit !== 0)
      .map((r) => r.name)
      .sort(),
    [
      "C98-legacy-leak-initial-failure",
      "C98-revised-S01-boundary-positive",
      "C98-revised-product-DOM",
      "C98-same-wrapper-initial-failure",
      "C98-final-product-capability",
    ].sort(),
  );
  for (const r of a.captures) {
    assert.equal(r.signal, null);
    assert.equal(r.error, null);
    assert.equal(r.captureComplete, true);
    assert(Array.isArray(r.command) && r.command.length);
    assert(path.isAbsolute(r.cwd));
    assert(r.seconds >= 0);
    decode(r.stdout);
    decode(r.stderr);
  }
  const raw = (name) => {
      const r = a.captures.find((r) => r.name === name);
      assert(r, "missing " + name);
      return decode(r.stdout);
    },
    json = (name) => JSON.parse(raw(name));
  const units = raw("C98-final-74-related-units").toString().split("\n");
  for (const [k, v] of Object.entries({
    tests: 74,
    pass: 74,
    fail: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
  }))
    assert(units.includes("# " + k + " " + v));
  const legacy = json("C98-legacy-leak-initial-failure");
  assert.equal(legacy.detail.pass, true);
  assert.equal(legacy.expectationMet, false);
  assert.deepEqual(legacy.cleanup, { errors: [], unhandled: [] });
  assert.equal(legacy.native.length, 1);
  assert.equal(legacy.native[0].originalE, true);
  assert.equal(legacy.pageErrors.length, 1);
  for (const name of [
    "C98-legacy-suppress-positive",
    "C98-final-S02-positive-after-event-snapshot",
  ]) {
    const r = json(name);
    assert.equal(r.expectationMet, true);
    assert.equal(r.detail.pass, true);
    assert.equal(r.detail.confirmations, 1);
    assert.equal(r.detail.callbackCalls, 0);
    assert.equal(r.detail.boundaryCaptures, 0);
    assert.deepEqual(r.native, []);
    assert.deepEqual(r.pageErrors, []);
  }
  const negative = json("C98-final-S02-negative-after-event-snapshot");
  assert.equal(negative.expectationMet, true);
  assert(negative.runRejected.includes("unexpected native window.error"));
  assert.equal(negative.detail, undefined);
  assert.equal(negative.native.length, 1);
  assert.equal(negative.native[0].originalE, true);
  assert.equal(negative.cleanup.globalErrors.length, 1);
  const firstWrapper = json("C98-same-wrapper-initial-failure");
  assert.equal(firstWrapper.detail.pass, true);
  assert.equal(firstWrapper.expectationMet, false);
  assert(
    firstWrapper.native.some((e) => e.lateLeakCount > 0 && e.originalWrapper),
  );
  const lastWrapper = json("C98-same-wrapper-final-negative");
  assert.equal(lastWrapper.expectationMet, true);
  assert(lastWrapper.runRejected);
  assert(lastWrapper.cleanup.globalErrors.length > 0);
  assert(
    lastWrapper.native
      .filter((e) => e.lateLeakCount > 0)
      .every((e) => e.originalWrapper && !e.originalE),
  );
  const boundary = json("C98-final-S01-positive");
  assert.equal(boundary.expectationMet, true);
  assert.equal(boundary.detail.callbackCalls, 1);
  assert.equal(boundary.detail.boundaryCaptures, 1);
  assert.deepEqual(boundary.cleanup.globalErrors, []);
  assert.deepEqual(boundary.cleanup.unhandled, []);
  assert(boundary.cleanup.boundaryEvents.length > 0);
  const control = json("C98-final-controls");
  for (const [k, v] of Object.entries({
    planned: 4,
    executed: 4,
    passed: 4,
    failed: 0,
    blocked: 0,
    skipped: 0,
  }))
    assert.equal(control[k], v);
  assert(control.results.every((r) => r.pass && r.candidateUI === false));
  assert.deepEqual(control.cleanup.errors, []);
  assert.deepEqual(control.cleanup.globalErrors, []);
  assert.deepEqual(control.cleanup.unhandled, []);
  const dom = json("C98-final-product-capability");
  for (const [k, v] of Object.entries(a.scope.DOM)) assert.equal(dom[k], v);
  assert.equal(dom.stage, "public-component-capability");
  assert(dom.cssMissing);
  assert(dom.error.includes("missing production"));
  assert.deepEqual(dom.gatePageErrors, []);
  assert.deepEqual(dom.results, []);
  assert.deepEqual(dom.releaseErrors, []);
  assert.equal(dom.bundleSha256, control.bundleSha256);
  const materials = new Map();
  for (const m of a.materials) {
    assert(!materials.has(m.name));
    const b = decode(m);
    materials.set(m.name, b);
    if (root && m.file)
      assert.deepEqual(fs.readFileSync(path.join(root, m.file)), b);
  }
  for (const n of [
    "report.md",
    "evidence.mjs",
    "initial.json",
    "protect.mjs",
    "capture.mjs",
    "seal.mjs",
    "lineage-final.json",
    "lineage-final.mjs",
    "setup-limitations.txt",
    "DESIGN.md",
  ])
    assert(materials.has(n));
  assert.equal(
    sha(materials.get("DESIGN.md")),
    "66e4f5e882aa9ba9678215e367c4b17cee61cc91410fa7b63e57e399c40ede1d",
  );
  const lineage = JSON.parse(materials.get("lineage-final.json"));
  assert.equal(lineage.commands.length, 14);
  assert.equal(lineage.initial.length, 6);
  assert.equal(lineage.old.length, 2);
  assert.equal(lineage.current.length, 8);
  assert.equal(lineage.intermediate.length, 2);
  assert.equal(lineage.oldLiveRootRejected, true);
  assert.equal(lineage.compiled98Unchanged, true);
  for (const r of lineage.commands) {
    assert.equal(r.exit, 0);
    decode(r.stdout);
    decode(r.stderr);
  }
  for (const m of [
    ...lineage.initial,
    ...lineage.old,
    ...lineage.current,
    ...lineage.intermediate,
  ])
    decode(m);
  for (const m of lineage.current)
    if (root)
      assert.deepEqual(fs.readFileSync(path.join(root, m.file)), decode(m));
  assert.deepEqual(a.references, lineage.references);
  for (const p of a.references)
    if (root) {
      const b = fs.readFileSync(path.join(root, p.file));
      assert.equal(b.length, p.bytes);
      assert.equal(sha(b), p.sha256);
    }
  const guard = json("C98-final-protection");
  assert.equal(guard.protected, true);
  assert.deepEqual(guard.counts, [1339, 939, 1321]);
  assert.equal(guard.authorizedChangedB.length, 2);
  assert.equal(guard.declarations, 49);
  assert.equal(guard.binaries.length, 3);
  let bundles = 0;
  for (const r of a.captures)
    if (
      r.name.includes("positive") ||
      r.name.includes("negative") ||
      r.name.includes("initial-failure")
    ) {
      const out = JSON.parse(decode(r.stdout));
      if (out.bundle) {
        decode(out.bundle);
        bundles++;
        assert.equal(out.productionCandidateUIExecuted, 0);
        assert.equal(out.aliasIsIntentionalControl, true);
        assert.deepEqual(out.releaseErrors, []);
      }
    }
  assert(bundles >= 12);
  return {
    verified: true,
    captures: a.captures.length,
    streams: 2 * a.captures.length,
    materials: materials.size,
    nestedBundles: bundles,
    rawGitCommands: 14,
    productExecution: 0,
  };
}
export function checkEvidenceControls(a, options) {
  const positive = verifyEvidence(a, options),
    negative = [];
  for (const [name, mutate] of [
    ["empty", (a) => (a.captures = [])],
    [
      "lost-red",
      (a) =>
        (a.captures = a.captures.filter(
          (r) => r.name !== "C98-legacy-leak-initial-failure",
        )),
    ],
    ["false-UI-green", (a) => (a.scope.DOM.passed = 2)],
    ["false-C98-close", (a) => (a.scope.C98Closed = true)],
    ["corrupt-stream", (a) => (a.captures[0].stdout.sha256 = "0".repeat(64))],
    [
      "missing-lineage",
      (a) =>
        (a.materials = a.materials.filter(
          (m) => m.name !== "lineage-final.json",
        )),
    ],
  ]) {
    const c = structuredClone(a);
    mutate(c);
    assert.throws(() => verifyEvidence(c, options));
    negative.push({ name, rejected: true });
  }
  return { positive, negative, productExecution: 0 };
}
