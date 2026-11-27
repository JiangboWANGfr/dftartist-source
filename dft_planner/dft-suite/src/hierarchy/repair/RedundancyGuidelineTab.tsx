// Port of RedundancyGuidelineWindow (src/ui/SramRepairAdvisor.cpp:1313-1721) — the editable
// Table 1 (recommended redundancy mix by memory size band), a lookup tool, and the guidance
// text + process-window figure that sit around it in the standalone SRAM Repair Advisor.
import { useCallback, useMemo, useState } from "react";
import {
  bandLabel, defaultGuideline, formatStorageUnits, loadGuideline, lookupGuideline,
  nBands, nMethods, parseStorageUnits, saveGuideline, tiersFromGuideline,
  type RedundancyGuideline,
} from "../core/repairModel.ts";
import { promptText } from "../../genconn/promptDialog.tsx";
import { notify } from "../../common/notify.ts";

/** Process-window figure (SramRepairAdvisor.cpp:1148-1311, ProcessWindowWidget): NFET vs PFET
 *  Leff corner scatter (SSG/FFG/SSG/FSG around a TT centre), a red "high-sigma design window"
 *  ellipse, 3σ-global diagonals, and a 5.4σ-local Gaussian bump per corner. A fixed illustrative
 *  figure — not data-driven — ported as a static SVG in place of the QPainter drawing. */
function ProcessWindowFigure() {
  const W = 320, H = 260;
  const lm = 48, rm = 40, tm = 34, bm = 34;
  const plotL = lm, plotT = tm, plotR = W - rm, plotB = H - bm;
  const cx = (plotL + plotR) / 2, cy = (plotT + plotB) / 2;
  const hx = (plotR - plotL) * 0.30, hy = (plotB - plotT) * 0.30;
  const corners: Array<{ x: number; y: number; name: string; sx: number; sy: number }> = [
    { x: cx - hx, y: cy - hy, name: "SFG", sx: -1, sy: -1 },
    { x: cx + hx, y: cy - hy, name: "FFG", sx: 1, sy: -1 },
    { x: cx - hx, y: cy + hy, name: "SSG", sx: -1, sy: 1 },
    { x: cx + hx, y: cy + hy, name: "FSG", sx: 1, sy: 1 },
  ];
  // Red ellipse, semi-major along SSG->FFG, scaled to fit inside the plot.
  const r = Math.hypot(hx, hy);
  let a = r * 1.2, b = r * 0.64;
  const th = -Math.atan2(hy, hx);
  const xext = Math.hypot(a * Math.cos(th), b * Math.sin(th));
  const yext = Math.hypot(a * Math.sin(th), b * Math.cos(th));
  const s = Math.min(1, ((plotR - plotL) * 0.5 - 3) / xext, ((plotB - plotT) * 0.5 - 3) / yext);
  a *= s; b *= s;
  const bump = (x: number, y: number, sy: number) => {
    const w = 30, h = 13;
    const baseY = y + (sy < 0 ? -16 : 20);
    return `M ${x - w / 2} ${baseY} C ${x - w / 6} ${baseY} ${x - w / 6} ${baseY - h} ${x} ${baseY - h} `
         + `C ${x + w / 6} ${baseY - h} ${x + w / 6} ${baseY} ${x + w / 2} ${baseY}`;
  };
  return (
    <svg width={W} height={H} style={{ background: "#252526", border: "1px solid #3c3c3c", borderRadius: 8 }}>
      {/* axes */}
      <line x1={plotL} y1={plotB} x2={plotL} y2={plotT - 6} stroke="#5fc9d6" strokeWidth={1.5} />
      <line x1={plotL} y1={plotB} x2={plotR + 6} y2={plotB} stroke="#5fc9d6" strokeWidth={1.5} />
      <text x={plotR - 4} y={plotB + 18} fontSize={9} fill="#5fc9d6" textAnchor="end" fontStyle="italic">NFET Leff</text>
      <text x={12} y={cy} fontSize={9} fill="#5fc9d6" textAnchor="middle" fontStyle="italic"
            transform={`rotate(-90 12 ${cy})`}>PFET Leff</text>
      {/* 3σ global diagonals */}
      {corners.map((c) => (
        <line key={`d:${c.name}`} x1={cx} y1={cy} x2={cx + (c.x - cx) * 0.82} y2={cy + (c.y - cy) * 0.82}
              stroke="#5fc9d6" strokeWidth={1.1} markerEnd="url(#pw-arrow)" />
      ))}
      <defs>
        <marker id="pw-arrow" markerWidth={6} markerHeight={6} refX={5} refY={3} orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#5fc9d6" />
        </marker>
      </defs>
      <text x={cx - hx * 0.5} y={cy - hy * 0.5 - 8} fontSize={8} fill="#8fd6df" fontStyle="italic" textAnchor="middle">3σ global</text>
      <text x={cx + hx * 0.5} y={cy - hy * 0.5 - 8} fontSize={8} fill="#8fd6df" fontStyle="italic" textAnchor="middle">3σ global</text>
      {/* 5.4σ local bumps */}
      {corners.map((c) => (
        <g key={`b:${c.name}`}>
          <path d={bump(c.x + c.sx * 18, c.y, c.sy)} stroke="#37b24e" strokeWidth={1.6} fill="none" />
          <text x={c.x + c.sx * 18} y={c.y + (c.sy < 0 ? -30 : 34)} fontSize={7.5} fill="#8b949e" textAnchor="middle">5.4σ local</text>
        </g>
      ))}
      {/* high-sigma ellipse */}
      <g transform={`translate(${cx} ${cy}) rotate(${(th * 180) / Math.PI})`}>
        <ellipse cx={0} cy={0} rx={a} ry={b} stroke="#e02b2b" strokeWidth={2} fill="none" />
      </g>
      {/* TT centre */}
      <circle cx={cx} cy={cy} r={2.6} fill="#e0e0e0" />
      <text x={cx + 6} y={cy + 12} fontSize={10} fill="#f0f0f0" fontWeight="bold">TT</text>
      {/* corner labels */}
      {corners.map((c) => (
        <text key={`n:${c.name}`} x={c.x + c.sx * 8} y={c.y + c.sy * 14}
              fontSize={9} fill="#e6e9ef" textAnchor={c.sx < 0 ? "start" : "end"}>{c.name}</text>
      ))}
    </svg>
  );
}

