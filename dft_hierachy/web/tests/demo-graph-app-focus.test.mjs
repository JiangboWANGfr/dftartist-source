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
  await page.locator(".demo-source-workspace code").filter({ hasText: "assign y = mid" }).waitFor();
  const code = await page.locator(".demo-source-workspace code").elementHandle();
  const selected = await page.locator('[role="treeitem"][aria-selected="true"]').textContent();
  const pid = children(electron.process().pid);
  assert.equal(pid.length, 1);
  await electron.evaluate(({ ipcMain }) => {
    globalThis.aAppQueries = [];
    ipcMain.on("hier:bridge:send", (_event, body) => {
      globalThis.aAppQueries.push(JSON.parse(body.json).method);
    });
  });
  async function unchanged() {
    assert.deepEqual(await electron.evaluate(() => globalThis.aAppQueries), []);
    assert.equal(
      await page.locator(".demo-source-workspace code").evaluate((node, old) => node === old, code),
      true,
    );
    assert.equal(
      await page.locator('[role="treeitem"][aria-selected="true"]').textContent(),
      selected,
    );
    assert.deepEqual(children(electron.process().pid), pid);
    assert.deepEqual(errors, []);
  }
  async function close() {
    await unchanged();
    await page.getByRole("button", { name: "关闭设计", exact: true }).click();
    await page.waitForSelector('.demo-status[data-phase="idle"]');
    assert.deepEqual(children(electron.process().pid), []);
    assert.throws(() => process.kill(pid[0], 0), { code: "ESRCH" });
    assert.deepEqual(errors, []);
  }
  return { page, electron, unchanged, close, errors, pid };
}

const focused = (locator) => locator.evaluate((node) => node === document.activeElement);
const status = (page) => page.getByRole("status", { name: "设计状态", exact: true });
const notice = (page) => page.getByRole("region", { name: "最近一次操作提示", exact: true });
async function prepareNotice(c) {
  const { page, electron } = c;
  await page.getByLabel("路径", { exact: true }).fill("[");
  await page.getByRole("button", { name: "定位", exact: true }).click();
  const result = page.getByRole("region", { name: "路径结果", exact: true });
  await result.getByText("路径定位失败", { exact: true }).waitFor();
  await notice(page).getByText(/invalid hierarchy path syntax/).waitFor();
  const text = await result.getByRole("status").innerText();
  await electron.evaluate(() => { globalThis.aAppQueries = []; });
  return { result, text, dismiss: notice(page).getByRole("button", { name: "关闭操作提示", exact: true }) };
}

test("App notice dismissal preserves external editor focus and selection without clearing the Core error", { timeout: 30_000 }, async (t) => {
  const c = await open(t), { page } = c;
  const { result, text, dismiss } = await prepareNotice(c);
  const top = page.getByRole("textbox", { name: "顶层", exact: true });
  await top.fill("retained-top-draft");
  await top.focus();
  await top.evaluate((node) => node.setSelectionRange(2, 8));
  // DOM/AT activation intentionally keeps the editor as the actual focused owner.
  await dismiss.evaluate((node) => node.click());
  assert.equal(await notice(page).count(), 0);
  assert.equal(await focused(top), true, "dismissing another region must not take external focus");
  assert.deepEqual(await top.evaluate((node) => [node.value, node.selectionStart, node.selectionEnd]), ["retained-top-draft", 2, 8]);
  assert.equal(await result.getByRole("status").innerText(), text);
  assert.equal(await page.getByLabel("路径", { exact: true }).inputValue(), "[");
  await c.close();
});

test("owned notice Enter and Space return only the removed notice focus after commit", { timeout: 30_000 }, async (t) => {
  const c = await open(t), { page } = c;
  for (const key of ["Enter", "Space"]) {
    const { result, text, dismiss } = await prepareNotice(c);
    await dismiss.focus();
    await page.keyboard.press(key);
    assert.equal(await notice(page).count(), 0);
    assert.equal(await focused(status(page)), true);
    assert.equal(await result.getByRole("status").innerText(), text);
    await c.unchanged();
  }
  await c.close();
});

