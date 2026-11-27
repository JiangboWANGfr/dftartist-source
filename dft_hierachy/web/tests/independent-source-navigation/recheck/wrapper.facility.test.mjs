// B17 gate wiring facilities, NOT SDK/Core/Navigation product semantics.
// Basis: public VALIDATION navigation commands + inherited B gate failure rules.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const product = process.env.HIER_B_PRODUCT_ROOT;
assert.ok(product, "explicit fixed product");
const dir = "web/tests/independent-source-navigation/";
const groups = [
    { mode: "model", entries: ["verify-types.mjs", "ready-baseline/run.mjs"] },
    { mode: "core", entries: ["run.mjs"] },
    {
      mode: "controls",
      entries: ["facility.test.mjs", "ready-baseline/facility.test.mjs"],
    },
  ],
  cases = [];
for (const g of groups) {
  cases.push({ ...g, fault: "none", index: -1 });
  for (const index of g.entries.keys())
    for (const fault of ["exit", "signal", "missing"])
      cases.push({ ...g, fault, index });
}
for (const index of [0, 1])
  cases.push({ ...groups[2], fault: "directory", index });
for (const args of [
  ["controls", "document"],
  ["controls", "candidates"],
  ["model", "invalid"],
])
  cases.push({
    mode: "invalid",
    entries: [],
    fault: "invalid",
    index: -1,
    args,
  });
assert.equal(cases.length, 23);
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      {
        kind: "OS-child-gate-facilities-NOT-Core",
        count: cases.length,
        cases: cases.map((c) => ({
          id:
            "navigation-wrapper:" +
            c.mode +
            ":" +
            c.fault +
            ":" +
            c.index +
            ":" +
            (c.args?.join(",") ?? ""),
          input: c,
          expected:
            "normal all required children; failed/missing/directory/invalid nonzero, controls file preflight zero children; args/root/cwd/env preserved",
          basis:
            "VALIDATION navigation gates; AGENTS nonzero failure rule; original B wrapper facilities",
        })),
      },
      null,
      2,
    ),
  );
else
  for (const c of cases)
    test(
      "navigation-wrapper:" +
        c.mode +
        ":" +
        c.fault +
        ":" +
        c.index +
        ":" +
        (c.args?.join(",") ?? ""),
      async () => {
        const tmp = await fs.mkdtemp(
          path.join(os.tmpdir(), "hier-b-navigation-gate-"),
        );
        try {
          const root = await fs.realpath(tmp),
            wrapper = path.join(
              root,
              "web/scripts/run-source-document-tests.mjs",
            ),
            bin = path.join(root, "core/build-b-marker/hier");
          await fs.mkdir(path.dirname(wrapper), { recursive: true });
          await fs.writeFile(
            wrapper,
            await fs.readFile(
              path.join(product, "web/scripts/run-source-document-tests.mjs"),
            ),
          );
          await fs.mkdir(path.dirname(bin), { recursive: true });
          await fs.writeFile(bin, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
          for (const [i, name] of c.entries.entries()) {
            const file = path.join(root, dir, name);
            if (c.fault === "missing" && i === c.index) continue;
            if (c.fault === "directory" && i === c.index) {
              await fs.mkdir(file, { recursive: true });
              continue;
            }
            await fs.mkdir(path.dirname(file), { recursive: true });
            const marker =
              'console.log("B-NAV-WRAPPER "+JSON.stringify({i:' +
              i +
              ",args:process.argv.slice(2),cwd:process.cwd(),product:process.env.HIER_B_PRODUCT_ROOT,marker:process.env.HIER_B_FACILITY_MARKER,bin:process.env.HIER_BIN}));";
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
          const env = { ...process.env };
          delete env.NODE_TEST_CONTEXT;
          const r = spawnSync(
            process.execPath,
            [wrapper, ...(c.args ?? [c.mode, "navigation"])],
            {
              cwd: os.tmpdir(),
              encoding: "utf8",
              detached: true,
              timeout: 10000,
              env: {
                ...env,
                HIER_B_PRODUCT_ROOT: "caller-root-not-accepted",
                HIER_B_FACILITY_MARKER: "B-nav-marker",
                HIER_BIN: bin,
              },
            },
          );
          if (r.error && Number.isSafeInteger(r.pid) && r.pid > 0) {
            // Only the isolated process group spawned by this fixture.
            try {
              process.kill(-r.pid, "SIGKILL");
            } catch (e) {
              if (e.code !== "ESRCH") throw e;
            }
          }
          assert.equal(r.error, undefined);
          assert.equal(r.signal, null);
          if (c.fault === "none") assert.equal(r.status, 0, r.stderr);
          else assert.notEqual(r.status, 0, "no silent gate success");
          if (c.fault === "exit" && c.mode !== "controls")
            assert.equal(r.status, 23);
          const rows = [
            ...r.stdout.matchAll(/B-NAV-WRAPPER (\{[^\n]*\})/g),
          ].map((x) => JSON.parse(x[1]));
          if (c.fault === "none")
            assert.deepEqual(
              rows.map((x) => x.i).sort(),
              c.entries.map((_, i) => i),
            );
          if (
            c.mode === "controls" &&
            ["missing", "directory"].includes(c.fault)
          )
            assert.deepEqual(
              rows,
              [],
              "preflight every mandatory file before starting aggregate",
            );
          if (c.mode !== "controls") {
            if (c.fault === "missing") {
              // An implementation may preflight model inputs as well.
              assert.ok(rows.length <= c.index);
              assert.deepEqual(
                rows.map((x) => x.i),
                Array.from({ length: rows.length }, (_, i) => i),
              );
            } else {
              const n =
                c.fault === "none"
                  ? c.entries.length
                  : c.fault === "invalid"
                    ? 0
                    : c.index + (c.fault === "missing" ? 0 : 1);
              assert.deepEqual(
                rows.map((x) => x.i),
                Array.from({ length: n }, (_, i) => i),
              );
            }
          }
          for (const x of rows) {
            assert.equal(await fs.realpath(x.cwd), root);
            assert.equal(await fs.realpath(x.product), root);
            assert.equal(x.marker, "B-nav-marker");
            assert.equal(x.bin, bin);
            assert.deepEqual(
              x.args,
              c.mode === "core"
                ? ["--core"]
                : c.mode === "model" && x.i === 1
                  ? ["--all"]
                  : [],
            );
          }
        } finally {
          assert.ok(path.basename(tmp).startsWith("hier-b-navigation-gate-"));
          await fs.rm(tmp, { recursive: true, force: true });
        }
      },
    );
