// Archive controls only. Never imports or executes a product package.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const archive = fileURLToPath(
  new URL(
    "../../../docs/m5_b_source_candidates_view_freeze.json",
    import.meta.url,
  ),
);
const verifier = fileURLToPath(
  new URL("./verify-evidence.mjs", import.meta.url),
);
const mutations = [
  [
    "candidate-baseline-false-green",
    (a) =>
      edit(
        a,
        "frozen-DOM-baseline",
        (r) => ({ ...r, executed: 56, passed: 56, blocked: 0, exitCode: 0 }),
        0,
      ),
  ],
  [
    "proposal-zero-green",
    (a) =>
      edit(a, "frozen-proposal-types", (r) => ({
        ...r,
        executed: 0,
        passed: 0,
        blocked: 0,
      })),
  ],
  [
    "browser-cleanup-fault",
    (a) =>
      edit(a, "frozen-browser-facilities", (r) => ({
        ...r,
        cleanup: { errors: ["B cleanup failure"], unhandled: [] },
      })),
  ],
  [
    "standard121-zero-execution",
    (a) =>
      edit(
        a,
        "standard-confirmation-model",
        (r) => ({ ...r, executed: 0 }),
        undefined,
        1,
      ),
  ],
  [
    "production-type-baseline-false-green",
    (a) =>
      edit(
        a,
        "frozen-production-types-baseline",
        (r) => ({
          ...r,
          executed: 30,
          passed: 30,
          blocked: 0,
          positive: [],
          exitCode: 0,
        }),
        0,
      ),
  ],
  [
    "oracle-rewritten-and-rehashed",
    (a) => {
      const m = a.materials.find(
        (m) =>
          m.id ===
          "frozen:web/tests/independent-source-candidates-view/fixture.jsx",
      );
      const b = Buffer.concat([
        gunzipSync(Buffer.from(m.gzip_base64, "base64")),
        Buffer.from("\n// B forged oracle\n"),
      ]);
      m.bytes = b.length;
      m.sha256 = sha(b);
      m.gzip_base64 = gzipSync(b).toString("base64");
      const p = a.inputs.find((p) => "frozen:" + p.path === m.id);
      p.bytes = m.bytes;
      p.sha256 = m.sha256;
    },
  ],
  [
    "strong-promise-overclaim",
    (a) => {
      a.claims.strongOriginalPromiseProven = true;
    },
  ],
  [
    "hide-first-facility-failure",
    (a) => {
      a.captures = a.captures.filter((c) => c.name !== "browser-facilities");
      a.nonzeroCaptureNames = a.nonzeroCaptureNames.filter(
        (n) => n !== "browser-facilities",
      );
    },
  ],
];
function edit(a, name, fn, code, index = 0) {
  const c = a.captures.find((c) => c.name === name),
    text = gunzipSync(Buffer.from(c.stdout_gzip_base64, "base64")).toString();
  const reports = [...text.matchAll(/^\{[\s\S]*?^\}/gm)];
  assert.ok(reports[index]);
  const m = reports[index],
    replacement = JSON.stringify(fn(JSON.parse(m[0])), null, 2);
  const b = Buffer.from(
    text.slice(0, m.index) + replacement + text.slice(m.index + m[0].length),
  );
  c.stdout_bytes = b.length;
  c.stdout_sha256 = sha(b);
  c.stdout_gzip_base64 = gzipSync(b).toString("base64");
  c.tail = b.toString().slice(-2400);
  if (code !== undefined) c.exit_code = code;
}
function validate(a) {
  assert.equal(a.kind, "B32-archive-controls");
  assert.deepEqual(a.sourceArchive, {
    bytes: 1074311,
    sha256: "3964e9311e779ce9e6a96228fdc90f5a101505af2f1363033023af717466cb3c",
  });
  assert.equal(a.records.length, 9);
  assert.deepEqual(
    a.records.map((x) => x.id),
    ["positive", ...mutations.map((x) => x[0])],
  );
  for (const [i, r] of a.records.entries()) {
    for (const k of ["stdout", "stderr"]) {
      const b = gunzipSync(Buffer.from(r[k + "_gzip_base64"], "base64"));
      assert.equal(b.length, r[k + "_bytes"]);
      assert.equal(sha(b), r[k + "_sha256"]);
    }
    assert.equal(r.status, i === 0 ? 0 : 1);
    assert.equal(r.signal, null);
    const t = gunzipSync(
      Buffer.from(r.stderr_gzip_base64, "base64"),
    ).toString();
    if (i > 0) {
      assert.match(t, /AssertionError/);
      assert.doesNotMatch(t, /MODULE_NOT_FOUND|ENOENT|SyntaxError/);
    }
  }
  for (const r of a.postSealReceipts ?? []) {
    const b = gunzipSync(Buffer.from(r.stdout_gzip_base64, "base64"));
    assert.equal(b.length, r.stdout_bytes);
    assert.equal(sha(b), r.stdout_sha256);
    assert.equal(r.capture_complete, true);
  }
  for (const m of a.materials ?? []) {
    const b = gunzipSync(Buffer.from(m.gzip_base64, "base64"));
    assert.equal(b.length, m.bytes);
    assert.equal(sha(b), m.sha256);
  }
  if (a.postSealReceipts)
    assert.deepEqual(
      a.postSealReceipts.filter((r) => r.exit_code !== 0).map((r) => r.name),
      ["verify-sealed-archive", "verify-sealed-archive-v2"],
    );
  return {
    verified: true,
    metadataOnly: true,
    currentProductExecuted: 0,
    positive: 1,
    reencodedNegative: 8,
  };
}
const check = process.argv.indexOf("--verify");
if (check >= 0)
  console.log(
    JSON.stringify(
      validate(JSON.parse(fs.readFileSync(process.argv[check + 1]))),
      null,
      2,
    ),
  );
