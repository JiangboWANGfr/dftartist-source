// Center work-surface tab: the selected instance's port table. Ports are fetched
// PER INSTANCE on render (lazy — no daemon call happens in selectInstance), so
// parameterized modules show this exact instance's resolved widths (DesignHierarchy §3.7).

import { useEffect, useState } from "react";
import { useStore } from "./store.ts";
import { splitDefId } from "./core/defId.ts";
import { dftDesign as hs } from "../core-bridge/client.ts";
import type { PortInfo, PortsTabSpec } from "./core/model.ts";

export function PortsTab({ tab }: { tab: PortsTabSpec }) {
  const node = useStore((s) => s.instances[tab.nodeId]);
  const def = useStore((s) => s.definitions[tab.defId]);
  const [ports, setPorts] = useState<PortInfo[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setPorts(null);
    setOverrides({});
    setError(null);
    hs.getPorts({ nodeId: tab.nodeId })
      .then((r) => { if (live) { setPorts(r.ports); setOverrides(r.portWidthOverrides ?? {}); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [tab.nodeId]);

  const designName = def?.designName ?? splitDefId(tab.defId).designName;
  const counts = ports
    ? { in: ports.filter((p) => p.direction === "in").length,
        out: ports.filter((p) => p.direction === "out").length,
        inout: ports.filter((p) => p.direction === "inout").length }
    : null;

  return (
    <div className="ports-tab" data-tab-kind="ports">
      <div className="ports-head">
        <div className="ports-title">
          <div className="ports-name">{designName}</div>
          <div className="ports-path">{node?.id ?? tab.nodeId}</div>
        </div>
        {counts && (
          <div className="ports-chips">
            <span className="chip"><span className="sw dir-in-bg" />{counts.in} in</span>
            <span className="chip"><span className="sw dir-out-bg" />{counts.out} out</span>
            <span className="chip"><span className="sw dir-io-bg" />{counts.inout} inout</span>
            <span className="chip">{ports!.length} ports</span>
          </div>
        )}
      </div>
      <div className="ports-body">
        {error && <div className="muted pad">Failed to load ports: {error}</div>}
        {!error && !ports && <div className="muted pad">Loading…</div>}
        {!error && ports && (
          <table className="tbl">
            <thead>
              <tr><th style={{ width: "40%" }}>name</th><th style={{ width: "12%" }}>dir</th><th style={{ width: "16%" }}>width</th><th>type</th></tr>
            </thead>
            <tbody>
              {ports.length === 0 && <tr><td colSpan={4} className="muted">(no ports)</td></tr>}
              {ports.map((p) => {
                const w = overrides[p.name] ?? p.width;
                const isOv = overrides[p.name] !== undefined;
                return (
                  <tr key={p.name}>
                    <td>{p.busLabel}</td>
                    <td className={dirClass(p.direction)}>{p.direction}</td>
                    <td className={isOv ? "w ov" : "w"}>{w > 1 ? `[${w - 1}:0]` : "1"}</td>
                    <td className="muted">{p.type ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function dirClass(d: PortInfo["direction"]): string {
  return d === "in" ? "dir-in" : d === "out" ? "dir-out" : "dir-io";
}
