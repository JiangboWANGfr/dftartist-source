import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright";
const web = fileURLToPath(new URL("../", import.meta.url));
const consumer = process.env.HIER_A_DEMO_DELIVERY;
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo");
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
for (const pending of ["picker", "hello"]) {
  test(
    `actual document reload during pending ${pending} revokes old work and allows one fresh Core session`,
    { timeout: 30_000 },
    async (t) => {
      assert(process.env.HIER_BIN, "explicit actual Core executable");
      const electron = await _electron.launch({
        executablePath: binary,
        args: [app],
        env: process.env,
      });
      t.after(() => electron.close());
      const page = await electron.firstWindow(),
        errors = [];
      page.setDefaultTimeout(6000);
      page.on("pageerror", (error) => errors.push(error.message));
      await electron.evaluate(
        ({ dialog, BrowserWindow }, { design, pending }) => {
          if (pending === "picker") {
            dialog.showOpenDialog = () =>
              new Promise((resolve) => {
                globalThis.aReleasePicker = () => resolve({ canceled: false, filePaths: [design] });
              });
          } else {
            dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [design] });
            const frame = BrowserWindow.getAllWindows()[0].webContents.mainFrame,
              send = frame.send;
            let resolve;
            globalThis.aHelloHeld = new Promise((done) => {
              resolve = done;
            });
            const held = [];
            frame.send = function (...args) {
              const event = args[1]?.event;
              if (event?.kind === "frame" && JSON.parse(event.json).event === "hello") {
                held.push(args);
                resolve();
                return;
              }
              return send.apply(this, args);
            };
            globalThis.aReleaseHello = () => {
              frame.send = send;
              for (const args of held) send.apply(frame, args);
              return held.length;
            };
          }
        },
        { design, pending },
      );
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
      await page.waitForSelector(
        `.demo-status[data-phase="${pending === "picker" ? "picking" : "connecting"}"]`,
      );
      if (pending === "hello") await electron.evaluate(() => globalThis.aHelloHeld);
      const old = children(electron.process().pid);
      assert.equal(old.length, pending === "picker" ? 0 : 1);
      await page.reload();
      await page.waitForSelector('.demo-status[data-phase="idle"]');
      if (pending === "picker") await electron.evaluate(() => globalThis.aReleasePicker());
      else
        assert.equal(
          await electron.evaluate(() => globalThis.aReleaseHello()),
          1,
          "one original Core hello was held and released",
        );
      for (let n = 0; n < 200 && children(electron.process().pid).length; n++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.deepEqual(children(electron.process().pid), []);
      for (const pid of old) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
      assert.equal(await page.getByRole("treeitem").count(), 0);
      assert.equal(await page.locator(".demo-status").getAttribute("data-phase"), "idle");
      await page.evaluate(() => {
        window.aPublicationClicks = [];
        document.addEventListener(
          "click",
          (event) => {
            const target = event.target;
            window.aPublicationClicks.push({
              tag: target.tagName,
              text: target.textContent,
              treeitem: target.closest('[role="treeitem"]')?.getAttribute("aria-selected"),
              x: event.clientX,
              y: event.clientY,
            });
          },
          true,
        );
      });
      await electron.evaluate(({ ipcMain }) => {
        globalThis.aPublicationRequests = [];
        ipcMain.on("hier:bridge:send", (_event, body) => {
          const frame = JSON.parse(body.json);
          globalThis.aPublicationRequests.push({ id: frame.id, method: frame.method });
        });
      });
      await electron.evaluate(({ dialog }, design) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [design] });
      }, design);
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
      await page.waitForSelector('.demo-status[data-phase="ready"]');
      await page.getByRole("treeitem").filter({ hasText: "demo_graph_top" }).first().click();
      try {
        await page
          .locator(".demo-source-workspace code")
          .filter({ hasText: "assign y = mid" })
          .waitFor();
      } catch (error) {
        console.log(
          JSON.stringify({
            pending,
            diagnostic: await page.evaluate(() => ({
              phase: document.querySelector(".demo-status")?.outerHTML,
              root: document.querySelector('[role="treeitem"]')?.outerHTML,
              source: document.querySelector(".demo-source-workspace")?.innerText,
              properties: document.querySelector(".demo-right")?.innerText,
              clicks: window.aPublicationClicks,
            })),
            requests: await electron.evaluate(() => globalThis.aPublicationRequests),
          }),
        );
        throw error;
      }
      const current = children(electron.process().pid);
      assert.equal(current.length, 1);
      assert(!old.includes(current[0]));
      await page.getByRole("button", { name: "关闭设计", exact: true }).click();
      await page.waitForSelector('.demo-status[data-phase="idle"]');
      assert.deepEqual(children(electron.process().pid), []);
      assert.throws(() => process.kill(current[0], 0), { code: "ESRCH" });
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ pending, old, current, errors, reloadedAndClosed: true }));
    },
  );
}
