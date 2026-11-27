// B26 portable evidence verification only. No child process, validator replay,
// compiler, Core, SDK, or product import is executed by this file.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

assert.ok(process.argv.slice(2).every((arg) => arg === "--inputs"));
assert.ok(process.argv.slice(2).length <= 1, "only optional --inputs");
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const raw = fs.readFileSync(
  path.join(root, "docs/m5_b_source_ref_kind_freeze.json"),
);
const archive = JSON.parse(raw);
const fixed = "146bfa6069f611855f946344090a7b953303dd43";
const proposal = "4488b5bc15f7e2174ef18e5c1841ce2e7b999740";
const freeze = "764445d4c91a0113fddaae5d7027eb8fd16946e3";
const prefix = "web/tests/independent-source-ref-kind/";
const self = prefix + "verify-evidence.mjs";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const blob = (bytes) =>
  createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
const sorted = (values) => [...values].sort();
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const hex = (value) =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
function ids(rows, expected, label) {
  assert.ok(Array.isArray(rows), label);
  const actual = rows.map((row) => (typeof row === "string" ? row : row.id));
  assert.equal(new Set(actual).size, actual.length, label + " duplicate id");
  assert.deepEqual(sorted(actual), sorted(expected), label + " exact id set");
}
function counts(report, expected, label) {
  for (const [key, value] of Object.entries(expected))
    assert.equal(report[key], value, label + "." + key);
}
function unpack(encoded, label) {
  assert.ok(integer(encoded.bytes) && hex(encoded.sha256), label);
  assert.equal(typeof encoded.gzipBase64, "string", label);
  const bytes = gunzipSync(Buffer.from(encoded.gzipBase64, "base64"));
  assert.equal(bytes.length, encoded.bytes, label + " bytes");
  assert.equal(sha(bytes), encoded.sha256, label + " sha256");
  return bytes;
}
assert.equal(archive.kind, "B26 independent SourceHit refKind freeze baseline");
assert.equal(archive.fixed, fixed);
assert.equal(archive.proposal, proposal);
assert.equal(archive.freeze, freeze);

const blocks = new Map();
for (const [id, encoded] of Object.entries(archive.blocks)) {
  assert.ok(hex(id), "block id");
  blocks.set(id, unpack({ ...encoded, sha256: id }, "block " + id));
}
const materials = new Map();
for (const material of archive.materials) {
  assert.ok(typeof material.label === "string" && material.label.length);
  assert.ok(
    !materials.has(material.label),
    "duplicate material " + material.label,
  );
  assert.ok(integer(material.bytes) && hex(material.sha256));
  assert.ok(blocks.has(material.sha256), material.label + " missing block");
  assert.equal(
    blocks.get(material.sha256).length,
    material.bytes,
    material.label,
  );
  if (material.repoPath !== undefined) {
    assert.equal(typeof material.repoPath, "string");
    assert.ok(
      !path.isAbsolute(material.repoPath) && !material.repoPath.includes("\0"),
    );
    assert.ok(!material.repoPath.split(/[\\/]/).some((part) => part === ".."));
    assert.equal(material.label, "repo/" + material.repoPath);
  }
  materials.set(material.label, material);
}
function material(label) {
  assert.ok(materials.has(label), "missing material " + label);
  return blocks.get(materials.get(label).sha256);
}
const frozenBlobs = {
  "docs/plans/B-source-ref-kind-freeze.md":
    "bfc2bdc8c03ea57348c71b51cb7c4fde4503025a",
  [prefix + "README.md"]: "01fb6846f68910289a2f0a6562055dcd54a897d3",
  [prefix + "core-fixture.mjs"]: "a49fd9a07bf9c80c1cf970e520d6d1711a178597",
  [prefix + "inventory.mjs"]: "add41298af351eaef7aded3b91ec41c5fabc4745",
  [prefix + "native/CMakeLists.txt"]:
    "36ea2031e96bbbcdba9cf6f6d7716e774d0be62b",
  [prefix + "native/CoreApi.cpp"]: "748b62098878b4696e36a459d1aa952da3c76b5c",
  [prefix + "native/schema-replay.cpp"]:
    "7faf6b424ee811d2f5c3b294630e1bbfb0b60801",
  [prefix + "native/serialization.cpp"]:
    "cc6489b414a12f80176fd10cbb288ef38df95558",
  [prefix + "proposal.d.ts"]: "07478623626a24394d417e54716c69ecec7bc3f9",
  [prefix + "run-core.mjs"]: "c47b6bd4027630891272899476e3e448d0bf6228",
  [prefix + "run-sdk.mjs"]: "6a4dd654e35d53753fc613667767ada8a1ee498e",
  [prefix + "sdk-cases.mjs"]: "764bbfb15f69a3796b371a31e3ad975f545369a7",
  [prefix + "types.ts"]: "a3e200ae92a9ae36136a0ab0e141036e37b0b100",
  [prefix + "verify-native.mjs"]: "ce2ee337246e60e4178d6583428af27585a596de",
  [prefix + "verify-schema.mjs"]: "3bfeb205e8e962c3c77566b139aa28081b8f39f7",
  [prefix + "verify-types.mjs"]: "3d814d0e2852785e0e75b2ef49466f0473bbb370",
  [prefix + "wire-cases.mjs"]: "8ba112ae412f5f1d8190415c881c2d4f5a779554",
};
for (const [file, oid] of Object.entries(frozenBlobs)) {
  assert.equal(blob(material("repo/" + file)), oid, "frozen Git blob " + file);
  assert.equal(materials.get("repo/" + file).repoPath, file);
}
material("repo/" + self);
assert.equal(materials.get("repo/" + self).repoPath, self);
for (const file of [
  "protect.mjs",
  "protect.pre-owned-artifact.mjs",
  "prepare-baseline.mjs",
  "audit.mjs",
  "archive.mjs",
])
  material("B26-evidence/" + file);
