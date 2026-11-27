// Real npm tarball consumer, never a monorepo alias. All writes stay in owned temp.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const product = process.env.HIER_B_PRODUCT_ROOT,
  tools = process.env.HIER_B_BROWSER_TOOLS;
assert.ok(product && tools, "explicit product/tools");
const npm = process.env.HIER_B_NPM_BIN ?? "/opt/homebrew/bin/npm",
  require = createRequire(path.join(tools, "package.json")),
  { build } = require("esbuild"),
  { chromium } = require("playwright");
const temp = await fs.mkdtemp(
    path.join(os.tmpdir(), "hier-b-source-view-package-"),
  ),
  commands = [],
  result = {
    kind: "B SourceView outside tarball gate",
    product,
    temp,
    node: process.version,
    planned: 6,
    executed: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
    exitCode: 0,
    stage: "pack-public-capability",
    commands,
  };
let browser, server, page;
function command(bin, args, cwd) {
  const at = Date.now();
  try {
    const raw = execFileSync(bin, args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: "" },
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    commands.push({
      command: [bin, ...args],
      cwd,
      status: 0,
      milliseconds: Date.now() - at,
      stdout: raw,
    });
    return raw;
  } catch (e) {
    commands.push({
      command: [bin, ...args],
      cwd,
      status: e.status,
      signal: e.signal,
      milliseconds: Date.now() - at,
      stdout: String(e.stdout ?? ""),
      stderr: String(e.stderr ?? ""),
    });
    throw e;
  }
}
async function pack(folder) {
  const raw = command(
      npm,
      ["pack", "--ignore-scripts", "--json", "--pack-destination", temp],
      folder,
    ),
    meta = JSON.parse(raw);
  assert.equal(meta.length, 1);
  return path.join(temp, meta[0].filename);
}
try {
  const viewsTar = await pack(path.join(product, "web/packages/views"));
  const manifest = JSON.parse(
    command("/usr/bin/tar", ["-xOf", viewsTar, "package/package.json"], temp),
  );
  result.packedViews = { file: path.basename(viewsTar), manifest };
  result.stage = "public-package-capability";
  assert.ok(
    manifest.peerDependencies?.react,
    "SourceView React peer is not implemented",
  );
  assert.ok(
    manifest.exports?.["./source-view.css"],
    "public CSS export missing",
  );
  const npmReal = await fs.realpath(npm),
    npmRequire = createRequire(
      path.join(path.dirname(path.dirname(npmReal)), "package.json"),
    ),
    semver = npmRequire("semver"),
    range = manifest.peerDependencies.react;
  for (const version of ["18.3.1", "18.3.2", "18.9.0"])
    assert.equal(
      semver.satisfies(version, range),
      true,
      "React18 range includes " + version,
    );
  for (const version of ["18.3.0", "18.2.0", "19.0.0"])
    assert.equal(
      semver.satisfies(version, range),
      false,
      "React range excludes " + version,
    );
  assert.equal(
    manifest.dependencies?.react,
    undefined,
    "React is peer, not private runtime dependency",
  );
  assert.equal(
    manifest.optionalDependencies?.react,
    undefined,
    "React must not be a private optional runtime",
  );
  const packs = [viewsTar];
  for (const name of ["protocol-types", "client", "viewmodel"])
    packs.push(await pack(path.join(product, "web/packages", name)));
  // A51 build input only: supply the exact new production dependency offline.
  const productRequire = createRequire(path.join(product, "web/package.json"));
  packs.push(
    await pack(
      path.dirname(
        productRequire.resolve("@tanstack/virtual-core/package.json"),
      ),
    ),
  );
  for (const name of [
    "react",
    "react-dom",
    "scheduler",
    "loose-envify",
    "js-tokens",
    "@types/react",
    "@types/react-dom",
    "@types/prop-types",
    "csstype",
  ]) {
    const folder = path.join(tools, "node_modules", name);
    try {
      await fs.access(folder + "/package.json");
      packs.push(await pack(folder));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  let consumer = path.join(temp, "outside consumer 中文");
  await fs.mkdir(consumer);
  consumer = await fs.realpath(consumer);
  await fs.writeFile(
    consumer + "/package.json",
    JSON.stringify({
      name: "b-independent-source-view-consumer",
      version: "0.0.0",
      private: true,
      type: "module",
    }),
  );
  command(
    npm,
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--workspaces=false",
      ...packs,
    ],
    consumer,
  );
  const local = createRequire(consumer + "/package.json");
  assert.equal(local("react/package.json").version, "18.3.1");
  assert.equal(local("react-dom/package.json").version, "18.3.1");
  const viewsFolder = consumer + "/node_modules/@hier/views";
  assert.equal(
    (await fs.lstat(viewsFolder)).isSymbolicLink(),
    false,
    "actual unpacked tarball, not workspace link",
  );
  const entry = consumer + "/app.mjs";
  await fs.writeFile(
    entry,
    'import React from "react";import{createRoot}from"react-dom/client";import{SourceView,VIEWS_PROTOCOL_VERSION}from"@hier/views";import"@hier/views/source-view.css";if(VIEWS_PROTOCOL_VERSION!==2)throw Error("old version constant changed");if(typeof SourceView!=="function")throw Error("missing export");createRoot(document.getElementById("app")).render(React.createElement(SourceView,{state:{status:"idle",target:null},ariaLabel:"B outside package",height:180}));window.B_PACK={react:React.version};',
  );
  result.stage = "outside-package-semantics";
  const bundled = await build({
    absWorkingDir: consumer,
    entryPoints: [entry],
    outdir: consumer + "/out",
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    metafile: true,
  });
  assert.equal(bundled.warnings.length, 0);
  result.stage = "outside-package-semantics";
  const onlyRoot = await build({
    absWorkingDir: consumer,
    stdin: {
      contents: 'export{SourceView}from"@hier/views";',
      resolveDir: consumer,
      sourcefile: "root-probe.mjs",
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    metafile: true,
  });
  const rootInputs = Object.keys(onlyRoot.metafile.inputs).filter(
    (f) => f !== "root-probe.mjs" && !f.endsWith("/root-probe.mjs"),
  );
  for (const f of rootInputs) {
    const real = path.resolve(consumer, f);
    assert.ok(
      real.startsWith(consumer + path.sep),
      "no monorepo/experiment lookup",
    );
    assert.equal(
      /(?:^|\/)node_modules\/(?:react-dom|electron)(?:\/|$)|^node:/.test(f),
      false,
      "no renderer/host imports from views root",
    );
  }
  result.executed++;
  result.passed++; // peer range/public root/browser dependency boundary
  const consumerTs = consumer + "/consumer.ts";
  await fs.writeFile(
    consumerTs,
    'import{SourceView,type SourceViewProps,VIEWS_PROTOCOL_VERSION}from"@hier/views";import type{SourceDocumentState}from"@hier/viewmodel";import type{ReactElement}from"react";declare const state:SourceDocumentState;const props:SourceViewProps={state,ariaLabel:"outside",height:180};const result:ReactElement=SourceView(props);const p:2=VIEWS_PROTOCOL_VERSION;void[result,p];',
  );
  command(
    process.execPath,
    [
      path.join(product, "web/node_modules/typescript/bin/tsc"),
      "--strict",
      "--exactOptionalPropertyTypes",
      "--noEmit",
      "--skipLibCheck",
      "false",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--types",
      "react",
      consumerTs,
    ],
    consumer,
  );
  result.executed++;
  result.passed++; // real published root declarations
  const cssOutputs = bundled.outputFiles.filter((f) => f.path.endsWith(".css"));
  assert.equal(cssOutputs.length, 1);
  assert.ok(cssOutputs[0].contents.length > 0);
  result.executed++;
  result.passed++; // CSS exported, unpacked and bundled
  const npmTree = JSON.parse(
    command(npm, ["ls", "react", "--json", "--all"], consumer),
  );
  result.reactTree = npmTree;
  const reactReal = await fs.realpath(consumer + "/node_modules/react");
  const installed = async (folder) => {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      if (entry.name === ".bin") continue;
      const f = path.join(folder, entry.name);
      if (
        entry.name === "react" &&
        (await fs.readFile(f + "/package.json", "utf8").then(JSON.parse))
          .name === "react"
      ) {
        assert.equal(
          await fs.realpath(f),
          reactReal,
          "one actual React installation",
        );
      }
      if (entry.isDirectory()) {
        if (entry.name.startsWith("@")) await installed(f);
        else {
          try {
            await fs.access(f + "/node_modules");
            await installed(f + "/node_modules");
          } catch (e) {
            if (e.code !== "ENOENT") throw e;
          }
        }
      }
    }
  };
  await installed(consumer + "/node_modules");
  result.executed++;
  result.passed++; // real peer singleton, not aliases
  const assets = new Map(
    bundled.outputFiles.map((f) => ["/" + path.basename(f.path), f.contents]),
  );
  const js = bundled.outputFiles.find((f) => f.path.endsWith(".js"));
  assert.ok(js);
  server = http.createServer((req, res) => {
    const asset = assets.get(req.url);
    if (asset) {
      res.writeHead(200, {
        "Content-Type": req.url.endsWith(".css")
          ? "text/css"
          : "text/javascript",
      });
      res.end(asset);
    } else if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/' +
          path.basename(cssOutputs[0].path) +
          '"><div id="app"></div><script type="module" src="/' +
          path.basename(js.path) +
          '"></script>',
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.waitForFunction(() => window.B_PACK !== undefined);
  await page
    .getByRole("region", { name: "B outside package" })
    .waitFor({ state: "visible" });
  assert.equal(
    await page.getByRole("region", { name: "B outside package" }).count(),
    1,
  );
  assert.ok(
    (await page.getByRole("status").filter({ hasText: "未选择源码" }).count()) >
      0,
  );
  result.executed++;
  result.passed++; // actual external package React DOM render
  const resources = Object.keys(bundled.metafile.inputs).filter((f) =>
    f.includes("node_modules"),
  );
  assert.ok(
    resources.every((f) =>
      path.resolve(consumer, f).startsWith(consumer + path.sep),
    ),
    "published package does not reach product/experiment tree",
  );
  result.executed++;
  result.passed++;
  result.stage = "complete";
} catch (e) {
  result.exitCode = 1;
  result.error = String(e.stack ?? e);
  if (result.stage === "outside-package-semantics") {
    result.executed++;
    result.failed++;
  }
  result.capabilityFailures =
    result.stage === "public-package-capability" ? 1 : 0;
  result.facilityFailure = ![
    "outside-package-semantics",
    "public-package-capability",
  ].includes(result.stage);
  result.blocked = result.planned - result.executed;
} finally {
  const errors = [];
  for (const [name, close] of [
    ["page", () => page?.close()],
    ["browser", () => browser?.close()],
    [
      "server",
      () =>
        server
          ? new Promise((resolve, reject) =>
              server.close((e) => (e ? reject(e) : resolve())),
            )
          : undefined,
    ],
    ["owned-temp", () => fs.rm(temp, { recursive: true, force: true })],
  ])
    try {
      await close();
    } catch (e) {
      errors.push({ name, error: String(e) });
    }
  result.cleanupErrors = errors;
  if (errors.length) result.exitCode = 1;
}
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.exitCode;
