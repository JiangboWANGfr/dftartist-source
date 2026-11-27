import { app, BrowserWindow } from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { DesignHost } from "./design-host.js";
import { resourceLimitsFromEnvironment } from "./resource-limits.js";

let host: DesignHost | undefined;
let quitting = false;
let quitComplete = false;
app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  if (quitComplete) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  void (async () => {
    try {
      await host?.shutdown();
    } catch (error) {
      console.error("Demo shutdown failed", error);
      process.exitCode = 1;
    } finally {
      quitComplete = true;
      app.quit();
    }
  })();
});

// Do not top-level await whenReady: Electron must finish evaluating this ESM entry first.
void app
  .whenReady()
  .then(async () => {
    if (quitting) return;
    const page = fileURLToPath(new URL("./index.html", import.meta.url));
    const window = new BrowserWindow({
      width: 1440,
      height: 1000,
      minWidth: 960,
      minHeight: 640,
      show: false,
      title: "DFT Hierarchy",
      webPreferences: {
        preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    host = new DesignHost(
      window,
      pathToFileURL(page).href,
      process.env.HIER_BIN
        ? resolve(process.env.HIER_BIN)
        : fileURLToPath(new URL("../../../../core/build/hier", import.meta.url)),
      resourceLimitsFromEnvironment(process.env),
    );
    await window.loadFile(page);
    if (!quitting && !window.isDestroyed()) window.show();
  })
  .catch((error: unknown) => {
    console.error("Demo startup failed", error);
    process.exitCode = 1;
    app.quit();
  });
