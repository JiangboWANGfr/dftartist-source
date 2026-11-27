// B13: standard gate wiring only, NOT queryAt/SDK/Core semantic acceptance.
// Basis: VALIDATION source-position commands + AGENTS nonzero failure rule.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const product = process.env.HIER_B_PRODUCT_ROOT;
assert.ok(product, "explicit fixed product required");
const dir = "web/tests/independent-source-position/";
const groups = [
  { mode: "model", entries: ["verify-types.mjs", "run.mjs"] },
  { mode: "core", entries: ["run.mjs"] },
  {
    mode: "controls",
    entries: ["facility.test.mjs", "legacy-regression.test.mjs"],
  },
];
const cases = [];
for (const group of groups) {
  cases.push({ ...group, fault: "none", index: -1 });
  for (const index of group.entries.keys())
    for (const fault of ["exit", "signal", "missing"])
      cases.push({ ...group, fault, index });
}
for (const args of [
  ["controls", "document"],
  ["controls", "candidates"],
  ["model", "invalid"],
])
  cases.push({
    mode: "invalid",
    args,
    entries: [],
    fault: "invalid",
    index: -1,
  });
assert.equal(cases.length, 21);
for (const c of cases)
  test(`position-wrapper:${c.mode}:${c.fault}:${c.index}:${c.args?.join(",") ?? ""}`, async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "hier-b-position-gate-"),
    );
    try {
      const root = await fs.realpath(tmp);
      const wrapper = path.join(
        root,
        "web/scripts/run-source-document-tests.mjs",
      );
      await fs.mkdir(path.dirname(wrapper), { recursive: true });
      await fs.writeFile(
        wrapper,
        await fs.readFile(
          path.join(product, "web/scripts/run-source-document-tests.mjs"),
        ),
      );
      for (const [i, name] of c.entries.entries()) {
        if (c.fault === "missing" && i === c.index) continue;
        const file = path.join(root, dir, name);
        await fs.mkdir(path.dirname(file), { recursive: true });
        const marker = `console.log("B-POSITION-WRAPPER "+JSON.stringify({i:${i},args:process.argv.slice(2),cwd:process.cwd(),product:process.env.HIER_B_PRODUCT_ROOT,marker:process.env.HIER_B_FACILITY_MARKER,bin:process.env.HIER_BIN}));`;
        const fault =
          i !== c.index
            ? ""
            : c.fault === "exit"
              ? "process.exit(23);"
              : c.fault === "signal"
                ? 'process.kill(process.pid,"SIGTERM");'
                : "";
        await fs.writeFile(file, marker + fault);
      }
      // This fixture itself runs under node --test. A standard npm gate does not
      // inherit its private child-v8 marker: leaving it set suppresses nested
      // Node --test completely (warning + status0), including deliberately bad
      // files. Isolate ONLY this runner marker, not product/caller environment.
      const callerEnv = { ...process.env };
      delete callerEnv.NODE_TEST_CONTEXT;
      const actual = spawnSync(
        process.execPath,
        [wrapper, ...(c.args ?? [c.mode, "position"])],
        {
          cwd: os.tmpdir(),
          encoding: "utf8",
          env: {
            ...callerEnv,
            HIER_B_PRODUCT_ROOT: "caller-root-must-not-leak",
            HIER_B_FACILITY_MARKER: "B-position-marker",
            HIER_BIN: "B-position-not-a-Core",
          },
        },
      );
      assert.equal(actual.error, undefined);
      assert.equal(actual.signal, null);
      if (c.fault === "none") assert.equal(actual.status, 0, actual.stderr);
      else
        assert.notEqual(
          actual.status,
          0,
          "missing/failed child or invalid mode must not be accepted",
        );
      if (c.fault === "exit" && c.mode !== "controls")
        assert.equal(actual.status, 23);
      const rows = [
        ...actual.stdout.matchAll(/B-POSITION-WRAPPER (\{[^\n]*\})/g),
      ].map((m) => JSON.parse(m[1]));
      if (c.fault === "none")
        assert.deepEqual(
          rows.map((r) => r.i).sort(),
          c.entries.map((_, i) => i),
        );
      // controls is ONE node --test aggregate, not two sequential subprocesses.
      // It may run the other file after failure; no file-level stop/exit23 oracle.
      if (c.mode !== "controls") {
        const count =
          c.fault === "none"
            ? c.entries.length
            : c.fault === "invalid"
              ? 0
              : c.index + (c.fault === "missing" ? 0 : 1);
        assert.deepEqual(
          rows.map((r) => r.i),
          Array.from({ length: count }, (_, i) => i),
        );
      }
      for (const r of rows) {
        assert.equal(await fs.realpath(r.cwd), root);
        assert.equal(await fs.realpath(r.product), root);
        assert.equal(r.marker, "B-position-marker");
        assert.equal(r.bin, "B-position-not-a-Core");
        assert.deepEqual(r.args, c.mode === "core" ? ["--core"] : []);
      }
    } finally {
      assert.ok(path.basename(tmp).startsWith("hier-b-position-gate-"));
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
