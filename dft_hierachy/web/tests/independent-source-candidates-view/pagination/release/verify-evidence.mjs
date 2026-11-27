// Metadata only: never imports product, launches browser, or counts archival checks as UI execution.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
const fixed = {
    product: "f725b1e2445744e5f4398bbd8fd2ace31ceb6cef",
    previousB: "4f4fb5ba10c49487b566096112cf16e7af86c123",
    freeze: "ad3e74954bc522f656572a310a029799c551759b",
    setupFreeze: "f27fee694e70848bb08cda01446852bf39e098b2",
    repair: "c8b42f8bb748e1baab2615c4f104f9ce2fa272e0",
  },
  scope = {
    facilityOnly: true,
    originalEightExpectationsUnchanged: true,
    originalB33ArchivesUnchanged: true,
    newRestorationCases: 11,
    baselinePassed: 6,
    baselineFailed: 5,
    repairedPassed: 11,
    oldNodePassed: 11,
    oldBrowserPassed: 11,
    DOMPlanned: 8,
    DOMExecuted: 0,
    DOMPassed: 0,
    DOMBlocked: 8,
    DOMSkipped: 0,
    Q1Closed: false,
    strongOriginalPromiseProven: false,
    A33IssueClosedByB: false,
    C95ClosedByC: true,
    Q2Closed: true,
    CoreExecuted: false,
    ElectronExecuted: false,
    fullGateRerun: false,
    M5Complete: false,
  };
const pins = [
    {
      path: "docs/plans/M5-source-candidates-view-b34-observer-release.md",
      bytes: 3339,
      sha256:
        "88f1777dbbf757b1b2803a247a7ee1f632bc1928a961a20291ea5fa1695dba79",
    },
    {
      path: "web/tests/independent-source-candidates-view/pagination/release/README.md",
      bytes: 1311,
      sha256:
        "21e1f40ba6b79b0953d89c62b73afd9326b141e5c66dbff721776dc3cc741417",
    },
    {
      path: "web/tests/independent-source-candidates-view/pagination/release/cases.mjs",
      bytes: 2813,
      sha256:
        "51250252deec5d9c12b94f588bfb47dc72e9d0dd4959182094159b100e9f12f0",
    },
    {
      path: "web/tests/independent-source-candidates-view/pagination/release/release.test.mjs",
      bytes: 6112,
      sha256:
        "ec3bf6890ff3f191d9b80dffd88d2ee70df2715c534309515dda2d5e073c5fed",
    },
    {
      path: "web/tests/independent-source-candidates-view/pagination/public-calls.mjs",
      bytes: 2164,
      sha256:
        "d0dbb8f616429fbd38787be486e8824f708adbfc5e3301d25f6c143de5bf5697",
    },
  ],
  names = [
    "fixed-product",
    "initial-protection",
    "install-locked-tools",
    "format-new-release-inputs",
    "release-freeze-stage",
    "release-freeze-diff-check",
    "release-freeze-commit",
    "frozen-unmodified-B-release-baseline",
    "frozen-fixed-P-release-baseline",
    "fixed-web-build",
    "format-setup-inputs",
    "strict-pre-repair-protection",
    "setup-freeze-stage",
    "setup-freeze-diff-check",
    "setup-freeze-commit",
    "frozen-unmodified-B-setup-baseline",
    "frozen-fixed-P-setup-baseline",
    "format-repaired-helper",
    "repaired-frozen-release-suite",
    "fixed-P-negative-replay",
    "old-eleven-node-regression",
    "old-eleven-browser-regression",
    "candidate-eight-capability-gate",
    "old-P-history-input-pins",
    "old-B-history-metadata",
    "old-B-input-pin-refusal",
    "authorize-single-helper-delta",
    "repair-stage",
    "repair-diff-check",
    "repair-commit",
    "fixed-web-check",
    "repaired-protection",
    "own-freeze-source-metadata",
    "own-test-and-helper-delta",
    "runtime-frozen-input-integrity",
    "format-evidence-verifier",
    "source-format-check",
    "pre-seal-protection",
  ];
