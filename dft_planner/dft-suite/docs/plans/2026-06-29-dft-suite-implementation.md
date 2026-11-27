# dft-suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge Hierarchyshower (层次浏览) and newProject/GenConnection (连接生成) into one packaged Electron desktop app `dft-suite`, backed by the dft-core C++ engine, with dark/light themes and a real test harness that gates against UI overlap (穿模) and jank (卡顿).

**Architecture:** One Electron shell (`src/shell/`) hosts two workspaces (`src/hierarchy/`, `src/genconn/`) that share a single opened design and a single dft-core backend. The renderer talks to the backend through one preload bridge `window.dft`; the main process owns one long-lived `hdl serve` daemon (NDJSON over stdio) plus one-shot `genconn` CLI calls. Theme is CSS-variable driven (dark default + light). Packaging is electron-builder → Linux AppImage with dft-core binaries bundled via `extraResources`.

**Tech Stack:** Electron 42 · Vite 8 · React 18.3 · Konva 10 / react-konva · Zustand 5 (+ zundo) · elkjs · TypeScript 6 · node:test (unit/integration) · @playwright/test `_electron` (E2E + visual regression + perf gates).

**Spec:** `docs/specs/2026-06-29-dft-suite-design.md`. **Stack decision (no Qt):** §1 of spec.

---

## How to read this plan

- Phases are ordered; each phase ends in a **working, testable** app. Do not start phase N+1 until phase N's tests are green.
- Each task is TDD where it bears logic (write failing test → run → implement → run → commit). Pure file-move tasks state exact moves + the wiring diffs.
- **Quality gates** (`assertNoOverlap`, `assertNoOverflow`, `measureFps`, `measureLatency`, visual snapshots) are defined once in Phase 0 and re-run by every workspace phase. They are the anti-穿模 / anti-卡顿 mechanism.
- All paths are relative to the repo root `dft-suite/` unless absolute.
- dft-core binaries during dev resolve from `../dft-core/build/{hdl,genconn,drc}` (confirmed present). In the packaged app they resolve from `process.resourcesPath/bin/`.

---

## Shared Contracts (the consistency anchor — every task uses these exact names)

### C1. Preload bridge `window.dft` (`electron/preload.cjs` → typed in `src/core-bridge/dft.d.ts`)

```ts
interface DftBridge {
  design: {
    open(opts: OpenOpts): Promise<ReadyResult>;       // spawn hdl serve daemon, await ready
    close(): Promise<void>;                            // dispose daemon
    query(method: string, params?: object): Promise<unknown>; // NDJSON daemon round-trip
    dump(): Promise<DesignHierarchy>;                  // full hierarchy JSON (for genconn panel)
    readSource(file: string): Promise<string>;
    pickFilelist(): Promise<string | null>;
    pickFolder(): Promise<string | null>;
  };
  genconn: {
    generateAll(docJson: string): Promise<GenerateResult>;            // genconn generate-all
    inject(docJson: string, vFiles: VFile[]): Promise<VFile[]>;       // genconn inject
  };
}
type OpenOpts = { filelist: string; vars?: Record<string,string>; substs?: [string,string][]; top?: string|null };
type VFile = { path: string; text: string };
type GenerateResult = { files: { name: string; text: string }[]; unconnected: string[] };
// ReadyResult, DesignHierarchy, PortsResult, ExpandResult, TraceResult, SourceLocation
//   are reused verbatim from Hierarchyshower's src/core/model.ts (moved to src/core-bridge/model.ts).
```

IPC channels (main ↔ renderer): `dft:design:open|close|query|dump|readSource|pickFilelist|pickFolder`, `dft:genconn:generateAll|inject`.

### C2. dft-core CLI commands (invoked from `electron/cli.cjs` and `electron/daemon.cjs`)

```
hdl serve <filelist> [--var k=v]... [--subst a=b]... [--top T]     # long-lived NDJSON daemon
hdl dump  <filelist> [--top T]                                     # one-shot full DesignHierarchy JSON
genconn generate-all <doc.json>                                    # → stdout JSON {files:[{name,text}],unconnected:[...]}
genconn inject <doc.json> <file.v>...                             # → stdout JSON [{path,text}]
```

Binary resolution helper `resolveBin(name)` (`electron/bin.cjs`): dev → `path.join(__dirname,'..','..','dft-core','build',name)`; prod → `path.join(process.resourcesPath,'bin',name)`; env override `DFT_CORE_BIN_DIR`.

### C3. Shared store `useDesign` (`src/store/design.ts`, Zustand)

```ts
type Workspace = 'hierarchy' | 'genconn';
type Theme = 'dark' | 'light';
interface DesignState {
  status: 'idle'|'opening'|'ready'|'error'; error: string|null;
  ready: ReadyResult|null; filelist: string|null; top: string|null;
  selected: { nodeId: string; defId: string } | null;
  workspace: Workspace; theme: Theme;
  openDesign(opts: OpenOpts): Promise<void>;
  closeDesign(): Promise<void>;
  select(ref: { nodeId: string; defId: string } | null): void;
  setWorkspace(w: Workspace): void;
  setTheme(t: Theme): void;
}
```
Each workspace keeps its own local store (`src/hierarchy/store.ts`, `src/genconn/store.ts`) for tab/selection/doc/undo state. The shared `useDesign` holds only cross-workspace state.

### C4. Theme (`src/theme/`)

`theme.css` = the dark `:root` tokens + `html.light{…}` overrides (already authored for mockups: `docs/mockups/_src/theme.css` is the visual reference). `setTheme(t)` toggles `document.documentElement.classList` and persists to `localStorage['dft-suite.theme']`.

### C5. Quality-gate helpers (`tests/helpers/`) — anti-穿模 / anti-卡顿

- `electron.ts` → `launchApp(env?)`: Playwright `_electron.launch({ args:['electron/main.cjs'], env })`; returns `{ app, page }`.
- `layout.ts`:
  - `assertNoOverlap(page, selectors)`: pairwise bounding-box intersection must be empty (the **穿模 gate**).
  - `assertNoOverflow(page, selector)`: `scrollWidth ≤ clientWidth+1 && scrollHeight ≤ clientHeight+1` (no clipped/bleeding content).
- `perf.ts`:
  - `measureFps(page, action)`: sample `requestAnimationFrame` deltas across `action`; return avg fps. Gate: **≥ 50 fps**.
  - `measureLatency(page, action)`: `performance.now()` around `action`; gate per task (default **< 120 ms**).
