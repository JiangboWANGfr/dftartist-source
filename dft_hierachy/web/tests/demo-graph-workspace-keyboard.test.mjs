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
  await page.getByRole("treeitem").first().click();
  await page.locator(".demo-source-workspace code").filter({ hasText: "assign y = mid" }).waitFor();
  const code = await page.locator(".demo-source-workspace code").elementHandle();
  const selected = await page.locator('[role="treeitem"][aria-selected="true"]').textContent();
  const pid = children(electron.process().pid);
  assert.equal(pid.length, 1);
  await electron.evaluate(({ ipcMain }) => {
    globalThis.aKeyboardQueries = [];
    ipcMain.on("hier:bridge:send", (_event, body) => {
      globalThis.aKeyboardQueries.push(JSON.parse(body.json).method);
    });
  });
  async function resize(width, height = 968) {
    await electron.evaluate(
      ({ BrowserWindow }, { width, height }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(width, height),
      { width, height },
    );
    await page.waitForFunction(
      ({ width, height }) => innerWidth === width && innerHeight === height,
      {
        width,
        height,
      },
    );
    // Drain ResizeObserver/React presentation work; this is not a timed product SLA.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  }
  async function unchanged() {
    assert.deepEqual(await electron.evaluate(() => globalThis.aKeyboardQueries), []);
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
  return { page, electron, resize, unchanged, close, errors, pid };
}

const focused = (locator) => locator.evaluate((node) => node === document.activeElement);
const selectedTab = (page) => page.getByRole("tab", { selected: true });
async function keyAt(locator, key, mode = "ordinary") {
  return locator.evaluate((node, { key, mode }) => {
    const event = new KeyboardEvent("keydown", {
      key, bubbles: true, cancelable: true, isComposing: mode === "composition",
    });
    if (mode === "consumed") event.preventDefault();
    node.dispatchEvent(event);
    return event.defaultPrevented;
  }, { key, mode });
}
async function graph(c) {
  const { page } = c;
  await page.getByRole("button", { name: "显示原理图", exact: true }).click();
  const options = page.getByRole("button", { name: "高级控制", exact: true });
  const info = page.getByRole("button", { name: "来源与详情", exact: true });
  await options.click();
  await page.locator("summary").getByText("追踪选项", { exact: true }).click();
  const width = page.getByRole("spinbutton", { name: "追踪 width", exact: true });
  return { options, info, width };
}

for (const mode of ["composition", "consumed"]) {
  test("Inspector tabs preserve " + mode + " input before handling their own native navigation", { timeout: 30_000 }, async (t) => {
    const c = await open(t), { page } = c;
    const last = page.getByRole("tab", { name: "路径结果", exact: true });
    await last.click();
    for (const key of ["Home", "ArrowRight", "ArrowLeft", "End"]) {
      await keyAt(last, key, mode);
      assert.equal(await selectedTab(page).innerText(), "路径结果", mode + " must not switch Inspector");
      assert.equal(await focused(last), true, mode + " must not move focus");
    }
    const names = ["实例属性", "对象连接", "搜索结果", "定义实例", "路径结果"];
    await page.keyboard.press("ArrowRight");
    assert.equal(await selectedTab(page).innerText(), names[0], "native wrap from last");
    for (const name of names.slice(1)) {
      await page.keyboard.press("ArrowRight");
      assert.equal(await selectedTab(page).innerText(), name);
      assert.equal(await focused(selectedTab(page)), true);
    }
    await page.keyboard.press("Home");
    assert.equal(await selectedTab(page).innerText(), names[0]);
    await page.keyboard.press("ArrowLeft");
    assert.equal(await selectedTab(page).innerText(), names.at(-1));
    await page.keyboard.press("Home");
    await page.keyboard.press("End");
    assert.equal(await selectedTab(page).innerText(), names.at(-1));
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    assert.equal(await selectedTab(page).innerText(), names.at(-1));
    assert.equal(await page.getByRole("tab").evaluateAll((tabs) => tabs.filter((tab) => tab.tabIndex === 0).length), 1);
    await c.close();
  });
}

test("unfocused and hidden Inspector tabs cannot route another task's keyboard event", { timeout: 30_000 }, async (t) => {
  const c = await open(t), { page } = c;
  const search = page.getByRole("textbox", { name: "搜索", exact: true });
  await search.fill("retained draft");
  for (const name of ["实例属性", "对象连接", "搜索结果", "定义实例", "路径结果"]) {
    const tab = page.getByRole("tab", { name, exact: true });
    await tab.click();
    await search.focus();
    for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
      await keyAt(tab, key);
      assert.equal(await selectedTab(page).innerText(), name, "unfocused " + name + " ignores " + key);
      assert.equal(await focused(search), true);
    }
  }
  await page.getByRole("button", { name: "对象详情", exact: true }).evaluate((node) => node.click());
  const hiddenTab = page.getByRole("tab", { name: "实例属性", exact: true, includeHidden: true });
  await keyAt(hiddenTab, "Home");
  assert.equal(await focused(search), true);
  await page.getByRole("button", { name: "对象详情", exact: true }).evaluate((node) => node.click());
  assert.equal(await selectedTab(page).innerText(), "路径结果", "hidden event did not mutate selected context");
  assert.equal(await search.inputValue(), "retained draft");
  await c.close();
});

test("query Escape requires the current focused control as its origin and keeps both drafts", { timeout: 30_000 }, async (t) => {
  const c = await open(t), { page } = c;
  const toggle = page.getByRole("button", { name: "查询工具", exact: true });
  const search = page.getByRole("textbox", { name: "搜索", exact: true });
  const target = page.getByRole("textbox", { name: "路径", exact: true });
  await search.fill("search draft");
  await target.fill("path draft ");
  await target.focus();
  await keyAt(search, "Escape");
  assert.equal(await toggle.getAttribute("aria-expanded"), "true", "peer search event cannot close focused path");
  assert.equal(await focused(target), true);
  await keyAt(page.getByRole("region", { name: "搜索与路径查询", exact: true }), "Escape");
  assert.equal(await toggle.getAttribute("aria-expanded"), "true", "unfocused region itself does not own a key");
  for (const mode of ["composition", "consumed"]) {
    await keyAt(target, "Escape", mode);
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  }
  await page.keyboard.press("Escape");
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  assert.equal(await focused(toggle), true);
  await page.keyboard.press("Enter");
  assert.equal(await search.inputValue(), "search draft");
  assert.equal(await target.inputValue(), "path draft ");
  await c.close();
});

test("graph controls ignore Escape from another control while preserving the focused parameter", { timeout: 30_000 }, async (t) => {
  const c = await open(t), { page } = c;
  const { options, info, width } = await graph(c);
  await width.fill("3");
  const original = await width.elementHandle();
  await width.focus();
  await keyAt(info, "Escape");
  assert.equal(await options.getAttribute("aria-expanded"), "true", "toolbar event cannot close focused options");
  assert.equal(await focused(width), true);
  await keyAt(page.getByRole("region", { name: "图工作区", exact: true }), "Escape");
  assert.equal(await options.getAttribute("aria-expanded"), "true");
  for (const mode of ["composition", "consumed"]) {
    await keyAt(width, "Escape", mode);
    assert.equal(await options.getAttribute("aria-expanded"), "true");
  }
  await page.keyboard.press("Escape");
  assert.equal(await options.getAttribute("aria-expanded"), "false");
  assert.equal(await focused(options), true);
  await page.keyboard.press("Space");
  assert.equal(await width.inputValue(), "3");
  assert.equal(await width.evaluate((node, old) => node === old, original), true);
  await c.close();
});

test("graph information owns its actual overflowing focus without accepting an options peer event", { timeout: 30_000 }, async (t) => {
  const c = await open(t), { page } = c;
  await c.resize(1200, 640);
  const { options, info, width } = await graph(c);
  await page.locator("summary").getByText("演示与标注", { exact: true }).click();
  await page.getByRole("button", { name: "添加外部示例", exact: true }).click();
  await info.click();
  const details = page.locator(".hier-schematic-view__information");
  await details.getByText("plan · success", { exact: true }).waitFor();
  await page.waitForFunction(() => {
    const node = document.querySelector(".hier-schematic-view__information");
    return node.scrollHeight > node.clientHeight;
  });
  await details.focus();
  assert.equal(await focused(details), true);
  const old = await details.elementHandle(), text = await details.innerText();
  await keyAt(width, "Escape");
  assert.equal(await info.getAttribute("aria-expanded"), "true", "options peer does not close focused information");
  assert.equal(await focused(details), true);
  assert.equal(await options.getAttribute("aria-expanded"), "true");
  for (const mode of ["composition", "consumed"]) {
    await keyAt(details, "Escape", mode);
    assert.equal(await info.getAttribute("aria-expanded"), "true");
  }
  await page.keyboard.press("Escape");
  assert.equal(await info.getAttribute("aria-expanded"), "false");
  assert.equal(await focused(info), true);
  assert.equal(await options.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Enter");
  assert.equal(await details.innerText(), text);
  assert.equal(await details.evaluate((node, prior) => node === prior, old), true);
  await c.close();
});
