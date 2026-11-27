// Register Count report: sortable table of every instance's own / subtree / memory flop bits.
// Content comes from the store's regCounts (lazy-loaded by openRegCountTab). Clicking a row
// selects the matching instance in the hierarchy tree.

import { useState } from "react";
import { useStore } from "./store.ts";
import { regRows, depthOf, leafName, type RegSortKey } from "./core/regcount.ts";
import { useProject, writeToProject } from "../store/project.ts";
import { regCountFile } from "../store/outputLayout.ts";
import { formatRegReport } from "./core/regReport.ts";

// "hier" (Instance column) keeps the design hierarchy (pre-order + indentation); numeric
// columns sort flat to surface the biggest-flop instances.
const COLS: { key: RegSortKey; label: string; num: boolean }[] = [
  { key: "hier", label: "Instance", num: false },
  { key: "own", label: "Own", num: true },
  { key: "subtree", label: "Subtree", num: true },
  { key: "memoryBits", label: "Memory", num: true },
];

export function RegCountTab() {
  const rc = useStore((s) => s.regCounts);
  const err = useStore((s) => s.regCountsError);
  const instances = useStore((s) => s.instances);
  const selectInstance = useStore((s) => s.selectInstance);
  const [sortKey, setSortKey] = useState<RegSortKey>("hier");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState("");
  const projOpen = useProject((s) => !!s.path);

  if (err) return <div className="regcount muted" data-tab-kind="regcount">Failed to load register count: {err}</div>;
  if (!rc) return <div className="regcount muted" data-tab-kind="regcount">Loading…</div>;

  const hier = sortKey === "hier";
  const rows = regRows(rc, { key: sortKey, dir }, filter);
  const clickHead = (k: RegSortKey) => {
    if (k === "hier") { setSortKey("hier"); return; }
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setDir("desc"); }
  };
  const clickRow = (id: string) => {
    const node = instances[id];
    if (node) selectInstance({ nodeId: id, defId: node.definitionId });
  };

  return (
    <div className="regcount" data-tab-kind="regcount">
      <div className="rc-head">
        <input className="rc-filter" placeholder="Filter instances…" value={filter}
               onChange={(e) => setFilter(e.target.value)} />
        <span className="rc-total">Total {rc.total}</span>
        {projOpen && (
          <button className="rc-export" title="Export register count to project design_info/register_count.tcl"
                  onClick={() => void writeToProject([regCountFile(formatRegReport(rc.counts[0]?.instanceId ?? "design", rc))])}>
            Export to Project
          </button>
        )}
      </div>
      <div className="rc-table-wrap">
        <table className="rc-table">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={c.num ? "num" : ""} onClick={() => clickHead(c.key)}>
                  {c.label}{sortKey === c.key && c.key !== "hier" ? (dir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.instanceId} onClick={() => clickRow(r.instanceId)}>
                <td title={hier ? r.instanceId : undefined}
                    style={hier ? { paddingLeft: 10 + depthOf(r.instanceId) * 16 } : undefined}>
                  {hier ? leafName(r.instanceId) : r.instanceId}
                </td>
                <td className="num">{r.own}</td>
                <td className="num">{r.subtree}</td>
                <td className="num">{r.memoryBits || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
