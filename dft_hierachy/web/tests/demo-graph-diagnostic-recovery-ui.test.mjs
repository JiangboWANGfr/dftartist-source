import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createRequire } from "node:module";
import { writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
    `actual unreadable Worker cleanup diagnostic cannot strand ${action} and permits explicit recovery`,
    { timeout: 30_000 },
    async () => {
      assert(process.env.HIER_BIN, "explicit actual Core executable");
      const name = `a-diagnostic-${process.pid}-${action}.js`,
        file = path.join(app, "dist", name);
      await writeFile(file, "// Native Worker leaves actual layout pending.\n", { flag: "wx" });
      let electron;
      const errors = [];
      try {
        electron = await _electron.launch({
          executablePath: binary,
          args: [app],
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
        const tree = page.getByRole("tree", { name: "设计层级", exact: true });
        await tree.focus();
        await tree.press("Enter");
        await page
          .locator(".demo-source-workspace code")
          .filter({ hasText: "assign y = mid" })
          .waitFor();
        const old = children(electron.process().pid);
        assert.equal(old.length, 1);
        await page.getByRole("button", { name: "显示原理图", exact: true }).click();
        await page.getByRole("button", { name: "高级控制", exact: true }).click();
        await page.locator("summary").filter({ hasText: "演示与标注" }).click();
        await page.getByRole("button", { name: "添加外部示例", exact: true }).click();
        await page.evaluate((name) => {
          const Native = window.Worker;
          window.aDiagnosticNative = Native;
          window.aDiagnosticWorker = { created: 0, terminated: 0, posts: 0, replies: 0 };
          window.Worker = class extends Native {
            constructor(_url, options) {
              super(new URL(name, location.href), options);
              window.aDiagnosticWorker.created++;
              this.addEventListener("message", () => window.aDiagnosticWorker.replies++);
            }
            postMessage(...args) {
              window.aDiagnosticWorker.posts++;
              return super.postMessage(...args);
            }
            terminate() {
              super.terminate();
              window.aDiagnosticWorker.terminated++;
              const fault = { cause: new Error("A readable Worker diagnostic leaf") };
              Object.defineProperty(fault, "message", {
                get() {
                  throw new Error("A unreadable Worker diagnostic message");
                },
              });
              throw fault;
            }
          };
        }, name);
        const schematic = page.getByRole("region", { name: "设计原理图", exact: true });
        await schematic.getByRole("button", { name: "布局", exact: true }).click();
        await schematic.locator('[role="status"]').getByText("pending", { exact: true }).waitFor();
        await page
          .getByRole("button", { name: action === "close" ? "关闭设计" : "打开设计", exact: true })
          .click();
        try {
          await page.waitForSelector('.demo-status[data-phase="failed"]');
        } catch (error) {
          console.log(
            JSON.stringify({
              action,
              diagnostic: await page.evaluate(() => ({
                status: document.querySelector(".demo-status")?.outerHTML,
                toolbar: document.querySelectorAll(".demo-toolbar").length,
                worker: window.aDiagnosticWorker,
              })),
              errors,
              core: children(electron.process().pid),
            }),
          );
          throw error;
        }
        const message = await page.locator(".demo-status").innerText();
        assert.match(message, /无法读取原始显示错误/);
        assert.match(message, /A readable Worker diagnostic leaf/);
        assert.deepEqual(children(electron.process().pid), []);
        assert.throws(() => process.kill(old[0], 0), { code: "ESRCH" });
        const worker = await page.evaluate(() => {
          window.Worker = window.aDiagnosticNative;
          return window.aDiagnosticWorker;
        });
        assert.equal(worker.created, 1);
        assert.equal(worker.terminated, 1);
        assert(worker.posts > 0);
        assert.equal(worker.replies, 0);
        assert.deepEqual(errors, []);
        await page.getByRole("button", { name: "打开设计", exact: true }).click();
        await page.waitForSelector('.demo-status[data-phase="ready"]');
        const fresh = children(electron.process().pid);
        assert.equal(fresh.length, 1);
        assert.notEqual(fresh[0], old[0]);
        await page.getByRole("treeitem").first().waitFor();
        await page.getByRole("button", { name: "关闭设计", exact: true }).click();
        await page.waitForSelector('.demo-status[data-phase="idle"]');
        assert.deepEqual(children(electron.process().pid), []);
        assert.throws(() => process.kill(fresh[0], 0), { code: "ESRCH" });
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ action, old, fresh, worker, message, errors, closed: true }));
      } finally {
        if (electron) await electron.close();
        await rm(file);
      }
    },
  );
