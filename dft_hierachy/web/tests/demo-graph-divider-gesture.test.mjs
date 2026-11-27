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
    globalThis.aGestureQueries = [];
    ipcMain.on("hier:bridge:send", (_event, body) => {
      globalThis.aGestureQueries.push(JSON.parse(body.json).method);
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
    assert.deepEqual(await electron.evaluate(() => globalThis.aGestureQueries), []);
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

// Native mouse sequences exercise browser capture and chorded button transitions.
async function begin(page, divider, delta = -30) {
  const box = await divider.boundingBox();
  const horizontal = (await divider.getAttribute("aria-orientation")) === "horizontal";
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await divider.evaluate((node) => {
    globalThis.aGestureEvents = [];
    for (const type of ["pointerdown", "pointermove", "pointerup", "lostpointercapture"]) {
      node.addEventListener(type, (event) => {
        globalThis.aGesturePointer = event.pointerId;
        globalThis.aGestureEvents.push({ type, button: event.button, buttons: event.buttons,
          trusted: event.isTrusted, capture: node.hasPointerCapture(event.pointerId) });
      });
    }
  });
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(x + (horizontal ? 0 : delta), y + (horizontal ? delta : 0), { steps: 3 });
  assert.equal(await divider.evaluate((node) => node.hasPointerCapture(globalThis.aGesturePointer)), true);
  return { x: x + (horizontal ? 0 : delta), y: y + (horizontal ? delta : 0), horizontal };
}

async function chord(t, page, divider) {
  const start = await size(divider);
  const at = await begin(page, divider);
  const draft = await size(divider);
  assert.notEqual(draft, start, "primary drag adjusts size");
  try {
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "left" });
    const events = await page.evaluate(() => globalThis.aGestureEvents);
    t.diagnostic(JSON.stringify({ label: await divider.getAttribute("aria-label"), events }));
    assert(events.some((e) => e.type === "pointermove" && e.buttons === 2 && e.trusted),
      "native primary release arrives as right-only pointermove");
    assert.equal(await divider.evaluate((node) => node.hasPointerCapture(globalThis.aGesturePointer)),
      false, "primary release ends capture while auxiliary button remains held");
    await page.mouse.move(at.x + (at.horizontal ? 0 : 35), at.y + (at.horizontal ? 35 : 0), { steps: 3 });
    assert.equal(await size(divider), draft, "right-only motion cannot resize the completed gesture");
  } finally {
    await page.mouse.up({ button: "right" });
  }
  assert.equal(await size(divider), draft, "last auxiliary release keeps committed preference");
  await begin(page, divider, -20);
  assert.notEqual(await size(divider), draft, "next independent primary drag is usable");
  const next = await size(divider);
  await page.mouse.up({ button: "left" });
  assert.equal(await size(divider), next, "ordinary primary release commits");
  assert.equal(await divider.evaluate((node) => node.hasPointerCapture(globalThis.aGesturePointer)), false);
}

test("sidebar primary release completes a chorded gesture and permits a fresh drag", { timeout: 30_000 }, async (t) => {
  const c = await open(t);
  await c.resize(1440, 1100);
  for (const name of ["设计导航宽度", "对象详情宽度"])
    await chord(t, c.page, c.page.getByRole("separator", { name, exact: true }));
  await c.close();
});

test("split primary release owns its current axis across both responsive arrangements", { timeout: 30_000 }, async (t) => {
  const c = await open(t), { page } = c;
  await page.getByRole("button", { name: "显示原理图", exact: true }).click();
  await page.getByRole("button", { name: "双视图", exact: true }).click();
  const divider = page.getByRole("separator", { name: "原理图与源码分隔", exact: true });
  for (const [width, height, orientation] of [[1800, 1100, "vertical"], [960, 1100, "horizontal"]]) {
    await c.resize(width, height);
    assert.equal(await divider.getAttribute("aria-orientation"), orientation);
    await chord(t, page, divider);
  }
  await c.close();
});

