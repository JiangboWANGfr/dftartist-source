import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { assertNoOverlap, assertNoOverflow } from "../helpers/layout.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const GENCONN_BIN = path.resolve(process.cwd(), "../dft-core/build/genconn");

const BIN = path.resolve(process.cwd(), "../dft-core/build");
const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc.f");

test("genconn: inspector shows def + interface list (no redundant cards) + dark/light theming", async () => {
  const { app, page } = await launchApp();

  // Switch to genconn workspace.
  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await page.click('[data-tab="genconn"]');

  // Load the built-in example via the exposed genconn store, then select an instance so the
  // inspector populates. Konva hardens aren't DOM-selectable, so we drive the store directly.
  await page.evaluate(() => (window as any).__gcStore.getState().loadExample());
  await page.evaluate(() => (window as any).__gcStore.getState().select({ kind: "instance", id: "c2_i1" }));

  // The inspector shows the def-editing view + the clickable interface LIST (no big detail cards).
  await expect(page.locator("#gc-inspector .iface-row").first()).toBeVisible();
  await expect(page.locator("#gc-inspector [data-gc-inspector-cards]")).toHaveCount(0);

  // No 穿模 between the three workspace columns; inspector content fits.
  await assertNoOverlap(page, ["#gc-left", "#gc-canvas", "#gc-inspector"]);
  await assertNoOverflow(page, "#gc-inspector");

  // Visual gate: dark (default) then light.
  await expect(page).toHaveScreenshot("genconn-dark.png");
  await page.click("#theme-toggle");
  await expect(page).toHaveScreenshot("genconn-light.png");

  await app.close();
});

test("genconn: hierarchy panel auto-loads from shared daemon when design is ready", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });

  // Open design via shared store (same path as shell's 打开设计 button)
  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );

  // Switch to genconn workspace
  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await page.click('[data-tab="genconn"]');

  // The hierarchy panel should auto-load and show the root "soc" node
  await page.locator('[data-gc-node="soc"]').waitFor({ timeout: 10000 });
  await expect(page.locator('[data-gc-node="soc"]')).toBeVisible();

  await app.close();
});

test("genconn: hierarchy panel shows soc children (u_cpu, u_mem) when expanded", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });

  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );
  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await page.click('[data-tab="genconn"]');

  // Wait for root node to appear (auto-loaded from daemon)
  await page.locator('[data-gc-node="soc"]').waitFor({ timeout: 10000 });

  // The root is already expanded by default (afterLoad sets expanded to rootInstanceIds).
  // Children nodes are rendered in the <ul> and have data-gc-node attributes.
  await expect(page.locator('[data-gc-node="soc.u_cpu"]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-gc-node="soc.u_mem"]')).toBeVisible({ timeout: 5000 });

  await app.close();
});

test("genconn: hierarchy panel makes no /api request", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });

  // Intercept any /api calls — there should be none
  const apiCalls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api")) apiCalls.push(req.url());
  });

  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );
  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await page.click('[data-tab="genconn"]');
  await page.locator('[data-gc-node="soc"]').waitFor({ timeout: 10000 });

  // Give some time for any deferred requests to fire
  await page.waitForTimeout(500);

  expect(apiCalls).toHaveLength(0);

  await app.close();
});

test("genconn: right-col resize drag direction is correct (drag right shrinks inspector, drag left grows it)", async () => {
  const { app, page } = await launchApp();

  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await page.click('[data-tab="genconn"]');
  await page.evaluate(() => (window as any).__gcStore.getState().loadExample());
  await page.evaluate(() => (window as any).__gcStore.getState().select({ kind: "instance", id: "c2_i1" }));
  await expect(page.locator("#gc-inspector")).toBeVisible();

  const inspector = page.locator("#gc-inspector");
  const resizerHandle = page.locator('[data-resize="right"]');
  const innerW = await page.evaluate(() => window.innerWidth);
  const rightEdge = async () => { const b = await inspector.boundingBox(); if (!b) throw new Error("no inspector box"); return { x: b.x, w: b.width, right: b.x + b.width }; };
  const dragHandle = async (dx: number) => {
    const h = await resizerHandle.boundingBox(); if (!h) throw new Error("no resizer box");
    const cx = h.x + h.width / 2, cy = h.y + h.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 0; i < 12; i++) await page.mouse.move(cx + (dx / 12) * (i + 1), cy);
    await page.mouse.up();
  };

  const b0 = await rightEdge();
  // Right-anchored: the inspector's right edge sits at the window's right edge, never off-screen.
  expect(b0.right).toBeLessThanOrEqual(innerW + 2);

  // Drag RIGHT → inspector's LEFT edge moves right (visibly narrower), right edge still in-window.
  await dragHandle(120);
  const b1 = await rightEdge();
  expect(b1.x).toBeGreaterThan(b0.x);
  expect(b1.w).toBeLessThan(b0.w);
  expect(b1.right).toBeLessThanOrEqual(innerW + 2);

  // Drag LEFT → inspector's LEFT edge moves left (visibly wider) and the right edge MUST stay
  // inside the window (this is the bug that caused content to shift off-screen right).
  await dragHandle(-160);
  const b2 = await rightEdge();
  expect(b2.x).toBeLessThan(b1.x);
  expect(b2.w).toBeGreaterThan(b1.w);
  expect(b2.right, "inspector overflowed off-screen to the right").toBeLessThanOrEqual(innerW + 2);

  await assertNoOverflow(page, "#gc-inspector");
  await app.close();
});

