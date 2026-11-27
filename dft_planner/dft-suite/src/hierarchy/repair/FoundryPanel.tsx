// Port of FoundryModelWindow (src/ui/SramRepairAdvisor.cpp:512-915) — works from an actual
// memory list rather than process parameters: type/paste/load memories, set the redundancy-
// free density + efuse usage rate, Calculate, then Apply to see the per-memory spare scheme.
import { useMemo, useRef, useState } from "react";
import {
  applySpareScheme, foundryCalculate, foundryDistribution, formatStorageUnits, parseStorageUnits,
  tiersFromGuideline, type FoundryCalcResult, type RepairTier, type SpareSchemeRow,
} from "../core/repairModel.ts";
import { FuseCalcPanel } from "./FuseCalcPanel.tsx";
import { GroupBox } from "./BinomialPanel.tsx";
import { notify } from "../../common/notify.ts";

interface Row { normalized: string; generateNum: string }
const emptyRows = (n: number): Row[] => Array.from({ length: n }, () => ({ normalized: "", generateNum: "1" }));

/** Lines from a paste/file load: "<size>" or "<size><sep><generateNum>" per line — a header /
 *  non-numeric first token is skipped (port of fillFromLines, SramRepairAdvisor.cpp:611-633). */
function parseLines(text: string): Row[] {
  const rows: Row[] = [];
  for (const line of text.split(/[\r\n]+/)) {
    const toks = line.split(/[\t,; ]+/).filter(Boolean);
    if (toks.length === 0) continue;
    if (parseStorageUnits(toks[0]) <= 0) continue;   // skip header / non-numeric lines
    rows.push({ normalized: toks[0], generateNum: toks[1] ?? "1" });
  }
  return rows;
}

