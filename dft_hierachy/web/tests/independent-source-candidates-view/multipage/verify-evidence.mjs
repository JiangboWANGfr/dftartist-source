// Metadata only: verifying an archive never executes current product tests.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const defaultArchive = path.join(
  root,
  "docs/m5_b_multipage_action_identity.json",
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const decode = (m) => {
  const b = gunzipSync(Buffer.from(m.gzipBase64, "base64"));
  assert.equal(b.length, m.bytes);
  assert.equal(sha(b), m.sha256);
  return b;
};
const unpack = (r) =>
  decode({
    gzipBase64: r.stdout_gzip_base64,
    bytes: r.stdout_bytes,
    sha256: r.stdout_sha256,
  });
const negativeNames = [
  "frozen-multipage-DOM-baseline",
  "post-run-protection",
  "frozen-C97-import-baseline",
  "fixed-A-C97-negative-replay",
  "historical-B35-current-inputs-must-refuse",
  "format-evidence-facilities",
];
const requiredNames = [
  "fixed-product",
  "initial-protection",
  "fixed-web-build",
  "fixed-web-check",
  "runtime-frozen-input-integrity",
  "settled-post-check-protection",
  "frozen-multipage-node-facilities",
  "frozen-multipage-browser-premises",
  ...negativeNames,
  "repaired-C97-frozen-imports",
  "fallback-branch-frozen-imports",
  "old-sixteen-CLI-regression",
  "historical-B35-metadata-after-entry-repair",
  "historical-B34-current-inputs-retained",
  "authorized-post-repair-protection",
  "final-source-format-check",
  "final-diff-check",
  "final-pre-seal-protection",
  "recovered-evidence-facility-format-check",
];
export function verify(a, { inputs = false } = {}) {
  assert.equal(a.kind, "B36-independent-multipage-and-C97-evidence");
  assert.equal(a.fixed.product, "9958f0e140b27304f5305a3b67da4ad7f62fe96c");
  assert.equal(
    a.fixed.multipageFreeze,
    "a6819375b5bc03f6df9c21a7855dfd22d4c4fae8",
  );
  assert.equal(
    a.fixed.importFreeze,
    "e655f8b8402aa059d42e804473d0edf3bb8f13d8",
  );
  assert.equal(a.fixed.repair, "97b7dcd385d02ba52c70386969412dd6b135e36f");
  assert.deepEqual(a.scope, {
    DOM: {
      planned: 6,
      executed: 0,
      passed: 0,
      failed: 0,
      blocked: 6,
      skipped: 0,
    },
    nodeFacilities: 14,
    browserPremises: 8,
    newCLI: 32,
    oldCLI: 16,
    Q1Closed: false,
    C97ClosedByB: false,
    nativeNode20Or22Executed: false,
    fullM5Passed: false,
  });
  assert.equal(a.captures.length, 41);
  assert.equal(new Set(a.captures.map((r) => r.name)).size, a.captures.length);
  for (const n of requiredNames)
    assert(
      a.captures.some((r) => r.name === n),
      "missing capture " + n,
    );
  assert.deepEqual(
    a.captures
      .filter((r) => r.exit_code !== 0)
      .map((r) => r.name)
      .sort(),
    [...negativeNames].sort(),
  );
  for (const r of a.captures) {
    assert.equal(r.capture_complete, true);
    assert(Array.isArray(r.command) && r.command.length > 0);
    assert.equal(typeof r.cwd, "string");
    assert(Number.isFinite(r.seconds) && r.seconds >= 0);
    assert.equal(
      r.exit_code,
      r.name === "format-evidence-facilities"
        ? 2
        : negativeNames.includes(r.name)
          ? 1
          : 0,
    );
    unpack(r);
  }
  const record = (n) => a.captures.find((r) => r.name === n),
    text = (n) => unpack(record(n)).toString(),
    json = (n) => JSON.parse(text(n));
  const tap = (n, tests, pass, fail) => {
    const t = text(n);
    for (const [k, v] of Object.entries({
      tests,
      pass,
      fail,
      cancelled: 0,
      skipped: 0,
      todo: 0,
    }))
      assert.match(t, new RegExp("^# " + k + " " + v + "$", "m"));
    assert.match(t, new RegExp("^1\\.\\." + tests + "$", "m"));
  };
  tap("frozen-multipage-node-facilities", 14, 14, 0);
  tap("frozen-C97-import-baseline", 32, 16, 16);
  tap("fixed-A-C97-negative-replay", 32, 16, 16);
  tap("repaired-C97-frozen-imports", 32, 32, 0);
  tap("fallback-branch-frozen-imports", 32, 32, 0);
  tap("old-sixteen-CLI-regression", 16, 16, 0);
  const dom = json("frozen-multipage-DOM-baseline");
  for (const [k, v] of Object.entries(a.scope.DOM)) assert.equal(dom[k], v);
  assert.equal(dom.results.length, 0);
  assert.equal(dom.stage, "public-component-capability");
  assert.match(dom.error, /missing production.*SourceCandidatesView/);
  const browser = json("frozen-multipage-browser-premises");
  for (const [k, v] of Object.entries({
    planned: 8,
    executed: 8,
    passed: 8,
    failed: 0,
    blocked: 0,
    skipped: 0,
  }))
    assert.equal(browser[k], v);
  assert.equal(browser.results.length, 8);
  assert(browser.results.every((r) => r.pass && r.candidateUI === false));
  assert.deepEqual(browser.cleanup, { errors: [], unhandled: [] });
  assert.deepEqual(browser.releaseErrors, []);
  assert.match(text("post-run-protection"), /__layering_probe__\.ts/);
  assert.equal(json("settled-post-check-protection").protected, true);
  const protectedResult = json("final-pre-seal-protection");
  assert.equal(protectedResult.protected, true);
  assert.equal(protectedResult.strictOldOrdinary, 3355);
  assert.equal(protectedResult.mainDeclarations, 49);
  assert.equal(protectedResult.mainCoreBinaries, 3);
  assert.equal(protectedResult.authorizedOldBPaths.length, 2);
  assert.match(
    text("historical-B35-current-inputs-must-refuse"),
    /16759 !== 16565/,
  );
  assert.equal(
    json("historical-B35-metadata-after-entry-repair").verified,
    true,
  );
  assert.equal(json("historical-B34-current-inputs-retained").verified, true);
  assert.equal(a.inputs.length, 12);
  assert.equal(new Set(a.inputs.map((m) => m.path)).size, 12);
  const materials = new Map();
  for (const m of a.materials) {
    assert(!materials.has(m.name));
    materials.set(m.name, decode(m));
  }
  for (const p of a.inputs) {
    const raw = materials.get("input:" + p.path);
    assert(raw, "missing frozen input");
    assert.equal(raw.length, p.bytes);
    assert.equal(sha(raw), p.sha256);
    if (inputs) {
      const current = fs.readFileSync(path.join(root, p.path));
      assert.equal(current.length, p.bytes);
      assert.equal(sha(current), p.sha256);
    }
  }
  for (const n of [
    "source-audit.json",
    "source-audit.mjs",
    "initial.json",
    "protect.mjs",
    "protect-authorized.mjs",
    "authorized-verifier-changes.json",
    "runtime.mjs",
    "prepare-replays.mjs",
    "original-release-verifier.mjs",
    "original-actions-verifier.mjs",
    "capture-driver.py",
    "seal.mjs",
    "DESIGN.md",
  ])
    assert(materials.has(n), "missing material " + n);
  assert.equal(
    sha(materials.get("DESIGN.md")),
    "6c7493ea6a71f651dc9618bb66635a1a27a28a8a32f81741041343091cbb4aeb",
  );
  const auditRaw = materials.get("source-audit.json");
  assert.equal(
    sha(auditRaw),
    "154cdcbc5efb30095ed9d44e0f30b30bb89aac43b830b73accda85c53470aee1",
  );
  const audit = JSON.parse(auditRaw);
  assert.equal(audit.commands.length, 82);
  for (const c of audit.commands) {
    assert.equal(c.status, 0);
    assert.equal(c.signal, null);
    decode(c.stdout);
    decode(c.stderr);
  }
  const auth = JSON.parse(materials.get("authorized-verifier-changes.json"));
  assert.equal(auth.changes.length, 2);
  assert.deepEqual(auth.changes, protectedResult.authorizedOldBPaths);
  assert.equal(
    sha(materials.get("original-release-verifier.mjs")),
    "7273b685996dbc61178a0721a87972aebb21050d803b3abf7582ef50ae518933",
  );
  assert.equal(
    sha(materials.get("original-actions-verifier.mjs")),
    "0ecc1eb9caefd481851fc4ff2fec6f0d1226a35acbc30a374627741fc0dc298c",
  );
  return {
    verified: true,
    metadataOnly: true,
    currentProductExecuted: 0,
    captures: a.captures.length,
    materials: a.materials.length,
    inputs: a.inputs.length,
    sourceAuditCommands: 82,
    sourceAuditStreams: 164,
    ...a.scope,
  };
}
export function selfTest(a) {
  verify(a);
  const cases = [
    (b) => {
      b.scope.Q1Closed = true;
    },
    (b) => {
      b.captures = b.captures.filter(
        (r) => r.name !== "frozen-C97-import-baseline",
      );
    },
    (b) => {
      b.materials[0].gzipBase64 = "invalid";
    },
    (b) => {
      const r = b.captures.find(
        (r) => r.name === "repaired-C97-frozen-imports",
      );
      const raw = Buffer.from(
        unpack(r).toString().replace("# pass 32", "# pass 31"),
      );
      r.stdout_bytes = raw.length;
      r.stdout_sha256 = sha(raw);
      r.stdout_gzip_base64 = gzipSync(raw).toString("base64");
    },
    (b) => {
      const r = b.captures.find(
          (r) => r.name === "frozen-multipage-DOM-baseline",
        ),
        o = JSON.parse(unpack(r));
      o.passed = 6;
      const raw = Buffer.from(JSON.stringify(o));
      r.stdout_bytes = raw.length;
      r.stdout_sha256 = sha(raw);
      r.stdout_gzip_base64 = gzipSync(raw).toString("base64");
    },
    (b) => {
      b.materials = b.materials.filter((m) => m.name !== "source-audit.json");
    },
  ];
  for (const change of cases) {
    const b = structuredClone(a);
    change(b);
    assert.throws(() => verify(b));
  }
  return {
    metadataOnly: true,
    currentProductExecuted: 0,
    positive: 1,
    negative: cases.length,
  };
}
function main() {
  if (typeof import.meta.main === "boolean") return import.meta.main;
  if (
    process.execArgv.some((a) => /^(?:--eval|--print)(?:=|$)|^-[ep]+$/.test(a))
  )
    return false;
  if (!process.argv[1]) return false;
  let entry;
  try {
    entry = fs.realpathSync(process.argv[1]);
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return false;
    throw e;
  }
  return entry === fs.realpathSync(fileURLToPath(import.meta.url));
}
if (main()) {
  const i = process.argv.indexOf("--archive"),
    a = JSON.parse(
      fs.readFileSync(i < 0 ? defaultArchive : process.argv[i + 1]),
    );
  console.log(
    JSON.stringify(
      process.argv.includes("--self-test")
        ? selfTest(a)
        : verify(a, { inputs: process.argv.includes("--inputs") }),
      null,
      2,
    ),
  );
}
