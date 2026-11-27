import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = path.resolve(process.cwd(), "../dft-core/build");
const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc.f");

test("window.dft.design.open spawns hdl daemon and returns ready", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  const ready = await page.evaluate(
    (fl) => (window as any).dft.design.open({ filelist: fl }),
    FILELIST,
  );
  expect(ready).toBeTruthy();
  await app.close();
});