const oldHelper = {
  bytes: 2045,
  sha256: "62f440139ca838de6669914f8eb5371ed42b26a475c9d6d42339f57649946b54",
};
const sha = (b) => createHash("sha256").update(b).digest("hex");
const unpack = (data, bytes, digest) => {
  const b = gunzipSync(Buffer.from(data, "base64"));
  assert.equal(b.length, bytes);
  assert.equal(sha(b), digest);
  return b;
};
export function verify(a, current = false) {
  assert.equal(a.format, "B34-observer-restoration-v1");
  assert.deepEqual(a.fixed, fixed);
  assert.deepEqual(a.scope, scope);
  assert.deepEqual(a.inputs, pins);
  assert.deepEqual(
    a.captures.map((c) => c.name),
    names,
  );
  assert.equal(new Set(names).size, names.length);
  const texts = new Map(),
    materials = new Map();
  for (const c of a.captures) {
    assert.equal(c.capture_complete, true);
    assert.ok(c.command.length && c.cwd && c.utc);
    assert.ok(Number.isFinite(c.seconds) && c.seconds >= 0);
    texts.set(
      c.name,
      unpack(c.stdout_gzip_base64, c.stdout_bytes, c.stdout_sha256).toString(),
    );
  }
  for (const m of a.materials) {
    assert.ok(!materials.has(m.id));
    materials.set(m.id, unpack(m.gzip_base64, m.bytes, m.sha256));
  }
  const get = (n) => {
      assert.ok(texts.has(n), "missing " + n);
      return texts.get(n);
    },
    one = (n) => JSON.parse(get(n)),
    cap = (n) => a.captures.find((c) => c.name === n);
  const root = fileURLToPath(new URL("../../../../../", import.meta.url));
  for (const p of pins) {
    const b = materials.get("input:" + p.path);
    assert.ok(b);
    assert.equal(b.length, p.bytes);
    assert.equal(sha(b), p.sha256);
    if (current) {
      const now = fs.readFileSync(path.join(root, p.path));
      assert.equal(now.length, p.bytes);
      assert.equal(sha(now), p.sha256);
    }
  }
  const old = materials.get("old-helper");
  assert.equal(old.length, oldHelper.bytes);
  assert.equal(sha(old), oldHelper.sha256);
  const auth = JSON.parse(materials.get("authorization"));
  assert.deepEqual(a.authorization, auth);
  assert.equal(auth.file, pins[4].path);
  for (const k of ["bytes", "sha256"]) {
    assert.equal(auth.old[k], oldHelper[k]);
    assert.equal(auth.current[k], pins[4][k]);
  }
  assert.equal(auth.firstFreeze, fixed.freeze);
  assert.equal(auth.setupFreeze, fixed.setupFreeze);
  assert.equal(materials.size, 24);
  assert.deepEqual(a.historyUnchanged, [
    {
      path: "docs/m5_b_source_candidates_view_pagination.json",
      bytes: 1006276,
      sha256:
        "59c9b99032ad5d74ba25931b7c9b96389c619f7bafde9f6396c3a5d216305a67",
    },
    {
      path: "docs/m5_b_source_candidates_view_pagination_controls.json",
      bytes: 48315,
      sha256:
        "60515fd9a62d3be93878c30060fa72206a85a203b812a97fd745f845f0f98f78",
    },
    {
      path: "web/tests/independent-source-candidates-view/pagination/verify-evidence.mjs",
      bytes: 8121,
      sha256:
        "d1569cfc6e44670a6aa5174a0a2c4bbc220a00de915e571314dbbda835cabca8",
    },
    {
      path: "web/tests/independent-source-candidates-view/pagination/verify-controls.mjs",
      bytes: 6711,
      sha256:
        "340bbbb3aad8bba657a15fc353a1b0f8495b6c84402554d398799238903124d8",
    },
  ]);
  const tap = (name, total, pass, fail, ids = []) => {
    const t = get(name);
    assert.equal(cap(name).exit_code, fail ? 1 : 0);
    for (const [k, n] of Object.entries({
      tests: total,
      pass,
      fail,
      cancelled: 0,
      skipped: 0,
      todo: 0,
    }))
      assert.match(t, new RegExp("^# " + k + " " + n + "$", "m"));
    assert.equal((t.match(/^ok \d+ - /gm) || []).length, pass);
    assert.equal((t.match(/^not ok \d+ - /gm) || []).length, fail);
    assert.deepEqual(
      [...t.matchAll(/^not ok \d+ - (B34-R\d+)/gm)].map((m) => m[1]),
      ids,
    );
  };
  for (const n of [
    "frozen-unmodified-B-release-baseline",
    "frozen-fixed-P-release-baseline",
  ])
    tap(n, 8, 5, 3, ["B34-R03", "B34-R04", "B34-R05"]);
  for (const n of [
    "frozen-unmodified-B-setup-baseline",
    "frozen-fixed-P-setup-baseline",
    "fixed-P-negative-replay",
  ])
    tap(n, 11, 6, 5, ["B34-R03", "B34-R04", "B34-R05", "B34-R10", "B34-R11"]);
  tap("repaired-frozen-release-suite", 11, 11, 0);
  tap("old-eleven-node-regression", 11, 11, 0);
  const browser = one("old-eleven-browser-regression");
  for (const k of ["planned", "executed", "passed"])
    assert.equal(browser[k], 11);
  for (const k of ["failed", "blocked", "skipped", "exitCode"])
    assert.equal(browser[k], 0);
  assert.equal(browser.results.length, 11);
  assert.ok(browser.results.every((r) => r.pass));
  assert.deepEqual(browser.cleanup, { errors: [], unhandled: [] });
  assert.deepEqual(browser.releaseErrors, []);
  assert.equal(browser.fixed, fixed.product);
  const dom = one("candidate-eight-capability-gate");
  assert.equal(dom.stage, "public-component-capability");
  for (const [k, v] of Object.entries({
    planned: 8,
    executed: 0,
    passed: 0,
    failed: 0,
    blocked: 8,
    skipped: 0,
    exitCode: 1,
  }))
    assert.equal(dom[k], v);
  assert.match(
    dom.error,
    /missing production @hier\/views SourceCandidatesView/,
  );
  assert.deepEqual(dom.releaseErrors, []);
  assert.equal(dom.bundleSha256, browser.bundleSha256);
  assert.equal(dom.fixed, fixed.product);
  const meta = one("runtime-frozen-input-integrity");
  assert.deepEqual(meta.inputPins, pins);
  assert.equal(meta.declarations.length, 49);
  for (const k of [
    "firstEightBodiesUnchanged",
    "firstEightMetadataUnchanged",
    "setupFrozenInputsUnchangedAfterRepair",
    "generatedDeclarationBytesEqual",
  ])
    assert.equal(meta[k], true);
  assert.equal(meta.repair, fixed.repair);
  assert.equal(meta.BStatus, "");
  for (const n of ["repaired-protection", "pre-seal-protection"]) {
    const p = one(n);
    assert.equal(p.protected, true);
    assert.deepEqual(p.counts, [1235, 832, 1217]);
    assert.equal(p.authorizedOldPaths, 1);
    assert.equal(p.declarations, 49);
    assert.equal(p.binaries.length, 3);
    assert.deepEqual(p.authorization, auth);
    assert.equal(p.BHead, fixed.repair);
  }
  for (const n of ["old-P-history-input-pins", "old-B-history-metadata"]) {
    const h = one(n);
    assert.equal(h.metadataOnly, true);
    assert.equal(h.currentProductExecuted, 0);
    assert.equal(h.captures, 26);
  }
  assert.match(get("old-B-input-pin-refusal"), /2164 !== 2045/);
  const bad = [
    "frozen-unmodified-B-release-baseline",
    "frozen-fixed-P-release-baseline",
    "frozen-unmodified-B-setup-baseline",
    "frozen-fixed-P-setup-baseline",
    "fixed-P-negative-replay",
    "candidate-eight-capability-gate",
    "old-B-input-pin-refusal",
  ];
  assert.deepEqual(a.nonzeroCaptureNames, bad);
  for (const c of a.captures)
    assert.equal(c.exit_code, bad.includes(c.name) ? 1 : 0);
  const audit = materials.get("helper-audit");
  assert.equal(
    sha(audit),
    "8d04af196e31e71623857beb5826c198f944dbf1bf791fbda6273906fc0b280c",
  );
  const h = JSON.parse(audit);
  assert.equal(h.commands.length, 18);
  for (const c of h.commands) {
    assert.equal(c.status, 0);
    for (const k of ["stdout", "stderr"])
      unpack(c[k].gzipBase64, c[k].bytes, c[k].sha256);
  }
  assert.equal(
    sha(materials.get("DESIGN")),
    "6243ab96818575bae7053e780398295da3a56eca3475d2d0f4d54c790fb11b14",
  );
  for (const id of [
    "protection-program",
    "initial-protection-snapshot",
    "runtime-program",
    "authorization-program",
    "capture-wrapper",
    "helper-audit-program",
    "helper-audit-manifest",
  ])
    assert.ok(materials.has(id), id);
  return {
    verified: true,
    metadataOnly: true,
    currentProductExecuted: 0,
    captures: a.captures.length,
    materials: materials.size,
    inputs: pins.length,
    baseline: { tests: 11, passed: 6, failed: 5 },
    repaired: { tests: 11, passed: 11, failed: 0 },
    oldNode: 11,
    oldBrowser: 11,
    DOM: { planned: 8, executed: 0, passed: 0, blocked: 8, skipped: 0 },
    Q1Closed: false,
    A33IssueClosedByB: false,
  };
}
export function selfTest(a) {
  verify(a);
  const results = [{ id: "positive-history", rejected: false, accepted: true }];
  const rewrite = (b, name, fn) => {
    const c = b.captures.find((c) => c.name === name),
      raw = gunzipSync(Buffer.from(c.stdout_gzip_base64, "base64")).toString(),
      v = Buffer.from(fn(raw));
    c.stdout_gzip_base64 = gzipSync(v).toString("base64");
    c.stdout_bytes = v.length;
    c.stdout_sha256 = sha(v);
  };
  const changes = [
    ["corrupt-stream", (b) => (b.captures[0].stdout_gzip_base64 = "invalid")],
    ["wrong-digest", (b) => (b.captures[0].stdout_sha256 = "0".repeat(64))],
    ["missing-capture", (b) => b.captures.pop()],
    [
      "baseline-summary-relabeled",
      (b) =>
        rewrite(b, "frozen-fixed-P-setup-baseline", (s) =>
          s.replace("# pass 6", "# pass 7"),
        ),
    ],
    [
      "wrong-baseline-failure-id",
      (b) =>
        rewrite(b, "frozen-fixed-P-setup-baseline", (s) =>
          s.replace("not ok 3 - B34-R03", "not ok 3 - B34-R99"),
        ),
    ],
    [
      "repaired-summary-relabeled",
      (b) =>
        rewrite(b, "repaired-frozen-release-suite", (s) =>
          s.replace("# pass 11", "# pass 10"),
        ),
    ],
    [
      "browser-cleanup-hidden",
      (b) =>
        rewrite(b, "old-eleven-browser-regression", (s) => {
          const o = JSON.parse(s);
          o.cleanup.errors.push("injected");
          return JSON.stringify(o);
        }),
    ],
    [
      "capability-as-ui-pass",
      (b) =>
        rewrite(b, "candidate-eight-capability-gate", (s) => {
          const o = JSON.parse(s);
          o.passed = 8;
          return JSON.stringify(o);
        }),
    ],
    ["Q1-overclaim", (b) => (b.scope.Q1Closed = true)],
    [
      "missing-material",
      (b) => (b.materials = b.materials.filter((m) => m.id !== "old-helper")),
    ],
  ];
  for (const [id, change] of changes) {
    const b = structuredClone(a);
    change(b);
    assert.throws(() => verify(b), undefined, id);
    results.push({ id, rejected: true });
  }
  return {
    metadataOnly: true,
    currentProductExecuted: 0,
    positive: 1,
    negative: 10,
    results,
  };
}
export function verifyReceipts(c, a, rawArchive) {
  assert.equal(c.format, "B34-observer-restoration-receipts-v1");
  assert.equal(c.archive.bytes, rawArchive.length);
  assert.equal(c.archive.sha256, sha(rawArchive));
  const expected = [
    "seal-portable-archive",
    "verify-portable-archive",
    "verify-current-repaired-inputs",
    "portable-metadata-negative-controls",
    "report-format-check",
    "report-pre-commit-protection",
  ];
  assert.deepEqual(
    c.captures.map((r) => r.name),
    expected,
  );
  const out = new Map();
  for (const r of c.captures) {
    assert.equal(r.exit_code, 0);
    assert.equal(r.capture_complete, true);
    assert.ok(r.command.length && r.cwd && r.utc);
    assert.ok(Number.isFinite(r.seconds) && r.seconds >= 0);
    out.set(
      r.name,
      unpack(r.stdout_gzip_base64, r.stdout_bytes, r.stdout_sha256).toString(),
    );
  }
  const sealed = JSON.parse(out.get("seal-portable-archive"));
  assert.equal(sealed.bytes, rawArchive.length);
  assert.equal(sealed.sha256, sha(rawArchive));
  for (const n of ["verify-portable-archive", "verify-current-repaired-inputs"])
    assert.deepEqual(JSON.parse(out.get(n)), verify(a));
  assert.deepEqual(
    JSON.parse(out.get("portable-metadata-negative-controls")),
    selfTest(a),
  );
  assert.match(
    out.get("report-format-check"),
    /All matched files use Prettier code style!/,
  );
  const p = JSON.parse(out.get("report-pre-commit-protection"));
  assert.equal(p.protected, true);
  assert.equal(p.authorizedOldPaths, 1);
  assert.equal(p.declarations, 49);
  return {
    verified: true,
    metadataOnly: true,
    currentProductExecuted: 0,
    receipts: c.captures.length,
    positive: 1,
    negative: 10,
  };
}
function isMainEntry() {
  if (typeof import.meta.main === "boolean") return import.meta.main;
  if (
    process.execArgv.some((arg) =>
      /^(?:--eval|--print)(?:=|$)|^-[ep]+$/.test(arg),
    )
  )
    return false;
  if (!process.argv[1]) return false;
  let entry;
  try {
    entry = fs.realpathSync(process.argv[1]);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
    throw error;
  }
  return entry === fs.realpathSync(fileURLToPath(import.meta.url));
}
if (isMainEntry()) {
  const i = process.argv.indexOf("--archive"),
    file =
      i >= 0
        ? process.argv[i + 1]
        : fileURLToPath(
            new URL(
              "../../../../../docs/m5_b_observer_restoration.json",
              import.meta.url,
            ),
          ),
    raw = fs.readFileSync(file),
    a = JSON.parse(raw),
    ci = process.argv.indexOf("--verify-controls");
  console.log(
    JSON.stringify(
      ci >= 0
        ? verifyReceipts(
            JSON.parse(fs.readFileSync(process.argv[ci + 1])),
            a,
            raw,
          )
        : process.argv.includes("--self-test")
          ? selfTest(a)
          : verify(a, process.argv.includes("--inputs")),
      null,
      2,
    ),
  );
}
