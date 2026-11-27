import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createRequire } from "node:module";
import { writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright";
const web = fileURLToPath(new URL("../", import.meta.url));
const consumer = process.env.HIER_A_DEMO_DELIVERY;
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo");
const binary = createRequire(path.join(consumer ?? web, "package.json"))("electron");
const design = fileURLToPath(new URL("./demo-graph/design.sv", import.meta.url));
function coreChildren(parent) {
  return execFileSync("ps", ["-ax", "-o", "pid=,ppid=,args="], { encoding: "utf8" })
    .split("\n").flatMap((line) => {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      return m && Number(m[2]) === parent &&
        (m[3] === process.env.HIER_BIN || m[3].startsWith(process.env.HIER_BIN + " "))
        ? [Number(m[1])] : [];
    });
}
for (const pickerPending of [false, true]) {
  test(`real Core disconnect releases a native Worker and retries; picker pending=${pickerPending}`, {
    timeout: 30_000,
  }, async () => {
    assert(process.env.HIER_BIN, "explicit actual Core executable");
    const heldName = `a-disconnect-${process.pid}-${pickerPending}.js`;
    const held = path.join(app, "dist", heldName);
    await writeFile(held, "// A-owned native layout Worker leaves its real task pending.\n", { flag: "wx" });
    let electron;
    const errors = [], output = [];
    try {
      electron = await _electron.launch({ executablePath: binary, args: [app], env: process.env });
      electron.process().stdout?.on("data", (value) => output.push(String(value)));
      await electron.evaluate(({ dialog }, input) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
      }, design);
      const page = await electron.firstWindow(); page.setDefaultTimeout(5000);
      page.on("pageerror", (error) => errors.push(error.message));
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
      await page.waitForSelector('.demo-status[data-phase="ready"]');
      await page.getByRole("button", { name: "显示原理图", exact: true }).click();
      await page.getByRole("button", { name: "高级控制", exact: true }).click();
      await page.locator("summary").filter({ hasText: "演示与标注" }).click();
      await page.getByRole("treeitem").first().click();
      await page.getByRole("button", { name: "添加外部示例", exact: true }).click();
      await page.evaluate(({ name, throwCleanup }) => {
        const NativeWorker = window.Worker;
        window.aDisconnectTerminations = 0;
        window.Worker = class extends NativeWorker {
          constructor(_url, options) { super(new URL(name, location.href), options); }
          terminate() {
            super.terminate(); window.aDisconnectTerminations++;
            if (throwCleanup) throw new Error("A disconnected Worker cleanup failure");
          }
        };
      }, { name: heldName, throwCleanup: !pickerPending });
      const schematic = page.getByRole("region", { name: "设计原理图", exact: true });
      await schematic.getByRole("button", { name: "布局", exact: true }).click();
      await schematic.locator('[role="status"]').getByText("pending", { exact: true }).waitFor();
      if (pickerPending) {
        await electron.evaluate(({ dialog }) => {
          dialog.showOpenDialog = () => new Promise((resolve) => {
            globalThis.aDisconnectPicker = () => resolve({ canceled: true, filePaths: [] });
          });
        });
        await page.getByRole("button", { name: "打开设计", exact: true }).click();
        await page.waitForSelector('.demo-status[data-phase="picking"]');
      }
      // OS action is restricted to this Electron parent's one exact Core command.
      const children = coreChildren(electron.process().pid);
      assert.equal(children.length, 1);
      process.kill(children[0], "SIGTERM");
      await page.waitForFunction(() => window.aDisconnectTerminations === 1);
      await page.waitForFunction(() => document.querySelectorAll('[role="treeitem"]').length === 0);
      if (pickerPending) {
        assert.equal(await page.locator(".demo-status").getAttribute("data-phase"), "picking");
        assert.equal(await page.getByRole("button", { name: "打开设计", exact: true }).isEnabled(), false);
        assert(!output.join("").includes('"scope":"renderer","generation":2,"stage":"close"'),
          "renderer does not issue its close before the native picker settles");
        await electron.evaluate(() => { globalThis.aDisconnectPicker(); });
      }
      await page.waitForSelector('.demo-status[data-phase="failed"]');
      const message = await page.locator(".demo-status").innerText();
      assert.match(message, /连接已关闭/);
      assert.doesNotMatch(message, /\bbusy\b/, "cleanup is serialized after the picker");
      if (!pickerPending) assert.match(message, /A disconnected Worker cleanup failure/);
      assert.equal(await page.getByRole("region", { name: "设计信息", exact: true }).count(), 0);
      assert.deepEqual(coreChildren(electron.process().pid), []);
      assert.throws(() => process.kill(children[0], 0), { code: "ESRCH" });
      assert.equal(await page.getByRole("button", { name: "打开设计", exact: true }).isEnabled(), true);
      await electron.evaluate(({ dialog }, input) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
      }, design);
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
      await page.waitForSelector('.demo-status[data-phase="ready"]');
      await page.getByRole("treeitem").first().waitFor();
      const reopened = coreChildren(electron.process().pid);
      assert.equal(reopened.length, 1); assert.notEqual(reopened[0], children[0]);
      await page.getByRole("button", { name: "关闭设计", exact: true }).click();
      await page.waitForSelector('.demo-status[data-phase="idle"]');
      assert.deepEqual(coreChildren(electron.process().pid), []);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ pickerPending, killedOwnedCore: children, reopened, workerTerminations: 1, message, errors }));
    } finally {
      if (electron) await electron.close(); await rm(held);
    }
  });
}
