// Correctly re-encoded metadata falsification controls; no product execution.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  archive = fileURLToPath(
    new URL(
      "../../../../docs/m5_b_source_candidates_view_pagination.json",
      import.meta.url,
    ),
  ),
  verifier = fileURLToPath(new URL("./verify-evidence.mjs", import.meta.url));
function edit(a, name, fn, code) {
  const r = a.captures.find((c) => c.name === name),
    b = Buffer.from(
      fn(gunzipSync(Buffer.from(r.stdout_gzip_base64, "base64")).toString()),
    );
  r.stdout_bytes = b.length;
  r.stdout_sha256 = sha(b);
  r.stdout_gzip_base64 = gzipSync(b).toString("base64");
  r.tail = b.toString().slice(-2400);
  if (code !== undefined) r.exit_code = code;
}
const jsonEdit = (a, name, fn, code) =>
  edit(a, name, (t) => JSON.stringify(fn(JSON.parse(t)), null, 2) + "\n", code);
const mutations = [
  [
    "DOM-baseline-false-green",
    (a) =>
      jsonEdit(
        a,
        "frozen-C95-DOM-baseline",
        (r) => ({ ...r, executed: 8, passed: 8, blocked: 0, exitCode: 0 }),
        0,
      ),
  ],
  [
    "browser-facilities-zero-green",
    (a) =>
      jsonEdit(a, "frozen-browser-premises-and-native", (r) => ({
        ...r,
        executed: 0,
        passed: 0,
        blocked: 0,
      })),
  ],
  [
    "node-facilities-zero-green",
    (a) =>
      edit(a, "frozen-call-observer-facilities", (t) =>
        t.replace("ℹ tests 11", "ℹ tests 0").replace("ℹ pass 11", "ℹ pass 0"),
      ),
  ],
  [
    "browser-cleanup-error",
    (a) =>
      jsonEdit(a, "frozen-browser-premises-and-native", (r) => ({
        ...r,
        cleanup: { errors: ["B release failed"], unhandled: [] },
      })),
  ],
  [
    "observer-source-rewritten-and-rehashed",
    (a) => {
      const m = a.materials.find((m) =>
        m.id.endsWith("/pagination/public-calls.mjs"),
      );
      const b = Buffer.concat([
        gunzipSync(Buffer.from(m.gzip_base64, "base64")),
        Buffer.from("\n// forged observer\n"),
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
    "hide-initial-red",
    (a) => {
      a.captures = a.captures.filter((c) => c.name !== "initial-C95-DOM");
      a.nonzeroCaptureNames = a.nonzeroCaptureNames.filter(
        (n) => n !== "initial-C95-DOM",
      );
    },
  ],
  [
    "strong-Promise-overclaim",
    (a) => {
      a.claims.strongOriginalPromiseProven = true;
    },
  ],
  [
    "whole-M5-overclaim",
    (a) => {
      a.claims.M5Complete = true;
    },
  ],
];
function validate(a) {
  assert.equal(a.kind, "B33-archive-controls");
  assert.deepEqual(a.sourceArchive, {
    bytes: 1006276,
    sha256: "59c9b99032ad5d74ba25931b7c9b96389c619f7bafde9f6396c3a5d216305a67",
  });
  assert.deepEqual(
    a.records.map((r) => r.id),
    ["positive", ...mutations.map((m) => m[0])],
  );
  for (const [i, r] of a.records.entries()) {
    for (const k of ["stdout", "stderr"]) {
      const b = gunzipSync(Buffer.from(r[k + "_gzip_base64"], "base64"));
      assert.equal(b.length, r[k + "_bytes"]);
      assert.equal(sha(b), r[k + "_sha256"]);
    }
    assert.equal(r.status, i === 0 ? 0 : 1);
    assert.equal(r.signal, null);
    if (i > 0) {
      const error = gunzipSync(
        Buffer.from(r.stderr_gzip_base64, "base64"),
      ).toString();
      assert.match(error, /AssertionError/);
      assert.doesNotMatch(error, /MODULE_NOT_FOUND|ENOENT|SyntaxError/);
    }
  }
  for (const r of a.postSealReceipts ?? []) {
    const b = gunzipSync(Buffer.from(r.stdout_gzip_base64, "base64"));
    assert.equal(b.length, r.stdout_bytes);
    assert.equal(sha(b), r.stdout_sha256);
    assert.equal(r.capture_complete, true);
    assert.equal(r.exit_code, 0);
  }
  for (const m of a.materials ?? []) {
    const b = gunzipSync(Buffer.from(m.gzip_base64, "base64"));
    assert.equal(b.length, m.bytes);
    assert.equal(sha(b), m.sha256);
  }
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
  const i = process.argv.indexOf("--out");
  assert.ok(i >= 0, "explicit output artifact");
  const output = process.argv[i + 1],
    temp = fs.mkdtempSync(path.join(os.tmpdir(), "hier-b33-control-")),
    original = JSON.parse(fs.readFileSync(archive)),
    records = [];
  try {
    for (const [id, mutate] of [["positive", null], ...mutations]) {
      const a = structuredClone(original);
      if (mutate) mutate(a);
      const file = path.join(temp, id + ".json");
      fs.writeFileSync(file, JSON.stringify(a));
      const command = [process.execPath, verifier, "--archive", file],
        start = performance.now(),
        r = spawnSync(command[0], command.slice(1), {
          encoding: null,
          timeout: 15000,
          maxBuffer: 4 * 1024 * 1024,
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
    const a = {
        kind: "B33-archive-controls",
        sourceArchive: {
          bytes: fs.statSync(archive).size,
          sha256: sha(fs.readFileSync(archive)),
        },
        records,
      },
      summary = validate(a);
    fs.writeFileSync(output, JSON.stringify(a, null, 2) + "\n", { flag: "wx" });
    console.log(
      JSON.stringify(
        {
          ...summary,
          file: output,
          bytes: fs.statSync(output).size,
          sha256: sha(fs.readFileSync(output)),
        },
        null,
        2,
      ),
    );
  } finally {
    assert.ok(path.basename(temp).startsWith("hier-b33-control-"));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
