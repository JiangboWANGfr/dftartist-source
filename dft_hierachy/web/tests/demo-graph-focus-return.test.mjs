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
async function setup(t) {
  assert(process.env.HIER_BIN, "explicit real Core");
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
  await page.getByRole("treeitem").first().waitFor();
  return { page, errors };
}
const atClick = (locator) => locator.evaluate((element) => element.click());
const focused = (locator) => locator.evaluate((element) => element === document.activeElement);
async function close(page, errors) {
  assert.deepEqual(errors, []);
  await page.getByRole("button", { name: "关闭设计", exact: true }).click();
  await page.getByText("设计已关闭", { exact: true }).waitFor();
}

test("workspace sidebars return owned content and divider focus without taking external input", { timeout: 30000 }, async (t) => {
  const { page, errors } = await setup(t);
  const search = page.getByRole("textbox", { name: "搜索", exact: true });
  const input = await search.elementHandle();
  await search.fill("retained draft");
  for (const [toggleLabel, rootSelector, focusLabel, dividerLabel] of [
    ["设计导航", ".demo-left", "设计层级", "设计导航宽度"],
    ["对象详情", ".demo-right", "实例属性", "对象详情宽度"],
  ]) {
    const toggle = page.getByRole("button", { name: toggleLabel, exact: true });
    const root = page.locator(rootSelector);
    const owner = await root.elementHandle();
    const content = toggleLabel === "设计导航"
      ? page.getByRole("tree", { name: focusLabel, exact: true })
      : page.getByRole("tab", { name: focusLabel, exact: true });
    for (const target of [content, page.getByRole("separator", { name: dividerLabel, exact: true })]) {
      await target.focus();
      await atClick(toggle);
      await root.waitFor({ state: "hidden" });
      assert.equal(await focused(toggle), true, "closing an owned region returns its visible entry");
      await toggle.press("Enter");
      assert.equal(await root.evaluate((element, old) => element === old, owner), true);
    }
    await search.focus();
    await atClick(toggle);
    await root.waitFor({ state: "hidden" });
    assert.equal(await focused(search), true, "external focus remains external");
    await atClick(toggle);
    assert.equal(await focused(search), true, "revealing a sidebar does not take external focus");
  }
  assert.equal(await search.evaluate((element, old) => element === old, input), true);
  assert.equal(await search.inputValue(), "retained draft");
  await close(page, errors);
});

test("workspace view switches and explicit graph removal return only hidden content focus", { timeout: 30000 }, async (t) => {
  const { page, errors } = await setup(t);
  await page.getByRole("treeitem").first().click();
  const source = page.getByRole("region", { name: "设计源码", exact: true });
  await source.locator("code").waitFor();
  const code = await source.locator("code").elementHandle();
  const text = await source.locator("code").textContent();
  const sourceTab = page.getByRole("button", { name: "源码", exact: true });
  const graphTab = page.getByRole("button", { name: "原理图", exact: true });
  const splitTab = page.getByRole("button", { name: "双视图", exact: true });
  await source.locator("pre").focus();
  await atClick(page.getByRole("button", { name: "显示原理图", exact: true }));
  await source.waitFor({ state: "hidden" });
  assert.equal(await focused(graphTab), true);
  const graphControl = page.getByRole("button", { name: "高级控制", exact: true });
  await graphControl.focus();
  await atClick(splitTab);
  assert.equal(await focused(graphControl), true, "split reveals source without hiding graph");
  const divider = page.getByRole("separator", { name: "原理图与源码分隔", exact: true });
  await divider.focus();
  await atClick(graphTab);
  assert.equal(await focused(graphTab), true, "hidden split separator belongs to the old view");
  await graphControl.focus();
  await atClick(sourceTab);
  assert.equal(await focused(sourceTab), true);
  assert.equal(await source.locator("code").evaluate((element, old) => element === old, code), true);
  assert.equal(await source.locator("code").textContent(), text);
  await atClick(graphTab);
  await graphControl.focus();
  await atClick(page.getByRole("button", { name: "收起原理图", exact: true }));
  assert.equal(await focused(page.getByRole("button", { name: "显示原理图", exact: true })), true);
  assert.equal(await page.getByRole("treeitem").first().getAttribute("aria-selected"), "true");
  await close(page, errors);
});

test("workspace candidate collapse returns its list or separator focus and preserves external focus", { timeout: 30000 }, async (t) => {
  const { page, errors } = await setup(t);
  const toggle = page.getByRole("button", { name: /^源码候选 / });
  const slot = page.locator(".demo-candidates-slot");
  const original = await slot.elementHandle();
  const search = page.getByRole("textbox", { name: "搜索", exact: true });
  await search.focus();
  await atClick(toggle);
  assert.equal(await focused(search), true);
  for (const owner of [
    page.getByRole("list", { name: "源码候选候选列表", exact: true }),
    page.getByRole("separator", { name: "源码候选高度", exact: true }),
  ]) {
    await owner.focus();
    await atClick(toggle);
    await slot.waitFor({ state: "hidden" });
    assert.equal(await focused(toggle), true);
    await toggle.press("Space");
    assert.equal(await slot.evaluate((element, old) => element === old, original), true);
  }
  await search.focus();
  await atClick(toggle);
  assert.equal(await focused(search), true);
  await close(page, errors);
});

test("new external focus revokes an older queued Inspector return even after that input blurs", { timeout: 30000 }, async (t) => {
  const { page, errors } = await setup(t);
  await page.getByRole("textbox", { name: "路径", exact: true }).fill("demo_graph_top");
  await page.getByRole("button", { name: "定位", exact: true }).click();
  const choice = page.getByRole("region", { name: "路径结果", exact: true }).getByRole("button", { name: "选择对象", exact: true });
  await choice.waitFor();
  await choice.focus();
  await choice.evaluate((element) => {
    element.click();
    const input = document.querySelector('input[aria-label="搜索"]');
    input.focus();
    input.blur();
  });
  await page.getByRole("region", { name: "实例属性", exact: true }).waitFor();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.evaluate(() => document.activeElement === document.body), true,
    "a later focus owner revoked the old handoff, even when it subsequently chose to blur");
  await close(page, errors);
});

test("an unrelated sidebar change does not revoke a queued result focus return", { timeout: 30000 }, async (t) => {
  const { page, errors } = await setup(t);
  await page.getByRole("textbox", { name: "路径", exact: true }).fill("demo_graph_top");
  await page.getByRole("button", { name: "定位", exact: true }).click();
  const choice = page.getByRole("region", { name: "路径结果", exact: true }).getByRole("button", { name: "选择对象", exact: true });
  await choice.waitFor();
  await choice.focus();
  await choice.evaluate((element) => {
    element.click();
    document.querySelector('button[aria-label="设计导航"]').click();
  });
  await page.locator(".demo-left").waitFor({ state: "hidden" });
  assert.equal(await focused(page.getByRole("tab", { name: "实例属性", exact: true })), true,
    "only a new focus choice or owned hiding action replaces a pending return");
  await close(page, errors);
});
