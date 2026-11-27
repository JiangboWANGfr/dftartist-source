import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { _electron } from "playwright";
const web = fileURLToPath(new URL("../", import.meta.url)),
  consumer = process.env.HIER_A_DEMO_DELIVERY;
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo"),
  binary = createRequire(path.join(consumer ?? web, "package.json"))("electron");
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
for (const action of ["close", "replace"])
  test(
    `actual host ${action} waits for original Core exit settlement despite its close adapter throwing`,
    { timeout: 30_000 },
    async () => {
      assert(process.env.HIER_BIN, "explicit actual Core executable");
      const temp = await mkdtemp(path.join(tmpdir(), "hier-a-host-electron-"));
      let electron;
      const errors = [];
      try {
        const hostSource = path.join(app, "src/design-host.ts"),
          limitsSource = path.join(app, "src/resource-limits.ts"),
          dist = path.join(app, "dist");
        // A-only construction harness: unchanged production Host, renderer, preload, SDK and actual Core.
        const code = `import {app,BrowserWindow} from 'electron';import {pathToFileURL} from 'node:url';import {DesignHost} from ${JSON.stringify(hostSource)};import {resourceLimitsFromEnvironment} from ${JSON.stringify(limitsSource)};
   let host,complete=false;app.on('window-all-closed',()=>app.quit());app.on('before-quit',event=>{if(complete)return;event.preventDefault();void(async()=>{try{await host?.shutdown();}catch(error){console.error('A harness shutdown',error);}finally{complete=true;app.quit();}})();});
   void app.whenReady().then(async()=>{const window=new BrowserWindow({show:true,width:1440,height:1000,webPreferences:{preload:${JSON.stringify(path.join(dist, "preload.cjs"))},contextIsolation:true,sandbox:true,nodeIntegration:false}});host=new DesignHost(window,pathToFileURL(${JSON.stringify(path.join(dist, "index.html"))}).href,process.env.HIER_BIN,resourceLimitsFromEnvironment(process.env));globalThis.aHost=host;await window.loadFile(${JSON.stringify(path.join(dist, "index.html"))});});`;
        await build({
          stdin: { contents: code, resolveDir: path.join(app, "src") },
          outfile: path.join(temp, "main.mjs"),
          bundle: true,
          platform: "node",
          format: "esm",
          external: ["electron"],
          target: "node24",
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
        await electron.evaluate(({ dialog }, file) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
        }, design);
        const page = await electron.firstWindow();
        page.setDefaultTimeout(6000);
        page.on("pageerror", (error) => errors.push(error.message));
        await page.getByRole("button", { name: "打开设计", exact: true }).click();
        await page.waitForSelector('.demo-status[data-phase="ready"]');
        await page.getByRole("treeitem").first().waitFor();
        const old = children(electron.process().pid);
        assert.equal(old.length, 1);
        await electron.evaluate(() => {
          const owner = globalThis.aHost.current,
            original = owner.session;
          let release;
          const gate = new Promise((resolve) => {
            release = resolve;
          });
          globalThis.aHostCleanup = { calls: 0, actualExited: false };
          const exited = original.exited.then(async (value) => {
            globalThis.aHostCleanup.actualExited = true;
            await gate;
            return value;
          });
          owner.session = Object.freeze({
            id: original.id,
            exited,
            close() {
              globalThis.aHostCleanup.calls++;
              original.close();
              throw new AggregateError(
                [new Error("A native host close leaf")],
                "A native host close wrapper",
              );
            },
          });
          globalThis.aHostRelease = release;
        });
        await page
          .getByRole("button", { name: action === "close" ? "关闭设计" : "打开设计", exact: true })
          .click();
        for (let n = 0; n < 200; n++) {
          if (await electron.evaluate(() => globalThis.aHostCleanup.actualExited)) break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(
          await electron.evaluate(() => globalThis.aHostCleanup.actualExited),
          true,
          "actual native Core exit observed before releasing its original completion",
        );
        const pending = await page.locator(".demo-status").getAttribute("data-phase");
        console.log(
          JSON.stringify({
            action,
            checkpoint: "before original exit completion delivery",
            phase: pending,
            old,
            nativeCoreRemaining: children(electron.process().pid),
            calls: await electron.evaluate(() => globalThis.aHostCleanup.calls),
            errors,
          }),
        );
        assert.equal(
          pending,
          action === "close" ? "closing" : "opening",
          "do not expose a retryable terminal before original exit completion settles",
        );
        assert.equal(
          await page.getByRole("button", { name: "打开设计", exact: true }).isEnabled(),
          false,
        );
        await electron.evaluate(() => globalThis.aHostRelease());
        await page.waitForSelector('.demo-status[data-phase="failed"]');
        const message = await page.locator(".demo-status").innerText();
        assert.match(message, /A native host close wrapper/);
        assert.match(message, /A native host close leaf/);
        assert.deepEqual(children(electron.process().pid), []);
        assert.equal(await electron.evaluate(() => globalThis.aHostCleanup.calls), 1);
        assert.throws(() => process.kill(old[0], 0), { code: "ESRCH" });
        await page.getByRole("button", { name: "打开设计", exact: true }).click();
        await page.waitForSelector('.demo-status[data-phase="ready"]');
        await page.getByRole("treeitem").first().waitFor();
        const fresh = children(electron.process().pid);
        assert.equal(fresh.length, 1);
        assert.notEqual(fresh[0], old[0]);
        await page.getByRole("button", { name: "关闭设计", exact: true }).click();
        await page.waitForSelector('.demo-status[data-phase="idle"]');
        assert.deepEqual(children(electron.process().pid), []);
        assert.throws(() => process.kill(fresh[0], 0), { code: "ESRCH" });
        assert.deepEqual(errors, []);
        console.log(
          JSON.stringify({ action, old, fresh, message, closeCalls: 1, errors, closed: true }),
        );
      } finally {
        if (electron) {
          await electron.evaluate(() => globalThis.aHostRelease?.()).catch(() => {});
          await electron.close();
        }
        await rm(temp, { recursive: true });
      }
    },
  );
