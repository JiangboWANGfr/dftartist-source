// Portable byte/semantic evidence replay; this is NOT a new product test run.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { cases as originalCases } from "../cases.mjs";
import { cases as qCases } from "../q1q2/cases.mjs";
import { cases as scaleCases } from "../scale/cases.mjs";
const B = path.resolve(import.meta.dirname, "../../../..");
const raw = fs.readFileSync(B + "/docs/m5_b_source_view_c89_recheck.json");
const sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(raw.length, 800103);
assert.equal(
  sha(raw),
  "8b2857882727089a6ec6dd2c4b7f2b38b346584f00e75cfdcda4a77479712494",
);
const e = JSON.parse(raw);
assert.equal(e.format, "hier-b22-source-view-c89-v1");
assert.equal(e.role, "B");
assert.equal(e.cycle, 22);
assert.equal(e.fixed, "a757417971426a9f7fe9ac00dd7e424868154463");
assert.equal(e.facilityFinal, "3bef718d5611f5e5e230b2329dbe8c06923f5e35");
assert.equal(e.oracle.AImplementationUsedAsOracle, false);
assert.equal(e.oracle.originalBusinessExpectationsChanged, false);
assert.deepEqual(
  [e.oracle.DOM, e.oracle.typeRules, e.oracle.packageGroups],
  [117, 28, 6],
);
assert.equal(e.oracle.aggregateProductExecuted, 0);
assert.equal(e.oracle.fullCoreGateExecuted, false);
assert.equal(e.oracle.ElectronUIToCoreExecuted, false);
assert.equal(e.oracle.M5Complete, false);
const blocks = new Map();
for (const [h, b] of Object.entries(e.blocks)) {
  const value = gunzipSync(Buffer.from(b.gzip_base64, "base64"));
  assert.equal(value.length, b.bytes);
  assert.equal(sha(value), h);
  blocks.set(h, value);
}
assert.equal(blocks.size, 91);
assert.equal(e.materials.length, 92);
const keys = new Set();
for (const m of e.materials) {
  assert.ok(!path.isAbsolute(m.file) && !m.file.split("/").includes(".."));
  assert.ok(!keys.has(m.scope + ":" + m.file));
  keys.add(m.scope + ":" + m.file);
  assert.equal(m.sha256, m.block);
  assert.equal(blocks.get(m.block).length, m.bytes);
}
const initialBytes = blocks.get(e.initial.block);
assert.equal(initialBytes.length, e.initial.bytes);
assert.equal(sha(initialBytes), e.initial.sha256);
assert.equal(
  e.initial.sha256,
  "ad7b65fe2c705e46d22fa3314e2e843a8017cd0a5fdb09e7956cac0186382291",
);
const initial = JSON.parse(initialBytes);
assert.deepEqual(
  initial.roots.map((r) => r.files.length),
  [1042, 707, 1024],
);
assert.equal(initial.mainDeclarations.length, 46);
assert.equal(initial.toolPins.length, 2);
function objects(text) {
  const out = [];
  for (let at = 0; at < text.length; at++) {
    if (text[at] !== "{" || (at && text[at - 1] !== "\n")) continue;
    let depth = 0,
      quote = false,
      slash = false,
      end = at;
    for (; end < text.length; end++) {
      const c = text[end];
      if (quote) {
        if (slash) slash = false;
        else if (c === "\\") slash = true;
        else if (c === '"') quote = false;
      } else if (c === '"') quote = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        end++;
        break;
      }
    }
    try {
      out.push(JSON.parse(text.slice(at, end)));
      at = end - 1;
    } catch {}
  }
  return out;
}
const outputs = new Map(),
  reports = new Map();