for (const file of [
  "docs/DESIGN.md",
  "AGENTS.md",
  "docs/EXECPLANS.md",
  "docs/plans/M3-coordination.md",
])
  material("norm/" + file);

const requiredCaptures = [
  "initial-snapshot",
  "fresh-ci",
  "fresh-web-check",
  "inventory",
  "prepare-core-baseline",
  "pre-freeze-protection",
  "pre-baseline-protection",
  "types-proposal",
  "types-production",
  "schema-proposal",
  "schema-production",
  "sdk-baseline23",
  "core-baseline24",
  "native-baseline-three-config",
  "cpp-generated-check",
  "b25-portable-evidence",
];
const nonzero = [
  "pre-freeze-protection",
  "types-production",
  "schema-production",
  "sdk-baseline23",
  "core-baseline24",
  "native-baseline-three-config",
];
nonzero.push(
  "portable-archive-verification",
  "live-input-archive-verification",
);
const captures = new Map(),
  output = new Map();
for (const capture of archive.captures) {
  assert.ok(typeof capture.name === "string" && capture.name.length);
  assert.ok(!captures.has(capture.name), "duplicate capture " + capture.name);
  assert.equal(capture.capture_complete, true, capture.name);
  assert.ok(
    Array.isArray(capture.command) &&
      capture.command.length &&
      capture.command.every((arg) => typeof arg === "string"),
  );
  assert.ok(typeof capture.cwd === "string" && path.isAbsolute(capture.cwd));
  assert.ok(
    typeof capture.utc === "string" && Number.isFinite(Date.parse(capture.utc)),
  );
  assert.ok(Number.isFinite(capture.seconds) && capture.seconds >= 0);
  assert.equal(capture.outputMode, "combined stdout+stderr", capture.name);
  assert.equal(capture.utcMeaning, "capture finished", capture.name);
  assert.equal(
    capture.exit_code,
    nonzero.includes(capture.name) ? 1 : 0,
    capture.name + " exit",
  );
  const bytes = unpack(
    {
      bytes: capture.stdout_bytes,
      sha256: capture.stdout_sha256,
      gzipBase64: capture.stdout_gzip_base64,
    },
    "combined capture " + capture.name,
  );
  captures.set(capture.name, capture);
  output.set(capture.name, bytes);
}
for (const name of requiredCaptures)
  assert.ok(captures.has(name), "missing capture " + name);
