import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright";

const web = fileURLToPath(new URL("../", import.meta.url));
const consumer = process.env.HIER_A_DEMO_DELIVERY;
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo");
const binary = createRequire(path.join(consumer ?? web, "package.json"))("electron");

test("real design information checks changed/restored inputs, keeps the snapshot, and exposes compile diagnostics", {
  timeout: 45_000,
}, async () => {
  assert(process.env.HIER_BIN, "explicit actual Core executable");
  const temp = await mkdtemp(path.join(tmpdir(), "hier-a-input-ui-"));
  const filename = path.join(temp, "top.sv"), filelist = path.join(temp, "input.f");
  const original = 'module top(input logic a, output logic y); assign y=a; endmodule\n';
  const warning = 'module leaf(input logic a); endmodule\nmodule top; leaf u0();\n' +
    Array.from({ length: 149 }, (_, i) => `leaf u${i + 1}();\n`).join("") + 'endmodule\n';
  await writeFile(filename, original); await writeFile(filelist, filename + "\n");
  const electron = await _electron.launch({ executablePath: binary, args: [app], env: process.env });
  const errors = [];
  try {
    const page = await electron.firstWindow(); page.setDefaultTimeout(6000);
    page.on("pageerror", (error) => errors.push(error.message));
    const open = async (input, kind = "source") => {
      await electron.evaluate(({ dialog }, name) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [name] });
      }, input);
      await page.getByLabel("输入类型").selectOption(kind);
      await page.getByLabel("顶层", { exact: true }).fill("top");
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
    };
    const ready = async () => {
      await page.waitForSelector('.demo-status[data-phase="ready"]');
      await page.getByRole("treeitem").first().waitFor();
    };
    const info = page.getByRole("region", { name: "设计信息", exact: true });
    const check = async () => {
      await info.getByRole("button", { name: "检查输入变化", exact: true }).click();
      await info.locator('[data-input-phase="success"]').waitFor();
    };
    await open(filename); await ready();
    assert.match(await info.innerText(), /基于打开时的版本/);
    const opened = await info.locator("time").getAttribute("datetime");
    assert.match(opened, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(await page.locator(".demo-compilation").count(), 0, "clean design has no empty diagnostic panel");
    await check();
    assert.match(await info.innerText(), /未发现变化/);
    await page.getByRole("treeitem").first().click();
    await page.getByRole("region", { name: "设计源码", exact: true }).getByText(/module top\(/).first().waitFor();
    const selection = await page.getByRole("treeitem").first().getAttribute("aria-selected");
    const sourceBefore = await page.getByRole("region", { name: "设计源码", exact: true }).textContent();
    await writeFile(filename, 'module changed; endmodule\n');
    await check();
    assert.match(await info.innerText(), /输入文件已变化，重新加载后才会生效/);
    assert.equal(await info.locator("time").getAttribute("datetime"), opened);
    assert.equal(await page.getByRole("treeitem").first().getAttribute("aria-selected"), selection);
    assert.match(await page.getByRole("treeitem").first().innerText(), /top/);
    assert.equal(await page.getByRole("region", { name: "设计源码", exact: true }).textContent(), sourceBefore,
      "input check does not reload source or recompile the snapshot");
    await writeFile(filename, original);
    // Controlled focus event tests the actual mounted listener and a fresh Core query.
    // It does not claim OS-level focus behavior on other platforms.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await info.getByText("已检查记录的输入，未发现变化", { exact: true }).waitFor();
    assert.equal(await info.getByText(/输入文件已变化/).count(), 0);
    await writeFile(filename, warning);
    await open(filelist, "filelist"); await ready();
    await info.getByText("无法检测 include 和库文件的变化，修改后请手动重新加载", { exact: true }).waitFor();
    await check();
    assert.match(await info.innerText(), /检测范围不完整/);
    const diagnostics = page.locator(".demo-compilation");
    await diagnostics.locator("summary").click();
    assert.match(await diagnostics.innerText(), /150 个警告/);
    assert.match(await diagnostics.innerText(), /input port 'a' has no connection/);
    assert.match(await diagnostics.innerText(), /top\.sv:2/);
    assert.equal(await diagnostics.locator("li").count(), 100);
    assert.match(await diagnostics.innerText(), /诊断列表已截断；上方计数包含全部诊断/);
    await page.getByRole("button", { name: "关闭设计", exact: true }).click();
    await page.waitForSelector('.demo-status[data-phase="idle"]');
    assert.equal(await info.count(), 0);
    assert.equal(await diagnostics.count(), 0);
    await writeFile(filename, 'module top; unknown_t value; endmodule\n');
    await open(filename);
    await page.waitForSelector('.demo-status[data-phase="failed"]');
    assert.match(await page.locator(".demo-status").innerText(), /undeclared identifier 'unknown_t'/);
    assert(!/"result"|"completeness"/.test(await page.locator(".demo-status").innerText()), "error summary has no JSON envelope");
    await diagnostics.locator("summary").click();
    assert.match(await diagnostics.innerText(), /top\.sv:1/);
    assert.equal(await info.count(), 0, "failed design has no live input checker");
    assert.deepEqual(errors, []);
  } finally {
    await electron.close(); await rm(temp, { recursive: true });
  }
});

test("real Core's complete changed list is retained while the information view bounds displayed references", {
  timeout: 30_000,
}, async () => {
  assert(process.env.HIER_BIN);
  const temp = await mkdtemp(path.join(tmpdir(), "hier-a-input-many-"));
  const includes = Array.from({ length: 129 }, (_, i) => path.join(temp, i + ".svh"));
  for (const file of includes) await writeFile(file, "// original\n");
  const filename = path.join(temp, "top.sv");
  await writeFile(filename, includes.map((f) => '`include "' + f + '"').join("\n") + "\nmodule top; endmodule\n");
  const electron = await _electron.launch({ executablePath: binary, args: [app], env: process.env });
  try {
    await electron.evaluate(({ dialog }, input) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
    }, filename);
    const page = await electron.firstWindow();page.setDefaultTimeout(6000);
    await page.getByLabel("顶层", { exact: true }).fill("top");
    await page.getByRole("button", { name: "打开设计", exact: true }).click();
    await page.waitForSelector('.demo-status[data-phase="ready"]');
    for (const file of includes) await writeFile(file, "// changed\n");
    const info = page.getByRole("region", { name: "设计信息", exact: true });
    await info.getByRole("button", { name: "检查输入变化", exact: true }).click();
    await info.getByText("检查完成：129 个文件已变化", { exact: true }).waitFor();
    await info.locator("summary").click();
    assert.equal(await info.locator("li").count(), 100);
    assert.match(await info.innerText(), /仅显示前100项/);
    assert.equal(await page.getByRole("treeitem").count(), 1);
  } finally {
    await electron.close(); await rm(temp, { recursive: true });
  }
});
