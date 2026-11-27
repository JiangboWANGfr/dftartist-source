import { useDesign } from "../store/design.ts";
import { useStore as useGenconnStore } from "../genconn/store.ts";
import { TopBar } from "./TopBar.tsx";
import { StatusBar } from "./StatusBar.tsx";
import { HierarchyWorkspace } from "../hierarchy/Workspace.tsx";
import { ErrorBoundary } from "../hierarchy/ErrorBoundary.tsx";
import { GenconnWorkspace } from "../genconn/Workspace.tsx";
import { SpecgenWorkspace } from "../specgen/Workspace.tsx";
import { DfxDialog } from "../genconn/dfx/DfxDialog.tsx";
import { WelcomePage } from "./WelcomePage.tsx";
import { ClockResetTab } from "../hierarchy/ClockResetTab.tsx";
import { DpShellPanel } from "../hierarchy/DpShellPanel.tsx";
import { DrcTab } from "../hierarchy/DrcTab.tsx";
import { SdcTab } from "../hierarchy/SdcTab.tsx";
import { DfxIpTab } from "../hierarchy/DfxIpTab.tsx";
import { MbistTab } from "../hierarchy/MbistTab.tsx";
import { DftCfgTab } from "../hierarchy/DftCfgTab.tsx";
import { ScanPlannerTab } from "../hierarchy/ScanPlannerTab.tsx";
import { useStore as useHierStore } from "../hierarchy/store.ts";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

const WS_STYLE = { flex: 1, minWidth: 0, minHeight: 0, display: "flex" } as const;

/** An analysis page over the dp_shell console, with a DRAGGABLE divider between them.
 *
 *  The console's height is the user's: 180px is right for glancing at a DRC summary and useless
 *  for reading a `report_commands -verbose`, and every workspace that docks it had the number
 *  hard-coded separately. One component, one remembered height, every page. */
