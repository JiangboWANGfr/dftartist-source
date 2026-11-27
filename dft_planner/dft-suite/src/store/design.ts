import { create } from "zustand";
import { dftDesign as hs } from "../core-bridge/client.ts";
import { DFX_IP_DIR_KEY } from "../hierarchy/core/dfxIpLib.ts";
import { MEMBIST_DIR_KEY } from "../hierarchy/core/membist.ts";
import { parseDfxIpFiles, parseMembistDir, prjPathOf } from "../hierarchy/core/dftCfg.ts";
import type { OpenOpts, ReadyResult } from "../core-bridge/model.ts";
import "../core-bridge/dft.d.ts";

type Workspace = "hierarchy" | "genconn" | "specgen" | "scanplan" | "clocktree" | "drc" | "sdc" | "dfxip" | "memory" | "dftcfg";
type Theme = "dark" | "light";

interface DesignState {
  status: "idle" | "opening" | "ready" | "error";
  error: string | null;
  ready: ReadyResult | null;
  filelist: string | null;
  top: string | null;
  selected: { nodeId: string; defId: string } | null;
  workspace: Workspace;
  theme: Theme;
  openDesign(opts: OpenOpts): Promise<void>;
  closeDesign(): Promise<void>;
  select(ref: { nodeId: string; defId: string } | null): void;
  setWorkspace(w: Workspace): void;
  setTheme(t: Theme): void;
}

export const useDesign = create<DesignState>((set) => ({
  status: "idle",
  error: null,
  ready: null,
  filelist: null,
  top: null,
  selected: null,
  workspace: "hierarchy",
  theme: "dark",

  async openDesign(opts) {
    set({ status: "opening", error: null });
    try {
      const ready = await window.dft.design.open(opts);
      // RESTORE THE SAVED PLAN BEFORE THE WORKSPACES RENDER. The order used to be reversed —
      // status flipped to "ready", the DRC/Clock pages mounted and ran their FIRST analysis
      // against a session whose plan had not been replayed yet, cached "everything unfixed",
      // and the app opened showing red — while the schematic overlay (which polls the plan
      // live) drew the recorded muxes and virtual IPs beside it. Two views, one of them
      // answering a question asked too early. Replay first; render second.
      try {
        const lo = await (window as any).dft?.app?.launchOptions?.();
        if (lo?.specLogicTestDir) {
          const dir = lo.specLogicTestDir as string;
          // RESTORE the saved plan FIRST (OCC points + IPs/muxes/constraints from earlier
          // sessions), THEN arm the auto-write — the other order would overwrite the saved
          // files with this fresh session's empty state. Through the client wrapper, so the
          // replayed plan registers as the session's planRev BASELINE.
          for (const f of ["dfx_occ_def_point.tcl", "dfx_dft_plan.tcl"]) {
            try { await hs.dpShell("", `${dir}/${f}`); }
            catch { /* no saved file yet — nothing to restore */ }
          }
          await hs.dpShell(`set_occ_out_dir {${dir}}`);
        }
      } catch { /* standalone/dev run without launch args: auto-write stays off */ }
      // RECOGNIZE LIBRARIES FROM THE HARDEN'S dft_cfg YAMLs (the flow's own config is the
      // authority — no manual re-entering of paths the YAML already states):
      //   dft_lib_setting.yaml  membistlib → the memory library dir (memory-map warms it)
      //   dft_user_ins_setting.yaml  dfx_ip read_verilog → the DFX IP files (read_dfx_ip)
      // Recognized values are also written to localStorage so the Memory / DFX IP tabs show
      // where they came from; manual picks in those tabs still work and simply take over.
      try {
        const lo = await (window as any).dft?.app?.launchOptions?.();
        if (lo?.dftCfgDir) {
          const p = (window as any).dft.project;
          try {
            const mdir = parseMembistDir(await p.read(`${lo.dftCfgDir}/dft_lib_setting.yaml`));
            if (mdir) localStorage.setItem(MEMBIST_DIR_KEY, mdir);
          } catch { /* no dft_lib_setting.yaml — nothing recognized */ }
          try {
            if (lo.projectDir) {
              const files = parseDfxIpFiles(
                await p.read(`${lo.dftCfgDir}/dft_user_ins_setting.yaml`), prjPathOf(lo.projectDir));
              for (const f of files) {
                try { await hs.dpShell(`read_dfx_ip {${f}}`); }
                catch { /* one bad file must not block the rest */ }
              }
            }
          } catch { /* no dft_user_ins_setting.yaml */ }
        }
      } catch { /* standalone run — the tabs' manual pickers still work */ }
      // AUTO-LOAD THE DFX IP LIBRARY. The plan replay covers sessions that once ran
      // read_dfx_ip; a first session has only the directory the user picked on the DFX IP
      // page. Issue it here so planned-IP pins evaluate from the real circuit from the very
      // first analysis — the daemon is idempotent for a repeated path, so replay + this is
      // one compile, not two.
      try {
        const dir = localStorage.getItem(DFX_IP_DIR_KEY);
        if (dir) await hs.dpShell(`read_dfx_ip {${dir}}`);
      } catch { /* library dir gone or not compilable — the DFX IP page reports details */ }
      // WARM THE MEMORY LIBRARY. get-ports orients a blackbox SRAM's pins from the library's
      // Verilog model / .tcd_memory template, but only once a memory-map has run — issue it
      // here from the remembered Memory-tab dir so SRAM boxes carry their real pins from the
      // FIRST schematic, not only after the user visits the Memory workspace.
      try {
        const mdir = localStorage.getItem(MEMBIST_DIR_KEY);
        if (mdir) await hs.memoryMap(mdir);
      } catch { /* dir gone or unreadable — the Memory tab reports details */ }
      set({ status: "ready", ready, filelist: opts.filelist, top: opts.top ?? null });
    } catch (e) {
      set({ status: "error", error: String((e as Error).message ?? e) });
    }
  },

  async closeDesign() {
    try {
      await window.dft?.design.close();
    } finally {
      set({ status: "idle", ready: null, filelist: null, selected: null });
    }
  },

  select(ref) {
    set({ selected: ref });
  },

  setWorkspace(w) {
    set({ workspace: w });
  },

  setTheme(t) {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("light", t === "light");
      localStorage.setItem("dft-suite.theme", t);
    }
    set({ theme: t });
  },
}));