export function RedundancyGuidelineTab() {
  const [g, setG] = useState<RedundancyGuideline>(() => loadGuideline());
  const [editing, setEditing] = useState<{ r: number; c: number } | null>(null);
  const [editVal, setEditVal] = useState("");
  const [selRow, setSelRow] = useState<number | null>(null);
  const [selCol, setSelCol] = useState<number | null>(null);
  const [lookupBits, setLookupBits] = useState("");

  const commitCell = useCallback((r: number, c: number, text: string) => {
    let v = Number(text.trim().replace(/%$/, ""));
    if (!Number.isFinite(v)) v = g.pct[r][c];
    v = Math.max(0, Math.min(100, v));
    setG((prev) => {
      const pct = prev.pct.map((row) => row.slice());
      pct[r][c] = v;
      return { ...prev, pct };
    });
    setEditing(null);
  }, [g]);

  const editBand = useCallback(async (col: number) => {
    const lo = await promptText("Edit size band — lower bound (physical bits, K/M/G ok):",
      formatStorageUnits(g.edges[col]));
    if (lo === null) return;
    const hi = await promptText("Edit size band — upper bound (physical bits, K/M/G ok):",
      formatStorageUnits(g.edges[col + 1]));
    if (hi === null) return;
    const lov = parseStorageUnits(lo), hiv = parseStorageUnits(hi);
    if (hiv <= lov) { notify("Upper bound must be greater than the lower bound."); return; }
    setG((prev) => {
      const edges = prev.edges.slice();
      edges[col] = lov; edges[col + 1] = hiv;
      return { ...prev, edges };
    });
  }, [g]);

  const renameMethod = useCallback(async (row: number) => {
    const name = await promptText("Rename method — redundancy method name:", g.methods[row]);
    if (name === null || !name.trim()) return;
    setG((prev) => {
      const methods = prev.methods.slice();
      methods[row] = name.trim();
      return { ...prev, methods };
    });
  }, [g]);

  const addMethod = () => setG((prev) => ({
    ...prev, methods: [...prev.methods, "New Method"], pct: [...prev.pct, new Array(nBands(prev)).fill(0)],
  }));
  const delMethod = () => setG((prev) => {
    if (nMethods(prev) <= 1) return prev;
    const r = selRow ?? nMethods(prev) - 1;
    return { ...prev, methods: prev.methods.filter((_, i) => i !== r), pct: prev.pct.filter((_, i) => i !== r) };
  });
  const addBand = () => setG((prev) => {
    const top = prev.edges[prev.edges.length - 1];
    return { ...prev, edges: [...prev.edges, top > 0 ? top * 2 : 1024],
             pct: prev.pct.map((row) => [...row, 0]) };
  });
  const delBand = () => setG((prev) => {
    if (nBands(prev) <= 1) return prev;
    const c = selCol ?? nBands(prev) - 1;
    const edges = prev.edges.filter((_, i) => i !== c + 1);
    return { ...prev, edges, pct: prev.pct.map((row) => row.filter((_, i) => i !== c)) };
  });
  const resetDefault = () => {
    if (!window.confirm("Reset the guideline table to the default values?")) return;
    setG(defaultGuideline());
  };
  const save = () => { saveGuideline(g); notify("Guideline saved"); };

  const colSums = useMemo(() => {
    const sums: number[] = [];
    for (let c = 0; c < nBands(g); c++) sums.push(g.pct.reduce((s, row) => s + row[c], 0));
    return sums;
  }, [g]);
  const badBands = colSums.map((s, c) => ({ c, s })).filter(({ s }) => Math.abs(s - 100) > 0.01);

  const tiers = useMemo(() => tiersFromGuideline(g), [g]);
  const lookupResult = useMemo(() => {
    const bits = parseStorageUnits(lookupBits);
    if (bits <= 0) return null;
    return lookupGuideline(bits, g);
  }, [lookupBits, g]);

  return (
    <div style={{ overflow: "auto", minHeight: 0, flex: 1, padding: "10px 14px" }}>
      <h2 style={{ margin: "4px 0 2px", color: "#fff" }}>SRAM Redundancy Strategy &amp; Guideline</h2>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        What redundancy each memory instance should carry, the cautions behind the guidance, and
        — at the end — how to choose and run a yield model.
      </div>

      <h3 style={{ color: "#fff", fontSize: 15 }}>1 · General design guidelines</h3>
      <ul style={{ fontSize: 12, color: "#d4d4d4" }}>
        <li><b>Require all SRAM instances to be compiled with repair</b>
          <ul>
            <li>Parametric yield is driven by total bitcount</li>
            <li>Recognize that fails can occur anywhere</li>
            <li>Exceptions to the guidelines are possible, but limited and analyzed for yield impact</li>
          </ul>
        </li>
        <li><b>Repair infrastructure to enable upwards of 250 repair actions</b>
          <ul>
            <li># of e-fuse elements and compression</li>
            <li>~2X TSMC guidance</li>
            <li>Enable repair for each test insertion and deep repair screens</li>
          </ul>
        </li>
      </ul>

      <h3 style={{ color: "#fff", fontSize: 15 }}>2 · Recommended redundancy mix by memory size (Table 1)</h3>
      <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
        Recommended mix (%) by Total Physical Bits Per Memory Instance. Double-click a cell to
        edit its percentage · a column header to edit that size band · a row header to rename
        the method.
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%", background: "#252526",
                      border: "1px solid #3c3c3c", borderRadius: 6, fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ background: "#0b5394" }} />
            {Array.from({ length: nBands(g) }, (_, c) => (
              <th key={c} onDoubleClick={() => void editBand(c)}
                  title="Double-click to edit this size band"
                  style={{ background: "#0b5394", color: "#fff", padding: 6, cursor: "pointer",
                           borderRight: "1px solid #0a4a85", fontWeight: 700 }}>
                {bandLabel(g, c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {g.methods.map((m, r) => (
            <tr key={r}>
              <th onDoubleClick={() => void renameMethod(r)} title="Double-click to rename this method"
                  style={{ background: "#0b5394", color: "#fff", padding: 6, cursor: "pointer",
                           textAlign: "left", whiteSpace: "nowrap" }}>
                {m}
              </th>
              {Array.from({ length: nBands(g) }, (_, c) => {
                const isEditing = editing && editing.r === r && editing.c === c;
                return (
                  <td key={c}
                      onClick={() => { setSelRow(r); setSelCol(c); }}
                      onDoubleClick={() => { setEditing({ r, c }); setEditVal(String(g.pct[r][c])); }}
                      style={{ padding: 6, textAlign: "center", color: "#e0e0e0",
                               border: "1px solid #3c3c3c",
                               background: selRow === r && selCol === c ? "#264f78" : undefined,
                               cursor: "pointer" }}>
                    {isEditing ? (
                      <input autoFocus className="findinput" style={{ width: 60, textAlign: "center" }}
                             value={editVal} onChange={(e) => setEditVal(e.target.value)}
                             onBlur={() => commitCell(r, c, editVal)}
                             onKeyDown={(e) => {
                               if (e.key === "Enter") commitCell(r, c, editVal);
                               else if (e.key === "Escape") setEditing(null);
                             }} />
                    ) : `${g.pct[r][c]}%`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted" style={{ fontSize: 11, margin: "6px 0" }}>
        {badBands.length === 0
          ? "✓ Every size band's redundancy mix totals 100%."
          : `⚠ These bands do not total 100%: ${badBands.map(({ c, s }) => `${bandLabel(g, c)} = ${s}%`).join(", ")}`}
      </div>

      <div style={{ display: "flex", gap: 8, margin: "6px 0 14px", flexWrap: "wrap" }}>
        <button className="findbtn" data-btn="rg-add-method" onClick={addMethod}
                style={{ background: "#4CAF50", color: "#fff" }}>+ Method</button>
        <button className="findbtn" data-btn="rg-del-method" onClick={delMethod}
                style={{ background: "#f44336", color: "#fff" }}>− Method</button>
        <span style={{ width: 10 }} />
        <button className="findbtn" data-btn="rg-add-band" onClick={addBand}
                style={{ background: "#4CAF50", color: "#fff" }}>+ Band</button>
        <button className="findbtn" data-btn="rg-del-band" onClick={delBand}
                style={{ background: "#f44336", color: "#fff" }}>− Band</button>
        <span style={{ flex: 1 }} />
        <button className="findbtn" data-btn="rg-reset" onClick={resetDefault}
                style={{ background: "#6b7280", color: "#fff" }}>Reset to Default</button>
        <button className="findbtn" data-btn="rg-save" onClick={save}
                style={{ background: "#2196F3", color: "#fff" }}>Save</button>
      </div>

      <div className="dfxip-sect">Recommended redundancy for a memory instance</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0 16px" }}>
        <span className="muted">Total physical bits:</span>
        <input className="findinput" style={{ width: 140 }} placeholder="e.g. 96K, 512K, 2M"
               value={lookupBits} onChange={(e) => setLookupBits(e.target.value)} />
        <span className="muted" style={{ flex: 1 }}>
          {lookupBits.trim() === "" ? "—"
            : lookupResult
              ? <>
                  <b>{formatStorageUnits(parseStorageUnits(lookupBits))} bits</b> falls in band{" "}
                  <b>{lookupResult.bandLabel}</b> → recommend{" "}
                  <b style={{ color: "#4CAF50" }}>{lookupResult.dominant}</b>{" "}
                  <span style={{ opacity: 0.7 }}>[mix: {lookupResult.mix}]</span>
                </>
              : "Enter a positive size (e.g. 96K)."}
        </span>
      </div>

      <h3 style={{ color: "#fff", fontSize: 15 }}>3 · Why repair is needed — yield loss mechanisms</h3>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 320px", fontSize: 12, color: "#d4d4d4" }}>
          <p style={{ color: "#c8a0ff" }}><b>Defect driven</b></p>
          <ul>
            <li>Periphery control logic — not likely repairable</li>
            <li>Column support circuits — column or I/O repair feasible</li>
            <li>Row support circuits — Row repair may be feasible</li>
            <li>Array defects — <b>highly repairable</b>
              <ul><li>A good thing and necessary thing considering the extra sensitivity:
                node-node shorts, gate leakage defects, blocked implants or resistive contacts,
                line edge roughness</li></ul>
            </li>
          </ul>
          <p style={{ color: "#c8a0ff" }}><b>Parametric driven</b></p>
          <ul>
            <li>Vmin / Vmax loss sensitive to process (TT 0.75 V, +10% Vmin can be reduced more)</li>
            <li>Intrinsic bitcell stability and write margins (EMA) — device ratios and variability</li>
            <li>SRAM design margin to account for statistical variation</li>
            <li>High Sigma design vs. PPA</li>
            <li>Primarily random single cells → <b>Highly repairable</b></li>
          </ul>
        </div>
        <div style={{ flex: "1 1 240px", textAlign: "center" }}>
          <ProcessWindowFigure />
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            High sigma design required across the process window for acceptable repairable yield
          </div>
        </div>
      </div>

      <h3 style={{ color: "#fff", fontSize: 15 }}>4 · Notes &amp; cautions</h3>
      <p style={{ color: "#c8a0ff", fontStyle: "italic", fontSize: 12 }}>
        ROM memories are excluded from the guidance — they have no redundancy options.
      </p>
      <ul style={{ fontSize: 12, color: "#d4d4d4" }}>
        <li>Using memories with no redundancy should be considered only in limited situations (waiver needed)</li>
        <li>Small configuration sizes should be heavily skewed to column-only redundancy and away from Column + Row</li>
        <li>The table is a conservative recommendation; the mix could be loosened case by case
          depending on other factors (for example, to hit a specific PPA target): redundant
          configurations/blocks, foundry defect density performance, unique design situations,
          total memory bits</li>
      </ul>

      <h3 style={{ color: "#fff", fontSize: 15 }}>5 · Choosing &amp; using a yield model</h3>
      <ul style={{ fontSize: 12, color: "#d4d4d4", marginBottom: 20 }}>
        <li><b>Binomial Model</b> — parameter-driven (D0, complexity, area, α, adjust); <b>needs
          no memory data</b>. Use it early, from process assumptions, to get a yield curve,
          recommended repairs and a fuse-budget estimate.</li>
        <li><b>Foundry Model</b> — works from your actual memory list. Type or paste each
          memory's total bits, set the redundancy-free density &amp; efuse usage rate, then{" "}
          <b>Calculate</b> and <b>Apply</b> to see the per-memory spare scheme and the
          repair-scheme distribution.</li>
      </ul>
      <p className="muted" style={{ fontSize: 11 }}>
        Open either model from the <b>SRAM Yield Model</b> tab. The <b>Help Documentation</b>{" "}
        tab explains every parameter.
      </p>
      <div className="muted" style={{ fontSize: 10, marginTop: 10 }}>
        Current tiers: {tiers.map((t) => `${t.min ? (t.min / 1024).toFixed(0) + "K" : "0"}–${t.max === Infinity ? "∞" : (t.max / 1024).toFixed(0) + "K"} → ${t.repair}`).join("  ·  ")}
      </div>
    </div>
  );
}
