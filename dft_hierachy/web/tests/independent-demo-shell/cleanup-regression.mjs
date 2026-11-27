// B101 minimal real-defect regression. Oracle: DESIGN 6.27.2/6.29.4, not A's implementation/test.
// Explicit opt-in; the original 26 and DQ inventory remain unchanged.
// Native Worker actually terminates, then throws a nested cleanup sentinel. No fake Core/geometry.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cases = ["close", "replace"].map((mode) => ({
  id: mode === "close" ? "DR02-cleanup-close" : "DR03-cleanup-replace",
  mode,
  input:
    "original B_graph_top y[2:1]/inside; owned pending native Worker terminates then throws nested AggregateError",
  expected:
    "continue owned cleanup; Core exited before retry terminal; original leaf cause visible; no unhandled rejection; explicit reopen creates new Core and final close succeeds",
  basis: "DESIGN 6.27.2 and 6.29.4; reproduced on b8cb4f1; opt-in, not a new category",
}));
if (process.argv.includes("--list")) {
  console.log(JSON.stringify({ planned: 2, cases }, null, 2));
} else {
  const product = fs.realpathSync(process.env.HIER_B_PRODUCT_ROOT),
    tools = fs.realpathSync(process.env.HIER_B_BROWSER_TOOLS),
    bin = fs.realpathSync(process.env.HIER_BIN);
  assert.equal(
    process.platform,
    "darwin",
    "owned-process evidence is explicitly macOS-only; no automatic skip",
  );
  const packageRoot = fs.existsSync(product + "/web/package.json") ? product + "/web" : product,
    appDir =
      process.env.HIER_B_DEMO_APP_DIR ??
      (packageRoot === product ? product + "/app" : packageRoot + "/apps/demo");
  assert(fs.realpathSync(appDir).startsWith(product + path.sep));
  const req = createRequire(tools + "/package.json"),
    outer = createRequire(packageRoot + "/package.json"),
    { _electron } = req("playwright"),
    fixture = fileURLToPath(new URL("../independent-graph-session/design.sv", import.meta.url));
  async function runCase(spec) {
    const mode = spec.mode,
      r = { ...spec, product, fixture, errors: [], events: [], checkpoints: [], passed: false },
      workerName = "hier-b-cleanup-" + process.pid + "-" + mode + ".js",
      workerFile = path.join(appDir, "dist", workerName);
    fs.copyFileSync(
      fileURLToPath(new URL("./cleanup-stall-worker.js", import.meta.url)),
      workerFile,
      fs.constants.COPYFILE_EXCL,
    );
    let app, page, proc;
    function cores() {
      let ids;
      try {
        ids = execFileSync("pgrep", ["-P", String(proc.pid)], { encoding: "utf8" })
          .trim()
          .split(/\s+/)
          .filter(Boolean);
      } catch (e) {
        if (e.status === 1) return [];
        throw e;
      }
      if (!ids.length) return [];
      const rows = execFileSync("ps", ["-p", ids.join(","), "-o", "pid=,ppid=,comm="], {
        encoding: "utf8",
      })
        .trim()
        .split("\n");
      return rows
        .map((line) => {
          const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
          return m && { pid: Number(m[1]), parent: Number(m[2]), command: m[3] };
        })
        .filter((x) => x && x.parent === proc.pid && x.command === bin);
    }
    try {
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      app = await _electron.launch({
        executablePath: outer("electron"),
        args: [appDir],
        env,
        timeout: 20000,
      });
      proc = app.process();
      proc.on("exit", (code, signal) => r.events.push({ kind: "main-exit", code, signal }));
      page = await app.firstWindow();
      page.setDefaultTimeout(7000);
      page.on("pageerror", (e) => r.errors.push(String(e)));
      page.on("close", () => r.events.push({ kind: "page-close" }));
      await page.getByRole("button", { name: "打开设计", exact: true }).waitFor();
      await page.evaluate((resource) => {
        window.B101 = { rows: [], fault: true, unhandled: [], resource: resource };
        window.addEventListener("unhandledrejection", (e) =>
          window.B101.unhandled.push(String(e.reason?.stack ?? e.reason)),
        );
        const Native = window.Worker;
        window.Worker = class extends Native {
          constructor(url, options) {
            super(window.B101.fault ? new URL(window.B101.resource, url) : url, options);
            const row = { terminated: 0, posts: 0, replies: 0, fault: window.B101.fault };
            window.B101.rows.push(row);
            const p = this.postMessage.bind(this),
              t = this.terminate.bind(this);
            this.postMessage = (...a) => {
              row.posts++;
              return p(...a);
            };
            this.terminate = () => {
              row.terminated++;
              const value = t();
              if (window.B101.fault) {
                window.B101.fault = false;
                throw new AggregateError(
                  [
                    new AggregateError(
                      [new Error("B101-owned-worker-release-sentinel")],
                      "B101-inner-cleanup",
                    ),
                  ],
                  "B101-outer-cleanup",
                );
              }
              return value;
            };
            this.addEventListener("message", () => row.replies++);
          }
        };
      }, workerName);
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      }, fixture);
      const open = page.getByRole("button", { name: "打开设计", exact: true }),
        close = page.getByRole("button", { name: "关闭设计", exact: true });
      await page.getByRole("textbox", { name: "顶层", exact: true }).fill("B_graph_top");
      await open.click();
      await page.getByRole("treeitem").first().click();
      await page
        .getByRole("region", { name: "实例属性", exact: true })
        .getByRole("button", { name: "选择端口", exact: true })
        .nth(1)
        .click();
      await page.getByRole("button", { name: "显示原理图", exact: true }).click();
      // B104: explicit public entries only; keep the original cleanup stimulus and assertions.
      const advanced = page.getByRole("button", { name: "高级控制", exact: true });
      if (
        (await advanced.isVisible()) &&
        (await advanced.getAttribute("aria-expanded")) === "false"
      )
        await advanced.click();
      // B103: enter the documented collapsed trace form; cleanup inputs/oracle stay unchanged.
      const traceOptions = page
        .locator("details:not([open]) > summary")
        .filter({ hasText: /^追踪选项$/ });
      if (await traceOptions.isVisible()) await traceOptions.click();
      await page.getByLabel("追踪侧", { exact: true }).selectOption("inside");
      await page.getByLabel("追踪 lsb", { exact: true }).fill("1");
      await page.getByLabel("追踪 width", { exact: true }).fill("2");
      await page.getByRole("button", { name: "追踪所选对象", exact: true }).click();
      const graph = page.locator('section[aria-label="设计原理图"]');
      const sourceDetails = page.getByRole("button", { name: "来源与详情", exact: true });
      if (
        (await sourceDetails.isVisible()) &&
        (await sourceDetails.getAttribute("aria-expanded")) === "false"
      )
        await sourceDetails.click();
      await page
        .locator('section[aria-label="图来源"]')
        .getByText("complete", { exact: true })
        .waitFor();
      r.before = cores();
      assert.equal(r.before.length, 1, "exact one owned real Core child before cleanup");
      await graph.getByRole("button", { name: "布局", exact: true }).click();
      await graph.getByText("pending", { exact: true }).waitFor();
      await page.waitForFunction(
        () => window.B101.rows.length === 1 && window.B101.rows[0].posts > 0,
      );
      r.checkpoints.push("real-pending-worker");
      await (mode === "close" ? close : open).click();
      await page.waitForFunction(() => window.B101.rows[0].terminated === 1);
      r.afterTerminate = await page.locator("body").innerText();
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll("button")].find((b) => b.textContent === "打开设计")
            ?.disabled === false,
      );
      r.failed = await page.locator("body").innerText();
      r.after = cores();
      assert.equal(r.after.length, 0, "owned main Core exited before failed/retry terminal state");
      assert.match(
        r.failed,
        /B101-owned-worker-release-sentinel/,
        "original nested release cause retained",
      );
      assert.equal(
        await page.getByRole("treeitem").count(),
        0,
        "released view ownership withdrawn",
      );
      r.checkpoints.push("main-exit-cause-and-retry-terminal");
      await open.click();
      await page.getByRole("treeitem").first().waitFor();
      r.reopened = cores();
      assert.equal(r.reopened.length, 1);
      assert.notEqual(r.reopened[0].pid, r.before[0].pid, "new real Core, not old session revived");
      r.checkpoints.push("explicit-reopen-new-core");
      await close.click();
      await page.getByText("设计已关闭", { exact: true }).waitFor();
      assert.equal(cores().length, 0);
      r.checkpoints.push("normal-final-close");
      r.runtime = await page.evaluate(() => window.B101);
      assert.deepEqual(r.runtime.unhandled, []);
      assert.deepEqual(r.errors, []);
      assert.equal(r.runtime.rows[0].terminated, 1);
      r.passed = true;
    } catch (e) {
      r.error = String(e.stack ?? e);
      r.passed = false;
      if (page && !page.isClosed()) {
        r.body = await page
          .locator("body")
          .innerText()
          .catch(() => null);
        r.runtime = await page.evaluate(() => window.B101).catch(() => null);
        r.remaining = cores();
        if (process.env.HIER_B_DEMO_CLEANUP_REPORT)
          await page
            .screenshot({
              path: process.env.HIER_B_DEMO_CLEANUP_REPORT + "." + mode + ".png",
              fullPage: true,
            })
            .catch(() => {});
      }
    } finally {
      if (app) {
        try {
          await app.close();
          r.appClosed = true;
          r.appExit = proc.exitCode;
          assert.equal(r.appExit, 0);
        } catch (e) {
          r.closeError = String(e.stack ?? e);
          r.passed = false;
        }
      }
      fs.unlinkSync(workerFile);
    }
    return r;
  }
  const report = {
    kind: "B101-real-demo-cleanup-regression",
    planned: 2,
    attempted: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    results: [],
  };
  for (const spec of cases) {
    report.attempted++;
    const result = await runCase(spec);
    report.results.push(result);
    if (result.passed) report.passed++;
    else report.failed++;
  }
  report.exitCode = report.failed ? 1 : 0;
  if (process.env.HIER_B_DEMO_CLEANUP_REPORT) {
    const output = process.env.HIER_B_DEMO_CLEANUP_REPORT;
    assert(path.isAbsolute(output));
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.exitCode;
}