export function FoundryPanel({ memories }: { memories: Array<{ path: string; bits: number }> }) {
  const [rows, setRows] = useState<Row[]>(() => emptyRows(8));
  const [selected, setSelected] = useState<number | null>(null);
  const [redundancy, setRedundancy] = useState("10000");
  const [efuse, setEfuse] = useState("0.5");
  const [calcResult, setCalcResult] = useState<FoundryCalcResult | null>(null);
  const [spareRows, setSpareRows] = useState<SpareSchemeRow[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tiers, setTiers] = useState<RepairTier[]>(() => tiersFromGuideline());
  const refreshStrategy = () => {
    setTiers(tiersFromGuideline());
    notify("Repair strategy refreshed from Table 1");
  };

  const mems = useMemo(() =>
    rows.map((r) => ({ normalized: parseStorageUnits(r.normalized), generateNum: Number(r.generateNum) || 1 }))
        .filter((m) => m.normalized > 0),
    [rows]);

  const setCell = (i: number, key: keyof Row, v: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));
  const addRow = () => setRows((prev) => [...prev, { normalized: "", generateNum: "1" }]);
  const delRow = () => setRows((prev) => {
    const i = selected ?? prev.length - 1;
    return prev.length ? prev.filter((_, idx) => idx !== i) : prev;
  });
  const clear = () => { setRows(emptyRows(8)); setCalcResult(null); setSpareRows(null); };
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      const parsed = parseLines(text);
      setRows([...parsed, ...emptyRows(2)]);
      notify(`Pasted ${parsed.length} memories`);
    } catch { notify("Clipboard read failed — paste is not permitted in this context"); }
  };
  const loadFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseLines(text);
    setRows([...parsed, ...emptyRows(2)]);
    notify(`Loaded ${parsed.length} memories from ${file.name}`);
  };
  const loadFromPlan = () => {
    if (memories.length === 0) { notify("No memories in the current MBIST plan"); return; }
    setRows(memories.map((m) => ({ normalized: String(m.bits), generateNum: "1" })));
    notify(`Loaded ${memories.length} memories from the current MBIST plan`);
  };

  const calculate = () => {
    const rf = parseStorageUnits(redundancy);
    const ef = Number(efuse);
    if (mems.length === 0) { notify("Please enter at least one memory size first"); return; }
    if (rf <= 0 || !Number.isFinite(ef) || ef < 0 || ef > 1) { notify("Invalid parameters for Foundry Model"); return; }
    setCalcResult(foundryCalculate(mems, rf, ef));
    setSpareRows(null);
  };
  const apply = () => {
    const rf = parseStorageUnits(redundancy);
    if (mems.length === 0) { notify("Please enter at least one memory size first"); return; }
    if (rf <= 0) { notify("Redundancy free density must be positive"); return; }
    const t = tiersFromGuideline();
    setTiers(t);
    setSpareRows(applySpareScheme(mems, rf, t));
    notify("Spare scheme applied successfully");
  };

  const distribution = useMemo(() => spareRows ? foundryDistribution(spareRows, tiers) : null, [spareRows, tiers]);

  return (
    <div style={{ display: "flex", gap: 14, padding: 10, overflow: "auto", minHeight: 0, flex: 1 }}>
      <div style={{ flex: 7, minWidth: 0 }}>
        <div className="dfxip-sect">memory list<span>{mems.length} valid</span></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "4px 0 6px" }}>
          <input ref={fileRef} type="file" accept=".csv,.txt,.dat" style={{ display: "none" }}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ""; }} />
          <button className="findbtn" onClick={() => fileRef.current?.click()} style={{ background: "#2196F3", color: "#fff" }}>Load Data…</button>
          <button className="findbtn" onClick={addRow} style={{ background: "#4CAF50", color: "#fff" }}>+ Row</button>
          <button className="findbtn" onClick={delRow} style={{ background: "#f44336", color: "#fff" }}>− Row</button>
          <button className="findbtn" onClick={() => void pasteFromClipboard()} style={{ background: "#607D8B", color: "#fff" }}>Paste</button>
          <button className="findbtn" onClick={clear} style={{ background: "#795548", color: "#fff" }}>Clear</button>
          <button className="findbtn" onClick={loadFromPlan} title="Not in the original tool — a convenience bridge to this MBIST plan's own memories">
            Load current MBIST plan</button>
        </div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
          Load a CSV/TXT (one memory per line), or type/paste directly. 'Normalized' = total bits
          (K/M/G ok, e.g. 96K); 'GenerateNum' = optional count/weight (default 1).
        </div>
        <table style={{ borderCollapse: "collapse", width: "100%", background: "#252526",
                        border: "1px solid #3c3c3c", fontSize: 12 }}>
          <thead><tr>
            <th style={{ background: "#0b5394", color: "#fff", padding: 6 }}>Normalized</th>
            <th style={{ background: "#0b5394", color: "#fff", padding: 6 }}>GenerateNum</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} onClick={() => setSelected(i)}
                  style={{ background: selected === i ? "#264f78" : undefined }}>
                <td style={{ border: "1px solid #3c3c3c", padding: 2 }}>
                  <input className="findinput" style={{ width: "100%" }} value={r.normalized}
                         onChange={(e) => setCell(i, "normalized", e.target.value)} />
                </td>
                <td style={{ border: "1px solid #3c3c3c", padding: 2 }}>
                  <input className="findinput" style={{ width: "100%" }} value={r.generateNum}
                         onChange={(e) => setCell(i, "generateNum", e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {spareRows && (
          <>
            <div className="dfxip-sect" style={{ marginTop: 12 }}>spare scheme<span>sorted by size</span></div>
            <table style={{ borderCollapse: "collapse", width: "100%", background: "#252526",
                            border: "1px solid #3c3c3c", fontSize: 12 }}>
              <thead><tr>
                <th style={{ background: "#0b5394", color: "#fff", padding: 6 }}>Normalized</th>
                <th style={{ background: "#0b5394", color: "#fff", padding: 6 }}>GenerateNum</th>
                <th style={{ background: "#0b5394", color: "#fff", padding: 6 }}>Spare Scheme</th>
              </tr></thead>
              <tbody>
                {spareRows.map((r, i) => (
                  <tr key={i} style={{ background: r.color, color: "#202020" }}>
                    <td style={{ border: "1px solid #3c3c3c", padding: 4 }}>{formatStorageUnits(r.normalized)}</td>
                    <td style={{ border: "1px solid #3c3c3c", padding: 4 }}>{r.generateNum}</td>
                    <td style={{ border: "1px solid #3c3c3c", padding: 4 }}>{r.spareScheme}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div style={{ flex: "0 1 460px", overflowY: "auto" }}>
        <GroupBox title="Foundry Parameters" style={{ marginTop: 0 }}>
          <label className="muted" style={{ display: "block", margin: "3px 0" }}>
            <span style={{ display: "inline-block", width: 152 }}>Redundancy Free Density:</span>
            <input className="findinput" style={{ width: 90 }} value={redundancy}
                   onChange={(e) => setRedundancy(e.target.value)} title="e.g. 10K, 1M, 0.5G" />
          </label>
          <label className="muted" style={{ display: "block", margin: "3px 0" }}>
            <span style={{ display: "inline-block", width: 152 }}>Efuse Usage Rate:</span>
            <input className="findinput" style={{ width: 90 }} value={efuse}
                   onChange={(e) => setEfuse(e.target.value)} />
          </label>
        </GroupBox>
        <div style={{ display: "flex", gap: 6, margin: "10px 0" }}>
          <button className="findbtn" onClick={calculate} style={{ background: "#2196F3", color: "#fff", flex: 1 }}>Calculate</button>
          <button className="findbtn" onClick={refreshStrategy} style={{ background: "#FF9800", color: "#fff", flex: 1 }}>Refresh Strategy</button>
          <button className="findbtn" onClick={apply} style={{ background: "#4CAF50", color: "#fff", flex: 1 }}>Apply</button>
        </div>

        <GroupBox title="Repair Strategy (from Table 1)">
          <div className="muted" style={{ fontSize: 11 }}>
            {tiers.map((t, i) => (
              <div key={i}>Tier {i + 1}: {(t.min / 1024).toFixed(0)}K – {t.max === Infinity ? "∞" : `${(t.max / 1024).toFixed(0)}K`} → <b>{t.repair}</b></div>
            ))}
            <div style={{ marginTop: 4, fontSize: 10 }}>
              Derived from the Redundancy Guideline (Table 1). Edit the table on the Redundancy
              Guideline tab, then Refresh.
            </div>
          </div>
        </GroupBox>

        <GroupBox title="Results">
          <div className="muted" style={{ fontSize: 11 }}>
            {calcResult ? (
              <>
                Redundancy free density: {formatStorageUnits(calcResult.redundancyFree)}<br />
                Total GenerateNum needing spare: {calcResult.needRedundancy}<br />
                Repairs needed: {calcResult.repairs.toFixed(1)}
              </>
            ) : "Results will appear here"}
            {distribution && (
              <div style={{ marginTop: 6 }}>
                <b>Memory repair scheme distribution:</b>
                {distribution.map((d, i) => (
                  <div key={i}>- {d.count} memories ({d.pct.toFixed(1)}%) {d.label}</div>
                ))}
              </div>
            )}
          </div>
        </GroupBox>

        <FuseCalcPanel repairs={calcResult?.repairs ?? 0} />
      </div>
    </div>
  );
}
