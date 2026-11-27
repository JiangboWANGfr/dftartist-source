// Metadata-only verification: no product import, browser, build, Core or semantic execution.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { cases } from "./cases.mjs";
import { negatives } from "./types.mjs";
const expectedInputs = [
  {
    path: "docs/plans/M5-source-candidates-view-b32-freeze.md",
    bytes: 5896,
    sha256: "fab48a5daa650d7adfe1f020057c4717ace66fe536ca9161fe985a0f4084fc6a",
  },
  {
    path: "web/tests/independent-source-candidates-view/README.md",
    bytes: 1473,
    sha256: "5eec596a08342f0ad4416e9533104a1396293eefffc5f4de07eaabfb7c020c8f",
  },
  {
    path: "web/tests/independent-source-candidates-view/cases.mjs",
    bytes: 3397,
    sha256: "f65bf65ac21c477ed20d6f2c22aa2045fed006b83a072a9baf61dddb533b7c23",
  },
  {
    path: "web/tests/independent-source-candidates-view/facility.test.mjs",
    bytes: 2074,
    sha256: "08baf9770c6ab780f18abe8d11e3d7aa2a177c29a747b7f57301d3a811cf8fd3",
  },
  {
    path: "web/tests/independent-source-candidates-view/fixture.jsx",
    bytes: 27510,
    sha256: "3e8460e4daad5166cda13b3d8b9b639385209036ab3145586ed491a72cf1fe83",
  },
  {
    path: "web/tests/independent-source-candidates-view/proposal.d.ts",
    bytes: 931,
    sha256: "be392b781fbb8fbbed3d1eac0702fbde24eadfae6fcb33ff8ffa9d1b6b01d6c8",
  },
  {
    path: "web/tests/independent-source-candidates-view/run.mjs",
    bytes: 9850,
    sha256: "c3cf408a3462709cb307ef8098099a4546d004f21f0e8862cf3485718b01ccd6",
  },
  {
    path: "web/tests/independent-source-candidates-view/types.mjs",
    bytes: 3798,
    sha256: "dbf38993ce982b309c9e31dc83501704d73845729148c4f133f1771a0df2814e",
  },
  {
    path: "web/tests/independent-source-candidates-view/verify-types.mjs",
    bytes: 3695,
    sha256: "b8b321394db80f05440a1d54ff3c614e1c68e334883de2dc9fe4ec22185df81e",
  },
];
export const sha = (b) => createHash("sha256").update(b).digest("hex");
const defaultArchive = fileURLToPath(
  new URL(
    "../../../docs/m5_b_source_candidates_view_freeze.json",
    import.meta.url,
  ),
);
const raw = (c) => {
  const b = gunzipSync(Buffer.from(c.stdout_gzip_base64, "base64"));
  assert.equal(b.length, c.stdout_bytes);
  assert.equal(sha(b), c.stdout_sha256);
  return b.toString();
};
export function verifyArchive(a, inputs = false) {
  assert.equal(a.format, "B32-candidates-view-partial-freeze-v1");
  assert.deepEqual(a.fixed, {
    product: "e2546892a243a624d0caf7ad5b0df2976dd57264",
    freeze: "8529290e805ae9b6e57301a1ae8417cc5b9be49e",
    previousB: "e86f478a7d4e0db3bace86a239100d33c2a7be64",
    contractSha256:
      "bf5f0df2e2b0551321b37d2f6f505d0e6e0d05169a095d297ee755c1c78a1fab",
  });
  assert.deepEqual(a.claims, {
    partialFreeze: true,
    allSection618Frozen: false,
    candidateDomExecuted: 0,
    candidateDomPassed: 0,
    candidateDomBlocked: 56,
    productionTypesExecuted: 0,
    proposalTypesNegativePassed: 30,
    browserFacilityPassed: 12,
    nodeFacilityPassed: 4,
    standardConfirmation: { behavior: 121, types: 37, Q1: 6 },
    strongOriginalPromiseProven: false,
    unknownReasonDisplayProven: false,
    CoreExecuted: false,
    ElectronExecuted: false,
    M5Complete: false,
    fullGateRerun: false,
  });
  assert.equal(cases.length, 56);
  assert.equal(negatives.length, 30);
  assert.equal(a.captures.length, 35);
  assert.equal(new Set(a.captures.map((c) => c.name)).size, 35);
  assert.equal(a.materials.length, 24);
  assert.equal(new Set(a.materials.map((c) => c.id)).size, 24);
  assert.deepEqual(a.inputs, expectedInputs);
  const texts = new Map();
  for (const c of a.captures) {
    assert.equal(c.capture_complete, true);
    assert.ok(c.command.length > 0);
    assert.ok(Number.isFinite(c.seconds) && c.seconds >= 0);
    texts.set(c.name, raw(c));
  }
  const materials = new Map();
  for (const m of a.materials) {
    const b = gunzipSync(Buffer.from(m.gzip_base64, "base64"));
    assert.equal(b.length, m.bytes);
    assert.equal(sha(b), m.sha256);
    materials.set(m.id, b);
  }
  for (const pin of expectedInputs) {
    const b = materials.get("frozen:" + pin.path);
    assert.ok(b);
    assert.equal(b.length, pin.bytes);
    assert.equal(sha(b), pin.sha256);
    if (inputs) {
      const current = fs.readFileSync(
        path.join(
          fileURLToPath(new URL("../../../", import.meta.url)),
          pin.path,
        ),
      );
      assert.equal(current.length, pin.bytes);
      assert.equal(sha(current), pin.sha256);
    }
  }
  assert.equal(sha(materials.get("DESIGN")), a.fixed.contractSha256);
  const cap = (name) => {
    const c = a.captures.find((c) => c.name === name);
    assert.ok(c, "missing capture " + name);
    return c;
  };
  const reports = (name) => {
    const s = texts.get(name);
    try {
      return [JSON.parse(s)];
    } catch {
      return [...s.matchAll(/^\{[\s\S]*?^\}/gm)].map((m) => JSON.parse(m[0]));
    }
  };
  const one = (name) => {
    const rs = reports(name);
    assert.equal(rs.length, 1, name);
    return rs[0];
  };
  const good = (name, n) => {
    assert.equal(cap(name).exit_code, 0);
    const r = one(name);
    for (const k of ["planned", "executed", "passed"])
      assert.equal(r[k], n, name + " " + k);
    assert.equal(r.blocked, 0);
    assert.equal(r.skipped, 0);
    assert.equal(r.exitCode, 0);
    return r;
  };
  const dom = one("frozen-DOM-baseline");
  assert.equal(cap("frozen-DOM-baseline").exit_code, 1);
  assert.equal(dom.stage, "public-component-capability");
  assert.equal(dom.planned, 56);
  assert.equal(dom.executed, 0);
  assert.equal(dom.passed, 0);
  assert.equal(dom.blocked, 56);
  assert.equal(dom.skipped, 0);
  assert.equal(dom.exitCode, 1);
  assert.match(
    dom.error,
    /missing production @hier\/views SourceCandidatesView/,
  );
  assert.deepEqual(dom.releaseErrors, []);
  assert.equal(dom.cssEntry, null);
  assert.match(dom.cssResolution.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
  const ty = one("frozen-production-types-baseline");
  assert.equal(cap("frozen-production-types-baseline").exit_code, 1);
  assert.equal(ty.planned, 30);
  assert.equal(ty.executed, 0);
  assert.equal(ty.passed, 0);
  assert.equal(ty.blocked, 30);
  assert.equal(ty.skipped, 0);
  assert.equal(ty.positive.length, 4);
  assert.ok(ty.positive.every((d) => d.code === 2305));
  assert.equal(ty.exitCode, 1);
  const proposal = good("frozen-proposal-types", 30);
  assert.deepEqual(proposal.positive, []);
  assert.equal(proposal.results.length, 30);
  assert.deepEqual(
    proposal.results.map((x) => x.id),
    negatives.map((x) => x[0]),
  );
  for (const r of proposal.results)
    assert.ok(
      r.diagnostics.some((d) => ![2305, 2307, 2304, 2578].includes(d.code)),
    );
  const facilities = good("frozen-browser-facilities", 12);
  assert.equal(facilities.results.length, 12);
  assert.ok(facilities.results.every((x) => x.pass === true));
  assert.deepEqual(facilities.cleanup, { errors: [], unhandled: [] });
  assert.deepEqual(facilities.releaseErrors, []);
  const node = texts.get("frozen-Node-facilities");
  assert.equal(cap("frozen-Node-facilities").exit_code, 0);
  for (const [key, n] of [
    ["tests", 4],
    ["pass", 4],
    ["fail", 0],
    ["cancelled", 0],
    ["skipped", 0],
    ["todo", 0],
  ])
    assert.match(node, new RegExp("ℹ " + key + " " + n + "(?:\\r?\\n|$)"));
  assert.equal(cap("standard-confirmation-model").exit_code, 0);
  const sr = reports("standard-confirmation-model");
  assert.equal(sr.length, 3);
  assert.equal(sr[0].plannedNegative, 37);
  assert.equal(sr[0].executedNegative, 37);
  assert.equal(sr[0].blockedNegative, 0);
  assert.equal(sr[0].skipped, 0);
  for (const [r, n] of [
    [sr[1], 121],
    [sr[2], 6],
  ]) {
    for (const k of ["planned", "executed", "passed"]) assert.equal(r[k], n);
    for (const k of ["failed", "blocked", "skipped", "exitCode"])
      assert.equal(r[k], 0);
  }
  assert.equal(cap("standard-confirmation-controls").exit_code, 0);
  const controls = texts.get("standard-confirmation-controls"),
    counts = [...controls.matchAll(/ℹ tests (\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(counts, [19, 27]);
  assert.equal(cap("web-check").exit_code, 0);
  assert.equal(cap("runtime-and-input-metadata").exit_code, 0);
  assert.equal(cap("post-run-protection").exit_code, 0);
  assert.equal(one("post-run-protection").protected, true);
  const meta = one("runtime-and-input-metadata");
  assert.equal(meta.declarations.length, 49);
  assert.equal(meta.mainAndGeneratedDeclarationsEqual, true);
  assert.equal(meta.freeze, a.fixed.freeze);
  const nonzero = [
    "browser-facilities",
    "initial-DOM-capability",
    "initial-production-types",
    "initial-DOM-capability-v2",
    "browser-facilities-v3-model-premises",
    "frozen-DOM-baseline",
    "frozen-production-types-baseline",
  ];
  assert.deepEqual(a.nonzeroCaptureNames, nonzero);
  assert.deepEqual(
    a.captures.filter((c) => c.exit_code !== 0).map((c) => c.name),
    nonzero,
  );
  assert.match(texts.get("browser-facilities"), /Expected.*but found/);
  assert.match(texts.get("initial-DOM-capability"), /Expected.*but found/);
  assert.match(
    texts.get("browser-facilities-v3-model-premises"),
    /Invalid server frame/,
  );
  return {
    verified: true,
    metadataOnly: true,
    currentProductExecuted: 0,
    captures: 35,
    materials: 24,
    inputs: 9,
    partialFreeze: true,
    DOM: { planned: 56, executed: 0, blocked: 56 },
    proposalTypes: 30,
    browserFacilities: 12,
    nodeFacilities: 4,
  };
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const arg = process.argv.indexOf("--archive"),
    file = arg < 0 ? defaultArchive : process.argv[arg + 1];
  console.log(
    JSON.stringify(
      verifyArchive(
        JSON.parse(fs.readFileSync(file)),
        process.argv.includes("--inputs"),
      ),
      null,
      2,
    ),
  );
}
