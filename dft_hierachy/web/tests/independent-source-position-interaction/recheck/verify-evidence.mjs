// Portable replay of frozen B23 evidence, NOT a new product execution.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { cases } from "../cases.mjs";
const B = path.resolve(import.meta.dirname, "../../../..");
const raw = fs.readFileSync(
  B + "/docs/m5_b_source_position_interaction_freeze.json",
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(raw.length, 850095);
assert.equal(
  sha(raw),
  "77ca1a322f3c128afc78183def5fd42f2a90e88f4184e555d56c5d31a79d128e",
);
const e = JSON.parse(raw);
assert.equal(e.format, "hier-b23-source-position-interaction-freeze-v1");
assert.equal(e.role, "B");
assert.equal(e.cycle, 23);
assert.equal(e.fixed, "57fb80db5581028549e116e40d3f21b759f9b1b2");
assert.equal(e.freeze, "87dd0bae9c73886fcd6713c721e671566f0fe805");
assert.equal(e.maintenance, "781a1f2dd3532f49739b57080fb42559fa19f1e2");
assert.equal(e.oracle.AImplementationOrCapabilitiesUsedAsOracle, false);
assert.equal(e.oracle.oldExpectationsChanged, false);
assert.equal(e.oracle.newProductImplemented, false);
assert.equal(e.oracle.fullCoreGateExecuted, false);
assert.equal(e.oracle.ElectronExecuted, false);
assert.equal(e.oracle.M5Complete, false);
const blocks = new Map();
for (const [h, b] of Object.entries(e.blocks)) {
  const v = gunzipSync(Buffer.from(b.gzip_base64, "base64"));
  assert.equal(v.length, b.bytes);
  assert.equal(sha(v), h);
  blocks.set(h, v);
}
assert.equal(blocks.size, 103);
assert.equal(e.materials.length, 104);
const keys = new Set();
for (const m of e.materials) {
  assert.ok(!path.isAbsolute(m.file) && !m.file.split("/").includes(".."));
  assert.ok(!keys.has(m.scope + ":" + m.file));
  keys.add(m.scope + ":" + m.file);
  assert.equal(m.block, m.sha256);
  assert.equal(blocks.get(m.block).length, m.bytes);
}
const frozen = e.materials.filter((m) => m.scope === "B-new-frozen"),
  maint = e.materials.filter((m) => m.scope === "B-maintenance");
assert.equal(frozen.length, 11);
assert.equal(maint.length, 1);
assert.ok(frozen.every((m) => m.commit === e.freeze));
assert.equal(
  maint[0].file,
  "web/tests/independent-source-position-interaction/run.mjs",
);
const initialBytes = blocks.get(e.initial.block);
assert.equal(initialBytes.length, e.initial.bytes);
assert.equal(sha(initialBytes), e.initial.sha256);
assert.equal(
  e.initial.sha256,
  "bf9a141c8fc519b5b042517907bfef1e38e142979a25c533b8c2aea02b069285",
);
const initial = JSON.parse(initialBytes);
assert.deepEqual(
  initial.roots.map((r) => r.files.length),
  [1057, 712, 1039],
);
assert.equal(initial.mainDeclarations.length, 46);
const outputs = new Map(),
  reports = new Map();
assert.equal(e.captures.length, 24);
for (const c of e.captures) {
  assert.ok(!outputs.has(c.name));
  assert.equal(c.capture_complete, true);
  assert.ok(
    c.command.length &&
      path.isAbsolute(c.cwd) &&
      Number.isFinite(Date.parse(c.utc)) &&
      c.seconds >= 0,
  );
  const v = gunzipSync(Buffer.from(c.stdout_gzip_base64, "base64"));
  assert.equal(v.length, c.stdout_bytes);
  assert.equal(sha(v), c.stdout_sha256);
  assert.equal(v.toString().slice(-2400), c.tail);
  outputs.set(c.name, v.toString());
  try {
    reports.set(c.name, JSON.parse(v));
  } catch {}
}
assert.deepEqual(
  e.captures.filter((c) => c.exit_code !== 0).map((c) => [c.name, c.exit_code]),
  [
    ["b23_types_production", 1],
    ["b23_production_DOM119", 1],
    ["b23_package2", 1],
    ["b23_package2_esm_retry", 1],
  ],
);
const report = (n) => {
  const r = reports.get(n);
  assert.ok(r, n);
  return r;
};
const dom = report("b23_production_DOM119");
assert.deepEqual(
  [dom.planned, dom.executed, dom.passed, dom.failed, dom.skipped, dom.blocked],
  [119, 119, 38, 81, 0, 0],
);
assert.equal(dom.productMounted, true);
assert.equal(dom.stage, "production-DOM-events");
assert.equal(dom.realInputPlanned, 5);
assert.deepEqual(dom.buildWarnings, []);
assert.deepEqual(dom.cleanupErrors, []);
assert.deepEqual(
  dom.results.map((r) => r.id),
  cases.map((c) => c.id),
);
assert.ok(
  dom.results.every(
    (r) =>
      r.enteredProduct &&
      r.cleanup.remainingRoots === 0 &&
      r.cleanup.errors.length === 0,
  ),
);
assert.deepEqual(
  dom.results.filter((r) => r.pass).map((r) => r.id),
  e.oracle.DOMBaseline.passedIds,
);
assert.deepEqual(
  dom.results.filter((r) => !r.pass).map((r) => r.id),
  e.oracle.DOMBaseline.failedIds,
);
const expectedPass = (c) =>
  c.group === "disabled" ||
  c.group === "key-ignore" ||
  c.group === "ignore" ||
  (c.group === "config" &&
    (c.id.endsWith("-omitted") || c.id.includes("-old-validation-"))) ||
  (c.group === "mouse" &&
    !["primary", "fallback", "unavailable"].includes(c.input.mode));
assert.deepEqual(
  dom.results.filter((r) => r.pass).map((r) => r.id),
  cases.filter(expectedPass).map((c) => c.id),
);
for (const r of dom.results.filter((r) => !r.pass)) {
  assert.equal(r.errors.length, 1);
  assert.match(
    r.errors[0],
    /^page.evaluate: Error: (invalid positionQuery|locate read once|original accessor throw|enabled visible instruction|second instance instruction|exactly one call per explicit valid action|fixed native API fallback instruction|mouse capability hint established)/,
  );
  assert.ok(!r.errors[0].includes("watchdog"));
}
const proposed = report("b23_types_proposal42"),
  production = report("b23_types_production");
assert.deepEqual(
  [
    proposed.planned,
    proposed.executed,
    proposed.passed,
    proposed.failed,
    proposed.skipped,
  ],
  [42, 42, 42, 0, 0],
);
assert.deepEqual(proposed.positive, []);
assert.equal(proposed.semantic.length, 42);
const typeMaterial = frozen.find((m) => m.file.endsWith("/types.ts")),
  source = blocks.get(typeMaterial.block).toString();
const markers = source.split("\n").flatMap((line, index) => {
  const m = line.match(/@ts-expect-error (SPI\d+):/);
  return m ? [{ id: m[1], line: index + 2 }] : [];
});
assert.equal(markers.length, 42);
assert.deepEqual(
  proposed.semantic.map((r) => r.id),
  markers.map((m) => m.id),
);
for (let i = 0; i < 42; i++) {
  const r = proposed.semantic[i];
  assert.equal(r.passed, true);
  assert.ok(r.diagnostics.length);
  assert.ok(
    r.diagnostics.every(
      (d) =>
        d.file.endsWith("/types.ts") &&
        d.line === markers[i].line &&
        ![2305, 2307, 2578].includes(d.code),
    ),
  );
}
assert.equal(production.mode, "production");
assert.equal(production.stage, "positive-public-capability");
assert.equal(production.executed, 0);
assert.equal(production.skipped, 0);
assert.deepEqual(production.semantic, []);
assert.equal(production.positive.filter((d) => d.code === 2305).length, 2);
assert.ok(
  production.positive.some(
    (d) => d.code === 2353 && d.message.includes("positionQuery"),
  ),
);
assert.ok(
  !production.inputs.some((f) =>
    f.endsWith("/independent-source-position-interaction/proposal.d.ts"),
  ),
);
for (const t of [production, proposed]) {
  assert.equal(t.typescript, "5.9.3");
  assert.ok(
    t.inputs.some((f) => f.endsWith("/node_modules/@types/react/index.d.ts")),
  );
  assert.ok(
    !t.inputs.some((f) => /node_modules\/(?:@types\/node|electron)\//.test(f)),
  );
}
const native = report("b23_native_frozen");
assert.equal(native.productMounted, false);
assert.deepEqual(
  [
    native.planned,
    native.executed,
    native.passed,
    native.failed,
    native.skipped,
    native.blocked,
  ],
  [8, 8, 8, 0, 0, 0],
);
assert.deepEqual(native.cleanupErrors, []);
assert.match(outputs.get("b23_frozen_inventory"), /ℹ pass 3\n/);
assert.match(outputs.get("b23_frozen_inventory"), /ℹ fail 0\n/);
const oldPack = report("b23_package2"),
  pack = report("b23_package2_esm_retry");
assert.match(oldPack.groups[1].report.error, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
assert.equal(oldPack.groups[1].report.executed, 0);
assert.equal(oldPack.groups[1].report.blocked, 5);
for (const p of [oldPack, pack]) {
  assert.deepEqual(
    [p.planned, p.executed, p.passed, p.failed, p.skipped, p.blocked],
    [2, 2, 0, 2, 0, 0],
  );
  assert.deepEqual(p.cleanupErrors, []);
  assert.equal(p.setupError, undefined);
  assert.equal(p.packs.length, 9);
  assert.equal(p.commands.length, 13);
  assert.ok(
    p.packs.every((t) => /^[a-f0-9]{64}$/.test(t.sha256) && t.bytes > 0),
  );
  assert.ok(p.commands.slice(0, 11).every((c) => c.status === 0));
  assert.deepEqual(
    p.commands.slice(11).map((c) => c.status),
    [1, 1],
  );
  for (const c of p.commands) {
    assert.equal(c.signal, null);
    assert.equal(c.timedOut, false);
    assert.equal(c.outputLimitExceeded, false);
    assert.equal(c.error, null);
    for (const k of ["stdout", "stderr"]) {
      const v = gunzipSync(Buffer.from(c[k].gzipBase64, "base64"));
      assert.equal(v.length, c[k].bytes);
      assert.equal(sha(v), c[k].sha256);
    }
  }
  assert.equal(p.groups[0].report.semanticNegativesExecuted, 0);
  assert.ok(p.groups[0].report.positive.some((d) => d.code === 2305));
}
assert.ok(
  pack.groups.every(
    (g) => g.executed && !g.passed && g.error === undefined && g.exitCode === 1,
  ),
);
const packed = pack.groups[1].report;
assert.equal(packed.truePack, true);
assert.equal(packed.productMounted, true);
assert.deepEqual(
  [
    packed.planned,
    packed.executed,
    packed.passed,
    packed.failed,
    packed.skipped,
    packed.blocked,
  ],
  [5, 5, 0, 5, 0, 0],
);
assert.deepEqual(
  packed.results.map((r) => r.id),
  cases.filter((c) => c.group.startsWith("trusted-")).map((c) => c.id),
);
assert.ok(
  packed.results.every(
    (r) =>
      r.enteredProduct &&
      r.errors[0].includes("exactly one call per explicit valid action") &&
      r.cleanup.errors.length === 0,
  ),
);
assert.deepEqual(packed.cleanupErrors, []);
assert.equal(packed.packageResolution.length, 4);
for (const r of packed.packageResolution) {
  assert.ok(r.command.includes("--input-type=module"));
  assert.ok(r.entry.startsWith(r.cwd + path.sep));
}
const audit = report("b23_input_audit");
assert.equal(audit.unchangedObjects, 300);
assert.equal(audit.oracleFiles.length, 26);
assert.equal(audit.publicDeclarations.length, 46);
assert.equal(audit.toolPins.length, 8);
assert.equal(
  audit.design.sha256,
  "7d7d43afa14c6cc7a3da2d3fb08f8c79e7196064bceb5917fca6e8d9e464d8ba",
);
assert.equal(audit.productClean, true);
assert.equal(audit.mainStaged, "");
const protection = report("b23_final_protection");
assert.equal(protection.protected, true);
assert.equal(protection.BClean, true);
assert.equal(protection.mainStaged, 0);
const freezeCapture = e.captures.find((c) => c.name === "b23_freeze_commit");
for (const n of [
  "b23_production_DOM119",
  "b23_types_proposal42",
  "b23_types_production",
  "b23_package2",
]) {
  const c = e.captures.find((c) => c.name === n);
  assert.ok(
    Date.parse(c.utc) - c.seconds * 1000 > Date.parse(freezeCapture.utc),
    "freeze before " + n,
  );
}
let inputs = 0,
  protectedFiles = 0;
if (process.argv.includes("--inputs")) {
  const roots = {
    "B-new-frozen": e.paths.B,
    "B-maintenance": e.paths.B,
    "B-old-oracle": e.paths.B,
    "public-fixed": e.paths.P,
    "coordination-reference": e.paths.M,
    "public-declaration": e.paths.P,
    "fixed-tool": e.paths.TOOLS,
    "evidence-script": e.paths.E,
  };
  for (const m of e.materials) {
    const oldRunner = m.scope === "B-new-frozen" && m.file === maint[0].file;
    const b = oldRunner
      ? execFileSync("git", ["show", e.freeze + ":" + m.file], {
          cwd: e.paths.B,
        })
      : fs.readFileSync(path.join(roots[m.scope], m.file));
    assert.equal(sha(b), m.sha256, m.scope + "/" + m.file);
    inputs++;
  }
  const check = (r, f) => {
    const file = path.join(r, f.file),
      b = fs.readFileSync(file),
      s = fs.statSync(file, { bigint: true });
    assert.equal(b.length, f.bytes, file);
    assert.equal(sha(b), f.sha256, file);
    assert.equal(String(s.mtimeNs), f.mtimeNs, file);
  };
  for (const r of initial.roots)
    for (const f of r.files) {
      check(r.root, f);
      protectedFiles++;
    }
  for (const f of initial.mainDeclarations) check(e.paths.M, f);
  for (const f of initial.toolPins) check(e.paths.TOOLS, f);
  assert.equal(
    sha(
      fs
        .readFileSync(e.paths.M + "/docs/REVIEW_LOG.md")
        .subarray(0, initial.log.bytes),
    ),
    initial.log.sha256,
  );
}
console.log(
  JSON.stringify(
    {
      verified: true,
      fixed: e.fixed,
      freeze: e.freeze,
      maintenance: e.maintenance,
      bytes: raw.length,
      sha256: sha(raw),
      captures: e.captures.length,
      materials: e.materials.length,
      blocks: blocks.size,
      baseline: {
        DOM: { executed: 119, passed: 38, failed: 81, skipped: 0, blocked: 0 },
        proposalTypes: 42,
        productionTypeCapability: false,
        productionSemanticNegativesExecuted: 0,
        packageGroups: { executed: 2, passed: 0, failed: 2 },
        packageTrusted: { executed: 5, failed: 5 },
        nativeFacility: 8,
        inventoryFacility: 3,
      },
      inputs,
      protectedFiles,
      notProductExecution: true,
    },
    null,
    2,
  ),
);
