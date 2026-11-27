// B runner: existing isolated React/Playwright tools; one capability failure is not N semantic failures.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { cases, packageCases } from "./cases.mjs";
import { coreBridge } from "../independent-tree-view/ui/core-bridge.mjs";
const bounded = async (p, label) => {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("B test watchdog, not product SLA: " + label)),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify({ planned: cases.length, cases, packageCases }, null, 2),
  );
else {
  const coreControl = process.argv.includes("--core-control"),
    controls = process.argv.includes("--controls") || coreControl,
    r = {
      kind: controls
        ? coreControl
          ? "B66-Core-model-fixture-control"
          : "B66-real-model-fixture-controls"
        : "B66-definition-instances-view-DOM",
      planned: controls ? 1 : cases.length,
      executed: 0,
      passed: 0,
      failed: 0,
      blocked: controls ? 1 : cases.length,
      skipped: 0,
      stage: "setup",
      results: [],
      setupError: null,
      cleanupErrors: [],
      exitCode: 1,
    };
  let server, browser, bridge, port;
  try {
    const P = process.env.HIER_B_PRODUCT_ROOT,
      T = process.env.HIER_B_BROWSER_TOOLS;
    assert(
      P && T && path.isAbsolute(P) && path.isAbsolute(T),
      "explicit fixed absolute product/tools",
    );
    r.product = P;
    r.fixed = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: P,
      encoding: "utf8",
    }).trim();
    const require = createRequire(T + "/package.json"),
      { build } = require("esbuild"),
      { chromium } = require("playwright");
    for (const [n, v] of [
      ["react", "18.3.1"],
      ["react-dom", "18.3.1"],
      ["esbuild", "0.25.11"],
      ["playwright", "1.64.1"],
    ])
      assert.equal(require(n + "/package.json").version, v);
    const alias = Object.fromEntries(
      ["views", "viewmodel", "client", "protocol-types"].map((n) => [
        "@hier/" + n,
        P + "/web/packages/" + n + "/dist/index.js",
      ]),
    );
    for (const n of ["react", "react-dom"])
      alias[n] = path.dirname(require.resolve(n + "/package.json"));
    const built = await build({
      entryPoints: [path.join(import.meta.dirname, "fixture.jsx")],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
      metafile: true,
      alias,
      nodePaths: [T + "/node_modules"],
      define: { "process.env.NODE_ENV": '"development"' },
    });
    assert.deepEqual(built.warnings, []);
    r.buildWarnings = [];
    r.bundleSha256 = createHash("sha256")
      .update(built.outputFiles[0].contents)
      .digest("hex");
    let css = Buffer.alloc(0);
    try {
      const url = execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          'console.log(import.meta.resolve("@hier/views/definition-instances-view.css"))',
        ],
        {
          cwd: P + "/web",
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      ).trim();
      r.css = fileURLToPath(url);
      css = fs.readFileSync(r.css);
    } catch (e) {
      r.css = null;
      r.cssCapabilityError = {
        status: e.status,
        stderr: String(e.stderr ?? e),
      };
    }
    bridge = await coreBridge(P);
    server = http.createServer(async (req, res) => {
      try {
        if (await bridge.route(req, res)) return;
        if (req.url === "/app.js") {
          res.setHeader("Content-Type", "text/javascript");
          res.end(built.outputFiles[0].contents);
        } else if (req.url === "/style.css") {
          res.setHeader("Content-Type", "text/css");
          res.end(css);
        } else {
          res.setHeader("Content-Type", "text/html");
          res.end(
            '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>body{margin:0}#A,#B{width:680px;margin:12px}</style><input id="before" aria-label="B external before"><div id="A"></div><div id="B"></div><input id="after" aria-label="B external after"><script type="module" src="/app.js"></script>',
          );
        }
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
      }
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    port = server.address().port;
    browser = await chromium.launch({ headless: true });
    r.browser = browser.version();
    async function page() {
      const p = await browser.newPage({
        viewport: { width: 1100, height: 950 },
      });
      p.setDefaultTimeout(12000);
      await p.goto("http://127.0.0.1:" + port);
      await p.waitForFunction(() => window.BPanel !== undefined);
      return p;
    }
    async function cleanup(p) {
      try {
        return await bounded(
          p.evaluate(() => window.BPanel.cleanup()),
          "page cleanup",
        );
      } finally {
        await p.close();
      }
    }
    if (!controls) {
      r.stage = "public-component-capability";
      const p = await page();
      try {
        assert.equal(
          await p.evaluate(() => window.BPanel.capable),
          true,
          "missing production @hier/views DefinitionInstancesView",
        );
        assert.equal(
          typeof r.css,
          "string",
          "missing public DefinitionInstancesView CSS",
        );
      } finally {
        await p.close();
      }
    }
    r.stage = controls ? "real-model-fixture-controls" : "semantic-DOM";
    for (const c of controls
      ? [
          {
            id: coreControl
              ? "DIV-FIXTURE-Core-model"
              : "DIV-FIXTURE-real-models",
          },
        ]
      : cases) {
      const p = await page();
      let error = null,
        clean = null;
      try {
        if (controls)
          assert.equal(
            (
              await bounded(
                p.evaluate((real) => window.BPanel.control(real), coreControl),
                c.id,
              )
            ).pass,
            true,
          );
        else {
          const result = await bounded(
            p.evaluate((id) => window.BPanel.run(id), c.id),
            c.id,
          );
          if (result.native) {
            const n = result.native;
            if (n.kind === "Tab") {
              await p.keyboard.press("Tab");
              assert.equal(
                (await p.evaluate(() => window.BPanel.verify())).pass,
                true,
              );
              for (let i = 0; i < n.tabCount; i++)
                await p.keyboard.press("Tab");
              assert.equal(
                (await p.evaluate(() => window.BPanel.verify("exit"))).pass,
                true,
              );
            } else if (n.kind === "pointer-target") {
              await p.mouse.move(n.x, n.y);
              await p.mouse.down();
              await bounded(
                p.evaluate(() => window.BPanel.between()),
                c.id + " state transition",
              );
              await p.mouse.up();
              assert.equal(
                (await p.evaluate(() => window.BPanel.verify())).pass,
                true,
              );
            } else {
              const key =
                n.kind === "Space"
                  ? "Space"
                  : n.kind === "Enter"
                    ? "Enter"
                    : null;
              if (key) await p.keyboard.press(key);
              else {
                const mods = n.kind.startsWith("Control")
                  ? ["Control"]
                  : n.kind.startsWith("Shift")
                    ? ["Shift"]
                    : [];
                for (const mod of mods) await p.keyboard.down(mod);
                try {
                  await p.mouse.click(n.x, n.y, {
                    button: n.kind.includes("right") ? "right" : "left",
                  });
                } finally {
                  for (const mod of mods.reverse()) await p.keyboard.up(mod);
                }
              }
              assert.equal(
                (await p.evaluate(() => window.BPanel.verify())).pass,
                true,
              );
            }
          }
        }
      } catch (e) {
        error = String(e.stack ?? e);
      } finally {
        try {
          clean = await cleanup(p);
          if (clean.errors.length || !clean.allWireListenersReleased)
            error ??= JSON.stringify(clean);
        } catch (e) {
          error ??= String(e.stack ?? e);
        }
      }
      r.executed++;
      r.blocked--;
      if (error) r.failed++;
      else r.passed++;
      r.results.push({ id: c.id, pass: error === null, error, cleanup: clean });
    }
    r.exitCode = r.failed ? 1 : 0;
  } catch (e) {
    r.setupError = String(e.stack ?? e);
  } finally {
    if (browser)
      try {
        await bounded(browser.close(), "browser close");
        r.browserDisconnected = !browser.isConnected();
      } catch (e) {
        r.cleanupErrors.push(String(e));
      }
    if (bridge)
      try {
        await bounded(bridge.close(), "Core bridge close");
      } catch (e) {
        r.cleanupErrors.push(String(e));
      }
    if (bridge) r.coreSessions = bridge.summary();
    if (server)
      try {
        await bounded(
          new Promise((resolve, reject) =>
            server.close((e) => (e ? reject(e) : resolve())),
          ),
          "server close",
        );
        r.serverStopped = !server.listening;
      } catch (e) {
        r.cleanupErrors.push(String(e));
        server.closeAllConnections();
      }
    if (port)
      try {
        const probe = http.createServer();
        await new Promise((resolve, reject) => {
          probe.once("error", reject);
          probe.listen(port, "127.0.0.1", resolve);
        });
        await new Promise((resolve) => probe.close(resolve));
        r.portRebound = true;
      } catch (e) {
        r.cleanupErrors.push(String(e));
      }
    if (r.cleanupErrors.length) r.exitCode = 1;
  }
  console.log(JSON.stringify(r, null, 2));
  process.exitCode = r.exitCode;
}
