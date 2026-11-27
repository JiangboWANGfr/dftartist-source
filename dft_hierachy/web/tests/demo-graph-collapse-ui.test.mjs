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
async function open() {
  assert(process.env.HIER_BIN, "explicit actual Core executable");
  const electron = await _electron.launch({
    executablePath: binary,
    args: [app],
    env: process.env,
  });
  await electron.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, design);
  const page = await electron.firstWindow();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "打开设计", exact: true }).click();
  await page.waitForSelector('.demo-status[data-phase="ready"]');
  await page.getByRole("treeitem").first().click();
  const pid = children(electron.process().pid);
  assert.equal(pid.length, 1);
  return { electron, page, errors, pid };
}
async function close({ page, electron, errors, pid }) {
  await page.getByRole("button", { name: "关闭设计", exact: true }).click();
  await page.waitForSelector('.demo-status[data-phase="idle"]');
  assert.deepEqual(children(electron.process().pid), []);
  assert.throws(() => process.kill(pid[0], 0), { code: "ESRCH" });
  assert.deepEqual(errors, []);
}
for (const cleanupThrows of [false, true]) {
  test(
    `real graph collapse reaps its native Worker, preserves the design, and retries; cleanup throws=${cleanupThrows}`,
    { timeout: 30_000 },
    async () => {
      const heldName = `a-collapse-${process.pid}-${cleanupThrows}.js`,
        held = path.join(app, "dist", heldName);
      await writeFile(held, "// A-owned native Worker holds a real layout task pending.\n", {
        flag: "wx",
      });
      let context;
      try {
        context = await open();
        const { page, electron, pid } = context;
        const source = page.getByRole("region", { name: "设计源码", exact: true });
        await source.locator("code").filter({ hasText: "assign y = mid" }).waitFor();
        const originalSource = await source.locator("code").elementHandle();
        await page.getByRole("button", { name: "显示原理图", exact: true }).click();
        await page.getByRole("button", { name: "高级控制", exact: true }).click();
        await page.locator("summary").filter({ hasText: "演示与标注" }).click();
        await page.getByRole("button", { name: "添加外部示例", exact: true }).click();
        await page.evaluate(
          ({ name, throws }) => {
            const Native = window.Worker;
            window.aCollapseWorkers = [];
            window.aCollapseHeld = false;
            window.Worker = class extends Native {
              constructor(url, options) {
                const held = window.aCollapseHeld;
                super(held ? new URL(name, location.href) : url, options);
                this.record = { held, terminations: 0 };
                window.aCollapseWorkers.push(this.record);
              }
              terminate() {
                super.terminate();
                this.record.terminations++;
                if (throws && this.record.held)
                  throw new Error("A collapsed native Worker cleanup leaf");
              }
            };
          },
          { name: heldName, throws: cleanupThrows },
        );
        const schematic = page.getByRole("region", { name: "设计原理图", exact: true });
        const status = (value) => schematic.getByRole("status").getByText(value, { exact: true });
        await schematic.getByRole("button", { name: "布局", exact: true }).click();
        await status("success").waitFor();
        const svg = await schematic.locator("svg").elementHandle();
        const geometry = await schematic
          .locator("[data-graph-key]")
          .evaluateAll((items) =>
            items.map((n) => [n.getAttribute("data-graph-key"), n.getAttribute("transform")]),
          );
        assert(geometry.length > 0);
        await page.getByRole("button", { name: "源码", exact: true }).click();
        await page.getByRole("button", { name: "原理图", exact: true }).click();
        assert.equal(await svg.evaluate((node) => node.isConnected), true);
        assert.deepEqual(
          await schematic
            .locator("[data-graph-key]")
            .evaluateAll((items) =>
              items.map((n) => [n.getAttribute("data-graph-key"), n.getAttribute("transform")]),
            ),
          geometry,
        );
        assert.equal(
          await page.evaluate(() => window.aCollapseWorkers.length),
          1,
          "view switches reuse geometry without starting a layout",
        );
        await page.evaluate(() => {
          window.aCollapseHeld = true;
        });
        await schematic.getByRole("button", { name: "布局", exact: true }).click();
        await status("pending").waitFor();
        await page.getByRole("button", { name: "源码", exact: true }).click();
        await page.getByRole("button", { name: "双视图", exact: true }).click();
        assert.equal(
          await page.evaluate(() => window.aCollapseWorkers[1].terminations),
          0,
          "ordinary hide keeps pending work",
        );
        await page.getByRole("button", { name: "收起原理图", exact: true }).click();
        await page.waitForFunction(() => window.aCollapseWorkers[1].terminations === 1);
        assert.equal(await page.getByRole("region", { name: "图工作区", exact: true }).count(), 0);
        assert.equal(await page.locator(".demo-status").getAttribute("data-phase"), "ready");
        assert.equal(await originalSource.evaluate((node) => node.isConnected), true);
        assert.deepEqual(children(electron.process().pid), pid);
        if (cleanupThrows)
          await page
            .getByRole("region", { name: "最近一次操作提示", exact: true })
            .getByText(/A collapsed native Worker cleanup leaf/)
            .waitFor();
        await page.evaluate(() => {
          window.aCollapseHeld = false;
        });
        await page.getByRole("button", { name: "显示原理图", exact: true }).click();
        assert.equal(
          await page.evaluate(() => window.aCollapseWorkers.length),
          2,
          "reopen never implicitly starts another task",
        );
        await schematic.getByRole("button", { name: "布局", exact: true }).click();
        await status("success").waitFor();
        assert.equal(
          await schematic.locator("[data-graph-key]").count(),
          geometry.length,
          "retained graph members can be explicitly laid out again",
        );
        const workers = await page.evaluate(() => window.aCollapseWorkers);
        assert(workers.every((w) => w.terminations === 1));
        await close(context);
        console.log(JSON.stringify({ cleanupThrows, pid, workers, pageErrors: context.errors }));
      } finally {
        if (context) await context.electron.close();
        await rm(held);
      }
    },
  );
}