function WithDpShell({ children }: { children: ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number>(() => {
    const v = Number(localStorage.getItem("dpsh:h"));
    return Number.isFinite(v) && v >= 80 ? Math.min(v, 900) : 180;
  });
  // The console may never take the whole column. It used to be able to: the page above it then
  // measured 0px tall, and a canvas page (schematic, clock tree) handed Konva a 0x0 layer, which
  // throws and blanks the workspace. Cap at 70% of whatever room there actually is, live —
  // resizing the window shrinks the console rather than crushing the page.
  const [maxH, setMaxH] = useState(900);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setMaxH(Math.max(120, Math.round(el.clientHeight * 0.7)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const shown = Math.min(h, maxH);
  const drag = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startY = e.clientY, startH = shown;
    let cur = startH;
    const move = (ev: MouseEvent) => {
      // Dragging UP grows the console: it is anchored to the bottom of the window.
      cur = Math.max(80, Math.min(maxH, startH + (startY - ev.clientY)));
      setH(cur);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      localStorage.setItem("dpsh:h", String(cur));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return (
    <div ref={boxRef}
         style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
      <div className="dpsh-resizer" onMouseDown={drag} title="Drag to resize the console" />
      <div style={{ height: shown, flex: "0 0 auto", minHeight: 80, display: "flex" }}>
        <DpShellPanel />
      </div>
    </div>
  );
}

function WorkspaceBody({ ws }: { ws: "hierarchy" | "genconn" | "specgen" | "scanplan" | "clocktree" | "drc" | "sdc" | "dfxip" | "memory" | "dftcfg" }) {
  switch (ws) {
    // Everything design-level about scan lives here: chain families, wrapper cells, and which
    // controller carries which part of the design. The EDT nodes on the SpecGen canvas read
    // from it and never write back.
    // id="ws-hierarchy" like every other analysis workspace: the report/table styles
    // (.regcount, .rc-*) are scoped to that id, and a different one leaves the page unstyled.
    case "scanplan":
      return <div id="ws-hierarchy" style={WS_STYLE}><ErrorBoundary><ScanPlannerWorkspace /></ErrorBoundary></div>;
    case "hierarchy":
      return <div id="ws-hierarchy" style={WS_STYLE}><ErrorBoundary><HierarchyWorkspace /></ErrorBoundary></div>;
    // These two were the ONLY workspaces without a boundary, and they are the two that black-
    // screened: an exception here had nothing to catch it, so React unmounted the whole tree and
    // left a blank window with no message — undebuggable from the outside and indistinguishable
    // from a hang. Everywhere else the same exception shows its message and a Reload button.
    case "genconn":
      return <div id="ws-genconn" style={WS_STYLE}><ErrorBoundary><GenconnWorkspace /></ErrorBoundary></div>;
    case "specgen":
      return <div id="ws-specgen" style={WS_STYLE}><ErrorBoundary><SpecgenWorkspace /></ErrorBoundary></div>;
    // Clock Tree and DRC are the same analysis with different defaults (see ClockResetTab):
    // Clock Tree browses structure for OCC planning; DRC opens straight on reset violations.
    // Both dock the dp_shell console underneath, so a point can be recorded on the spot.
    case "clocktree":
      return <div id="ws-hierarchy" style={WS_STYLE}><ErrorBoundary><CrWorkspace mode="clock" /></ErrorBoundary></div>;
    case "drc":
      return <div id="ws-hierarchy" style={WS_STYLE}><ErrorBoundary><DrcWorkspace /></ErrorBoundary></div>;
    // SDC checking comes BEFORE the DRC in a real flow — a constraint file the tool silently
    // mis-read makes every downstream clock/reset result wrong — so it gets its own workspace
    // rather than hiding inside the DRC's SDC field.
    case "sdc":
      return <div id="ws-hierarchy" style={WS_STYLE}><ErrorBoundary><SdcWorkspace /></ErrorBoundary></div>;
    case "dfxip":
      return <div id="ws-hierarchy" style={WS_STYLE}><ErrorBoundary><DfxIpWorkspace /></ErrorBoundary></div>;
    // MemoryBIST planning: which memories the design contains (membistlib templates x design
    // blackboxes), the controller partition their DEF placement implies, and the SRAM repair
    // advisory — the three questions are one plan, so they are one page.
    case "memory":
      return <div id="ws-hierarchy" style={WS_STYLE}><ErrorBoundary><MbistTab /></ErrorBoundary></div>;
    // The harden's dft_cfg YAMLs: edit-in-place + library recognition (membistlib / dfx_ip).
    case "dftcfg":
      return <div id="ws-hierarchy" style={WS_STYLE}><ErrorBoundary><DftCfgTab /></ErrorBoundary></div>;
  }
}

/** Clock/Reset analysis over a dp_shell console (the console is where OCC / ctrl-mux points
 *  are recorded, so it belongs on the same screen as the structure it annotates). */
function CrWorkspace({ mode }: { mode: "clock" | "drc" }) {
  return (
    <WithDpShell><ClockResetTab mode={mode} /></WithDpShell>
  );
}

export function App() {
  const ws = useDesign(s => s.workspace);
  const status = useDesign(s => s.status);
  // DFX 配置弹窗全局挂一次（overlay, position:fixed）：两个工作区都能显示（M3/T4 跨工作区）。
  const dfxDialog = useGenconnStore(s => s.dfxDialog);
  return (
    <div id="app-root" className="app">
      <TopBar />
      <div className="body" id="ws-body">
        {status === "idle" ? <WelcomePage /> : <WorkspaceBody ws={ws} />}
      </div>
      <StatusBar />
      {dfxDialog && <DfxDialog req={dfxDialog} onClose={() => useGenconnStore.getState().closeDfxDialog()} />}
    </div>
  );
}

/** Scan Planner over a dp_shell console — the same pairing every analysis workspace uses, so a
 *  decision can be recorded next to the structure it is about. Register counts are the page's
 *  raw material, so they are pulled once on entry rather than behind a button. */
function ScanPlannerWorkspace() {
  const counts = useHierStore((s) => s.regCounts);
  useEffect(() => {
    if (!counts) void useHierStore.getState().openRegCountTab();
  }, [counts]);
  return (
    <WithDpShell><ScanPlannerTab /></WithDpShell>
  );
}

/** DFX IP planner (library scan / planned instantiations / control circuits) over a
 *  dp_shell console — the recording commands echo there like everywhere else. */
function DfxIpWorkspace() {
  return (
    <WithDpShell><DfxIpTab /></WithDpShell>
  );
}

/** SDC checker over a dp_shell console — the console is where the file gets read into the
 *  session afterwards, so "check it, then read it" is one screen. */
function SdcWorkspace() {
  return (
    <WithDpShell><SdcTab /></WithDpShell>
  );
}

/** DRC workbench (rules table + per-violation schematic) over a dp_shell console. */
function DrcWorkspace() {
  return (
    <WithDpShell><DrcTab /></WithDpShell>
  );
}
