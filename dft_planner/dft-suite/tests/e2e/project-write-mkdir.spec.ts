import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 回归：genconn 保存（含关窗「保存」）走 dft.project.write 写 Arch/<design>.arch。
// 若 Arch/ 目录不存在，write 必须自动建父目录，否则 fs.writeFile 抛 ENOENT，
// 关窗保存链一抛错就走不到 confirmClose → 窗口卡住不关。
test("project.write 自动建父目录（Arch/ 不存在也能写）", async () => {
  const { app, page } = await launchApp();
  const base = mkdtempSync(join(tmpdir(), "dft-writegc-"));
  const target = join(base, "Arch", "chip.arch"); // Arch/ 尚不存在
  const ok = await page.evaluate((p) => (window as any).dft.project.write(p, "hello-arch"), target);
  expect(ok).toBe(true);
  expect(existsSync(target)).toBe(true);
  expect(readFileSync(target, "utf8")).toBe("hello-arch");
  await app.close();
});
