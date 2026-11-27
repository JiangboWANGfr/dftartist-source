import { create } from "zustand";
import { parseProject, serializeProject, type DftProject } from "./projectFile.ts";
import { useDesign } from "./design.ts";
import type { OutFile } from "./outputLayout.ts";
import { notify } from "../common/notify.ts";

interface ProjState {
  path: string | null;
  project: DftProject | null;
  recent: string[];
  loadRecent(): Promise<void>;
  newProject(): Promise<void>;
  openProject(): Promise<void>;
  openRecent(path: string): Promise<void>;
  closeProject(): void;
  /** 启动参数指定了工程目录但尚无 filelist——下次 load filelist 自动在此建工程。 */
  pendingLaunchDir: string | null;
  /** 启动参数(--projectpath/--harden/--filelist)分派；非 Electron/无参数 no-op。 */
  initFromLaunch(): Promise<void>;
  /** load 一个 filelist 的统一入口：pendingLaunchDir 模式自动建工程，否则仅打开设计。 */
  openFilelist(filelist: string): Promise<void>;
  /** 把 genconn 文档文本写回当前工程的 genconnDoc(若未设则据 filelist 生成路径并写回 .dftproj)。
   *  无工程或非 Electron → 返回 false(调用方走既有 localStorage/浏览器保存兜底)。 */
  saveGenconn(text: string): Promise<boolean>;
  /** Scan Planner document (chain families + EDT coverage + EDT defaults). */
  loadScanPlan(): Promise<string | null>;
  saveScanPlan(text: string): Promise<boolean>;
}

async function activate(path: string, project: DftProject): Promise<void> {
  const p = (window as any).dft?.project;
  // 先开设计(其 filelist 变化会触发 genconn 的 design-switch 复位),再 setState 工程——
  // 让工程绑定的 genconnDoc 载入成为最后一次写入,避免被复位清空(C1 竞态)。
  await useDesign.getState().openDesign({ filelist: project.filelist, top: project.top || undefined });
  // The hierarchy store SUBSCRIBES to this (see its scan-plan hydration) rather than being
  // called from here: importing it back would close a module cycle, and a cycle through a
  // zustand `create<T>` silently degrades every selector's inferred type to `any`.
  useProject.setState({ path, project, pendingLaunchDir: null });
  if (p?.addRecent) useProject.setState({ recent: await p.addRecent(path) });
}

/** 在 dir 下按 filelist 创建 .dftproj 并激活工程(无对话框；spec 2026-07-21 §4)。 */
async function createProjectAt(dir: string, filelist: string): Promise<void> {
  const p = (window as any).dft?.project;
  if (!p?.write) return;
  const design = (filelist.split("/").pop() ?? "chip").replace(/\.[^.]+$/, "");
  const proj: DftProject = { version: 1, filelist, top: "", outputDir: dir, genconnDoc: `Arch/${design}.arch`, specgenWorkspace: null, padCfg: null, scanPlan: null };
  const projPath = `${dir.replace(/\/$/, "")}/${design}.planner.dftproj`;
  await p.write(projPath, serializeProject(proj));
  await activate(projPath, proj);
}

