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
const size = async (divider) => Number(await divider.getAttribute("aria-valuenow"));

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
    globalThis.aResizeQueries = [];
    ipcMain.on("hier:bridge:send", (_event, body) => {
      globalThis.aResizeQueries.push(JSON.parse(body.json).method);
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
    assert.deepEqual(await electron.evaluate(() => globalThis.aResizeQueries), []);
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

async function startDrag(page, divider, delta) {
  const box = await divider.boundingBox();
  const horizontal = (await divider.getAttribute("aria-orientation")) === "horizontal";
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await divider.evaluate((node) => {
    node.addEventListener(
      "pointerdown",
      (event) => {
        globalThis.aResizePointer = event.pointerId;
      },
      { once: true },
    );
  });
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + (horizontal ? 0 : delta), y + (horizontal ? delta : 0), { steps: 3 });
  assert.equal(
    await divider.evaluate((node) => node.hasPointerCapture(globalThis.aResizePointer)),
    true,
  );
}

async function cancelDrag(page, divider, mode) {
  if (mode === "Escape") await page.keyboard.press("Escape");
  else if (mode === "lostcapture") {
    await divider.evaluate((node) => node.releasePointerCapture(globalThis.aResizePointer));
    // Native lostpointercapture is delivered at the next pointer event.
    await page.mouse.move(10, 10);
  } else {
    // Browser cancellation event boundary, not a physical touch device claim.
    await divider.evaluate((node) =>
      node.dispatchEvent(
        new PointerEvent("pointercancel", {
          pointerId: globalThis.aResizePointer,
          bubbles: true,
        }),
      ),
    );
  }
  await page.mouse.up();
  assert.equal(
    await divider.evaluate((node) => node.hasPointerCapture(globalThis.aResizePointer)),
    false,
  );
}

test(
  "sidebar cancelled drags preserve responsive defaults and unclamped preferences",
  { timeout: 30_000 },
  async (t) => {
    const c = await open(t),
      { page, resize } = c;
    const nav = page.getByRole("separator", { name: "设计导航宽度" });
    const inspector = page.getByRole("separator", { name: "对象详情宽度" });
    for (const [divider, defaultWide, defaultNarrow] of [
      [nav, 200, 170],
      [inspector, 300, 270],
    ]) {
      for (const mode of ["Escape", "pointercancel", "lostcapture"]) {
        await resize(1440);
        await divider.focus();
        await page.keyboard.press("Enter");
        assert.equal(await size(divider), defaultWide);
        await startDrag(page, divider, -20);
        await cancelDrag(page, divider, mode);
        await resize(960);
        assert.equal(await size(divider), defaultNarrow, mode + " keeps responsive default");
        await resize(1440);
        await divider.focus();
        await page.keyboard.press("End");
        const preference = await size(divider);
        await resize(960);
        const constrained = await size(divider);
        assert(constrained < preference);
        await startDrag(page, divider, -20);
        await cancelDrag(page, divider, mode);
        assert.equal(await size(divider), constrained);
        await resize(1440);
        assert.equal(await size(divider), preference, mode + " keeps unconstrained preference");
        await divider.focus();
        await page.keyboard.press("Enter");
      }
    }
    // Programmatic host visibility change while native pointer capture is active.
    for (const [divider, button] of [
      [nav, "设计导航"],
      [inspector, "对象详情"],
    ]) {
      await startDrag(page, divider, -20);
      await page
        .getByRole("button", { name: button, exact: true })
        .evaluate((node) => node.click());
      await page.mouse.up();
      await page.getByRole("button", { name: button, exact: true }).click();
      await resize(960);
      assert.equal(await size(divider), button === "设计导航" ? 170 : 270);
      await resize(1440);
    }
    await c.close();
  },
);

test(
  "split cancellation restores independent axes through constrained resize, hide and axis replacement",
  { timeout: 30_000 },
  async (t) => {
    const c = await open(t),
      { page, resize } = c;
    await page.getByRole("button", { name: "显示原理图", exact: true }).click();
    await page.getByRole("button", { name: "双视图", exact: true }).click();
    const divider = page.getByRole("separator", { name: "原理图与源码分隔", exact: true });
    const preferences = {};
    for (const [axis, wide, narrow] of [
      ["vertical", [1800, 968], [1500, 968]],
      ["horizontal", [960, 1100], [960, 760]],
    ]) {
      await resize(...wide);
      assert.equal(await divider.getAttribute("aria-orientation"), axis);
      await divider.focus();
      await page.keyboard.press("End");
      preferences[axis] = await size(divider);
      await resize(...narrow);
      assert((await size(divider)) < preferences[axis]);
      await startDrag(page, divider, -20);
      await cancelDrag(page, divider, axis === "vertical" ? "Escape" : "pointercancel");
      await resize(...wide);
      assert.equal(await size(divider), preferences[axis]);
      await startDrag(page, divider, -20);
      await page
        .getByRole("button", { name: "源码", exact: true })
        .evaluate((node) => node.click());
      await page.mouse.up();
      await page.getByRole("button", { name: "双视图", exact: true }).click();
      assert.equal(await size(divider), preferences[axis], "hide rolls back draft");
    }
    await startDrag(page, divider, -20);
    const old = await divider.elementHandle();
    await resize(1800);
    await page.mouse.up();
    assert.equal(await old.evaluate((node) => node.isConnected), false, "axis replaces handle");
    assert.equal(await size(divider), preferences.vertical);
    await resize(960, 1100);
    assert.equal(await size(divider), preferences.horizontal, "old axis draft was discarded");
    await divider.focus();
    await page.keyboard.press("Enter");
    const defaultHeight = await size(divider);
    await startDrag(page, divider, 20);
    await cancelDrag(page, divider, "lostcapture");
    await resize(960, 968);
    assert.notEqual(await size(divider), defaultHeight, "cancel keeps proportional default");
    await c.close();
  },
);

test(
  "candidate height cancellation and keyboard guards retain document and isolate a replacement design",
  { timeout: 30_000 },
  async (t) => {
    const c = await open(t),
      { page, resize } = c;
    await resize(1440, 1100);
    await page.getByRole("button", { name: "源码候选 展开", exact: true }).click();
    const divider = page.getByRole("separator", { name: "源码候选高度", exact: true });
    for (const mode of ["Escape", "pointercancel", "lostcapture"]) {
      await divider.focus();
      await page.keyboard.press("End");
      const preference = await size(divider);
      await resize(1440, 640);
      assert((await size(divider)) < preference);
      await startDrag(page, divider, -20);
      await cancelDrag(page, divider, mode);
      await resize(1440, 1100);
      assert.equal(await size(divider), preference);
    }
    await divider.focus();
    await page.keyboard.press("Enter");
    const original = await size(divider);
    for (const target of [divider, page.getByRole("separator", { name: "设计导航宽度" })]) {
      for (const mode of ["composition", "consumed"]) {
        await target.focus();
        const before = await size(target);
        await target.evaluate((node, mode) => {
          for (const key of ["ArrowDown", "ArrowRight", "Home", "End", "Enter"]) {
            const event = new KeyboardEvent("keydown", {
              key,
              bubbles: true,
              cancelable: true,
              isComposing: mode === "composition",
            });
            if (mode === "consumed") event.preventDefault();
            node.dispatchEvent(event);
          }
        }, mode);
        assert.equal(await size(target), before, mode);
        await startDrag(page, target, -20);
        const draft = await size(target);
        await target.evaluate((node, mode) => {
          const event = new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
            isComposing: mode === "composition",
          });
          if (mode === "consumed") event.preventDefault();
          node.dispatchEvent(event);
        }, mode);
        assert.equal(await size(target), draft);
        assert.equal(
          await target.evaluate((node) => node.hasPointerCapture(globalThis.aResizePointer)),
          true,
        );
        await cancelDrag(page, target, "Escape");
      }
    }
    await startDrag(page, divider, -40);
    await page
      .getByRole("button", { name: "源码候选 收起", exact: true })
      .evaluate((node) => node.click());
    await page.mouse.up();
    await page.getByRole("button", { name: "源码候选 展开", exact: true }).click();
    assert.equal(await size(divider), original);
    await startDrag(page, divider, -40);
    await page
      .getByRole("button", { name: "显示原理图", exact: true })
      .evaluate((node) => node.click());
    await page.mouse.up();
    await page.getByRole("button", { name: "源码", exact: true }).click();
    assert.equal(
      await size(divider),
      original,
      "hiding the entire source pane also cancels its drag",
    );
    // Pointerup really commits, unlike all cancellation paths.
    await startDrag(page, divider, -40);
    await page.mouse.up();
    assert.equal(await size(divider), original + 40);
    await c.unchanged();
    await startDrag(page, divider, -20);
    await page
      .getByRole("button", { name: "关闭设计", exact: true })
      .evaluate((node) => node.click());
    await page.mouse.up();
    await page.waitForSelector('.demo-status[data-phase="idle"]');
    await page.getByRole("button", { name: "打开设计", exact: true }).click();
    await page.waitForSelector('.demo-status[data-phase="ready"]');
    await page.getByRole("button", { name: "源码候选 展开", exact: true }).click();
    assert.equal(await size(divider), original, "new workspace starts with default height");
    assert.throws(() => process.kill(c.pid[0], 0), { code: "ESRCH" });
    await page.getByRole("button", { name: "关闭设计", exact: true }).click();
    await page.waitForSelector('.demo-status[data-phase="idle"]');
    assert.deepEqual(children(c.electron.process().pid), []);
    assert.deepEqual(c.errors, []);
  },
);
