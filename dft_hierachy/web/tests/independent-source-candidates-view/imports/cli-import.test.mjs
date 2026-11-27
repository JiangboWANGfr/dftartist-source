// Independent B programmatic import contract, never a product/Promise-consumption probe.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../../", import.meta.url)),
  entries = [
    [
      "release",
      "web/tests/independent-source-candidates-view/pagination/release/verify-evidence.mjs",
      "docs/m5_b_observer_restoration.json",
    ],
    [
      "actions",
      "web/tests/independent-source-candidates-view/actions/verify-evidence.mjs",
      "docs/m5_b_candidate_action_identity.json",
    ],
  ];
function fixture(entry, fn) {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "hier-b36-import-")),
  );
  try {
    fs.symlinkSync(root + "/" + entry, dir + "/alias.mjs");
    fs.writeFileSync(dir + "/invalid.json", "{}\n", { flag: "wx" });
    return fn(dir);
  } finally {
    assert.ok(path.basename(dir).startsWith("hier-b36-import-"));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
function run(args, input) {
  const r = spawnSync(process.execPath, args, {
    encoding: "utf8",
    input,
    timeout: 15000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(r.error, undefined, "fixture launch/watchdog not valid result");
  assert.equal(r.signal, null);
  return r;
}
for (const [name, entry, archive] of entries) {
  for (const alias of [false, true])
    for (const mode of ["eval", "eval-equals", "stdin"])
      for (const extra of [false, true])
        test(
          "B36-C97 " +
            name +
            " " +
            (alias ? "alias" : "real") +
            " " +
            mode +
            " " +
            (extra ? "consumer-archive" : "plain"),
          () =>
            fixture(entry, (dir) => {
              const target = alias ? dir + "/alias.mjs" : root + "/" + entry,
                index = mode === "stdin" ? 2 : 1,
                source =
                  'import {pathToFileURL} from "node:url";const m=await import(pathToFileURL(process.argv[' +
                  index +
                  ']));console.log(JSON.stringify({loaded:typeof m.verify==="function"}));';
              const args =
                mode === "stdin"
                  ? ["--input-type=module", "-", target]
                  : mode === "eval-equals"
                    ? ["--input-type=module", "--eval=" + source, target]
                    : ["--input-type=module", "-e", source, target];
              if (extra) args.push("--archive", dir + "/invalid.json");
              const r = run(args, mode === "stdin" ? source : undefined);
              assert.equal(
                r.status,
                0,
                "consumer import must not parse consumer archive args",
              );
              assert.equal(
                r.stdout,
                '{"loaded":true}\n',
                "only consumer output, never a CLI report",
              );
              assert.equal(r.stderr, "");
            }),
        );
  for (const alias of [false, true])
    for (const valid of [false, true])
      test(
        "B36-C97 " +
          name +
          " direct " +
          (alias ? "alias" : "real") +
          " " +
          (valid ? "valid" : "invalid"),
        () =>
          fixture(entry, (dir) => {
            const r = run([
              alias ? dir + "/alias.mjs" : root + "/" + entry,
              "--archive",
              valid ? root + "/" + archive : dir + "/invalid.json",
            ]);
            assert.equal(r.status, valid ? 0 : 1);
            if (valid) {
              const o = JSON.parse(r.stdout);
              assert.equal(o.verified, true);
              assert.equal(o.metadataOnly, true);
              assert.equal(o.currentProductExecuted, 0);
            } else
              assert.ok(r.stderr.length > 0, "actual direct CLI rejection");
          }),
      );
}
