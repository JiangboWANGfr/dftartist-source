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
  await page.getByRole("treeitem").first().waitFor();
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
test(
  "actual input cancellation and retry retain the same control, focus, snapshot and source through a late Core reply",
  { timeout: 30_000 },
  async (t) => {
    const { electron, page, info, file, pids, hold, captured, release, close } = await setup(t);
    const tree = page.getByRole("tree", { name: "设计层级", exact: true });
    await tree.focus();
    await tree.press("Enter");
    const source = page.getByRole("region", { name: "设计源码", exact: true });
    await source
      .getByText(/assign y=a/)
      .first()
      .waitFor();
    const sourceText = await source.textContent(),
      opened = await info.locator("time").getAttribute("datetime");
    const button = await info
      .getByRole("button", { name: "检查输入变化", exact: true })
      .elementHandle();
    await hold();
    await button.click();
    await captured();
    const same = await info
      .getByRole("button", { name: "取消检查", exact: true })
      .evaluate((node, old) => node === old, button);
    assert.equal(same, true, "one persistent command control");
    assert(await button.evaluate((node) => node === document.activeElement));
    await button.click();
    await info.locator('[data-input-phase="cancelled"]').waitFor();
    assert(await button.evaluate((node) => node === document.activeElement));
    const capture = await release();
    assert.equal(capture.ids.length, 1);
    assert.equal(capture.held, 1);
    assert(capture.cancels.includes(capture.ids[0]));
    await writeFile(file, "module changed; endmodule\n");
    await button.click();
    await info.getByText("检查完成：1 个文件已变化", { exact: true }).waitFor();
    assert(await button.evaluate((node) => node === document.activeElement));
    assert.equal(await info.locator("time").getAttribute("datetime"), opened);
    assert.equal(await source.textContent(), sourceText);
    assert.equal(await page.getByRole("treeitem").first().getAttribute("aria-selected"), "true");
    assert.deepEqual(children(electron.process().pid), pids);
    await close();
    console.log(
      JSON.stringify({
        case: "cancel-retry",
        capture,
        pids,
        sameControl: same,
        sourcePreserved: true,
        closed: true,
      }),
    );
  },
);
test(
  "focus bursts join one actual pending check and success does not steal external input focus",
  { timeout: 30_000 },
  async (t) => {
    const { electron, page, info, hold, captured, release, close } = await setup(t);
    await hold();
    const search = page.getByRole("textbox", { name: "搜索", exact: true });
    await search.focus();
    await page.evaluate(() => {
      for (let n = 0; n < 20; n++) window.dispatchEvent(new Event("focus"));
    });
    await captured();
    assert(await search.evaluate((node) => node === document.activeElement));
    const capture = await release();
    assert.equal(capture.ids.length, 1);
    assert.equal(capture.held, 1);
    assert.deepEqual(capture.cancels, []);
    await info.locator('[data-input-phase="success"]').waitFor();
    assert(await search.evaluate((node) => node === document.activeElement));
    await info.getByRole("button", { name: "检查输入变化", exact: true }).click();
    await info.locator('[data-input-phase="success"]').waitFor();
    await close();
    console.log(
      JSON.stringify({ case: "focus-burst", capture, externalFocusPreserved: true, closed: true }),
    );
  },
);
test(
  "a paused picker permits cancelling an existing check and no new check until the picker is settled",
  { timeout: 30_000 },
  async (t) => {
    const { electron, page, info, hold, captured, release, close } = await setup(t);
    await hold();
    const button = await info
      .getByRole("button", { name: "检查输入变化", exact: true })
      .elementHandle();
    await button.click();
    await captured();
    await electron.evaluate(({ dialog }) => {
      dialog.showOpenDialog = () =>
        new Promise((resolve) => {
          globalThis.aInputPicker = () => resolve({ canceled: true, filePaths: [] });
        });
    });
    await page.getByRole("button", { name: "打开设计", exact: true }).click();
    await page.waitForSelector('.demo-status[data-phase="picking"]');
    assert.equal(
      await info.getByRole("button", { name: "取消检查", exact: true }).isEnabled(),
      true,
    );
    assert.equal(
      await info
        .getByRole("button", { name: "取消检查", exact: true })
        .evaluate((node, old) => node === old, button),
      true,
    );
    await button.click();
    await info.locator('[data-input-phase="cancelled"]').waitFor();
    assert.equal(await button.isDisabled(), true);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const capture = await release();
    assert.equal(capture.ids.length, 1);
    assert(capture.cancels.includes(capture.ids[0]));
    await electron.evaluate(() => globalThis.aInputPicker());
    await page.waitForSelector('.demo-status[data-phase="ready"]');
    assert.equal(await button.isEnabled(), true);
    await button.click();
    await info.locator('[data-input-phase="success"]').waitFor();
    await close();
    console.log(JSON.stringify({ case: "picker-paused", capture, closed: true }));
  },
);
