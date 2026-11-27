// Real Electron/app/IPC/Core. Only native picker results are injected.
import { app, BrowserWindow, dialog } from "electron";
import assert from "node:assert/strict";
import { writeSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { cases, regressions } from "./cases.mjs";
import { processorWorkflow } from "./processor-workflow.mjs";
import { fixtures } from "./fixtures.mjs";
import { uiCommand } from "./ui.mjs";
const id = process.env.HIER_B_DEMO_CASE,
  entry = process.env.HIER_B_DEMO_ENTRY;
const c = { files: fixtures(), nativeCalls: [], windows: [], known: new Set() },
  queue = [];
let createdResolve, loadedResolve, result;
const created = new Promise((r) => (createdResolve = r)),
  loaded = new Promise((r) => (loadedResolve = r));
app.on("browser-window-created", (_e, w) => {
  c.windows.push(w);
  if (c.w) return;
  c.w = w;
  createdResolve(w);
  w.webContents.once("did-finish-load", () => loadedResolve());
});
const native = dialog.showOpenDialog;
dialog.showOpenDialog = async (w, options) => {
  assert.equal(w, c.w, "picker belongs to its owning window");
  assert(!options?.properties?.includes("multiSelections"), "no multiple input files");
  c.nativeCalls.push({ options, owner: w.id });
  const item = queue.shift();
  assert(item, "unexpected native picker without frozen input");
  item.enter?.();
  if (item.wait) await item.wait;
  if (item.value instanceof Error) throw item.value;
  return { canceled: item.value === null, filePaths: item.value === null ? [] : [item.value] };
};
c.offer = (value) => queue.push({ value });
c.offerHeld = (value) => {
  let enter, release;
  const entered = new Promise((r) => (enter = r)),
    wait = new Promise((r) => (release = r));
  queue.push({ value, wait, enter });
  return { entered, release };
};
c.evaluate = (source, w = c.w) => w.webContents.executeJavaScript(source, true);
c.bridge = async (method, args, w = c.w) => {
  const r = await c.evaluate(
    "window.hierDemo[" + JSON.stringify(method) + "](..." + JSON.stringify(args) + ")",
    w,
  );
  if (method === "openDesign" && r.ok) c.known.add(r.value.sessionId);
  if (method === "closeDesign" && r.ok) c.known.delete(args[0]);
  return r;
};
c.pick = async (kind) => {
  c.offer(c.files[kind]);
  const r = await c.bridge("pickDesign", [{ kind, top: c.files.top }]);
  assert.equal(r.ok, true);
  assert.equal(r.value.label, kind === "source" ? "design.sv" : "design.f");
  assert.equal(typeof r.value.token, "string");
  return r.value;
};
c.close = async (sid) => {
  const r = await c.bridge("closeDesign", [sid]);
  assert.equal(r.ok, true);
  assert.equal(r.value, null);
};
c.roundtrip = async () => {
  const packageRoot =
    process.env.HIER_B_DEMO_PACKAGE_ROOT ?? process.env.HIER_B_PRODUCT_ROOT + "/web";
  const { build } = createRequire(packageRoot + "/package.json")("esbuild");
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("./probe.mjs", import.meta.url))],
    write: false,
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "B73CoreProbe",
    logLevel: "silent",
    plugins: [
      {
        name: "actual-public-SDK",
        setup(b) {
          b.onResolve({ filter: /^@hier\// }, (x) => ({
            path: fileURLToPath(JSON.parse(process.env.HIER_B_DEMO_PUBLIC_ENTRIES)[x.path]),
          }));
        },
      },
    ],
  });
  const r = await c.evaluate(
    bundle.outputFiles[0].text + "\nB73CoreProbe.roots(window.hierBridge)",
  );
  assert.deepEqual(r, { names: [c.files.top], complete: "complete" });
};
c.safePreferences = () => {
  const o = c.w.webContents.getLastWebPreferences();
  assert.equal(o.contextIsolation, true);
  assert.equal(o.nodeIntegration, false);
  assert.equal(o.sandbox, true);
};
c.ui = async (action, arg) => {
  return c.evaluate(
    "(" +
      uiCommand.toString() +
      ")(" +
      JSON.stringify(action) +
      "," +
      JSON.stringify(arg ?? null) +
      ")",
  );
};
c.point = (point) => {
  c.w.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
  c.w.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
};
c.click = async (region, text) => c.point(await c.ui("point", { region, text }));
c.choose = async (region, text, action) =>
  c.point(
    await c.ui("choicePoint", {
      region,
      text,
      action,
      ...(region === "candidates"
        ? text === "definition"
          ? { addressKind: "definition" }
          : { span: c.sourceSpan, occurrenceIndex: text === "u1" ? 1 : text === "u0" ? 0 : -1 }
        : {}),
    }),
  );
