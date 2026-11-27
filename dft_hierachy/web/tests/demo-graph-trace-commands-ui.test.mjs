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

for (const action of ["replace", "cancel", "clear", "collapse"]) {
  test(
    `real trace ${action} revokes the obsolete report while preserving current failures and explicit retry`,
    { timeout: 30_000 },
    async (t) => {
      const c = await open(t),
        { page } = c;
      const notice = page.getByRole("region", { name: "最近一次操作提示", exact: true });
      await page
        .getByRole("region", { name: "实例属性", exact: true })
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: "y", exact: true }) })
        .getByRole("button", { name: "选择端口", exact: true })
        .click();
      await notice.getByText(/ports require inside or outside side/).waitFor();
      await notice.getByRole("button", { name: "关闭操作提示", exact: true }).click();
      await page.getByRole("button", { name: "显示原理图", exact: true }).click();
      await page.getByLabel("追踪侧", { exact: true }).selectOption("inside");
      const trace = page.getByRole("button", { name: "追踪所选对象", exact: true });
      const summary = page.locator(".demo-graph-summary");
      await c.hold("trace.cone");
      await trace.click();
      await c.held();
      if (action === "replace") await trace.click();
      else if (action === "cancel")
        await page.getByRole("button", { name: "取消追踪", exact: true }).click();
      else if (action === "clear") {
        await page.getByRole("button", { name: "高级控制", exact: true }).click();
        await page.getByRole("button", { name: "清除追踪", exact: true }).click();
      } else {
        await page.getByRole("button", { name: "收起原理图", exact: true }).click();
        await page.getByRole("button", { name: "显示原理图", exact: true }).click();
      }
      await c.release();
      const status = action === "replace" ? "success" : action === "clear" ? "idle" : "cancelled";
      await summary.getByText(new RegExp(`Core 追踪 · ${status}`)).waitFor();
      console.log(JSON.stringify({ action, status, obsoleteNotices: await notice.count() }));
      assert.equal(
        await notice.count(),
        0,
        "withdrawn trace is represented by model state, not a current operation failure",
      );
      // A real current Core validation error still reports through the same host entry.
      await page.getByLabel("追踪侧", { exact: true }).selectOption("");
      await trace.click();
      await summary.getByText(/Core 追踪 · failed/).waitFor();
      await notice.getByText(/invalid side for this object/).waitFor();
      const error = await notice.innerText();
      await page.getByLabel("追踪侧", { exact: true }).selectOption("inside");
      await trace.click();
      await summary.getByText(/Core 追踪 · success/).waitFor();
      assert.equal(await notice.innerText(), error, "successful retry preserves explicit history");
      await notice.getByRole("button", { name: "关闭操作提示", exact: true }).click();
      assert.equal(await notice.count(), 0);
      await c.close(false);
    },
  );
}
