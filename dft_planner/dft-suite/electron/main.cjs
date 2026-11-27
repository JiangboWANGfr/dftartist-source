const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { DaemonClient } = require("./daemon.cjs");
const { resolveBin } = require("./bin.cjs");
const { hdlDump, genconnGenerateAll, genconnInject, ctrlgenGen, padTable, padGen, specgenGen, specgenFragment } = require("./cli.cjs");
const { buildMenuTemplate } = require("./menu.cjs");
const { parseLaunchArgs, USAGE } = require("./argv.cjs");

// Linux(WSLg/远程 X/虚拟机)下 Chromium GPU 合成经常整窗白屏；本应用是 2D canvas，
// 禁硬件加速代价小、兼容性收益大。确需 GPU 时用 --enable-gpu 启动。
if (process.platform === "linux" && !process.argv.includes("--enable-gpu")) {
  app.disableHardwareAcceleration();
}

const isDev = !!process.env.ELECTRON_DEV;
let win = null;
let daemon = null;
let lastOpts = null;
let allowClose = false; // once the renderer (or fallback) approves, the next close goes through
let closeFallback = null; // timer that force-closes if the renderer never answers before-close

// —— CLI 启动参数(spec 2026-07-21)：<projectpath>/<harden> = 工程目录，--filelist 可选 ——
const parsedArgs = parseLaunchArgs(process.argv, process.cwd());
if ("error" in parsedArgs) {
  process.stderr.write(`${parsedArgs.error}\n${USAGE}`);
  process.exit(2);
}
const launchOptions = { projectDir: null, filelist: null, existingProj: null, warning: null, specLogicTestDir: null, compiledDir: null, dftCfgDir: null };

// mkdir/扫描放 whenReady 前的异步 init：失败降级为 warning，不阻断启动。
async function initLaunchOptions() {
  const warns = [];
  if (parsedArgs.projectDir) {
    try {
      await fs.mkdir(parsedArgs.projectDir, { recursive: true });
      launchOptions.projectDir = parsedArgs.projectDir;
      launchOptions.specLogicTestDir = parsedArgs.specLogicTestDir;
      launchOptions.compiledDir = parsedArgs.compiledDir;
      const names = (await fs.readdir(parsedArgs.projectDir)).filter((n) => n.endsWith(".dftproj")).sort();
      if (names[0]) launchOptions.existingProj = path.join(parsedArgs.projectDir, names[0]);
    } catch (err) {
      launchOptions.projectDir = null; // mkdir 成功但扫描失败也回滚 → 降级无参数模式(spec §6)
      warns.push(`Cannot initialize project directory ${parsedArgs.projectDir}: ${err && err.message ? err.message : err}`);
    }
  }
  if (parsedArgs.filelist) {
    try { await fs.access(parsedArgs.filelist); launchOptions.filelist = parsedArgs.filelist; }
    catch { warns.push(`filelist not found: ${parsedArgs.filelist}`); }
  }
  // dft_cfg dir is usually DERIVED (older projects may simply not have it): absent is not a
  // warning, the DFT Config tab just offers Browse instead.
  if (parsedArgs.dftCfgDir) {
    try { await fs.access(parsedArgs.dftCfgDir); launchOptions.dftCfgDir = parsedArgs.dftCfgDir; }
    catch { /* derived path does not exist — silently stay null */ }
  }
  if (warns.length) launchOptions.warning = warns.join("\n");
}

