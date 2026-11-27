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

for (const [method, input, submit, region, pending, cancel] of [
  ["search", "搜索", "搜索", "搜索结果", "正在搜索", "取消搜索"],
  ["path.resolve", "路径", "定位", "路径结果", "正在定位路径", "取消定位"],
]) {
  test(
    `real ${method} supersession and explicit cancel cannot publish the old host error`,
    { timeout: 30_000 },
    async (t) => {
      const c = await open(t),
        { page } = c;
      const results = page.getByRole("region", { name: region, exact: true });
      const notice = page.getByRole("region", { name: "最近一次操作提示", exact: true });
      await c.hold(method);
      await page
        .getByLabel(input, { exact: true })
        .fill(method === "path.resolve" ? "[" : "obsolete");
      await page.getByRole("button", { name: submit, exact: true }).click();
      await c.held();
      console.log(
        JSON.stringify({
          method,
          observed: await results.innerText(),
          held: await c.electron.evaluate(() =>
            globalThis.aQueryIPC.held.map((args) => args[1].event.json),
          ),
        }),
      );
      await results.getByRole("status").filter({ hasText: pending }).waitFor();
      await page.getByLabel(input, { exact: true }).fill("demo_graph_top");
      await page.getByRole("button", { name: submit, exact: true }).click();
      await results.getByRole("button", { name: "选择对象", exact: true }).first().waitFor();
      await c.release();
      assert.equal(await notice.count(), 0, "superseded cancellation is not a current failure");
      await c.hold(method);
      await page
        .getByLabel(input, { exact: true })
        .fill(method === "path.resolve" ? "demo_graph_top.y" : "mid");
      await page.getByRole("button", { name: submit, exact: true }).click();
      await c.held();
      await results.getByRole("button", { name: cancel, exact: true }).click();
      await c.release();
      await results
        .getByText(method === "path.resolve" ? "路径定位已取消" : "搜索已取消", { exact: true })
        .waitFor();
      assert.equal(await notice.count(), 0, "explicit cancel stays in model state");
      assert.equal(
        await page.getByLabel(input, { exact: true }).inputValue(),
        method === "path.resolve" ? "demo_graph_top.y" : "mid",
      );
      assert.equal(await page.locator('[role="treeitem"][aria-selected="true"]').count(), 1);
      await c.close();
    },
  );
}

test(
  "real automatic connection load and manual side changes share one host reporting owner",
  { timeout: 30_000 },
  async (t) => {
    const c = await open(t),
      { page } = c;
    await c.hold(["conn.drivers", "conn.loads"]);
    await page
      .getByRole("region", { name: "实例属性", exact: true })
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "y", exact: true }) })
      .getByRole("button", { name: "选择端口", exact: true })
      .click();
    await c.held();
    await page.getByRole("tab", { name: "对象连接", exact: true }).click();
    const side = page.getByRole("combobox", { name: "连接侧", exact: true });
    await side.selectOption("inside");
    const connections = page.getByRole("region", { name: "对象连接", exact: true });
    await connections.getByText("加载失败", { exact: true }).waitFor({ state: "hidden" });
    await connections.getByRole("button", { name: "刷新", exact: true }).waitFor();
    await c.release();
    const notice = page.getByRole("region", { name: "最近一次操作提示", exact: true });
    assert.equal(await notice.count(), 0, "superseded automatic failure not reported");
    await side.selectOption("");
    await notice.getByText(/ports require inside or outside side/).waitFor();
    await side.selectOption("inside");
    await connections.getByRole("button", { name: "刷新", exact: true }).waitFor();
    assert.match(
      await notice.innerText(),
      /ports require inside or outside side/,
      "successful query preserves existing history",
    );
    await c.close(false);
  },
);
