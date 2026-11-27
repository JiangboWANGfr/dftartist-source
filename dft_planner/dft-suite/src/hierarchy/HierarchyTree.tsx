// Lazy design-hierarchy tree (Tessent Instance Browser style). Expanding a node
// fetches one body level; leaves never materialize children. Multiple top roots
// (multi-top designs) render side by side at the top level.

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "./store.ts";
import { splitDefId } from "./core/defId.ts";
import { dftDesign as hs } from "../core-bridge/client.ts";
import type { FoundObject } from "../core-bridge/model.ts";

export function HierarchyTree() {
  const rootInstanceIds = useStore((s) => s.rootInstanceIds);
  const status = useStore((s) => s.status);
  if (status === "opening") return <div className="tree muted">opening…</div>;
  if (!rootInstanceIds.length) return <div className="tree muted">No design open — use “Open folder…”.</div>;
  return (
    <>
      <TreeSearch />
      <div className="tree" role="tree">
        {rootInstanceIds.map((id) => <TreeNode key={id} id={id} depth={0} />)}
      </div>
    </>
  );
}

/** Glob search over the ELABORATED design. The tree is lazily loaded, so matching has to happen
 *  in the daemon (find-objects); picking a hit expands the path down to it. */
function TreeSearch() {
  const reveal = useStore((s) => s.revealInstance);
  const [q, setQ] = useState("");
  const [kinds, setKinds] = useState("instance");
  const [hits, setHits] = useState<FoundObject[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const seq = useRef(0);

  const search = useCallback(async (pattern: string, k: string) => {
    const term = pattern.trim();
    if (!term) { setHits(null); setTruncated(false); return; }
    // A bare word is a substring search; power users can still type globs.
    const pat = /[*?[]/.test(term) ? term : `*${term}*`;
    const my = ++seq.current;
    setBusy(true);
    try {
      const r = await hs.findObjects(pat, k, 300);
      if (my !== seq.current) return;   // a newer keystroke already won
      setHits(r.objects);
      setTruncated(r.truncated);
    } catch {
      if (my === seq.current) { setHits([]); setTruncated(false); }
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }, []);

  // debounce so typing doesn't hammer the daemon
  useEffect(() => {
    const t = setTimeout(() => void search(q, kinds), 220);
    return () => clearTimeout(t);
  }, [q, kinds, search]);

  const pick = (o: FoundObject) => {
    // pins/nets/ports live on an instance — reveal their owner, else the instance itself.
    void reveal(o.kind === "instance" ? o.id : (o.parent || o.id));
  };

  return (
    <div className="tsearch">
      <div className="tsearch-row">
        <input
          className="tsearch-in"
          placeholder="Search instance / module / pin…"
          value={q}
          spellCheck={false}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); setHits(null); } }}
        />
        {q && <button className="findbtn" title="Clear" onClick={() => { setQ(""); setHits(null); }}>✕</button>}
      </div>
      <div className="tsearch-row">
        <select className="tsearch-kind" value={kinds} onChange={(e) => setKinds(e.target.value)}>
          <option value="instance">instances</option>
          <option value="module">modules</option>
          <option value="port,pin">ports / pins</option>
          <option value="net">nets</option>
          <option value="">all</option>
        </select>
        <span className="tsearch-stat">
          {busy ? "…" : hits ? `${hits.length}${truncated ? "+" : ""} hit${hits.length === 1 ? "" : "s"}` : ""}
        </span>
      </div>
      {hits && (
        <div className="tsearch-hits">
          {hits.length === 0 && <div className="tsearch-none">no match</div>}
          {hits.map((o) => (
            <div key={o.kind + ":" + o.id} className="tsearch-hit" title={o.id} onClick={() => pick(o)}>
              <span className={"tsearch-k k-" + o.kind}>{o.kind[0].toUpperCase()}</span>
              <span className="tsearch-name">{o.name}</span>
              <span className="tsearch-path">{o.kind === "module" ? o.name : o.id}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TreeNode({ id, depth }: { id: string; depth: number }) {
  const node = useStore((s) => s.instances[id]);
  const expanded = useStore((s) => !!s.expanded[id]);
  const selected = useStore((s) => s.selectedId === id);
  const toggleExpand = useStore((s) => s.toggleExpand);
  const selectInstance = useStore((s) => s.selectInstance);
  const openContextMenu = useStore((s) => s.openContextMenu);
  if (!node) return null;
  const pick = () => selectInstance({ nodeId: id, defId: node.definitionId });
  return (
    <div className="tnode">
      <div
        className={"trow" + (selected ? " sel" : "")}
        data-node={id}
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={pick}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); pick(); openContextMenu(id, e.clientX, e.clientY); }}
      >
        <span
          className="tarrow"
          data-arrow={id}
          onClick={(e) => { e.stopPropagation(); void toggleExpand(id); }}
        >
          {node.isLeaf ? "·" : expanded ? "▾" : "▸"}
        </span>
        <span className="tname">{node.instanceName}</span>
        <span className="tdef">{splitDefId(node.definitionId).designName}</span>
        {node.kind !== "module" && <span className={"tkind " + node.kind}>{node.kind}</span>}
      </div>
      {expanded && node.childInstanceIds.map((cid) => <TreeNode key={cid} id={cid} depth={depth + 1} />)}
    </div>
  );
}
