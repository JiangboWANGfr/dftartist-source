// Standard-wrapper wiring/error propagation facility only, not renderer semantics.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const entries = [
  "verify-types.mjs",
  "browser-gate.mjs",
  "run.mjs",
  "c82/run.mjs",
  "c83/run.mjs",
  "ber/run.mjs",
  "ber/claim-run.mjs",
];
const wrapper = await fs.readFile(
  path.join(
    process.env.HIER_B_PRODUCT_ROOT,
    "web/scripts/run-electron-renderer-tests.mjs",
  ),
);
for (const [name, index, mode] of [
  ["all-seven", -1, "ok"],
  ["BER40-nonzero", 5, "exit"],
  ["claim6-nonzero", 6, "exit"],
  ["BER40-signal", 5, "signal"],
])
  test(name, async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "hier-b-renderer-wrapper-"),
    );
    try {
      const script = path.join(
        directory,
        "web/scripts/run-electron-renderer-tests.mjs",
      );
      await fs.mkdir(path.dirname(script), { recursive: true });
      await fs.writeFile(script, wrapper);
      for (const [i, file] of entries.entries()) {
        const dest = path.join(
          directory,
          "web/tests/independent-electron-renderer",
          file,
        );
        await fs.mkdir(path.dirname(dest), { recursive: true });
        const body =
          `console.log(JSON.stringify({i:${i},cwd:process.cwd(),product:process.env.HIER_B_PRODUCT_ROOT}));` +
          (i !== index
            ? ""
            : mode === "exit"
              ? "process.exit(23);"
              : 'process.kill(process.pid,"SIGTERM");');
        await fs.writeFile(dest, body);
      }
      const r = spawnSync(process.execPath, [script], {
        encoding: "utf8",
        env: {
          ...process.env,
          HIER_B_PRODUCT_ROOT: "must-be-overridden-by-standard-entry",
        },
      });
      assert.equal(r.error, undefined);
      assert.equal(r.signal, null);
      assert.equal(r.status, index < 0 ? 0 : mode === "exit" ? 23 : 1);
      const lines = r.stdout
        .trim()
        .split("\n")
        .map((s) => JSON.parse(s));
      assert.deepEqual(
        lines.map((r) => r.i),
        entries.slice(0, index < 0 ? 7 : index + 1).map((_, i) => i),
      );
      const canonicalDirectory = await fs.realpath(directory);
      for (const row of lines) {
        assert.equal(await fs.realpath(row.cwd), canonicalDirectory);
        assert.equal(await fs.realpath(row.product), canonicalDirectory);
      }
    } finally {
      assert.equal(
        path.basename(directory).startsWith("hier-b-renderer-wrapper-"),
        true,
      );
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
