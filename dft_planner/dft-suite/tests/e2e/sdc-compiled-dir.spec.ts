// "我还是看不到 /home/wongw/nx9000/dft_studio_db/processor_core/compiled" — that directory is
// where gen_dft.pl's parse_sdc_to_yaml already writes (clock_info_from_func_sdc.yaml,
// dft_clock_define.tcl, dft_clock_mapping.tcl); the SDC tab's clockgen port used to write to
// design_info/ under the .dftproj instead — a different location entirely. This proves the
// "Write ..." buttons in the Clocks & add_clock panel now land in the SAME compiled/ directory,
// given a real CLI-launched (--projectpath/--harden) session.
import { test, expect } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchApp } from "../helpers/electron.ts";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [join(process.cwd(), "..", "dft-core", "build"),
      join(process.cwd(), "..", "dft-core", "dft-core", "build-linux")]
       .find((p) => existsSync(join(p, "hdl")))
  ?? join(process.cwd(), "..", "dft-core", "build");
const FILELIST = join(process.cwd(), "tests/fixtures/soc_clockgen.f");
const SDC = join(process.cwd(), "tests/fixtures/soc_clockgen.sdc");

test("SDC tab: Write buttons land in dft_studio_db/<harden>/compiled, beside gen_dft.pl's own output", async () => {
  test.setTimeout(60_000);
  test.skip(!existsSync(join(BIN, "hdl")), "no hdl binary");
  const projectRoot = mkdtempSync(join(tmpdir(), "dft-studio-compiled-"));
  const harden = "processor_core";
  const { app, page } = await launchApp(
    { DFT_CORE_BIN_DIR: BIN },
    [`--projectpath=${projectRoot}`, `--harden=${harden}`],
  );
  try {
    await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
    await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 30_000 });
    await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("sdc"));
    await page.locator('input[placeholder="SDC / XDC file"]').fill(SDC);
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.locator(".crstat b").waitFor({ timeout: 15_000 });
    await page.locator(".drcrule", { hasText: "6 · Clocks & add_clock" }).click();
    // The Write buttons live under the "Generated Files" tab (the resolved-clock table + SDC
    // source preview occupy the default "Clocks" tab).
    await page.getByRole("button", { name: "Generated Files" }).click();

    // add_clock / tessent_clock_mapping / YAML are each their own sub-tab now.
    const compiledDir = join(projectRoot, "dft_studio_db", harden, "compiled");
    await page.getByRole("button", { name: "Write dft_clock_define.tcl" }).click();
    await expect.poll(() => existsSync(join(compiledDir, "dft_clock_define.tcl")), { timeout: 5_000 }).toBe(true);

    await page.getByRole("button", { name: "tessent_clock_mapping" }).click();
    await page.getByRole("button", { name: "Write dft_clock_mapping.tcl" }).click();
    await expect.poll(() => existsSync(join(compiledDir, "dft_clock_mapping.tcl")), { timeout: 5_000 }).toBe(true);

    await page.getByRole("button", { name: "YAML", exact: true }).click();
    await page.getByRole("button", { name: "Write clock_info_from_func_sdc.yaml" }).click();
    const yamlPath = join(compiledDir, "clock_info_from_func_sdc.yaml");
    await expect.poll(() => existsSync(yamlPath), { timeout: 5_000 }).toBe(true);
    const yaml = readFileSync(yamlPath, "utf8");
    expect(yaml).toContain("top_file:");
    expect(yaml).toContain("clocks:");
    expect(yaml).toContain("GEN_EXPLICIT");
  } finally {
    await app.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
