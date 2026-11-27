// B28 archive integrity/claim checks only; never executes product or compiler.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { cases as wireCases } from "../wire-cases.mjs";
import { cases as coreCases } from "../core-fixture.mjs";
const root = path.resolve(
  fileURLToPath(new URL("../../../../", import.meta.url)),
);
let archive = root + "/docs/m5_b_source_ref_kind_c92_recheck.json";
let checkInputs = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--inputs") {
    assert.equal(checkInputs, false);
    checkInputs = true;
  } else if (args[i] === "--archive") {
    assert.ok(args[i + 1]);
    archive = path.resolve(args[++i]);
  } else assert.fail("Unknown argument " + args[i]);
}
const raw = fs.readFileSync(archive),
  a = JSON.parse(raw);
const sha = (b) => createHash("sha256").update(b).digest("hex");
function unpack(b, label) {
  const d = gunzipSync(Buffer.from(b.gzipBase64, "base64"));
  assert.equal(d.length, b.bytes, label);
  assert.equal(sha(d), b.sha256, label);
  return d;
}
function green(r, n) {
  assert.deepEqual([r.planned, r.executed, r.passed, r.failed], [n, n, n, 0]);
  for (const k of ["skipped", "blocked"]) if (k in r) assert.equal(r[k], 0);
}
assert.equal(a.kind, "B28 independent C92 original-entry recheck");
assert.equal(a.fixed, "fa0cee48b87768685c396a540555ee07daef2000");
assert.equal(a.baseline, "43530c006ca950d504e416e85f859cf0367d3945");
assert.equal(a.freeze, "764445d4c91a0113fddaae5d7027eb8fd16946e3");
assert.equal(a.buildConfigFreeze, "1c3599d8a26c217a9500ca7d9b094702ed5f7513");
assert.equal(a.originalEntryAccepted, true);
assert.equal(a.status, "not-released");
assert.equal(a.openFinding, "C-93");
assert.equal(a.c92NamingGatePassed, true);
assert.equal(a.c92ClosureOwner, "C");
assert.equal(a.m5Complete, false);
const blocks = new Map(),
  materials = new Map(),
  captures = new Map(),
  outputs = new Map();
for (const [id, b] of Object.entries(a.blocks))
  blocks.set(id, unpack({ ...b, sha256: id }, id));
for (const m of a.materials) {
  assert.ok(m.label && !materials.has(m.label));
  assert.equal(blocks.get(m.sha256)?.length, m.bytes, m.label);
  materials.set(m.label, m);
}
const material = (label) => {
  assert.ok(materials.has(label), label);
  return blocks.get(materials.get(label).sha256);
};
for (const c of a.captures) {
  assert.ok(c.name && !captures.has(c.name));
  assert.ok(c.capture_complete && c.command.length && c.cwd);
  assert.equal(c.outputMode, "combined stdout+stderr");
  assert.equal(c.utcMeaning, "capture finished");
  assert.ok(Number.isFinite(Date.parse(c.utc)) && c.seconds >= 0);
  assert.equal(
    c.exit_code,
    ["baseline435-original-configure", "public-build-config-matrix"].includes(
      c.name,
    )
      ? 1
      : 0,
    c.name,
  );
  captures.set(c.name, c);
  outputs.set(
    c.name,
    unpack(
      {
        bytes: c.stdout_bytes,
        sha256: c.stdout_sha256,
        gzipBase64: c.stdout_gzip_base64,
      },
      c.name,
    ).toString(),
  );
}
const output = (name) => {
  assert.ok(outputs.has(name), "missing " + name);
  return outputs.get(name);
};
assert.match(output("baseline435-original-configure"), /CMP0002/);
assert.match(output("baseline435-original-configure"), /b_ref_kind_api/);
const native = JSON.parse(output("original-three-config-core-api"));
const matrix = JSON.parse(output("public-build-config-matrix"));
assert.deepEqual(
  [
    matrix.planned,
    matrix.executed,
    matrix.passed,
    matrix.failed,
    matrix.blocked,
  ],
  [3, 3, 1, 2, 0],
);
assert.equal(matrix.exitCode, 1);
assert.ok(!matrix.facilityError);
assert.deepEqual(matrix.cleanupErrors, []);
assert.deepEqual(
  matrix.results.map((r) => r.pass),
  [true, false, false],
);
assert.deepEqual(
  matrix.results.map((r) => r.expected.nestedConfigure),
  [0, 0, 0],
);
assert.deepEqual(
  matrix.results.map((r) => r.nested.status),
  [0, 8, 8],
);
assert.deepEqual(
  matrix.results.map((r) => r.parentCache.allocator),
  ["ON", "OFF", "OFF"],
);
assert.deepEqual(
  matrix.results.map((r) => r.childCache.allocator),
  ["ON", "ON", "ON"],
);
for (const r of matrix.results)
  assert.ok(
    r.configures.every(
      (c) => c.status === 0 && c.signal === null && c.error === null,
    ),
  );
