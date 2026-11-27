import { app, BrowserWindow } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { writeSync } from "node:fs";
import { createElectronSession } from "@hier/client/electron/main";
let win, session;
// The test application owns its exit: window destruction must not bypass exited.
app.on("window-all-closed", () => {});
async function run() {
  try {
    win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(process.env.B_E2E_DIR, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const url = pathToFileURL(path.join(process.env.B_E2E_DIR, "electron-page.html")).href;
    await win.loadURL(url);
    session = createElectronSession({
      webContents: win.webContents,
      documentUrl: url,
      process: {
        command: process.env.HIER_BIN,
        args: [
          "serve",
          "--top",
          "B_id_boundary",
          path.join(process.env.HIER_B_PRODUCT_ROOT, "core/tests/fixtures/m4/id_boundary.sv"),
        ],
      },
    });
    session.exited.catch(() => {});
    const result = await win.webContents.executeJavaScript("globalThis.BRun()");
    assert.deepEqual(result.tops, ["B_id_boundary"]);
    assert.equal(result.root, result.expected);
    assert.equal(result.children, true);
    assert.deepEqual(result.complete, ["complete", "complete"]);
    win.destroy();
    const exited = await session.exited;
    // Synchronously publish the existing final report before explicit app exit.
    writeSync(
      1,
      JSON.stringify({
        kind: "B71-real-contextBridge-SDK-Core",
        passed: 1,
        failed: 0,
        skipped: 0,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        renderer: result,
        completed: true,
        exited,
        versions: process.versions,
      }) + "\n",
    );
    app.exit(0);
  } catch (e) {
    console.error(e);
    win?.destroy();
    session?.close();
    await session?.exited.catch(() => {});
    app.exit(1);
  }
}
void app
  .whenReady()
  .then(run)
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
