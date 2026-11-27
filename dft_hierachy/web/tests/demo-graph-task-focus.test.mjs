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
  await page.getByRole("treeitem").filter({ hasText: "demo_graph_top" }).first().click();
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
  async function release(cancelled = false) {
    const capture = await electron.evaluate(() => ({
      held: globalThis.aQueryIPC.held.length,
      ids: globalThis.aQueryIPC.ids,
      cancels: globalThis.aQueryIPC.cancels,
    }));
    assert.equal(capture.held, capture.ids.length, "held original Core terminal responses");
    if (cancelled) assert(
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
  return { electron, page, hold, held, release, close, pid, errors };
}

const focused = (locator) => locator.evaluate((node) => node === document.activeElement);
const button = (page, name) => page.getByRole("button", { name, exact: true });
const summary = (page) => page.locator(".demo-graph-summary");
const groupStatus = (page) => page.locator(".demo-graph > output");
async function prepare(t) {
  const c = await open(t), { page } = c;
  const notice = page.getByRole("region", { name: "最近一次操作提示", exact: true });
  await page.getByRole("region", { name: "实例属性", exact: true })
    .getByRole("row").filter({ has: page.getByRole("cell", { name: "y", exact: true }) })
    .getByRole("button", { name: "选择端口", exact: true }).click();
  await notice.getByText(/ports require inside or outside side/).waitFor();
  await button(page, "关闭操作提示").click();
  await button(page, "显示原理图").click();
  await page.getByLabel("追踪侧", { exact: true }).selectOption("inside");
  return c;
}
async function seedGrouping(c) {
  const { page } = c;
  await button(page, "追踪所选对象").click();
  await summary(page).getByText(/Core 追踪 · success/).waitFor();
  await button(page, "高级控制").click();
  await page.locator("summary").filter({ hasText: "分组与折叠" }).click();
  await page.locator("summary").filter({ hasText: "演示与标注" }).click();
}
async function pendingGroup(c) {
  await c.hold("inst.get");
  await button(c.page, "按所属实例分组").click();
  await c.held();
  await groupStatus(c.page).filter({ hasText: "分组查询：pending" }).waitFor();
  const cancel = button(c.page, "取消分组查询");
  assert.equal(await cancel.isEnabled(), true);
  await cancel.focus();
  return cancel;
}
for (const outcome of ["success", "failed", "cancelled"]) {
  test(`trace ${outcome} retires only its focused cancellation control`, { timeout: 30_000 }, async (t) => {
    const c = await prepare(t), { page } = c;
    if (outcome === "failed") await page.getByLabel("追踪侧", { exact: true }).selectOption("");
    await c.hold("trace.cone");
    await button(page, "追踪所选对象").click();
    await c.held();
    const cancel = button(page, "取消追踪");
    await cancel.focus();
    if (outcome === "cancelled") await cancel.press("Enter");
    await c.release(outcome === "cancelled");
    await summary(page).getByText(new RegExp(`Core 追踪 · ${outcome}`)).waitFor();
    assert.equal(await cancel.isVisible(), false);
    assert.equal(await focused(button(page, "高级控制")), true, "retired trace cancellation returns owned focus");
    const notice = page.getByRole("region", { name: "最近一次操作提示", exact: true });
    if (outcome === "failed") {
      await notice.getByText(/invalid side for this object/).waitFor();
      await page.getByLabel("追踪侧", { exact: true }).selectOption("inside");
      await button(page, "追踪所选对象").click();
      await summary(page).getByText(/Core 追踪 · success/).waitFor();
      await notice.getByText(/invalid side for this object/).waitFor();
    } else assert.equal(await notice.count(), 0);
    await c.close(false);
    console.log(JSON.stringify({ outcome, kind: "trace", pid: c.pid, errors: c.errors, closed: true }));
  });
}
for (const action of ["success", "cancel", "clear", "revision"]) {
  test(`grouping ${action} retires its natively disabled cancellation control without reviving old results`, { timeout: 30_000 }, async (t) => {
    const c = await prepare(t), { page } = c;
    await seedGrouping(c);
    const cancel = await pendingGroup(c);
    if (action === "cancel") await cancel.press("Enter");
    // DOM/AT activation preserves the actual pending-control focus until commit.
    if (action === "clear") await button(page, "使用追踪显示组").evaluate((node) => node.click());
    if (action === "revision") await button(page, "添加外部示例").evaluate((node) => node.click());
    await c.release(action !== "success");
    if (action === "success" || action === "cancel") {
      await groupStatus(page).filter({ hasText: `分组查询：${action === "success" ? "success" : "cancelled"}` }).waitFor();
    } else assert.equal(await groupStatus(page).count(), 0);
    assert.equal(await cancel.isVisible(), true);
    assert.equal(await cancel.isDisabled(), true);
    assert.equal(await focused(button(page, "高级控制")), true, "disabled group cancellation returns owned focus");
    if (action === "success") assert.equal(await page.getByRole("button", { name: /^折叠 hierarchy 实例 / }).count(), 1);
    if (action === "revision") await summary(page).getByText(/外部示例（非 DFT 分析） · success/).waitFor();
    await c.close(false);
    console.log(JSON.stringify({ action, kind: "grouping", pid: c.pid, errors: c.errors, closed: true }));
  });
}
test("trace and grouping terminal notifications preserve external query focus and draft", { timeout: 30_000 }, async (t) => {
  const c = await prepare(t), { page } = c;
  const search = page.getByRole("textbox", { name: "搜索", exact: true });
  await c.hold("trace.cone");
  await button(page, "追踪所选对象").click();
  await c.held();
  await search.fill("retained-task-draft");
  await search.focus();
  await search.evaluate((node) => node.setSelectionRange(2, 8));
  await c.release();
  await summary(page).getByText(/Core 追踪 · success/).waitFor();
  assert.equal(await focused(search), true);
  assert.deepEqual(await search.evaluate((node) => [node.value, node.selectionStart, node.selectionEnd]), ["retained-task-draft", 2, 8]);
  await button(page, "高级控制").click();
  await page.locator("summary").filter({ hasText: "分组与折叠" }).click();
  await pendingGroup(c);
  await search.focus();
  await c.release();
  await groupStatus(page).filter({ hasText: "分组查询：success" }).waitFor();
  assert.equal(await focused(search), true);
  assert.equal(await search.inputValue(), "retained-task-draft");
  await c.close(false);
  console.log(JSON.stringify({ kind: "external", pid: c.pid, errors: c.errors, closed: true }));
});