- Visual regression: Playwright `await expect(page).toHaveScreenshot('<name>.png', { maxDiffPixelRatio: 0.01 })` per workspace × theme.

---

## File Structure (decomposition locked here)

```
dft-suite/
  package.json                    # merged deps + scripts (dev, build, test:unit, test:e2e, build:desktop)
  vite.config.ts                  # base "./", host 127.0.0.1:5173 (NO /api proxy — daemon replaces it)
  tsconfig.json  index.html
  electron-builder.yml            # Linux AppImage + extraResources resources/bin
  playwright.config.ts            # _electron project, snapshot + perf
  electron/
    main.cjs                      # window + IPC handlers + daemon lifecycle (one per design)
    preload.cjs                   # exposes window.dft (C1)
    daemon.cjs                    # DaemonClient (moved from Hierarchyshower, engine = resolveBin('hdl'))
    cli.cjs                       # one-shot genconn/hdl-dump runner (new)
    bin.cjs                       # resolveBin(name) (C2)
  resources/bin/                  # dft-core binaries copied at build time (gitignored; built on Linux)
  src/
    main.tsx                      # mounts <App/>, applies persisted theme
    shell/
      App.tsx                     # topbar tabs + workspace router + status bar
      TopBar.tsx  StatusBar.tsx  OpenDesign.tsx  ThemeToggle.tsx
    store/design.ts               # useDesign (C3)
    core-bridge/
      model.ts                    # ReadyResult/DesignHierarchy/Ports/Trace types (moved from HS)
      dft.d.ts                    # window.dft typing (C1)
      client.ts                   # typed wrappers over window.dft.design.* (moved/renamed from HS client.ts)
      genconn.ts                  # typed wrappers over window.dft.genconn.*
    theme/theme.css  theme/index.ts
    hierarchy/                    # = Hierarchyshower src/ui + src/core (workspace component)
      Workspace.tsx  store.ts  HierarchyTree.tsx  PortsTab.tsx  TabArea.tsx
      HdlSourceTab.tsx  ContextMenu.tsx  schematic/*  core/*
    genconn/                      # = newProject src/ui + src/core (workspace component)
      Workspace.tsx  store.ts  CanvasView.tsx  Inspector.tsx  LibraryPanel.tsx
      HierarchyPanel.tsx  GeneratePanel.tsx  Toolbar.tsx  core/*  layout.ts  snap.ts
  tests/
    helpers/{electron,layout,perf}.ts
    unit/*.test.ts                # node:test
    integration/*.test.ts         # node:test, spawns real dft-core binaries (skip if absent)
    e2e/*.spec.ts                 # playwright _electron
```

---

# Phase 0 — Scaffold, tooling, and the test harness

**Outcome:** `dft-suite` builds and launches a near-empty Electron window; `npm run test:unit`, `npm run test:e2e` both run green; quality-gate helpers exist and are exercised by a smoke E2E.

### Task 0.1: Project scaffolding (package.json, configs)

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/shell/App.tsx`

- [ ] **Step 1: `package.json`** (merged dependency union of both apps + test tooling)

```json
{
  "name": "dft-suite",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "electron/main.cjs",
  "scripts": {
    "dev": "vite",
    "dev:electron": "concurrently -k \"vite\" \"wait-on tcp:127.0.0.1:5173 && ELECTRON_DEV=1 electron electron/main.cjs\"",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test:unit": "node --test 'tests/unit/*.test.ts' 'tests/integration/*.test.ts'",
    "test:e2e": "playwright test",
    "test": "npm run typecheck && npm run test:unit",
    "build:desktop": "npm run build && electron-builder --linux AppImage --x64"
  },
  "dependencies": {
    "elkjs": "^0.11.1", "konva": "^10.3.0", "react": "^18.3.1", "react-dom": "^18.3.1",
    "react-konva": "^18.2.16", "zundo": "^2.3.0", "zustand": "^5.0.14"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0", "@types/node": "^22.19.19", "@types/react": "^18.3.30",
    "@types/react-dom": "^18.3.7", "@vitejs/plugin-react": "^6.0.2", "concurrently": "^10.0.3",
    "electron": "^42.3.3", "electron-builder": "^26.15.2", "typescript": "^6.0.3",
    "vite": "^8.0.16", "wait-on": "^9.0.10"
  }
}
```

- [ ] **Step 2: `vite.config.ts`** (no `/api` proxy — the daemon replaces `hier_server.py`)

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true, open: false },
}));
```

- [ ] **Step 3: `tsconfig.json`, `index.html`, `src/main.tsx`, minimal `src/shell/App.tsx`**

```jsonc
// tsconfig.json
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
  "jsx": "react-jsx", "strict": true, "allowImportingTsExtensions": true, "noEmit": true,
  "lib": ["ES2022","DOM","DOM.Iterable"], "types": ["node"] }, "include": ["src","tests","electron"] }
```
```html
<!-- index.html --> <!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>dft-suite</title></head><body><div id="root"></div>
<script type="module" src="/src/main.tsx"></script></body></html>
```
```tsx
// src/main.tsx
import { createRoot } from "react-dom/client";
import { App } from "./shell/App.tsx";
import "./theme/theme.css";
const t = localStorage.getItem("dft-suite.theme");
if (t === "light") document.documentElement.classList.add("light");
createRoot(document.getElementById("root")!).render(<App />);
```
```tsx
// src/shell/App.tsx (placeholder; real shell in Phase 1)
export function App() { return <div id="app-root" style={{height:"100vh"}}>dft-suite</div>; }
```

- [ ] **Step 4: copy theme + verify dev boots**

Run: `cp docs/mockups/_src/theme.css src/theme/theme.css` then `npm install && npm run dev`
Expected: vite serves at `http://127.0.0.1:5173`, page shows "dft-suite".

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(scaffold): dft-suite vite+electron skeleton"`

### Task 0.2: Electron main + preload skeleton

**Files:** Create `electron/main.cjs`, `electron/preload.cjs`, `electron/bin.cjs`

- [ ] **Step 1: `electron/bin.cjs`** (binary resolver, C2)

```js
const path = require("node:path");
function resolveBin(name) {
  const dir = process.env.DFT_CORE_BIN_DIR
    || (process.env.ELECTRON_DEV ? path.join(__dirname, "..", "..", "dft-core", "build")
                                 : path.join(process.resourcesPath, "bin"));
  return path.join(dir, name);
}
module.exports = { resolveBin };
```

