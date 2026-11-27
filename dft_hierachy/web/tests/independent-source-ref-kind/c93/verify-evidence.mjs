// Portable B29 evidence checks only. No compiler, product or fixture JS runs.
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
let archive = root + "/docs/m5_b_source_ref_kind_c93_recheck.json",
  checkInputs = false;
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
  a = JSON.parse(raw),
  sha = (b) => createHash("sha256").update(b).digest("hex");
function unpack(r, label) {
  const b = gunzipSync(Buffer.from(r.gzipBase64, "base64"));
  assert.equal(b.length, r.bytes, label);
  assert.equal(sha(b), r.sha256, label);
  return b;
}
function green(r, n) {
  assert.deepEqual([r.planned, r.executed, r.passed, r.failed], [n, n, n, 0]);
  for (const k of ["blocked", "skipped"]) if (k in r) assert.equal(r[k], 0);
}
function streams(r, allowed = []) {
  for (const c of r.commands) {
    assert.equal(c.signal, null);
    assert.equal(c.error, null);
    assert.ok([0, ...allowed].includes(c.status));
    unpack(c.stdout, "inner stdout");
    unpack(c.stderr, "inner stderr");
  }
}
assert.equal(a.kind, "B29 independent C93 configuration recheck");
assert.equal(a.fixed, "d6d8bae5cebbb1fb2c7b097a22f4ecdc54570e65");
assert.equal(a.baseline, "fa0cee48b87768685c396a540555ee07daef2000");
assert.equal(a.freeze, "764445d4c91a0113fddaae5d7027eb8fd16946e3");
assert.equal(a.buildConfigFreeze, "1c3599d8a26c217a9500ca7d9b094702ed5f7513");
assert.equal(
  a.cacheTransitionsFreeze,
  "301b7be43e168f4f2fa6f7b3a284f0c13cfbed35",
);
assert.equal(a.originalEntryAccepted, true);
assert.equal(a.c93GatePassed, true);
assert.equal(a.status, "scoped-tests-passed");
assert.equal(a.c93ClosureOwner, "C");
assert.equal(a.m5Complete, false);
const blocks = new Map(),
  materials = new Map(),
  outputs = new Map(),
  names = new Set();
for (const [id, r] of Object.entries(a.blocks))
  blocks.set(id, unpack({ ...r, sha256: id }, id));
for (const m of a.materials) {
  assert.ok(m.label && !materials.has(m.label));
  assert.equal(blocks.get(m.sha256)?.length, m.bytes);
  materials.set(m.label, m);
}
const material = (label) => {
  assert.ok(materials.has(label), label);
  return blocks.get(materials.get(label).sha256);
};
const red = new Set([
  "baseline-fa0-original-build-config",
  "baseline-fa0-cache-transitions",
  "verify-candidate-archive",
  "verify-candidate-source-inputs",
]);
for (const c of a.captures) {
  assert.ok(c.name && !names.has(c.name));
  names.add(c.name);
  assert.ok(c.capture_complete && c.command.length && c.cwd);
  assert.equal(c.outputMode, "combined stdout+stderr");
  assert.equal(c.utcMeaning, "capture finished");
  assert.ok(Number.isFinite(Date.parse(c.utc)) && c.seconds >= 0);
  assert.equal(c.exit_code, red.has(c.name) ? 1 : 0, c.name);
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
  },
  json = (name) => JSON.parse(output(name));
const native = json("original-three-config-core-api");
assert.equal(
  a.firstArchive.sha256,
  "fd3be820bff450b7e2f1d2e0c358bb9eeb7f3fe7a069c92294dda24f4c073a68",
);
assert.equal(a.firstArchive.notProductFailure, true);
assert.match(output("verify-candidate-archive"), /130 !== 137/);
assert.match(output("verify-candidate-source-inputs"), /130 !== 137/);
const firstChecks = JSON.parse(material("first-archive/checks.json"));
assert.equal(firstChecks.length, 3);
assert.deepEqual(
  firstChecks.map((c) => c.exit_code),
  [0, 1, 1],
);
assert.equal(native.exitCode, 0);
assert.ok(!native.facilityError);
assert.deepEqual(native.cleanupErrors, []);
assert.equal(native.capability.newCppField, true);
assert.equal(native.commands.length, 98);
streams(native);
assert.deepEqual(
  native.configurations.map((c) => c.name),
  ["Debug", "Release", "ASan-UBSan"],
);
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
const variants = ["debug", "release", "asan-ubsan"];
for (const variant of variants) {
  const top = native.product + "/core/build-b-ref-kind-" + variant,
    builds = native.commands.filter(
      (c) => c.command[1] === "--build" && c.command[2] === top,
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
    (c) => c.command[0] === top + "/b_ref_kind_api",
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
    const v = JSON.parse(unpack(c.stdout, "Core API"));
    assert.equal(v.pass, true);
    assert.ok(v.hits > 0);
  }
  assert.match(
    output(variant + "-standard-config-regression"),
    /100% tests passed, 0 tests failed out of 2\b/,
  );
  assert.match(
    output(variant + "-serialization-ctest"),
    /100% tests passed, 0 tests failed out of 1\b/,
  );
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
  const sdk = json(variant + "-core-sdk");
  green(sdk, 24);
  assert.deepEqual(sdk.cleanupErrors, []);
  assert.ok(sdk.results.length === 24 && sdk.results.every((r) => r.pass));
}
const oldMatrix = json("baseline-fa0-original-build-config"),
  matrix = json("fixed-original-build-config");
