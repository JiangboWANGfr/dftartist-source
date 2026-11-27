// B17 C-87: real standard npm gate target isolation, NOT model semantics.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
const variants = ["unset", "missing-root", "old-built-root", "current-root"];
const rows = variants.map((variant) => ({
  id: "B-C87-viewmodel-" + variant,
  input: {
    standardCommand: "npm --prefix web run test:viewmodel",
    rootVariable: variant,
  },
  expected:
    "status0; current checkout at least24 tests, pass==tests, no fail/skip/cancel/todo regardless B-only root variable",
  basis:
    "AGENTS standard fixed-product evidence; VALIDATION test:viewmodel/check.sh commands, not B fixture API",
}));
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      {
        kind: "standard-gate-env-isolation-NOT-Core",
        count: rows.length,
        cases: rows,
      },
      null,
      2,
    ),
  );
else {
  const product = process.env.HIER_B_PRODUCT_ROOT,
    old = process.env.HIER_B_OLD_PRODUCT_ROOT;
  assert.ok(
    product && old,
    "B facility explicitly selects current and wrong-old products",
  );
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: old,
      encoding: "utf8",
    }).trim(),
    "b55f27de0a40ca0ffefac4a20a38ad7cf287f66e",
  );
  await fs.access(path.join(old, "web/packages/viewmodel/dist/index.d.ts"));
  assert.notEqual(await fs.realpath(product), await fs.realpath(old));
  for (const row of rows)
    test(row.id, async () => {
      const dir = await fs.mkdtemp(
        path.join(os.tmpdir(), "hier-b-c87-viewmodel-"),
      );
      try {
        const env = {
          ...process.env,
          PATH:
            path.dirname(process.execPath) + path.delimiter + process.env.PATH,
        };
        delete env.NODE_TEST_CONTEXT;
        delete env.HIER_B_PRODUCT_ROOT;
        if (row.input.rootVariable === "missing-root")
          env.HIER_B_PRODUCT_ROOT = path.join(dir, "does-not-exist");
        if (row.input.rootVariable === "old-built-root")
          env.HIER_B_PRODUCT_ROOT = old;
        if (row.input.rootVariable === "current-root")
          env.HIER_B_PRODUCT_ROOT = product;
        const command = [
            "/opt/homebrew/bin/npm",
            "--prefix",
            path.join(product, "web"),
            "run",
            "test:viewmodel",
          ],
          cwd = os.tmpdir();
        const r = await new Promise((resolve) => {
          const child = spawn(command[0], command.slice(1), {
            cwd,
            env,
            detached: true,
            stdio: ["ignore", "pipe", "pipe"],
          });
          const stdout = [],
            stderr = [];
          let error;
          child.stdout.on("data", (data) => stdout.push(data));
          child.stderr.on("data", (data) => stderr.push(data));
          child.once("error", (e) => {
            error = e;
          });
          const timer = setTimeout(() => {
            error = Error("B process-group watchdog, not product SLA");
            if (Number.isSafeInteger(child.pid) && child.pid > 0) {
              try {
                process.kill(-child.pid, "SIGKILL");
              } catch (e) {
                if (e.code !== "ESRCH") error = e;
              }
            }
          }, 20000);
          child.once("close", (status, signal) => {
            clearTimeout(timer);
            resolve({
              status,
              signal,
              error,
              stdout: Buffer.concat(stdout).toString("utf8"),
              stderr: Buffer.concat(stderr).toString("utf8"),
            });
          });
        });
        console.log(
          "B-C87-RECEIPT " +
            JSON.stringify({
              id: row.id,
              command,
              cwd,
              envRoot: env.HIER_B_PRODUCT_ROOT ?? null,
              oldProduct: old,
              status: r.status,
              signal: r.signal,
              toolError: r.error?.message ?? null,
              stdout: r.stdout,
              stderr: r.stderr,
            }),
        );
        assert.equal(r.error, undefined);
        assert.equal(r.signal, null);
        assert.equal(r.status, 0, r.stdout + "\n" + r.stderr);
        const out = r.stdout + "\n" + r.stderr,
          blocks = [...out.matchAll(/^ℹ tests (\d+)$/gm)];
        assert.equal(blocks.length, 1);
        const at = blocks[0].index,
          s = out.slice(at),
          get = (k) => Number(s.match(new RegExp("ℹ " + k + " (\\d+)"))?.[1]),
          n = Number(blocks[0][1]);
        assert.ok(
          n >= 24,
          "do not delete existing required test to make gate pass",
        );
        assert.equal(get("pass"), n);
        for (const k of ["fail", "skipped", "cancelled", "todo"])
          assert.equal(get(k), 0, k);
      } finally {
        assert.ok(path.basename(dir).startsWith("hier-b-c87-viewmodel-"));
        await fs.rm(dir, { recursive: true, force: true });
      }
    });
}