- [ ] **Step 2: `electron/main.cjs`** (window + dev/prod load; IPC added in Phase 2)

```js
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const isDev = !!process.env.ELECTRON_DEV;
let win = null;
function createWindow() {
  win = new BrowserWindow({ width: 1440, height: 900, title: "dft-suite",
    backgroundColor: "#0d1117", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false } });
  if (isDev) { win.loadURL("http://localhost:5173"); }
  else { win.loadFile(path.join(__dirname, "..", "dist", "index.html")); }
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}
app.whenReady().then(() => { createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on("window-all-closed", () => app.quit());
module.exports = { createWindow };
```

- [ ] **Step 3: `electron/preload.cjs`** (empty `window.dft` shell; filled in Phase 2)

```js
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("dft", { design: {}, genconn: {} });
```

- [ ] **Step 4: verify** — `npm run build && ELECTRON_DEV= electron electron/main.cjs` opens a window loading `dist/index.html`. (Or `npm run dev:electron`.)
- [ ] **Step 5: Commit** — `git commit -am "feat(electron): main+preload skeleton"`

### Task 0.3: Quality-gate helpers (anti-穿模 / anti-卡顿)

**Files:** Create `tests/helpers/electron.ts`, `tests/helpers/layout.ts`, `tests/helpers/perf.ts`, `playwright.config.ts`

- [ ] **Step 1: `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  snapshotPathTemplate: "tests/e2e/__screenshots__/{arg}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: { trace: "on-first-retry" }, workers: 1, retries: 0,
});
```

- [ ] **Step 2: `tests/helpers/electron.ts`**

```ts
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
export async function launchApp(env: Record<string,string> = {}) {
  const app: ElectronApplication = await electron.launch({
    args: ["electron/main.cjs"],
    env: { ...process.env, NODE_ENV: "test", ...env } as Record<string,string>,
  });
  const page: Page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}
```

- [ ] **Step 3: `tests/helpers/layout.ts`** (the 穿模 gate)

```ts
import { expect, type Page } from "@playwright/test";
type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 &&
  a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

export async function assertNoOverlap(page: Page, selectors: string[]) {
  const boxes: { sel: string; box: Box }[] = [];
  for (const sel of selectors) {
    const box = await page.locator(sel).first().boundingBox();
    expect(box, `selector not found / not visible: ${sel}`).not.toBeNull();
    boxes.push({ sel, box: box! });
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      expect(overlap(boxes[i].box, boxes[j].box),
        `穿模: ${boxes[i].sel} overlaps ${boxes[j].sel}`).toBe(false);
}

export async function assertNoOverflow(page: Page, selector: string) {
  const r = await page.locator(selector).first().evaluate((el: HTMLElement) => ({
    sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));
  expect(r.sw, `${selector} 横向溢出/穿模`).toBeLessThanOrEqual(r.cw + 1);
  expect(r.sh, `${selector} 纵向溢出/穿模`).toBeLessThanOrEqual(r.ch + 1);
}
```

- [ ] **Step 4: `tests/helpers/perf.ts`** (the 卡顿 gate)

```ts
import { expect, type Page } from "@playwright/test";
/** Average fps observed while `action` runs. */
export async function measureFps(page: Page, action: () => Promise<void>) {
  await page.evaluate(() => { (window as any).__frames = []; let stop = false;
    const tick = (t: number) => { (window as any).__frames.push(t); if (!stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick); (window as any).__stopFrames = () => { stop = true; }; });
  await action();
  const fps = await page.evaluate(() => { (window as any).__stopFrames();
    const f: number[] = (window as any).__frames; if (f.length < 3) return 60;
    const dur = (f[f.length-1] - f[0]) / 1000; return (f.length - 1) / dur; });
  return fps;
}
export async function expectSmooth(page: Page, action: () => Promise<void>, minFps = 50) {
  const fps = await measureFps(page, action);
  expect(fps, `卡顿: ${fps.toFixed(1)}fps < ${minFps}`).toBeGreaterThanOrEqual(minFps);
}
export async function measureLatency(page: Page, action: () => Promise<void>) {
  const t0 = Date.now(); await action(); return Date.now() - t0;
}
```

- [ ] **Step 5: smoke E2E `tests/e2e/smoke.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { assertNoOverflow } from "../helpers/layout.ts";
test("app launches and root fills viewport without overflow", async () => {
  const { app, page } = await launchApp();
  await expect(page.locator("#app-root")).toBeVisible();
  await assertNoOverflow(page, "#app-root");
  await app.close();
});
```

- [ ] **Step 6: run** — `npx playwright install chromium` then `npm run test:e2e`. Expected: 1 passed.
- [ ] **Step 7: Commit** — `git commit -am "test(harness): playwright electron + overlap/overflow/fps gates"`

### Task 0.4: Stage deterministic test fixtures

**Files:** Create `tests/fixtures/soc.v`, `tests/fixtures/soc.f`; copy genconn goldens.

- [ ] **Step 1: tiny deterministic design** (fast + known instance names for E2E)

```verilog
// tests/fixtures/soc.v
module cpu(input clk, input rst_n, output reg [31:0] pc);
  always @(posedge clk) pc <= rst_n ? pc + 1 : 32'b0;
endmodule
module mem(input clk, input [31:0] addr, output reg [31:0] data);
  always @(posedge clk) data <= addr;
endmodule
module soc(input clk, input rst_n);
  wire [31:0] pc;
  cpu u_cpu(.clk(clk), .rst_n(rst_n), .pc(pc));
  mem u_mem(.clk(clk), .addr(pc), .data());
endmodule
```
```
// tests/fixtures/soc.f   (filelist-relative)
soc.v
```

- [ ] **Step 2: copy genconn goldens from newProject** (real, already exist)

```bash
cp ../newProject/test/fixtures/chip.genconn.json tests/fixtures/chip.genconn.json
cp ../newProject/test/fixtures/chip.v            tests/fixtures/chip.v
cp ../newProject/top.top_level_ports_and_connectionss tests/fixtures/top.golden
cp ../newProject/test/fixture.chip.ts            tests/fixtures/chip.doc.ts   # exported example doc
```

- [ ] **Step 3: sanity** — `DFT_CORE_BIN_DIR=../dft-core/build ../dft-core/build/hdl dump tests/fixtures/soc.f` prints a hierarchy whose `definitions` include `soc`, `cpu`, `mem`. (If `hdl dump` wants a source not a filelist, pass `tests/fixtures/soc.v` — confirm and use consistently.)
- [ ] **Step 4: Commit** — `git commit -am "test(fixtures): tiny soc design + genconn goldens"`