for (const [r, n, failed] of [
  [oldMatrix, 1, 2],
  [matrix, 3, 0],
]) {
  assert.deepEqual(
    [r.planned, r.executed, r.passed, r.failed, r.blocked],
    [3, 3, n, failed, 0],
  );
  assert.equal(r.exitCode, failed ? 1 : 0);
  assert.ok(!r.facilityError);
  assert.deepEqual(r.cleanupErrors, []);
  assert.equal(r.commands.length, 10);
  streams(r, [8]);
  assert.deepEqual(
    r.results.map((x) => x.expected.nestedConfigure),
    [0, 0, 0],
  );
  assert.deepEqual(
    r.results.map((x) => x.parentCache.allocator),
    ["ON", "OFF", "OFF"],
  );
  assert.ok(
    r.results.every((x) =>
      x.configures.every(
        (c) => c.status === 0 && c.error === null && c.signal === null,
      ),
    ),
  );
}
assert.deepEqual(
  oldMatrix.results.map((r) => r.pass),
  [true, false, false],
);
assert.deepEqual(
  oldMatrix.results.map((r) => r.nested.status),
  [0, 8, 8],
);
assert.deepEqual(
  matrix.results.map((r) => r.pass),
  [true, true, true],
);
assert.deepEqual(
  matrix.results.map((r) => r.nested.status),
  [0, 0, 0],
);
assert.deepEqual(
  matrix.results.map((r) => r.childCache.allocator),
  ["ON", "OFF", "OFF"],
);
assert.equal(matrix.commands.filter((c) => c.status !== 0).length, 0);
const oldCache = json("baseline-fa0-cache-transitions"),
  cache = json("fixed-cache-transitions");
