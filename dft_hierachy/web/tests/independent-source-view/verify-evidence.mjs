// Archive validation is not another product execution.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { cases, ambiguities } from "./cases.mjs";
const B = path.resolve(import.meta.dirname, "../../..");
const archive = path.join(B, "docs/m5_b_source_view_contract_freeze.json");
const bytes = fs.readFileSync(archive),
  e = JSON.parse(bytes);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const git = (root, args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const fixed = "df14ae6b931bf1f9f27345a5df86723bb8a0546d";
const freeze = "64f570d9bb2306a2350b6fcf607d8c65a51458e6";
assert.equal(e.format, "hier-independent-evidence-v1");
assert.equal(e.role, "B");
assert.equal(e.cycle, 19);
assert.equal(e.fixedProduct, fixed);
assert.equal(e.freeze, freeze);
assert.equal(e.initialB, "4ad1720db86ee7c8320fcd968bc477a60f95d224");
assert.equal(e.oracle.strictBlind, false);
assert.equal(e.oracle.independentCases, cases.length);
assert.equal(cases.length, 89);
assert.equal(e.oracle.independentTypeNegatives, 28);
assert.equal(e.oracle.typedFixtureValues, 20);
assert.equal(e.oracle.packageGroups, 6);
assert.deepEqual(
  e.oracle.ambiguities.map((q) => q.id),
  ambiguities.map((q) => q.id),
);
assert.ok(e.oracle.ambiguities.every((q) => q.status === "open"));
for (const field of [
  "completeContractFrozen",
  "productionPassed",
  "implementationPrerequisitesSatisfied",
])
  assert.equal(e.summary[field], false);
const decoded = new Map();
for (const [hash, b] of Object.entries(e.blocks)) {
  const data = gunzipSync(Buffer.from(b.gzip_base64, "base64"));
  assert.equal(data.length, b.bytes);
  assert.equal(sha(data), hash);
  decoded.set(hash, data);
}
assert.equal(decoded.size, 63);
assert.equal(e.initial.sha256, e.initial.block);
const initialBytes = decoded.get(e.initial.block);
assert.equal(initialBytes.length, e.initial.bytes);
assert.equal(
  sha(initialBytes),
  "2df26203f6d124adc5b480943c6f1164644d05b5e0f69686139d3a26283d4fa2",
);
const initial = JSON.parse(initialBytes);
assert.deepEqual(
  initial.roots.map((r) => r.files.length),
  [999, 673, 981],
);
assert.equal(initial.mainDeclarations.length, 45);
assert.equal(initial.toolPins.length, 6);
assert.equal(initial.log.bytes, 1995140);
assert.equal(
  initial.log.sha256,
  "ba4ffe0a1ebf573202bb6823074722fdd06dec258d8f876832edc4c44b167490",
);
const unique = new Set();
for (const m of e.materials) {
  assert.ok(!path.isAbsolute(m.file) && !m.file.split("/").includes(".."));
  assert.equal(m.block, m.sha256);
  const data = decoded.get(m.block);
  assert.equal(data.length, m.bytes);
  assert.equal(sha(data), m.sha256);
  const key = m.scope + ":" + m.file;
  assert.equal(unique.has(key), false);
  unique.add(key);
}
const frozen = e.materials.filter((m) => m.scope === "B-frozen");
assert.equal(frozen.length, 11);
assert.ok(frozen.every((m) => m.commit === freeze));
assert.equal(
  e.materials.filter((m) => m.scope === "public-contract").length,
  6,
);
const declarations = e.materials.filter(
  (m) => m.scope === "public-declaration",
);
assert.equal(declarations.length, 45);
const design = e.materials.find((m) => m.file === "docs/DESIGN.md");
assert.equal(design.bytes, 338037);
assert.equal(
  design.sha256,
  "cd1b5d2822231bf7f73a126d915e9880656d417dff61e31136f0d0ad40af0362",
);
const reports = new Map(),
  names = new Set();
assert.equal(e.captures.length, 32);
for (const c of e.captures) {
  assert.equal(names.has(c.name), false);
  names.add(c.name);
  assert.ok(
    Array.isArray(c.command) && c.command.length > 0 && path.isAbsolute(c.cwd),
  );
  assert.ok(
    Number.isFinite(c.seconds) &&
      c.seconds >= 0 &&
      Number.isFinite(Date.parse(c.utc)),
  );
  assert.equal(c.capture_complete, true);
  const raw = gunzipSync(Buffer.from(c.stdout_gzip_base64, "base64"));
  assert.equal(raw.length, c.stdout_bytes);
  assert.equal(sha(raw), c.stdout_sha256);
  assert.equal(raw.toString("utf8").slice(-2400), c.tail);
  try {
    reports.set(c.name, JSON.parse(raw));
  } catch {
    reports.set(c.name, raw.toString("utf8"));
  }
}
const reds = [
  "b19_frozen_browser",
  "b19_frozen_package",
  "b19_frozen_production_types",
];
assert.deepEqual(
  e.captures
    .filter((c) => c.exit_code !== 0)
    .map((c) => c.name)
    .sort(),
  reds,
);
assert.deepEqual([...e.summary.formalRed].sort(), reds);
assert.ok(
  e.captures
    .filter((c) => reds.includes(c.name))
    .every((c) => c.exit_code === 1 && c.phase === "frozen-baseline"),
);
const freezeCapture = e.captures.find((c) => c.name === "b19_freeze_commit");
for (const c of e.captures.filter((c) => c.phase === "frozen-baseline"))
  assert.ok(
    Date.parse(c.utc) - c.seconds * 1000 > Date.parse(freezeCapture.utc),
    "frozen before baseline",
  );
const report = (n) => {
  assert.ok(reports.has(n));
  return reports.get(n);
};
const proposal = report("b19_frozen_proposal");
assert.equal(proposal.mode, "proposal");
assert.equal(proposal.stage, "semantic-types");
assert.deepEqual(proposal.positive, []);
assert.equal(proposal.typedFixtureValues, 20);
assert.deepEqual(
  [
    proposal.planned,
    proposal.executed,
    proposal.passed,
    proposal.failed,
    proposal.skipped,
  ],
  [28, 28, 28, 0, 0],
);
const prodTypes = report("b19_frozen_production_types");
assert.equal(prodTypes.mode, "production");
assert.equal(prodTypes.stage, "positive-public-capability");
assert.deepEqual(
  [
    prodTypes.planned,
    prodTypes.executed,
    prodTypes.passed,
    prodTypes.failed,
    prodTypes.skipped,
  ],
  [28, 0, 0, 0, 0],
);
assert.ok(
  prodTypes.positive.some(
    (d) => d.code === 2305 && d.message.includes("'SourceView'"),
  ),
);
assert.ok(
  prodTypes.positive.some(
    (d) => d.code === 2305 && d.message.includes("'SourceViewProps'"),
  ),
);
assert.ok(prodTypes.positive.every((d) => [2305, 2578].includes(d.code)));
for (const r of [proposal, prodTypes]) {
  assert.equal(r.typescript, "5.9.3");
  assert.ok(
    r.inputs.includes(
      path.join(e.paths.tools, "node_modules/@types/react/index.d.ts"),
    ),
  );
  assert.ok(
    r.inputs.some((f) =>
      f.endsWith("/viewmodel/dist/source-document-types.d.ts"),
    ),
  );
  assert.equal(
    r.inputs.some((f) => /node_modules\/(?:@types\/node|electron)\//.test(f)),
    false,
  );
}
const dom = report("b19_frozen_browser");
assert.equal(dom.stage, "production-export-capability");
assert.equal(dom.productionCapable, false);
assert.deepEqual(
  [dom.planned, dom.executed, dom.passed, dom.failed, dom.skipped, dom.blocked],
  [89, 0, 0, 0, 0, 89],
);
assert.deepEqual(dom.results, []);
assert.equal(dom.capabilityFailures, 1);
assert.equal(dom.facilityFailure, false);
assert.deepEqual(dom.cleanupErrors, []);
const pack = report("b19_frozen_package");
assert.equal(pack.stage, "public-package-capability");
assert.match(pack.error, /SourceView React peer is not implemented/);
assert.deepEqual(
  [
    pack.planned,
    pack.executed,
    pack.passed,
    pack.failed,
    pack.skipped,
    pack.blocked,
  ],
  [6, 0, 0, 0, 0, 6],
);
assert.equal(pack.capabilityFailures, 1);
assert.equal(pack.facilityFailure, false);
assert.deepEqual(pack.cleanupErrors, []);
assert.equal(pack.commands.length, 2);
assert.ok(pack.commands.every((c) => c.status === 0));
assert.equal(pack.commands[0].command[1], "pack");
assert.equal(pack.commands[1].command[0], "/usr/bin/tar");
assert.equal(pack.packedViews.manifest.name, "@hier/views");
assert.equal(pack.packedViews.manifest.peerDependencies, undefined);
const controls = report("b19_frozen_browser_control");
assert.equal(controls.kind, "B fixture-controls-NOT-SourceView");
assert.equal(controls.executed, 0);
assert.equal(controls.controls.productMounted, false);
assert.equal(controls.fixtureChecks, 5);
assert.deepEqual(
  [controls.controls.mounts, controls.controls.cleanups],
  [2, 2],
);
assert.deepEqual(controls.cleanupErrors, []);
assert.match(report("b19_frozen_inventory"), /pass 3/);
assert.match(report("b19_frozen_inventory"), /skipped 0/);
assert.deepEqual(report("b19_frozen_list").cases, cases);
assert.deepEqual(report("b19_frozen_list").ambiguities, ambiguities);
const checked = {
  inputs: 0,
  productFiles: 0,
  protectedFiles: 0,
  declarations: 0,
  toolPins: 0,
};
function current(root, m, mtime = false) {
  const data = fs.readFileSync(path.join(root, m.file));
  assert.equal(data.length, m.bytes, root + "/" + m.file);
  assert.equal(sha(data), m.sha256, root + "/" + m.file);
  if (mtime)
    assert.equal(
      String(fs.statSync(path.join(root, m.file), { bigint: true }).mtimeNs),
      m.mtimeNs,
    );
}
if (process.argv.includes("--inputs")) {
  const paths = git(B, [
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "-r",
    freeze,
  ])
    .split("\n")
    .sort();
  assert.deepEqual(paths, frozen.map((m) => m.file).sort());
  for (const m of frozen) {
    current(B, m);
    const data = execFileSync("git", ["show", freeze + ":" + m.file], {
      cwd: B,
    });
    assert.equal(sha(data), m.sha256);
    checked.inputs++;
  }
}
if (process.argv.includes("--product")) {
  const P = process.env.HIER_B_PRODUCT_ROOT;
  assert.ok(P, "explicit product root");
  assert.equal(git(P, ["rev-parse", "HEAD"]), fixed);
  assert.equal(git(P, ["status", "--porcelain"]), "");
  for (const m of initial.roots[2].files) {
    current(P, m);
    checked.productFiles++;
  }
  for (const m of e.materials.filter((m) => m.scope !== "B-frozen")) {
    current(P, m);
    if (m.scope === "public-declaration") checked.declarations++;
  }
}
if (process.argv.includes("--protect")) {
  for (const r of initial.roots)
    for (const m of r.files) {
      current(r.root, m, true);
      checked.protectedFiles++;
    }
  for (const m of initial.mainDeclarations) {
    current(e.paths.main, m, true);
    checked.declarations++;
  }
  for (const m of initial.toolPins) {
    current(e.paths.tools, m, true);
    checked.toolPins++;
  }
  const log = fs.readFileSync(path.join(e.paths.main, "docs/REVIEW_LOG.md"));
  assert.equal(sha(log.subarray(0, initial.log.bytes)), initial.log.sha256);
  assert.equal(git(e.paths.main, ["rev-parse", "HEAD"]), fixed);
  assert.equal(git(e.paths.main, ["diff", "--cached", "--name-only"]), "");
  assert.equal(fs.existsSync(pack.temp), false, "owned package temp removed");
}
console.log(
  JSON.stringify(
    {
      verified: true,
      archiveBytes: bytes.length,
      archiveSHA256: sha(bytes),
      freeze,
      fixed,
      captures: e.captures.length,
      nonzero: reds,
      materials: e.materials.length,
      blocks: decoded.size,
      plannedDOM: 89,
      executedProductDOM: 0,
      proposalNegatives: 28,
      typedFixtureValues: 20,
      openQuestions: 2,
      checked,
      notProductExecution: true,
    },
    null,
    2,
  ),
);