---

# Phase 1 — Shell: tabs, status bar, theme, shared design store

**Outcome:** Two-tab shell (层次浏览 / 连接生成) with global status bar, working dark/light toggle, and a `useDesign` store. Workspaces are placeholders. E2E asserts no overlap between topbar/body/statusbar in both themes + a visual snapshot per theme.

### Task 1.1: Shared design store

**Files:** Create `src/store/design.ts`; Test `tests/unit/design-store.test.ts`

- [ ] **Step 1: failing unit test**

```ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { useDesign } from "../../src/store/design.ts";
test("default workspace is hierarchy and theme dark", () => {
  const s = useDesign.getState();
  assert.equal(s.workspace, "hierarchy"); assert.equal(s.theme, "dark"); assert.equal(s.status, "idle");
});
test("setWorkspace / setTheme mutate state", () => {
  useDesign.getState().setWorkspace("genconn");
  assert.equal(useDesign.getState().workspace, "genconn");
  useDesign.getState().setTheme("light");
  assert.equal(useDesign.getState().theme, "light");
});
```

- [ ] **Step 2: run** — `node --test tests/unit/design-store.test.ts` → FAIL (module missing).
- [ ] **Step 3: implement `src/store/design.ts`** per C3. `openDesign` calls `window.dft.design.open` when present, sets status; in non-Electron (unit) env, guard `typeof window`. `setTheme` toggles `document.documentElement.classList` + localStorage when `document` exists.

```ts
import { create } from "zustand";
type Workspace = "hierarchy" | "genconn"; type Theme = "dark" | "light";
// ...full interface per C3...
export const useDesign = create<DesignState>((set, get) => ({
  status: "idle", error: null, ready: null, filelist: null, top: null, selected: null,
  workspace: "hierarchy", theme: "dark",
  async openDesign(opts) {
    set({ status: "opening", error: null });
    try { const ready = await window.dft.design.open(opts);
      set({ status: "ready", ready, filelist: opts.filelist, top: opts.top ?? null }); }
    catch (e) { set({ status: "error", error: String((e as Error).message ?? e) }); }
  },
  async closeDesign() { try { await window.dft?.design.close(); } finally {
    set({ status: "idle", ready: null, filelist: null, selected: null }); } },
  select(ref) { set({ selected: ref }); },
  setWorkspace(w) { set({ workspace: w }); },
  setTheme(t) { if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("light", t === "light");
      localStorage.setItem("dft-suite.theme", t); } set({ theme: t }); },
}));
```

- [ ] **Step 4: run** → PASS. **Step 5: Commit** — `git commit -am "feat(store): shared useDesign (workspace/theme/design)"`

### Task 1.2: Shell components (TopBar, StatusBar, OpenDesign, ThemeToggle, App)

**Files:** Create `src/shell/{TopBar,StatusBar,OpenDesign,ThemeToggle,App}.tsx`

- [ ] **Step 1:** Build the shell. Reuse the mockup markup/classes (`docs/mockups/_src/00-overview.html` topbar, `01-hierarchy.html` statusbar) so the implemented DOM matches the approved visuals. Key structure (drives the overlap gate selectors):

```tsx
// src/shell/App.tsx
export function App() {
  const ws = useDesign(s => s.workspace);
  return (
    <div id="app-root" className="app">
      <TopBar />
      <div className="body" id="ws-body">
        {ws === "hierarchy" ? <HierarchyWorkspace/> : <GenconnWorkspace/>}
      </div>
      <StatusBar />
    </div>
  );
}
```
`TopBar` renders `.tab` buttons calling `setWorkspace`, the `OpenDesign` button, and `ThemeToggle`. Give stable test ids: `#topbar`, `#statusbar`, `#ws-body`, `[data-tab="hierarchy"]`, `[data-tab="genconn"]`, `#theme-toggle`. (Phase 1 workspaces are placeholders `<div id="ws-hierarchy"/>` / `<div id="ws-genconn"/>`.)

- [ ] **Step 2: E2E `tests/e2e/shell.spec.ts`** (overlap + theme + visual)

```ts
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { assertNoOverlap, assertNoOverflow } from "../helpers/layout.ts";
test("shell regions never 穿模, in both themes", async () => {
  const { app, page } = await launchApp();
  const regions = ["#topbar", "#ws-body", "#statusbar"];
  await assertNoOverlap(page, regions);
  await assertNoOverflow(page, "#app-root");
  await expect(page).toHaveScreenshot("shell-dark.png");
  await page.click("#theme-toggle");
  await assertNoOverlap(page, regions);
  await expect(page).toHaveScreenshot("shell-light.png");
  await app.close();
});
test("tab switch changes workspace", async () => {
  const { app, page } = await launchApp();
  await page.click('[data-tab="genconn"]');
  await expect(page.locator("#ws-genconn")).toBeVisible();
  await app.close();
});
```

- [ ] **Step 3: run** — `npm run test:e2e` (first run writes snapshots; review them). Expected: green after baseline.
- [ ] **Step 4: Commit** — `git commit -am "feat(shell): topbar tabs + statusbar + theme toggle + overlap gate"`

---

# Phase 2 — Core bridge: window.dft, daemon lifecycle, genconn CLI

**Outcome:** `window.dft` fully wired; main process owns one `hdl serve` daemon per open design and runs `genconn` one-shots. Integration tests drive the **real** dft-core binaries (skip if absent).

### Task 2.1: Move model types + daemon client + bin resolver

**Files:** Create `src/core-bridge/model.ts` (copy of `Hierarchyshower/src/core/model.ts`), `electron/daemon.cjs` (copy of `Hierarchyshower/electron/daemon.cjs`), already-created `electron/bin.cjs`.

- [ ] **Step 1:** Copy `Hierarchyshower/src/core/model.ts` → `src/core-bridge/model.ts` verbatim. Copy `Hierarchyshower/electron/daemon.cjs` → `electron/daemon.cjs` verbatim (it already supports `opts.engine`).
- [ ] **Step 2: Commit** — `git commit -am "chore(bridge): import model.ts + DaemonClient from Hierarchyshower"`

### Task 2.2: CLI runner (`electron/cli.cjs`) with integration test