assert.equal(e.captures.length, 26);
for (const c of e.captures) {
  assert.ok(!outputs.has(c.name));
  assert.equal(c.capture_complete, true);
  assert.ok(
    c.command.length &&
      path.isAbsolute(c.cwd) &&
      Number.isFinite(Date.parse(c.utc)) &&
      c.seconds >= 0,
  );
  const b = gunzipSync(Buffer.from(c.stdout_gzip_base64, "base64"));
  assert.equal(b.length, c.stdout_bytes);
  assert.equal(sha(b), c.stdout_sha256);
  assert.equal(b.toString().slice(-2400), c.tail);
  outputs.set(c.name, b.toString());
  reports.set(c.name, objects(b.toString()));
}
assert.deepEqual(
  e.captures.filter((c) => c.exit_code !== 0).map((c) => [c.name, c.exit_code]),
  [
    ["b22_types28_alias", 1],
    ["b22_aggregate_wiring", 1],
    ["b22_aggregate_wiring_diagnostic", 1],
  ],
);
assert.match(outputs.get("b22_types28_alias"), /ENOENT/);
assert.match(
  outputs.get("b22_aggregate_wiring_diagnostic"),
  /require is not defined in ES module scope/,
);
const report = (n, kind) => {
  const r = reports.get(n)?.find((r) => kind === undefined || r.kind === kind);
  assert.ok(r, n + " " + kind);
  return r;
};
const green = (r, n) => {
  assert.deepEqual(
    [r.planned, r.executed, r.passed, r.failed, r.skipped, r.blocked],
    [n, n, n, 0, 0, 0],
  );
  assert.deepEqual(r.cleanupErrors, []);
};
const dom = (r, cases) => {
  green(r, cases.length);
  assert.deepEqual(
    r.results.map((x) => x.id),
    cases.map((x) => x.id),
  );
  assert.ok(r.results.every((x) => x.pass));
  assert.ok(!r.buildWarnings?.length);
  if (cases !== scaleCases) assert.equal(r.productionCapable, true);
};
dom(report("b22_original_DOM89"), originalCases);
dom(report("b22_Q1Q2_DOM19"), qCases);
dom(report("b22_scale_DOM9"), scaleCases);
dom(
  report("b22_standard_model", "B production SourceView DOM gate"),
  originalCases,
);
dom(report("b22_standard_model", "B20 production Q1Q2"), qCases);
dom(
  report("b22_standard_model", "B independent scaled-host SourceView"),
  scaleCases,
);
for (const r of [
  report("b22_scale_DOM9"),
  report("b22_standard_model", "B independent scaled-host SourceView"),
]) {
  const same = r.results.filter((x) => x.id.endsWith("-same-data"));
  assert.equal(same.length, 3);
  assert.ok(same.every((x) => JSON.stringify(x.actual.scroll) === "[17,23]"));
}
for (const n of ["b22_package6", "b22_standard_package"]) {
  const r = report(n);
  green(r, 6);
  assert.equal(r.stage, "complete");
  assert.ok(r.commands.some((c) => c.command.includes("pack")));
  assert.ok(r.commands.some((c) => c.command.includes("install")));
  assert.ok(r.commands.every((c) => c.status === 0));
}
for (const r of [
  report("b22_types28_alias_retry"),
  report("b22_standard_model", "B-SourceView-types"),
]) {
  assert.deepEqual(
    [r.planned, r.executed, r.passed, r.failed, r.skipped],
    [28, 28, 28, 0, 0],
  );
  assert.deepEqual(r.positive, []);
  assert.equal(r.typedFixtureValues, 20);
  assert.equal(r.typescript, "5.9.3");
  assert.ok(
    r.inputs.some((f) => f.endsWith("/node_modules/@types/react/index.d.ts")),
  );
  assert.ok(
    !r.inputs.some((f) => /node_modules\/(?:@types\/node|electron)\//.test(f)),
  );
}
const controls = reports.get("b22_standard_controls");
assert.deepEqual(controls.find((r) => r.fixtureValues === 8).diagnostics, []);
const native = controls.filter((r) => r.controls);
assert.equal(native.length, 2);
assert.deepEqual(
  native.map((r) => r.controls.checks),
  [5, 14],
);
assert.ok(
  native.every(
    (r) =>
      r.executed === 0 &&
      r.controls.productMounted === false &&
      r.cleanupErrors.length === 0,
  ),
);
for (const count of [5, 23])
  assert.match(
    outputs.get("b22_standard_controls"),
    new RegExp("ℹ pass " + count + "\\n"),
  );
const wiring = report("b22_aggregate_wiring_final");
green(wiring, 2);
assert.equal(wiring.productExecuted, 0);
assert.deepEqual(
  wiring.results.map((r) => r.exitCode),
  [0, 23],
);
for (let i = 0; i < 2; i++) {
  const r = wiring.results[i],
    b = gunzipSync(Buffer.from(r.stdoutGzipBase64, "base64"));
  assert.equal(b.length, r.stdoutBytes);
  assert.equal(sha(b), r.stdoutSha256);
  const source = r.calls.filter(
    (x) => x.args[0] === "scripts/run-source-view-tests.mjs",
  );
  assert.deepEqual(
    source.map((x) => x.args[1]),
    i ? ["model"] : ["model", "package", "controls"],
  );
  const wrappers = r.calls.filter((x) =>
    x.args.includes("tests/source-view-wrapper.test.mjs"),
  );
  assert.equal(wrappers.length, i ? 0 : 1);
  if (!i) assert.ok(r.calls.indexOf(wrappers[0]) > r.calls.indexOf(source[2]));
  assert.ok(r.calls.some((x) => x.program === "tsc" && x.args[0] === "-b"));
  assert.ok(
    r.calls.every(
      (x) =>
        path.isAbsolute(x.cwd) &&
        x.cwd === r.calls[0].cwd &&
        x.executor === r.calls[0].executor,
    ),
  );
}
const audit = report("b22_input_audit");
assert.equal(audit.oracleFiles, 24);
assert.equal(audit.lowerObjects, 292);
assert.equal(audit.productClean, true);
assert.equal(audit.mainStaged, "");
assert.equal(audit.publicDeclarations.length, 46);
assert.equal(audit.toolPins.length, 8);
assert.equal(audit.design.bytes, 339810);
assert.equal(
  audit.design.sha256,
  "24963da4bc2ea72af2cc210c5ac74cbef8280892d04da185578110b4d94596ba",
);
assert.equal(
  audit.oldArchive.sha256,
  "d74dc71ea04b77a07bc4b1ece6e70e69b1f513c5cdc4424f10d954c522a957df",
);
const protection = report("b22_protection");
assert.equal(protection.protected, true);
assert.equal(protection.BClean, true);
assert.deepEqual(protection.counts, [1042, 707, 1024]);
assert.equal(protection.mainStaged, 0);
const props = reports.get("b22_properties281").find((r) => r.plannedCases);
assert.deepEqual(
  [props.plannedCases, props.executedCases, props.skippedCases],
  [281, 281, 0],
);
assert.equal(props.results.length, 281);
assert.ok(props.results.every((x) => x.pass));
const nav = report(
  "b22_navigation310",
  "independent-ready-baseline-real-Navigation-SDK-controlled-Transport-NOT-Core/Electron",
);
assert.deepEqual(
  [nav.planned, nav.executed, nav.passed, nav.failed, nav.skipped],
  [310, 310, 310, 0, 0],
);
assert.ok(nav.results.every((x) => x.pass));
for (const [n, count] of [
  ["b22_tree287", 287],
  ["b22_client47", 47],
  ["b22_viewmodel24", 24],
]) {
  const out = outputs.get(n);
  for (const key of ["tests", "pass"])
    assert.match(out, new RegExp("ℹ " + key + " " + count + "\\n"));
  for (const key of ["fail", "skipped"])
    assert.match(out, new RegExp("ℹ " + key + " 0\\n"));
}
let inputs = 0,
  protectedFiles = 0;
if (process.argv.includes("--inputs")) {
  const roots = {
    "B-oracle": e.paths.B,
    "B22-facility": e.paths.B,
    "public-fixed": e.paths.P,
    "coordination-reference": e.paths.M,
    "public-declaration": e.paths.P,
    "fixed-tool": e.paths.TOOLS,
    "evidence-script": e.paths.E,
  };
  for (const m of e.materials) {
    assert.equal(
      sha(fs.readFileSync(path.join(roots[m.scope], m.file))),
      m.sha256,
      m.scope + "/" + m.file,
    );
    inputs++;
  }
  const check = (root, f) => {
    const file = path.join(root, f.file),
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
  const log = fs.readFileSync(e.paths.M + "/docs/REVIEW_LOG.md");
  assert.equal(sha(log.subarray(0, initial.log.bytes)), initial.log.sha256);
}
console.log(
  JSON.stringify(
    {
      verified: true,
      fixed: e.fixed,
      bytes: raw.length,
      sha256: sha(raw),
      captures: e.captures.length,
      materials: e.materials.length,
      blocks: blocks.size,
      productDOM: 117,
      typeRules: 28,
      packageGroups: 6,
      scale: { passed: 9, failed: 0, skipped: 0 },
      isolatedWiring: { passed: 2, productExecuted: 0 },
      inputs,
      protectedFiles,
      formalClosure: "C decision",
      notNewProductExecution: true,
    },
    null,
    2,
  ),
);
