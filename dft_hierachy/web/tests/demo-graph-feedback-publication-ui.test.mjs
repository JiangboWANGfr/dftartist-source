import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { _electron } from "playwright";
const web = fileURLToPath(new URL("../", import.meta.url)),
  consumer = process.env.HIER_A_DEMO_DELIVERY,
  app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo");
const binary = createRequire(path.join(consumer ?? web, "package.json"))("electron");
const design = fileURLToPath(new URL("./demo-graph/design.sv", import.meta.url));
function children(parent) {
  return execFileSync("ps", ["-ax", "-o", "pid=,ppid=,args="], { encoding: "utf8" })
    .split("\n")
    .flatMap((line) => {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      return m &&
        Number(m[2]) === parent &&
        (m[3] === process.env.HIER_BIN || m[3].startsWith(process.env.HIER_BIN + " "))
        ? [Number(m[1])]
        : [];
    });
}
for (const action of ["clear", "replace", "component-report"])
  test(
    `actual App feedback ${action} during formatting cannot be overwritten by the old path report`,
    { timeout: 30_000 },
    async () => {
      assert(process.env.HIER_BIN, "explicit actual Core executable");
      const temp = await mkdtemp(path.join(tmpdir(), "hier-a-feedback-ui-"));
      let electron;
      const errors = [];
      try {
        const src = await realpath(path.join(app, "src")),
          dist = path.join(app, "dist"),
          html = path.join(temp, "index.html");
        // A-only constructor capture: all lifecycle methods, App markup and business paths are production code.
        await build({
          entryPoints: [path.join(src, "renderer.tsx")],
          outfile: path.join(temp, "renderer.mjs"),
          bundle: true,
          platform: "browser",
          format: "esm",
          target: "es2022",
          jsx: "automatic",
          plugins: [
            {
              name: "a-constructor-capture",
              setup(build) {
                build.onResolve({ filter: /^\.\/design-lifecycle\.js$/ }, (args) =>
                  args.importer === path.join(src, "renderer.tsx")
                    ? { path: "capture", namespace: "a-capture" }
                    : undefined,
                );
                build.onLoad({ filter: /.*/, namespace: "a-capture" }, () => ({
                  loader: "js",
                  resolveDir: src,
                  contents: `import {DesignLifecycle as Base} from ${JSON.stringify(path.join(src, "design-lifecycle.ts"))};export class DesignLifecycle extends Base{constructor(...args){super(...args);window.aFeedbackLifecycle=this;}}`,
                }));
              },
            },
          ],
        });
        await writeFile(
          html,
          '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; worker-src \'self\';"><link rel="stylesheet" href="renderer.css"></head><body><div id="root"></div><script type="module" src="renderer.mjs"></script></body></html>',
        );
        const main = `import {app,BrowserWindow,dialog} from 'electron';import {pathToFileURL} from 'node:url';import {DesignHost} from './design-host.js';import {resourceLimitsFromEnvironment} from './resource-limits.js';let host,done=false;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(design)}]});app.on('window-all-closed',()=>app.quit());app.on('before-quit',event=>{if(done)return;event.preventDefault();void(async()=>{try{await host?.shutdown();}finally{done=true;app.quit();}})();});void app.whenReady().then(async()=>{const window=new BrowserWindow({width:1440,height:1000,webPreferences:{preload:${JSON.stringify(path.join(dist, "preload.cjs"))},contextIsolation:true,sandbox:true,nodeIntegration:false}});host=new DesignHost(window,pathToFileURL(${JSON.stringify(html)}).href,process.env.HIER_BIN,resourceLimitsFromEnvironment(process.env));await window.loadFile(${JSON.stringify(html)});});`;
        await build({
          stdin: { contents: main, resolveDir: src },
          outfile: path.join(temp, "main.mjs"),
          bundle: true,
          platform: "node",
          format: "esm",
          target: "node24",
          external: ["electron"],
        });
        await writeFile(
          path.join(temp, "package.json"),
          JSON.stringify({ main: "main.mjs", type: "module" }),
        );
        electron = await _electron.launch({
          executablePath: binary,
          args: [temp],
          env: process.env,
        });
        const page = await electron.firstWindow();
        page.setDefaultTimeout(6000);
        page.on("pageerror", (error) => errors.push(error.message));
        await electron.evaluate(async ({ BrowserWindow }) => {
          const web = BrowserWindow.getAllWindows()[0].webContents;
          if (web.isLoadingMainFrame())
            await new Promise((resolve) => web.once("did-finish-load", resolve));
        });
        await page.getByRole("button", { name: "打开设计", exact: true }).click();
        await page.waitForSelector('.demo-status[data-phase="ready"]');
        await page.getByRole("treeitem").first().waitFor();
        const pid = children(electron.process().pid);
        assert.equal(pid.length, 1);
        const rootName = await page.evaluate(async (action) => {
          const lifecycle = window.aFeedbackLifecycle,
            p = lifecycle.getSnapshot().active.panels,
            root = (await p.client.roots()).result[0];
          let cause;
          try {
            await p.client.object("invalid-reference");
          } catch (error) {
            cause = error;
          }
          const original = p.client.resolvePath.bind(p.client);
          let first = true,
            acted = false;
          const failure = new Error("A obsolete UI path feedback", { cause });
          Object.defineProperty(failure, "message", {
            get() {
              if (!acted) {
                acted = true;
                window.aFeedbackActed = true;
                if (action === "clear") window.aFeedbackNext = p.resolution.clear();
                else if (action === "replace") window.aFeedbackNext = p.resolvePath(root.name);
                else p.onCommandError({ error: new Error("A newer UI component report") });
              }
              return "A obsolete UI path feedback";
            },
          });
          p.client.resolvePath = async (...args) => {
            const reply = await original(...args);
            if (first) {
              first = false;
              throw failure;
            }
            return reply;
          };
          return root.name;
        }, action);
        await page.getByRole("textbox", { name: "路径", exact: true }).fill(rootName);
        await page.getByRole("button", { name: "定位", exact: true }).click();
        await page.waitForFunction(() => window.aFeedbackActed === true);
        await page.evaluate(() => window.aFeedbackNext);
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const notices = await page.locator(".demo-operation-notice").allTextContents();
        console.log(
          JSON.stringify({ action, checkpoint: "after diagnostic intent", notices, errors }),
        );
        if (action === "component-report")
          assert.match(notices.join("\n"), /A newer UI component report/);
        else assert.deepEqual(notices, []);
        assert.doesNotMatch(notices.join("\n"), /A obsolete UI path feedback/);
        assert.deepEqual(errors, []);
        // A real Core syntax rejection remains visible; a later ordinary success preserves that history.
        await page.getByRole("textbox", { name: "路径", exact: true }).fill("[");
        await page.getByRole("button", { name: "定位", exact: true }).click();
        await page.locator(".demo-operation-notice").filter({ hasText: "bad_request" }).waitFor();
        const current = await page.locator(".demo-operation-notice").innerText();
        await page.getByRole("textbox", { name: "路径", exact: true }).fill(rootName);
        await page.getByRole("button", { name: "定位", exact: true }).click();
        await page.waitForFunction(
          () =>
            window.aFeedbackLifecycle.getSnapshot().active.panels.resolution.state.status ===
            "success",
        );
        assert.equal(await page.locator(".demo-operation-notice").innerText(), current);
        await page.getByRole("button", { name: "关闭操作提示", exact: true }).click();
        assert.equal(await page.locator(".demo-operation-notice").count(), 0);
        assert.equal(
          await page
            .getByRole("status", { name: "设计状态", exact: true })
            .evaluate((e) => e === document.activeElement),
          true,
        );
        await page.getByRole("button", { name: "关闭设计", exact: true }).click();
        await page.waitForSelector('.demo-status[data-phase="idle"]');
        assert.deepEqual(children(electron.process().pid), []);
        assert.throws(() => process.kill(pid[0], 0), { code: "ESRCH" });
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ action, pid, errors, closed: true }));
      } finally {
        if (electron) await electron.close();
        await rm(temp, { recursive: true });
      }
    },
  );