assert.deepEqual(
  sorted(archive.captures.filter((c) => c.exit_code !== 0).map((c) => c.name)),
  sorted(nonzero),
);
const parse = (name) => {
  assert.ok(output.has(name), "missing JSON capture " + name);
  return JSON.parse(output.get(name).toString());
};

const initialBytes = material("initial-snapshot"),
  initial = JSON.parse(initialBytes);
assert.deepEqual(
  initial.roots.map((r) => r.files.length),
  [1104, 739, 1086],
);
assert.deepEqual(
  initial.roots.map((r) => r.head),
  [fixed, "e75ee93b6eada0e1325a7611f454f18fb242042f", fixed],
);
assert.equal(initial.mainDeclarations.length, 48);
const productRoot = initial.roots[2].root,
  bRoot = initial.roots[1].root;
assert.ok(
  path.isAbsolute(productRoot) && productRoot.includes("with space 中文"),
);
assert.equal(sha(material("norm/docs/DESIGN.md")), initial.design.sha256);
const snapshot = parse("initial-snapshot");
counts(
  snapshot,
  {
    snapshot: true,
    bytes: initialBytes.length,
    sha256: sha(initialBytes),
    declarations: 48,
  },
  "snapshot",
);
assert.deepEqual(snapshot.counts, [1104, 739, 1086]);
assert.deepEqual(snapshot.log, initial.log);
assert.deepEqual(snapshot.design, initial.design);
const protectedReport = parse("pre-baseline-protection");
counts(
  protectedReport,
  {
    protected: true,
    declarations: 48,
    BClean: true,
    BHead: freeze,
    mainHead: fixed,
    mainStaged: 0,
  },
  "protection",
);
assert.deepEqual(protectedReport.counts, [1104, 739, 1086]);
assert.deepEqual(protectedReport.logPrefix, initial.log);
assert.match(
  output.get("pre-freeze-protection").toString(),
  /AssertionError[\s\S]*\?\? core\/b-ref-kind-baseline\//,
);
assert.notEqual(
  sha(material("B26-evidence/protect.mjs")),
  sha(material("B26-evidence/protect.pre-owned-artifact.mjs")),
);

const inventory = parse("inventory");
assert.equal(
  inventory.kind,
  "B26 frozen input inventory NOT product acceptance",
);
const wire = inventory.wire,
  sdkInputs = inventory.sdk,
  coreInputs = inventory.core;
const typeIds = Array.from(
  { length: 40 },
  (_, i) => "RK" + String(i + 1).padStart(2, "0"),
);
ids(inventory.typeIds, typeIds, "type inventory");
for (const [rows, count, label] of [
  [wire, 208, "wire"],
  [sdkInputs, 23, "SDK"],
  [coreInputs, 24, "Core"],
]) {
  assert.equal(rows.length, count, label + " inventory size");
  assert.equal(
    new Set(rows.map((r) => r.id)).size,
    count,
    label + " inventory uniqueness",
  );
  assert.ok(
    rows.every(
      (r) =>
        r.id &&
        r.basis &&
        Object.hasOwn(r, "input") &&
        Object.hasOwn(r, "expected"),
    ),
  );
}
assert.ok(
  wire.every(
    (r) =>
      typeof r.expected === "boolean" &&
      [true, false, null].includes(r.legacyExpected),
  ),
);
assert.deepEqual(
  Object.fromEntries(
    [
      "SourceHit",
      "SourceHitPage",
      "SourceResolveResult",
      "SourceResolveResponse",
      "SourceRefKind",
    ].map((name) => [name, wire.filter((r) => r.definition === name).length]),
  ),
  {
    SourceHit: 100,
    SourceHitPage: 29,
    SourceResolveResult: 31,
    SourceResolveResponse: 31,
    SourceRefKind: 17,
  },
);
const enumInputs = wire.filter((r) => r.definition === "SourceRefKind"),
  legacyInputs = wire.filter((r) => r.definition !== "SourceRefKind");
assert.ok(enumInputs.every((r) => r.legacyExpected === null));
assert.ok(legacyInputs.every((r) => typeof r.legacyExpected === "boolean"));
assert.equal(enumInputs.filter((r) => r.expected).length, 2);
assert.equal(
  legacyInputs.filter((r) => r.expected !== r.legacyExpected).length,
  61,
);
assert.deepEqual(inventory.native, {
  serialization: 7,
  legacySubset: 2,
  coreApi: 24,
  configurations: ["Debug", "Release", "ASan-UBSan"],
});
const inputSignature = (row) => [row.id, row.input, row.expected, row.basis];
const wireById = new Map(wire.map((r) => [r.id, r]));

