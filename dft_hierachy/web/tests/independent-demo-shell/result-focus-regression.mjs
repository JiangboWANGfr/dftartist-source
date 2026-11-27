// B103 C-110: minimal actual host focus regression, not a new test category.
// Oracle: DESIGN 6.23.4/6.26.4/6.27.3 and authorized keyboard return/focus behavior.
// Opt-in; original 26, pointer/cleanup expectations and DQ inventory stay unchanged.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const cases = [
  {
    id: "C110-path-enter",
    kind: "path",
    input: "B_demo_top.u0; explicit result native Enter",
    expected: "selection reaches u0; focus remains in a visible useful Inspector/result context",
  },
  {
    id: "C110-search-enter",
    kind: "search",
    input: "sum; explicit B_demo_top.u0.sum native Enter",
    expected: "selection reaches u0; focus remains in a visible useful Inspector/result context",
  },
  {
    id: "C110-collapse-enter",
    kind: "collapse",
    input: "B_demo_top.u0 path result; native Enter on collapse results",
    expected: "results close; focus has a visible useful context or query return control",
  },
  {
    id: "C110-external-focus",
    kind: "external",
    input: "search input focused; DOM/AT action on existing u0 path result",
    expected: "external search input remains focused; no unconditional selection-driven focus",
  },
];
if (process.argv.includes("--list")) {
  console.log(JSON.stringify({ planned: cases.length, cases }, null, 2));
} else {
  const product = fs.realpathSync(process.env.HIER_B_PRODUCT_ROOT),
    tools = fs.realpathSync(process.env.HIER_B_BROWSER_TOOLS),
    bin = fs.realpathSync(process.env.HIER_BIN),
    packageRoot = fs.existsSync(product + "/web/package.json") ? product + "/web" : product,
    appDir =
      process.env.HIER_B_DEMO_APP_DIR ??
      (packageRoot === product ? product + "/app" : packageRoot + "/apps/demo"),
    req = createRequire(tools + "/package.json"),
    outer = createRequire(packageRoot + "/package.json"),
    { _electron } = req("playwright"),
    fixture = fileURLToPath(new URL("./design.sv", import.meta.url)),
    selected = process.argv.includes("--baseline")
      ? cases.filter((c) => c.kind !== "collapse")
      : cases;
  assert(fs.realpathSync(appDir).startsWith(product + path.sep));
  function focusState() {
    const e = document.activeElement,
      label =
        e?.getAttribute("aria-label") ??
        (e?.id
          ? [...document.querySelectorAll("label")].find((x) => x.htmlFor === e.id)?.textContent
          : "") ??
        "",
      regions = [];
    for (let p = e; p; p = p.parentElement) {
      if (p.matches('[role="region"],section[aria-label],[role="tab"],[role="tabpanel"]'))
        regions.push({
          role: p.getAttribute("role"),
          label: p.getAttribute("aria-label"),
          text: p.getAttribute("role") === "tab" ? p.textContent : null,
        });
    }
    return {
      tag: e?.tagName,
      role: e?.getAttribute("role"),
      label,
      text: e?.textContent?.slice(0, 160),
      connected: !!e?.isConnected,
      visible: !!e?.getClientRects().length && !e.closest("[hidden],[inert]"),
      regions,
    };
  }
  async function run(spec) {
    const r = {
      ...spec,
      basis: "DESIGN 6.23.4/6.26.4/6.27.3; C-110",
      product,
      fixture,
      passed: false,
      errors: [],
    };
    let app, page, proc;
    try {
      const env = { ...process.env, HIER_BIN: bin };
      delete env.ELECTRON_RUN_AS_NODE;
      app = await _electron.launch({
        executablePath: outer("electron"),
        args: [appDir],
        env,
        timeout: 20000,
      });
      proc = app.process();
      page = await app.firstWindow();
      page.setDefaultTimeout(10000);
      page.on("pageerror", (e) => r.errors.push(String(e)));
      await page.getByRole("button", { name: "打开设计", exact: true }).waitFor();
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      }, fixture);
      await page.getByRole("textbox", { name: "顶层", exact: true }).fill("B_demo_top");
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
      await page.getByRole("treeitem").first().waitFor();
      const searchInput = page.getByRole("textbox", { name: "搜索", exact: true }),
        pathInput = page.getByRole("textbox", { name: "路径", exact: true }),
        isSearch = spec.kind === "search";
      await (isSearch ? searchInput : pathInput).fill(isSearch ? "sum" : "B_demo_top.u0");
      await page.getByRole("button", { name: isSearch ? "搜索" : "定位", exact: true }).click();
      const result = page.getByRole("region", {
          name: isSearch ? "搜索结果" : "路径结果",
          exact: true,
        }),
        // The exact path has one match; its row displays an opaque ref, not the path.
        row = isSearch
          ? result.locator("li,tr").filter({ hasText: "B_demo_top.u0.sum" })
          : result.locator("tbody tr"),
        choice = row.getByRole("button", { name: "选择对象", exact: true }).first();
      await choice.waitFor();
      if (!isSearch) assert.equal(await row.count(), 1, "exact original path has one result");
      r.resultText = await row.first().innerText();
      if (spec.kind === "external") {
        await searchInput.focus();
        r.beforeFocus = await page.evaluate(focusState);
        await choice.evaluate((e) => e.click());
      } else {
        const target =
          spec.kind === "collapse"
            ? page.getByRole("button", { name: "收起查询结果", exact: true })
            : choice;
        await target.focus();
        r.beforeFocus = await page.evaluate(focusState);
        await page.keyboard.press("Enter");
      }
      if (spec.kind !== "collapse") {
        await page.waitForFunction(() =>
          [...document.querySelectorAll('section[aria-label="实例属性"]')].some((e) =>
            e.textContent.includes("B_demo_top.u0"),
          ),
        );
      } else {
        await result.waitFor({ state: "hidden" });
      }
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      r.afterFocus = await page.evaluate(focusState);
      if (spec.kind === "external") {
        assert.equal(
          await searchInput.evaluate((e) => document.activeElement === e),
          true,
          "selection must preserve actual external input focus",
        );
      } else {
        const a = r.afterFocus,
          context = a.regions.some((p) =>
            /实例属性|对象连接|搜索结果|定义实例|路径结果/.test(p.label ?? p.text ?? ""),
          ),
          queryReturn = spec.kind === "collapse" && /搜索|路径/.test(a.label);
        assert(
          a.connected &&
            a.visible &&
            a.tag !== "BODY" &&
            a.tag !== "HTML" &&
            (context || queryReturn),
          "keyboard action must retain a visible useful task/return focus, not BODY/top controls",
        );
      }
      assert.deepEqual(r.errors, []);
      r.passed = true;
    } catch (e) {
      r.error = String(e.stack ?? e);
      if (page && !page.isClosed()) {
        r.body = await page
          .locator("body")
          .innerText()
          .catch(() => null);
        if (process.env.HIER_B_FOCUS_REPORT)
          await page
            .screenshot({ path: process.env.HIER_B_FOCUS_REPORT + "." + spec.id + ".png" })
            .catch(() => {});
      }
    } finally {
      if (app) {
        try {
          if (page && !page.isClosed() && (await page.getByRole("treeitem").count())) {
            await page.getByRole("button", { name: "关闭设计", exact: true }).click();
            await page.getByText("设计已关闭", { exact: true }).waitFor();
            r.designClosed = true;
          }
          await app.close();
          r.appClosed = true;
          r.appExit = proc.exitCode;
          assert.equal(r.appExit, 0);
        } catch (e) {
          r.cleanupError = String(e.stack ?? e);
          r.passed = false;
        }
      }
    }
    return r;
  }
  const report = {
    kind: "B103-C110-real-result-focus",
    product,
    planned: cases.length,
    selected: selected.length,
    unselected: cases.length - selected.length,
    attempted: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    results: [],
  };
  for (const c of selected) {
    report.attempted++;
    const r = await run(c);
    report.results.push(r);
    if (r.passed) report.passed++;
    else report.failed++;
  }
  report.exitCode = report.failed ? 1 : 0;
  if (process.env.HIER_B_FOCUS_REPORT) {
    assert(path.isAbsolute(process.env.HIER_B_FOCUS_REPORT));
    fs.writeFileSync(process.env.HIER_B_FOCUS_REPORT, JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
    });
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.exitCode;
}
