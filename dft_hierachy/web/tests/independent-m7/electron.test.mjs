// B independent UI/IPC resource failures and retry. Real demo; no SDK/model replacement.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const root = process.env.HIER_B_PRODUCT_ROOT,
  evidence = process.env.HIER_B_M7_EVIDENCE,
  core = process.env.HIER_BIN;
assert.ok(
  root && evidence && core,
  "fixed product, Core and evidence paths required",
);
const require = createRequire(path.join(root, "web/package.json")),
  { _electron } = require("playwright");
const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
const fixture = path.join(evidence, "B-m7-ui.sv");
fs.writeFileSync(
  fixture,
  "module B_m7_ui(input wire a, output wire y); assign y=a; endmodule\n",
  { flag: "wx" },
);
for (const mode of ["open-retry", "rss", "off"])
  test("B-M7 E01 actual Electron " + mode, { timeout: 30000 }, async () => {
    const env = {
      ...process.env,
      HIER_CORE_OPEN_TIMEOUT_MS: "off",
      HIER_CORE_CANCEL_TIMEOUT_MS: "off",
      HIER_CORE_MAX_RSS_BYTES: "off",
    };
    delete env.ELECTRON_RUN_AS_NODE;
    if (mode === "rss") env.HIER_CORE_MAX_RSS_BYTES = "1";
    const pids = path.join(evidence, mode + ".pids"),
      marker = path.join(evidence, mode + ".marker"),
      wrapper = path.join(evidence, mode + ".sh");
    fs.writeFileSync(pids, "", { flag: "wx" });
    let body = "#!/bin/sh\n";
    if (mode === "open-retry") {
      env.HIER_CORE_OPEN_TIMEOUT_MS = "1000";
      body +=
        "if [ ! -e " +
        quote(marker) +
        " ]; then\n touch " +
        quote(marker) +
        "\n exec /bin/sleep 1000\nfi\n";
    }
    body += "exec " + quote(core) + ' "$@"\n';
    fs.writeFileSync(wrapper, body, { mode: 0o700, flag: "wx" });
    env.HIER_BIN = wrapper;
    let app, page;
    const errors = [],
      report = { mode, passed: false };
    try {
      app = await _electron.launch({
        executablePath: require("electron"),
        args: [path.join(root, "web/apps/demo")],
        env,
        timeout: 15000,
      });
      // Same public spawn pass-through technique as C's reviewed RSS close probe.
      // A 1-byte budget can kill before the wrapper's first instruction executes.
      await app.evaluate(
        (_electron, { wrapper, pids }) => {
          const cp = process.getBuiltinModule("child_process"),
            fs = process.getBuiltinModule("fs"),
            modules = process.getBuiltinModule("module");
          const native = cp.spawn;
          cp.spawn = function (command, ...args) {
            const child = native.call(this, command, ...args);
            if (command === wrapper)
              fs.appendFileSync(pids, String(child.pid) + "\n");
            return child;
          };
          modules.syncBuiltinESMExports();
        },
        { wrapper, pids },
      );
      page = await app.firstWindow();
      page.setDefaultTimeout(10000);
      page.on("pageerror", (e) => errors.push(String(e)));
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        });
      }, fixture);
      await page
        .getByRole("textbox", { name: "顶层", exact: true })
        .fill("B_m7_ui");
      const open = page.getByRole("button", { name: "打开设计", exact: true });
      await open.click();
      if (mode !== "off") {
        await page.waitForFunction(
          (kind) =>
            kind === "rss"
              ? /transport_closed:.*memory/i.test(document.body.innerText)
              : /open_timeout|opening exceeded/i.test(document.body.innerText),
          mode,
        );
        report.failureText = await page.locator("body").innerText();
        let watcher;
        const nextSpawn = new Promise((resolve, reject) => {
          watcher = fs.watch(pids, () => {
            if (fs.readFileSync(pids, "utf8").trim().split(/\s+/).length >= 2) {
              watcher.close();
              resolve();
            }
          });
          watcher.unref();
          const signal = AbortSignal.timeout(7000); // Test hang watchdog, not product SLA.
          signal.addEventListener(
            "abort",
            () => {
              watcher.close();
              reject(Error("no owned process after explicit reopen"));
            },
            { once: true },
          );
        });
        await open.click(); // A new user operation, never implicit reconnect/replay.
        await nextSpawn;
      }
      if (mode !== "rss") {
        await page.getByRole("treeitem").first().waitFor();
        await page
          .getByRole("button", { name: "关闭设计", exact: true })
          .click();
        await page.waitForFunction(
          () => document.querySelectorAll('[role="treeitem"]').length === 0,
        );
      } else {
        await page.waitForFunction(() =>
          /transport_closed:.*memory/i.test(document.body.innerText),
        );
      }
      report.passed = true;
    } finally {
      if (page && !page.isClosed()) {
        report.lastUI = await page.locator("body").innerText();
        await page.screenshot({ path: path.join(evidence, mode + ".png") });
      }
      if (app) await app.close();
      report.errors = errors;
      report.pids = fs.existsSync(pids)
        ? fs.readFileSync(pids, "utf8").trim().split(/\s+/).map(Number)
        : [];
      report.aliveAfterClose = report.pids.filter((pid) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      });
      fs.writeFileSync(
        path.join(evidence, mode + ".json"),
        JSON.stringify(report, null, 2) + "\n",
        { flag: "wx" },
      );
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(report.aliveAfterClose, []);
    assert.ok(
      report.pids.length >= (mode === "off" ? 1 : 2),
      "explicit reopen starts a distinct owned process",
    );
  });