**Files:** Create `electron/cli.cjs`; Test `tests/integration/cli.test.ts`

- [ ] **Step 1: failing integration test** (uses real `hdl dump` on a fixture; skips if binary missing)

```ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { existsSync } from "node:fs"; import { resolveBin } from "../../electron/bin.cjs";
import { hdlDump } from "../../electron/cli.cjs";
const FILELIST = "tests/fixtures/soc.f"; // staged in Task 0.4
const have = existsSync(resolveBin("hdl"));
test("hdl dump returns a hierarchy with rootInstanceIds", { skip: !have }, async () => {
  const h = await hdlDump(FILELIST);
  assert.ok(Array.isArray(h.rootInstanceIds) && h.rootInstanceIds.length > 0);
  assert.ok(h.instances && typeof h.instances === "object");
});
```

> Fixtures are staged in Task 0.4. If `hdl serve`/`dump` expects a source file rather than a `.f`, pass `tests/fixtures/soc.v` and keep it consistent across daemon + dump.

- [ ] **Step 2: run** → FAIL (cli.cjs missing). **Step 3: implement `electron/cli.cjs`**

```js
const { spawn } = require("node:child_process");
const { resolveBin } = require("./bin.cjs");
function run(bin, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(resolveBin(bin), args);
    let out = "", err = "";
    p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
    p.on("error", reject);
    p.on("close", c => c === 0 ? resolve(out) : reject(new Error(`${bin} ${args.join(" ")} exit ${c}: ${err.slice(-800)}`)));
    if (input != null) { p.stdin.write(input); p.stdin.end(); }
  });
}
async function hdlDump(filelist, top) {
  const args = ["dump", filelist]; if (top) args.push("--top", top);
  return JSON.parse(await run("hdl", args));
}
async function genconnGenerateAll(docJson) {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const f = path.join(os.tmpdir(), `gc-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(f, docJson);
  try { return JSON.parse(await run("genconn", ["generate-all", f])); }
  finally { try { fs.unlinkSync(f); } catch {} }
}
async function genconnInject(docJson, vFiles) {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gc-"));
  const doc = path.join(dir, "doc.json"); fs.writeFileSync(doc, docJson);
  const paths = vFiles.map(v => { const p = path.join(dir, path.basename(v.path)); fs.writeFileSync(p, v.text); return p; });
  try { return JSON.parse(await run("genconn", ["inject", doc, ...paths])); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
module.exports = { run, hdlDump, genconnGenerateAll, genconnInject };
```

> Adjust the `genconn` arg/stdout shape to the real CLI if it differs — confirm with `genconn generate-all --help` and `dft-core/genconn-core/README.md` before implementing; keep the `{files,unconnected}` / `[{path,text}]` return contract (C1) by transforming here if needed.

- [ ] **Step 4: run** → PASS (or skip if no binary). **Step 5: Commit** — `git commit -am "feat(bridge): cli.cjs hdl-dump + genconn generate/inject (+integration test)"`

### Task 2.3: Wire IPC in main + expose window.dft in preload

**Files:** Modify `electron/main.cjs`; Modify `electron/preload.cjs`; Create `src/core-bridge/dft.d.ts`, `src/core-bridge/client.ts`, `src/core-bridge/genconn.ts`

- [ ] **Step 1:** Add to `electron/main.cjs`: `ipcMain.handle` for each channel in C1, mirroring Hierarchyshower's handlers, plus the new `dft:design:dump` (calls `hdlDump`) and genconn channels. Daemon lifecycle = Hierarchyshower's (`open` disposes prior daemon, spawns `new DaemonClient({ ...opts, engine: resolveBin('hdl') })`, returns `ready()`).

```js
const { DaemonClient } = require("./daemon.cjs");
const { resolveBin } = require("./bin.cjs");
const { hdlDump, genconnGenerateAll, genconnInject } = require("./cli.cjs");
const fs = require("node:fs/promises");
let daemon = null, lastOpts = null;
ipcMain.handle("dft:design:open", async (_e, opts) => {
  if (daemon) daemon.dispose();
  lastOpts = opts; daemon = new DaemonClient({ ...opts, engine: resolveBin("hdl") });
  return daemon.ready();
});
ipcMain.handle("dft:design:close", async () => { if (daemon) daemon.dispose(); daemon = null; });
ipcMain.handle("dft:design:query", async (_e, { method, params }) => {
  if (!daemon) throw new Error("no design open"); return daemon.query(method, params); });
ipcMain.handle("dft:design:dump", async () => {
  if (!lastOpts) throw new Error("no design open"); return hdlDump(lastOpts.filelist, lastOpts.top); });
ipcMain.handle("dft:design:readSource", async (_e, { file }) => fs.readFile(file, "utf8"));
ipcMain.handle("dft:design:pickFilelist", async () => { /* dialog as in HS main.cjs */ });
ipcMain.handle("dft:design:pickFolder", async () => { /* dialog as in HS main.cjs */ });
ipcMain.handle("dft:genconn:generateAll", async (_e, { docJson }) => genconnGenerateAll(docJson));
ipcMain.handle("dft:genconn:inject", async (_e, { docJson, vFiles }) => genconnInject(docJson, vFiles));
app.on("window-all-closed", () => { if (daemon) daemon.dispose(); app.quit(); });
```

- [ ] **Step 2:** Rewrite `electron/preload.cjs` to expose `window.dft` per C1 (each method → `ipcRenderer.invoke(channel, payload)`).

```js
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("dft", {
  design: {
    open: (opts) => ipcRenderer.invoke("dft:design:open", opts),
    close: () => ipcRenderer.invoke("dft:design:close"),
    query: (method, params) => ipcRenderer.invoke("dft:design:query", { method, params }),
    dump: () => ipcRenderer.invoke("dft:design:dump"),
    readSource: (file) => ipcRenderer.invoke("dft:design:readSource", { file }),
    pickFilelist: () => ipcRenderer.invoke("dft:design:pickFilelist"),
    pickFolder: () => ipcRenderer.invoke("dft:design:pickFolder"),
  },
  genconn: {
    generateAll: (docJson) => ipcRenderer.invoke("dft:genconn:generateAll", { docJson }),
    inject: (docJson, vFiles) => ipcRenderer.invoke("dft:genconn:inject", { docJson, vFiles }),
  },
});
```

- [ ] **Step 3:** Create `src/core-bridge/client.ts` = Hierarchyshower's `src/ui/client.ts` adapted to `window.dft.design` (rename `bridge()` to read `window.dft.design`, same method set: `open/expandChildren/getPorts/sourceLocation/traceFanin/traceFanout/traceDrivers/readSource`, plus `dump()`). Create `src/core-bridge/genconn.ts` wrapping `window.dft.genconn.*`. Create `src/core-bridge/dft.d.ts` with `declare global { interface Window { dft: DftBridge } }`.

- [ ] **Step 4: E2E `tests/e2e/bridge.spec.ts`** — open a real design through the UI path and assert `ready` (skip if binary absent):

```ts
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
test("window.dft.design.open returns ready", async () => {
  test.skip(!existsSync(process.cwd() + "/../dft-core/build/hdl"), "no hdl binary");
  const { app, page } = await launchApp({ ELECTRON_DEV: "" });
  const ready = await page.evaluate((fl) => (window as any).dft.design.open({ filelist: fl }),
    process.cwd() + "/tests/fixtures/soc.f"); // staged in Task 0.4
  expect(ready).toBeTruthy();
  await app.close();
});
```

- [ ] **Step 5: run** integration + e2e → PASS/skip. **Step 6: Commit** — `git commit -am "feat(bridge): window.dft IPC + daemon lifecycle + typed client"`

---

# Phase 3 — Hierarchy workspace (ports → center tab)

**Outcome:** 层次浏览 fully functional on the shared daemon: tree-only left, **ports shown in the center as a tab on click**, schematic + source + trace tabs. Visual + overlap + perf gates pass for a 17K-instance design.

### Task 3.1: Move Hierarchyshower UI into `src/hierarchy/`

- [ ] **Step 1:** Copy `Hierarchyshower/src/ui/*` and `Hierarchyshower/src/core/*` into `src/hierarchy/` (core under `src/hierarchy/core/`). Repoint imports: `../core/model.ts` → `../../core-bridge/model.ts`; `./client.ts` → `../../core-bridge/client.ts` (`hs` → `dftDesign`). Remove the old `App.tsx` top-level shell; rename its body into `src/hierarchy/Workspace.tsx` (no topbar/open-design — those moved to the shell). Tree selection writes to shared `useDesign.select()` AND local store.
- [ ] **Step 2: typecheck** — `npm run typecheck` → 0 errors. **Step 3: Commit** — `git commit -am "feat(hierarchy): import Hierarchyshower UI as workspace"`

### Task 3.2: Ports panel → center Tab (the requested change)

**Files:** Create `src/hierarchy/PortsTab.tsx` (from `DefinitionPanel.tsx`'s pin table); Modify `src/hierarchy/store.ts`, `src/hierarchy/TabArea.tsx`, `src/hierarchy/Workspace.tsx`; Test `tests/unit/hierarchy-tabs.test.ts`, `tests/e2e/hierarchy.spec.ts`

- [ ] **Step 1: failing unit test** — selecting an instance opens a `ports` tab in the center and makes it active:

```ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { useHierarchy } from "../../src/hierarchy/store.ts";
test("selecting an instance opens & activates a ports tab", () => {
  useHierarchy.getState().selectInstance({ nodeId: "x.u_lsu", defId: "ct_lsu_top" });
  const s = useHierarchy.getState();
  const tab = s.tabs.find(t => t.kind === "ports" && t.defId === "ct_lsu_top");
  assert.ok(tab, "ports tab created"); assert.equal(s.activeTabId, tab!.id);
});
```

- [ ] **Step 2: run** → FAIL. **Step 3:** In `src/hierarchy/store.ts` add a `ports` tab kind and `selectInstance(ref)` that (a) sets shared `useDesign.select(ref)`, (b) `openTab({ kind:"ports", defId, nodeId })` deduped, (c) sets it active. Move the pin-table render from `DefinitionPanel.tsx` into `PortsTab.tsx` (fetches via `dftDesign.getPorts`). `TabArea.tsx` routes `kind:"ports"` → `<PortsTab/>`. Remove the left-dock pin panel from `Workspace.tsx`; left column becomes tree-only (`#hier-tree`), center is the tab area (`#hier-center`).
- [ ] **Step 4: run** unit → PASS.
- [ ] **Step 5: E2E `tests/e2e/hierarchy.spec.ts`** (overlap + ports-in-center + perf + visual; skip without binary)

```ts
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { assertNoOverlap, assertNoOverflow } from "../helpers/layout.ts";
import { expectSmooth } from "../helpers/perf.ts";
import { existsSync } from "node:fs";
test("hierarchy: tree-only left, ports open in center, no 穿模/卡顿", async () => {
  test.skip(!existsSync(process.cwd()+"/../dft-core/build/hdl"), "no hdl binary");
  const { app, page } = await launchApp({ ELECTRON_DEV: "" });
  await page.evaluate(fl => (window as any).dft.design.open({ filelist: fl }),
    process.cwd()+"/tests/fixtures/soc.f");
  await page.locator('#hier-tree [data-node]').first().click();      // expand root (soc)
  await page.locator('#hier-tree [data-node]').nth(1).click();        // select a child instance (u_cpu)
  await expect(page.locator('#hier-center [data-tab-kind="ports"]')).toBeVisible(); // ports in center
  await assertNoOverlap(page, ["#hier-tree", "#hier-center"]);        // left vs center never overlap
  await assertNoOverflow(page, "#hier-center");
  await expectSmooth(page, async () => {                               // expanding nodes stays smooth
    for (let i = 0; i < 8; i++) await page.locator('#hier-tree [data-node]').nth(i).click();
  }, 50);
  await expect(page).toHaveScreenshot("hierarchy-dark.png");
  await app.close();
});
```

- [ ] **Step 6: run** → PASS. **Step 7: Commit** — `git commit -am "feat(hierarchy): ports table moves to a center tab + gates"`

### Task 3.3: Schematic perf hardening (anti-卡顿 for large nets)

**Files:** Modify `src/hierarchy/schematic/SchematicTab.tsx`

- [ ] **Step 1: failing perf E2E** — panning the schematic of a wide module holds ≥50fps:

```ts
test("schematic pan stays smooth", async () => {
  test.skip(!existsSync(process.cwd()+"/../dft-core/build/hdl"), "no hdl binary");
  const { app, page } = await launchApp({ ELECTRON_DEV: "" });
  /* open design, select a wide module, open 原理图 tab */
  await expectSmooth(page, async () => {
    const c = page.locator('#hier-center canvas');
    const b = (await c.boundingBox())!;
    for (let i=0;i<20;i++) await page.mouse.move(b.x+100+i*8, b.y+100, { steps: 1 });
  }, 50);
  await app.close();
});
```

- [ ] **Step 2:** Implement Konva perf settings in `SchematicTab.tsx`: `layer.listening(false)` on the static wire layer, `shape.perfectDrawEnabled(false)`, cache static groups, throttle pan with `requestAnimationFrame`, and cap initial render to visible bbox. **Step 3: run** → PASS. **Step 4: Commit** — `git commit -am "perf(schematic): konva layer caching + rAF pan (anti-卡顿)"`

---

# Phase 4 — GenConnection workspace (detailed inspector + generate via CLI)

**Outcome:** 连接生成 fully functional: canvas editor, **right Inspector showing selected instance + per-interface detail**, hierarchy panel fed by the shared daemon (not `/api/parse`), and Generate/Inject through the `genconn` CLI. Gates pass.

### Task 4.1: Move newProject UI into `src/genconn/`

- [ ] **Step 1:** Copy `newProject/src/ui/*` → `src/genconn/`, `newProject/src/core/*` → `src/genconn/core/`. Repoint imports. Drop the old top-level `App.tsx` shell into `src/genconn/Workspace.tsx` (no topbar). Keep Zustand + zundo local store as `src/genconn/store.ts`. **Step 2: typecheck** → 0 errors. **Step 3: Commit** — `git commit -am "feat(genconn): import newProject UI as workspace"`

### Task 4.2: Replace `/api/parse` with the shared daemon

**Files:** Modify `src/genconn/HierarchyPanel.tsx`; Delete reliance on `src/genconn/hierarchyApi.ts`; Test `tests/unit/genconn-hierarchy-source.test.ts`

- [ ] **Step 1:** Replace `uploadAndParse(...)` calls with `dftDesign.dump()` (returns the same `DesignHierarchy`, validated by the existing `parseHierarchy`). The “upload RTL” affordance becomes “use the open design” (the shell already opened it). Remove `hierarchyApi.ts` import. **Step 2:** Unit test that the panel’s data source function returns the shared hierarchy when a design is open (mock `window.dft.design.dump`). **Step 3: run** → PASS. **Step 4: Commit** — `git commit -am "feat(genconn): hierarchy panel reads shared daemon, drop /api/parse"`

### Task 4.3: Right Inspector — instance + interface detail (the requested change)

**Files:** Modify `src/genconn/Inspector.tsx`; Test `tests/unit/inspector-interfaces.test.ts`, `tests/e2e/genconn.spec.ts`

- [ ] **Step 1: failing unit test** — Inspector view-model lists each interface with the detail fields:

```ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { inspectorModel } from "../../src/genconn/Inspector.tsx";
import { chip } from "../fixtures/chip.doc.ts"; // staged in Task 0.4 (newProject example doc)
test("inspector lists per-interface detail for selected instance", () => {
  // pick any instance carrying >=2 interfaces (adapt accessor to src/genconn/core/model.ts)
  const inst = chip.defs.flatMap((d: any) => d.instances ?? [])
    .find((i: any) => (i.interfaces?.length ?? 0) >= 2);
  assert.ok(inst, "fixture has an instance with >=2 interfaces");
  const vm = inspectorModel(inst);
  assert.ok(vm.interfaces.length >= 2);
  assert.deepEqual(Object.keys(vm.interfaces[0]).sort(),
    ["busType","edge","offset","pairedWith","powerDomain","role","signals","status","width"].sort());
});
```

- [ ] **Step 2: run** → FAIL. **Step 3:** Add an exported pure `inspectorModel(instance)` that maps the selected `HardenInstance` to `{ identity:{instanceName,designName,designType,color,pos,size}, interfaces:[{busType,role,edge,offset,width,powerDomain,signals,status,pairedWith}] }`, and render it as the mockup’s cards (`docs/mockups/_src/02-genconn.html` `.ifcard`). `status` ∈ `paired|ported|unconnected`. **Step 4: run** → PASS.
- [ ] **Step 5: E2E `tests/e2e/genconn.spec.ts`** (inspector visible, no overlap of canvas/inspector/left, drag smooth, visual both themes):

```ts
test("genconn: inspector shows interfaces, canvas drag smooth, no 穿模", async () => {
  const { app, page } = await launchApp();
  await page.click('[data-tab="genconn"]');
  /* load example doc (Toolbar 载入例子) so canvas has hardens */
  await page.click('[data-action="load-example"]');
  await page.locator('#gc-canvas [data-harden]').first().click();
  await expect(page.locator('#gc-inspector .ifcard').first()).toBeVisible();
  await assertNoOverlap(page, ["#gc-left", "#gc-canvas", "#gc-inspector"]);
  await assertNoOverflow(page, "#gc-inspector");
  await expectSmooth(page, async () => {
    const h = page.locator('#gc-canvas [data-harden]').first();
    const b = (await h.boundingBox())!;
    await page.mouse.move(b.x+20,b.y+10); await page.mouse.down();
    for (let i=0;i<20;i++) await page.mouse.move(b.x+20+i*6, b.y+10+i*3, {steps:1});
    await page.mouse.up();
  }, 50);
  await expect(page).toHaveScreenshot("genconn-dark.png");
  await page.click("#theme-toggle");
  await expect(page).toHaveScreenshot("genconn-light.png");
  await app.close();
});
```

- [ ] **Step 6: run** → PASS. **Step 7: Commit** — `git commit -am "feat(genconn): detailed instance/interface inspector + gates"`

### Task 4.4: Generate / Inject via genconn CLI

**Files:** Modify `src/genconn/GeneratePanel.tsx`; Test `tests/integration/genconn-generate.test.ts`

- [ ] **Step 1: failing integration test** — generating from the example doc yields the same output as the golden file (`newProject/top.top_level_ports_and_connectionss`), via the CLI:

```ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolveBin } from "../../electron/bin.cjs";
import { genconnGenerateAll } from "../../electron/cli.cjs";
test("genconn generate-all matches golden", { skip: !existsSync(resolveBin("genconn")) }, async () => {
  const doc = readFileSync("tests/fixtures/chip.genconn.json", "utf8"); // staged in Task 0.4
  const r = await genconnGenerateAll(doc);
  const top = r.files.find(f => f.name.includes("top_level_ports_and_connectionss"))!;
  assert.equal(top.text.trim(), readFileSync("tests/fixtures/top.golden", "utf8").trim());
});
```

- [ ] **Step 2:** Point `GeneratePanel`’s generate/inject buttons at `dftGenconn.generateAll(JSON.stringify(doc))` / `dftGenconn.inject(...)` instead of the renderer TS core. Render returned `files` + `unconnected` as the mockup’s Generate panel. **Step 3: run** → PASS/skip. **Step 4: Commit** — `git commit -am "feat(genconn): generate/inject through dft-core genconn CLI"`

---

# Phase 5 — Cross-workspace live link (“加入连接生成”)

**Outcome:** Right-clicking a node in 层次浏览 → “加入连接生成” inserts the block into the genconn canvas **in-process** (no `*.blocks.json` file) and switches to that workspace.

**Files:** Modify `src/hierarchy/ContextMenu.tsx`, `src/genconn/store.ts`; Test `tests/e2e/live-link.spec.ts`

- [ ] **Step 1: failing E2E** — context-menu action adds a harden and activates genconn:

```ts
test("加入连接生成 inserts block in-process and switches workspace", async () => {
  test.skip(!existsSync(process.cwd()+"/../dft-core/build/hdl"), "no hdl binary");
  const { app, page } = await launchApp({ ELECTRON_DEV: "" });
  /* open design, right-click a node */
  await page.locator('#hier-tree [data-node]').first().click({ button: "right" });
  await page.click('[data-menu="add-to-genconn"]');
  await expect(page.locator("#ws-genconn")).toBeVisible();
  await expect(page.locator('#gc-canvas [data-harden]')).toHaveCount(1);
  await app.close();
});
```

- [ ] **Step 2:** Implement: `ContextMenu` “加入连接生成” calls a shared action `addBlockFromHierarchy(payload)` on `src/genconn/store.ts` (reuse newProject’s existing `addBlocksFromHierarchy`/`importBlocks.ts` logic, but fed the in-memory `BlockPayload` instead of a parsed file), then `useDesign.setWorkspace("genconn")`. **Step 3: run** → PASS. **Step 4: Commit** — `git commit -am "feat(link): in-process 加入连接生成 hierarchy→genconn"`

---

# Phase 6 — Packaging (Linux AppImage with bundled binaries)

**Outcome:** `npm run build:desktop` produces a runnable AppImage embedding `hdl`+`genconn`; a launch smoke test passes against the bundled binaries.

**Files:** Create `electron-builder.yml`; Create `scripts/stage-bin.sh`

- [ ] **Step 1: `electron-builder.yml`** (from newProject’s, + extraResources)

```yaml
appId: top.jiangbowang.dftsuite
productName: dft-suite
directories: { output: release, buildResources: build }
files: [ "dist/**/*", "electron/**/*", "package.json" ]
extraResources:
  - { from: "resources/bin", to: "bin" }
