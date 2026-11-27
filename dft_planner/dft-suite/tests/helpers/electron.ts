import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function launchApp(env: Record<string,string> = {}, extraArgs: string[] = []) {
  const userDataDir = mkdtempSync(join(tmpdir(), "dft-suite-test-"));
  const app: ElectronApplication = await electron.launch({
    args: ["electron/main.cjs", `--user-data-dir=${userDataDir}`, ...extraArgs],
    env: { ...process.env, NODE_ENV: "test", DFT_E2E: "1", ...env } as Record<string,string>,
  });
  const page: Page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}
