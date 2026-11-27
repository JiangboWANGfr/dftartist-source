import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

const focused = (locator) => locator.evaluate((node) => node === document.activeElement);
const status = (page) => page.getByRole("status", { name: "设计状态", exact: true });
const button = (page, name) => page.getByRole("button", { name, exact: true });
async function launch(t) {
  assert(process.env.HIER_BIN, "explicit actual Core executable");
  const electron = await _electron.launch({ executablePath: binary, args: [app], env: process.env });
  t.after(() => electron.close());
  await electron.evaluate(({ dialog }, file) => {
    globalThis.aDesignPickerCalls = 0;
    dialog.showOpenDialog = async () => {
      globalThis.aDesignPickerCalls++;
      return { canceled: false, filePaths: [file] };
    };
  }, design);
  const page = await electron.firstWindow(), errors = [];
  page.setDefaultTimeout(6000);
  page.on("pageerror", (error) => errors.push(error.message));
  return { electron, page, errors };
}
async function ready(c) {
  await button(c.page, "打开设计").click();
  await c.page.waitForSelector('.demo-status[data-phase="ready"]');
  await c.page.getByRole("treeitem").filter({ hasText: "demo_graph_top" }).first().click();
  await c.page.locator(".demo-source-workspace code").filter({ hasText: "assign y = mid" }).waitFor();
  c.code = await c.page.locator(".demo-source-workspace code").elementHandle();
  c.pid = children(c.electron.process().pid);
  assert.equal(c.pid.length, 1);
}
async function holdPicker(c) {
  await c.electron.evaluate(({ dialog }) => {
    dialog.showOpenDialog = () => {
      globalThis.aDesignPickerCalls++;
      return new Promise((done) => { globalThis.aCancelDesignPicker = () => done({ canceled: true, filePaths: [] }); });
    };
  });
}
async function cancelPicker(c) {
  await c.electron.evaluate(() => globalThis.aCancelDesignPicker());
  await c.page.waitForSelector('.demo-status[data-phase="ready"]');
  assert.deepEqual(children(c.electron.process().pid), c.pid);
  assert.equal(await c.page.locator(".demo-source-workspace code").evaluate((node, code) => node === code, c.code), true);
  assert.deepEqual(c.errors, []);
}
async function close(c) {
  await button(c.page, "关闭设计").focus();
  await c.page.keyboard.press("Enter");
  await c.page.waitForSelector('.demo-status[data-phase="idle"]');
  assert.deepEqual(children(c.electron.process().pid), []);
  assert.throws(() => process.kill(c.pid[0], 0), { code: "ESRCH" });
  assert.deepEqual(c.errors, []);
}
test("native Enter in top-level design input opens exactly once and closing never resubmits", { timeout: 30_000 }, async (t) => {
  const c = await launch(t), { page } = c;
  const top = page.getByRole("textbox", { name: "顶层", exact: true });
  await top.fill("demo_graph_top");
  const url = page.url();
  await top.press("Enter");
  await page.waitForSelector('.demo-status[data-phase="ready"]');
  await page.getByRole("treeitem").filter({ hasText: "demo_graph_top" }).first().waitFor();
  assert.equal(page.url(), url, "native form submission does not navigate the document");
  assert.equal(await page.getByRole("form", { name: "设计操作", exact: true }).count(), 1);
  assert.equal(await button(page, "打开设计").getAttribute("type"), "submit");
  assert.equal(await button(page, "关闭设计").getAttribute("type"), "button");
  assert.equal(await c.electron.evaluate(() => globalThis.aDesignPickerCalls), 1);
  c.pid = children(c.electron.process().pid);
  assert.equal(c.pid.length, 1);
  await close(c);
  assert.equal(await c.electron.evaluate(() => globalThis.aDesignPickerCalls), 1);
  t.diagnostic(JSON.stringify({ kind: "native-submit", pid: c.pid, errors: c.errors, closed: true }));
});
for (const owner of ["输入类型", "顶层", "打开设计", "关闭设计"]) {
  test(`busy design operation returns focus owned by the disabled ${owner} control`, { timeout: 30_000 }, async (t) => {
    const c = await launch(t), { page } = c;
    await ready(c);
    const top = page.getByRole("textbox", { name: "顶层", exact: true });
    await top.fill("demo_graph_top");
    await holdPicker(c);
    const control = owner === "顶层" ? top : owner === "输入类型" ? page.getByLabel("输入类型") : button(page, owner);
    await control.focus();
    if (owner === "打开设计") await control.press("Enter");
    else await button(page, "打开设计").evaluate((node) => node.click());
    await page.waitForSelector('.demo-status[data-phase="picking"]');
    assert.equal(await control.isDisabled(), true);
    assert.equal(await focused(status(page)), true, "disabled owned design control returns focus after commit");
    assert.deepEqual(children(c.electron.process().pid), c.pid);
    await cancelPicker(c);
    assert.equal(await control.isEnabled(), true);
    assert.equal(await top.inputValue(), "demo_graph_top");
    assert.equal(await focused(status(page)), true);
    assert.equal(await c.electron.evaluate(() => globalThis.aDesignPickerCalls), 2);
    await close(c);
    assert.equal(await c.electron.evaluate(() => globalThis.aDesignPickerCalls), 2);
    t.diagnostic(JSON.stringify({ owner, pid: c.pid, errors: c.errors, closed: true }));
  });
}
test("busy design operation preserves external query focus, selection and original source", { timeout: 30_000 }, async (t) => {
  const c = await launch(t), { page } = c;
  await ready(c);
  await holdPicker(c);
  const search = page.getByRole("textbox", { name: "搜索", exact: true });
  await search.fill("retained-design-draft");
  await search.focus();
  await search.evaluate((node) => node.setSelectionRange(2, 8));
  await button(page, "打开设计").evaluate((node) => node.click());
  await page.waitForSelector('.demo-status[data-phase="picking"]');
  assert.equal(await focused(search), true);
  assert.deepEqual(await search.evaluate((node) => [node.value, node.selectionStart, node.selectionEnd]), ["retained-design-draft", 2, 8]);
  await cancelPicker(c);
  assert.equal(await focused(search), true);
  assert.equal(await search.inputValue(), "retained-design-draft");
  await close(c);
  t.diagnostic(JSON.stringify({ kind: "external", pid: c.pid, errors: c.errors, closed: true }));
});
async function connecting(t) {
  assert(process.env.HIER_BIN, "explicit actual Core executable");
  const electron = await _electron.launch({ executablePath: binary, args: [app], env: process.env });
  t.after(() => electron.close());
  const page = await electron.firstWindow(), errors = [];
  page.setDefaultTimeout(6000);
  page.on("pageerror", (error) => errors.push(error.message));
  await electron.evaluate(({ dialog, BrowserWindow, ipcMain }, input) => {
    globalThis.aDesignPickerCalls = 0;
    dialog.showOpenDialog = async () => { globalThis.aDesignPickerCalls++; return { canceled: false, filePaths: [input] }; };
    const frame = BrowserWindow.getAllWindows()[0].webContents.mainFrame, send = frame.send;
    let resolve;
    globalThis.aAppHelloHeld = new Promise((done) => { resolve = done; });
    const held = [];
    frame.send = function (...args) {
      const event = args[1]?.event;
      if (event?.kind === "frame" && JSON.parse(event.json).event === "hello") {
        held.push(args); resolve(); return;
      }
      return send.apply(this, args);
    };
    globalThis.aAppReleaseHello = () => {
      frame.send = send;
      for (const args of held) send.apply(frame, args);
      return held.length;
    };
    globalThis.aAppConnectQueries = [];
    ipcMain.on("hier:bridge:send", (_event, body) => {
      globalThis.aAppConnectQueries.push(JSON.parse(body.json).method);
    });
  }, design);
  await page.getByRole("button", { name: "打开设计", exact: true }).click();
  await page.waitForSelector('.demo-status[data-phase="connecting"]');
  await electron.evaluate(() => globalThis.aAppHelloHeld);
  const pid = children(electron.process().pid);
  assert.equal(pid.length, 1);
  const cancel = page.getByRole("button", { name: "取消打开", exact: true });
  await cancel.focus();
  return { electron, page, pid, errors, cancel };
}
async function release(c) {
  assert.equal(await c.electron.evaluate(() => globalThis.aAppReleaseHello()), 1, "one original real Core hello frame");
}
async function drain(page) {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}
async function gone(c) {
  assert.deepEqual(children(c.electron.process().pid), []);
  assert.throws(() => process.kill(c.pid[0], 0), { code: "ESRCH" });
  assert.deepEqual(c.errors, []);
}

