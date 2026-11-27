import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const entry = fileURLToPath(new URL("./verify-evidence.mjs", import.meta.url));
const archive = fileURLToPath(
  new URL(
    "../../../../docs/m5_b_multipage_action_identity.json",
    import.meta.url,
  ),
);
for (const alias of [false, true])
  for (const mode of ["valid", "invalid", "self-test", "eval-import"])
    test("B36-evidence " + (alias ? "alias" : "canonical") + " " + mode, () => {
      const dir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "hier-b36-evidence-cli-")),
      );
      try {
        fs.symlinkSync(entry, dir + "/alias.mjs");
        fs.writeFileSync(dir + "/invalid.json", "{}\n", { flag: "wx" });
        const target = alias ? dir + "/alias.mjs" : entry;
        const args =
          mode === "eval-import"
            ? [
                "--input-type=module",
                "-e",
                'const m=await import((await import("node:url")).pathToFileURL(process.argv[1]));console.log(JSON.stringify({loaded:typeof m.verify==="function"}));',
                target,
                "--archive",
                dir + "/invalid.json",
              ]
            : [
                target,
                "--archive",
                mode === "invalid" ? dir + "/invalid.json" : archive,
                ...(mode === "self-test"
                  ? ["--self-test"]
                  : mode === "valid"
                    ? ["--inputs"]
                    : []),
              ];
        const r = spawnSync(process.execPath, args, {
          encoding: "utf8",
          timeout: 15000,
          maxBuffer: 8 * 1024 * 1024,
        });
        assert.equal(r.error, undefined);
        assert.equal(r.signal, null);
        if (mode === "invalid") {
          assert.equal(r.status, 1);
          assert(r.stderr.length > 0);
          return;
        }
        assert.equal(r.status, 0);
        assert.equal(r.stderr, "");
        const o = JSON.parse(r.stdout);
        if (mode === "eval-import") {
          assert.deepEqual(o, { loaded: true });
          return;
        }
        assert.equal(o.metadataOnly, true);
        assert.equal(o.currentProductExecuted, 0);
        if (mode === "valid") {
          assert.equal(o.verified, true);
          assert.equal(o.captures, 41);
          assert.equal(o.inputs, 12);
        } else {
          assert.equal(o.positive, 1);
          assert.equal(o.negative, 6);
        }
      } finally {
        assert(path.basename(dir).startsWith("hier-b36-evidence-cli-"));
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
