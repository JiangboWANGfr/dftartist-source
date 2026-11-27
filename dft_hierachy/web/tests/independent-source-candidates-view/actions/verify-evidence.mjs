// Archive/CLI metadata verification only. Never product/browser semantic execution.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
const fixed = {
    product: "54ff2866c174c92212ccf62c5b65d7b537ecf96d",
    previousB: "49853d988fd60dc58869c25e33e37a6765d63f63",
    initialActions: "fea9ebd17bb72166d0b6e59c9da0f2fb406cdf5c",
    actions: "8a3bd0ad6efad897c354516cd2ae1b30ee977894",
    initialCLI: "325f28a1d338f1156432ba08a7022a20b6d2dfd3",
    classifiedCLI: "030d47eceaf7a9ed5b921dec6573eb3228a14e28",
    CLIRepair: "feeead2d8ff4b7fb4315e7605499078e2acf477f",
    importFreeze: "f792a7abdd59317602d0288c2bd0595a00d63dd8",
    importRepair: "27ed9f7e9d893b5599fa0196d51cf8d8402f19b3",
    registration: "0fd82ec03af7009d2a830cc211d5b4b4c1a30773",
  },
  scope = {
    partialFreeze: true,
    newDOMPlanned: 8,
    newDOMExecuted: 0,
    newDOMPassed: 0,
    newDOMBlocked: 8,
    newDOMSkipped: 0,
    cumulativeDOMPlanned: 72,
    old30TypesRerun: false,
    nodeFacilities: 17,
    browserPremises: 9,
    finalCLI: 16,
    CLIInitialPassed: 7,
    CLIInitialFailed: 5,
    importBaselinePassed: 12,
    importBaselineFailed: 4,
    abortedRunsAreAcceptance: false,
    Q1Closed: false,
    strongOriginalPromiseProven: false,
    C96ClosedByB: false,
    A33ClosedByA: true,
    C95ClosedByC: true,
    Q2Closed: true,
    CoreExecuted: false,
    ElectronExecuted: false,
    fullGateRerun: false,
    M5Complete: false,
  },
  pins = [
    {
      path: "docs/plans/M5-b35-evidence-cli.md",
      bytes: 2195,
      sha256:
        "dc589b6213058e527cc7ccc66dc7282e86e2f76f2bd97c532148371edfcf67b1",
    },
    {
      path: "docs/plans/M5-source-candidates-view-b35-actions.md",
      bytes: 3463,
      sha256:
        "f7e52b3b19397c261b5c66f38b016e02ac0e30eed410c3c68c3e1be389ece8a9",
    },
    {
      path: "web/tests/independent-source-candidates-view/actions/README.md",
      bytes: 3199,
      sha256:
        "b7cd6de80d7c1b6554ce06ee0bb8ec7f01a31e5debc810b84d1fa7accd02788e",
    },
    {
      path: "web/tests/independent-source-candidates-view/actions/assertions.mjs",
      bytes: 2242,
      sha256:
        "6cabcf1edf0b0949c01bfdf5d6de73906d2a3ae8c79709af176cbf53b3572e45",
    },
    {
      path: "web/tests/independent-source-candidates-view/actions/cases.mjs",
      bytes: 2308,
      sha256:
        "d497ddcd30c40881e33a1b556bb0830ca74bc6cf810df08c5342bcd69b0b67ef",
    },
    {
      path: "web/tests/independent-source-candidates-view/actions/facility.test.mjs",
      bytes: 5249,
      sha256:
        "ee33721e09cc2f251a41482374023f69de0662f617e4989ac30943202636795d",
    },
    {
      path: "web/tests/independent-source-candidates-view/actions/fixture.jsx",
      bytes: 10226,
      sha256:
        "46539f294b6d46af48c886e20050f3bc03a3ec2d11245f2cde54f403064ee277",
    },
    {
      path: "web/tests/independent-source-candidates-view/actions/input.mjs",
      bytes: 290,
      sha256:
        "d000238d74b0ec697c5c99d463bc8ff1962f6ccbe589cbb55bd430eb783e84a6",
    },
    {
      path: "web/tests/independent-source-candidates-view/actions/public-model.mjs",
      bytes: 1637,
      sha256:
        "093a55a808c480354ada5fb8ee8a38db1225270a70d67427e412aacbd9fd0d1b",
    },
    {
      path: "web/tests/independent-source-candidates-view/actions/run.mjs",
      bytes: 9567,
      sha256:
        "39f7eb12d5df2b5a74d16ccc5f29ddd6694364d7f81a591d016cc411f9cd4eb3",
    },
    {
      path: "web/tests/independent-source-candidates-view/pagination/release/cli.test.mjs",
      bytes: 5730,
      sha256:
        "8ddf15d293c050835a3f220bd25d4fc4214869c48ebe544f5c891e690c840647",
    },
    {
      path: "web/tests/independent-source-candidates-view/pagination/release/verify-evidence.mjs",
      bytes: 16565,
      sha256:
        "7273b685996dbc61178a0721a87972aebb21050d803b3abf7582ef50ae518933",
    },
  ],
  initialPins = [
    {
      path: "docs/plans/M5-source-candidates-view-b35-actions.md",
      bytes: 3035,
      sha256:
        "c78ed5355bbf759b2f9ab0ad452de55cb5ed8ce91df96663bc24949d9842c231",
    },
    {
      path: "web/tests/independent-source-candidates-view/actions/README.md",
      bytes: 2034,
      sha256:
        "fe908d9067d29ae9bd990467e444bf7d889e8698a4b1d2c567875878fac6983b",
    },
    {
      path: "web/tests/independent-source-candidates-view/actions/assertions.mjs",
      bytes: 1688,
      sha256:
        "de03adbb1dbea8740c94e8408b83657ffaeed379e315c5a39a5708de56f5769a",
    },
    {
      path: "web/tests/independent-source-candidates-view/actions/cases.mjs",
      bytes: 2258,
      sha256:
        "29adc1d8e11bce5923fdedf7c477197db5f6e0adfa6c2fd76054db068643301c",
    },
    {
      path: "web/tests/independent-source-candidates-view/actions/facility.test.mjs",
      bytes: 4091,
      sha256:
        "9e95e9d92cd1245eab54eddc2fa284e627449abd7d340f576988058b3f1e9e96",
    },
    {
      path: "web/tests/independent-source-candidates-view/actions/fixture.jsx",
      bytes: 9125,
      sha256:
        "f2d95df961bd100d2ffb7e2755ff18fe7607ea797d4513b8bd59073a6fa402fb",
    },
    {
      path: "web/tests/independent-source-candidates-view/actions/public-model.mjs",
      bytes: 1637,
      sha256:
        "093a55a808c480354ada5fb8ee8a38db1225270a70d67427e412aacbd9fd0d1b",
    },
    {
      path: "web/tests/independent-source-candidates-view/actions/run.mjs",
      bytes: 9215,
      sha256:
        "aab1e301f10425e0cfb528d79f57d24f19e66a956e374fc6a2ade1e41abc9241",
    },
  ],
  names = [
    "fixed-product",
    "initial-protection",
    "install-locked-tools",
    "format-new-frozen-inputs",
    "fixed-web-build",
    "freeze-stage",
    "freeze-diff-check",
    "freeze-commit",
    "frozen-original-action-facilities",
    "frozen-real-model-and-native-premises",
    "frozen-original-action-DOM-baseline",
    "pre-correction-facility-witnesses",
    "format-facility-corrections",
    "correction-stage",
    "correction-diff-check",
    "correction-commit",
    "corrected-facility-witnesses",
    "corrected-original-action-facilities",
    "corrected-real-model-and-native-premises",
    "corrected-original-action-DOM-baseline",
    "old-B34-evidence-inputs",
    "old-B34-controls-metadata",
    "runtime-input-and-source-audit",
    "post-run-protection",
    "fixed-web-check",
    "freeze-expectation-integrity",
    "format-CLI-freeze",
    "CLI-freeze-stage",
    "CLI-freeze-diff-check",
    "CLI-freeze-commit",
    "frozen-unmodified-CLI-baseline",
    "format-CLI-fixture-classification",
    "CLI-classification-stage",
    "CLI-classification-diff-check",
    "CLI-classification-commit",
    "canonicalized-unmodified-CLI-baseline",
    "strict-pre-CLI-repair-protection",
    "format-repaired-CLI-entry",
    "repaired-frozen-CLI-suite",
    "authorize-single-CLI-entry-delta",
    "CLI-repair-stage",
    "CLI-repair-diff-check",
    "CLI-repair-commit",
    "final-repaired-CLI-suite",
    "post-CLI-repair-protection",
    "prepare-fixed-old-CLI-negative",
    "fixed-A-old-CLI-negative-replay",
    "format-import-freeze",
    "import-freeze-stage",
    "import-freeze-diff-check",
    "import-freeze-commit",
    "format-import-safe-entry",
    "import-safe-repair-stage",
    "import-safe-repair-diff-check",
    "import-safe-repair-commit",
    "unguarded-import-baseline",
    "final-sixteen-CLI-boundaries",
    "format-CLI-test-registration",
    "CLI-registration-stage",
    "CLI-registration-diff-check",
    "CLI-registration-commit",
    "completed-sixteen-CLI-boundaries",
    "prepare-unguarded-import-replay",
    "isolated-unguarded-import-baseline",
    "authorize-final-single-CLI-delta",
    "post-final-repair-protection",
    "frozen-source-format-check",
    "pre-seal-protection",
  ];
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  unpack = (s, n, h) => {
    const b = gunzipSync(Buffer.from(s, "base64"));
    assert.equal(b.length, n);
    assert.equal(sha(b), h);
    return b;
  };
