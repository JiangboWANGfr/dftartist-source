import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { _electron } from "playwright";

const web = fileURLToPath(new URL("../", import.meta.url));
const consumer = process.env.HIER_A_DEMO_DELIVERY;
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo");
const binary = createRequire(path.join(consumer ?? web, "package.json"))("electron");
function children(parent) {
  return execFileSync("ps", ["-ax", "-o", "pid=,ppid=,args="], { encoding: "utf8" })
    .split("\n").flatMap((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      return match && Number(match[2]) === parent &&
        (match[3] === process.env.HIER_BIN || match[3].startsWith(process.env.HIER_BIN + " "))
        ? [Number(match[1])] : [];
    });
}

test("real demo rejects semantic errors with nonempty tops, reaps Core, and retries warning-only designs", {
  timeout: 40_000,
}, async () => {
  assert(process.env.HIER_BIN, "explicit actual Core executable");
  const temp = await mkdtemp(path.join(tmpdir(), "hier-a-compile-ui-"));
  const fixtures = [
    ["duplicate", "module top; logic a; logic a; endmodule\n", /redefinition of 'a'/],
    ["port", "module leaf(input logic a); endmodule\nmodule top; leaf u(.missing(1'b0)); endmodule\n", /port 'missing' does not exist/],
    ["type", "module top; unknown_t v; endmodule\n", /undeclared identifier 'unknown_t'/],
    ["warning", "module leaf(input logic a); endmodule\nmodule top; leaf u(); endmodule\n"],
  ];
  const clean = path.join(temp, "clean.sv");
  await writeFile(clean, "module top(input logic a, output logic y); assign y=a; endmodule\n");
  for (const [name, text] of fixtures) await writeFile(path.join(temp, name + ".sv"), text);
  let electron;
  const output = [], errors = [], pids = [];
  try {
    electron = await _electron.launch({ executablePath: binary, args: [app], env: process.env });
    electron.process().stdout?.on("data", (chunk) => output.push(String(chunk)));
    const page = await electron.firstWindow();
    page.setDefaultTimeout(5000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByLabel("顶层", { exact: true }).fill("top");
    const open = async (filename) => {
      await electron.evaluate(({ dialog }, input) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
      }, filename);
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
    };
    const ready = async () => {
      await page.waitForSelector('.demo-status[data-phase="ready"]');
      await page.getByRole("treeitem").first().waitFor();
      const current = children(electron.process().pid);
      assert.equal(current.length, 1, "one owned real Core process");
      pids.push(...current);
    };
    for (const [name, , error] of fixtures) {
      await open(path.join(temp, name + ".sv"));
      if (error) {
        await page.waitForSelector('.demo-status[data-phase="failed"]');
        assert.match(await page.locator(".demo-status").innerText(), error);
        assert.equal(await page.getByRole("treeitem").count(), 0);
        assert.deepEqual(children(electron.process().pid), [], "failed design has been reaped");
        assert.equal(await page.getByRole("button", { name: "打开设计", exact: true }).isEnabled(), true);
        await open(clean); await ready();
        await page.getByRole("button", { name: "关闭设计", exact: true }).click();
        await page.waitForSelector('.demo-status[data-phase="idle"]');
        assert.deepEqual(children(electron.process().pid), []);
      } else await ready();
    }
    // These messages reach Chromium's console but must not be forwarded to the host log.
    await page.evaluate(() => {
      console.info('[hier-demo-design] {"scope":"renderer","generation":9,"stage":"ready","path":"A-private-sentinel"}');
      const child = document.createElement("iframe");
      child.srcdoc = '<script>console.info(\'[hier-demo-design] {"scope":"renderer","generation":987654,"stage":"ready"}\')</script>';
      document.body.append(child);
    });
    await page.waitForFunction(() => document.querySelector("iframe")?.contentDocument?.readyState === "complete");
    await page.getByRole("button", { name: "关闭设计", exact: true }).click();
    await page.waitForSelector('.demo-status[data-phase="idle"]');
    assert.deepEqual(children(electron.process().pid), []);
    assert.deepEqual(errors, []);
  } finally {
    if (electron) await electron.close();
    await rm(temp, { recursive: true });
  }
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  const text = output.join("");
  const records = text.split("\n").filter((line) => line.startsWith("[hier-demo-design] "))
    .map((line) => JSON.parse(line.slice("[hier-demo-design] ".length)));
  assert(records.some((r) => r.scope === "renderer" && r.stage === "diagnostics"));
  assert(records.some((r) => r.scope === "renderer" && r.stage === "failed"));
  assert(records.some((r) => r.scope === "host" && r.stage === "exited"));
  assert(!records.some((r) => r.generation === 987654), "child frame cannot forward logs");
  assert(!text.includes("A-private-sentinel"), "arbitrary fields cannot forward logs");
  console.log(JSON.stringify({ corePidsReaped: pids, stages: records }));
});