test("candidate primary release commits height without selecting or querying", { timeout: 30_000 }, async (t) => {
  const c = await open(t), { page } = c;
  await c.resize(1440, 1100);
  await page.getByRole("button", { name: "源码候选 展开", exact: true }).click();
  await chord(t, page, page.getByRole("separator", { name: "源码候选高度", exact: true }));
  await c.close();
});

test("unfocused divider keyboard events cannot resize or reset another active workspace task", { timeout: 30_000 }, async (t) => {
  const c = await open(t), { page } = c;
  await c.resize(1800, 1100);
  await page.getByRole("button", { name: "显示原理图", exact: true }).click();
  await page.getByRole("button", { name: "双视图", exact: true }).click();
  await page.getByRole("button", { name: "源码候选 展开", exact: true }).click();
  const search = page.getByRole("textbox", { name: "搜索", exact: true });
  for (const name of ["设计导航宽度", "对象详情宽度", "原理图与源码分隔", "源码候选高度"]) {
    const divider = page.getByRole("separator", { name, exact: true });
    await divider.focus();
    await page.keyboard.press("End");
    const preference = await size(divider);
    await search.focus();
    for (const key of ["Home", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "End"]) {
      await divider.evaluate((node, key) => node.dispatchEvent(new KeyboardEvent("keydown", {
        key, bubbles: true, cancelable: true,
      })), key);
      assert.equal(await size(divider), preference, name + " ignores unfocused " + key);
      assert.equal(await search.evaluate((node) => node === document.activeElement), true);
    }
  }
  await c.close();
});

test("unfocused Escape cannot cancel an owned drag, and real focused Escape still restores its start", { timeout: 30_000 }, async (t) => {
  const c = await open(t), { page } = c;
  await c.resize(1440, 1100);
  const divider = page.getByRole("separator", { name: "设计导航宽度", exact: true });
  const original = await size(divider);
  await begin(page, divider);
  const draft = await size(divider);
  await page.getByRole("textbox", { name: "搜索", exact: true }).focus();
  try {
    await divider.evaluate((node) => node.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", bubbles: true, cancelable: true,
    })));
    assert.equal(await size(divider), draft, "unfocused Escape leaves current drag intact");
    assert.equal(await divider.evaluate((node) => node.hasPointerCapture(globalThis.aGesturePointer)), true);
    await divider.focus();
    await page.keyboard.press("Escape");
    assert.equal(await size(divider), original, "focused native Escape restores start");
    assert.equal(await divider.evaluate((node) => node.hasPointerCapture(globalThis.aGesturePointer)), false);
  } finally {
    await page.mouse.up({ button: "left" });
  }
  await c.close();
});


test("auxiliary release and foreign pointer termination preserve the active primary drag", { timeout: 30_000 }, async (t) => {
  const c = await open(t), { page } = c;
  await c.resize(1440, 1100);
  const divider = page.getByRole("separator", { name: "设计导航宽度", exact: true });
  const at = await begin(page, divider);
  const draft = await size(divider);
  try {
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    assert.equal(await divider.evaluate((node) => node.hasPointerCapture(globalThis.aGesturePointer)), true,
      "auxiliary release does not end primary ownership");
    for (const type of ["pointermove", "pointerup", "pointercancel", "lostpointercapture"]) {
      await divider.evaluate((node, type) => node.dispatchEvent(new PointerEvent(type, {
        pointerId: globalThis.aGesturePointer + 10, buttons: 0, bubbles: true,
      })), type);
      assert.equal(await size(divider), draft, "foreign " + type + " does not affect owned drag");
    }
    await page.mouse.move(at.x + 40, at.y, { steps: 3 });
    assert.notEqual(await size(divider), draft, "primary still adjusts after auxiliary release");
    const committed = await size(divider);
    await page.mouse.up({ button: "left" });
    assert.equal(await size(divider), committed);
  } finally {
    await page.mouse.up({ button: "left" });
  }
  await c.close();
});
