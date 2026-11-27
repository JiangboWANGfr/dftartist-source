// Portable archive validation, not another product run.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { cases as originalCases } from "../cases.mjs";
import { cases as QCases } from "../q1q2/cases.mjs";
import { cases as scaleCases } from "../scale/cases.mjs";
const B = path.resolve(import.meta.dirname, "../../../.."),
  raw = fs.readFileSync(B + "/docs/m5_b_source_view_runtime_recheck.json"),
  e = JSON.parse(raw),
  sha = (b) => createHash("sha256").update(b).digest("hex"),
  git = (r, a) => execFileSync("git", a, { cwd: r, encoding: "utf8" }).trim();
assert.equal(e.format, "hier-b21-source-view-runtime-v1");
assert.equal(e.role, "B");
assert.equal(e.cycle, 21);
assert.equal(e.fixed, "d4230224005f116272369c2e501a4e468151e9bc");
assert.equal(e.adapted, "70f91e5b8e8e968da0b34d534c3461b33f139d52");
assert.equal(e.oracle.BControlledSourceViewAcceptance, false);
assert.equal(e.oracle.originalFrozenAcceptance, true);
assert.equal(e.oracle.knownProductIssue.id, "C-89");
assert.match(e.oracle.C88.status, /^closed by C21/);
assert.equal(e.scaleFreeze, "90ff51d3203a5511b70b8228dd54af7669ffa2a7");
assert.equal(e.oracle.M5Complete, false);
const blocks = new Map();
for (const [h, b] of Object.entries(e.blocks)) {
  const v = gunzipSync(Buffer.from(b.gzip_base64, "base64"));
  assert.equal(v.length, b.bytes);
  assert.equal(sha(v), h);
  blocks.set(h, v);
}
assert.equal(blocks.size, 87);
assert.equal(e.materials.length, 86);
const initialBytes = blocks.get(e.initial.block);
assert.equal(initialBytes.length, e.initial.bytes);
assert.equal(sha(initialBytes), e.initial.sha256);
assert.equal(
  e.initial.sha256,
  "b4612564752e20c79bcb406c96de6ff54790e8cb1b583654c0c8c8edb5f37a61",
);
const initial = JSON.parse(initialBytes);
assert.deepEqual(
  initial.roots.map((r) => r.files.length),
  [1031, 698, 1013],
);
assert.equal(initial.mainDeclarations.length, 46);
assert.equal(initial.toolPins.length, 2);
const keys = new Set();
for (const m of e.materials) {
  assert.ok(!path.isAbsolute(m.file) && !m.file.split("/").includes(".."));
  assert.equal(keys.has(m.scope + ":" + m.file), false);
  keys.add(m.scope + ":" + m.file);
  assert.equal(m.block, m.sha256);
  assert.equal(blocks.get(m.block).length, m.bytes);
}
const original = e.materials.filter((m) => m.scope === "B-original-frozen"),
  adapted = e.materials.filter((m) => m.scope === "B-maintenance"),
  declarations = e.materials.filter((m) => m.scope === "public-declaration");
assert.deepEqual(
  [original.length, adapted.length, declarations.length],
  [19, 3, 46],
);
const design = e.materials.find((m) => m.file === "docs/DESIGN.md");
assert.equal(design.bytes, 339683);
assert.equal(
  design.sha256,
  "2edd3f5bcf120da0ff6e0c13de04eb27c1401d650e652608f1b627b353c54069",
);
const mtext = (scope, file) => {
  const m = e.materials.find((m) => m.scope === scope && m.file === file);
  assert.ok(m, scope + "/" + file);
  return blocks.get(m.block).toString();
};
const typeFile = "web/tests/independent-source-view/verify-types.mjs";
const old = mtext("B-original-frozen", typeFile),
  changed = old
    .replace(
      'const react = path.join(tools, "node_modules/@types/react/index.d.ts");',
      'const react = fs.realpathSync(\n  path.join(tools, "node_modules/@types/react/index.d.ts"),\n);',
    )
    .replace(
      "assert.ok(pos.inputs.includes(react));",
      "assert.ok(\n  pos.inputs.some((f) => fs.existsSync(f) && fs.realpathSync(f) === react),\n);",
    );
assert.equal(changed, mtext("B-maintenance", typeFile));
assert.equal(
  sha(Buffer.from(changed)),
  "8bb8069f82d69f4b09de436aa6ef22fd86a3e2929160f54c2062c0ae1151f4f8",
);
const allow = JSON.parse(mtext("B-evidence-script", "authorized-b-edits.json"));
assert.deepEqual(Object.keys(allow), [typeFile]);
assert.equal(allow[typeFile].before.sha256, sha(Buffer.from(old)));
assert.equal(allow[typeFile].after.sha256, sha(Buffer.from(changed)));
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
  reports = new Map(),
  names = new Set();
