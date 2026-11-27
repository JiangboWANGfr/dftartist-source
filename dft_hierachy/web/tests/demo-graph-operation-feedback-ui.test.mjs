import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright";
const web = fileURLToPath(new URL("../", import.meta.url));
const consumer = process.env.HIER_A_DEMO_DELIVERY;
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo");
const binary = createRequire(path.join(consumer ?? web, "package.json"))("electron");
const design = fileURLToPath(new URL("./demo-graph/design.sv", import.meta.url));
function coreChildren(parent) {
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
async function open(t, input = design) {
  assert(process.env.HIER_BIN, "explicit actual Core executable");
  const electron = await _electron.launch({
    executablePath: binary,
    args: [app],
    env: process.env,
  });
  t.after(() => electron.close());
  await electron.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, input);
  const page = await electron.firstWindow();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "打开设计", exact: true }).click();
  await page.waitForSelector('.demo-status[data-phase="ready"]');
  await page.getByRole("treeitem").first().click();
  const pid = coreChildren(electron.process().pid);
  assert.equal(pid.length, 1);
  await electron.evaluate(({ ipcMain }) => {
    globalThis.aFeedbackMethods = [];
    ipcMain.on("hier:bridge:send", (_event, body) => {
      globalThis.aFeedbackMethods.push(JSON.parse(body.json).method);
    });
  });
  return { electron, page, errors, pid };
}
async function close({ electron, page, errors, pid }) {
  await page.getByRole("button", { name: "关闭设计", exact: true }).click();
  await page.waitForSelector('.demo-status[data-phase="idle"]');
  assert.deepEqual(coreChildren(electron.process().pid), []);
  assert.throws(() => process.kill(pid[0], 0), { code: "ESRCH" });
  assert.deepEqual(errors, []);
}

test(
  "real component retry uses one dismissible host notice without clearing Core error, selection, or query",
  { timeout: 30_000 },
  async (t) => {
    const context = await open(t),
      { page, electron, pid } = context;
    await page.getByLabel("路径", { exact: true }).fill("[");
    await page.getByRole("button", { name: "定位", exact: true }).click();
    const paths = page.getByRole("region", { name: "路径结果", exact: true });
    await paths.getByText("路径定位失败", { exact: true }).waitFor();
    const notice = page.getByRole("region", { name: "最近一次操作提示", exact: true });
    await notice.getByText(/invalid hierarchy path syntax/).waitFor();
    await notice.getByRole("button", { name: "关闭操作提示", exact: true }).click();
    assert.equal(await notice.count(), 0);
    await paths.getByRole("button", { name: "重新定位", exact: true }).click();
    await notice.getByText(/invalid hierarchy path syntax/).waitFor();
    assert.equal(
      await page.locator(".demo-command-feedback").count(),
      0,
      "no second host feedback store",
    );
    assert.equal(await notice.count(), 1);
    assert.equal(await page.locator(".demo-status").getAttribute("data-phase"), "ready");
    await page.getByLabel("搜索", { exact: true }).fill("demo_graph_top");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await page
      .getByRole("region", { name: "搜索结果", exact: true })
      .getByText("正在搜索", { exact: true })
      .waitFor({ state: "hidden" });
    assert.match(
      await notice.innerText(),
      /invalid hierarchy path syntax/,
      "a different successful query does not resolve history",
    );
    await page.getByRole("tab", { name: "路径结果", exact: true }).click();
    const original = await paths.getByRole("status").innerText();
    const selected = await page.locator('[role="treeitem"][aria-selected="true"]').innerText();
    await notice.getByRole("button", { name: "关闭操作提示", exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.equal(await notice.count(), 0);
    assert.equal(await paths.getByRole("status").innerText(), original);
    assert.equal(
      await page
        .getByRole("status", { name: "设计状态", exact: true })
        .evaluate((node) => node === document.activeElement),
      true,
    );
    assert.equal(await page.getByLabel("路径", { exact: true }).inputValue(), "[");
    assert.equal(
      await page.locator('[role="treeitem"][aria-selected="true"]').innerText(),
      selected,
    );
    assert.deepEqual(coreChildren(electron.process().pid), pid);
    assert.equal(
      await electron.evaluate(
        () => globalThis.aFeedbackMethods.filter((m) => m === "path.resolve").length,
      ),
      2,
    );
    await close(context);
    console.log(
      JSON.stringify({ originalPathErrorRetained: true, pid, pageErrors: context.errors }),
    );
  },
);

test(
  "source position binding and browser fallback survive unrelated form, sidebar and viewport renders",
  { timeout: 30_000 },
  async (t) => {
    const context = await open(t),
      { page, electron } = context;
    const source = page.getByRole("region", { name: "设计源码", exact: true });
    await source.locator("code").filter({ hasText: "assign y = mid" }).waitFor();
    const code = await source.locator("code").elementHandle();
    const original = await source.locator("code").innerText();
    // Only the browser caret capability boundary is absent; no Core or DOM text is fabricated.
    await page.evaluate(() => {
      Object.defineProperty(document, "caretPositionFromPoint", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(document, "caretRangeFromPoint", {
        configurable: true,
        value: undefined,
      });
    });
    await source.locator("code").dblclick();
    const hint = source.getByText("无法从鼠标位置查询，请选中文本后按 Alt+Enter", { exact: true });
    await hint.waitFor();
    await page.getByLabel("搜索", { exact: true }).fill("unsubmitted text");
    await page.getByRole("button", { name: "设计导航", exact: true }).click();
    await page.getByRole("button", { name: "设计导航", exact: true }).click();
    await electron.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 800),
    );
    await hint.waitFor();
    assert.equal(await code.evaluate((node) => node.isConnected), true);
    assert.equal(await source.locator("code").innerText(), original);
    assert.equal(
      await electron.evaluate(
        () => globalThis.aFeedbackMethods.filter((m) => m === "source.resolve").length,
      ),
      0,
    );
    assert.equal(
      await page.getByRole("region", { name: "最近一次操作提示", exact: true }).count(),
      0,
    );
    await page
      .getByRole("region", { name: "实例属性", exact: true })
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "y", exact: true }) })
      .getByRole("button", { name: "选择端口", exact: true })
      .click();
    await source.locator("code").filter({ hasText: "assign y = mid" }).waitFor();
    assert.equal(
      await hint.count(),
      0,
      "a genuinely new document still revokes the old feedback binding",
    );
    await close(context);
  },
);

