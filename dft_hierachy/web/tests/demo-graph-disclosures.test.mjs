import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright";
const web = fileURLToPath(new URL("../", import.meta.url));
const consumer = process.env.HIER_A_DEMO_DELIVERY;
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo");
const binary = createRequire(path.join(consumer ?? web, "package.json"))("electron");
const design = fileURLToPath(new URL("./demo-graph/design.sv", import.meta.url));
const atClick = (control) => control.evaluate((element) => element.click());
const focused = (control) => control.evaluate((element) => document.activeElement === element);
async function setup(t) {
  assert(process.env.HIER_BIN, "explicit actual Core");
  const electron = await _electron.launch({ executablePath: binary, args: [app], env: process.env });
  t.after(() => electron.close());
  const page = await electron.firstWindow();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await electron.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, design);
  await page.getByRole("button", { name: "打开设计", exact: true }).click();
  await page.waitForSelector('.demo-status[data-phase="ready"]');
  await page.getByRole("treeitem").first().click();
  const source = page.getByRole("region", { name: "设计源码", exact: true });
  await source.locator("code").waitFor();
  async function close() {
    assert.deepEqual(errors, []);
    await page.getByRole("button", { name: "关闭设计", exact: true }).click();
    await page.getByText("设计已关闭", { exact: true }).waitFor();
  }
  async function graph() {
    await page.getByRole("button", { name: "显示原理图", exact: true }).click();
    const options = page.getByRole("button", { name: "高级控制", exact: true });
    await options.click();
    await page.locator("summary").getByText("追踪选项", { exact: true }).click();
    const width = page.getByRole("spinbutton", { name: "追踪 width", exact: true });
    await width.fill("2");
    return { options, width, info: page.getByRole("button", { name: "来源与详情", exact: true }) };
  }
  return { page, electron, source, close, graph };
}

test("query disclosure preserves external source focus, drafts and results while owned Escape returns its entry", { timeout: 30000 }, async (t) => {
  const { page, source, close } = await setup(t);
  const query = page.getByRole("region", { name: "搜索与路径查询", exact: true });
  const toggle = page.getByRole("button", { name: "查询工具", exact: true });
  const search = page.getByRole("textbox", { name: "搜索", exact: true });
  const pathInput = page.getByRole("textbox", { name: "路径", exact: true });
  await search.fill("mid");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  const result = page.getByRole("region", { name: "搜索结果", exact: true });
  await result.getByRole("cell", { name: "mid", exact: true }).first().waitFor();
  const resultText = await result.innerText();
  await pathInput.fill("demo_graph_top.y ");
  const input = await pathInput.elementHandle();
  const code = await source.locator("code").elementHandle();
  await source.locator("pre").focus();
  await atClick(toggle);
  await query.waitFor({ state: "hidden" });
  assert.equal(await focused(source.locator("pre")), true, "closing another region does not claim focus");
  assert.equal(await result.innerText(), resultText);
  assert.equal(await source.locator("code").evaluate((element, old) => element === old, code), true);
  await toggle.focus();
  await toggle.press("Enter");
  assert.equal(await focused(search), true, "explicit opening retains direct query entry");
  assert.equal(await pathInput.evaluate((element, old) => element === old, input), true);
  assert.equal(await pathInput.inputValue(), "demo_graph_top.y ");
  await pathInput.focus();
  await page.keyboard.press("Escape");
  await query.waitFor({ state: "hidden" });
  assert.equal(await focused(toggle), true);
  await close();
});

test("advanced graph disclosure returns owned form focus and retains external query focus and parameter identity", { timeout: 30000 }, async (t) => {
  const { page, close, graph } = await setup(t);
  const { options, width, info } = await graph();
  const old = await width.elementHandle();
  await info.click();
  await width.focus();
  await atClick(options);
  await width.waitFor({ state: "hidden" });
  assert.equal(await focused(options), true);
  assert.equal(await info.getAttribute("aria-expanded"), "true", "the other disclosure stays open");
  await options.press("Space");
  assert.equal(await width.evaluate((element, previous) => element === previous, old), true);
  assert.equal(await width.inputValue(), "2");
  const search = page.getByRole("textbox", { name: "搜索", exact: true });
  await search.focus();
  await atClick(options);
  assert.equal(await focused(search), true);
  await close();
});

