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
async function open(t) {
  assert(process.env.HIER_BIN, "explicit actual Core executable");
  const electron = await _electron.launch({
    executablePath: binary,
    args: [app],
    env: process.env,
  });
  t.after(() => electron.close());
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
  const source = page.locator(".demo-source-workspace code");
  await source.filter({ hasText: "assign y = mid" }).waitFor();
  const code = await source.elementHandle(),
    pid = children(electron.process().pid);
  assert.equal(pid.length, 1);
  async function hold(method) {
    await electron.evaluate(({ BrowserWindow, ipcMain }, method) => {
      const frame = BrowserWindow.getAllWindows()[0].webContents.mainFrame,
        send = frame.send;
      const state = (globalThis.aQueryIPC = {
        expected: Array.isArray(method) ? method.length : 1,
        ids: [],
        seen: [],
        held: [],
        requests: [],
        cancels: [],
      });
      const observe = (_event, body) => {
        const request = JSON.parse(body.json);
        state.requests.push(request);
        const methods = Array.isArray(method) ? method : [method];
        if (methods.includes(request.method) && !state.seen.includes(request.method)) {
          state.seen.push(request.method);
          state.ids.push(request.id);
        }
        if (request.method === "cancel") state.cancels.push(request.params.target);
      };
      ipcMain.on("hier:bridge:send", observe);
      frame.send = function (...args) {
        const event = args[1]?.event;
        if (event?.kind === "frame") {
          const response = JSON.parse(event.json);
          if (state.ids.includes(response.id) && typeof response.ok === "boolean") {
            state.held.push(args);
            return;
          }
        }
        return send.apply(this, args);
      };
      globalThis.aQueryRelease = () => {
        frame.send = send;
        ipcMain.removeListener("hier:bridge:send", observe);
        for (const args of state.held.splice(0)) send.apply(frame, args);
      };
    }, method);
  }
  async function held() {
    for (let n = 0; n < 100; n++) {
      if (
        await electron.evaluate(
          () =>
            globalThis.aQueryIPC.held.length === globalThis.aQueryIPC.expected &&
            globalThis.aQueryIPC.ids.length === globalThis.aQueryIPC.expected,
        )
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail("actual Core response was not captured at IPC");
  }
  async function release() {
    const capture = await electron.evaluate(() => ({
      held: globalThis.aQueryIPC.held.length,
      ids: globalThis.aQueryIPC.ids,
      cancels: globalThis.aQueryIPC.cancels,
    }));
    assert.equal(capture.held, capture.ids.length, "held original Core terminal responses");
    assert(
      capture.ids.every((id) => capture.cancels.includes(id)),
      "original requests were cancelled locally",
    );
    await electron.evaluate(() => globalThis.aQueryRelease());
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  }
  async function close(preserveCode = true) {
    if (preserveCode) assert.equal(await source.evaluate((node, old) => node === old, code), true);
    assert.deepEqual(children(electron.process().pid), pid);
    assert.deepEqual(errors, []);
    await page.getByRole("button", { name: "关闭设计", exact: true }).click();
    await page.waitForSelector('.demo-status[data-phase="idle"]');
    assert.deepEqual(children(electron.process().pid), []);
    assert.throws(() => process.kill(pid[0], 0), { code: "ESRCH" });
  }
  return { electron, page, hold, held, release, close };
}

test(
  "real same-frame selection burst only queries the final object and leaves source and properties consistent",
  { timeout: 30_000 },
  async (t) => {
    const c = await open(t),
      { page, electron } = c;
    const properties = page.getByRole("region", { name: "实例属性", exact: true });
    await properties.getByRole("button", { name: "刷新", exact: true }).waitFor();
    const rootRef = await properties
      .locator("dt")
      .filter({ hasText: /^实例引用$/ })
      .locator("+ dd")
      .textContent();
    await electron.evaluate(({ ipcMain }) => {
      globalThis.aSelectionRequests = [];
      ipcMain.on("hier:bridge:send", (_event, body) =>
        globalThis.aSelectionRequests.push(JSON.parse(body.json)),
      );
    });
    const port = properties
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "y", exact: true }) })
      .getByRole("button", { name: "选择端口", exact: true });
    // Browser input boundary: two actual component handlers in one synchronous task.
    await port.evaluate((button) => {
      button.click();
      document.querySelector('[role="treeitem"]').click();
    });
    await properties.getByRole("button", { name: "刷新", exact: true }).waitFor();
    await page
      .locator(".demo-source-workspace code")
      .filter({ hasText: "assign y = mid" })
      .waitFor();
    const lookups = await electron.evaluate(() =>
      globalThis.aSelectionRequests.filter((x) => x.method === "obj.get").map((x) => x.params.ref),
    );
    assert(
      lookups.length > 0 && lookups.every((ref) => ref === rootRef),
      "no obsolete port lookup from the intermediate selection",
    );
    assert.equal(
      await properties
        .locator("dt")
        .filter({ hasText: /^实例引用$/ })
        .locator("+ dd")
        .textContent(),
      rootRef,
    );
    assert.equal(await page.locator('[role="treeitem"][aria-selected="true"]').count(), 1);
    assert.equal(
      await page.getByRole("region", { name: "最近一次操作提示", exact: true }).count(),
      0,
    );
    await c.close(false);
  },
);

test(
  "real selection during a held source reload revokes the old document and preserves the new source after late reply",
  { timeout: 30_000 },
  async (t) => {
    const c = await open(t),
      { page } = c;
    const source = page.getByRole("region", { name: "设计源码", exact: true });
    const oldLocation = await source.getByText(/^位置：/).textContent();
    await c.hold("obj.source");
    await page.getByRole("button", { name: "刷新源码", exact: true }).click();
    await c.held();
    await page.getByRole("button", { name: "取消源码请求", exact: true }).waitFor();
    await page.getByLabel("路径", { exact: true }).fill("demo_graph_top.mid");
    await page.getByRole("button", { name: "定位", exact: true }).click();
    await page
      .getByRole("region", { name: "路径结果", exact: true })
      .getByRole("button", { name: "选择对象", exact: true })
      .click();
    await source.locator("code").filter({ hasText: "assign y = mid" }).waitFor();
    await page.getByRole("button", { name: "刷新源码", exact: true }).waitFor();
    const currentLocation = await source.getByText(/^位置：/).textContent();
    assert.notEqual(
      currentLocation,
      oldLocation,
      "actual Core source range follows the selected signal",
    );
    const code = await source.locator("code").elementHandle();
    await c.release();
    assert.equal(await source.getByText(/^位置：/).textContent(), currentLocation);
    assert.equal(await source.locator("code").evaluate((node, old) => node === old, code), true);
    assert.equal(
      await page.getByRole("region", { name: "最近一次操作提示", exact: true }).count(),
      0,
    );
    await c.close(false);
  },
);
