// B C-84 path portability facility; executes original ten compatibility cases.
// Copies only B test inputs, uses the explicit fixed public product, changes no oracle.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
const own = path.resolve(import.meta.dirname, "../../..");
const input = path.resolve(process.env.HIER_B_COMPAT_INPUT_ROOT ?? own);
assert.ok(
  process.env.HIER_B_PRODUCT_ROOT,
  "explicit fixed public product required",
);
const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT);
const files = [
  "web/tests/independent-transport-sharing/compatibility.test.mjs",
  "web/tests/independent-transport-sharing/identity-epoch.mjs",
  "web/tests/independent-transport-sharing/realm-controls.mjs",
  "web/tests/independent-electron-renderer/public-entry.mjs",
  "web/tests/independent-client-identity/verify-types.mjs",
  "web/tests/independent-client-identity/types.mjs",
];
const cases = ["ascii-checkout", "checkout with space", "检出中文"];
if (process.argv.includes("--list")) {
  console.log(
    JSON.stringify(
      {
        count: 3,
        cases: cases.map((id) => ({
          id,
          input:
            "same six B files under this path, same explicit public product",
          expected:
            "ten compatibility cases pass, zero fail/skip; S02 actually executes seven semantic type negatives",
          basis:
            "legal local paths; C-84 / AGENTS test adaptation only, unchanged approved consumer oracle",
        })),
      },
      null,
      2,
    ),
  );
} else {
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  const packed = (b) => ({
    bytes: b.length,
    sha256: sha(b),
    gzip_base64: gzipSync(b).toString("base64"),
  });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hier-b-c84-paths-"));
  const result = {
    kind: "B-C84-path-facilities-NOT-three-new-product-suites",
    product,
    input,
    planned: 3,
    executed: 0,
    skipped: 0,
    files: [],
    results: [],
  };
  try {
    const contents = [];
    for (const file of files) {
      const b = await fs.readFile(path.join(input, file));
      result.files.push({ path: file, bytes: b.length, sha256: sha(b) });
      contents.push([file, b]);
    }
    for (const id of cases) {
      const root = path.join(dir, id);
      for (const [file, b] of contents) {
        const target = path.join(root, file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, b);
      }
      const child = spawnSync(
        process.execPath,
        [
          "--test",
          "web/tests/independent-transport-sharing/compatibility.test.mjs",
        ],
        {
          cwd: root,
          encoding: null,
          timeout: 45000,
          env: { ...process.env, HIER_B_PRODUCT_ROOT: product },
        },
      );
      const raw = (child.stdout ?? Buffer.alloc(0)).toString();
      const counts = Object.fromEntries(
        [
          ...raw.matchAll(
            /(?:ℹ|#) (tests|pass|fail|skipped|cancelled) (\d+)/g,
          ),
        ].map((m) => [m[1], Number(m[2])]),
      );
      const pass =
        !child.error &&
        child.signal === null &&
        child.status === 0 &&
        counts.tests === 10 &&
        counts.pass === 10 &&
        counts.fail === 0 &&
        counts.skipped === 0 &&
        counts.cancelled === 0;
      result.results.push({
        id,
        cwd: root,
        command: [
          process.execPath,
          "--test",
          "web/tests/independent-transport-sharing/compatibility.test.mjs",
        ],
        pass,
        status: child.status,
        signal: child.signal,
        error: child.error?.message,
        counts,
        stdout: packed(child.stdout ?? Buffer.alloc(0)),
        stderr: packed(child.stderr ?? Buffer.alloc(0)),
      });
      result.executed++;
    }
    result.passed = result.results.filter((r) => r.pass).length;
    result.failed = result.executed - result.passed;
    result.exitCode = result.failed ? 1 : 0;
  } finally {
    assert.ok(path.basename(dir).startsWith("hier-b-c84-paths-"));
    await fs.rm(dir, { recursive: true, force: true });
  }
  process.exitCode = result.exitCode;
  console.log(JSON.stringify(result, null, 2));
}