test("native connecting cancellation remains a single close command inside the design form", { timeout: 30_000 }, async (t) => {
  const c = await connecting(t), { page } = c;
  assert.equal(await c.cancel.getAttribute("type"), "button", "cancel is never an implicit submitter");
  assert.equal(await c.electron.evaluate(() => globalThis.aDesignPickerCalls), 1);
  await page.keyboard.press("Enter");
  await page.waitForSelector('.demo-status[data-phase="cancelled"]');
  await gone(c);
  await release(c);
  await drain(page);
  assert.equal(await page.locator(".demo-status").getAttribute("data-phase"), "cancelled");
  assert.equal(await c.electron.evaluate(() => globalThis.aDesignPickerCalls), 1);
  assert.equal(await focused(status(page)), true);
  await gone(c);
  t.diagnostic(JSON.stringify({ kind: "native-cancel", pid: c.pid, errors: c.errors, closed: true }));
});
test("ready Core failure returns a disabled close control's focus without reopening a design", { timeout: 30_000 }, async (t) => {
  const c = await launch(t), { page } = c;
  await ready(c);
  await button(page, "关闭设计").focus();
  // Native failure input, limited to this test's owned idle Core.
  process.kill(c.pid[0], "SIGTERM");
  await page.waitForSelector('.demo-status[data-phase="failed"]');
  assert.equal(await button(page, "关闭设计").isDisabled(), true);
  assert.equal(await focused(status(page)), true, "the unavailable close control returns its owned focus");
  assert((await status(page).innerText()).length > 0);
  assert.equal(await page.getByRole("treeitem").count(), 0);
  assert.equal(await c.electron.evaluate(() => globalThis.aDesignPickerCalls), 1);
  assert.deepEqual(children(c.electron.process().pid), []);
  assert.throws(() => process.kill(c.pid[0], 0), { code: "ESRCH" });
  assert.deepEqual(c.errors, []);
  t.diagnostic(JSON.stringify({ kind: "native-failure", pid: c.pid, errors: c.errors, closed: true }));
});
