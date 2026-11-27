// OS subprocess/wrapper controls, never SourceView or a browser substitute.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { cases, commands, entries } from "./cases.mjs";
const product = process.env.HIER_B_PRODUCT_ROOT;
assert.ok(product && path.isAbsolute(product), "explicit fixed product");
assert.equal(cases.length, 16);
assert.equal(new Set(cases.map((c) => c.id)).size, 16);
assert.equal(entries.length, 8);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const encode = (b) => ({
  bytes: b.length,
  sha256: sha(b),
  gzipBase64: gzipSync(b).toString("base64"),
});
const bytes = await fs.readFile(
  path.join(product, "web/scripts/run-source-view-tests.mjs"),
);
const report = {
  kind: "B independent observation gate OS facility NOT product",
  product,
  fixed: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: product,
    encoding: "utf8",
  }).trim(),
  node: process.version,
  wrapper: { bytes: bytes.length, sha256: sha(bytes) },
  planned: cases.length,
  executed: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  blocked: 0,
  productExecuted: 0,
  results: [],
  cleanupErrors: [],
  exitCode: 1,
};
for (const c of cases) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "hier-b-observation-gate-"),
  );
  const result = { ...c, pass: false, commands: [] };
  try {
    const root = path.join(await fs.realpath(dir), "wrapper with space 中文");
    const wrapper = path.join(root, "web/scripts/run-source-view-tests.mjs");
    await fs.mkdir(path.dirname(wrapper), { recursive: true });
    await fs.writeFile(wrapper, bytes);
    for (const [i, file] of entries.entries()) {
      const target = path.join(root, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      if (file === c.input.target && c.input.fault === "missing") continue;
      if (file === c.input.target && c.input.fault === "directory") {
        await fs.mkdir(target);
        continue;
      }
      const behavior =
        file !== c.input.target
          ? ""
          : c.input.fault === "exit23"
            ? "process.exit(23);"
            : c.input.fault === "signal"
              ? 'process.kill(process.pid,"SIGTERM");'
              : c.input.fault === "throw"
                ? 'throw new Error("B explicit child failure");'
                : "";
      const source =
        'console.log("B_GATE_ROW "+JSON.stringify({index:' +
        i +
        ",file:" +
        JSON.stringify(file) +
        ",args:process.argv.slice(2),cwd:process.cwd(),product:process.env.HIER_B_PRODUCT_ROOT,tools:process.env.HIER_B_BROWSER_TOOLS,marker:process.env.HIER_B_GATE_MARKER,bin:process.env.HIER_BIN}));" +
        behavior;
      await fs.writeFile(target, source);
    }
    for (let run = 0; run < (c.input.repeat ?? 1); run++) {
      const marker = c.id + ":" + run;
      const env = {
        ...process.env,
        HIER_B_PRODUCT_ROOT: "caller root must not leak",
        HIER_B_BROWSER_TOOLS: "caller tools must not leak",
        HIER_B_NPM_BIN: "/B-no-npm-needed-for-controls",
        HIER_B_GATE_MARKER: marker,
        HIER_BIN: "B-not-a-Core",
      };
      delete env.NODE_TEST_CONTEXT;
      const started = new Date().toISOString(),
        at = performance.now();
      const r = spawnSync(process.execPath, [wrapper, ...c.input.args], {
        cwd: os.tmpdir(),
        env,
        timeout: 20000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const out = r.stdout ?? Buffer.alloc(0),
        err = r.stderr ?? Buffer.alloc(0);
      result.commands.push({
        command: [process.execPath, wrapper, ...c.input.args],
        cwd: os.tmpdir(),
        started,
        ended: new Date().toISOString(),
        milliseconds: performance.now() - at,
        status: r.status,
        signal: r.signal,
        error: r.error ? String(r.error) : null,
        stdout: encode(out),
        stderr: encode(err),
      });
      assert.equal(r.error, undefined, "no watchdog/spawn failure");
      assert.equal(r.signal, null, "wrapper itself exits normally");
      assert.equal(r.status, c.expected.status, err.toString());
      const rows = out
        .toString()
        .split("\n")
        .filter((line) => line.includes("B_GATE_ROW "))
        .map((line) =>
          JSON.parse(line.slice(line.indexOf("B_GATE_ROW ") + 11)),
        );
      assert.equal(
        rows.length,
        c.expected.rows ?? c.expected.rowsPerRun,
        "all inputs prechecked before any child / no later child after failure",
      );
      assert.deepEqual(
        rows.map((r) => r.index).sort((a, b) => a - b),
        Array.from({ length: rows.length }, (_, i) => i),
        "each expected input exactly once",
      );
      for (const row of rows) {
        assert.equal(await fs.realpath(row.cwd), root);
        assert.equal(await fs.realpath(row.product), root);
        assert.equal(await fs.realpath(row.tools), root + "/web");
        assert.equal(row.marker, marker);
        assert.equal(row.bin, "B-not-a-Core");
        const command = commands.find((x) => x.includes(row.file));
        assert.deepEqual(
          row.args,
          command[0] === "--test" ? [] : command.slice(1),
        );
      }
      if (c.input.fault === "signal") assert.match(err.toString(), /SIGTERM/);
      if (c.input.fault === "throw")
        assert.match(err.toString(), /B explicit child failure/);
      assert.deepEqual(
        await fs.readFile(wrapper),
        bytes,
        "original wrapper copy stays unchanged",
      );
    }
    result.pass = true;
  } catch (error) {
    result.error = String(error.stack ?? error);
  } finally {
    try {
      assert.ok(path.basename(dir).startsWith("hier-b-observation-gate-"));
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      report.cleanupErrors.push({ id: c.id, error: String(error) });
      result.pass = false;
    }
  }
  report.executed++;
  report[result.pass ? "passed" : "failed"]++;
  report.results.push(result);
}
report.exitCode = report.failed || report.cleanupErrors.length ? 1 : 0;
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.exitCode;