test(
  "real Core trace reply held at IPC cannot revive a collapsed task; the same design can trace again",
  { timeout: 30_000 },
  async () => {
    const context = await open();
    const { page, electron, pid } = context;
    try {
      await page
        .getByRole("region", { name: "实例属性", exact: true })
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: "y", exact: true }) })
        .getByRole("button", { name: "选择端口", exact: true })
        .click();
      await page.getByRole("button", { name: "显示原理图", exact: true }).click();
      await page.getByLabel("追踪侧", { exact: true }).selectOption("inside");
      await electron.evaluate(({ BrowserWindow, ipcMain }) => {
        const frame = BrowserWindow.getAllWindows()[0].webContents.mainFrame,
          send = frame.send;
        const state = (globalThis.aCollapseIPC = { id: undefined, held: [], cancels: [] });
        ipcMain.on("hier:bridge:send", (_event, body) => {
          const request = JSON.parse(body.json);
          if (request.method === "trace.cone" && state.id === undefined) state.id = request.id;
          if (request.method === "cancel") state.cancels.push(request.params.target);
        });
        frame.send = function (...args) {
          const event = args[1]?.event;
          if (event?.kind === "frame") {
            const response = JSON.parse(event.json);
            if (state.id !== undefined && response.id === state.id && response.ok) {
              state.held.push(args);
              return;
            }
          }
          return send.apply(this, args);
        };
        globalThis.aCollapseReleaseIPC = () => {
          const held = state.held.splice(0);
          for (const args of held) send.apply(frame, args);
        };
      });
      await page.getByRole("button", { name: "追踪所选对象", exact: true }).click();
      for (let n = 0; n < 100; n++) {
        if (await electron.evaluate(() => globalThis.aCollapseIPC.held.length)) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(
        await electron.evaluate(() => globalThis.aCollapseIPC.held.length),
        1,
        "held actual Core response, not a fabricated result",
      );
      await page.getByRole("button", { name: "收起原理图", exact: true }).click();
      assert(
        await electron.evaluate(() =>
          globalThis.aCollapseIPC.cancels.includes(globalThis.aCollapseIPC.id),
        ),
      );
      await electron.evaluate(() => {
        globalThis.aCollapseReleaseIPC();
      });
      await page.getByRole("button", { name: "显示原理图", exact: true }).click();
      await page
        .locator(".demo-graph-summary")
        .getByText(/Core 追踪 · cancelled/)
        .waitFor();
      assert.deepEqual(children(electron.process().pid), pid);
      await page.getByLabel("追踪侧", { exact: true }).selectOption("inside");
      await page.getByRole("button", { name: "追踪所选对象", exact: true }).click();
      await page
        .locator(".demo-graph-summary")
        .getByText(/Core 追踪 · success/)
        .waitFor();
      await close(context);
      console.log(
        JSON.stringify({ actualIPCTraceCancellation: true, pid, pageErrors: context.errors }),
      );
    } finally {
      await electron.close();
    }
  },
);
