import assert from "node:assert/strict";
import { startServer } from "./server.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import os from "node:os";
import { chromium } from "playwright";

const out = resolve(process.env.UI_EVIDENCE_DIR ?? "dist/evidence");
await mkdir(out, { recursive: true });
const server = await startServer();
const browser = await chromium.launch({ headless: true });
const report = {
  environment: {
    node: process.version,
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    browser: browser.version(),
    viewport: [1000, 850],
    rowHeight: 28,
    treeHeight: 336,
    overscan: 2,
  },
  cases: [],
  measurements: [],
  observations: [],
};
const url = `http://127.0.0.1:${server.address().port}`;
let failures = 0;
const settle = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
const state = (page) => page.evaluate(() => window.lab.state());
async function ready(page) {
  await page.waitForSelector('[data-row="top"]');
  await settle(page);
}
async function record(page, mode, phase) {
  await settle(page);
  const s = await state(page);
  const dom = await page.locator('[role="treeitem"]').count();
  report.measurements.push({
    mode,
    phase,
    deliveredInstances: s.deliveredInstances,
    observedCommittedInstances: s.observedCommittedInstances,
    visibleRows: s.rows.length,
    domRows: dom,
    work: s.work,
    childRequests: s.sent.filter((r) => r.method === "inst.children").length,
  });
  assert.ok(
    dom <= 18,
    `bounded 12-row viewport plus overscan/active row, got ${dom}`,
  );
}

