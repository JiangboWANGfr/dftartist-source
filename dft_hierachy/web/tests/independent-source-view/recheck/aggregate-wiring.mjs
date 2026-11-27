// Isolated public npm-script wiring controls, NOT product/Core execution.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
const root = path.resolve(process.env.HIER_B_PRODUCT_ROOT ?? "");
assert.ok(process.env.HIER_B_PRODUCT_ROOT, "explicit fixed product required");
const file = path.join(root, "web/package.json");
const raw = fs.readFileSync(file);
const pkg = JSON.parse(raw);
const script = pkg.scripts["test:independent"];
assert.equal(typeof script, "string");
assert.ok(
  !pkg.scripts["pretest:independent"] && !pkg.scripts["posttest:independent"],
);
assert.ok(
  !/[;|<>$\r\n]/.test(script) && !script.includes(String.fromCharCode(96)),
);
assert.ok(script.split("&&").every((x) => /^(node|npm) /.test(x.trim())));
const npm = fs.realpathSync(process.env.HIER_B_NPM_BIN);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hier-b22-npm-wiring-"));
const results = [],
  cleanupErrors = [];
try {
  fs.mkdirSync(path.join(temp, "bin"));
  fs.writeFileSync(path.join(temp, "package.json"), raw);
  const recorder = path.join(temp, "bin/node");
  fs.writeFileSync(
    recorder,
    "#!" +
      process.execPath +
      "\n" +
      'import fs from "node:fs";import path from "node:path";const args=process.argv.slice(2);' +
      'fs.appendFileSync(process.env.B22_RECORD,JSON.stringify({program:path.basename(process.argv[1]),args,cwd:process.cwd(),executor:process.execPath})+"\\n");' +
      'if(process.env.B22_FAIL==="yes"&&args[0]==="scripts/run-source-view-tests.mjs"&&args[1]==="model")process.exit(23);\n',
  );
  fs.chmodSync(recorder, 0o755);
  // package.json is type:module; all extensionless fixture binaries use ESM.
  fs.copyFileSync(recorder, path.join(temp, "bin/tsc"));
  fs.chmodSync(path.join(temp, "bin/tsc"), 0o755);
  // Nested npm must expand the copied public scripts, not be swallowed by node.
  fs.writeFileSync(
    path.join(temp, "bin/npm"),
    "#!" +
      process.execPath +
      "\n" +
      'import {spawnSync} from "node:child_process";const r=spawnSync(' +
      JSON.stringify(process.execPath) +
      ",[" +
      JSON.stringify(npm) +
      ',...process.argv.slice(2)],{stdio:"inherit",env:process.env});if(r.error)throw r.error;process.exit(r.status??99);\n',
  );
  fs.chmodSync(path.join(temp, "bin/npm"), 0o755);
  for (const negative of [false, true]) {
    const record = path.join(
      temp,
      negative ? "negative.jsonl" : "positive.jsonl",
    );
    const command = [process.execPath, npm, "run", "test:independent"];
    const start = performance.now();
    const r = spawnSync(command[0], command.slice(1), {
      cwd: temp,
      env: {
        ...process.env,
        PATH: path.join(temp, "bin") + ":" + process.env.PATH,
        B22_RECORD: record,
        B22_FAIL: negative ? "yes" : "no",
        npm_config_ignore_scripts: "false",
      },
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const stdout = Buffer.from((r.stdout ?? "") + (r.stderr ?? ""));
    assert.ifError(r.error);
    assert.equal(r.signal, null);
    assert.equal(r.status, negative ? 23 : 0, stdout.toString());
    const calls = fs
      .readFileSync(record, "utf8")
      .trim()
      .split("\n")
      .map((x) => JSON.parse(x));
    assert.ok(
      calls.every(
        (x) =>
          x.cwd === fs.realpathSync(temp) && x.executor === process.execPath,
      ),
    );
    const source = calls.filter(
      (x) => x.args[0] === "scripts/run-source-view-tests.mjs",
    );
    assert.deepEqual(
      source.map((x) => x.args[1]),
      negative ? ["model"] : ["model", "package", "controls"],
    );
    const wrappers = calls.filter((x) =>
      x.args.includes("tests/source-view-wrapper.test.mjs"),
    );
    assert.equal(wrappers.length, negative ? 0 : 1);
    if (!negative) {
      assert.ok(calls.indexOf(wrappers[0]) > calls.indexOf(source[2]));
      assert.ok(calls.some((x) => x.program === "tsc" && x.args[0] === "-b"));
    }
    results.push({
      id: negative
        ? "model-exit23-short-circuits"
        : "model-package-controls-wrapper-order",
      pass: true,
      command,
      cwd: temp,
      exitCode: r.status,
      seconds: (performance.now() - start) / 1000,
      calls,
      stdoutBytes: stdout.length,
      stdoutSha256: sha(stdout),
      stdoutGzipBase64: gzipSync(stdout).toString("base64"),
    });
  }
} finally {
  try {
    fs.rmSync(temp, { recursive: true, force: true });
  } catch (e) {
    cleanupErrors.push(String(e));
  }
}
assert.deepEqual(fs.readFileSync(file), raw, "public package input unchanged");
assert.deepEqual(cleanupErrors, []);
console.log(
  JSON.stringify(
    {
      kind: "B22 isolated npm aggregate wiring - NOT product/Core",
      fixedPackageSha256: sha(raw),
      planned: 2,
      executed: results.length,
      passed: results.filter((x) => x.pass).length,
      failed: 0,
      skipped: 0,
      blocked: 0,
      productExecuted: 0,
      results,
      cleanupErrors,
    },
    null,
    2,
  ),
);
