// Tessent-style tab strip + active tab body (the right-hand work surface).

import { useState } from "react";
import { useStore } from "./store.ts";
import { HdlSourceTab } from "./HdlSourceTab.tsx";
import { PortsTab } from "./PortsTab.tsx";
import { SchematicTab } from "./schematic/SchematicTab.tsx";
import { DfxCtrlTab } from "./schematic/DfxCtrlTab.tsx";
import { RegCountTab } from "./RegCountTab.tsx";
import { ClockResetTab } from "./ClockResetTab.tsx";
import { PadTab } from "./PadTab.tsx";
import { DfxIpTab } from "./DfxIpTab.tsx";

export function TabArea() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab = useStore((s) => s.closeTab);
  const active = tabs.find((t) => t.id === activeTabId);
  const openRegCountTab = useStore((s) => s.openRegCountTab);
  const openCrTreeTab = useStore((s) => s.openCrTreeTab);
  const openPadTab = useStore((s) => s.openPadTab);
  const openDfxIpTab = useStore((s) => s.openDfxIpTab);
  const openDfxCtrlTab = useStore((s) => s.openDfxCtrlTab);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main className="work">
      <div className="tabbar">
        <div className="tabstrip">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={"tab" + (t.id === activeTabId ? " active" : "")}
              onClick={() => setActiveTab(t.id)}
              title={t.kind === "hdl" ? `${t.file}:${t.line}` : t.kind === "ports" ? t.nodeId : t.kind === "schematic" ? t.seedNodeId : t.title}
            >
              <span className="ttitle">{t.title}</span>
              <span className="tclose" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}>×</span>
            </div>
          ))}
        </div>
        <div className="tabmenu-wrap">
          <button className="tabmenu-btn" data-tabmenu="btn" title="Open feature page" onClick={() => setMenuOpen((v) => !v)}>+ ▾</button>
          {menuOpen && (
            <div className="tabmenu" onMouseLeave={() => setMenuOpen(false)}>
              <div className="tabmenu-item" data-tabmenu-item="regcount" onClick={() => { setMenuOpen(false); void openRegCountTab(); }}>Register Count</div>
              <div className="tabmenu-item" data-tabmenu-item="crtree" onClick={() => { setMenuOpen(false); openCrTreeTab(); }}>Clock / Reset structure</div>
              <div className="tabmenu-item" data-tabmenu-item="pad" onClick={() => { setMenuOpen(false); void openPadTab(); }}>Pad/BScan</div>
              <div className="tabmenu-item" data-tabmenu-item="dfxip" onClick={() => { setMenuOpen(false); openDfxIpTab(); }}>DFX IP</div>
              <div className="tabmenu-item" data-tabmenu-item="dfxctrl" onClick={() => { setMenuOpen(false); openDfxCtrlTab(); }}>DFX Ctrl</div>
            </div>
          )}
        </div>
      </div>
      <div className="tabbody">
        {active?.kind === "ports" && <PortsTab tab={active} />}
        {active?.kind === "hdl" && <HdlSourceTab tab={active} />}
        {active?.kind === "schematic" && <SchematicTab seedNodeId={active.seedNodeId} />}
        {active?.kind === "dfxctrl" && <DfxCtrlTab />}
        {active?.kind === "regcount" && <RegCountTab />}
        {active?.kind === "crtree" && <ClockResetTab />}
        {active?.kind === "pad" && <PadTab />}
        {active?.kind === "dfxip" && <DfxIpTab />}
      </div>
    </main>
  );
}