c.expand = async (text) => {
  await c.click("tree", text);
  c.w.webContents.sendInputEvent({ type: "keyDown", keyCode: "Right" });
  c.w.webContents.sendInputEvent({ type: "keyUp", keyCode: "Right" });
  await c.ui("treeContains", ["u0", "u1"]);
};
c.beginOpenUI = () => c.click("page", "打开");
c.openUI = async (kind = "source", file = kind, wait = true) => {
  c.offer(c.files[file]);
  await c.ui("configureOpen", { kind, top: c.files.top });
  await c.beginOpenUI();
  if (wait) await c.ui("ready", c.files.top);
};
c.closeUI = async () => {
  await c.click("page", "关闭设计");
  await c.ui("closed");
};
c.submit = async (kind, text) => {
  await c.ui("input", { kind, value: text });
  c.point(await c.ui("submitPoint", kind));
};
c.locate = async (text) => {
  c.sourceSpan = await c.ui("sourceSpan", text);
  const point = await c.ui("sourcePoint", text);
  for (const type of ["mouseDown", "mouseUp"])
    c.w.webContents.sendInputEvent({ type, button: "left", clickCount: 2, ...point });
};
c.prepareExternalSelection = async (text) => {
  await c.submit("path", text);
  await c.ui("externalPathReady");
};
c.reload = async () => {
  const done = new Promise((r) => c.w.webContents.once("did-finish-load", r));
  c.w.webContents.reload();
  await done;
};
c.foreign = async (method, args) => {
  const w = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: process.env.HIER_B_DEMO_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  try {
    await w.loadURL(c.w.webContents.getURL());
    return await c.bridge(method, args, w);
  } finally {
    w.destroy();
  }
};
c.externalBlocked = async () => {
  const before = c.w.webContents.getURL(),
    count = BrowserWindow.getAllWindows().length;
  await c.evaluate(
    'window.open("data:text/html,B73-unapproved"); location.href="data:text/html,B73-unapproved"; void 0',
  );
  await new Promise((r) => setImmediate(r));
  assert.equal(c.w.webContents.getURL(), before);
  assert.equal(BrowserWindow.getAllWindows().length, count);
};
async function run() {
  await created;
  await loaded;
  const item = [...cases, ...regressions, processorWorkflow].find((x) => x.id === id);
  assert(item, "frozen case");
  try {
    await item.run(c);
    result = {
      kind: "B73-demo-complete",
      id,
      passed: true,
      cleanupCompleted: false,
      versions: process.versions,
      ...(c.milestoneEvidence ? { milestoneEvidence: c.milestoneEvidence } : {}),
    };
  } catch (e) {
    result = {
      kind: "B73-demo-complete",
      id,
      passed: false,
      bindingBlocked: e?.bindingBlocked === true,
      error: String(e?.stack ?? e),
      cleanupCompleted: false,
      versions: process.versions,
    };
  } finally {
    try {
      for (const sid of c.known) await c.close(sid);
      const hasClose = await c.ui("hasClose");
      if (hasClose) await c.closeUI();
      result.cleanupCompleted = true;
    } catch (e) {
      result.passed = false;
      result.cleanupError = String(e);
    }
    dialog.showOpenDialog = native;
    app.quit();
  }
}
// The app owns its quit/await-exited policy; the B driver does not prevent quit.
app.on("quit", (_event, exitCode) => {
  if (!result)
    result = {
      kind: "B73-demo-complete",
      id,
      passed: false,
      error: "app exited before case/cleanup completed",
      cleanupCompleted: false,
      versions: process.versions,
    };
  result.appExitCode = exitCode;
  writeSync(1, JSON.stringify(result) + "\n");
});
void import(pathToFileURL(entry).href).then(run).catch((error) => {
  result = {
    kind: "B73-demo-complete",
    id,
    passed: false,
    error: String(error?.stack ?? error),
    cleanupCompleted: false,
    versions: process.versions,
  };
  app.exit(1);
});