export function verify(a, current = false) {
  assert.equal(a.format, "B35-actions-and-evidence-CLI-v1");
  assert.deepEqual(a.fixed, fixed);
  assert.deepEqual(a.scope, scope);
  assert.deepEqual(a.inputs, pins);
  assert.deepEqual(a.initialInputs, initialPins);
  assert.deepEqual(
    a.captures.map((c) => c.name),
    names,
  );
  assert.equal(new Set(names).size, names.length);
  const out = new Map(),
    materials = new Map();
  for (const c of a.captures) {
    assert.equal(c.capture_complete, true);
    assert.ok(c.command.length && c.cwd && c.utc);
    assert.ok(Number.isFinite(c.seconds) && c.seconds >= 0);
    out.set(
      c.name,
      unpack(c.stdout_gzip_base64, c.stdout_bytes, c.stdout_sha256).toString(),
    );
  }
  for (const m of a.materials) {
    assert.ok(!materials.has(m.id));
    materials.set(m.id, unpack(m.gzip_base64, m.bytes, m.sha256));
  }
  const cap = (n) => a.captures.find((c) => c.name === n),
    text = (n) => {
      assert.ok(out.has(n), n);
      return out.get(n);
    },
    one = (n) => JSON.parse(text(n)),
    root = fileURLToPath(new URL("../../../../", import.meta.url));
  for (const p of pins) {
    const b = materials.get("input:" + p.path);
    assert.ok(b);
    assert.equal(b.length, p.bytes);
    assert.equal(sha(b), p.sha256);
    if (current) {
      const c = fs.readFileSync(path.join(root, p.path));
      assert.equal(c.length, p.bytes);
      assert.equal(sha(c), p.sha256);
    }
  }
  for (const p of initialPins) {
    const b = materials.get("initial:" + p.path);
    assert.equal(b.length, p.bytes);
    assert.equal(sha(b), p.sha256);
  }
  const tap = (name, total, pass, fail, failed = []) => {
    const t = text(name);
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
    if (failed.length)
      assert.deepEqual(
        [...t.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]),
        failed,
      );
  };
  tap("frozen-original-action-facilities", 12, 12, 0);
  tap("pre-correction-facility-witnesses", 3, 1, 2);
  tap("corrected-facility-witnesses", 2, 2, 0);
  tap("corrected-original-action-facilities", 17, 17, 0);
  const aliases = [
    "valid",
    "invalid",
    "inputs-reject",
    "self-test",
    "controls",
  ].map((n) => "B35-CLI alias " + n);
  tap("frozen-unmodified-CLI-baseline", 12, 6, 6, [
    "B35-CLI canonical inputs-reject",
    ...aliases,
  ]);
  for (const n of [
    "canonicalized-unmodified-CLI-baseline",
    "fixed-A-old-CLI-negative-replay",
  ])
    tap(n, 12, 7, 5, aliases);
  for (const n of ["repaired-frozen-CLI-suite", "final-repaired-CLI-suite"])
    tap(n, 12, 12, 0);
  tap("completed-sixteen-CLI-boundaries", 16, 16, 0);
  tap("isolated-unguarded-import-baseline", 16, 12, 4, [
    "B35-CLI import canonical stdin",
    "B35-CLI import canonical eval-user-argument",
    "B35-CLI import alias stdin",
    "B35-CLI import alias eval-user-argument",
  ]);
  for (const n of [
    "unguarded-import-baseline",
    "final-sixteen-CLI-boundaries",
  ]) {
    assert.equal(cap(n).exit_code, 1);
    assert.match(text(n), /SIGTERM/);
  }
  assert.deepEqual(a.notAcceptanceRuns, [
    "unguarded-import-baseline",
    "final-sixteen-CLI-boundaries",
  ]);
  for (const n of [
    "frozen-original-action-DOM-baseline",
    "corrected-original-action-DOM-baseline",
  ]) {
    const r = one(n);
    for (const [k, v] of Object.entries({
      planned: 8,
      executed: 0,
      passed: 0,
      failed: 0,
      blocked: 8,
      skipped: 0,
      exitCode: 1,
    }))
      assert.equal(r[k], v);
    assert.equal(r.fixed, fixed.product);
    assert.equal(r.stage, "public-component-capability");
    assert.match(
      r.error,
      /missing production @hier\/views SourceCandidatesView/,
    );
    assert.deepEqual(r.releaseErrors, []);
  }
  for (const [n, count] of [
    ["frozen-real-model-and-native-premises", 8],
    ["corrected-real-model-and-native-premises", 9],
  ]) {
    const r = one(n);
    for (const k of ["planned", "executed", "passed"])
      assert.equal(r[k], count);
    for (const k of ["failed", "blocked", "skipped", "exitCode"])
      assert.equal(r[k], 0);
    assert.equal(r.results.length, count);
    assert.ok(r.results.every((x) => x.pass && x.candidateUI === false));
    assert.deepEqual(r.cleanup, { errors: [], unhandled: [] });
    assert.deepEqual(r.releaseErrors, []);
    assert.equal(r.fixed, fixed.product);
    assert.equal(
      r.bundleSha256,
      one(
        n.startsWith("frozen")
          ? "frozen-original-action-DOM-baseline"
          : "corrected-original-action-DOM-baseline",
      ).bundleSha256,
    );
  }
  const native = one("corrected-real-model-and-native-premises").results.at(-1);
  assert.equal(native.id, "B35-native-matching-pointer-ID");
  assert.equal(native.events.length, 3);
  for (const e of native.events) {
    assert.equal(e.pointerId, 35);
    assert.equal(e.pointerType, "mouse");
    assert.equal(e.trusted, false);
  }
  const audit = JSON.parse(materials.get("source-audit"));
  assert.equal(audit.imports.length, 4);
  assert.equal(audit.matching.length, 9);
  assert.deepEqual(audit.productionPathsChanged, []);
  assert.equal(audit.generatedDeclarationBytesEqual, true);
  assert.equal(audit.declarations.length, 49);
  for (const p of audit.imports)
    for (const k of ["patch", "raw"]) {
      const b = Buffer.from(p[k].base64, "base64");
      assert.equal(b.length, p[k].bytes);
      assert.equal(sha(b), p[k].sha256);
    }
  const integrity = one("freeze-expectation-integrity");
  assert.equal(integrity.caseIdsInputExpectedBasisUnchanged, true);
  assert.equal(integrity.detailCorrectedOnly, "B35-A01");
  assert.equal(integrity.old64And30AndHelpersUnchanged, true);
  const auth = JSON.parse(materials.get("authorization"));
  assert.deepEqual(a.authorization, auth);
  assert.equal(
    auth.old.sha256,
    "f383de46fca24dd48639b3591644daf2c142df68b8ba4f0ec41c5a4ea496d0a0",
  );
  assert.equal(
    auth.current.sha256,
    "7273b685996dbc61178a0721a87972aebb21050d803b3abf7582ef50ae518933",
  );
  assert.equal(sha(materials.get("old-CLI-entry")), auth.old.sha256);
  const p = one("pre-seal-protection");
  assert.equal(p.protected, true);
  assert.equal(p.authorizedOldPaths, 1);
  assert.deepEqual(p.counts, [1244, 840, 1226]);
  assert.equal(p.declarations, 49);
  assert.equal(p.binaries.length, 3);
  assert.deepEqual(p.authorization, auth);
  const bad = [
    "frozen-original-action-DOM-baseline",
    "pre-correction-facility-witnesses",
    "corrected-original-action-DOM-baseline",
    "frozen-unmodified-CLI-baseline",
    "canonicalized-unmodified-CLI-baseline",
    "fixed-A-old-CLI-negative-replay",
    "unguarded-import-baseline",
    "final-sixteen-CLI-boundaries",
    "isolated-unguarded-import-baseline",
  ];
  assert.deepEqual(a.nonzeroCaptureNames, bad);
  for (const c of a.captures)
    assert.equal(c.exit_code, bad.includes(c.name) ? 1 : 0);
  assert.equal(
    sha(materials.get("DESIGN")),
    "6243ab96818575bae7053e780398295da3a56eca3475d2d0f4d54c790fb11b14",
  );
  return {
    verified: true,
    metadataOnly: true,
    currentProductExecuted: 0,
    captures: a.captures.length,
    materials: materials.size,
    inputs: pins.length,
    DOM: { planned: 8, executed: 0, passed: 0, blocked: 8, skipped: 0 },
    nodeFacilities: 17,
    browserPremises: 9,
    CLI: 16,
    Q1Closed: false,
    C96ClosedByB: false,
  };
}
export function selfTest(a) {
  verify(a);
  const rewrite = (b, n, fn) => {
    const c = b.captures.find((c) => c.name === n),
      v = Buffer.from(
        fn(gunzipSync(Buffer.from(c.stdout_gzip_base64, "base64")).toString()),
      );
    c.stdout_gzip_base64 = gzipSync(v).toString("base64");
    c.stdout_bytes = v.length;
    c.stdout_sha256 = sha(v);
  };
  const changes = [
    ["bad-gzip", (b) => (b.captures[0].stdout_gzip_base64 = "bad")],
    ["missing-capture", (b) => b.captures.pop()],
    ["Q1-overclaim", (b) => (b.scope.Q1Closed = true)],
    [
      "DOM-as-pass",
      (b) =>
        rewrite(b, "corrected-original-action-DOM-baseline", (s) => {
          const r = JSON.parse(s);
          r.passed = 8;
          return JSON.stringify(r);
        }),
    ],
    [
      "CLI-pass-relabeled",
      (b) =>
        rewrite(b, "completed-sixteen-CLI-boundaries", (s) =>
          s.replace("# pass 16", "# pass 15"),
        ),
    ],
    [
      "missing-material",
      (b) =>
        (b.materials = b.materials.filter((m) => m.id !== "old-CLI-entry")),
    ],
  ];
  const results = [];
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
    negative: 6,
    results,
  };
}
export function verifyControls(c, a, raw) {
  assert.equal(c.format, "B35-actions-and-CLI-receipts-v1");
  assert.equal(c.archive.bytes, raw.length);
  assert.equal(c.archive.sha256, sha(raw));
  assert.deepEqual(
    c.captures.map((r) => r.name),
    [
      "seal-portable-archive",
      "verify-new-archive",
      "verify-new-archive-inputs",
      "new-archive-metadata-negative-controls",
      "new-archive-CLI-path-and-import-controls",
      "final-report-format-check",
      "report-protection",
    ],
  );
  const out = new Map();
  for (const r of c.captures) {
    assert.equal(r.exit_code, 0);
    assert.equal(r.capture_complete, true);
    assert.ok(r.command.length && r.cwd && r.utc);
    out.set(
      r.name,
      unpack(r.stdout_gzip_base64, r.stdout_bytes, r.stdout_sha256).toString(),
    );
  }
  const seal = JSON.parse(out.get("seal-portable-archive"));
  assert.equal(seal.bytes, raw.length);
  assert.equal(seal.sha256, sha(raw));
  for (const n of ["verify-new-archive", "verify-new-archive-inputs"])
    assert.deepEqual(JSON.parse(out.get(n)), verify(a));
  assert.deepEqual(
    JSON.parse(out.get("new-archive-metadata-negative-controls")),
    selfTest(a),
  );
  const cli = JSON.parse(out.get("new-archive-CLI-path-and-import-controls"));
  assert.equal(cli.verified, true);
  assert.equal(cli.metadataOnly, true);
  assert.equal(cli.currentProductExecuted, 0);
  assert.equal(cli.checks, 8);
  assert.equal(cli.results.length, 8);
  for (const r of cli.results) {
    assert.equal(r.status, r.id.endsWith(" invalid") ? 1 : 0);
    const b = Buffer.from(r.stdout + r.stderr);
    assert.equal(b.length, r.mergedBytes);
    assert.equal(sha(b), r.mergedSha256);
    if (r.status === 1) assert.ok(r.stderr.length);
    else assert.ok(r.stdout.trim());
  }
  assert.match(
    out.get("final-report-format-check"),
    /All matched files use Prettier code style!/,
  );
  const p = JSON.parse(out.get("report-protection"));
  assert.equal(p.protected, true);
  assert.equal(p.authorizedOldPaths, 1);
  assert.equal(p.declarations, 49);
  return {
    verified: true,
    metadataOnly: true,
    currentProductExecuted: 0,
    receipts: 7,
    metadataPositive: 1,
    metadataNegative: 6,
    newVerifierCLIControls: 8,
  };
}
function main() {
  if (typeof import.meta.main === "boolean") return import.meta.main;
  if (
    process.execArgv.some((arg) =>
      /^(?:--eval|--print)(?:=|$)|^-[ep]+$/.test(arg),
    )
  )
    return false;
  if (!process.argv[1]) return false;
  let p;
  try {
    p = fs.realpathSync(process.argv[1]);
  } catch (e) {
    if (e?.code === "ENOENT" || e?.code === "ENOTDIR") return false;
    throw e;
  }
  return p === fs.realpathSync(fileURLToPath(import.meta.url));
}
if (main()) {
  const i = process.argv.indexOf("--archive"),
    file =
      i >= 0
        ? process.argv[i + 1]
        : fileURLToPath(
            new URL(
              "../../../../docs/m5_b_candidate_action_identity.json",
              import.meta.url,
            ),
          ),
    raw = fs.readFileSync(file),
    a = JSON.parse(raw),
    ci = process.argv.indexOf("--verify-controls");
  console.log(
    JSON.stringify(
      ci >= 0
        ? verifyControls(
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