else {
  const arg = process.argv.indexOf("--out");
  assert.ok(arg >= 0, "explicit output artifact (no overwrite)");
  const out = process.argv[arg + 1],
    temp = fs.mkdtempSync(path.join(os.tmpdir(), "hier-b32-verify-controls-")),
    original = JSON.parse(fs.readFileSync(archive)),
    records = [];
  try {
    for (const [id, mutate] of [["positive", null], ...mutations]) {
      const a = structuredClone(original);
      if (mutate) mutate(a);
      const file = path.join(temp, id + ".json");
      fs.writeFileSync(file, JSON.stringify(a));
      const command = [process.execPath, verifier, "--archive", file],
        start = performance.now();
      const r = spawnSync(command[0], command.slice(1), {
        encoding: null,
        maxBuffer: 4 * 1024 * 1024,
        timeout: 15000,
      });
      const record = {
        id,
        command,
        cwd: process.cwd(),
        status: r.status,
        signal: r.signal,
        seconds: (performance.now() - start) / 1000,
      };
      for (const k of ["stdout", "stderr"]) {
        const b = r[k] ?? Buffer.from("");
        record[k + "_bytes"] = b.length;
        record[k + "_sha256"] = sha(b);
        record[k + "_gzip_base64"] = gzipSync(b).toString("base64");
      }
      records.push(record);
    }
    const artifact = {
      kind: "B32-archive-controls",
      sourceArchive: {
        bytes: fs.statSync(archive).size,
        sha256: sha(fs.readFileSync(archive)),
      },
      records,
    };
    const summary = validate(artifact);
    fs.writeFileSync(out, JSON.stringify(artifact, null, 2) + "\n", {
      flag: "wx",
    });
    console.log(
      JSON.stringify(
        {
          ...summary,
          file: out,
          bytes: fs.statSync(out).size,
          sha256: sha(fs.readFileSync(out)),
        },
        null,
        2,
      ),
    );
  } finally {
    assert.ok(path.basename(temp).startsWith("hier-b32-verify-controls-"));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