ipcMain.handle("dft:app:launchOptions", () => launchOptions);

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, title: "dft_stark:planner",
    // Dark bg matching the app theme + show only after first paint → no white flash.
    backgroundColor: "#1e1e1e", autoHideMenuBar: true, show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.once("ready-to-show", () => { if (win && !win.isDestroyed()) win.show(); });
  if (isDev) { win.loadURL("http://localhost:5173"); }
  else {
    const indexPath = path.join(__dirname, "..", "dist", "index.html");
    win.loadFile(indexPath, process.env.DFT_E2E ? { search: "e2e=1" } : undefined);
  }
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });

  const menu = Menu.buildFromTemplate(
    buildMenuTemplate((action) => {
      if (win && !win.isDestroyed()) win.webContents.send("dft:menu:action", action);
    }),
  );
  Menu.setApplicationMenu(menu);

  // Ask the renderer (genconn canvas) whether it has unsaved work before closing.
  // First close is intercepted; the renderer replies via the dft:app:close-* IPC below.
  // A short fallback timer force-closes if the renderer never answers (crash / no listener),
  // so a non-dirty or headless close can never hang (e2e calls app.close()).
  win.on("close", (e) => {
    if (allowClose) return;
    e.preventDefault();
    win.webContents.send("dft:app:before-close");
    // Fallback: if the renderer never answers (no listener / crash), force-close so we can't hang.
    // Disarmed in dft:app:close-request the moment the renderer responds (it's alive).
    if (closeFallback) clearTimeout(closeFallback);
    closeFallback = setTimeout(() => {
      closeFallback = null;
      allowClose = true;
      if (win && !win.isDestroyed()) win.close();
    }, 1500);
  });
}

ipcMain.handle("dft:design:open", async (_e, opts) => {
  if (daemon) daemon.dispose();
  lastOpts = opts;
  daemon = new DaemonClient({ ...opts, engine: resolveBin("hdl") });
  return daemon.ready();
});

ipcMain.handle("dft:design:close", async () => {
  if (daemon) daemon.dispose();
  daemon = null;
  lastOpts = null;
});

ipcMain.handle("dft:design:query", async (_e, { method, params }) => {
  if (!daemon) throw new Error("no design open");
  return daemon.query(method, params);
});

ipcMain.handle("dft:design:dump", async () => {
  if (!lastOpts) throw new Error("no design open");
  return hdlDump(lastOpts.filelist, lastOpts.top);
});

ipcMain.handle("dft:design:readSource", async (_e, { file }) => fs.readFile(file, "utf8"));