async function connecting(t) {
  assert(process.env.HIER_BIN, "explicit actual Core executable");
  const electron = await _electron.launch({ executablePath: binary, args: [app], env: process.env });
  t.after(() => electron.close());
  const page = await electron.firstWindow(), errors = [];
  page.setDefaultTimeout(6000);
  page.on("pageerror", (error) => errors.push(error.message));
  await electron.evaluate(({ dialog, BrowserWindow, ipcMain }, input) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
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

test("native cancellation of a connecting session returns focus and late hello cannot revive it", { timeout: 30_000 }, async (t) => {
  const c = await connecting(t), { page } = c;
  await page.keyboard.press("Enter");
  await page.waitForSelector('.demo-status[data-phase="cancelled"]');
  assert.equal(await focused(status(page)), true, "removed cancellation button returns its owned focus");
  await gone(c);
  await release(c);
  await drain(page);
  assert.equal(await page.locator(".demo-status").getAttribute("data-phase"), "cancelled");
  assert.equal(await page.getByRole("treeitem").count(), 0);
  assert.deepEqual(await c.electron.evaluate(() => globalThis.aAppConnectQueries), []);
  await gone(c);
  t.diagnostic(JSON.stringify({ terminal: "cancelled", pid: c.pid, lateOriginalHello: true }));
});

test("natural handshake success returns a disappearing cancel control's focus without selecting a root", { timeout: 30_000 }, async (t) => {
  const c = await connecting(t), { page } = c;
  await release(c);
  await page.waitForSelector('.demo-status[data-phase="ready"]');
  assert.equal(await focused(status(page)), true, "natural completion preserves owned keyboard continuity");
  await page.getByRole("treeitem").filter({ hasText: "demo_graph_top" }).first().waitFor();
  assert.equal(await page.locator('[role="treeitem"][aria-selected="true"]').count(), 0);
  await page.getByRole("region", { name: "设计源码", exact: true }).getByText("未选择源码", { exact: true }).waitFor();
  assert.deepEqual(children(c.electron.process().pid), c.pid);
  assert.equal(await page.getByRole("button", { name: "取消打开", exact: true }).count(), 0);
  await page.getByRole("button", { name: "关闭设计", exact: true }).click();
  await page.waitForSelector('.demo-status[data-phase="idle"]');
  await gone(c);
  t.diagnostic(JSON.stringify({ terminal: "ready", pid: c.pid, noAutomaticSelection: true }));
});

test("real Core exit before hello returns removed control focus and retains the terminal failure", { timeout: 30_000 }, async (t) => {
  const c = await connecting(t), { page } = c;
  // Intentional native failure boundary: terminate only this test's owned idle Core.
  process.kill(c.pid[0], "SIGTERM");
  await page.waitForSelector('.demo-status[data-phase="failed"]');
  assert.equal(await focused(status(page)), true, "failure removal returns only its owned control focus");
  const message = await status(page).innerText();
  assert(message.length > 0);
  await gone(c);
  await release(c);
  await drain(page);
  assert.equal(await page.locator(".demo-status").getAttribute("data-phase"), "failed");
  assert.equal(await status(page).innerText(), message, "late original hello does not replace failure");
  assert.equal(await page.getByRole("treeitem").count(), 0);
  await gone(c);
  t.diagnostic(JSON.stringify({ terminal: "failed", pid: c.pid, intentionalOwnedCoreSignal: "SIGTERM" }));
});


test("App document close returns owned source, query and toolbar focus after removing their workspace", { timeout: 30_000 }, async (t) => {
  for (const region of ["source", "query", "toolbar"]) {
    const c = await open(t), { page } = c;
    await c.unchanged();
    const target = region === "source" ? page.getByRole("region", { name: "设计源码", exact: true }).locator("pre")
      : region === "query" ? page.getByRole("textbox", { name: "搜索", exact: true })
      : page.getByRole("button", { name: "源码", exact: true });
    await target.focus();
    assert.equal(await focused(target), true);
    await page.getByRole("button", { name: "关闭设计", exact: true }).evaluate((node) => node.click());
    await page.waitForSelector('.demo-status[data-phase="idle"]');
    assert.equal(await focused(status(page)), true, region + " close returns owned retiring focus");
    assert.equal(await page.locator(".demo-columns").count(), 0);
    assert.equal(await page.getByRole("treeitem").count(), 0);
    await gone(c);
    t.diagnostic(JSON.stringify({ region, closed: true, pid: c.pid }));
  }
});

test("App document close returns owned design information focus without starting an input check", { timeout: 30_000 }, async (t) => {
  const c = await open(t), { page, electron } = c;
  await page.getByRole("region", { name: "设计信息", exact: true }).getByRole("button", { name: "检查输入变化", exact: true }).focus();
  await page.getByRole("button", { name: "关闭设计", exact: true }).evaluate((node) => node.click());
  await page.waitForSelector('.demo-status[data-phase="idle"]');
  assert.equal(await focused(status(page)), true, "removed design information returns owned focus");
  assert.equal(await page.getByRole("region", { name: "设计信息", exact: true }).count(), 0);
  assert.deepEqual(await electron.evaluate(() => globalThis.aAppQueries), []);
  await gone(c);
  t.diagnostic(JSON.stringify({ region: "design-information", closed: true, pid: c.pid }));
});
