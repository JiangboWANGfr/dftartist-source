// OS subprocess/caller-wiring facilities only: not SDK or Source model semantics.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const product = process.env.HIER_B_PRODUCT_ROOT;
assert.ok(product, "explicit fixed product root required");
const identity = ["web/tests/independent-client-identity/run.mjs"];
const model = [
  "web/tests/independent-source-document/verify-types.mjs",
  "web/tests/independent-source-document/run.mjs",
  "web/tests/independent-source-document/recheck/timing.mjs",
];
const core = ["web/tests/independent-source-document/run.mjs"];
const scenarios = [];
for (const [group, wrapper, args, entries] of [
  ["identity", "run-client-identity-tests.mjs", [], identity],
  ["model", "run-source-document-tests.mjs", ["model"], model],
  ["core", "run-source-document-tests.mjs", ["core"], core],
]) {
  scenarios.push({ group, wrapper, args, entries, fault: "none", index: -1 });
  for (const index of entries.keys())
    for (const fault of ["exit", "signal", "missing"])
      scenarios.push({ group, wrapper, args, entries, fault, index });
}
for (const args of [[], ["invalid"]])
  scenarios.push({
    group: "invalid-mode",
    wrapper: "run-source-document-tests.mjs",
    args,
    entries: model,
    fault: "invalid",
    index: -1,
  });
assert.equal(scenarios.length, 20);
for (const s of scenarios)
  test(`${s.group}:${s.args.join(",")}:${s.fault}:${s.index}`, async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "hier-b-source-gates-"),
    );
    try {
      const root = await fs.realpath(dir);
      const wrapper = path.join(root, "web/scripts", s.wrapper);
      await fs.mkdir(path.dirname(wrapper), { recursive: true });
      await fs.writeFile(
        wrapper,
        await fs.readFile(path.join(product, "web/scripts", s.wrapper)),
      );
      for (const [i, file] of s.entries.entries()) {
        if (s.fault === "missing" && i === s.index) continue;
        const dest = path.join(root, file);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        const body =
          `console.log(JSON.stringify({i:${i},args:process.argv.slice(2),cwd:process.cwd(),product:process.env.HIER_B_PRODUCT_ROOT,marker:process.env.HIER_B_FACILITY_MARKER,bin:process.env.HIER_BIN}));` +
          (i !== s.index
            ? ""
            : s.fault === "exit"
              ? "process.exit(23);"
              : s.fault === "signal"
                ? 'process.kill(process.pid,"SIGTERM");'
                : "");
        await fs.writeFile(dest, body);
      }
      const result = spawnSync(process.execPath, [wrapper, ...s.args], {
        cwd: os.tmpdir(),
        encoding: "utf8",
        env: {
          ...process.env,
          HIER_B_PRODUCT_ROOT: "caller-root-must-not-leak",
          HIER_B_FACILITY_MARKER: "B-independent-marker",
          HIER_BIN: "B-facility-not-a-real-Core",
        },
      });
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      const expectedStatus =
        s.fault === "none" ? 0 : s.fault === "exit" ? 23 : 1;
      assert.equal(result.status, expectedStatus, result.stderr);
      const rows = result.stdout.trim()
        ? result.stdout
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
        : [];
      const count =
        s.fault === "none"
          ? s.entries.length
          : s.fault === "invalid"
            ? 0
            : s.index + (s.fault === "missing" ? 0 : 1);
      assert.deepEqual(
        rows.map((r) => r.i),
        Array.from({ length: count }, (_, i) => i),
        "stop at first failure; no later child",
      );
      for (const row of rows) {
        assert.equal(await fs.realpath(row.cwd), root);
        assert.equal(await fs.realpath(row.product), root);
        assert.equal(row.marker, "B-independent-marker");
        assert.equal(row.bin, "B-facility-not-a-real-Core");
        assert.deepEqual(row.args, s.group === "core" ? ["--core"] : []);
      }
      if (s.fault === "signal") assert.match(result.stderr, /SIGTERM/);
      if (s.fault === "missing")
        assert.match(result.stderr, /MODULE_NOT_FOUND/);
    } finally {
      assert.equal(path.basename(dir).startsWith("hier-b-source-gates-"), true);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