test("real overflowing graph information returns its scroll-container focus when hidden", { timeout: 30000 }, async (t) => {
  const { page, electron, close, graph } = await setup(t);
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1200, 640));
  const { info } = await graph();
  await page.locator("summary").getByText("演示与标注", { exact: true }).click();
  await page.getByRole("button", { name: "添加外部示例", exact: true }).click();
  await info.click();
  const details = page.locator(".hier-schematic-view__information");
  await details.getByText("plan · success", { exact: true }).waitFor();
  await page.waitForFunction(() => {
    const e = document.querySelector(".hier-schematic-view__information");
    return e.scrollHeight > e.clientHeight;
  });
  await details.focus();
  assert.equal(await focused(details), true, "actual browser-focusable overflowing content");
  const old = await details.elementHandle();
  const text = await details.innerText();
  await atClick(info);
  await details.waitFor({ state: "hidden" });
  assert.equal(await focused(info), true);
  await info.press("Enter");
  assert.equal(await details.evaluate((element, previous) => element === previous, old), true);
  assert.equal(await details.innerText(), text);
  await close();
});

test("nested disclosure and parent view removal choose a visible parent entry and revoke newer focus", { timeout: 30000 }, async (t) => {
  const { page, close, graph } = await setup(t);
  const { options, width } = await graph();
  await width.focus();
  await options.evaluate((element) => {
    element.click();
    [...document.querySelectorAll('button')].find((e) => e.textContent === "源码").click();
  });
  assert.equal(await focused(page.getByRole("button", { name: "源码", exact: true })), true);
  await page.getByRole("button", { name: "原理图", exact: true }).click();
  await options.click();
  await width.focus();
  await options.evaluate((element) => {
    element.click();
    const input = document.querySelector('input[aria-label="搜索"]');
    input.focus();
    input.blur();
  });
  await width.waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => document.activeElement === document.body), true);
  await options.click();
  await width.focus();
  await options.evaluate((element) => {
    element.click();
    [...document.querySelectorAll('button')].find((e) => e.textContent === "收起原理图").click();
  });
  assert.equal(await focused(page.getByRole("button", { name: "显示原理图", exact: true })), true);
  await close();
});

test("Escape belongs to actual query or graph content and preserves composed or consumed input", { timeout: 30000 }, async (t) => {
  const { page, source, close, graph } = await setup(t);
  const search = page.getByRole("textbox", { name: "搜索", exact: true });
  const queries = page.getByRole("button", { name: "查询工具", exact: true });
  await source.locator("pre").focus();
  await search.evaluate((element) => element.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Escape", bubbles: true, cancelable: true,
  })));
  assert.equal(await queries.getAttribute("aria-expanded"), "true", "an unfocused query control cannot close another task");
  assert.equal(await focused(source.locator("pre")), true);
  const { options, width, info } = await graph();
  await info.click();
  await width.focus();
  for (const mode of ["composed", "consumed"]) {
    await width.evaluate((element, mode) => {
      const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true,
        isComposing: mode === "composed" });
      if (mode === "consumed") event.preventDefault();
      element.dispatchEvent(event);
    }, mode);
    assert.equal(await options.getAttribute("aria-expanded"), "true");
    assert.equal(await focused(width), true);
  }
  await page.keyboard.press("Escape");
  await width.waitFor({ state: "hidden" });
  assert.equal(await focused(options), true);
  assert.equal(await info.getAttribute("aria-expanded"), "true");
  assert.equal(await queries.getAttribute("aria-expanded"), "true");
  await close();
});