assert.deepEqual(
  [
    oldCache.planned,
    oldCache.executed,
    oldCache.passed,
    oldCache.failed,
    oldCache.blocked,
  ],
  [6, 1, 0, 1, 5],
);
assert.equal(oldCache.exitCode, 1);
assert.equal(oldCache.results.length, 1);
assert.equal(oldCache.results[0].pass, false);
assert.equal(oldCache.results[0].expected.nestedStatus, 0);
streams(oldCache, [8]);
green(cache, 6);
assert.equal(cache.exitCode, 0);
assert.ok(!cache.facilityOrTestError);
assert.deepEqual(cache.cleanupErrors, []);
assert.equal(cache.commands.length, 15);
streams(cache, [8]);
assert.equal(cache.commands.filter((c) => c.status === 8).length, 1);
assert.deepEqual(
  cache.results.map((r) => r.id),
  [
    "B-RK-CACHE-fresh-off",
    "B-RK-CACHE-history-repair",
    "B-RK-CACHE-repeat-on",
    "B-RK-CACHE-repeat-off",
    "B-RK-CACHE-real-error",
    "B-RK-CACHE-error-recovery",
  ],
);
assert.ok(cache.results.every((r) => r.pass));
assert.deepEqual(
  cache.results.map((r) => r.nestedStatus),
  [0, 0, 0, 0, 8, 0],
);
assert.equal(cache.results[4].expected.nestedStatus, "nonzero");
assert.equal(
  cache.history.archive,
  "bdd3c4e331b4906b9fb5aecae6c7e5d067c6c281723e17ace19cae0caa211967",
);
for (const r of cache.results) {
  for (const c of r.caches) unpack(c, "cache fixture");
  if (r.edit) {
    unpack(r.edit.before, "before");
    unpack(r.edit.after, "after");
  }
}
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
const model = objects(output("standard-model")),
  types = model.find((r) => r.semantic && r.planned === 40);
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
assert.match(
  output("schema-generated-clean"),
  /196 definitions, 27 methods, checked/,
);
const runtime = JSON.parse(material("runtime/pins.json"));
const configured = JSON.parse(
  material("runtime/configuration-regression-output.json"),
);
assert.deepEqual(
  configured.records.map((r) => r.name),
  variants,
);
for (const r of configured.records) {
  unpack(r.log, "actual configuration CTest log");
  assert.equal(r.result.passed, true);
  assert.equal(r.result.failurePropagation, true);
  assert.equal(r.result.recovered, true);
  assert.ok(
    r.result.commands.every(
      (c) =>
        [0, 8].includes(c.exitCode) &&
        typeof c.stdout === "string" &&
        typeof c.stderr === "string",
    ),
  );
  assert.equal(r.result.commands.filter((c) => c.exitCode === 8).length, 1);
}
assert.deepEqual(
  runtime.records.map((r) => r.name),
  variants,
);
for (const r of runtime.records) {
  assert.equal(r.binaries.length, 10);
  assert.equal(r.apiCompileRows.length, 2);
  assert.equal(r.slangUnits, 137);
  assert.equal(r.slangSourceUnits, 130);
  assert.equal(r.slangGeneratedUnits, 7);
  const compilation = JSON.parse(
    unpack(
      r.configFiles.find((f) => f.file.endsWith("/compile_commands.json")),
      "complete compile commands",
    ),
  );
  const allSlang = compilation.filter(
    (c) => c.command.includes("slang_slang.dir/") && c.file.endsWith(".cpp"),
  );
  assert.equal(allSlang.length, 137);
  assert.ok(
    allSlang.every(
      (c) =>
        c.command.includes("-fsanitize=address,undefined") ===
        (r.name === "asan-ubsan"),
    ),
  );
  for (const f of r.configFiles) unpack(f, f.file);
}
const audit = JSON.parse(material("helper/audit.json"));
assert.equal(audit.fixed, a.fixed);
assert.equal(audit.baseline, a.baseline);
assert.equal(audit.exitCode, 0);
assert.deepEqual(audit.violations, []);
assert.equal(audit.commands.length, 27);
streams(audit);
for (const row of Object.values(audit.production))
  assert.deepEqual(row.changed, []);
assert.equal(audit.actualProduction.length, 482);
assert.equal(audit.originalInputs.length, 81);
for (const row of [...audit.actualProduction, ...audit.originalInputs])
  assert.equal(row.gitBlob, row.expectedGitBlob);
assert.equal(audit.imports.length, 2);
assert.ok(
  audit.imports.every(
    (r) => r.patchEquivalentByIdenticalPathsModesTypesAndBeforeAfterBlobObjects,
  ),
);
assert.deepEqual(
  audit.imports.map((r) => r.completeTreeDeltaSha256),
  [
    "2281f9e1ab55ef071972c4c8a3a4b48182ba2eeae02316de19a4b3242be8716b",
    "a60e581e44fd7ac4e4d415c31244a7b8f7c7af6ff8321b08a72a571a38d03cd6",
  ],
);
for (const k of ["main", "P"]) {
  assert.equal(audit.publicDeclarations[k].length, 48);
  assert.ok(audit.publicDeclarations[k].every((r) => r.same));
}
assert.deepEqual(audit.publicDeclarations.PMissing, []);
assert.equal(audit.readOnlyProtection.files, 659);
assert.deepEqual(audit.readOnlyProtection.alteredDuringAudit, []);
const first = JSON.parse(material("helper/first-audit.json")),
  manifest = JSON.parse(material("helper/manifest.json"));
assert.equal(first.exitCode, 1);
assert.equal(first.commands.length, 27);
streams(first);
assert.equal(manifest.firstFacility.notProductFailure, true);
assert.equal(manifest.firstFacility.publicDeclarationsNotReached, true);
assert.equal(manifest.firstFacility.postflightGuardNotReached, true);
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
      status: a.status,
      c93GatePassed: true,
      c93ClosureOwner: "C",
      m5Complete: false,
      originalEntryAccepted: true,
      captures: names.size,
      materials: materials.size,
      blocks: blocks.size,
      bytes: raw.length,
      sha256: sha(raw),
      checkedInputs,
      originalMatrix: 3,
      cacheStages: 6,
      nativePerConfiguration: { serialization: 7, schema: 208, coreApi: 24 },
      limitedConfigurationCTestPerConfig: 2,
      serializationCTestPerConfig: 1,
      notFullCTest: true,
    },
    null,
    2,
  ),
);
