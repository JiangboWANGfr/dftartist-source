// Pad/BScan config table (spec: docs/specs/2026-07-10-pad-bscan-tab-design.md).
// Editable manual columns + filter/pattern selection + bulk bar + inline validation.

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "./store.ts";
import { dftPad } from "../core-bridge/pad.ts";
import { useDesign } from "../store/design.ts";
import { promptText } from "../genconn/promptDialog.tsx";
import {
  filterRows, overlayFromRows, rowIssue, selectByPattern, splitPadOutput, ssnWidths, type PadFilter, type PadRow,
} from "./core/pad.ts";
import { GenPreview } from "../common/genpreview/GenPreview.tsx";
import { useProject, writeToProject } from "../store/project.ts";
import { padFiles } from "../store/outputLayout.ts";

const REUSE_CYCLE: Record<string, "" | "in" | "out"> = { "": "in", in: "out", out: "" };

export function PadTab() {
  const filelist = useDesign((s) => s.filelist);
  const lib = useStore((s) => s.padLib);
  const rows = useStore((s) => s.padRows);
  const warnings = useStore((s) => s.padWarnings);
  const dropped = useStore((s) => s.padDropped);
  const loading = useStore((s) => s.padLoading);
  const error = useStore((s) => s.padError);
  const saveState = useStore((s) => s.padSaveState);
  const patchPadRows = useStore((s) => s.patchPadRows);

  const [level, setLevel] = useState<"chip" | "phy" | "sub">(
    (localStorage.getItem("dft-suite.padLevel") as "chip" | "phy" | "sub") || "chip");
  const [aux, setAux] = useState<"external" | "internal">(
    (localStorage.getItem("dft-suite.padAux") as "external" | "internal") || "external");
  const [genText, setGenText] = useState("");
  const padSplit = splitPadOutput(genText);
  const projOpen = useProject((s) => !!s.path);
  const [genError, setGenError] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [panelH, setPanelH] = useState(() => Number(localStorage.getItem("dft-suite.padPanelH")) || 220);
  const [collapsed, setCollapsed] = useState(true);
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  const panelHRef = useRef(panelH);

  const [filter, setFilter] = useState<PadFilter>({ dir: "", state: "", name: "" });
  const [pattern, setPattern] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkEnable, setBulkEnable] = useState("");
  const [toast, setToast] = useState("");
  const lastClickIdx = useRef(-1);
  useEffect(() => { lastClickIdx.current = -1; }, [filter]);

  const visible = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const visiblePaths = useMemo(() => new Set(visible.map((r) => r.path)), [visible]);
  const selVisible = useMemo(
    () => new Set([...selected].filter((p) => visiblePaths.has(p))),
    [selected, visiblePaths],
  );
  const issues = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      const i = rowIssue(r);
      if (i) m.set(r.path, i);
    }
    return m;
  }, [rows]);
  const ssn = useMemo(() => ssnWidths(rows), [rows]);

  const say = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(""), 2500); };

  const hasIssues = issues.size > 0;
  const doGenerate = async () => {
    setGenBusy(true);
    try {
      const filelist = useDesign.getState().filelist;
      const l = useStore.getState().padLib;
      if (!filelist || !l) return;
      setGenError("");
      try {
        const overlay = overlayFromRows(useStore.getState().padRows);
        const text = await dftPad.gen(filelist, l, overlay, level, level === "chip" ? "" : aux);
        setGenText(text);
        setCollapsed(false);
      } catch (e) {
        setGenError(e instanceof Error ? e.message : String(e));
        setCollapsed(false);
      }
    } finally {
      setGenBusy(false);
    }
  };
  const setLevelPersist = (v: "chip" | "phy" | "sub") => { setLevel(v); localStorage.setItem("dft-suite.padLevel", v); };
  const setAuxPersist = (v: "external" | "internal") => { setAux(v); localStorage.setItem("dft-suite.padAux", v); };
  const onDragStart = (e: React.MouseEvent) => {
    dragRef.current = { y: e.clientY, h: panelH };
    const move = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const h = Math.min(window.innerHeight * 0.8, Math.max(80, dragRef.current.h + (dragRef.current.y - ev.clientY)));
      panelHRef.current = h;
      setPanelH(h);
    };
    const up = () => {
      dragRef.current = null;
      localStorage.setItem("dft-suite.padPanelH", String(panelHRef.current));
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const toggleRow = (idx: number, shift: boolean) => {
    const next = new Set(selected);
    if (shift && lastClickIdx.current >= 0) {
      const [a, b] = [Math.min(lastClickIdx.current, idx), Math.max(lastClickIdx.current, idx)];
      for (let i = a; i <= b && i < visible.length; i++) next.add(visible[i].path);
    } else {
      const p = visible[idx].path;
      if (next.has(p)) next.delete(p); else next.add(p);
      lastClickIdx.current = idx;
    }
    setSelected(next);
  };
  const toggleAllVisible = () => {
    const all = visible.every((r) => selected.has(r.path));
    const next = new Set(selected);
    for (const r of visible) { if (all) next.delete(r.path); else next.add(r.path); }
    setSelected(next);
  };
  const selectPattern = () => {
    const hit = selectByPattern(rows, pattern);
    if (!hit.size) { say(`No match: ${pattern}`); return; }
    setSelected(new Set([...selected, ...hit]));
    say(`Matched ${hit.size} row(s)`);
  };

  // 批量应用: reuse 跳过非 inout 行 (core/pad.ts applyBulk 语义, 通过 store patch 实现)
  const bulkReuse = (v: "" | "in" | "out") => {
    const ok = new Set<string>(), skip: string[] = [];
    for (const r of rows) {
      if (!selVisible.has(r.path)) continue;
      if (r.dir === "inout") ok.add(r.path); else skip.push(r.path);
    }
    if (ok.size) patchPadRows(ok, { reuse: v });
    if (skip.length) say(`Skipped ${skip.length} row(s) (fixed direction)`);
  };
  const bulkBscan = (v: boolean) => patchPadRows(selVisible, { bscanEn: v });
  const bulkFunc = (v: string) => patchPadRows(selVisible, { func: v });
  const applyBulkEnable = () => {
    if (bulkEnable.trim()) patchPadRows(selVisible, { enable: bulkEnable.trim() });
  };

  const pickLib = async () => {
    const p = await dftPad.pickLib();
    if (p) await useStore.getState().setPadLib(p);
  };

  if (!filelist) return <div className="padtab muted">Please open a design first</div>;

  return (
    <div className="padtab" data-tab-kind="pad">
      <div className="pad-toolbar">
        <span className="pad-lib" title={lib ?? undefined}>
          lib: {lib ? lib.split("/").pop() : "(none selected)"}
        </span>
        <button className="pad-btn" onClick={() => void pickLib()}>Select lib…</button>
        <button className="pad-btn" disabled={!lib || loading}
                onClick={() => void useStore.getState().refreshPadTable()}>
          ↻ Reanalyze
        </button>
        {warnings.length > 0 && (
          <span className="pad-warn" title={warnings.join("\n")}>⚠ {warnings.length} warning(s)</span>
        )}
        {dropped.length > 0 && (
          <span className="pad-warn" title={dropped.join("\n")}>cfg dropped {dropped.length} item(s)</span>
        )}
        {toast && <span className="pad-toast">{toast}</span>}
        <span className="pad-save">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}</span>
        <span className="pad-count">{selVisible.size ? `Selected ${selVisible.size} / ` : ""}{visible.length} / {rows.length} pad(s)</span>
      </div>

      <div className="pad-filters">
        <select value={filter.dir} onChange={(e) => setFilter({ ...filter, dir: e.target.value as PadFilter["dir"] })}>
          <option value="">dir: All</option><option value="in">in</option>
          <option value="out">out</option><option value="inout">inout</option>
        </select>
        <select value={filter.state} onChange={(e) => setFilter({ ...filter, state: e.target.value as PadFilter["state"] })}>
          <option value="">State: All</option>
          <option value="no-reuse">No reuse set</option>
          <option value="bscan-y">bscan = y</option>
          <option value="unresolved">gpio unresolved</option>
        </select>
        <input className="pad-name-filter" placeholder="Filter by name…" value={filter.name}
               onChange={(e) => setFilter({ ...filter, name: e.target.value })} />
        <input className="pad-pattern" placeholder="Range/pattern: GPIO_33..64 or EMMC_*" value={pattern}
               onChange={(e) => setPattern(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") selectPattern(); }} />
        <button className="pad-btn" onClick={selectPattern}>Select</button>
        {selected.size > 0 && <button className="pad-btn" onClick={() => setSelected(new Set())}>Clear Selection</button>}
      </div>

      {selVisible.size >= 2 && (
        <div className="pad-bulk">
          <span>Bulk ({selVisible.size} row(s)):</span>
          <span>reuse</span>
          <button className="pad-btn" onClick={() => bulkReuse("in")}>in</button>
          <button className="pad-btn" onClick={() => bulkReuse("out")}>out</button>
          <button className="pad-btn" onClick={() => bulkReuse("")}>Clear</button>
          <span>bscan</span>
          <button className="pad-btn" onClick={() => bulkBscan(true)}>y</button>
          <button className="pad-btn" onClick={() => bulkBscan(false)}>n</button>
          <span>func</span>
          <button className="pad-btn" onClick={() => bulkFunc("ssn")}>ssn</button>
          <button className="pad-btn" onClick={() => bulkFunc("")}>Clear</button>
          <input className="pad-bulk-enable" placeholder="enable signal name" value={bulkEnable}
                 onChange={(e) => setBulkEnable(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") applyBulkEnable(); }} />
          <button className="pad-btn" onClick={applyBulkEnable}>Apply</button>
        </div>
      )}

      {error && <div className="pad-error">Analysis failed: {error}</div>}
      {loading && <div className="padtab muted">Analyzing…</div>}
      {!loading && rows.length > 0 && (
        <div className="pad-table-wrap">
          <table className="pad-table">
            <thead>
              <tr>
                <th className="pad-check">
                  <input type="checkbox"
                         checked={visible.length > 0 && visible.every((r) => selected.has(r.path))}
                         onChange={toggleAllVisible} />
                </th>
                <th>gpio</th><th>pad</th><th>dir</th><th>bscan</th>
                <th>reuse</th><th>func</th><th>enable</th><th>path</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, idx) => (
                <PadRowView key={r.path} r={r} idx={idx}
                            checked={selected.has(r.path)}
                            issue={issues.get(r.path) ?? null}
                            onToggle={toggleRow}
                            onPatch={(patch) => patchPadRows([r.path], patch)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!collapsed && <div className="pad-splitter" onMouseDown={onDragStart} />}
      <div className="pad-panel" style={collapsed ? undefined : { height: panelH }}>
        <div className="pad-panel-bar">
          <select value={level} onChange={(e) => setLevelPersist(e.target.value as "chip" | "phy" | "sub")}>
            <option value="chip">chip</option><option value="phy">phy</option><option value="sub">sub</option>
          </select>
          {level !== "chip" && (
            <select value={aux} onChange={(e) => setAuxPersist(e.target.value as "external" | "internal")}>
              <option value="external">external</option><option value="internal">internal</option>
            </select>
          )}
          {ssn && (ssn.inWidth > 0 || ssn.outWidth > 0) && (
            <span className="pad-ssn">
              ssn: {ssn.inWidth > 0 ? `in[${ssn.inWidth - 1}:0] ` : ""}{ssn.outWidth > 0 ? `out[${ssn.outWidth - 1}:0]` : ""}
            </span>
          )}
          <button className="pad-btn" disabled={hasIssues || loading || genBusy || !rows.length}
                  title={hasIssues ? "Some rows have validation errors, fix them first" : undefined}
                  onClick={() => void doGenerate()}>
            Generate
          </button>
          {genText && <>
            <button className="pad-btn" onClick={() => { void navigator.clipboard.writeText(genText).then(() => say("Copied")).catch(() => say("Copy failed")); }}>Copy</button>
            <button className="pad-btn" onClick={() => void dftPad.exportText("pad_bscan.tcl", genText)}>Export…</button>
            {projOpen && <button className="pad-btn" onClick={() => void writeToProject(padFiles(padSplit.auxiliary, padSplit.bscanOptions))}>Write to Project</button>}
          </>}
          <button className="pad-btn pad-collapse" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? "▲ Expand" : "▼ Collapse"}
          </button>
        </div>
        {!collapsed && (
          genError
            ? <div className="pad-error">Generation failed: {genError}</div>
            : genText
              ? <GenPreview
                  files={[
                    ...(padSplit.auxiliary ? [{ name: "auxiliary.spec", text: padSplit.auxiliary }] : []),
                    ...(padSplit.bscanOptions ? [{ name: "bscan_options.tcl", text: padSplit.bscanOptions }] : []),
                  ]}
                  onCopy={(f) => void navigator.clipboard?.writeText(f.text)}
                />
              : <pre className="pad-gen">(click "Generate")</pre>
        )}
      </div>
    </div>
  );
}

function PadRowView({ r, idx, checked, issue, onToggle, onPatch }: {
  r: PadRow; idx: number; checked: boolean; issue: string | null;
  onToggle: (idx: number, shift: boolean) => void;
  onPatch: (patch: Partial<Pick<PadRow, "bscanEn" | "reuse" | "func" | "enable">>) => void;
}) {
  const [editEnable, setEditEnable] = useState(false);
  const cls = [
    r.gpio === "" ? "pad-unresolved" : "",
    issue ? "pad-issue" : "",
    checked ? "pad-selected" : "",
  ].filter(Boolean).join(" ");
  const rowTitle = issue ?? (r.gpio === "" ? "gpio unresolved (see toolbar warning), excluded from generation" : undefined);
  return (
    <tr className={cls} title={rowTitle}>
      <td className="pad-check">
        <input type="checkbox" checked={checked}
               onClick={(e) => onToggle(idx, (e.nativeEvent as MouseEvent).shiftKey)}
               onChange={() => { /* handled in onClick for shiftKey access */ }} />
      </td>
      <td>{r.gpio || "—"}</td>
      <td>{r.cell}</td>
      <td>{r.dir}</td>
      <td className="pad-edit" onClick={() => onPatch({ bscanEn: !r.bscanEn })}>
        {r.bscanEn ? "y" : "n"}
      </td>
      <td className={r.dir === "inout" ? "pad-edit" : "pad-fixed"}
          onClick={() => { if (r.dir === "inout") onPatch({ reuse: REUSE_CYCLE[r.reuse] }); }}>
        {r.reuse || "-"}
      </td>
      <td className="pad-edit-cell">
        <select value={r.func === "" || r.func === "ssn" ? r.func : "__custom"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__custom") {
                    void promptText("Custom func:", r.func).then((t) => {
                      if (t !== null) onPatch({ func: t.trim() });
                    });
                  } else onPatch({ func: v });
                }}>
          <option value="">-</option>
          <option value="ssn">ssn</option>
          <option value="__custom">{r.func && r.func !== "ssn" ? r.func : "Custom…"}</option>
        </select>
      </td>
      <td className={"pad-edit" + (r.enable !== r.autoEnableNet ? " pad-overridden" : "")}>
        {editEnable ? (
          <input autoFocus defaultValue={r.enable}
                 onBlur={(e) => { setEditEnable(false); const v = e.target.value.trim(); if (v !== r.enable) onPatch({ enable: v }); }}
                 onKeyDown={(e) => {
                   if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                   if (e.key === "Escape") { (e.target as HTMLInputElement).value = r.enable; setEditEnable(false); }
                 }} />
        ) : (
          <>
            <span onClick={() => setEditEnable(true)}
                  title={r.enable !== r.autoEnableNet ? `Overridden (default ${r.autoEnableNet || "none"})` : undefined}>
              {r.enable || "-"}
            </span>
            {r.enable !== r.autoEnableNet && (
              <button className="pad-reset" title="Reset to auto value"
                      onClick={() => onPatch({ enable: r.autoEnableNet })}>↺</button>
            )}
          </>
        )}
      </td>
      <td className="pad-path" title={r.path}>{r.path}</td>
    </tr>
  );
}
