// Clock Tree "Generated files" drawer: an engineer reading the Clock Tree already has the func
// SDC path typed into this tab — this collapsible drawer lets them read the resolved add_clock /
// tessent_clock_mapping / clock_info_from_func_sdc.yaml / OCC definition-points text right here,
// as a sibling of the schematic (not a separate view that replaces it), without retyping the same
// path into the separate SDC Check tab. Reuses soc_clockgen's stress fixture since it exercises
// every generated-clock variant (explicit master, inferred master, divide/multiply).
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

test("Clock Tree: 'Generated files' drawer shows add_clock/mapping/yaml/occ beside the schematic", async () => {
  test.setTimeout(60_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");

  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 30_000 });
  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("clocktree"));

  await page.locator('input[placeholder^="func SDC"]').fill(SDC);
  await page.getByRole("button", { name: "Analyze" }).click();
  await page.locator(".crstat", { hasText: "group(s)" }).waitFor({ timeout: 15_000 });

  // The view stays on the schematic — the drawer opens ALONGSIDE it, not instead of it.
  await expect(page.locator("select.tsearch-kind")).toHaveValue("sch");
  const drawer = page.locator('[data-drawer="generated-files"]');
  await expect(drawer).toBeHidden();
  await page.locator('[data-btn="toggle-generated-files"]').click();
  await expect(drawer).toBeVisible();

  // "Clocks" tab (default): the resolved-clock table.
  const row = (name: string) => drawer.locator("tr").filter({ has: page.getByRole("cell", { name, exact: true }) });
  await row("GEN_EXPLICIT").getByRole("cell", { name: "20", exact: true }).waitFor({ timeout: 10_000 });
  await row("GEN_INFERRED").locator("text=(inferred)").waitFor({ timeout: 5_000 });

  // "Generated Files" tab: add_clock / tessent_clock_mapping / YAML are their OWN sub-tabs now,
  // not one long stacked scroll.
  await drawer.getByRole("button", { name: "Generated Files" }).click();
  await expect(drawer.getByRole("button", { name: "Write dft_clock_define.tcl" })).toBeVisible();
  await drawer.getByRole("button", { name: "tessent_clock_mapping" }).click();
  await drawer.locator("text=set tessent_clock_mapping(CLK) CLK").first().waitFor({ timeout: 5_000 });
  await expect(drawer.getByRole("button", { name: "Write dft_clock_mapping.tcl" })).toBeVisible();
  await drawer.getByRole("button", { name: "YAML", exact: true }).click();
  await expect(drawer.getByRole("button", { name: "Write clock_info_from_func_sdc.yaml" })).toBeVisible();

  // "OCC Points" tab — the same report_occ_def_points text dp_shell/DpShellPanel would show,
  // reachable without opening the shell console.
  await drawer.getByRole("button", { name: "OCC Points" }).click();
  await expect(drawer.getByText("dfx_occ_def_point.tcl (OCC definition points)")).toBeVisible();

  // Collapsing and reopening must not lose or corrupt anything — no re-fetch is forced unless
  // the SDC path itself changed.
  await page.locator('[data-btn="toggle-generated-files"]').click();
  await expect(drawer).toBeHidden();
  await page.locator('[data-btn="toggle-generated-files"]').click();
  await drawer.getByRole("button", { name: "Clocks" }).click();
  await row("GEN_EXPLICIT").getByRole("cell", { name: "20", exact: true }).waitFor({ timeout: 5_000 });

  await app.close();
});
