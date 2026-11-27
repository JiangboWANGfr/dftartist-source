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
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo");
const binary = createRequire(path.join(consumer ?? web, "package.json"))("electron");
const design = fileURLToPath(new URL("./demo-graph/hierarchy.sv", import.meta.url));
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
for (const fault of ["nested", "unreadable", "clear-during-diagnostic"])
  test(
    `actual GraphWorkspace grouping preserves ${fault} and permits explicit regrouping`,
    { timeout: 30_000 },
    async () => {
      assert(process.env.HIER_BIN, "explicit actual Core executable");
      const temp = await mkdtemp(path.join(tmpdir(), "hier-a-group-ui-"));
      let electron;
      const errors = [];
      try {
        const src = path.join(app, "src"),
          dist = path.join(app, "dist");
        const renderer = `import React from 'react';import {createRoot} from 'react-dom/client';import {HierClient} from '@hier/client';import {connectElectronTransport} from '@hier/client/electron/renderer';import {DesignPanels} from './design-panels.js';import {GraphWorkspace} from './graph-workspace.js';import '@hier/views/schematic-view.css';import './style.css';
       window.aGroupStart=async()=>{const choice=(await window.hierDemo.pickDesign({kind:'source',top:'demo_fold_top'})).value;const session=(await window.hierDemo.openDesign(choice.token)).value;
       const transport=await connectElectronTransport(window.hierBridge),client=new HierClient(transport);await client.ready;const diagnostics=await client.diagnostics();if(diagnostics.result.errorCount)throw new Error('A fixture compilation');
       const panels=new DesignPanels(client,error=>console.error('A harness panel command',error));const top=(await client.roots()).result.find(x=>x.name==='demo_fold_top');const port=(await client.ports(top.ref)).result.find(x=>x.name==='y');const traceRequest={start:{slice:{ref:port.ref,bits:{lsb:0,width:4}},side:'inside'},direction:'back',policy:'combinational',budget:{maxNodes:100,maxEdges:200,maxDepth:20,maxMillis:1000}};await panels.loadTrace(traceRequest);window.aGroupRegenerate=()=>panels.loadTrace(traceRequest);
       const original=panels.designGraph.instanceGroups.bind(panels.designGraph);window.aGroupFault=${JSON.stringify(fault)};window.aGroupCalls=0;
       panels.designGraph.instanceGroups=async(...args)=>{const groups=await original(...args);window.aGroupCalls++;const mode=window.aGroupFault;if(mode==='hold'){window.aGroupHeldSignal=args[1];window.aGroupArrived=true;await new Promise(resolve=>window.aGroupRelease=resolve);return groups;}if(mode==='none')return groups;
        if(mode==='nested')throw new AggregateError([new Error('A grouping readable leaf')],'A grouping wrapper',{cause:new Error('A grouping explicit cause')});
        const error=new Error('A grouping original');if(mode==='unreadable'){Object.defineProperty(error,'message',{get(){throw new Error('A grouping message inspection');}});error.cause=new Error('A grouping readable leaf');}
        else Object.defineProperty(error,'message',{get(){[...document.querySelectorAll('button')].find(b=>b.textContent==='使用追踪显示组').click();window.aGroupReset=true;return 'A obsolete grouping diagnostic';}});throw error;};
       const root=createRoot(document.getElementById('root'));root.render(React.createElement(GraphWorkspace,{panels}));window.aGroupUnmount=()=>root.render(null);window.aGroupMount=()=>root.render(React.createElement(GraphWorkspace,{panels}));window.aGroupCleanup=async()=>{root.unmount();panels.dispose();client.dispose();const reply=await window.hierDemo.closeDesign(session.sessionId);if(!reply.ok)throw reply.error;};window.aGroupReady=true;};`;
        await build({
          stdin: { contents: renderer, resolveDir: src, loader: "tsx" },
          outfile: path.join(temp, "renderer.mjs"),
          bundle: true,
          platform: "browser",
          format: "esm",
          target: "es2022",
          jsx: "automatic",
        });
        const html = path.join(temp, "index.html");
        await writeFile(
          html,
          '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; worker-src \'self\';"><link rel="stylesheet" href="renderer.css"></head><body><main id="root" style="height:900px;display:flex"></main><script type="module" src="renderer.mjs"></script></body></html>',
        );
        const main = `import {app,BrowserWindow,dialog} from 'electron';import {pathToFileURL} from 'node:url';import {DesignHost} from './design-host.js';import {resourceLimitsFromEnvironment} from './resource-limits.js';let host,done=false;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(design)}]});app.on('window-all-closed',()=>app.quit());app.on('before-quit',event=>{if(done)return;event.preventDefault();void(async()=>{try{await host?.shutdown();}finally{done=true;app.quit();}})();});void app.whenReady().then(async()=>{const window=new BrowserWindow({width:1440,height:1000,webPreferences:{preload:${JSON.stringify(path.join(dist, "preload.cjs"))},contextIsolation:true,sandbox:true,nodeIntegration:false}});host=new DesignHost(window,pathToFileURL(${JSON.stringify(html)}).href,process.env.HIER_BIN,resourceLimitsFromEnvironment(process.env));await window.loadFile(${JSON.stringify(html)});});`;
        await build({
          stdin: { contents: main, resolveDir: src },
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
        const page = await electron.firstWindow();
        page.setDefaultTimeout(6000);
        page.on("pageerror", (error) => errors.push(error.message));
        await page.waitForFunction(() => typeof window.aGroupStart === "function");
        await electron.evaluate(async ({ BrowserWindow }) => {
          const web = BrowserWindow.getAllWindows()[0].webContents;
          if (web.isLoadingMainFrame())
            await new Promise((resolve) => web.once("did-finish-load", resolve));
        });
        await page.evaluate(() => window.aGroupStart());
        try {
          await page.waitForFunction(() => window.aGroupReady);
        } catch (error) {
          console.log(JSON.stringify({ fault, checkpoint: "harness readiness", errors }));
          throw error;
        }
        const pid = children(electron.process().pid);
        assert.equal(pid.length, 1);
        await page.getByRole("button", { name: "高级控制", exact: true }).click();
        await page.locator("summary").filter({ hasText: "分组与折叠" }).click();
        await page.getByRole("button", { name: "按所属实例分组", exact: true }).click();
        try {
          if (fault === "clear-during-diagnostic") {
            await page.waitForFunction(() => window.aGroupReset === true);
            await page.evaluate(() => new Promise(requestAnimationFrame));
            assert.equal(
              await page.locator(".demo-graph > output").count(),
              0,
              "explicit clear remains authoritative after formatting reenters",
            );
          } else {
            await page
              .locator(".demo-graph > output")
              .filter({ hasText: "分组查询：failed" })
              .waitFor();
            const text = await page.locator(".demo-graph > output").innerText();
            assert.match(text, /A grouping readable leaf/);
            if (fault === "nested") assert.match(text, /A grouping explicit cause/);
            else assert.match(text, /无法读取原始显示错误/);
          }
          assert.deepEqual(errors, []);
          await page.evaluate(() => {
            window.aGroupFault = "none";
          });
          await page.getByRole("button", { name: "按所属实例分组", exact: true }).click();
          await page
            .locator(".demo-graph > output")
            .filter({ hasText: "分组查询：success" })
            .waitFor();
          assert.equal(
            await page.getByRole("region", { name: "折叠分组", exact: true }).count(),
            1,
          );
          assert.deepEqual(children(electron.process().pid), pid);
          const calls = await page.evaluate(() => window.aGroupCalls);
          assert.equal(calls, 2);
          if (fault === "nested") {
            await page
              .getByRole("button", { name: /^折叠 hierarchy 实例 / })
              .first()
              .click();
            const beginHeld = async () => {
              await page.evaluate(() => {
                window.aGroupFault = "hold";
                window.aGroupArrived = false;
              });
              await page.getByRole("button", { name: "按所属实例分组", exact: true }).click();
              await page.waitForFunction(() => window.aGroupArrived);
              await page
                .locator(".demo-graph > output")
                .filter({ hasText: "分组查询：pending" })
                .waitFor();
            };
            const release = async () => {
              await page.evaluate(() => window.aGroupRelease());
              await page.evaluate(() => new Promise(requestAnimationFrame));
            };
            await beginHeld();
            await page.getByRole("button", { name: "取消分组查询", exact: true }).click();
            assert.equal(await page.evaluate(() => window.aGroupHeldSignal.aborted), true);
            await release();
            assert.match(
              await page.locator(".demo-graph > output").innerText(),
              /分组查询：cancelled/,
            );
            assert.equal(
              await page.getByRole("button", { name: /^展开 hierarchy 实例 / }).count(),
              1,
            );
            await beginHeld();
            await page.getByRole("button", { name: "清除追踪", exact: true }).click();
            await page.waitForFunction(() => window.aGroupHeldSignal.aborted);
            await release();
            assert.equal(await page.locator(".demo-graph > output").count(), 0);
            await page.evaluate(() => window.aGroupRegenerate());
            await beginHeld();
            await page.evaluate(() => window.aGroupUnmount());
            await page.locator(".demo-graph").waitFor({ state: "detached" });
            assert.equal(await page.evaluate(() => window.aGroupHeldSignal.aborted), true);
            await release();
            await page.evaluate(() => window.aGroupMount());
            await page.locator(".demo-graph").waitFor();
            assert.equal(await page.locator(".demo-graph > output").count(), 0);
            assert.equal(
              await page.evaluate(() => window.aGroupCalls),
              5,
              "remount never starts a grouping lookup",
            );
            await page.getByRole("button", { name: "高级控制", exact: true }).click();
            await page.locator("summary").filter({ hasText: "分组与折叠" }).click();
            await page.evaluate(() => {
              window.aGroupFault = "none";
            });
            await page.getByRole("button", { name: "按所属实例分组", exact: true }).click();
            await page
              .locator(".demo-graph > output")
              .filter({ hasText: "分组查询：success" })
              .waitFor();
            assert.equal(await page.evaluate(() => window.aGroupCalls), 6);
            assert.equal(
              await page.getByRole("button", { name: /^折叠 hierarchy 实例 / }).count(),
              3,
            );
          }
          const finalCalls = await page.evaluate(() => window.aGroupCalls);
          await page.evaluate(() => window.aGroupCleanup());
          assert.deepEqual(children(electron.process().pid), []);
          assert.throws(() => process.kill(pid[0], 0), { code: "ESRCH" });
          assert.deepEqual(errors, []);
          console.log(JSON.stringify({ fault, calls: finalCalls, pid, errors, closed: true }));
        } catch (error) {
          console.log(
            JSON.stringify({
              fault,
              outputs: await page.locator(".demo-graph > output").allTextContents(),
              errors,
              calls: await page.evaluate(() => window.aGroupCalls),
            }),
          );
          throw error;
        }
      } finally {
        if (electron) {
          await (
            await electron.firstWindow()
          )
            .evaluate(() => window.aGroupCleanup?.())
            .catch(() => {});
          await electron.close();
        }
        await rm(temp, { recursive: true });
      }
    },
  );
