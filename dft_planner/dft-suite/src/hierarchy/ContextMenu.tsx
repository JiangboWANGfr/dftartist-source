// Right-click context menu on a tree node (the Tessent Instance Browser menu).
// Show-on-Schematic (P4), the two HDL actions (P2), and Add-to-GenConnection (P3) are live.

import { useEffect } from "react";
import { useStore } from "./store.ts";
import { splitDefId } from "./core/defId.ts";

const copyText = (t: string): void => { void navigator.clipboard?.writeText(t); };
/** Hierarchical instance path with the CURRENT HARDEN TOP stripped. `roots` = the tops the tree
 *  is showing; the one that actually prefixes this id wins (so a design hardened at
 *  processor_core yields `u_a.u_b`). Falls back to dropping the first segment. */
const hierNoTop = (id: string, roots: readonly string[]): string => {
  for (const r of roots) {
    if (id === r) return id;
    if (id.startsWith(r + ".")) return id.slice(r.length + 1);
  }
  const i = id.indexOf(".");
  return i >= 0 ? id.slice(i + 1) : id;
};

export function ContextMenu() {
  const cm = useStore((s) => s.contextMenu);
  const node = useStore((s) => (cm ? s.instances[cm.nodeId] : undefined));
  const close = useStore((s) => s.closeContextMenu);
  const openDef = useStore((s) => s.openHdlDefinition);
  const openInst = useStore((s) => s.openHdlInstantiation);
  const openSchematic = useStore((s) => s.openSchematic);
  const addToSchematic = useStore((s) => s.addToSchematic);
  const hasSchematic = useStore((s) => s.tabs.some((t) => t.kind === "schematic"));
  const addToGen = useStore((s) => s.addToGenConnection);
  const addToDfx = useStore((s) => s.addToDfxCtrl);
  const roots = useStore((s) => s.rootInstanceIds);   // current harden top(s)

  useEffect(() => {
    if (!cm) return;
    const onClick = () => close();
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onEsc);
    return () => { window.removeEventListener("click", onClick); window.removeEventListener("keydown", onEsc); };
  }, [cm, close]);

  if (!cm || !node) return null;

  const instDisabled = node.parentInstanceId === null; // root has no instantiation site

  const Item = ({ label, onClick, disabled, hint, menuKey }: {
    label: string; onClick?: () => void; disabled?: boolean; hint?: string; menuKey?: string;
  }) => (
    <div
      className={"cmi" + (disabled ? " disabled" : "")}
      title={hint}
      data-menu={menuKey}
      onClick={disabled ? undefined : (e) => { e.stopPropagation(); onClick?.(); close(); }}
    >
      {label}
    </div>
  );

  return (
    <div className="cmenu" style={{ left: cm.x, top: cm.y }} onClick={(e) => e.stopPropagation()}>
      <Item label="Show in Hierarchy Schematic" menuKey="schematic" onClick={() => void openSchematic(cm.nodeId)} hint="Reuse the schematic tab (content follows selection)" />
      <Item label="Show Schematic in New Tab" menuKey="schematic-newtab" onClick={() => void openSchematic(cm.nodeId, { newTab: true })} hint="Open a dedicated schematic tab for it" />
      {hasSchematic && (
        <Item label="Add to Current Schematic" menuKey="schematic-add" onClick={() => void addToSchematic(cm.nodeId)} hint="Append this instance to the current schematic, auto-wiring direct connections to instances already on it" />
      )}
      <div className="cmsep" />
      <Item
        label="Show HDL Definition"
        menuKey="hdl-definition"
        onClick={() => void openDef(cm.nodeId)}
        disabled={node.kind !== "module"}
        hint={node.kind !== "module" ? `${node.kind} has no RTL definition file` : undefined}
      />
      <Item
        label="Show HDL Instantiation"
        menuKey="hdl-instantiation"
        onClick={() => void openInst(cm.nodeId)}
        disabled={instDisabled}
        hint={instDisabled ? "Top module has no instantiation site" : undefined}
      />
      <div className="cmsep" />
      <Item label="Copy Module Name" menuKey="copy-module" onClick={() => copyText(splitDefId(node.definitionId).designName)}
            hint={splitDefId(node.definitionId).designName} />
      <Item label="Copy Instance Name (leaf)" menuKey="copy-instance" onClick={() => copyText(node.instanceName)}
            hint={node.instanceName} />
      <Item label="Copy Hierarchical Instance" menuKey="copy-hier-instance" onClick={() => copyText(hierNoTop(cm.nodeId, roots))}
            hint={hierNoTop(cm.nodeId, roots)} />
      <div className="cmsep" />
      <Item label="Add to DFT Stream Planner" menuKey="add-to-gen" onClick={() => addToGen(cm.nodeId)} />
      <Item label="Add to DFX Ctrl" menuKey="add-to-dfx" onClick={() => addToDfx(cm.nodeId)} />
    </div>
  );
}