test(
  "source scalar-boundary failure reaches the unified notice and retains current view feedback after dismissal",
  { timeout: 30_000 },
  async (t) => {
    const folder = await mkdtemp(path.join(tmpdir(), "hier-a-feedback-unicode-")),
      input = path.join(folder, "design.sv");
    await writeFile(
      input,
      "module feedback_unicode(input logic a, output logic y);\n  // scalar boundary 😀 end\n  assign y = a;\nendmodule\n",
    );
    const context = await open(t, input),
      { page, electron } = context;
    t.after(() => rm(folder, { recursive: true }));
    const source = page.getByRole("region", { name: "设计源码", exact: true });
    await source.locator("code").filter({ hasText: "scalar boundary" }).waitFor();
    await source.locator("pre").focus();
    // Controlled native DOM Range exercises the real public UTF-16 position guard.
    // This is not a claim that an OS text input method places carets inside a scalar.
    await source.locator("code").evaluate((code) => {
      const offset = code.textContent.indexOf("😀") + 1;
      if (offset <= 0) throw new Error("missing scalar fixture");
      const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      let node,
        remaining = offset;
      while ((node = walker.nextNode())) {
        if (remaining <= node.textContent.length) {
          const range = document.createRange();
          range.setStart(node, remaining);
          range.collapse(true);
          const selected = document.getSelection();
          selected.removeAllRanges();
          selected.addRange(range);
          return;
        }
        remaining -= node.textContent.length;
      }
      throw new Error("scalar DOM boundary not found");
    });
    await page.keyboard.press("Alt+Enter");
    const notice = page.getByRole("region", { name: "最近一次操作提示", exact: true });
    await notice.getByText(/Offset splits a scalar or CRLF/).waitFor();
    await source.getByText("源码位置查询失败", { exact: true }).waitFor();
    assert.equal(await page.locator(".demo-command-feedback").count(), 0);
    await notice.getByRole("button", { name: "关闭操作提示", exact: true }).click();
    await page.getByLabel("搜索", { exact: true }).fill("preserve current source failure");
    await source.getByText("源码位置查询失败", { exact: true }).waitFor();
    assert.equal(await notice.count(), 0);
    assert.equal(
      await electron.evaluate(
        () => globalThis.aFeedbackMethods.filter((m) => m === "source.resolve").length,
      ),
      0,
      "position validation rejects before an RPC",
    );
    await source.locator("pre").focus();
    await source.locator("code").evaluate((code) => {
      let remaining = code.textContent.indexOf("assign y");
      const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (remaining <= node.textContent.length) {
          const range = document.createRange();
          range.setStart(node, remaining);
          range.collapse(true);
          const selected = document.getSelection();
          selected.removeAllRanges();
          selected.addRange(range);
          return;
        }
        remaining -= node.textContent.length;
      }
      throw new Error("valid source position not found");
    });
    await page.keyboard.press("Alt+Enter");
    await page
      .getByRole("region", { name: "源码候选", exact: true })
      .getByRole("status")
      .filter({ hasText: /已加载 \d+ 个候选|未找到候选/ })
      .waitFor();
    assert.equal(await source.getByText("源码位置查询失败", { exact: true }).count(), 0);
    assert.equal(await notice.count(), 0);
    assert.equal(
      await electron.evaluate(
        () => globalThis.aFeedbackMethods.filter((m) => m === "source.resolve").length,
      ),
      1,
      "an explicit valid retry still reaches Core",
    );
    await close(context);
    console.log(
      JSON.stringify({
        actualSourceWithControlledDOMScalarBoundary: true,
        pageErrors: context.errors,
      }),
    );
  },
);
