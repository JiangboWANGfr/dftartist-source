import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
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

// An OS observation after the UI terminal state, not an injected Core response.
function coreChildren(parent) {
  return execFileSync("ps", ["-ax", "-o", "pid=,ppid=,args="], {
    encoding: "utf8",
  })
    .split("\n")
    .flatMap((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      return match &&
        Number(match[2]) === parent &&
        (match[3] === process.env.HIER_BIN || match[3].startsWith(process.env.HIER_BIN + " "))
        ? [Number(match[1])]
        : [];
    });
}

for (const action of ["close", "replace"]) {
  test(
    `A: demo ${action} recovers from a native Worker cleanup failure`,
    { timeout: 30_000 },
    async () => {
      assert(process.env.HIER_BIN, "explicit actual Core executable");
      const heldName = `a-cleanup-held-${process.pid}-${action}.js`;
      const held = path.join(app, "dist", heldName);
      await writeFile(held, "// Native Worker deliberately has no layout reply.\n", { flag: "wx" });
      let electron;
      try {
        electron = await _electron.launch({
          executablePath: binary,
          args: [app],
          env: process.env,
        });
        await electron.evaluate(({ dialog }, input) => {
          dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: [input],
          });
        }, design);
        const page = await electron.firstWindow();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.waitForSelector(".demo-status[data-phase=idle]");
        await page.getByRole("button", { name: "打开设计", exact: true }).click();
        await page.waitForSelector(".demo-status[data-phase=ready]");
        const initialChildren = coreChildren(electron.process().pid);
        assert.equal(initialChildren.length, 1, "one actual Core child before cleanup");
        await page.getByRole("button", { name: "显示原理图", exact: true }).click();
        await page.getByRole("button", { name: "双视图", exact: true }).click();
        await page.getByRole("button", { name: "高级控制", exact: true }).click();
        await page.getByRole("button", { name: "来源与详情", exact: true }).click();
        for (const label of ["追踪选项", "演示与标注", "分组与折叠"]) {
          await page.locator("summary").filter({ hasText: label }).click();
        }
        await page
          .getByRole("tree", { name: "设计层级", exact: true })
          .getByRole("treeitem")
          .first()
          .click();
        await page.getByRole("button", { name: "添加外部示例", exact: true }).click();
        const schematic = page.getByRole("region", {
          name: "设计原理图",
          exact: true,
        });
        await schematic.getByText("plan · success", { exact: true }).waitFor();
        // Keep the real native resource. Only its cleanup method reports a fault after termination.
        await page.evaluate((name) => {
          const NativeWorker = window.Worker;
          window.aCleanupTerminations = 0;
          window.Worker = class extends NativeWorker {
            constructor(_url, options) {
              super(new URL(name, location.href), options);
            }
            terminate() {
              super.terminate();
              window.aCleanupTerminations++;
              throw new Error("A native Worker cleanup sentinel");
            }
          };
        }, heldName);
        await schematic.getByRole("button", { name: "布局", exact: true }).click();
        await schematic.locator('[role="status"]').getByText("pending", { exact: true }).waitFor();
        await page
          .getByRole("button", {
            name: action === "close" ? "关闭设计" : "打开设计",
            exact: true,
          })
          .click();
        try {
          await page.waitForSelector(".demo-status[data-phase=failed]", {
            timeout: 3000,
          });
        } catch (error) {
          console.log(
            JSON.stringify({
              action,
              status: await page.locator(".demo-status").textContent(),
              errors,
            }),
          );
          throw error;
        }
        assert.match(
          await page.locator(".demo-status").textContent(),
          /A native Worker cleanup sentinel/,
        );
        assert.equal(await page.evaluate(() => window.aCleanupTerminations), 1);
        assert.equal(await page.getByRole("tree", { name: "设计层级", exact: true }).count(), 0);
        assert.deepEqual(
          coreChildren(electron.process().pid),
          [],
          "terminal cleanup awaited the actual Core exit",
        );
        assert.deepEqual(errors, [], "cleanup errors are diagnosed, not unhandled rejections");
        assert(await page.getByRole("button", { name: "打开设计", exact: true }).isEnabled());
        await page.getByRole("button", { name: "打开设计", exact: true }).click();
        await page.waitForSelector(".demo-status[data-phase=ready]");
        const reopened = coreChildren(electron.process().pid);
        assert.equal(reopened.length, 1);
        assert.notEqual(reopened[0], initialChildren[0], "reopened with a new Core process");
        await page.getByRole("button", { name: "关闭设计", exact: true }).click();
        await page.waitForSelector(".demo-status[data-phase=idle]");
        assert.deepEqual(coreChildren(electron.process().pid), []);
        assert.deepEqual(errors, []);
        console.log(
          JSON.stringify({
            action,
            initialChildren,
            reopened,
            cleanupFailures: 1,
            pageErrors: errors,
          }),
        );
      } finally {
        if (electron) await electron.close();
        await rm(held);
      }
    },
  );
}
