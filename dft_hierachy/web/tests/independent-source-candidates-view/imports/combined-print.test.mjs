// Independent B C-97 continuation: imports have no CLI effects; direct CLI really validates.
// Public Node print/eval forms; no A/C probe or implementation-derived oracle.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fs.realpathSync(
  process.env.HIER_B_VERIFIER_ROOT ??
    fileURLToPath(new URL("../../../../", import.meta.url)),
);
assert(path.isAbsolute(root));
const modes = [
  ["pe", ["-pe"]],
  ["split", ["-p", "-e"]],
  ["long", ["--print", "--eval"]],
  ["print-only", ["-p"]],
];
const entries = [
  [
    "release",
    "pagination/release/verify-evidence.mjs",
    "m5_b_observer_restoration.json",
  ],
  [
    "actions",
    "actions/verify-evidence.mjs",
    "m5_b_candidate_action_identity.json",
  ],
  [
    "multipage",
    "multipage/verify-evidence.mjs",
    "m5_b_multipage_action_identity.json",
  ],
];
function run(args) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, args, {
    env,
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(
    r.error,
    undefined,
    "fixture watchdog/launch error is not a test outcome",
  );
  assert.equal(r.signal, null);
  return r;
}
function fixture(entry, fn) {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "hier-b38-print-import-")),
  );
  try {
    fs.symlinkSync(entry, dir + "/alias.mjs");
    fs.writeFileSync(dir + "/invalid.json", "{}\n", { flag: "wx" });
    return fn(dir);
  } finally {
    assert(path.basename(dir).startsWith("hier-b38-print-import-"));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
for (const [name, flags] of modes)
  test("B38 runtime print premise " + name, () => {
    const r = run([...flags, "void 0"]);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "undefined\n");
    assert.equal(r.stderr, "");
  });
for (const [label, file, archiveFile] of entries) {
  const entry = path.join(
      root,
      "web/tests/independent-source-candidates-view",
      file,
    ),
    archive = path.join(root, "docs", archiveFile);
  for (const alias of [false, true])
    for (const [name, flags] of modes)
      for (const extraArchive of [false, true])
        test(
          "B38 import " +
            label +
            " " +
            (alias ? "alias" : "real") +
            " " +
            name +
            " consumerArchive=" +
            extraArchive,
          () =>
            fixture(entry, (dir) => {
              const target = alias ? dir + "/alias.mjs" : entry;
              const script =
                'void import(require("node:url").pathToFileURL(process.argv[1])).then(m=>console.log("B38_LOADED="+typeof m.verify));';
              const r = run([
                ...flags,
                script,
                target,
                ...(extraArchive ? ["--archive", dir + "/invalid.json"] : []),
              ]);
              assert.equal(
                r.status,
                0,
                "a legitimate loader imports exports, never executes the target CLI or reads consumer archive",
              );
              assert.equal(r.stderr, "");
              assert.deepEqual(
                r.stdout.trim().split(/\r?\n/).sort(),
                ["B38_LOADED=function", "undefined"].sort(),
                "exact consumer and print-result lines; no extra report, no extra ordering requirement",
              );
            }),
        );
  for (const alias of [false, true])
    for (const titleData of [false, true])
      for (const valid of [true, false])
        test(
          "B38 direct " +
            label +
            " " +
            (alias ? "alias" : "real") +
            " titleData=" +
            titleData +
            " valid=" +
            valid,
          () =>
            fixture(entry, (dir) => {
              const target = alias ? dir + "/alias.mjs" : entry,
                r = run([
                  ...(titleData ? ["--title=-pe"] : []),
                  target,
                  "--archive",
                  valid ? archive : dir + "/invalid.json",
                ]);
              if (!valid) {
                assert.equal(
                  r.status,
                  1,
                  "invalid archive must be rejected, not bypassed",
                );
                assert(r.stderr.length > 0, "explicit validation diagnostic");
                return;
              }
              assert.equal(r.status, 0);
              assert.equal(r.stderr, "");
              assert(
                r.stdout.trim().length > 0,
                "nonempty successful validation, not empty exit0",
              );
              const o = JSON.parse(r.stdout);
              assert.equal(o.verified, true);
              assert.equal(o.metadataOnly, true);
              assert.equal(o.currentProductExecuted, 0);
            }),
        );
}
