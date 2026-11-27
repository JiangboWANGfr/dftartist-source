// Historical B11 receipt/input/provenance verification; no product model is run here.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const archive = JSON.parse(
  fs.readFileSync(
    path.join(root, "docs/m5_b_candidates_runtime_recheck.json"),
    "utf8",
  ),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(
  archive.product.commit,
  "a35122adbb93a94943ff8e783b0d76a79729c59f",
);
assert.equal(
  archive.product.designSha256,
  "170df382cfd105d4fd279fb46b3a2d5628607ef58f52f42f5ba0d289b46c8207",
);
assert.equal(
  archive.tests.correction,
  "fa8d99549eca7031f0ff9aa19e79e230553f50e7",
);
const captures = new Map(),
  raws = new Map();
let blocks = 0,
  rawBytes = 0,
  gzipBytes = 0;
function unpack(encoded, bytes, hash) {
  const packed = Buffer.from(encoded, "base64"),
    raw = gunzipSync(packed);
  assert.equal(raw.length, bytes);
  assert.equal(sha(raw), hash);
  blocks++;
  rawBytes += raw.length;
  gzipBytes += packed.length;
  return raw;
}
for (const c of archive.captures) {
  assert.equal(c.capture_complete, true);
  assert.ok(Array.isArray(c.command) && c.command.length);
  assert.ok(c.cwd && c.utc);
  assert.equal(captures.has(c.name), false);
  captures.set(c.name, c);
  raws.set(
    c.name,
    unpack(c.stdout_gzip_base64, c.stdout_bytes, c.stdout_sha256).toString(),
  );
  assert.equal(
    c.exit_code,
    c.name === "b11_original_frozen_model" ? 1 : 0,
    c.name,
  );
}
const json = (name) => {
  assert.ok(raws.has(name), name);
  return JSON.parse(raws.get(name));
};
const original = json("b11_original_frozen_model"),
  good = json("b11_corrected_model"),
  core = json("b11_new_real_model_core");
