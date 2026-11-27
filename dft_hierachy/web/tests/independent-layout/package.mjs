// One finite outside-tarball/native-Worker/CSP chain. Existing npm/esbuild/Playwright tools.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { capability, using } from "./harness.mjs";
import { X, Y, edge, fragment } from "../independent-graph-session/input.mjs";
import { packageCase } from "./cases.mjs";
const product = process.env.HIER_B_PRODUCT_ROOT,
  tools = process.env.HIER_B_BROWSER_TOOLS;
const report = {
  ...packageCase,
  planned: 1,
  executed: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  semanticExecuted: 0,
  stage: "public-capability",
  commands: [],
  exitCode: 1,
};
let temp, browser, page, server;
const sha = (b) => createHash("sha256").update(b).digest("hex");
function command(bin, args, cwd) {
  const start = Date.now();
  try {
    const stdout = execFileSync(bin, args, {
      cwd,
      env: { ...process.env, NODE_PATH: "" },
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 16 * 1024 * 1024,
    });
    report.commands.push({
      command: [bin, ...args],
      cwd,
      exit: 0,
      milliseconds: Date.now() - start,
      stdout,
    });
    return stdout;
  } catch (e) {
    report.commands.push({
      command: [bin, ...args],
      cwd,
      exit: e.status,
      signal: e.signal,
      stdout: String(e.stdout ?? ""),
      stderr: String(e.stderr ?? ""),
    });
    throw e;
  }
}
try {
  capability(); // Fails honestly on current no-LayoutService baseline, before browser/tools startup.
  assert(product && tools, "explicit product/tools");
  const req = createRequire(path.join(tools, "package.json")),
    { build } = req("esbuild"),
    { chromium } = req("playwright");
  const npm = process.env.HIER_B_NPM_BIN ?? "/opt/homebrew/bin/npm";
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "hier-b-layout-package-"));
  report.temp = temp;
  report.stage = "outside-pack-install";
  const pack = (folder) => {
    const rows = JSON.parse(
      command(npm, ["pack", "--ignore-scripts", "--json", "--pack-destination", temp], folder),
    );
    assert.equal(rows.length, 1);
    return path.join(temp, rows[0].filename);
  };
  const packs = [];
  for (const name of ["protocol-types", "client", "viewmodel"])
    packs.push(pack(product + "/web/packages/" + name));
  const productRequire = createRequire(product + "/web/package.json");
  const elkFolder = path.dirname(productRequire.resolve("elkjs/package.json"));
  const elk = JSON.parse(await fs.readFile(elkFolder + "/package.json", "utf8"));
  assert.equal(elk.version, "0.12.0", "pinned native API/Worker release");
  packs.push(pack(elkFolder));
  const consumer = await fs.mkdtemp(path.join(temp, "outside-consumer-"));
  await fs.writeFile(
    consumer + "/package.json",
    JSON.stringify({ name: "b-layout-outside", version: "0.0.0", private: true, type: "module" }),
  );
  command(
    npm,
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--workspaces=false",
      ...packs,
    ],
    consumer,
  );
  for (const name of ["protocol-types", "client", "viewmodel"])
    assert.equal(
      (await fs.lstat(consumer + "/node_modules/@hier/" + name)).isSymbolicLink(),
      false,
    );
  const local = createRequire(consumer + "/package.json");
  const vmFolder = consumer + "/node_modules/@hier/viewmodel",
    files = [];
  async function walk(dir) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) await walk(f);
      else files.push(f);
    }
  }
  await walk(vmFolder);
  const assets = files.filter((f) => f.endsWith("/elk-worker.min.js"));
  assert.equal(assets.length, 1, "one shipped native Worker asset");
  const worker = await fs.readFile(assets[0]),
    original = await fs.readFile(elkFolder + "/lib/elk-worker.min.js");
  assert.equal(sha(worker), sha(original), "unmodified pinned worker bytes");
  const license = await fs.readFile(elkFolder + "/LICENSE.md");
  let licenseFound = false;
  for (const f of files.filter((f) => /licen[sc]e|notice/i.test(path.basename(f))))
    if ((await fs.readFile(f)).includes(license)) licenseFound = true;
  assert(licenseFound, "ELK license/copyright travels with the shipped Worker");
  report.workerAsset = {
    file: path.relative(vmFolder, assets[0]),
    bytes: worker.length,
    sha256: sha(worker),
    elk: elk.version,
  };
  const entry = consumer + "/app.mjs";
  await fs.copyFile(fileURLToPath(new URL("./browser-entry.mjs", import.meta.url)), entry);
  const bundle = await build({
    absWorkingDir: consumer,
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    format: "esm",
    platform: "browser",
    outfile: consumer + "/app.js",
    logLevel: "silent",
  });
  assert.deepEqual(bundle.warnings, []);
  for (const file of Object.keys(bundle.metafile.inputs))
    assert(
      path.resolve(consumer, file).startsWith(consumer + path.sep),
      "no monorepo aliases/source lookup",
    );
  // A real unpacked root must also import in a Node realm without any Worker global.
  command(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import assert from "node:assert/strict";delete globalThis.Worker;const m=await import("@hier/viewmodel");assert.equal(typeof m.LayoutService,"function");assert.equal(typeof m.LayoutError,"function");',
    ],
    consumer,
  );
  const fixture = await using({ after() {} }, async (c) => ({
    snapshot: c.client.snapshot,
    fragment: fragment(c, [X(), Y()], [edge(), edge("B-parallel", "B-other-fact")]),
  }));
  const bytes = bundle.outputFiles[0].contents;
  const requested = [];
  server = http.createServer((request, response) => {
    requested.push(request.url);
    const headers = {
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'",
      "X-Content-Type-Options": "nosniff",
    };
    if (request.url === "/") {
      response.writeHead(200, { ...headers, "Content-Type": "text/html" });
      response.end(
        '<!doctype html><meta charset="utf-8"><script type="module" src="/app.js"></script>',
      );
    } else if (request.url === "/fixture.json") {
      response.writeHead(200, { ...headers, "Content-Type": "application/json" });
      response.end(JSON.stringify(fixture));
    } else if (request.url === "/app.js") {
      response.writeHead(200, { ...headers, "Content-Type": "text/javascript" });
      response.end(bytes);
    } else if (request.url === "/worker.js") {
      response.writeHead(200, { ...headers, "Content-Type": "text/javascript" });
      response.end(worker);
    } else if (request.url === "/stall-worker.js") {
      response.writeHead(200, { ...headers, "Content-Type": "text/javascript" });
      response.end("self.onmessage=()=>{};");
    } else if (request.url === "/crash-worker.js") {
      response.writeHead(200, { ...headers, "Content-Type": "text/javascript" });
      response.end('throw Error("B native Worker crash");');
    } else {
      response.writeHead(404, headers);
      response.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  report.stage = "native-browser-worker";
  report.semanticExecuted = 1;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.waitForFunction(() => window.B_LAYOUT !== undefined, {}, { timeout: 15000 });
  report.native = await page.evaluate(async () => {
    let timer;
    try {
      return await Promise.race([
        window.B_LAYOUT.run(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error("B P01 test safety watchdog")), 20000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  });
  assert.equal(report.native.passed, true);
  assert.equal(report.native.native, true);
  assert.deepEqual(pageErrors, []);
  for (const url of ["/worker.js", "/missing-worker.js", "/crash-worker.js", "/stall-worker.js"])
    assert(requested.includes(url), "actual browser resource " + url);
  report.requested = requested;
  report.stage = "complete";
  report.passed = 1;
  report.exitCode = 0;
} catch (e) {
  report.failed = 1;
  report.error = String(e.stack ?? e);
  report.capabilityFailure = report.stage === "public-capability";
} finally {
  report.executed = 1;
  const errors = [];
  for (const [name, close] of [
    ["page", () => page?.close()],
    ["browser", () => browser?.close()],
    [
      "server",
      () =>
        server
          ? new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
          : undefined,
    ],
  ])
    try {
      await close();
    } catch (e) {
      errors.push({ name, error: String(e) });
    }
  // Owned artifacts are retained for a failed chain; successful scratch directories can be reclaimed.
  if (temp && report.exitCode === 0)
    try {
      await fs.rm(temp, { recursive: true, force: true });
    } catch (e) {
      errors.push({ name: "owned-temp", error: String(e) });
    }
  report.cleanupErrors = errors;
  if (errors.length) report.exitCode = 1;
}
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.exitCode;