function typeBoundary(report, mode) {
  counts(
    report,
    {
      mode,
      product: productRoot,
      tools: productRoot + "/web",
      planned: 40,
      skipped: 0,
      positiveOnly: false,
      proposalFacilityOnly: mode === "proposal",
      typescript: "5.9.3",
    },
    "type boundary",
  );
  assert.ok(
    report.inputs.some(
      (f) =>
        f ===
        productRoot + "/web/packages/protocol-types/dist/wire.generated.d.ts",
    ),
  );
  assert.ok(
    report.inputs.some(
      (f) =>
        f === productRoot + "/web/packages/viewmodel/dist/selection-types.d.ts",
    ),
  );
  assert.equal(
    report.inputs.includes(bRoot + "/" + prefix + "proposal.d.ts"),
    mode === "proposal",
  );
  assert.ok(
    !report.inputs.some((f) =>
      /node_modules\/(?:@types\/(?:node|react)|electron)\//.test(f),
    ),
    "no ambient substitution",
  );
}
const typeProposal = parse("types-proposal");
typeBoundary(typeProposal, "proposal");
counts(
  typeProposal,
  { stage: "semantic-types", executed: 40, passed: 40, failed: 0, exitCode: 0 },
  "proposal type facility",
);
assert.deepEqual(typeProposal.positive, []);
ids(typeProposal.semantic, typeIds, "proposal semantic types");
for (const row of typeProposal.semantic) {
  assert.equal(row.passed, true);
  assert.ok(row.diagnostics.length > 0);
  for (const diagnostic of row.diagnostics) {
    assert.equal(diagnostic.file, bRoot + "/" + prefix + "types.ts");
    assert.ok(integer(diagnostic.line) && diagnostic.line > 0);
    assert.ok(
      ![2305, 2307, 2578].includes(diagnostic.code),
      "semantic type diagnostic, not missing API/unused marker",
    );
  }
}
const typeProduction = parse("types-production");
typeBoundary(typeProduction, "production");
counts(
  typeProduction,
  {
    stage: "positive-public-capability",
    executed: 0,
    passed: 0,
    failed: 0,
    exitCode: 1,
  },
  "production type capability red",
);
assert.deepEqual(typeProduction.semantic, []);
assert.deepEqual(
  sorted(new Set(typeProduction.positive.map((d) => d.code))),
  [2339, 2345, 2578, 2724],
);
assert.ok(
  typeProduction.positive.every(
    (d) => d.file === bRoot + "/" + prefix + "types.ts",
  ),
);

function schemaLane(lane, rows, mode, label) {
  ids(
    lane.results,
    rows.map((r) => r.id),
    label,
  );
  const isLegacy = mode === "legacy",
    isProposal = mode === "proposal";
  counts(
    lane,
    {
      planned: rows.length,
      executed: isProposal || isLegacy ? rows.length : 191,
      passed: isProposal || isLegacy ? rows.length : 130,
      failed: isProposal || isLegacy ? 0 : 61,
      blocked: isProposal || isLegacy ? 0 : 17,
      skipped: 0,
    },
    label,
  );
  for (const result of lane.results) {
    const input = wireById.get(result.id),
      expected = isLegacy ? input.legacyExpected : input.expected;
    assert.equal(result.definition, input.definition);
    assert.equal(result.expected, expected);
    if (!isProposal && !isLegacy && input.definition === "SourceRefKind") {
      assert.match(result.capabilityFailure, /definition absent/);
      assert.ok(
        !Object.hasOwn(result, "actual") && !Object.hasOwn(result, "passed"),
        "blocked enum not negative pass",
      );
    } else {
      assert.equal(
        result.actual,
        isProposal ? input.expected : input.legacyExpected,
      );
      assert.equal(result.unchanged, true);
      assert.equal(result.passed, result.actual === expected);
      assert.ok(!Object.hasOwn(result, "error"));
    }
  }
}
const schemaProposal = parse("schema-proposal"),
  schemaProduction = parse("schema-production");
