import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { publicEntry } from "../independent-electron-renderer/public-entry.mjs";
const p = process.env.HIER_B_PRODUCT_ROOT,
  r = {
    kind: "B71-real-Electron-required",
    planned: 1,
    executed: 0,
    passed: 0,
    failed: 0,
    blocked: 1,
    skipped: 0,
    exitCode: 1,
  };
try {
  if (!p) throw Error("explicit fixed product required");
  for (const k of ["main", "preload", "renderer"]) publicEntry(p, "@hier/client/electron/" + k);
  const req = createRequire(p + "/web/package.json"),
    binary = process.env.HIER_B_ELECTRON_BIN ?? req("electron");
  if (typeof binary !== "string" || !fs.existsSync(binary))
    throw Error("actual Electron executable required; no fallback to Node/fake IPC");
  if (!process.env.HIER_BIN) throw Error("B-owned Core required");
  const esbuild = req("esbuild"),
    dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/private/tmp", "B71-electron-")),
    local = path.dirname(fileURLToPath(import.meta.url));
  fs.copyFileSync(local + "/electron-page.html", dir + "/electron-page.html");
  const plugin = {
    name: "fixed-public-hier-entries",
    setup(b) {
      b.onResolve({ filter: /^@hier\// }, (x) => ({ path: fileURLToPath(publicEntry(p, x.path)) }));
    },
  };
  for (const [source, out, platform, format] of [
    ["electron-app.mjs", "app.mjs", "node", "esm"],
    ["electron-preload.mjs", "preload.cjs", "node", "cjs"],
    ["electron-renderer.mjs", "renderer.js", "browser", "iife"],
  ])
    await esbuild.build({
      entryPoints: [local + "/" + source],
      outfile: dir + "/" + out,
      bundle: true,
      platform,
      format,
      external: ["electron"],
      plugins: [plugin],
      logLevel: "silent",
    });
  const child = spawnSync(binary, [dir + "/app.mjs"], {
    env: { ...process.env, B_E2E_DIR: dir },
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
  });
  r.executed = 1;
  r.blocked = 0;
  r.stdout = child.stdout;
  r.stderr = child.stderr;
  r.signal = child.signal;
  r.runtime = binary;
  if (child.status === 0) {
    try {
      const completion = JSON.parse(child.stdout);
      assert.equal(completion.kind, "B71-real-contextBridge-SDK-Core");
      assert.equal(completion.passed, 1);
      assert.equal(completion.failed, 0);
      assert.equal(completion.skipped, 0);
      assert.equal(completion.contextIsolation, true);
      assert.equal(completion.nodeIntegration, false);
      assert.equal(completion.sandbox, true);
      assert.equal(completion.completed, true);
      assert.equal(completion.versions.electron, req("electron/package.json").version);
      assert(Object.hasOwn(completion.exited, "code"));
      assert(Object.hasOwn(completion.exited, "signal"));
      assert.deepEqual(completion.renderer.tops, ["B_id_boundary"]);
      assert.equal(typeof completion.renderer.root, "string");
      assert.equal(completion.renderer.root, completion.renderer.expected);
      assert.equal(completion.renderer.children, true);
      assert.deepEqual(completion.renderer.complete, ["complete", "complete"]);
      r.completion = completion;
      r.passed = 1;
      r.exitCode = 0;
    } catch (error) {
      r.failed = 1;
      r.error = "Electron exited without a valid completed-query/exited report: " + String(error);
    }
  } else {
    r.failed = 1;
    r.error = String(child.error ?? "Electron exit " + child.status);
  }
  r.artifacts = dir;
} catch (e) {
  r.setupError = String(e);
}
console.log(JSON.stringify(r, null, 2));
process.exitCode = r.exitCode;
