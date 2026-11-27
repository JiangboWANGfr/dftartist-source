import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright";
const web = fileURLToPath(new URL("../", import.meta.url)),
  consumer = process.env.HIER_A_DEMO_DELIVERY;
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo"),
  binary = createRequire(path.join(consumer ?? web, "package.json"))("electron");
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
async function setup(t) {
  assert(process.env.HIER_BIN, "explicit actual Core executable");
  const temp = await mkdtemp(path.join(tmpdir(), "hier-a-input-actual-")),
    file = path.join(temp, "top.sv");
  const original = "module top(input logic a, output logic y); assign y=a; endmodule\n";
  await writeFile(file, original);
  const electron = await _electron.launch({
    executablePath: binary,
    args: [app],
    env: process.env,
  });
  t.after(async () => {
    await electron.close();
    await rm(temp, { recursive: true });
  });
  const errors = [],
    page = await electron.firstWindow();
  page.setDefaultTimeout(6000);
  page.on("pageerror", (error) => errors.push(error.message));
  await electron.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, file);
  await page.getByRole("button", { name: "打开设计", exact: true }).click();
  await page.waitForSelector('.demo-status[data-phase="ready"]');
  const info = page.getByRole("region", { name: "设计信息", exact: true });
  await page.getByRole("treeitem").filter({ hasText: "top" }).first().waitFor();
  const pids = children(electron.process().pid);
  assert.equal(pids.length, 1);
  async function hold() {
    await electron.evaluate(({ BrowserWindow, ipcMain }) => {
      const frame = BrowserWindow.getAllWindows()[0].webContents.mainFrame,
        send = frame.send;
      const state = (globalThis.aInputHold = { ids: [], held: [], cancels: [] });
      const observe = (_event, body) => {
        const request = JSON.parse(body.json);
        if (request.method === "design.checkInputs") state.ids.push(request.id);
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
      globalThis.aReleaseInput = () => {
        frame.send = send;
        ipcMain.removeListener("hier:bridge:send", observe);
        for (const args of state.held.splice(0)) send.apply(frame, args);
      };
    });
  }
  async function captured() {
    for (let n = 0; n < 100; n++) {
      if (await electron.evaluate(() => globalThis.aInputHold.held.length > 0)) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail("actual Core input reply was not captured");
  }
  async function release() {
    const capture = await electron.evaluate(() => ({
      ids: globalThis.aInputHold.ids,
      cancels: globalThis.aInputHold.cancels,
      held: globalThis.aInputHold.held.length,
    }));
    await electron.evaluate(() => globalThis.aReleaseInput());
    return capture;
  }
  async function close() {
    assert.deepEqual(errors, []);
    await page.getByRole("button", { name: "关闭设计", exact: true }).click();
    await page.waitForSelector('.demo-status[data-phase="idle"]');
    assert.deepEqual(children(electron.process().pid), []);
    for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  }
  return { electron, page, info, errors, file, original, pids, hold, captured, release, close };
}
const focused = (control) => control.evaluate(node => node === document.activeElement);
async function prepare(t) {
  const c = await setup(t), { page, electron, info } = c;
  await page.getByRole("treeitem").filter({ hasText: "top" }).first().click();
  await page.locator(".demo-source-workspace code").filter({ hasText: "assign y=a" }).waitFor();
  c.code = await page.locator(".demo-source-workspace code").elementHandle();
  c.opened = await info.locator("time").getAttribute("datetime");
  c.control = await info.getByRole("button", { name: "检查输入变化", exact: true }).elementHandle();
  await electron.evaluate(({ ipcMain }) => {
    globalThis.aContinuityCount = 0;
    ipcMain.on("hier:bridge:send", (_event, body) => {
      if (JSON.parse(body.json).method === "design.checkInputs") globalThis.aContinuityCount++;
    });
  });
  return c;
}
async function pause(c) {
  await c.electron.evaluate(({ dialog }) => {
    dialog.showOpenDialog = () => new Promise(done => { globalThis.aContinuityPicker = () => done({ canceled: true, filePaths: [] }); });
  });
  await c.page.getByRole("button", { name: "打开设计", exact: true }).evaluate(node => node.click());
  await c.page.waitForSelector('.demo-status[data-phase="picking"]');
}
async function blocked(c, count) {
  assert.equal(await c.control.isDisabled(), true, "semantic disabled remains discoverable");
  assert.equal(await c.control.evaluate(node => node.disabled), false, "persistent disabled action remains focusable");
  assert.equal(await c.control.getAttribute("aria-disabled"), "true");
  await c.control.evaluate(node => node.click());
  await c.page.evaluate(() => { for (let n = 0; n < 10; n++) window.dispatchEvent(new Event("focus")); });
  assert.equal(await c.electron.evaluate(() => globalThis.aContinuityCount), count, "paused manual/focus triggers issue no check");
}
async function resume(c) {
  await c.electron.evaluate(() => globalThis.aContinuityPicker());
  await c.page.waitForSelector('.demo-status[data-phase="ready"]');
  assert.equal(await c.control.isEnabled(), true);
  assert.equal(await c.page.locator(".demo-source-workspace code").evaluate((node, old) => node === old, c.code), true);
  assert.equal(await c.info.locator("time").getAttribute("datetime"), c.opened);
  assert.deepEqual(children(c.electron.process().pid), c.pids);
}
test("pausing an idle input control retains its focus and rejects every disabled activation", { timeout: 30_000 }, async (t) => {
  const c = await prepare(t);
  await c.control.focus(); await pause(c);
  assert.equal(await focused(c.control), true, "pause does not strand the persistent check focus");
  await blocked(c, 0);
  await c.page.keyboard.press("Enter"); await c.page.keyboard.press("Space");
  assert.equal(await c.electron.evaluate(() => globalThis.aContinuityCount), 0);
  await resume(c); assert.equal(await focused(c.control), true);
  await c.page.keyboard.press("Enter");
  await c.info.locator('[data-input-phase="success"]').waitFor();
  assert.equal(await c.electron.evaluate(() => globalThis.aContinuityCount), 1);
  await c.close(); t.diagnostic(JSON.stringify({ case: "idle", pid: c.pids, errors: c.errors, closed: true }));
});
test("a paused input completion keeps the same focused control without queuing a new check", { timeout: 30_000 }, async (t) => {
  const c = await prepare(t);
  await c.hold(); await c.control.click(); await c.captured();
  await pause(c);
  const capture = await c.release(); assert.equal(capture.ids.length, 1); assert.equal(capture.held, 1);
  await c.info.locator('[data-input-phase="success"]').waitFor();
  assert.equal(await focused(c.control), true, "terminal completion retains focus while paused");
  await blocked(c, 1); await resume(c);
  await c.page.keyboard.press("Space"); await c.info.locator('[data-input-phase="success"]').waitFor();
  assert.equal(await c.electron.evaluate(() => globalThis.aContinuityCount), 2);
  await c.close(); t.diagnostic(JSON.stringify({ case: "success", pid: c.pids, errors: c.errors, closed: true }));
});
test("paused native cancellation retains the Core observation, control focus and late-reply revocation", { timeout: 30_000 }, async (t) => {
  const c = await prepare(t);
  await writeFile(c.file, "module changed; endmodule\n");
  await c.control.click(); await c.info.getByText("检查完成：1 个文件已变化", { exact: true }).waitFor();
  await c.hold(); await c.control.click(); await c.captured(); await pause(c);
  await c.page.keyboard.press("Enter"); await c.info.locator('[data-input-phase="cancelled"]').waitFor();
  assert.equal(await focused(c.control), true, "cancel retains the persistent control focus");
  await c.info.getByText(/上次检查发现：输入文件已变化/).waitFor();
  const capture = await c.release(); assert(capture.ids.every(id => capture.cancels.includes(id)));
  await c.page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await c.info.locator('[data-input-phase="cancelled"]').count(), 1);
  await blocked(c, 2); await resume(c);
  await c.page.keyboard.press("Space"); await c.info.getByText("检查完成：1 个文件已变化", { exact: true }).waitFor();
  assert.equal(await c.electron.evaluate(() => globalThis.aContinuityCount), 3);
  await c.close(); t.diagnostic(JSON.stringify({ case: "cancelled", pid: c.pids, errors: c.errors, closed: true }));
});
test("paused completion preserves external query focus, draft and source while blocking manual reentry", { timeout: 30_000 }, async (t) => {
  const c = await prepare(t);
  await c.hold(); await c.control.click(); await c.captured();
  const search = c.page.getByRole("textbox", { name: "搜索", exact: true });
  await search.fill("retained-input-draft"); await search.focus();
  await search.evaluate(node => node.setSelectionRange(2, 8)); await pause(c); await c.release();
  await c.info.locator('[data-input-phase="success"]').waitFor();
  assert.equal(await focused(search), true);
  assert.deepEqual(await search.evaluate(node => [node.value, node.selectionStart, node.selectionEnd]), ["retained-input-draft", 2, 8]);
  await blocked(c, 1); assert.equal(await focused(search), true);
  await resume(c); assert.equal(await focused(search), true);
  await c.close(); t.diagnostic(JSON.stringify({ case: "external", pid: c.pids, errors: c.errors, closed: true }));
});