const capabilityIds = [
  "enum-definition",
  "single-schema-reference",
  "old-required-fields",
  "unknown-extensions",
  "no-new-default",
];
for (const [report, mode] of [
  [schemaProposal, "proposal"],
  [schemaProduction, "production"],
]) {
  counts(
    report,
    {
      mode,
      product: productRoot,
      tools: productRoot + "/web",
      proposalFacilityOnly: mode === "proposal",
      plannedInputs: 208,
      legacyRoot: productRoot,
      legacyNewDefinitionNotApplicable: 17,
      exitCode: mode === "proposal" ? 0 : 1,
    },
    "schema boundary",
  );
  assert.ok(!Object.hasOwn(report, "error"));
  ids(report.capability, capabilityIds, "schema capabilities");
  for (const c of report.capability)
    assert.equal(
      c.passed,
      mode === "proposal" ||
        !["enum-definition", "single-schema-reference"].includes(c.id),
    );
  assert.equal(report.schema.sha256, report.legacySchema.sha256);
  assert.equal(
    report.schema.sha256,
    initial.roots[2].files.find(
      (f) => f.file === "protocol/schema/hier.schema.json",
    ).sha256,
  );
  schemaLane(
    report.lanes.legacyGeneratedCompatibility,
    legacyInputs,
    "legacy",
    mode + " old compatibility (191, not 208)",
  );
}
assert.deepEqual(
  sorted(Object.keys(schemaProposal.lanes)),
  sorted(["proposalSchema", "legacyGeneratedCompatibility"]),
);
assert.deepEqual(
  sorted(Object.keys(schemaProduction.lanes)),
  sorted([
    "productionSchema",
    "productionGenerated",
    "legacyGeneratedCompatibility",
  ]),
);
schemaLane(
  schemaProposal.lanes.proposalSchema,
  wire,
  "proposal",
  "in-memory proposal fixture only",
);
for (const name of ["productionSchema", "productionGenerated"])
  schemaLane(schemaProduction.lanes[name], wire, "production", name);
assert.deepEqual(
  schemaProduction.productionGeneratedPin,
  schemaProduction.legacyGeneratedPin,
);
assert.deepEqual(
  schemaProduction.legacyGeneratedPin,
  schemaProposal.legacyGeneratedPin,
);

const sdk = parse("sdk-baseline23");
counts(
  sdk,
  {
    product: productRoot,
    planned: 23,
    executed: 23,
    passed: 8,
    failed: 15,
    skipped: 0,
    blocked: 0,
    exitCode: 1,
  },
  "SDK baseline",
);
assert.deepEqual(sdk.cleanupErrors, []);
ids(
  sdk.results,
  sdkInputs.map((r) => r.id),
  "SDK result ids",
);
for (const row of sdk.results) {
  const input = sdkInputs.find((r) => r.id === row.id),
    invalid = input.input.mode.startsWith("invalid");
  assert.deepEqual(inputSignature(row), inputSignature(input));
  assert.equal(row.pass, !invalid);
  if (invalid) {
    assert.match(row.error, /AssertionError/);
    assert.match(
      row.error,
      input.input.mode === "invalid-model"
        ? /invalid tag must not publish candidate success/
        : /invalid tag must produce protocol_error rather than be accepted as extension/,
    );
    if (input.input.mode !== "invalid-model")
      assert.deepEqual(row.actualPrimary, { accepted: true, errorCode: null });
  } else assert.ok(!Object.hasOwn(row, "error"));
}
const preparation = parse("prepare-core-baseline"),
  core = parse("core-baseline24");
