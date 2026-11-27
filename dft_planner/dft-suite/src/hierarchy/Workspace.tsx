// HierarchyWorkspace: the left dock (tree + pin panel) + right tab area + context menu.
// Topbar, open-design, vars/substs, and the multi-top selector live in the shell —
// they are NOT rendered here. The multi-top selector is dropped for now (3.2 concern).

import { useEffect, useRef, useState } from "react";
import { useStore } from "./store.ts";
import { useDesign } from "../store/design.ts";
import { HierarchyTree } from "./HierarchyTree.tsx";
import { TabArea } from "./TabArea.tsx";
import { DpShellPanel } from "./DpShellPanel.tsx";
import { ContextMenu } from "./ContextMenu.tsx";
import "./styles.css";
import { clampTreeWidth, loadTreeWidth, saveTreeWidth } from "./treeWidth.ts";

export function HierarchyWorkspace() {
  const status = useStore((s) => s.status);
  const [treeW, setTreeW] = useState(loadTreeWidth);
  const [collapsed, setCollapsed] = useState(false);
  // dp_shell dock: height persists for the session; drag its top edge to resize.
  // NOTE: every hook must run before the early `return` below — declaring these further down
  // (after that return) is a Rules-of-Hooks violation and blanks the whole window.
  const [shellOpen, setShellOpen] = useState(false);
  const [shellH, setShellH] = useState(220);
  const shellHRef = useRef(shellH);
  shellHRef.current = shellH;
  const dragShell = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY, startH = shellHRef.current;
    const move = (ev: MouseEvent) =>
      setShellH(Math.max(80, Math.min(window.innerHeight - 160, startH + (startY - ev.clientY))));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const treeWRef = useRef(treeW);
  treeWRef.current = treeW;

  const dragTree = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = treeWRef.current;
    const move = (ev: MouseEvent) => setTreeW(clampTreeWidth(startW + (ev.clientX - startX)));
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      saveTreeWidth(treeWRef.current);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Reconcile with the SHARED opened design: the shell/bridge spawns the ONE daemon and
  // fills useDesign.ready; we seed the tree from it (no second hs.open). Resetting when the
  // shared design leaves "ready" keeps the two stores consistent.
  const sharedStatus = useDesign((s) => s.status);
  const sharedReady = useDesign((s) => s.ready);
  useEffect(() => {
    if (sharedStatus === "ready" && sharedReady) {
      useStore.getState().loadFromReady(sharedReady);
    } else if (sharedStatus === "idle" || sharedStatus === "opening" || sharedStatus === "error") {
      useStore.getState().reset();
    }
  }, [sharedStatus, sharedReady]);

  if (status === "idle" || status === "error") {
    return (
      <div id="hier-placeholder" style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--text-faint)" }}>
        {status === "error"
          ? "Failed to load design — please reopen"
          : "Please open a design first"}
      </div>
    );
  }

  return (
    <div className="body" style={{ flex: 1, minHeight: 0, display: "flex" }}>
      <div
        id="hier-tree"
        className={"leftdock" + (collapsed ? " collapsed" : "")}
        style={{ width: collapsed ? 28 : treeW }}
      >
        <div className="dock-head">
          <button className="dock-collapse" title={collapsed ? "Expand hierarchy tree" : "Collapse hierarchy tree"}
                  onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? "»" : "«"}
          </button>
          {!collapsed && <span className="dock-title">Hierarchy</span>}
        </div>
        {!collapsed && <HierarchyTree />}
      </div>
      {!collapsed && <div className="tree-resizer" data-resize="tree" onMouseDown={dragTree} title="Drag to resize hierarchy tree width" />}
      <div id="hier-center" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <TabArea />
        {/* dp_shell docks along the BOTTOM of the workspace (drag its top edge to resize). */}
        {shellOpen
          ? (
            <>
              <div className="dpsh-resizer" onMouseDown={dragShell} title="Drag to resize dp_shell" />
              <div style={{ height: shellH, minHeight: 80, display: "flex", flexDirection: "column" }}>
                <DpShellPanel onClose={() => setShellOpen(false)} />
              </div>
            </>
          )
          : (
            <button className="dpsh-open" onClick={() => setShellOpen(true)}
                    title="Open the dp_shell console">dp_shell ▴</button>
          )}
      </div>
      <ContextMenu />
    </div>
  );
}
