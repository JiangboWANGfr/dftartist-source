// Independent B CLI contract: an invocation must really validate, aliases cannot silently bypass gates.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
const entry = fileURLToPath(new URL("./verify-evidence.mjs", import.meta.url)),
  root = fileURLToPath(new URL("../../../../../", import.meta.url)),
  archive = root + "/docs/m5_b_observer_restoration.json",
  controls = root + "/docs/m5_b_observer_restoration_controls.json";
const inputs = [
  "docs/plans/M5-source-candidates-view-b34-observer-release.md",
  "web/tests/independent-source-candidates-view/pagination/release/README.md",
  "web/tests/independent-source-candidates-view/pagination/release/cases.mjs",
  "web/tests/independent-source-candidates-view/pagination/release/release.test.mjs",
  "web/tests/independent-source-candidates-view/pagination/public-calls.mjs",
];
const run = (args, input) => {
  const r = spawnSync(process.execPath, args, {
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 8 * 1024 * 1024,
    input,
  });
  assert.equal(
    r.error,
    undefined,
    "fixture child watchdog/launch errors are not a valid result",
  );
  assert.equal(r.signal, null);
  return r;
};
function fixture(fn) {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "hier-b35-cli-boundary-")),
  );
  try {
    fs.symlinkSync(entry, dir + "/alias.mjs");
    fs.writeFileSync(dir + "/invalid.json", "{}\n", { flag: "wx" });
    return fn(dir);
  } finally {
    assert.ok(path.basename(dir).startsWith("hier-b35-cli-boundary-"));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
for (const alias of [false, true])
  for (const mode of ["stdin", "eval-user-argument"])
    test("B35-CLI import " + (alias ? "alias" : "canonical") + " " + mode, () =>
      fixture((dir) => {
        const target = alias ? dir + "/alias.mjs" : entry,
          script =
            "const m=await import(" +
            JSON.stringify(pathToFileURL(target).href) +
            ');console.log(JSON.stringify({loaded:typeof m.verify==="function"}));';
        const r =
          mode === "stdin"
            ? run(["--input-type=module", "-"], script)
            : run([
                "--input-type=module",
                "-e",
                script,
                "B-independent-non-file-user-argument",
              ]);
        assert.equal(
          r.status,
          0,
          "import from valid Node stdin/eval consumer must work",
        );
        assert.deepEqual(JSON.parse(r.stdout), { loaded: true });
        assert.equal(r.stderr, "");
      }),
    );
for (const alias of [false, true])
  for (const mode of [
    "valid",
    "invalid",
    "inputs-reject",
    "self-test",
    "controls",
  ])
    test("B35-CLI " + (alias ? "alias" : "canonical") + " " + mode, () =>
      fixture((dir) => {
        let target = alias ? dir + "/alias.mjs" : entry,
          args = [
            "--archive",
            mode === "invalid" ? dir + "/invalid.json" : archive,
          ];
        if (mode === "inputs-reject") {
          const copy = dir + "/fixed";
          for (const f of [
            ...inputs,
            "web/tests/independent-source-candidates-view/pagination/release/verify-evidence.mjs",
          ]) {
            fs.mkdirSync(path.dirname(copy + "/" + f), { recursive: true });
            fs.copyFileSync(root + "/" + f, copy + "/" + f);
          }
          fs.appendFileSync(
            copy + "/" + inputs[1],
            "\nB independent invalid frozen-input fixture\n",
          );
          const copied =
            copy +
            "/web/tests/independent-source-candidates-view/pagination/release/verify-evidence.mjs";
          fs.symlinkSync(copied, dir + "/bad-input-alias.mjs");
          target = alias ? dir + "/bad-input-alias.mjs" : copied;
          args.push("--inputs");
        }
        if (mode === "self-test") args.push("--self-test");
        if (mode === "controls") args.push("--verify-controls", controls);
        const r = run([target, ...args]);
        if (mode === "invalid" || mode === "inputs-reject") {
          assert.equal(
            r.status,
            1,
            "invalid archive/input must be rejected through every path",
          );
          assert.ok(r.stderr.length > 0, "explicit rejection diagnostic");
          return;
        }
        assert.equal(r.status, 0);
        assert.ok(r.stdout.trim().length > 0, "success cannot be empty bypass");
        const o = JSON.parse(r.stdout);
        assert.equal(o.metadataOnly, true);
        assert.equal(o.currentProductExecuted, 0);
        if (mode === "self-test") {
          assert.equal(o.positive, 1);
          assert.equal(o.negative, 10);
        } else {
          assert.equal(o.verified, true);
          if (mode === "valid") assert.equal(o.captures, 38);
          else assert.equal(o.receipts, 6);
        }
      }),
    );
for (const alias of [false, true])
  test(
    "B35-CLI import " + (alias ? "alias" : "canonical") + " never auto-runs",
    () =>
      fixture((dir) => {
        const target = alias ? dir + "/alias.mjs" : entry,
          script =
            "const m=await import(" +
            JSON.stringify(pathToFileURL(target).href) +
            ');console.log(JSON.stringify({loaded:typeof m.verify==="function"}));',
          r = run(["--input-type=module", "-e", script]);
        assert.equal(r.status, 0);
        assert.deepEqual(JSON.parse(r.stdout), { loaded: true });
        assert.equal(r.stderr, "");
      }),
  );