assert.equal(original.executed, 281);
assert.equal(original.passed, 273);
assert.equal(original.failed, 8);
assert.equal(original.skipped, 0);
assert.deepEqual(
  original.results
    .filter((x) => !x.pass)
    .map((x) => x.id)
    .sort(),
  ["cancel", "clear", "reload", "replace"]
    .flatMap((x) => ["first", "next"].map((p) => "SC-late-" + x + "-" + p))
    .sort(),
);
assert.ok(
  original.results
    .filter((x) => !x.pass)
    .every((x) => x.error.message.includes("x.params.id === t.q.id")),
);
for (const [r, n] of [
  [good, 281],
  [core, 13],
]) {
  assert.equal(r.executed, n);
  assert.equal(r.passed, n);
  assert.equal(r.failed, 0);
  assert.equal(r.skipped, 0);
  assert.equal(r.results.length, n);
  assert.ok(r.results.every((x) => x.pass));
}
assert.deepEqual(
  good.results.map((x) => x.id),
  original.results.map((x) => x.id),
);
const types = json("b11_production_types");
assert.deepEqual(types.positive, []);
assert.equal(types.executedNegative, 47);
assert.equal(types.skipped, 0);
assert.equal(types.results.length, 47);
assert.ok(
  types.results.every((x) =>
    x.diagnostics.some((d) => ![2305, 2307].includes(d.code)),
  ),
);
assert.match(
  raws.get("b11_cancel_and_original_facilities"),
  /(?:ℹ|#) tests 10/,
);
assert.match(
  raws.get("b11_cancel_and_original_facilities"),
  /(?:ℹ|#) pass 10/,
);
assert.match(raws.get("b11_cancel_and_original_facilities"), /(?:ℹ|#) fail 0/);
function reports(raw) {
  const rows = [];
  for (let at = 0; at < raw.length; at++) {
    if (raw[at] !== "{" || (at !== 0 && raw[at - 1] !== "\n")) continue;
    let depth = 0,
      quoted = false,
      escape = false,
      end = at;
    for (; end < raw.length; end++) {
      const c = raw[end];
      if (quoted) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === '"') quoted = false;
      } else {
        if (c === '"') quoted = true;
        else if (c === "{") depth++;
        else if (c === "}" && --depth === 0) {
          end++;
          break;
        }
      }
    }
    try {
      rows.push(JSON.parse(raw.slice(at, end)));
      at = end - 1;
    } catch {}
  }
  return rows;
}
const totals = {};
for (const [name, expected] of [
  ["b11_standard_full", 1922],
  ["b11_standard_m4", 294],
]) {
  const raw = raws.get(name),
    matches = [
      ...raw.matchAll(/(?:ℹ|#) (tests|pass|fail|skipped|cancelled) ([0-9]+)/g),
    ];
  for (const m of matches.filter((m) =>
    ["fail", "skipped", "cancelled"].includes(m[1]),
  ))
    assert.equal(Number(m[2]), 0);
  const semantic = reports(raw).filter(
    (r) =>
      Array.isArray(r.results) &&
      r.results.length > 0 &&
      r.results.every((x) => typeof x.pass === "boolean"),
  );
  assert.ok(semantic.every((r) => r.results.every((x) => x.pass)));
  for (const r of semantic) if ("skipped" in r) assert.equal(r.skipped, 0);
  const count =
    matches
      .filter((m) => m[1] === "tests")
      .reduce((n, m) => n + Number(m[2]), 0) +
    semantic.reduce((n, r) => n + r.results.length, 0);
  assert.equal(count, expected);
  totals[name] = count;
  if (name === "b11_standard_full")
    assert.deepEqual(
      semantic.map((r) => r.results.length),
      [26, 281, 5, 99, 25, 12, 40, 6, 306, 4, 14, 281, 13],
    );
}
const schema = reports(raws.get("b11_schema_gate")).find(
  (r) => r.checks === 655,
);
assert.equal(schema.passed, 655);
assert.equal(schema.failed, 0);
assert.equal(schema.skipped, 0);
assert.equal(schema.parameterNormalization.checks, 27);
assert.deepEqual(schema.parameterNormalization.failed, []);
const api = json("b11_public_api_compatibility");
assert.equal(api.oldExportCount, 42);
assert.equal(api.newExportCount, 50);
assert.deepEqual(api.removed, []);
const provenance = json("b11_full_import_provenance");
assert.equal(provenance.frozenFiles, 19);
assert.equal(provenance.contractBodyPreserved, true);
const protection = json("b11_provenance_and_resources");
assert.deepEqual(
  protection.protected.map((r) => r.protectedFiles),
  [898, 608, 880],
);
assert.equal(protection.mainDeclarationsPreserved, 41);
assert.equal(protection.oldDeclarationsUnchanged, 35);
assert.deepEqual(protection.ownedCoreProcesses, []);
assert.equal(protection.native.bytes, 9329368);
assert.equal(
  protection.native.sha256,
  "971dedb67cfaa3181a1549db8b4c81e19a109867550523e579d25a469ffe7df4",
);
let inputs = 0;
for (const m of archive.materials) {
  const b = unpack(m.gzip_base64, m.bytes, m.sha256);
  if (process.argv.includes("--inputs")) {
    const actual = m.git
      ? execFileSync("git", ["show", m.git + ":" + m.path], { cwd: root })
      : fs.readFileSync(path.join(root, m.path));
    assert.equal(sha(actual), m.sha256, m.path);
    inputs++;
  }
}
let productFiles = 0;
if (process.argv.includes("--product")) {
  assert.ok(process.env.HIER_B_PRODUCT_ROOT);
  const product = fs.realpathSync(process.env.HIER_B_PRODUCT_ROOT),
    init = json("b11_initial_protection");
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: product,
      encoding: "utf8",
    }).trim(),
    archive.product.commit,
  );
  for (const f of init.roots[2].files) {
    assert.equal(
      sha(fs.readFileSync(path.join(product, f.file))),
      f.file === archive.overlay.file
        ? archive.overlay.correctedSha256
        : f.sha256,
      f.file,
    );
    productFiles++;
  }
  assert.equal(
    execFileSync("git", ["status", "--porcelain"], {
      cwd: product,
      encoding: "utf8",
    }),
    " M " + archive.overlay.file + "\n",
  );
  for (const p of archive.productPins)
    assert.equal(
      sha(fs.readFileSync(path.join(product, p.path))),
      p.sha256,
      p.path,
    );
}
assert.equal(
  archive.productPins.filter((x) => x.path.endsWith(".d.ts")).length,
  41,
);
console.log(
  JSON.stringify(
    {
      kind: "archive/input/provenance-NOT-product-semantics",
      captures: captures.size,
      materials: archive.materials.length,
      productPins: archive.productPins.length,
      blocks,
      rawBytes,
      gzipBytes,
      inputsVerified: inputs,
      productFilesVerified: productFiles,
      originalRedPreserved: true,
      totals,
      newModelCasesExecutedByVerifier: 0,
    },
    null,
    2,
  ),
);