linux: { target: [AppImage], category: Development, artifactName: "${productName}-${version}-${arch}.${ext}" }
```

- [ ] **Step 2: `scripts/stage-bin.sh`** — copy freshly-built Linux dft-core binaries into `resources/bin/` before packaging:

```bash
#!/usr/bin/env bash
set -euo pipefail
SRC="${DFT_CORE_BUILD:-../dft-core/build}"
mkdir -p resources/bin
for b in hdl genconn; do cp "$SRC/$b" "resources/bin/$b"; chmod +x "resources/bin/$b"; done
echo "staged: $(ls resources/bin)"
```
Add `resources/bin/` to `.gitignore`. Document in the plan header: **dft-core must be compiled on Linux x64** (slang vendored) before `stage-bin.sh`; cross-compiling from macOS is out of scope (spec §8).

- [ ] **Step 3:** Update `build:desktop` script → `bash scripts/stage-bin.sh && npm run build && electron-builder --linux AppImage --x64`.
- [ ] **Step 4: smoke test** (on Linux/CI): run the AppImage headless with `DFT_CORE_BIN_DIR` unset so it uses bundled `process.resourcesPath/bin`; assert window opens and `window.dft.design.open` on a fixture returns ready. (Reuse `tests/e2e/bridge.spec.ts` pointed at the packaged app.)
- [ ] **Step 5: Commit** — `git commit -am "build(desktop): electron-builder AppImage + bundle dft-core binaries"`

---

# Phase 7 — CI gate

**Files:** Create `.github/workflows/ci.yml` (or local `scripts/ci.sh` if no GitHub)

- [ ] **Step 1:** CI runs, in order: `npm ci` → `npm run typecheck` → `npm run test:unit` → `npx playwright install --with-deps chromium` → `npm run test:e2e`. The e2e job builds dft-core (or pulls a prebuilt Linux binary) so the integration/visual/perf gates run for real. Visual snapshots are committed; CI fails on diff > 1% (catches 穿模/theme regressions). Perf gates fail under 50fps (catches 卡顿).
- [ ] **Step 2: Commit** — `git commit -am "ci: typecheck + unit + e2e (overlap/perf/visual) gates"`

---

# Future (explicitly out of this plan; tracked in spec §1, §4.3)

- **N-API addon**: replace `spawn hdl daemon + shell genconn` with an in-process `.node` addon linking `libhdlcore`/`libgenconncore`. Swap `electron/daemon.cjs` + `electron/cli.cjs` implementations behind the same `window.dft` contract — zero UI change.
- **DRC workspace**: third tab fronting `drc check` (`dft.drc.check`), violation table → jump-to-hierarchy. Add `drc` to `stage-bin.sh`.

---

## Self-Review checklist (run before execution)

- [ ] Every spec §4–§11 requirement maps to a task (two workspaces ✓ P1/P3/P4; ports-in-center ✓ T3.2; dark/light ✓ T1.2; instance/interface inspector ✓ T4.3; genconn via CLI ✓ T4.4; in-process link ✓ P5; AppImage+binaries ✓ P6; anti-穿模/卡顿 ✓ P0 gates re-run in P3/P4).
- [ ] No placeholders: each code step shows real code; migration steps name exact source files.
- [ ] Type consistency: `window.dft` (C1), `useDesign` (C3), `resolveBin` (C2), CLI return shapes used identically across P2/P4/P6.
- [ ] Fixtures: confirm real dft-core fixtures (`../dft-core/test/...`) before writing integration tests; otherwise add tiny `tests/fixtures/two_ff.{f,v}` and a `chip.genconn.json`/`top.golden` copied from `newProject` test data.
