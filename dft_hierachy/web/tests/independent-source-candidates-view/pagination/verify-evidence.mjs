// Only metadata verification. No product imports, browser launch or semantic execution.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cases } from "./cases.mjs";
const pins = [
  {
    path: "docs/plans/M5-source-candidates-view-b33-pagination.md",
    bytes: 3708,
    sha256: "4c4789e7f72b4073cc5f32193c70b4cdf7878e332257363b831e80068ab52c05",
  },
  {
    path: "web/tests/independent-source-candidates-view/pagination/README.md",
    bytes: 1687,
    sha256: "29b08fa0b63e15437a0fc26e95d47501fd14d01331acc67d9c325963bf7f7f9b",
  },
  {
    path: "web/tests/independent-source-candidates-view/pagination/cases.mjs",
    bytes: 1451,
    sha256: "83fa14a46ee57a3b4cd03a494e1119321242879ed4dfb81849093f5dcfd4e051",
  },
  {
    path: "web/tests/independent-source-candidates-view/pagination/facility.test.mjs",
    bytes: 7058,
    sha256: "aa1f476787f40dba93b99c2705c57e4e8ed0b216b9c473daeac5b897438eb909",
  },
  {
    path: "web/tests/independent-source-candidates-view/pagination/fixture.jsx",
    bytes: 11437,
    sha256: "feda15536157b8a114ceb4ace3140068c0a2a0f6e9abf9a360f1b9ca691cb326",
  },
  {
    path: "web/tests/independent-source-candidates-view/pagination/public-calls.mjs",
    bytes: 2045,
    sha256: "62f440139ca838de6669914f8eb5371ed42b26a475c9d6d42339f57649946b54",
  },
  {
    path: "web/tests/independent-source-candidates-view/pagination/public-model.mjs",
    bytes: 4781,
    sha256: "6ebd0f57bdc008a0eab50aa623a2ded6deeef4a994826c393eac070a52fb546a",
  },
  {
    path: "web/tests/independent-source-candidates-view/pagination/run.mjs",
    bytes: 8616,
    sha256: "f95b4fb7c7ccc42b91070eff83d8c5a2ccc81f1b0b4a227e2b97d2bb0f05e2e7",
  },
];
const fixed = {
  product: "4d80e422f597c4c0f362a9e5ce1ca7557787fb9c",
  contract: "7a1675f2a4aa3bb0b1d4862c694aa627cc387410",
  contractSha256:
    "05ff380df6bf017e0f31f80fe553c9e4ef06952f8a5c846206d11fffe13ee35f",
  freeze: "9fd645b779c36e43205aa5161d94da3f93adb1ae",
  previousB: "579c731c9e6b9b273225857f55b71b3f7f31ab85",
};
const claims = {
  partialFreeze: true,
  newDOMPlanned: 8,
  newDOMExecuted: 0,
  newDOMPassed: 0,
  newDOMBlocked: 8,
  old56Rerun: false,
  typesRerun: false,
  callObserverFacilityPassed: 11,
  browserFacilityPassed: 11,
  realModelPremises: 8,
  transparentCallReturnOnly: true,
  strongOriginalPromiseProven: false,
  Q1Closed: false,
  Q2Closed: true,
  C95ClosedByC: true,
  CoreExecuted: false,
  ElectronExecuted: false,
  fullGateRerun: false,
  M5Complete: false,
};
const sha = (b) => createHash("sha256").update(b).digest("hex");
export function verify(a, current = false) {
  assert.equal(a.format, "B33-c95-pagination-partial-freeze-v1");
  assert.deepEqual(a.fixed, fixed);
  assert.deepEqual(a.claims, claims);
  assert.deepEqual(a.inputs, pins);
  assert.equal(a.captures.length, 26);
  assert.equal(new Set(a.captures.map((c) => c.name)).size, 26);
  assert.equal(a.materials.length, 21);
  assert.equal(cases.length, 8);
  const texts = new Map(),
    materials = new Map();
  for (const c of a.captures) {
    const b = gunzipSync(Buffer.from(c.stdout_gzip_base64, "base64"));
    assert.equal(b.length, c.stdout_bytes);
    assert.equal(sha(b), c.stdout_sha256);
    assert.equal(c.capture_complete, true);
    assert.ok(c.command.length > 0);
    texts.set(c.name, b.toString());
  }
  for (const m of a.materials) {
    const b = gunzipSync(Buffer.from(m.gzip_base64, "base64"));
    assert.equal(b.length, m.bytes);
    assert.equal(sha(b), m.sha256);
    materials.set(m.id, b);
  }
  assert.equal(materials.size, 21);
  for (const pin of pins) {
    const b = materials.get("frozen:" + pin.path);
    assert.equal(b.length, pin.bytes);
    assert.equal(sha(b), pin.sha256);
    if (current) {
      const c = fs.readFileSync(
        path.join(
          fileURLToPath(new URL("../../../../", import.meta.url)),
          pin.path,
        ),
      );
      assert.equal(c.length, pin.bytes);
      assert.equal(sha(c), pin.sha256);
    }
  }
  assert.equal(sha(materials.get("DESIGN")), fixed.contractSha256);
  const cap = (name) => {
    const c = a.captures.find((c) => c.name === name);
    assert.ok(c, "missing capture " + name);
    return c;
  };
  const one = (name) => JSON.parse(texts.get(name));
  for (const name of ["initial-C95-DOM", "frozen-C95-DOM-baseline"]) {
    const r = one(name);
    assert.equal(cap(name).exit_code, 1);
    assert.equal(r.stage, "public-component-capability");
    assert.equal(r.planned, 8);
    assert.equal(r.executed, 0);
    assert.equal(r.passed, 0);
    assert.equal(r.failed, 0);
    assert.equal(r.blocked, 8);
    assert.equal(r.skipped, 0);
    assert.equal(r.exitCode, 1);
    assert.match(
      r.error,
      /missing production @hier\/views SourceCandidatesView/,
    );
    assert.deepEqual(r.releaseErrors, []);
  }
  const controls = one("frozen-browser-premises-and-native");
  assert.equal(cap("frozen-browser-premises-and-native").exit_code, 0);
  for (const k of ["planned", "executed", "passed"])
    assert.equal(controls[k], 11);
  for (const k of ["failed", "blocked", "skipped", "exitCode"])
    assert.equal(controls[k], 0);
  assert.equal(controls.results.length, 11);
  assert.ok(controls.results.every((r) => r.pass));
  assert.deepEqual(
    controls.results.slice(0, 8).map((r) => r.id),
    cases.map((c) => c.id),
  );
  assert.deepEqual(controls.cleanup, { errors: [], unhandled: [] });
  assert.deepEqual(controls.releaseErrors, []);
  assert.equal(
    controls.bundleSha256,
    one("frozen-C95-DOM-baseline").bundleSha256,
  );
  for (const [i, c] of cases.entries())
    assert.equal(
      controls.results[i].queries,
      c.input.action === "blocked" ? 1 : 2,
    );
  const node = texts.get("frozen-call-observer-facilities");
  assert.equal(cap("frozen-call-observer-facilities").exit_code, 0);
  for (const [k, n] of [
    ["tests", 11],
    ["pass", 11],
    ["fail", 0],
    ["cancelled", 0],
    ["skipped", 0],
    ["todo", 0],
  ])
    assert.match(node, new RegExp("ℹ " + k + " " + n + "(?:\\r?\\n|$)"));
  for (const name of [
    "current-web-check",
    "old-B32-evidence-inputs",
    "old-B32-controls-archive",
    "runtime-and-input-metadata",
    "post-run-protection",
    "frozen-source-format-check",
  ])
    assert.equal(cap(name).exit_code, 0);
  const meta = one("runtime-and-input-metadata");
  assert.equal(meta.declarations.length, 49);
  assert.equal(meta.mainAndGeneratedDeclarationsEqual, true);
  assert.deepEqual(
    meta.newFiles,
    pins.map((p) => p.path),
  );
  assert.equal(meta.freeze, fixed.freeze);
  const protection = one("post-run-protection");
  assert.equal(protection.protected, true);
  assert.equal(protection.BStatus, "");
  assert.equal(protection.declarations, 49);
  assert.deepEqual(protection.counts, [1221, 819, 1203]);
  const nonzero = ["initial-C95-DOM", "frozen-C95-DOM-baseline"];
  assert.deepEqual(a.nonzeroCaptureNames, nonzero);
  assert.deepEqual(
    a.captures.filter((c) => c.exit_code !== 0).map((c) => c.name),
    nonzero,
  );
  return {
    verified: true,
    metadataOnly: true,
    currentProductExecuted: 0,
    captures: 26,
    materials: 21,
    frozenInputs: 8,
    DOM: { planned: 8, executed: 0, passed: 0, blocked: 8, skipped: 0 },
    nodeFacilities: 11,
    browserFacilities: 11,
    partialFreeze: true,
    strongPromiseProven: false,
  };
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const i = process.argv.indexOf("--archive"),
    file =
      i >= 0
        ? process.argv[i + 1]
        : fileURLToPath(
            new URL(
              "../../../../docs/m5_b_source_candidates_view_pagination.json",
              import.meta.url,
            ),
          );
  console.log(
    JSON.stringify(
      verify(
        JSON.parse(fs.readFileSync(file)),
        process.argv.includes("--inputs"),
      ),
      null,
      2,
    ),
  );
}
