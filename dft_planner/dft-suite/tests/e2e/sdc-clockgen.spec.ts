// SDC clock-generation feature (parse_sdc_to_yaml port): drives the real SdcTab UI end to end
// against soc_clockgen.v/.sdc — a stress fixture with several create_generated_clock variants
// (explicit -master_clock, -source-only inference, -divide_by, -multiply_by, -edges,
// -combinational), a PAD-named and a DFT-clock-named target (auto-commented add_clock), and a
// clock on a port that does not exist in the design at all (SDC-EMPTY-MATCH must still fire
// under this richer load, not just the trivial one-line soc.sdc fixture).
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))
  ?? path.resolve(process.cwd(), "../dft-core/build");
const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc_clockgen.f");
const SDC = path.resolve(process.cwd(), "tests/fixtures/soc_clockgen.sdc");

test("SDC clockgen: resolved clocks, add_clock commands, and design-existence checks", async () => {
  test.setTimeout(60_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");

  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 30_000 });
  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("sdc"));

  await page.locator('input[placeholder="SDC / XDC file"]').fill(SDC);
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.locator(".crstat b").waitFor({ timeout: 15_000 });

  // ---- design-existence: the nonexistent port still gets caught under this richer load --------
  await page.locator(".drcrule", { hasText: "5 · Against this design" }).click();
  await page.locator("text=SDC-EMPTY-MATCH").waitFor({ timeout: 5_000 });
  await page.locator("text=nosuch_port").waitFor({ timeout: 5_000 });

  // ---- resolved clocks: master inference + every period-math variant -----------------------------
  await page.locator(".drcrule", { hasText: "6 · Clocks & add_clock" }).click();
  const panel = page.locator(".drclist");
  const row = (name: string) => panel.locator("tr", { hasText: name });
  const period = (r: ReturnType<typeof row>, exact: string) =>
    r.getByRole("cell", { name: exact, exact: true }).waitFor({ timeout: 5_000 });

  await period(row("GEN_EXPLICIT"), "20");   // 10 * divide_by 2
  const inferredRow = row("GEN_INFERRED");
  await period(inferredRow, "40");                                          // 10 * divide_by 4
  await inferredRow.locator("text=(inferred)").waitFor({ timeout: 5_000 });  // no -master_clock given
  await period(row("GEN_MULT"), "5");    // 10 / multiply_by 2
  await period(row("GEN_EDGES"), "10");  // (3-1)/2 cycles
  await period(row("GEN_COMB"), "10");   // combinational

  // ---- add_clock commands: PAD and DFT-clock targets come back commented out, with a warning ----
  // (now behind the "Generated Files" tab — the resolved-clock table above is the "Clocks" tab).
  // Each command is its OWN clickable line (not one <pre> blob) — text=... matches any element,
  // so this exercises the real per-line rendering, not just the YAML echo further down the page.
  await panel.getByRole("button", { name: "Generated Files" }).click();
  await panel.locator("text=# add_clock 0 TEST_PAD -period 10ns -label GEN_PAD").first().waitFor({ timeout: 5_000 });
  await panel.locator("text=# add_clock 0 tck_out -period 10ns -label chip_tck").first().waitFor({ timeout: 5_000 });
  // "⚠ " only prefixes the actual warnings list (the YAML block below quotes the same text
  // without it), so this stays unambiguous even though the same wording appears twice on the page.
  await panel.locator("text=⚠ Commented out clock defined on PAD signal").waitFor({ timeout: 5_000 });
  await panel.locator("text=⚠ Commented out DFT clock 'chip_tck'").waitFor({ timeout: 5_000 });

  // ---- tessent_clock_mapping: its own sub-tab, one clickable line per named clock.
  await panel.getByRole("button", { name: "tessent_clock_mapping" }).click();
  await panel.locator("text=set tessent_clock_mapping(CLK) CLK").first().waitFor({ timeout: 5_000 });

  // ---- clicking an add_clock line previews the real SDC source on the right (not just the
  // ---- resolved numbers) — this is the whole point of unifying the right column across tabs.
  await panel.getByRole("button", { name: "add_clock" }).click();
  await panel.locator("text=# add_clock 0 TEST_PAD -period 10ns -label GEN_PAD").first().click();
  await expect(panel).toContainText("create_generated_clock");
  await expect(panel).toContainText("GEN_PAD");

  await app.close();
});