export const useProject = create<ProjState>((set) => ({
  path: null, project: null, recent: [], pendingLaunchDir: null,
  loadRecent: async () => {
    const p = (window as any).dft?.project;
    if (p?.recent) set({ recent: await p.recent() });
  },
  newProject: async () => {
    const st = useProject.getState();
    if (st.pendingLaunchDir) {
      // 启动参数模式：只选 filelist，目录用 <projectpath>/<harden>，不弹目录对话框。
      const fl = await (window as any).dft?.design?.pickFilelist?.();
      if (!fl) return;
      try {
        await createProjectAt(st.pendingLaunchDir, fl);
      } catch (e) {
        notify(`Failed to create project: ${String((e as Error)?.message ?? e)}`);
      }
      return;
    }
    const p = (window as any).dft?.project;
    if (!p?.pickNew) return;
    const pick = await p.pickNew();
    if (!pick) return;
    await createProjectAt(pick.outputDir, pick.filelist);
  },
  openProject: async () => {
    const p = (window as any).dft?.project;
    if (!p?.pickOpen) return;
    const path = await p.pickOpen();
    if (!path) return;
    try {
      const proj = parseProject(await p.read(path));
      await activate(path, proj);
    } catch (e) {
      notify(`Failed to open project: ${String((e as Error)?.message ?? e)}`);
    }
  },
  openRecent: async (path) => {
    const p = (window as any).dft?.project;
    if (!p?.read) return;
    try {
      const proj = parseProject(await p.read(path));
      await activate(path, proj);
    } catch (e) {
      notify(`Failed to open project: ${String((e as Error)?.message ?? e)}`);
    }
  },
  closeProject: () => set({ path: null, project: null }),
  initFromLaunch: async () => {
    const lo = await (window as any).dft?.app?.launchOptions?.();
    if (!lo) return;
    if (lo.warning) notify(lo.warning);
    try {
      if (lo.existingProj) {
        // 已有工程：打开；CLI filelist 不一致 → 命令行优先，覆盖写回(top 清空，旧值对新 filelist 不可信)。
        const p = (window as any).dft.project;
        let proj = parseProject(await p.read(lo.existingProj));
        if (lo.filelist && lo.filelist !== proj.filelist) {
          proj = { ...proj, filelist: lo.filelist, top: "" };
          await p.write(lo.existingProj, serializeProject(proj));
        }
        await activate(lo.existingProj, proj);
      } else if (lo.projectDir && lo.filelist) {
        await createProjectAt(lo.projectDir, lo.filelist);
      } else if (lo.projectDir) {
        set({ pendingLaunchDir: lo.projectDir });
      } else if (lo.filelist) {
        await useDesign.getState().openDesign({ filelist: lo.filelist });
      }
    } catch (e) {
      notify(`Failed to process launch args: ${String((e as Error)?.message ?? e)}`);
      if (lo.projectDir) set({ pendingLaunchDir: lo.projectDir });
    }
  },
  openFilelist: async (filelist) => {
    const st = useProject.getState();
    if (st.pendingLaunchDir) {
      try {
        await createProjectAt(st.pendingLaunchDir, filelist);
      } catch (e) {
        notify(`Failed to create project: ${String((e as Error)?.message ?? e)}`);
      }
    } else {
      await useDesign.getState().openDesign({ filelist });
    }
  },
  /** Read the project's Scan Planner document, or null when it has none / cannot be read.
   *  A missing or unreadable plan must not stop the project from opening. */
  // The return type is annotated ON PURPOSE. `p.read()` is `any` (untyped preload bridge), and
  // an inferred return that flows out of a function referencing `useProject` makes the whole
  // store's type circular — TypeScript then quietly types EVERY selector in the app as `any`.
  loadScanPlan: async (): Promise<string | null> => {
    const st = useProject.getState();
    const p = (window as any).dft?.project;
    if (!st.path || !st.project?.scanPlan || !p?.read) return null;
    const dir = st.path.replace(/[^/]+$/, "");
    const rel: string = st.project.scanPlan;
    try {
      return (await p.read(rel.startsWith("/") ? rel : dir + rel)) as string;
    } catch {
      return null;
    }
  },
  saveScanPlan: async (text: string): Promise<boolean> => {
    const st = useProject.getState();
    const p = (window as any).dft?.project;
    if (!st.path || !st.project || !p?.write) return false;
    const dir = st.path.replace(/[^/]+$/, "");
    let rel = st.project.scanPlan;
    if (!rel) {
      const base = (st.project.filelist.split("/").pop() ?? "chip").replace(/\.[^.]+$/, "");
      rel = `Spec/scan/${base}.scanplan.json`;
      const updated = { ...st.project, scanPlan: rel };
      await p.write(st.path, serializeProject(updated));
      set({ project: updated });
    }
    await p.write(rel.startsWith("/") ? rel : dir + rel, text);
    return true;
  },
  saveGenconn: async (text) => {
    const st = useProject.getState();
    const p = (window as any).dft?.project;
    if (!st.path || !st.project || !p?.write) return false;
    const dir = st.path.replace(/[^/]+$/, "");
    let rel = st.project.genconnDoc;
    if (!rel) {
      const base = (st.project.filelist.split("/").pop() ?? "chip").replace(/\.[^.]+$/, "");
      rel = `Arch/${base}.arch`;
      const updated = { ...st.project, genconnDoc: rel };
      await p.write(st.path, serializeProject(updated));
      set({ project: updated });
    }
    const abs = rel.startsWith("/") ? rel : dir + rel;
    await p.write(abs, text);
    return true;
  },
}));

/** 把结构化产物写进当前工程目录(= .dftproj 所在目录 = 树根)。无工程/空则提示。 */
export async function writeToProject(files: OutFile[]): Promise<void> {
  const st = useProject.getState();
  const p = (window as any).dft?.project;
  if (!st.path || !p?.writeFiles) { notify("Create or open a project first"); return; }
  if (files.length === 0) { notify("Nothing to write"); return; }
  const baseDir = st.path.replace(/[^/]+$/, "");
  try {
    const written: string[] = await p.writeFiles(baseDir, files);
    notify(`Wrote ${written.length} file(s) to ${baseDir}`);
  } catch (e) {
    notify(`Write failed: ${String((e as Error)?.message ?? e)}`);
  }
}

/** Like writeToProject, but to an explicit absolute directory instead of the .dftproj's own
 *  folder — for output that belongs in the harden's own tree (e.g. dft_studio_db/<harden>/
 *  spec/logic_test, where OCC's dfx_occ_def_point.tcl already lands via set_occ_out_dir) rather
 *  than wherever the project file happens to have been created/opened from. */
export async function writeToDir(baseDir: string, files: OutFile[]): Promise<void> {
  const p = (window as any).dft?.project;
  if (!baseDir || !p?.writeFiles) { notify("No output directory available"); return; }
  if (files.length === 0) { notify("Nothing to write"); return; }
  try {
    const written: string[] = await p.writeFiles(baseDir, files);
    notify(`Wrote ${written.length} file(s) to ${baseDir}`);
  } catch (e) {
    notify(`Write failed: ${String((e as Error)?.message ?? e)}`);
  }
}