try {
  for (const mode of ["virtual", "arborist"]) {
    const page = await browser.newPage({
      viewport: { width: 1000, height: 850 },
    });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    async function scenario(name, fn) {
      const start = performance.now();
      try {
        await page.goto(`${url}/?mode=${mode}`);
        await ready(page);
        await fn();
        assert.deepEqual(
          pageErrors.splice(0),
          [],
          "no browser uncaught errors/rejections",
        );
        report.cases.push({
          mode,
          name,
          passed: true,
          milliseconds: performance.now() - start,
        });
      } catch (error) {
        failures++;
        report.cases.push({
          mode,
          name,
          passed: false,
          error: String(error),
          pageErrors: pageErrors.splice(0),
        });
        await page.screenshot({ path: `${out}/${mode}-${name}-failure.png` });
      }
      console.log(JSON.stringify(report.cases.at(-1)));
    }
    await scenario("paging-scopes-reveal", async () => {
      await page.locator('[data-row="top"] .disclosure').click();
      await page.waitForSelector('[data-row="a"]');
      const first = await state(page);
      assert.equal(
        await page.locator('[data-row="a"]').getAttribute("aria-setsize"),
        "-1",
        "later owner pages may append siblings inside this scope",
      );
      const groupId = first.rows.find((r) => r.kind === "scope").id;
      assert.equal(
        first.rows.find((r) => r.kind === "instance").children.loadedCount,
        2,
      );
      await page.locator('[data-row="page-status"]').click();
      await page.waitForSelector('[data-row="b"]');
      assert.equal(
        (await state(page)).rows.find((r) => r.kind === "scope").id,
        groupId,
      );
      await page.evaluate(() => window.lab.reveal("tail"));
      await page.waitForSelector('[data-row="tail"]');
      assert.equal(
        (await state(page)).selected.items.length,
        0,
        "reveal itself does not select",
      );
      await page.locator('[data-row="scope:g"] .disclosure').click();
      await page.waitForFunction(
        () =>
          !window.lab
            .state()
            .rows.some((r) => r.kind === "instance" && r.instance.ref === "a"),
      );
      await page.evaluate(() => window.lab.scopes(false));
      await page.waitForSelector('[data-row="a"]');
      await page.evaluate(() => window.lab.scopes(true));
      await page.waitForFunction(
        () =>
          !window.lab
            .state()
            .rows.some((r) => r.kind === "instance" && r.instance.ref === "a"),
      );
      const grouped = await state(page);
      assert.equal(grouped.rows.find((r) => r.kind === "scope").id, groupId);
      assert.equal(
        grouped.sent.filter((r) => r.method === "inst.children").length,
        3,
      );
      await page.screenshot({ path: `${out}/${mode}-small.png` });
    });
    await scenario("keyboard-selection-aria", async () => {
      const tree = page.getByRole("tree");
      await tree.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForSelector('[data-row="a"]');
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.waitForSelector('[data-row="a"][data-focused="true"]');
      assert.equal((await state(page)).selected.items.length, 0);
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => window.lab.state().selected.items[0]?.ref === "a",
      );
      await page.keyboard.press("End");
      await page.waitForSelector(
        '[data-row="page-status"][data-focused="true"]',
      );
      await page.keyboard.press("Home");
      await page.waitForSelector('[data-row="top"][data-focused="true"]');
      assert.equal((await state(page)).selected.items[0].ref, "a");
      // A separate external control owns DOM focus; semantic sync must not seize it.
      await page
        .getByRole("button", { name: "External port selection" })
        .focus();
      await page.evaluate(() => window.lab.select("port-tail"));
      await page.waitForFunction(
        () => window.lab.state().reveal.status === "success",
      );
      await settle(page);
      report.observations.push({
        mode,
        kind: "external-focus",
        activeElement: await page.evaluate(
          () => document.activeElement.textContent,
        ),
        treeStoleFocus: await page.evaluate(() =>
          document
            .querySelector('[role="tree"]')
            .contains(document.activeElement),
        ),
      });
      assert.equal((await state(page)).selected.items[0].ref, "port-tail");
      assert.equal(
        await page.locator('[data-row="tail"]').getAttribute("aria-selected"),
        "true",
      );
      const attributes = await page
        .locator('[role="treeitem"]')
        .evaluateAll((nodes) =>
          nodes.map((n) => ({
            row: n.dataset.row,
            level: n.getAttribute("aria-level"),
            pos: n.getAttribute("aria-posinset"),
            size: n.getAttribute("aria-setsize"),
            expanded: n.getAttribute("aria-expanded"),
            selected: n.getAttribute("aria-selected"),
          })),
        );
      assert.ok(
        attributes.every(
          (r) => Number(r.level) > 0 && Number(r.pos) > 0 && r.size !== null,
        ),
      );
      assert.equal(attributes.find((r) => r.row === "a").expanded, null);
      assert.equal(attributes.find((r) => r.row === "scope:g").selected, null);
      report.observations.push({ mode, kind: "aria-attributes", attributes });
      await page.evaluate(() => window.lab.select("a"));
      await page.waitForFunction(
        () =>
          window.lab.state().reveal.status === "success" &&
          window.lab.state().reveal.ref === "a",
      );
      await tree.focus();
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.waitForSelector('[data-row="a"][data-focused="true"]');
      await page.evaluate(() => window.lab.collapse("top"));
      await page.waitForSelector('[data-row="top"][data-focused="true"]');
      assert.equal((await state(page)).selected.items[0].ref, "a");
    });
    await scenario("cancel-retry-remount", async () => {
      await page.evaluate(() => window.lab.hold());
      await page.locator('[data-row="top"] .disclosure').click();
      await page.waitForFunction(() => window.lab.state().pending === 1);
      await page.locator('[data-row="top"] .disclosure').click();
      await page.evaluate(() => window.lab.release());
      await settle(page);
      assert.equal(
        (await state(page)).rows.length,
        1,
        "late reply stays hidden/uncommitted",
      );
      await page.locator('[data-row="top"] .disclosure').click();
      await page.waitForSelector('[data-row="page-status"]');
      await page.evaluate(() => window.lab.fail());
      await page.locator('[data-row="page-status"]').click();
      await page
        .getByText("Retry — Fixture page failed", { exact: true })
        .waitFor();
      await page.locator('[data-row="page-status"]').click();
      await page.waitForSelector('[data-row="a"]');
      assert.equal(
        (await state(page)).rows.find((r) => r.kind === "instance").children
          .loadedCount,
        2,
      );
      await page.evaluate(() => window.lab.hold());
      await page.locator('[data-row="page-status"]').click();
      await page.waitForFunction(() => window.lab.state().pending === 1);
      await page.getByRole("button", { name: "Unmount", exact: true }).click();
      assert.equal(await page.getByRole("tree").count(), 0);
      await page.evaluate(() => window.lab.release());
      await page.getByRole("button", { name: "Remount", exact: true }).click();
      await page.waitForSelector('[data-row="b"]');
      assert.equal(
        (await state(page)).rows.find((r) => r.kind === "instance").children
          .loadedCount,
        4,
      );
    });
    await scenario("old-session", async () => {
      await page.evaluate(() => window.lab.hold());
      await page.locator('[data-row="top"] .disclosure').click();
      await page.waitForFunction(() => window.lab.state().pending === 1);
      const oldId = (await state(page)).snapshotId;
      await page.evaluate(() => window.lab.reset());
      await ready(page);
      await page.evaluate(() => window.lab.releaseOld());
      await settle(page);
      const s = await state(page);
      assert.notEqual(s.snapshotId, oldId);
      assert.equal(s.rows.length, 1);
      assert.equal(
        s.sent.filter((q) => q.method === "inst.children").length,
        0,
      );
    });
    await scenario("wide", async () => {
      await page.evaluate(() => window.lab.reset("wide", 5000));
      await ready(page);
      await page.evaluate(() => window.lab.clearWork());
      await page.evaluate(() => window.lab.expand("top"));
      await record(page, mode, "wide-1000");
      await page.evaluate(() => window.lab.clearWork());
      await page.evaluate(() => window.lab.more());
      await record(page, mode, "wide-append-2000");
      for (let i = 0; i < 3; i++) await page.evaluate(() => window.lab.more());
      await page.getByRole("tree").focus();
      await page.keyboard.press("End");
      await page.waitForSelector('[data-row="w4999"]');
      await record(page, mode, "wide-5000-end");
      await page.screenshot({ path: `${out}/${mode}-wide.png` });
    });
    await scenario("deep", async () => {
      await page.evaluate(() => window.lab.reset("deep", 120));
      await ready(page);
      await page.evaluate(async () => {
        await window.lab.expand("top");
        for (let i = 0; i < 119; i++) await window.lab.expand(`d${i}`);
      });
      await page.getByRole("tree").focus();
      await page.keyboard.press("End");
      await page.waitForSelector('[data-row="d119"]');
      await record(page, mode, "deep-120");
      assert.equal((await state(page)).rows.length, 121);
      await page.evaluate(() => window.lab.clearWork());
      await page.evaluate(() => window.lab.collapse("top"));
      await record(page, mode, "deep-collapsed");
      assert.equal((await state(page)).rows.length, 1);
    });
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(
    `${out}/results.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify(
    {
      passed: report.cases.length - failures,
      failed: failures,
      measurements: report.measurements,
      observations: report.observations.filter(
        (o) => o.kind === "external-focus",
      ),
    },
    null,
    2,
  ),
);
process.exitCode = failures ? 1 : 0;