counts(
  preparation,
  {
    freshBuild: false,
    bytes: initial.mainCoreBinary.bytes,
    sha256: initial.mainCoreBinary.sha256,
    productionTreeLines: 298,
  },
  "reused binary preparation",
);
assert.equal(
  preparation.target,
  productRoot + "/core/b-ref-kind-baseline/hier",
);
counts(
  core,
  {
    product: productRoot,
    planned: 24,
    executed: 24,
    passed: 0,
    failed: 24,
    skipped: 0,
    blocked: 0,
    exitCode: 1,
  },
  "SDK-Core baseline",
);
assert.deepEqual(core.cleanupErrors, []);
counts(
  core.binary,
  {
    path: preparation.target,
    bytes: preparation.bytes,
    sha256: preparation.sha256,
  },
  "baseline binary pin",
);
assert.match(core.binary.provenance, /not fresh native build/);
ids(
  core.results,
  coreInputs.map((r) => r.id),
  "Core result ids",
);
for (const row of core.results) {
  const input = coreInputs.find((r) => r.id === row.id);
  assert.deepEqual(inputSignature(row), inputSignature(input));
  assert.equal(row.pass, false);
  assert.equal(row.legacyProjectionVerified, true);
  assert.equal(row.targetCount, row.input.kind === "definition" ? 1 : 2);
  assert.deepEqual(
    row.targetKinds,
    Array(row.targetCount).fill(row.input.kind),
  );
  assert.match(
    row.error,
    /AssertionError[\s\S]*new Core must emit authoritative refKind for every actual hit/,
  );
  assert.doesNotMatch(row.error, /watchdog/);
  assert.deepEqual(sorted(new Set(row.pages.map((p) => p.limit))), [1, 2, 200]);
}

const native = parse("native-baseline-three-config");
assert.equal(output.get("native-baseline-three-config").length, 658832);
counts(native, { product: productRoot, exitCode: 1 }, "native baseline");
assert.deepEqual(native.cleanupErrors, []);
assert.ok(!Object.hasOwn(native, "facilityError"));
assert.deepEqual(native.capability, {
  newCppField: false,
  semanticExecuted: 0,
});
ids(
  native.configurations.map((c) => c.name),
  inventory.native.configurations,
  "native configuration ids",
);
assert.equal(
  native.commands.length,
  14,
  "version + capability + 4 commands per configuration",
);
for (const [i, command] of native.commands.entries()) {
  assert.ok(Array.isArray(command.command) && command.command.length);
  assert.equal(command.cwd, bRoot);
  assert.ok(
    Number.isFinite(Date.parse(command.started)) &&
      Date.parse(command.ended) >= Date.parse(command.started),
  );
  assert.ok(Number.isFinite(command.milliseconds) && command.milliseconds >= 0);
  assert.equal(
    command.status,
    i === 1 ? 1 : 0,
    "only absent-new-field syntax probe fails",
  );
  assert.equal(command.signal, null);
  assert.equal(command.error, null);
  unpack(command.stdout, "native stdout " + i);
  unpack(command.stderr, "native stderr " + i);
}
assert.ok(native.commands[0].command.includes("--version"));
assert.ok(native.commands[1].command.includes("-fsyntax-only"));
assert.ok(native.commands[1].command.at(-1).endsWith("/capability.cpp"));
assert.match(
  unpack(native.commands[1].stderr, "absent field diagnostic").toString(),
  /SourceRefKind|refKind/,
);
assert.ok(
  captures.get("native-baseline-three-config").command.includes("--core-api"),
);
const legacyCppIds = ["B-RK-CPP-default", "B-RK-CPP-four-field-aggregate"];
for (const name of inventory.native.configurations) {
  const config = native.configurations.find((c) => c.name === name);
  counts(
    config.legacy,
    { planned: 2, executed: 2, passed: 2, failed: 0 },
    name + " legacy subset",
  );
  counts(
    config.serialization,
    { planned: 7, executed: 0, passed: 0, failed: 0, blocked: 7 },
    name + " new C++ blocked",
  );
  counts(
    config.coreApi,
    {
      planned: 24,
      executed: 0,
      passed: 0,
      failed: 0,
      blocked: 24,
      freshCoreBuilt: false,
    },
    name + " Core API blocked",
  );
  assert.ok(
    !Object.hasOwn(config.coreApi, "binary"),
    "no unexecuted fresh binary claim",
  );
  ids(config.results, legacyCppIds, name + " executed C++ ids");
  assert.ok(config.results.every((r) => r.pass === true));
  counts(
    config.schema,
    {
      planned: 208,
      executed: 191,
      passed: 130,
      failed: 61,
      blocked: 17,
      enumDefinitionQualified: false,
    },
    name + " schema",
  );
  ids(
    config.schema.results,
    legacyInputs.map((r) => r.id),
    name + " actual schema ids",
  );
  for (const row of config.schema.results) {
    const input = wireById.get(row.id);
    assert.deepEqual(inputSignature(row), inputSignature(input));
    assert.equal(row.definition, input.definition);
    assert.equal(row.legacyExpected, input.legacyExpected);
    assert.equal(row.actual, input.legacyExpected);
    assert.equal(row.pass, row.actual === input.expected);
  }
}

