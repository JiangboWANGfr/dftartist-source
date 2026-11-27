import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { _electron } from "playwright";

const web = fileURLToPath(new URL("../", import.meta.url));
const consumer = process.env.HIER_A_DEMO_DELIVERY;
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo");
const binary = createRequire(path.join(consumer ?? web, "package.json"))("electron");
const design = fileURLToPath(new URL("./demo-graph/design.sv", import.meta.url));
const heldName = `a-demo-held-${process.pid}.js`;
const held = path.join(app, "dist", heldName);

test(
  "A: real demo trace, source, folds, annotations and native Worker lifecycle",
  { timeout: 90_000 },
  async () => {
    assert(process.env.HIER_BIN, "explicit actual Core executable");
    const resolve = createRequire(path.join(consumer ?? web, "package.json")).resolve;
    assert.deepEqual(
      await readFile(path.join(app, "dist/elk-worker.min.js")),
      await readFile(resolve("elkjs/lib/elk-worker.min.js")),
      "host serves the pinned upstream Worker bytes",
    );
    await writeFile(held, "// Native Worker control: deliberately never answers.\n", {
      flag: "wx",
    });
    const electron = await _electron.launch({
      executablePath: binary,
      args: [app],
      env: process.env,
    });
    const errors = [];
    const hostErrors = [];
    const lifecycle = [];
    electron.process().stderr?.on("data", (chunk) => hostErrors.push(String(chunk)));
    electron.process().once("exit", (code, signal) => lifecycle.push({ code, signal }));
    let completed = false;
    try {
      await electron.evaluate(({ dialog }, input) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
      }, design);
      const page = await electron.firstWindow();
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("close", () => lifecycle.push("page closed"));
      page.on("crash", () => lifecycle.push("page crashed"));
      await page.waitForSelector(".demo-status[data-phase=idle]");
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
      await page.waitForSelector(".demo-status[data-phase=ready]");
      assert.deepEqual(
        await electron.evaluate(({ BrowserWindow }) => {
          const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
          return [p.contextIsolation, p.sandbox, p.nodeIntegration];
        }),
        [true, true, false],
      );
      await page.getByRole("button", { name: "显示原理图", exact: true }).click();
      await page.getByRole("button", { name: "双视图", exact: true }).click();
      await page.getByRole("button", { name: "高级控制", exact: true }).click();
      await page.getByRole("button", { name: "来源与详情", exact: true }).click();
      for (const label of ["追踪选项", "演示与标注", "分组与折叠"]) {
        await page.locator("summary").filter({ hasText: label }).click();
      }
      const schematic = page.getByRole("region", { name: "设计原理图", exact: true });
      const sources = schematic.getByRole("region", { name: "图来源", exact: true });
      const trace = sources
        .locator("article")
        .filter({ has: page.getByRole("heading", { name: "Core 追踪", exact: true }) });
      const source = page.getByRole("region", { name: "设计源码", exact: true });
      const selectPort = async () => {
        await page
          .getByRole("tree", { name: "设计层级", exact: true })
          .getByRole("treeitem")
          .first()
          .click();
        await page
          .getByRole("region", { name: "实例属性", exact: true })
          .getByRole("row")
          .filter({ has: page.getByRole("cell", { name: "y", exact: true }) })
          .getByRole("button", { name: "选择端口", exact: true })
          .click();
        await page.waitForFunction(() =>
          document.querySelector('[aria-label="设计源码"]')?.textContent.includes("assign y = mid"),
        );
        await page.getByRole("combobox", { name: "追踪侧", exact: true }).selectOption("inside");
        await page.getByRole("spinbutton", { name: "追踪 width", exact: true }).fill("4");
      };
      await selectPort();
      // Observe real native Workers only. Fault choices change the resource URL, never layout results.
      await page.evaluate((heldFile) => {
        const NativeWorker = window.Worker;
        window.aWorkers = [];
        window.aWorkerFault = "";
        window.Worker = class extends NativeWorker {
          constructor(url, options) {
            const fault = window.aWorkerFault;
            const resource =
              fault === "missing"
                ? new URL("missing-worker.js", location.href)
                : fault === "csp"
                  ? "data:text/javascript,0"
                  : fault === "held"
                    ? new URL(heldFile, location.href)
                    : url;
            super(resource, options);
            this.record = { url: String(resource), terminated: 0, posts: 0, replies: 0 };
            window.aWorkers.push(this.record);
            this.addEventListener("message", () => this.record.replies++);
          }
          postMessage(...args) {
            this.record.posts++;
            return super.postMessage(...args);
          }
          terminate() {
            this.record.terminated++;
            return super.terminate();
          }
        };
      }, heldName);
      const waitTrace = (text) => trace.getByText(text, { exact: true }).waitFor();
      const runTrace = async () => {
        await page.getByRole("button", { name: "追踪所选对象", exact: true }).click();
        await waitTrace("design · success");
      };
      const waitLayout = (status) =>
        schematic.locator('[role="status"]').getByText(status, { exact: true }).waitFor();
      const layout = async () => {
        await schematic.getByRole("button", { name: "布局", exact: true }).click();
        await waitLayout("success");
      };
      await runTrace();
      assert.match(await trace.textContent(), /complete/);
      await layout();
      const initialNodes = await schematic.locator("svg g.hier-schematic-view__node").count();
      const initialEdges = await schematic.locator("svg g.hier-schematic-view__edge").count();
      assert(initialNodes > 2 && initialEdges > 1, "actual Core cone has connected members");
      await schematic.getByRole("button", { name: /折叠 hierarchy 追踪显示组/ }).click();
      await layout();
      assert.equal(await schematic.locator("svg g.hier-schematic-view__node").count(), 1);
      await schematic.getByRole("button", { name: /展开 hierarchy 追踪显示组/ }).click();
      await layout();
      assert.equal(
        await schematic.locator("svg g.hier-schematic-view__node").count(),
        initialNodes,
      );
      assert.equal(
        await schematic.locator("svg g.hier-schematic-view__edge").count(),
        initialEdges,
      );
      // Selection is shared: graph node -> source + tree; external target -> same selection/annotation.
      const selectableNode = schematic
        .locator('svg g[role="button"][aria-disabled="false"]')
        .filter({ has: page.locator(".hier-schematic-view__node") })
        .first();
      await selectableNode.focus();
      await selectableNode.press("Enter");
      await page.waitForFunction(() =>
        document
          .querySelector('[aria-label="设计源码"]')
          ?.textContent.includes("module demo_graph_top"),
      );
      await selectPort();
      await page.getByRole("button", { name: "添加外部示例", exact: true }).click();
      await sources.getByText("plan · success", { exact: true }).waitFor();
      await layout();
      await page.getByRole("button", { name: "标注所选对象", exact: true }).click();
      const external = schematic
        .locator('svg g[role="button"]')
        .filter({ hasText: "示例：所选对象" });
      assert.match(await external.getAttribute("aria-label"), /已标注/);
      await external.focus();
      await external.press("Enter");
      assert.equal(await external.getAttribute("aria-pressed"), "true");
      assert.match(await source.textContent(), /assign y = mid/);
      await page.getByRole("button", { name: "移除外部示例", exact: true }).click();
      await sources.getByText("plan · idle", { exact: true }).waitFor();
      await layout();
      assert.equal(
        await schematic.locator("svg g.hier-schematic-view__node").count(),
        initialNodes,
      );
      // An instance can appear in both the tree and an explicitly mapped external node.
      await page
        .getByRole("tree", { name: "设计层级", exact: true })
        .getByRole("treeitem")
        .first()
        .click();
      await page.getByRole("button", { name: "标注所选对象", exact: true }).click();
      assert.match(
        await page.getByRole("tree", { name: "设计层级", exact: true }).textContent(),
        /已标注/,
      );
      await page.getByRole("button", { name: "添加外部示例", exact: true }).click();
      await sources.getByText("plan · success", { exact: true }).waitFor();
      await layout();
      assert.match(await external.getAttribute("aria-label"), /已标注/);
      await page.getByRole("button", { name: "清除标注", exact: true }).click();
      assert.doesNotMatch(await external.getAttribute("aria-label"), /已标注/);
      await page.getByRole("button", { name: "移除外部示例", exact: true }).click();
      await sources.getByText("plan · idle", { exact: true }).waitFor();
      await selectPort();
      await page.getByRole("spinbutton", { name: "追踪节点上限", exact: true }).fill("1");
      await runTrace();
      assert.match(await trace.textContent(), /partial/);
      assert.match(await trace.textContent(), /budget_nodes/);
      assert.match(await trace.textContent(), /frontier: [1-9]/);
      await page.getByRole("spinbutton", { name: "追踪节点上限", exact: true }).fill("100");
      await runTrace();
      for (const fault of ["missing", "csp", "held"]) {
        await page.evaluate((value) => {
          window.aWorkerFault = value;
        }, fault);
        await schematic.getByRole("button", { name: "布局", exact: true }).click();
        try {
          await waitLayout("failed");
        } catch (error) {
          const observations = await Promise.allSettled([
            schematic.locator('[role="status"]').allTextContents(),
            page.evaluate(() => window.aWorkers),
          ]);
          console.log(
            JSON.stringify({
              fault,
              observations,
              pageErrors: errors,
              hostErrors,
              lifecycle,
            }),
          );
          throw error;
        }
        assert.match(
          await schematic.locator('[role="status"]').textContent(),
          fault === "held" ? /timeout/ : /worker_failure/,
        );
        assert.match(await trace.textContent(), /design · success/);
        await page.evaluate(() => {
          window.aWorkerFault = "";
        });
        try {
          await schematic.getByRole("button", { name: "重试", exact: true }).click();
          await waitLayout("success");
        } catch (error) {
          console.log(
            JSON.stringify({
              fault,
              status: await schematic.locator('[role="status"]').allTextContents(),
              workers: await page.evaluate(() => window.aWorkers),
              pageErrors: errors,
              hostErrors,
              lifecycle,
            }),
          );
          throw error;
        }
      }
      if (process.env.HIER_A_SCREENSHOT)
        await page.screenshot({ path: process.env.HIER_A_SCREENSHOT });
      // Pending cancellation, then pending close/reopen: each waiter settles and native Worker ends.
      await page.evaluate(() => {
        window.aWorkerFault = "held";
      });
      await schematic.getByRole("button", { name: "布局", exact: true }).click();
      await waitLayout("pending");
      await schematic.getByRole("button", { name: "取消", exact: true }).click();
      await waitLayout("cancelled");
      await schematic.getByRole("button", { name: "布局", exact: true }).click();
      await waitLayout("pending");
      await page.getByRole("button", { name: "关闭设计", exact: true }).click();
      await page.waitForSelector(".demo-status[data-phase=idle]");
      const workers = await page.evaluate(() => window.aWorkers);
      assert(workers.length >= 13);
      assert(
        workers.every((w) => w.terminated === 1),
        "every allocated native Worker terminated once",
      );
      await page.evaluate(() => {
        window.aWorkerFault = "";
      });
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
      await page.waitForSelector(".demo-status[data-phase=ready]");
      await page.getByRole("button", { name: "显示原理图", exact: true }).click();
      await page.getByRole("button", { name: "双视图", exact: true }).click();
      await page.getByRole("button", { name: "高级控制", exact: true }).click();
      await page.getByRole("button", { name: "来源与详情", exact: true }).click();
      for (const label of ["追踪选项", "演示与标注", "分组与折叠"]) {
        await page.locator("summary").filter({ hasText: label }).click();
      }
      assert.equal(
        await sources.locator("article").count(),
        0,
        "new design starts without old sources",
      );
      await page.getByRole("button", { name: "关闭设计", exact: true }).click();
      await page.waitForSelector(".demo-status[data-phase=idle]");
      assert.deepEqual(errors, []);
      const csp = await page
        .locator('meta[http-equiv="Content-Security-Policy"]')
        .getAttribute("content");
      assert.match(csp, /worker-src 'self'/);
      assert.doesNotMatch(csp, /unsafe-eval|blob:/);
      console.log(
        JSON.stringify({
          consumer: consumer ?? "workspace",
          initialNodes,
          initialEdges,
          workers,
          csp,
          pageErrors: errors,
          completed: true,
        }),
      );
      completed = true;
    } finally {
      await electron.close();
      await rm(held);
      console.log(JSON.stringify({ electronClosed: true, completed }));
    }
  },
);