ipcMain.handle("dft:design:pickFilelist", async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [{ name: "filelist", extensions: ["f", "fl"] }, { name: "all", extensions: ["*"] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("dft:design:pickSdc", async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [{ name: "SDC / XDC", extensions: ["sdc", "xdc"] }, { name: "all", extensions: ["*"] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("dft:design:pickFolder", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("dft:genconn:generateAll", async (_e, { docJson }) => genconnGenerateAll(docJson));

ipcMain.handle("dft:genconn:inject", async (_e, { docJson, vFiles }) => genconnInject(docJson, vFiles));

ipcMain.handle("dft:ctrlgen:gen", async (_e, spec) => ctrlgenGen(spec));

ipcMain.handle("dft:pad:table", async (_e, { filelist, lib }) => padTable(filelist, lib));

ipcMain.handle("dft:pad:gen", async (_e, { filelist, lib, cfg, level, aux }) =>
  padGen(filelist, lib, cfg, level, aux));

ipcMain.handle("dft:pad:pickLib", async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [{ name: "cell library", extensions: ["tcelllib", "lib"] }, { name: "all", extensions: ["*"] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

// pad_cfg.json 挂在 filelist 同目录 (spec §2.2); main 侧算路径避免 renderer 拼 path。
ipcMain.handle("dft:pad:readCfg", async (_e, { filelist }) => {
  const p = path.join(path.dirname(filelist), "pad_cfg.json");
  try { return await fs.readFile(p, "utf8"); }
  catch (err) { if (err && err.code === "ENOENT") return null; throw err; }
});

ipcMain.handle("dft:pad:writeCfg", async (_e, { filelist, json }) => {
  const p = path.join(path.dirname(filelist), "pad_cfg.json");
  await fs.writeFile(p, json, "utf8");
  return p;
});

ipcMain.handle("dft:pad:exportText", async (_e, { defaultName, text }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: defaultName });
  if (r.canceled || !r.filePath) return null;
  await fs.writeFile(r.filePath, text, "utf8");
  return r.filePath;
});

ipcMain.handle("dft:specgen:gen", async (_e, { docJson }) => specgenGen(docJson));

ipcMain.handle("dft:specgen:fragment", async (_e, { fragJson }) => specgenFragment(fragJson));

// ---- 工程 .dftproj IO ----
ipcMain.handle("dft:project:pickNew", async () => {
  const fl = await dialog.showOpenDialog(win, { title: "Select design filelist", properties: ["openFile"], filters: [{ name: "filelist", extensions: ["f", "fl"] }] });
  if (fl.canceled || !fl.filePaths[0]) return null;
  const od = await dialog.showOpenDialog(win, { title: "Select project / output directory", properties: ["openDirectory", "createDirectory"] });
  if (od.canceled || !od.filePaths[0]) return null;
  const filelist = fl.filePaths[0];
  const outputDir = od.filePaths[0];
  const design = path.basename(filelist).replace(/\.[^.]+$/, "");
  const projPath = path.join(outputDir, `${design}.planner.dftproj`);
  return { filelist, outputDir, projPath };
});
ipcMain.handle("dft:project:pickOpen", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Open project", properties: ["openFile"], filters: [{ name: "dftproj", extensions: ["dftproj"] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("dft:project:read", async (_e, { path: p }) => fs.readFile(p, "utf8"));
ipcMain.handle("dft:project:listDir", async (_e, { path: p }) => {
  const names = await fs.readdir(p);
  return names.sort();
});
ipcMain.handle("dft:project:write", async (_e, { path: p, json }) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, json, "utf8"); return true; });
ipcMain.handle("dft:project:writeFiles", async (_e, { baseDir, files }) => {
  const written = [];
  for (const f of files) {
    const abs = path.join(baseDir, f.relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, f.text, "utf8");
    written.push(abs);
  }
  return written;
});
ipcMain.handle("dft:project:recent", async () => {
  const p = path.join(app.getPath("userData"), "recent-projects.json");
  try { const v = JSON.parse(await fs.readFile(p, "utf8")); return Array.isArray(v) ? v : []; } catch { return []; }
});
ipcMain.handle("dft:project:addRecent", async (_e, { path: proj }) => {
  const p = path.join(app.getPath("userData"), "recent-projects.json");
  let list = [];
  try { const v = JSON.parse(await fs.readFile(p, "utf8")); if (Array.isArray(v)) list = v; } catch { /* 无/坏则空 */ }
  list = [proj, ...list.filter((x) => x !== proj)].slice(0, 8);
  await fs.writeFile(p, JSON.stringify(list), "utf8");
  return list;
});

// —— 关窗保存协调（Change 4）——
// renderer 回应 before-close：报告 dirty。不脏 → 立即关；脏 → 弹 保存/不保存/取消 三选。
ipcMain.handle("dft:app:close-request", async (_e, { dirty } = {}) => {
  if (closeFallback) { clearTimeout(closeFallback); closeFallback = null; } // renderer answered → disarm fallback
  if (!dirty) {
    allowClose = true;
    if (win && !win.isDestroyed()) win.close();
    return "closed";
  }
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    title: "Unsaved connection canvas",
    message: "The connection canvas has unsaved changes. Save before closing?",
  });
  return response === 0 ? "save" : response === 1 ? "discard" : "cancel";
});

// 应用内确认框（替代 renderer 阻塞式 window.confirm；WSLg/远程 X 下后者会卡死 UI）。
ipcMain.handle("dft:app:confirm", async (_e, { message }) => {
  const { response } = await dialog.showMessageBox(win, {
    type: "question", buttons: ["OK", "Cancel"], defaultId: 0, cancelId: 1, message,
  });
  return response === 0;
});

// renderer 完成保存/确认丢弃后 → 放行关闭。
ipcMain.handle("dft:app:close-confirm", async () => {
  allowClose = true;
  if (win && !win.isDestroyed()) win.close();
});

app.whenReady().then(async () => {
  await initLaunchOptions();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (daemon) daemon.dispose();
  app.quit();
});

module.exports = { createWindow };
