// GenConnection workspace — Toolbar + LeftCol (Library + HierarchyPanel) + Canvas + Inspector + GeneratePanel.
// Mounted inside #ws-genconn in the dft-suite shell.
// Keyboard shortcuts and localStorage auto-save are handled here (from the original App.tsx).
// Backend wiring (/api/parse, generate-push, inspector detail) comes in Tasks 4.2–4.4.

import { useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { useStore } from "./store.ts";
import { Toolbar } from "./Toolbar.tsx";
import { CanvasView } from "./CanvasView.tsx";
import { GeneratePanel } from "./GeneratePanel.tsx";
import { LibraryPanel } from "./LibraryPanel.tsx";
import { HierarchyPanel } from "./HierarchyPanel.tsx";
import { Inspector } from "./Inspector.tsx";
import { lsSave } from "./persist.ts";
import { saveGenconnDoc } from "./save.ts";
import "./styles.css";

// Panel-size localStorage helpers (drag-resize memory).
const lsNum = (k: string, d: number): number => {
  try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && v > 0 ? v : d; } catch { return d; }
};
const lsSetNum = (k: string, v: number): void => { try { localStorage.setItem(k, String(Math.round(v))); } catch { /* ignore */ } };
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function GenconnWorkspace() {
  const doc = useStore((s) => s.doc);
  const genOpen = useStore((s) => s.genOpen);
  const [leftW, setLeftW] = useState(() => lsNum("genconn:leftW", 220));
  const [rightW, setRightW] = useState(() => lsNum("genconn:rightW", 300));
  const [genH, setGenH] = useState(() => lsNum("genconn:genH", 240));

  const dragRight = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = rightW;
    let w = startW;
    // max leaves >=240px for the canvas (220 left col + 6 resizer + 240 canvas) and caps at 720.
    const move = (ev: MouseEvent) => { w = clamp(startW + (startX - ev.clientX), 220, Math.min(720, Math.max(280, window.innerWidth - 466))); setRightW(w); };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); lsSetNum("genconn:rightW", w); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const dragLeft = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = leftW;
    let w = startW;
    // left col is left-anchored: drag the divider right → wider. Leave room for canvas + right panel.
    const move = (ev: MouseEvent) => { w = clamp(startW + (ev.clientX - startX), 160, Math.min(420, Math.max(200, window.innerWidth - 466))); setLeftW(w); };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); lsSetNum("genconn:leftW", w); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const dragGen = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startY = e.clientY, startH = genH;
    let h = startH;
    const move = (ev: MouseEvent) => { h = clamp(startH + (startY - ev.clientY), 120, window.innerHeight * 0.7); setGenH(h); };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); lsSetNum("genconn:genH", h); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  // Auto-save to localStorage on doc change (debounced 400 ms).
  useEffect(() => {
    const t = setTimeout(() => lsSave(useStore.getState().toText()), 400);
    return () => clearTimeout(t);
  }, [doc]);

  // Keyboard shortcuts: undo/redo, save, select-all, delete, arrows, rotate, mirror, copy/paste.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 画线态：键盘由 CanvasView 的画线 handler 独占（Backspace/⌘Z=退拐点、Esc=取消整条），
      // 本全局 handler 必须让路——否则同一按键会并发触发删除选中实例/全局 undo。
      if (useStore.getState().wire) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select";
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useStore.temporal.getState().redo();
        else useStore.temporal.getState().undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        useStore.temporal.getState().redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveGenconnDoc();
        return;
      }
      if (mod && e.key.toLowerCase() === "a" && !inField) {
        e.preventDefault();
        useStore.getState().selectAll();
        return;
      }
      if (e.key === "Escape") {
        useStore.getState().clearSelection();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !inField) {
        const s = useStore.getState();
        if (s.portSel.size > 0) {
          e.preventDefault();
          s.deletePortSel(); // ctrl 多选的接口批量删除（优先于实例删除）
        } else if (s.selectedIds.length > 0) {
          e.preventDefault();
          s.deleteSelected();
        }
        return;
      }

      if (inField || useStore.getState().polyDraw) return;
      const s = useStore.getState();
      const k = e.key.toLowerCase();
      const GRID = 20;

      if (mod && k === "c") { e.preventDefault(); s.copySelection(); return; }
      if (mod && k === "v") { e.preventDefault(); s.paste(); return; }
      if (mod && k === "x") { e.preventDefault(); s.cut(); return; }
      if (mod && k === "d") { e.preventDefault(); s.duplicate(); return; }

      if (s.selectedIds.length === 0) return;
      if (!mod && k === "r") { e.preventDefault(); s.rotateSelected("cw"); return; }
      if (e.shiftKey && !mod && k === "h") { e.preventDefault(); s.mirrorSelected("h"); return; }
      if (e.shiftKey && !mod && k === "v") { e.preventDefault(); s.mirrorSelected("v"); return; }
      if (!mod && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const d = { ArrowLeft: [-GRID, 0], ArrowRight: [GRID, 0], ArrowUp: [0, -GRID], ArrowDown: [0, GRID] }[e.key]!;
        s.nudgeSelected(d[0], d[1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="gc-app" style={{ "--left-w": `${leftW}px`, "--right-w": `${rightW}px`, "--gen-h": `${genH}px` } as CSSProperties}>
      <Toolbar />
      <div className="gc-body">
        <div className="gc-leftcol" id="gc-left">
          <LibraryPanel />
          <HierarchyPanel />
        </div>
        <div className="gc-resizer-v" data-resize="left" onMouseDown={dragLeft} title="Drag to resize left panel width" />
        <CanvasView />
        <div className="gc-resizer-v" data-resize="right" onMouseDown={dragRight} title="Drag to resize right panel width" />
        <Inspector />
      </div>
      {genOpen && <div className="gc-resizer-h" onMouseDown={dragGen} title="Drag to resize generate panel height" />}
      <GeneratePanel />
      {/* DfxDialog 已提升到 shell/App.tsx 全局挂载（M3/T4 跨工作区）；此处不再挂，避免双挂。 */}
      <footer className="gc-statusbar">Snap-aligned pairs auto-connect · Click an interface bar to view/edit · Shift-click to multi-select · Ctrl/Cmd+A to select all · Drag to move together</footer>
    </div>
  );
}