for (const c of matrix.commands) {
  assert.ok([0, 8].includes(c.status));
  for (const k of ["stdout", "stderr"]) unpack(c[k], "public matrix " + k);
  assert.equal(c.signal, null);
  assert.equal(c.error, null);
}
const matrixFailures = matrix.commands.filter((c) => c.status !== 0);
assert.equal(matrixFailures.length, 2);
for (const c of matrixFailures) {
  assert.equal(c.status, 8);
  assert.match(c.command[0], /ctest$/);
  assert.match(
    unpack(c.stdout, "matrix failure").toString(),
    /Could not find mimalloc-obj target/,
  );
}
assert.equal(native.exitCode, 0);
assert.deepEqual(native.cleanupErrors, []);
assert.ok(!native.facilityError);
assert.equal(native.capability.newCppField, true);
assert.deepEqual(
  native.configurations.map((c) => c.name),
  ["Debug", "Release", "ASan-UBSan"],
);
assert.equal(native.commands.length, 98);
for (const c of native.commands) {
  assert.equal(c.status, 0);
  assert.equal(c.signal, null);
  assert.equal(c.error, null);
  for (const s of ["stdout", "stderr"]) unpack(c[s], s);
}
for (const c of native.configurations) {
  green(c.legacy, 2);
  green(c.serialization, 7);
  green(c.schema, 208);
  green(c.coreApi, 24);
  assert.equal(c.coreApi.freshCoreBuilt, true);
  assert.equal(c.schema.enumDefinitionQualified, true);
  assert.deepEqual(
    c.schema.results.map((r) => [r.id, r.input, r.expected, r.actual, r.pass]),
    wireCases.map((r) => [r.id, r.input, r.expected, r.expected, true]),
  );
}
for (const variant of ["debug", "release", "asan-ubsan"]) {
  const suffix = "/core/build-b-ref-kind-" + variant;
  const builds = native.commands.filter(
    (c) =>
      c.command[1] === "--build" && c.command[2] === native.product + suffix,
  );
  assert.equal(builds.length, 1);
  assert.deepEqual(builds[0].command.slice(3), [
    "--target",
    "b_ref_kind_api",
    "hier",
    "-j",
    "4",
  ]);
  const calls = native.commands.filter(
    (c) => c.command[0] === native.product + suffix + "/b_ref_kind_api",
  );
  assert.equal(calls.length, 24);
  assert.deepEqual(
    calls.map((c) => c.command.slice(-2)),
    coreCases.map((r) => [
      r.input.perInstance ? "per" : "shared",
      r.input.kind,
    ]),
  );
  for (const c of calls) {
    const r = JSON.parse(unpack(c.stdout, "actual CoreAPI output"));
    assert.equal(r.pass, true);
    assert.ok(r.hits > 0);
  }
  assert.match(output(variant + "-original-configure"), /Configuring done/);
  assert.match(
    output(variant + "-nested-configure"),
    /100% tests passed, 0 tests failed out of 1\b/,
  );
  const total = variant === "asan-ubsan" ? 82 : 80;
  const ct = output(variant + "-ctest-all");
  assert.match(
    ct,
    new RegExp("100% tests passed, 0 tests failed out of " + total + "\\b"),
  );
  assert.doesNotMatch(ct, /\*\*\*Not Run|The following tests did not run/);
  const st = output(variant + "-standard-native");
  assert.ok(
    st.includes('"serialization":7,"schema":208,"coreApi":24,"failed":0'),
  );
  assert.equal(
    st.split("\n").filter((l) => {
      try {
        return coreCases.some((c) => JSON.parse(l).id === c.id);
      } catch {
        return false;
      }
    }).length,
    24,
  );
  const sdk = JSON.parse(output(variant + "-core-sdk"));
  green(sdk, 24);
  assert.deepEqual(sdk.cleanupErrors, []);
  assert.ok(sdk.results.length === 24 && sdk.results.every((r) => r.pass));
}
// Parse complete top-level JSON objects amid npm output, not substrings/count claims.
function objects(text) {
  const out = [];
  let start = -1,
    depth = 0,
    quoted = false,
    escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (start < 0) {
      if (c === "{" && (i === 0 || text[i - 1] === "\n")) {
        start = i;
        depth = 1;
        quoted = false;
        escape = false;
      }
      continue;
    }
    if (quoted) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      if (--depth === 0) {
        out.push(JSON.parse(text.slice(start, i + 1)));
        start = -1;
      }
    }
  }
  return out;
}
const model = objects(output("standard-model"));
const types = model.find((r) => r.semantic && r.planned === 40);
assert.ok(types);
green(types, 40);
assert.deepEqual(types.positive, []);
assert.equal(types.proposalFacilityOnly, false);
assert.ok(
  types.semantic.length === 40 && types.semantic.every((r) => r.passed),
);
const schema = model.find((r) => r.lanes);
assert.ok(schema);
assert.equal(schema.proposalFacilityOnly, false);
assert.ok(schema.capability.every((r) => r.passed));
assert.equal(schema.legacyNewDefinitionNotApplicable, 17);
for (const [name, n] of [
  ["productionSchema", 208],
  ["productionGenerated", 208],
  ["legacyGeneratedCompatibility", 191],
]) {
  green(schema.lanes[name], n);
  assert.ok(
    schema.lanes[name].results.length === n &&
      schema.lanes[name].results.every((r) => r.passed && r.unchanged),
  );
}
const sdk = model.find((r) => r.planned === 23);
assert.ok(sdk);
green(sdk, 23);
assert.deepEqual(sdk.cleanupErrors, []);
assert.ok(sdk.results.every((r) => r.pass));
assert.match(output("standard-controls"), /tests 4/);
assert.match(output("standard-controls"), /pass 4/);
assert.match(output("standard-controls"), /skipped 0/);
output("fresh-locked-web-install");
output("web-production-check");
assert.match(
  output("schema-generated-clean"),
  /196 definitions, 27 methods, checked/,
);
const runtime = JSON.parse(material("runtime/pins.json"));
assert.deepEqual(
  runtime.records.map((r) => r.name),
  ["debug", "release", "asan-ubsan"],
);
for (const r of runtime.records) {
  assert.equal(r.binaries.length, 10);
  assert.equal(r.apiCompileRows.length, 2);
  assert.ok(r.binaries.some((b) => b.file === "b_ref_kind_api"));
  assert.ok(
    r.binaries.some(
      (b) => b.file === "tests/source-ref-kind/hier_source_ref_kind_api",
    ),
  );
  for (const f of r.configFiles) unpack(f, f.file);
  const last = r.configFiles.find((f) => f.file.endsWith("/LastTest.log"));
  assert.ok(last);
  const log = unpack(last, "last-test").toString();
  for (const text of [
    "2225 assertions in 5 test cases",
    "93 assertions in 2 test cases",
    "285 assertions in 8 test cases",
    "3411168 assertions in 2 test cases",
  ])
    assert.ok(log.includes(text), text);
}
const audit = JSON.parse(material("helper/audit.json"));
assert.equal(audit.fixed, a.fixed);
assert.equal(audit.baseline, a.baseline);
assert.equal(audit.exitCode, 0);
assert.deepEqual(audit.violations, []);
for (const row of Object.values(audit.production))
  assert.deepEqual(row.changed, []);
