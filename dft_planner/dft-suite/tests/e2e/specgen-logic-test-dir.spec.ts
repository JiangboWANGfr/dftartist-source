// "我希望ssn，occ，edt spec 要写到 <projectpath>/dft_studio_db/<harden>/spec/logic_test" — OCC's
// dfx_occ_def_point.tcl already auto-writes there (set_occ_out_dir, design.ts); SSN/EDT/BScan
// specs used to go to the .dftproj's own Spec/ssn|edt|bscan folder instead, a different tree
// entirely whenever the project file wasn't created inside dft_studio_db/<harden>. This proves
// "Write to project" in the SpecGen workspace now lands SSN/EDT files in the SAME logic_test
// directory OCC uses, given a real CLI-launched (--projectpath/--harden) session.
import { test, expect } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchApp } from "../helpers/electron.ts";

const BIN = [join(process.cwd(), "..", "dft-core", "dft-core", "build-linux"),
             join(process.cwd(), "..", "dft-core", "dft-core", "build")]
              .find((p) => existsSync(join(p, "specgen"))) ?? join(process.cwd(), "..", "dft-core", "build");
test.skip(!existsSync(join(BIN, "specgen")), "no specgen binary");

const SEED_DOC = {
  schemaVersion: 1,
  library: {
    defs: [
      {
        id: "p", designName: "p", designLevel: "chip", designType: "hierarchical", inSpecgen: true,
        interfaces: [{ id: "ext", busType: "SSN", role: "client", busWidth: 8 }],
        childInstances: [], connections: [],
        dftIps: [{ id: "dft_cc27bef6", ipType: "ScanHost", instanceName: "ssh_1",
                   position: { x: 140, y: 60 }, config: { use_clock_shaper_cell: "on" } }],
        dftWires: [
          { id: "dw_ba545d6a", from: { kind: "iface", instanceId: "p", interfaceId: "ext", pin: "out" },
            to: { kind: "ip", ipId: "dft_cc27bef6", port: "bus_data_in" } },
          { id: "dw_39841f92", from: { kind: "ip", ipId: "dft_cc27bef6", port: "bus_data_out" },
            to: { kind: "iface", instanceId: "p", interfaceId: "ext", pin: "in" } },
        ],
      },
    ],
  },
  ui: { openDefId: "p", rootDefId: "p" },
  ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1,
};

test("SpecGen: Write to project lands SSN spec in dft_studio_db/<harden>/spec/logic_test", async () => {
  test.setTimeout(120_000);
  const projectRoot = mkdtempSync(join(tmpdir(), "dft-studio-specgen-"));
  const harden = "processor_core";
  const { app, page } = await launchApp(
    { DFT_CORE_BIN_DIR: BIN },
    [`--projectpath=${projectRoot}`, `--harden=${harden}`],
  );
  try {
    await page.evaluate((docJson) => {
      const gc = (window as any).__gcStore.getState();
      gc.openText(docJson);
      gc.openSpecgenScope("p");
    }, JSON.stringify(SEED_DOC));

    await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
    await page.click('[data-tab="specgen"]');
    await expect(page.locator("#ws-specgen .specgen")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".dft-scopebar select")).toHaveValue("p", { timeout: 10_000 });

    await page.locator(".dft-scopebar .gen-dftspec").click();
    await expect(page.locator(".dft-specpanel")).toBeVisible({ timeout: 10_000 });
    const preview = page.locator(".dft-specpanel .dft-preview");
    await expect(preview).toContainText("read_config_data -in_wrapper $dftspec", { timeout: 30_000 });

    await page.getByRole("button", { name: "Write to project" }).click();
    const expectPath = join(projectRoot, "dft_studio_db", harden, "spec", "logic_test", "ssn", "p.spec");
    await expect.poll(() => existsSync(expectPath), { timeout: 5_000 }).toBe(true);
    expect(readFileSync(expectPath, "utf8")).toContain("read_config_data -in_wrapper $dftspec");
  } finally {
    await app.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
