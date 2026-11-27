// Launch bindings are test inputs, not a replacement demo implementation.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { publicEntry } from "../independent-electron-renderer/public-entry.mjs";
import { cases, regressions, deferred } from "./cases.mjs";
import { processorWorkflow } from "./processor-workflow.mjs";
const milestone = process.argv.includes("--processor-core");
const allCases = milestone ? [processorWorkflow] : [...cases, ...regressions];
async function launch(binary, driver, env) {
  const child = spawn(binary, [driver], { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const stdout = [],
    stderr = [];
  let cleanup = null;
  child.stdout.on("data", (b) => stdout.push(b));
  child.stderr.on("data", (b) => stderr.push(b));
  const deadline = setTimeout(() => {
    const owner = execFileSync("ps", ["-p", String(child.pid), "-o", "pgid=,command="], {
      encoding: "utf8",
    }).trim();
    assert.equal(Number(owner.split(/\s+/)[0]), child.pid, "only our detached process group");
    assert(owner.includes(binary), "only our Electron command");
    cleanup = { pid: child.pid, owner, reason: "45000ms driver watchdog, not product SLA" };
    process.kill(-child.pid, "SIGKILL");
  }, 45000);
  try {
    const result = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (status, signal) => resolve({ status, signal }));
    });
    return {
      ...result,
      stdout: Buffer.concat(stdout).toString(),
      stderr: Buffer.concat(stderr).toString(),
      cleanup,
    };
  } finally {
    clearTimeout(deadline);
  }
}
const p = process.env.HIER_B_PRODUCT_ROOT,
  local = path.dirname(fileURLToPath(import.meta.url));
if (process.argv.includes("--list")) {
  console.log(
    JSON.stringify(
      {
        cases: cases.map(({ run, ...m }) => m),
        regressions: regressions.map(({ run, ...m }) => m),
        deferred,
      },
      null,
      2,
    ),
  );
} else {
  const r = {
    kind: "B73-real-demo-Electron-required",
    planned: allCases.length,
    originalPlanned: milestone ? 0 : cases.length,
    regressionPlanned: milestone ? 0 : regressions.length,
    milestonePlanned: milestone ? 1 : 0,
    executed: 0,
    attempted: 0,
    passed: 0,
    failed: 0,
    blocked: allCases.length,
    skipped: 0,
    deferred: deferred.map((x) => x.id),
    results: [],
    exitCode: 1,
  };
  try {
    assert(p, "explicit fixed product");
    const packageRoot = fs.existsSync(p + "/web/package.json") ? p + "/web" : p;
    const appDir = process.env.HIER_B_DEMO_APP_DIR ?? p + "/web/apps/demo";
    assert(
      fs.realpathSync(appDir).startsWith(fs.realpathSync(p) + path.sep),
      "app directory belongs to the fixed source or standalone delivery",
    );
    let entry = process.env.HIER_B_DEMO_ENTRY;
    if (!entry && fs.existsSync(appDir + "/package.json")) {
      const pkg = JSON.parse(fs.readFileSync(appDir + "/package.json"));
      if (typeof pkg.main === "string") entry = path.resolve(appDir, pkg.main);
    }
    assert(
      entry && fs.existsSync(entry),
      "demo production entry absent; supply HIER_B_DEMO_ENTRY after app is implemented",
    );
    const canonical = fs.realpathSync(entry);
    assert(
      canonical.startsWith(fs.realpathSync(appDir) + path.sep),
      "entry must be the fixed demo product, not B fixture/fake controller",
    );
    assert(
      process.env.HIER_BIN && fs.existsSync(process.env.HIER_BIN),
      "B-owned actual Core required",
    );
    const req = createRequire(packageRoot + "/package.json"),
      binary = req("electron"),
      version = req("electron/package.json").version;
    assert.equal(
      spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 15000 }).stdout.trim(),
      "v" + version,
    );
    // Resolve ESM exports in this actual Node parent, never Electron's execPath.
    const entries = Object.fromEntries(
      ["@hier/client", "@hier/client/electron/renderer", "@hier/protocol-types"].map(
        (specifier) => [
          specifier,
          packageRoot === p
            ? execFileSync(
                process.execPath,
                [
                  "--input-type=module",
                  "-e",
                  "console.log(import.meta.resolve(" + JSON.stringify(specifier) + "))",
                ],
                { cwd: packageRoot, encoding: "utf8" },
              ).trim()
            : publicEntry(p, specifier),
        ],
      ),
    );
    const preload = fs.realpathSync(
      process.env.HIER_B_DEMO_PRELOAD ?? path.join(path.dirname(canonical), "preload.cjs"),
    );
    assert(preload.startsWith(fs.realpathSync(appDir) + path.sep), "actual fixed app preload");
    const selectedId = process.argv.includes("--case")
      ? process.argv[process.argv.indexOf("--case") + 1]
      : null;
    const selected = selectedId ? allCases.filter((c) => c.id === selectedId) : allCases;
    assert(selected.length > 0, "known frozen case");
    r.unselected = allCases.length - selected.length;
    r.blocked = selected.length;
    r.selected = selected.map((c) => c.id);
    for (const c of selected) {
      const child = await launch(binary, local + "/electron.mjs", {
        ...process.env,
        HIER_B_DEMO_ENTRY: canonical,
        HIER_B_DEMO_CASE: c.id,
        HIER_B_DEMO_PUBLIC_ENTRIES: JSON.stringify(entries),
        HIER_B_DEMO_PRELOAD: preload,
        HIER_B_DEMO_PACKAGE_ROOT: packageRoot,
      });
      let report, error;
      try {
        assert.equal(child.status, 0);
        const completions = child.stdout
          .split(/\r?\n/)
          .filter((line) => line.startsWith('{"kind":"B73-demo-complete"'));
        assert.equal(completions.length, 1, "one explicit B completion, not arbitrary app logs");
        report = JSON.parse(completions[0]);
        assert.equal(report.kind, "B73-demo-complete");
        assert.equal(report.id, c.id);
        if (report.bindingBlocked) {
          assert.equal(report.cleanupCompleted, true);
          assert.equal(report.passed, false);
          assert.equal(report.versions.electron, version);
        } else {
          assert.equal(report.passed, true);
          assert.equal(report.cleanupCompleted, true);
          assert.equal(report.versions.electron, version);
        }
      } catch (e) {
        error = String(child.error ?? e);
      }
      r.attempted++;
      const blocked = !error && report?.bindingBlocked === true;
      if (!blocked) {
        r.executed++;
        r.blocked--;
        if (error) r.failed++;
        else r.passed++;
      }
      r.results.push({
        id: c.id,
        pass: !error && !blocked,
        bindingBlocked: blocked,
        ...(error ? { error } : {}),
        report,
        stdout: child.stdout,
        stderr: child.stderr,
        signal: child.signal,
        cleanup: child.cleanup,
      });
      console.error(
        JSON.stringify({
          id: c.id,
          pass: !error && !blocked,
          bindingBlocked: blocked,
          cleanup: child.cleanup,
        }),
      );
    }
    r.exitCode = r.failed || r.blocked ? 1 : 0;
  } catch (e) {
    r.setupError = String(e);
  }
  console.log(JSON.stringify(r, null, 2));
  process.exitCode = r.exitCode;
}
