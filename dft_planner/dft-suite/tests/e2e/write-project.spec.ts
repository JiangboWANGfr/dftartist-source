import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("project.writeFiles 把结构化文件真写进 baseDir", async () => {
  const { app, page } = await launchApp();
  const base = mkdtempSync(join(tmpdir(), "dft-write-"));
  const written: string[] = await page.evaluate(
    (b) => (window as any).dft.project.writeFiles(b, [
      { relPath: "IP/VERILOG/m.v", text: "module m; endmodule" },
      { relPath: "design_info/register_count.tcl", text: "set reg_count(top,total_flops) 1" },
    ]),
    base,
  );
  expect(written.length).toBe(2);
  expect(existsSync(join(base, "IP/VERILOG/m.v"))).toBe(true);
  expect(readFileSync(join(base, "design_info/register_count.tcl"), "utf8")).toContain("total_flops");
  await app.close();
});