assert.equal(audit.actualProduction.length, 482);
assert.equal(audit.originalInputs.length, 60);
for (const row of [...audit.actualProduction, ...audit.originalInputs])
  assert.equal(row.gitBlob, row.expectedGitBlob);
assert.equal(
  audit.cleanImport
    .patchEquivalentByIdenticalPathsModesTypesAndBeforeAfterBlobObjects,
  true,
);
assert.equal(audit.cleanImport.paths.length, 4);
assert.equal(
  audit.cleanImport.completeTreeDeltaSha256,
  "0669493a1100f70365eba9e6d9ee602b25b56e2b376a1ea409ff603367dc0659",
);
for (const name of ["main", "P"]) {
  assert.equal(audit.publicDeclarations[name].length, 48);
  assert.ok(audit.publicDeclarations[name].every((r) => r.same));
}
assert.deepEqual(audit.publicDeclarations.PMissing, []);
assert.equal(audit.readOnlyProtection.files, 638);
assert.deepEqual(audit.readOnlyProtection.alteredDuringAudit, []);
assert.equal(audit.commands.length, 23);
for (const c of audit.commands) {
  assert.equal(c.status, 0);
  assert.equal(c.signal, null);
  assert.equal(c.error, null);
  unpack(c.stdout, "audit stdout");
  unpack(c.stderr, "audit stderr");
}
let checkedInputs = 0;
if (checkInputs)
  for (const m of a.materials.filter((m) => m.repoPath)) {
    assert.ok(!path.isAbsolute(m.repoPath));
    const real = fs.realpathSync(path.join(root, m.repoPath)),
      rel = path.relative(fs.realpathSync(root), real);
    assert.ok(rel && !rel.startsWith("../") && !path.isAbsolute(rel));
    const b = fs.readFileSync(real);
    assert.equal(b.length, m.bytes, m.repoPath);
    assert.equal(sha(b), m.sha256, m.repoPath);
    checkedInputs++;
  }
console.log(
  JSON.stringify(
    {
      verified: true,
      notProductExecution: true,
      fixed: a.fixed,
      originalEntryAccepted: true,
      status: "not-released",
      openFinding: "C-93",
      publicBuildMatrix: {
        planned: 3,
        passed: 1,
        failed: 2,
        expectedNestedStatus: 0,
      },
      c92ClosureOwner: "C",
      m5Complete: false,
      captures: captures.size,
      materials: materials.size,
      blocks: blocks.size,
      bytes: raw.length,
      sha256: sha(raw),
      checkedInputs,
      nativePerConfiguration: { serialization: 7, schema: 208, coreApi: 24 },
      coreSdkPerConfiguration: 24,
      ctest: [80, 80, 82],
    },
    null,
    2,
  ),
);