const helperRaw = material("helper-debug/recovery.json"),
  helper = JSON.parse(helperRaw);
assert.equal(
  sha(helperRaw),
  "fa3e901ffbf32d9be1aaa1fad7757b8a23632d72e8be597d02cfb1055b54b0d6",
  "original recovery manifest",
);
assert.equal(helper.rerunPerformedForRecovery, false);
const helperFiles = [
  "first-command.event.json",
  "first-command-output.txt",
  "first-type-report.json",
  "fixed-command.event.json",
  "fixed-command-output.txt",
  "fixed-type-report.json",
  "source-pre-fix-readonly-captures.json",
  "source-pre-fix-recovered.txt",
];
ids(
  helper.materials.map((m) => m.file),
  helperFiles,
  "helper exact recovery materials",
);
for (const m of helper.materials) {
  const bytes = material("helper-debug/" + m.file);
  assert.equal(bytes.length, m.bytes);
  assert.equal(sha(bytes), m.sha256);
}
for (const [label, exit, time] of [
  ["first", 1, "2026-10-17T12:01:29.024Z"],
  ["fixed", 0, "2026-10-17T12:03:05.938Z"],
]) {
  const event = JSON.parse(
    material("helper-debug/" + label + "-command.event.json"),
  );
  assert.equal(
    event.timestamp,
    time,
    "event time only, not invented process start",
  );
  assert.equal(helper[label].eventTimestamp, time);
  assert.equal(event.type, "event_msg");
  const command = event.payload.item;
  assert.equal(command.type, "CommandExecution");
  assert.equal(command.exit_code, exit);
  assert.equal(
    command.cwd.startsWith("file:") ? fileURLToPath(command.cwd) : command.cwd,
    bRoot,
  );
  assert.match(
    command.command.at(-1),
    /verify-types\.mjs proposal --positive-only/,
  );
  const merged = material(
    "helper-debug/" + label + "-command-output.txt",
  ).toString();
  assert.equal(command.aggregated_output, merged);
  const report = JSON.parse(
    material("helper-debug/" + label + "-type-report.json"),
  );
  assert.deepEqual(JSON.parse(merged.slice(merged.indexOf("{\n"))), report);
  counts(
    report,
    {
      mode: "proposal",
      proposalFacilityOnly: true,
      positiveOnly: true,
      planned: 40,
      executed: 0,
      passed: 0,
      failed: 0,
      exitCode: exit,
    },
    "helper facility, not product",
  );
  assert.deepEqual(report.semantic, []);
  if (label === "first") {
    assert.equal(report.stage, "positive-public-capability");
    assert.deepEqual(
      report.positive.map((d) => [d.code, d.line]),
      [
        [2578, 188],
        [2375, 191],
      ],
    );
  } else {
    assert.equal(report.stage, "proposal-positive-facility-debug");
    assert.deepEqual(report.positive, []);
  }
}
// The pinned recovery manifest already binds the exact source-read captures and
// derived pre-fix text. Do not reconstruct or re-execute them during verification.

assert.match(
  output.get("cpp-generated-check").toString(),
  /^C\+\+ schema: 195 definitions, 27 methods, checked\s*$/,
);
const b25 = parse("b25-portable-evidence");
counts(
  b25,
  {
    verified: true,
    notProductExecution: true,
    checkedInputs: 0,
    fixed: "5c81d81e4b46e58b66f4b911a85ecf03e02d5202",
    freeze: "b98dfb50ffa5f2603b11319ad17c9f47cfaa7ca7",
  },
  "B25 archived evidence, not rerun",
);

