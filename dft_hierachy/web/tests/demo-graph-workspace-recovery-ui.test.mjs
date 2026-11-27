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
for (const picker of ["none", "cancel", "replace"]) {
  test(
    `actual workspace render failure releases native Worker and Core; picker=${picker}`,
    { timeout: 30_000 },
    async () => {
      assert(process.env.HIER_BIN, "explicit actual Core executable");
      const heldName = `a-workspace-${process.pid}-${picker}.js`,
        held = path.join(app, "dist", heldName);
      await writeFile(held, "// A-owned native Worker retains its pending layout task.\n", {
        flag: "wx",
      });
      let electron;
      const errors = [],
        output = [];
      try {
        electron = await _electron.launch({
          executablePath: binary,
          args: [app],
          env: process.env,
        });
        electron.process().stdout?.on("data", (value) => output.push(String(value)));
        await electron.evaluate(({ dialog }, design) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [design] });
        }, design);
        const page = await electron.firstWindow();
        page.setDefaultTimeout(6000);
        page.on("pageerror", (error) => errors.push(error.message));
        await page.getByRole("button", { name: "打开设计", exact: true }).click();
        await page.waitForSelector('.demo-status[data-phase="ready"]');
        const tree = page.getByRole("treeitem").first();
        await tree.waitFor();
        await page.getByRole("tree", { name: "设计层级", exact: true }).focus();
        await page.getByRole("tree", { name: "设计层级", exact: true }).press("Enter");
        await page
          .locator(".demo-source-workspace code")
          .filter({ hasText: "assign y = mid" })
          .waitFor();
        const old = coreChildren(electron.process().pid);
        assert.equal(old.length, 1);
        await page.getByRole("button", { name: "显示原理图", exact: true }).click();
        await page.getByRole("button", { name: "高级控制", exact: true }).click();
        await page.locator("summary").filter({ hasText: "演示与标注" }).click();
        await page.getByRole("button", { name: "添加外部示例", exact: true }).click();
        await page.evaluate(
          ({ name, throwCleanup }) => {
            const NativeWorker = window.Worker;
            window.aWorkspaceNativeWorker = NativeWorker;
            window.aWorkspaceWorker = { created: 0, terminated: 0, posts: 0, replies: 0 };
            window.Worker = class extends NativeWorker {
              constructor(_url, options) {
                super(new URL(name, location.href), options);
                window.aWorkspaceWorker.created++;
                this.addEventListener("message", () => window.aWorkspaceWorker.replies++);
              }
              postMessage(...args) {
                window.aWorkspaceWorker.posts++;
                return super.postMessage(...args);
              }
              terminate() {
                super.terminate();
                window.aWorkspaceWorker.terminated++;
                if (throwCleanup) throw new Error("A workspace Worker cleanup leaf");
              }
            };
          },
          { name: heldName, throwCleanup: picker === "none" },
        );
        const schematic = page.getByRole("region", { name: "设计原理图", exact: true });
        await schematic.getByRole("button", { name: "布局", exact: true }).click();
        await schematic.locator('[role="status"]').getByText("pending", { exact: true }).waitFor();
        if (picker !== "none") {
          await electron.evaluate(({ dialog }) => {
            dialog.showOpenDialog = () =>
              new Promise((resolve) => {
                globalThis.aWorkspacePicker = (choice) => resolve(choice);
              });
          });
          await page.getByRole("button", { name: "打开设计", exact: true }).click();
          await page.waitForSelector('.demo-status[data-phase="picking"]');
        }
        // Physical measurement boundary only: real production component throws; no business replies fabricated.
        await page.evaluate(() => {
          const original = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight");
          window.aWorkspaceOriginalHeight = original;
          Object.defineProperty(Element.prototype, "clientHeight", {
            ...original,
            get() {
              if (this.matches(".demo-left .demo-viewport")) return Infinity;
              return original.get.call(this);
            },
          });
        });
        await electron.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].setSize(1280, 900),
        );
        await page.waitForFunction(() => window.aWorkspaceWorker.terminated === 1);
        await page.waitForFunction(
          () => document.querySelectorAll('[role="treeitem"]').length === 0,
        );
        assert.equal(
          await page.locator(".demo-toolbar").count(),
          1,
          "host survives failed workspace",
        );
        if (picker !== "none") {
          assert.equal(await page.locator(".demo-status").getAttribute("data-phase"), "picking");
          assert.match(
            await page.locator(".demo-status").innerText(),
            /工作区显示失败，等待当前操作结束后清理/,
          );
          assert.equal(
            await page.getByRole("button", { name: "打开设计", exact: true }).isEnabled(),
            false,
          );
          assert(
            !output.join("").includes('"scope":"renderer","generation":2,"stage":"close"'),
            "do not concurrently close a native picker operation",
          );
        }
        await page.evaluate(() => {
          Object.defineProperty(Element.prototype, "clientHeight", window.aWorkspaceOriginalHeight);
          window.Worker = window.aWorkspaceNativeWorker;
        });
        if (picker !== "none")
          await electron.evaluate(
            (_electron, { picker, design }) => {
              globalThis.aWorkspacePicker({
                canceled: picker === "cancel",
                filePaths: picker === "cancel" ? [] : [design],
              });
            },
            { picker, design },
          );
        const expected = picker === "replace" ? "ready" : "failed";
        await page.waitForSelector(`.demo-status[data-phase="${expected}"]`);
        const message = await page
          .locator(picker === "replace" ? ".demo-operation-notice" : ".demo-status")
          .innerText();
        assert.match(message, /工作区显示失败：HierarchyTree height must be finite and positive/);
        assert.doesNotMatch(message, /\bbusy\b/);
        if (picker === "none") assert.match(message, /A workspace Worker cleanup leaf/);
        assert.throws(() => process.kill(old[0], 0), { code: "ESRCH" });
        if (picker !== "replace") {
          assert.deepEqual(coreChildren(electron.process().pid), []);
          assert.equal(
            await page.getByRole("region", { name: "设计信息", exact: true }).count(),
            0,
          );
          await electron.evaluate(({ dialog }, design) => {
            dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [design] });
          }, design);
          await page.getByRole("button", { name: "打开设计", exact: true }).click();
          await page.waitForSelector('.demo-status[data-phase="ready"]');
        }
        const fresh = coreChildren(electron.process().pid);
        assert.equal(fresh.length, 1);
        assert.notEqual(fresh[0], old[0]);
        const next = page.getByRole("treeitem").first();
        await next.waitFor();
        assert.equal(await next.getAttribute("aria-selected"), "false");
        await page.getByRole("tree", { name: "设计层级", exact: true }).focus();
        await page.getByRole("tree", { name: "设计层级", exact: true }).press("Enter");
        await page
          .locator(".demo-source-workspace code")
          .filter({ hasText: "assign y = mid" })
          .waitFor();
        const worker = await page.evaluate(() => window.aWorkspaceWorker);
        assert.equal(worker.created, 1);
        assert.equal(worker.terminated, 1);
        assert(worker.posts > 0);
        assert.equal(worker.replies, 0);
        // React development dispatch can report the controlled render exception before the boundary handles it.
        assert(
          errors.every((message) => message === "HierarchyTree height must be finite and positive"),
          JSON.stringify(errors),
        );
        await page.getByRole("button", { name: "关闭设计", exact: true }).click();
        await page.waitForSelector('.demo-status[data-phase="idle"]');
        assert.deepEqual(coreChildren(electron.process().pid), []);
        assert.throws(() => process.kill(fresh[0], 0), { code: "ESRCH" });
        console.log(
          JSON.stringify({
            picker,
            old,
            fresh,
            worker,
            message,
            expectedRenderErrors: errors,
            closed: true,
          }),
        );
      } finally {
        if (electron) await electron.close();
        await rm(held);
      }
    },
  );
}
