// Clock structure ORGANISED BY THE REAL DESIGN HIERARCHY (the instance tree slang elaborated).
//
// The primary axis is the hierarchy, not the clock path: every instance that has clocked logic
// under it becomes a row, nested exactly as in the design. Each row shows only the CLOCK
// structure at that level — the clock nets entering it, what drives them, and the REAL number
// of registers that clock drives (own = flops in this instance body, subtree = own + children).
//
// A clock that no create_clock reaches is X: with a single `create_clock dco_clk`, only the
// branches that actually walk back to dco_clk read 010; everything else is honestly X.

import { useMemo, useState } from "react";
import type { CrPathItem } from "../core-bridge/model.ts";
import { displayElems } from "./core/crSchematic.ts";

interface HNode {
  id: string;                 // full hierarchical instance path
  name: string;               // leaf instance name
  children: Map<string, HNode>;
  items: CrPathItem[];        // clock/reset groups declared IN THIS instance body
  own: number;                // flops driven at this level
  subtree: number;            // own + all descendants
  bad: number;                // violating flops in the subtree
}

const mk = (id: string, name: string): HNode =>
  ({ id, name, children: new Map(), items: [], own: 0, subtree: 0, bad: 0 });

function valueCls(v: string): string {
  if (v === "010" || v === "101") return "ok";
  if (v === "0" || v === "1") return "const";
  return "x";
}

/** Build the instance tree from the owners of every clock/reset group. */
function build(items: CrPathItem[], isBad: (i: CrPathItem) => boolean): HNode {
  const root = mk("", "");
  for (const it of items) {
    const parts = it.owner.split(".");
    let cur = root;
    let path = "";
    for (const p of parts) {
      path = path ? path + "." + p : p;
      let nx = cur.children.get(p);
      if (!nx) { nx = mk(path, p); cur.children.set(p, nx); }
      cur = nx;
    }
    cur.items.push(it);
    cur.own += it.flopCount;
  }
  const roll = (n: HNode): void => {
    n.subtree = n.own;
    n.bad = n.items.filter(isBad).reduce((a, i) => a + i.flopCount, 0);
    for (const c of n.children.values()) { roll(c); n.subtree += c.subtree; n.bad += c.bad; }
  };
  roll(root);
  return root;
}

/** Compact one-line summary of where a clock net comes from. */
function sourceText(i: CrPathItem, strip: (s: string) => string): string {
  const chain = displayElems(i.elems).map((e) => e.split("@")[0]).reverse();
  const src = i.terminus === "pi" ? strip(i.detail)
            : i.terminus === "logic" ? `logic(${i.detail})`
            : i.terminus === "instance" ? strip(i.detail)
            : "undriven";
  return chain.length ? `${src} → ${chain.join(" → ")}` : src;
}

export function ClockHierarchy({ items, strip, kind, onOcc, onMux }: {
  items: CrPathItem[];
  strip: (s: string) => string;
  kind: "clock" | "reset";
  onOcc?: (i: CrPathItem) => void;
  onMux?: (i: CrPathItem) => void;
}) {
  const isBad = (i: CrPathItem) =>
    i.kind === "reset" ? !i.ok : i.value !== "010" && i.value !== "101";
  const root = useMemo(() => build(items, isBad), [items]);
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  if (items.length === 0) return <div className="muted pad">no {kind} structure</div>;

  const rows: React.ReactNode[] = [];
  const walk = (n: HNode, depth: number): void => {
    const isClosed = !!closed[n.id];
    const hasKids = n.children.size > 0;
    if (n.id) {
      rows.push(
        <div className="chrow chinst" key={"i:" + n.id} style={{ paddingLeft: 8 + depth * 16 }}
             onClick={() => hasKids && setClosed((c) => ({ ...c, [n.id]: !isClosed }))}>
          <span className="tarrow">{hasKids ? (isClosed ? "▶" : "▼") : "·"}</span>
          <span className="chname">{n.name}</span>
          {/* the REAL register count this level drives */}
          <span className="chcnt" title="flops in this instance body / including all children">
            {n.own > 0 && <b>{n.own}</b>}
            {n.subtree !== n.own && <span className="chsub"> / {n.subtree}</span>}
          </span>
          {n.bad > 0 && <span className="chbad">⚠ {n.bad}</span>}
        </div>,
      );
    }
    if (isClosed) return;
    // clock structure AT THIS LEVEL
    for (const i of n.items) {
      rows.push(
        <div className={"chrow chnet" + (isBad(i) ? " bad" : "")} key={"n:" + n.id + i.net}
             style={{ paddingLeft: 8 + (depth + 1) * 16 }}>
          <span className={"crv crv-" + valueCls(i.value)} title={
            i.value === "010" ? "01 = leading edge, 10 = trailing edge"
            : i.value === "101" ? "inverted clock"
            : i.value === "X" ? "no clock definition reaches this pin"
            : "constant"}>{i.value}</span>
          <span className="chnetname">{i.net}</span>
          <span className="chedge">{i.edge}</span>
          {i.clockName && <span className="chclk">{i.clockName}</span>}
          <span className="chsrc" title={i.path.join("  →  ")}>{sourceText(i, strip)}</span>
          {kind === "reset" && (
            /* Three states, three colours: green = inactive today, YELLOW = inactive only
               because a planned mux patches it (designed, not inserted), red = still broken and
               needing a decision. Reading the same green as a genuinely fine reset would be the
               tool claiming the design is fixed while nothing has been inserted. */
            <span className={"crina" + (i.plannedFix ? " planned" : i.ok ? " ok" : " bad")}
                  title={i.plannedFix
                    ? "passes because of a PLANNED control mux — nothing is inserted yet"
                    : undefined}>
              inactive={i.inactive}
              {i.plannedFix ? " FIXED BY PLAN" : i.ok ? "" : " NOT INACTIVE"}
            </span>
          )}
          <span className="chflops" title="registers this clock actually drives">×{i.flopCount}</span>
          <span className="crspace" />
          {kind === "clock"
            ? <button className="findbtn" onClick={() => onOcc?.(i)} title="add_to_occ_def_point">+OCC</button>
            : <button className="findbtn" onClick={() => onMux?.(i)} title="add_dft_ctrl_mux">+Mux</button>}
        </div>,
      );
    }
    for (const c of [...n.children.values()].sort((a, b) => a.name.localeCompare(b.name)))
      walk(c, depth + (n.id ? 1 : 0));
  };
  walk(root, 0);

  return (
    <div className="chtree">
      <div className="chhead">
        <span>hierarchy · clock structure</span>
        <span className="chlegend">
          count = <b>own</b> / subtree registers
        </span>
      </div>
      {rows}
    </div>
  );
}
