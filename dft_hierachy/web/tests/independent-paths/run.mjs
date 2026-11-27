// B-PATH-02: relocate unchanged B inputs; real public packages and own Core.
// Fifteen path/execution facilities, not fifteen new product semantic cases.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
const own = path.resolve(import.meta.dirname, "../../..");
const input = path.resolve(process.env.HIER_B_PATH_INPUT_ROOT ?? own);
assert.ok(process.env.HIER_B_PRODUCT_ROOT, "explicit fixed public product");
const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT);
const names = ["ascii-checkout", "checkout with space", "检出中文"];
const groups = [
  {
    id: "tree43",
    args: [
      "--test",
      "web/tests/independent-tree/diagnostic-callable.probe.mjs",
      "web/tests/independent-tree/diagnostic-read-followups.test.mjs",
      "web/tests/independent-tree/diagnostic-task-boundaries.probe.mjs",
    ],
    kind: "tap",
    count: 43,
  },
  {
    id: "properties281",
    args: ["web/tests/independent-properties/run.mjs"],
    kind: "json",
    count: 281,
  },
  {
    id: "core-kat3",
    args: ["--test", "web/tests/independent-properties/core-controls.test.mjs"],
    kind: "tap",
    count: 3,
  },
  {
    id: "core-model5",
    args: ["web/tests/independent-properties/core-runtime.mjs"],
    kind: "json",
    count: 5,
  },
  { id: "core-import-only", kind: "import", count: 0 },
];
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      {
        count: 15,
        cases: names.flatMap((name) =>
          groups.map((g) => ({
            id: name + "/" + g.id,
            input:
              "identical B files in this local path; same explicit public product/own Core",
            expected:
              g.kind === "import"
                ? "import produces no report or Core launch"
                : g.count +
                  " original cases really execute and pass, zero skips; missing/empty report is NOT success",
            basis:
              "DESIGN6.6.6/6.9.4; original frozen B fixtures, native local-path adaptation only",
          })),
        ),
      },
      null,
      2,
    ),
  );
else {
  assert.ok(process.env.HIER_BIN, "B own Core required");
  const packed = (b) => ({
    bytes: b.length,
    sha256: createHash("sha256").update(b).digest("hex"),
    gzip_base64: gzipSync(b).toString("base64"),
  });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hier-b-path02-"));
  const report = {
    kind: "B-PATH02-relocated-input-facilities",
    input,
    product,
    planned: 15,
    executed: 0,
    skipped: 0,
    results: [],
  };
  try {
    for (const name of names) {
      const root = path.join(dir, name);
      await fs.mkdir(path.join(root, "web/tests"), { recursive: true });
      for (const folder of ["independent-tree", "independent-properties"])
        await fs.cp(
          path.join(input, "web/tests", folder),
          path.join(root, "web/tests", folder),
          { recursive: true },
        );
      const helper = "web/tests/independent-tree-view/ui/resource-cleanup.mjs";
      await fs.mkdir(path.dirname(path.join(root, helper)), {
        recursive: true,
      });
      await fs.copyFile(path.join(input, helper), path.join(root, helper));
      await fs.symlink(
        path.join(product, "web/node_modules"),
        path.join(root, "web/node_modules"),
        "dir",
      );
      for (const g of groups) {
        const args =
          g.kind === "import"
            ? [
                "--input-type=module",
                "-e",
                "await import(process.argv[1]);",
                pathToFileURL(
                  path.join(
                    root,
                    "web/tests/independent-properties/core-runtime.mjs",
                  ),
                ).href,
              ]
            : g.args;
        const child = spawnSync(process.execPath, args, {
          cwd: root,
          encoding: null,
          timeout: 120000,
          maxBuffer: 4 * 1024 * 1024,
          env: {
            ...process.env,
            HIER_B_PRODUCT_ROOT: product,
            ...(g.kind === "import"
              ? { HIER_BIN: "B-import-must-not-start-Core" }
              : {}),
          },
        });
        const text = (child.stdout ?? Buffer.alloc(0)).toString();
        let observation, coverageError;
        try {
          if (g.kind === "tap")
            observation = Object.fromEntries(
              [
                ...text.matchAll(
                  /(?:ℹ|#) (tests|pass|fail|skipped|cancelled) (\d+)/g,
                ),
              ].map((m) => [m[1], +m[2]]),
            );
          else if (g.kind === "json") {
            const r = JSON.parse(text);
            assert.equal(
              r.executedCases,
              g.count,
              "all original cases must actually execute",
            );
            assert.equal(r.skippedCases, 0);
            assert.equal(r.results.length, g.count);
            assert.ok(r.results.every((r) => r.pass === true));
            observation = {
              tests: r.executedCases,
              pass: r.results.filter((r) => r.pass).length,
              fail: r.results.filter((r) => !r.pass).length,
              skipped: r.skippedCases,
            };
          } else {
            assert.equal(text, "");
            assert.equal((child.stderr ?? Buffer.alloc(0)).length, 0);
            observation = { tests: 0, pass: 0, fail: 0, skipped: 0 };
          }
        } catch (e) {
          coverageError = String(e.message);
        }
        const pass =
          !child.error &&
          child.signal === null &&
          child.status === 0 &&
          !coverageError &&
          observation.tests === g.count &&
          observation.pass === g.count &&
          observation.fail === 0 &&
          observation.skipped === 0;
        report.results.push({
          id: name + "/" + g.id,
          expectedCases: g.count,
          pass,
          status: child.status,
          signal: child.signal,
          error: child.error?.message,
          coverageError,
          observation,
          cwd: root,
          command: [process.execPath, ...args],
          stdout: packed(child.stdout ?? Buffer.alloc(0)),
          stderr: packed(child.stderr ?? Buffer.alloc(0)),
        });
        report.executed++;
      }
    }
    report.passed = report.results.filter((r) => r.pass).length;
    report.failed = report.executed - report.passed;
    report.exitCode = report.failed ? 1 : 0;
  } finally {
    assert.ok(path.basename(dir).startsWith("hier-b-path02-"));
    await fs.rm(dir, { recursive: true, force: true });
  }
  process.exitCode = report.exitCode;
  console.log(JSON.stringify(report, null, 2));
}