test("genconn: left column is resizable (drag right widens it, stays within the window)", async () => {
  const { app, page } = await launchApp();
  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await page.click('[data-tab="genconn"]');
  await page.evaluate(() => (window as any).__gcStore.getState().loadExample());
  const left = page.locator("#gc-left");
  const handle = page.locator('[data-resize="left"]');
  const innerW = await page.evaluate(() => window.innerWidth);
  const box = async () => { const b = await left.boundingBox(); if (!b) throw new Error("no left box"); return { x: b.x, w: b.width, right: b.x + b.width }; };
  const drag = async (dx: number) => {
    const h = await handle.boundingBox(); if (!h) throw new Error("no left resizer");
    const cx = h.x + h.width / 2, cy = h.y + h.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 0; i < 12; i++) await page.mouse.move(cx + (dx / 12) * (i + 1), cy);
    await page.mouse.up();
  };
  const a = await box();
  await drag(120);                       // drag the divider right → left col widens
  const b = await box();
  expect(b.w).toBeGreaterThan(a.w);
  expect(b.right, "left column overflowed").toBeLessThanOrEqual(innerW + 2);
  await drag(-120);                      // drag left → narrows back
  const c = await box();
  expect(c.w).toBeLessThan(b.w);
  await app.close();
});

test("genconn: switching to a NEW design resets the canvas to an empty doc", async () => {
  const { app, page } = await launchApp();

  // Decline the unsaved-work confirm (e2e hook; appConfirm bypasses page dialogs) so the switch proceeds without a save.
  await page.evaluate(() => { (window as any).__e2eConfirm = () => false; });

  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await page.click('[data-tab="genconn"]');

  // Populate the canvas (example has child instances) — this marks the doc dirty.
  await page.evaluate(() => (window as any).__gcStore.getState().loadExample());
  const before = await page.evaluate(() => {
    const s = (window as any).__gcStore.getState();
    return s.doc.library.defs.find((d: any) => d.id === s.doc.ui.openDefId).childInstances.length;
  });
  expect(before).toBeGreaterThan(0);

  // First design after launch: prev filelist was null → must NOT wipe the in-progress canvas.
  await page.evaluate(() => (window as any).__dftStore.setState({ filelist: "/tmp/a.f" }));
  const afterFirst = await page.evaluate(() => {
    const s = (window as any).__gcStore.getState();
    return s.doc.library.defs.find((d: any) => d.id === s.doc.ui.openDefId).childInstances.length;
  });
  expect(afterFirst).toBe(before);

  // Switching to a DIFFERENT design → canvas resets to a fresh empty doc (0 child instances).
  await page.evaluate(() => (window as any).__dftStore.setState({ filelist: "/tmp/b.f" }));
  const afterSwitch = await page.evaluate(() => {
    const s = (window as any).__gcStore.getState();
    return s.doc.library.defs.find((d: any) => d.id === s.doc.ui.openDefId).childInstances.length;
  });
  expect(afterSwitch).toBe(0);

  await app.close();
});

test("genconn: generate action calls CLI and shows output panel", async () => {
  test.skip(!existsSync(GENCONN_BIN), "no genconn binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: path.resolve(process.cwd(), "../dft-core/build") });

  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await page.click('[data-tab="genconn"]');
  // Load the built-in example (has tiling blocks → will produce generated files)
  await page.evaluate(() => (window as any).__gcStore.getState().loadExample());

  // Open the generate panel via the toolbar button (assume it has data-action="generate" or similar text)
  // The panel opens when genOpen=true; trigger it via the store
  await page.evaluate(() => (window as any).__gcStore.getState().setGenOpen(true));

  // Wait for the output panel to appear and show at least one file
  await page.locator("#gc-genoutput").waitFor({ timeout: 15000 });
  await expect(page.locator("#gc-genoutput")).toBeVisible();

  await app.close();
});

test("genconn: 设计层次 dump 失败时优雅降级（不弹框，面板内温和提示）", async () => {
  const { app, page } = await launchApp();
  // 复刻 bug 场景:UI 认为设计 ready、但引擎侧无已打开设计(lastOpts 为 null)。
  // 若回退到弹 alert,这个监听会让测试失败。
  let dialogRaised = false;
  page.on("dialog", (d) => { dialogRaised = true; void d.dismiss(); });
  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await page.click('[data-tab="genconn"]');
  // 面板内显示温和降级提示,而不是弹框
  await expect(page.locator(".hier .hier-hint")).toContainText("Design hierarchy unavailable", { timeout: 5000 });
  expect(dialogRaised, "不应弹出 alert 对话框").toBe(false);
  await app.close();
});