assert.equal(e.captures.length, 40);
for (const c of e.captures) {
  assert.equal(names.has(c.name), false);
  names.add(c.name);
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
    ["b21_c88_original_alias", 1],
    ["b21_scale_product", 1],
  ],
);
assert.match(
  outputs.get("b21_c88_original_alias"),
  /pos.inputs.includes\(react\)/,
);
const report = (name, kind) => {
  const r = reports
    .get(name)
    ?.find((r) => kind === undefined || r.kind === kind);
  assert.ok(r, name + " " + kind);
  return r;
};
const dom = (r, cases) => {
  assert.deepEqual(
    [r.planned, r.executed, r.passed, r.failed, r.skipped, r.blocked],
    [cases.length, cases.length, cases.length, 0, 0, 0],
  );
  assert.equal(r.productionCapable, true);
  assert.deepEqual(r.cleanupErrors, []);
  assert.deepEqual(
    r.results.map((r) => r.id),
    cases.map((c) => c.id),
  );
  assert.ok(r.results.every((r) => r.pass));
};
dom(report("b21_original_DOM89"), originalCases);
dom(report("b21_Q1Q2_DOM19"), QCases);
dom(
  report("b21_standard_model", "B production SourceView DOM gate"),
  originalCases,
);
dom(report("b21_standard_model", "B20 production Q1Q2"), QCases);
for (const n of ["b21_package6", "b21_standard_package"]) {
  const r = report(n);
  assert.deepEqual(
    [r.planned, r.executed, r.passed, r.failed, r.skipped, r.blocked],
    [6, 6, 6, 0, 0, 0],
  );
  assert.equal(r.stage, "complete");
  assert.deepEqual(r.cleanupErrors, []);
  assert.ok(r.commands.some((c) => c.command.includes("pack")));
  assert.ok(r.commands.some((c) => c.command.includes("install")));
  assert.ok(r.commands.every((c) => c.status === 0));
}
const types = (r) => {
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
  assert.equal(
    r.inputs.some((f) => /node_modules\/(?:@types\/node|electron)\//.test(f)),
    false,
  );
};
types(report("b21_c88_original_real"));
types(report("b21_standard_model", "B-SourceView-types"));
const c88 = report("b21_c88_four_paths");
assert.equal(c88.cases, 4);
assert.equal(c88.DOMExecuted, 0);
assert.equal(c88.uniqueTypeNegatives, 28);
assert.equal(c88.originalSHA256, sha(Buffer.from(old)));
assert.equal(c88.adaptedSHA256, sha(Buffer.from(changed)));
assert.deepEqual(
  c88.results.map((r) => [r.mode, r.spelling]),
  [
    ["proposal", "real"],
    ["proposal", "alias"],
    ["production", "real"],
    ["production", "alias"],
  ],
);
for (const r of c88.results) {
  assert.equal(r.status, 0);
  const b = gunzipSync(Buffer.from(r.outputGzipBase64, "base64"));
  assert.equal(b.length, r.outputBytes);
  assert.equal(sha(b), r.outputSHA256);
  types(JSON.parse(b));
}
assert.equal(c88.sameDevice, true);
assert.equal(c88.sameInode, true);
assert.equal(e.toolPathIdentity.sameDevice, true);
assert.equal(e.toolPathIdentity.sameInode, true);
const controls = reports.get("b21_standard_controls");
const scale = report("b21_scale_product");
assert.deepEqual(
  [
    scale.planned,
    scale.executed,
    scale.passed,
    scale.failed,
    scale.skipped,
    scale.blocked,
  ],
  [9, 9, 5, 4, 0, 0],
);
assert.deepEqual(
  scale.results.map((r) => r.id),
  scaleCases.map((c) => c.id),
);
assert.deepEqual(
  scale.results.filter((r) => !r.pass).map((r) => r.id),
  e.oracle.scale.failures,
);
assert.ok(
  scale.results
    .filter((r) => !r.pass)
    .every((r) =>
      r.errors[0].includes("exact start outside actual scaled viewport"),
    ),
);
assert.deepEqual(scale.cleanupErrors, []);
const scaleCommit = e.captures.find((c) => c.name === "b21_scale_commit"),
  scaleRun = e.captures.find((c) => c.name === "b21_scale_product");
assert.ok(
  Date.parse(scaleRun.utc) - scaleRun.seconds * 1000 >
    Date.parse(scaleCommit.utc),
);
const scaleMaterials = e.materials.filter((m) => m.scope === "B-scale-frozen");
assert.equal(scaleMaterials.length, 4);
assert.ok(scaleMaterials.every((m) => m.commit === e.scaleFreeze));
assert.equal(controls.find((r) => r.fixtureValues === 8).diagnostics.length, 0);
const native = controls.filter((r) => r.controls);
assert.equal(native.length, 2);
assert.equal(native[0].controls.productMounted, false);
assert.equal(native[0].fixtureChecks, 5);
assert.equal(native[1].controls.productMounted, false);
assert.equal(native[1].controls.checks, 14);
for (const r of native) {
  assert.equal(r.executed, 0);
  assert.deepEqual(r.cleanupErrors, []);
}
const props = reports
  .get("b21_regression_properties")
  .find((r) => r.plannedCases);
assert.equal(props.plannedCases, 281);
assert.equal(props.executedCases, 281);
assert.equal(props.skippedCases, 0);
assert.equal(props.results.length, 281);
assert.ok(props.results.every((r) => r.pass));
const nav = report(
  "b21_regression_navigation",
  "independent-ready-baseline-real-Navigation-SDK-controlled-Transport-NOT-Core/Electron",
);
assert.deepEqual(
  [nav.planned, nav.executed, nav.passed, nav.failed, nav.skipped],
  [310, 310, 310, 0, 0],
);
assert.ok(nav.results.every((r) => r.pass));
for (const [n, count] of [
  ["b21_regression_tree", 287],
  ["b21_regression_client", 47],
  ["b21_viewmodel_regression", 24],
]) {
  const out = outputs.get(n);
  assert.match(out, new RegExp("ℹ tests " + count + "\\n"));
  assert.match(out, new RegExp("ℹ pass " + count + "\\n"));
  assert.match(out, /ℹ fail 0\n/);
  assert.match(out, /ℹ skipped 0\n/);
}
const scope = report("b21_scope_audit");
assert.equal(scope.lowerProduction.files, 292);
assert.equal(scope.lowerProduction.unchanged, true);
assert.equal(scope.historicalInputs.length, 25);
assert.equal(scope.freshDeclarations, 46);
for (const m of original) {
  const p = scope.historicalInputs.find((p) => p.file === m.file);
  assert.equal(p.sha256, m.sha256);
}
function current(root, m, mtime = false) {
  const b = fs.readFileSync(path.join(root, m.file));
  assert.equal(b.length, m.bytes);
  assert.equal(sha(b), m.sha256, root + "/" + m.file);
  if (mtime)
    assert.equal(
      String(fs.statSync(path.join(root, m.file), { bigint: true }).mtimeNs),
      m.mtimeNs,
    );
}
const checked = {
  original: 0,
  maintenance: 0,
  scale: 0,
  product: 0,
  protected: 0,
  authorizedExistingB: 0,
  declarations: 0,
  tools: 0,
};
if (process.argv.includes("--inputs")) {
  for (const m of scaleMaterials) {
    current(B, m);
    assert.equal(
      sha(
        execFileSync("git", ["show", e.scaleFreeze + ":" + m.file], { cwd: B }),
      ),
      m.sha256,
    );
    checked.scale++;
  }
  for (const m of original) {
    current(
      B,
      m.file === typeFile
        ? {
            ...m,
            bytes: Buffer.byteLength(changed),
            sha256: sha(Buffer.from(changed)),
          }
        : m,
    );
    checked.original++;
  }
  for (const m of adapted) {
    current(B, m);
    assert.equal(
      sha(execFileSync("git", ["show", e.adapted + ":" + m.file], { cwd: B })),
      m.sha256,
    );
    checked.maintenance++;
  }
}
if (process.argv.includes("--product")) {
  const P = process.env.HIER_B_PRODUCT_ROOT;
  assert.ok(P);
  assert.equal(git(P, ["rev-parse", "HEAD"]), e.fixed);
  assert.equal(git(P, ["status", "--porcelain"]), "");
  for (const m of initial.roots[2].files) {
    current(P, m);
    checked.product++;
  }
  for (const m of e.materials.filter((m) =>
    [
      "B-original-frozen",
      "public-contract-or-asset",
      "public-declaration",
    ].includes(m.scope),
  )) {
    current(P, m);
    if (m.scope === "public-declaration") checked.declarations++;
  }
  for (const m of scope.toolPins) {
    current(P + "/web", m);
    checked.tools++;
  }
}
if (process.argv.includes("--protect")) {
  for (const r of initial.roots)
    for (const m of r.files) {
      const replacement = r.root === e.paths.B ? allow[m.file] : null;
      current(r.root, replacement?.after ?? m, true);
      checked.protected++;
      if (replacement) checked.authorizedExistingB++;
    }
  for (const m of initial.mainDeclarations) {
    current(e.paths.main, m, true);
    checked.declarations++;
  }
  for (const m of initial.toolPins) current(e.paths.tools, m, true);
  const log = fs.readFileSync(e.paths.main + "/docs/REVIEW_LOG.md");
  assert.equal(sha(log.subarray(0, initial.log.bytes)), initial.log.sha256);
  assert.equal(git(e.paths.main, ["rev-parse", "HEAD"]), e.fixed);
  assert.equal(git(e.paths.main, ["diff", "--cached", "--name-only"]), "");
}
console.log(
  JSON.stringify(
    {
      verified: true,
      bytes: raw.length,
      sha256: sha(raw),
      fixed: e.fixed,
      adapted: e.adapted,
      captures: e.captures.length,
      materials: e.materials.length,
      blocks: blocks.size,
      nonzero: ["b21_c88_original_alias", "b21_scale_product"],
      scale: { planned: 9, passed: 5, failed: 4, skipped: 0, issue: "C-89" },
      productDOM: [89, 19],
      uniqueTypeNegatives: 28,
      packageGroups: 6,
      C88: e.oracle.C88.status,
      checked,
      notProductExecution: true,
    },
    null,
    2,
  ),
);