// Retain the first seal and real failed verifier executions, not just corrected receipts.
const firstRaw = material("B26-evidence/first-archive.json");
assert.equal(firstRaw.length, 997793);
assert.equal(
  sha(firstRaw),
  "b44974acd8613973515207ff845bba505a37db02e1fc4c41e40965b367dd0cd4",
);
const first = JSON.parse(firstRaw);
assert.equal(first.captures.length, 31);
for (const [id, b] of Object.entries(first.blocks))
  unpack({ ...b, sha256: id }, "first seal block");
const oldChecker = first.materials.find((m) => m.label === "repo/" + self);
assert.ok(oldChecker);
assert.deepEqual(
  material("B26-evidence/verify-evidence.pre-file-url.mjs"),
  unpack(
    { ...first.blocks[oldChecker.sha256], sha256: oldChecker.sha256 },
    "original verifier",
  ),
);
for (const name of [
  "portable-archive-verification",
  "live-input-archive-verification",
]) {
  assert.match(
    output.get(name).toString(),
    /AssertionError[\s\S]*file:\/\/\/Users/,
  );
  assert.match(output.get(name).toString(), /verify-evidence\.mjs:795/);
}
counts(
  parse("portable-first-archive-after-cwd-adaptation"),
  {
    verified: true,
    notProductExecution: true,
    bytes: firstRaw.length,
    sha256: sha(firstRaw),
    checkedInputs: 0,
  },
  "first seal after URL adaptation",
);
assert.equal(archive.freezeCommit.sha, freeze);
assert.equal(
  archive.freezeCommit.parent,
  "e75ee93b6eada0e1325a7611f454f18fb242042f",
);
assert.equal(archive.freezeCommit.newFiles, 17);
for (const name of [
  "types-proposal",
  "types-production",
  "schema-proposal",
  "schema-production",
  "sdk-baseline23",
  "core-baseline24",
  "native-baseline-three-config",
]) {
  const c = captures.get(name);
  assert.ok(
    Date.parse(c.utc) - c.seconds * 1000 >
      Date.parse(archive.freezeCommit.committedAt),
    "freeze before baseline " + name,
  );
}

let checkedInputs = 0;
if (process.argv.includes("--inputs")) {
  const realRoot = fs.realpathSync(root);
  for (const m of archive.materials.filter((m) => m.repoPath !== undefined)) {
    const file = fs.realpathSync(path.join(root, m.repoPath));
    const relative = path.relative(realRoot, file);
    assert.ok(
      relative &&
        !relative.startsWith(".." + path.sep) &&
        !path.isAbsolute(relative),
      "B-owned input only",
    );
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.length, m.bytes, m.repoPath);
    assert.equal(sha(bytes), m.sha256, m.repoPath);
    checkedInputs++;
  }
}
console.log(
  JSON.stringify(
    {
      verified: true,
      notProductExecution: true,
      fixed,
      proposal,
      freeze,
      bytes: raw.length,
      sha256: sha(raw),
      captures: captures.size,
      materials: materials.size,
      blocks: blocks.size,
      checkedInputs,
      frozenSourceFiles: 17,
      inventory: { wire: 208, sdk: 23, core: 24, types: 40 },
      proposalFacilities: {
        types: { executed: 40, passed: 40 },
        schema: { executed: 208, passed: 208 },
        legacyCompatibility: { executed: 191, passed: 191 },
      },
      productionBaseline: {
        typeCapabilityRedSemanticExecuted: 0,
        schemaPerLane: { executed: 191, passed: 130, failed: 61, blocked: 17 },
        sdk: { executed: 23, passed: 8, failed: 15 },
        sdkCore: {
          executed: 24,
          passed: 0,
          failed: 24,
          legacyProjectionVerified: 24,
        },
        nativePerConfiguration: {
          legacyExecuted: 2,
          legacyPassed: 2,
          schemaExecuted: 191,
          schemaPassed: 130,
          schemaFailed: 61,
          schemaBlocked: 17,
          newSerializationExecuted: 0,
          newSerializationBlocked: 7,
          coreApiExecuted: 0,
          coreApiBlocked: 24,
          freshCoreBuilt: false,
        },
      },
      helperDebug: {
        firstExit: 1,
        fixedExit: 0,
        semanticExecuted: 0,
        notProductAcceptance: true,
      },
      countsAreSeparateLanesNotSummedUniqueBusinessCases: true,
    },
    null,
    2,
  ),
);
