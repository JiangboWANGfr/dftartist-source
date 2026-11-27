// Resolved-clock table + generated Tessent commands — SdcTab's "6 · Clocks & add_clock" section,
// and (with onJumpToClock/occ passed) the Clock Tree's "Generated files" drawer.
//
// Layout: a tab bar picks WHAT the left column lists (the resolved-clock table / the generated
// add_clock+tessent_mapping+YAML text / the recorded OCC points), but the RIGHT column — the
// actual SDC source, centered on whatever was last clicked — is a PERSISTENT sibling across all
// three, not a "Clocks"-tab-only feature: every clickable item anywhere in this panel (a clock
// row, an add_clock line, a tessent_clock_mapping line, an OCC point) is really just a different
// way of naming a clock, and clicking any of them should answer the same question — "where is
// THIS actually defined in the SDC" — without needing to first switch back to the Clocks tab.
// Single click previews on the right; double-click jumps to that clock's definition point on the
// Clock Tree schematic (only offered when the caller passed onJumpToClock).
import { useEffect, useMemo, useRef, useState } from "react";
import type { SdcLintResult, DpOccPoint } from "../../core-bridge/model.ts";
import { useProject, writeToDir, writeToProject } from "../../store/project.ts";
import { clockDefineFile, clockInfoYamlFile, clockMappingFile } from "../../store/outputLayout.ts";
import { dftDesign as hs } from "../../core-bridge/client.ts";

const fmt = (v: number): string => v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");

const th: React.CSSProperties = { background: "#0b5394", color: "#fff", padding: 6, textAlign: "left" };
const td: React.CSSProperties = { border: "1px solid #3c3c3c", padding: 4 };

/** Minimal hand-rolled YAML block emitter — just enough for this file's own shape (strings,
 *  numbers, booleans, flat lists, lists of flat maps). Not a general serializer. */
function yamlStr(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function yamlList(items: string[], indent: string): string {
  return items.length ? items.map((s) => `${indent}- ${yamlStr(s)}`).join("\n") : `${indent}[]`;
}

/** Port of gen_dft.pl's parse_sdc_to_yaml output (%yaml -> DumpFile), rebuilt from the same
 *  resolved-clock data the panel already has instead of re-parsing the SDC. Field names mirror
 *  the Perl dump (`clocks`, `add_clock_cmds`, `add_clock_details`, `tessent_clock_mapping_cmds`,
 *  `tessent_setup_cmds`, `warnings`) — Perl-only bookkeeping this port doesn't track
 *  (`files_parsed`, `missing_sources`, `source_edges`, since `source` isn't followed here the
 *  way gen_dft.pl's own tokenizer does) is left out rather than faked. */
function toClockInfoYaml(data: SdcLintResult, sdcFile: string): string {
  const lines: string[] = [];
  lines.push(`top_file: ${yamlStr(sdcFile)}`);
  lines.push(`warnings:`);
  lines.push(yamlList(data.clockgenWarnings, "  "));
  lines.push(`add_clock_cmds:`);
  lines.push(yamlList(data.addClockCmds.map((c) => c.text), "  "));
  lines.push(`add_clock_details:`);
  if (data.addClockCmds.length === 0) {
    lines.push("  []");
  } else {
    for (const c of data.addClockCmds) {
      lines.push(`  - clock_name: ${yamlStr(c.clockName)}`);
      lines.push(`    object_expr: ${yamlStr(c.objectExpr)}`);
      lines.push(`    label: ${yamlStr(c.label)}`);
      lines.push(`    add_clock_cmd: ${yamlStr(c.text)}`);
      lines.push(`    commented: ${c.commented ? "true" : "false"}`);
      lines.push(`    reason: ${yamlStr(c.reason)}`);
    }
  }
  lines.push(`tessent_clock_mapping_cmds:`);
  lines.push(yamlList(data.tessentMappingCmds, "  "));
  lines.push(`clocks:`);
  if (data.resolvedClocks.length === 0) {
    lines.push("  []");
  } else {
    for (const c of data.resolvedClocks) {
      lines.push(`  - name: ${yamlStr(c.name)}`);
      lines.push(`    generated: ${c.generated ? "true" : "false"}`);
      lines.push(`    period_ns: ${c.period > 0 ? fmt(c.period) : "null"}`);
      lines.push(`    frequency_mhz: ${c.frequencyMhz > 0 ? fmt(c.frequencyMhz) : "null"}`);
      lines.push(`    master_clock: ${yamlStr(c.masterClock)}`);
      lines.push(`    master_inferred: ${c.masterInferred ? "true" : "false"}`);
      lines.push(`    file: ${yamlStr(c.file)}`);
      lines.push(`    line: ${c.line}`);
      lines.push(`    targets:`);
      lines.push(yamlList(c.targets, "      "));
    }
  }
  return lines.join("\n") + "\n";
}

export interface OccPanelProps {
  text: string | null;
  busy: boolean;
  count: number;
  onRefresh: () => void;
  /** Structured points (pin/clock/comment) — the raw `text` alone can't be made clickable. */
  points: DpOccPoint[];
}

/** One clickable line shared by the add_clock / tessent_clock_mapping lists and the OCC point
 *  rows: click previews on the right, double-click jumps to the schematic. `clockName` empty (an
 *  OCC point recorded with no `-clock`, or a commented-out add_clock this port can't attribute)
 *  means neither gesture does anything — it just isn't identifiable as one specific clock. */
function ClickableLine({ text, clockName, selected, dim, onJumpToClock, onSelect }: {
  text: string; clockName: string; selected: boolean; dim?: boolean;
  onJumpToClock?: (name: string) => void; onSelect: (name: string) => void;
}) {
  const live = !!clockName;
  return (
    <div
      style={{
        padding: "1px 8px", whiteSpace: "pre", fontFamily: "monospace", fontSize: 11,
        cursor: live ? "pointer" : undefined,
        background: selected ? "#2d3f52" : undefined,
        color: dim ? "#7a7a7a" : undefined,
      }}
      title={live
        ? `${clockName}${onJumpToClock ? " — click to preview, double-click to show on the schematic" : " — click to preview its SDC definition"}`
        : undefined}
      onClick={() => live && onSelect(clockName)}
      onDoubleClick={() => live && onJumpToClock?.(clockName)}
    >
      {text}
    </div>
  );
}

export function SdcClocksPanel({ data, sdcFile, onJumpToClock, occ }: {
  data: SdcLintResult | null; sdcFile: string;
  /** Double-click a clock (row, add_clock line, mapping line, or OCC point) -> reveal its
   *  definition point on the Clock Tree schematic (expand + select + center + highlight the
   *  whole clock path). Omitted in contexts with no schematic to jump to (SdcTab's standalone
   *  SDC-check workbench). */
  onJumpToClock?: (clockName: string) => void;
  /** OCC definition points — a third tab, only offered when the caller (Clock Tree) has one. */
  occ?: OccPanelProps;
}) {
  const [tab, setTab] = useState<"clocks" | "generated" | "occ">("clocks");
  // "Generated Files" used to stack add_clock / tessent_mapping / YAML in one long scroll — a
  // sub-tab bar per the same convention as the outer tabs, so only one is on screen at a time.
  const [genSubTab, setGenSubTab] = useState<"define" | "mapping" | "yaml">("define");
  const [showCommented, setShowCommented] = useState(true);
  // A live text filter over whichever list is currently showing (findinput is the app's own
  // established search-box convention). Ctrl+F focuses it instead of the browser's own find —
  // there is nothing on this panel a browser-level find could usefully reach anyway, since the
  // clock/OCC tables aren't the SDC file's literal text.
  const [filter, setFilter] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        filterRef.current?.focus();
        filterRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const projOpen = useProject((s) => !!s.path);
  // gen_dft.pl's own parse_sdc_to_yaml output tree (<projectpath>/dft_studio_db/<harden>/
  // compiled/) — when the app was launched with --projectpath/--harden, write there instead of
  // the project-relative fallback, so this lands beside whatever the flow's own gen_dft.pl run
  // already produced (clock_info_from_func_sdc.yaml, dft_clock_define.tcl, dft_clock_mapping.tcl).
  const [compiledDir, setCompiledDir] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const lo = await (window as unknown as {
          dft?: { app?: { launchOptions?(): Promise<{ compiledDir?: string }> } };
        }).dft?.app?.launchOptions?.();
        setCompiledDir(lo?.compiledDir ?? null);
      } catch { /* standalone/dev run without launch args */ }
    })();
  }, []);
  const writeTitle = compiledDir ? `Writes to ${compiledDir}`
    : projOpen ? undefined : "No project open and no harden launch context — click to see what's needed";
  const write = (relName: string, text: string, fallback: { relPath: string; text: string }) => {
    if (compiledDir) void writeToDir(compiledDir, [{ relPath: relName, text }]);
    else void writeToProject([fallback]);
  };

  // The actual SDC text, for the RIGHT column's source preview — real parsing already happened
  // server-side (sdc-core); this is just showing the engineer the exact lines it read.
  const [sdcText, setSdcText] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    setSdcText(null);
    if (!sdcFile.trim()) return;
    void hs.readSource(sdcFile).then((t) => { if (!dead) setSdcText(t); }).catch(() => { if (!dead) setSdcText(null); });
    return () => { dead = true; };
  }, [sdcFile]);
  const [selectedClock, setSelectedClock] = useState<string | null>(null);

  // ALL hooks above this line, unconditionally, every render — React's Rules of Hooks forbid a
  // hook after an early return (the `!data` guard below), since the hook count would then differ
  // between "no data yet" and "data arrived" renders and React throws / desyncs state. Everything
  // that can be conditional lives in these hook BODIES instead (guarded on `data`/`selected`).

  // "Is this clock's target actually in the design?" — the SAME SDC-EMPTY-MATCH check the
  // "5 · Against this design" layer runs, cross-referenced here by (file, line) so a clock's own
  // row states it directly instead of making the engineer go find it in a separate findings list.
  // This is real design-vs-SDC correctness checking, not a stand-in for timing analysis: it says
  // whether the object resolves, nothing about setup/hold/paths.
  const emptyMatchByLine = useMemo(() => {
    const m = new Map<string, string>();
    if (!data) return m;
    for (const f of data.findings)
      if (f.rule === "SDC-EMPTY-MATCH") m.set(`${f.file}:${f.line}`, f.message);
    return m;
  }, [data]);

  const clocks = data?.resolvedClocks ?? [];
  const selected = clocks.find((c) => c.name === selectedClock);
  const sourceView = useMemo(() => {
    if (!sdcText || !selected || !selected.line) return null;
    const lines = sdcText.split("\n");
    const centerLine = selected.line - 1;
    const context = 9;
    const start = Math.max(0, centerLine - context);
    const end = Math.min(lines.length, centerLine + context + 1);
    return { start, lines: lines.slice(start, end), centerIdx: centerLine - start };
  }, [sdcText, selected]);

  if (!data) return <div className="muted pad">pick an SDC file and press Check</div>;
  if (clocks.length === 0) return <div className="muted pad">no clocks in this file</div>;

  const designIssue = (c: SdcLintResult["resolvedClocks"][number]): string | undefined =>
    c.file ? emptyMatchByLine.get(`${c.file}:${c.line}`) : undefined;

  const liveCount = data.addClockCmds.filter((c) => !c.commented).length;
  const commentedCount = data.addClockCmds.length - liveCount;
  const cmds = showCommented ? data.addClockCmds : data.addClockCmds.filter((c) => !c.commented);
  const defineText = data.addClockCmds.map((c) => c.text).join("\n") + "\n";
  const mappingText = data.tessentMappingCmds.join("\n") + (data.tessentMappingCmds.length ? "\n" : "");
  const yamlText = toClockInfoYaml(data, sdcFile);
  // Per-clock mapping lines (not the flat `tessentMappingCmds` list) — this is what makes each
  // line individually attributable to a clock name, the same way `addClockCmds` already is.
  const mappingByClock = clocks.filter((c) => c.tessentClockMappingCmd);

  const jump = (name: string) => onJumpToClock?.(name);

  const q = filter.trim().toLowerCase();
  const matches = (...fields: string[]): boolean => !q || fields.some((f) => f.toLowerCase().includes(q));
  const filteredClocks = clocks.filter((c) => matches(c.name, c.masterClock, c.file));
  const filteredCmds = cmds.filter((c) => matches(c.text, c.clockName));
  const filteredMapping = mappingByClock.filter((c) => matches(c.tessentClockMappingCmd, c.name));
  const filteredOccPoints = (occ?.points ?? []).filter((p) => matches(p.pin, p.clock, p.comment));

  return (
    <div className="drclist" style={{ display: "flex", flexDirection: "column", gap: 0, padding: 0, overflow: "hidden", height: "100%" }}>
      <div className="crseg" style={{ padding: "8px 10px", flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8 }}>
        {/* Ctrl+F jumps here instead of the browser's own find-in-page. */}
        <input ref={filterRef} className="findinput" placeholder="filter (Ctrl+F)" value={filter}
               spellCheck={false} style={{ width: 160 }}
               onChange={(e) => setFilter(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Escape") setFilter(""); }} />
        <button className={"findbtn" + (tab === "clocks" ? " on" : "")} data-on={tab === "clocks" || undefined}
                onClick={() => setTab("clocks")}>Clocks<span style={{ marginLeft: 6, opacity: 0.7 }}>{clocks.length}</span></button>
        <button className={"findbtn" + (tab === "generated" ? " on" : "")} data-on={tab === "generated" || undefined}
                onClick={() => setTab("generated")}>Generated Files</button>
        {occ && (
          <button className={"findbtn" + (tab === "occ" ? " on" : "")} data-on={tab === "occ" || undefined}
                  onClick={() => setTab("occ")}>OCC Points<span style={{ marginLeft: 6, opacity: 0.7 }}>{occ.count}</span></button>
        )}
      </div>

      {/* LEFT (tab-dependent list) + RIGHT (persistent SDC source preview) — every tab shares the
          SAME right column, because every clickable item in ANY of them is really just another
          way of naming a clock, and the answer to "where is it defined" is the same lookup. */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 8, padding: 8 }}>
        <div style={{ flex: "1 1 50%", minWidth: 0, overflow: "auto" }}>
          {tab === "clocks" && (
            <table style={{ borderCollapse: "collapse", width: "100%", background: "#252526",
                            border: "1px solid #3c3c3c", fontSize: 12 }}>
              <thead><tr>
                <th style={th}>Clock</th>
                <th style={th}>Kind</th>
                <th style={{ ...th, textAlign: "right" }}>Period (ns)</th>
                <th style={th}>Master</th>
                <th style={th}>Design</th>
                <th style={th}>Defined at</th>
              </tr></thead>
              <tbody>
                {filteredClocks.length === 0 && (
                  <tr><td colSpan={6} className="muted pad">no clocks match "{filter}"</td></tr>
                )}
                {filteredClocks.map((c, i) => {
                  const issue = designIssue(c);
                  const isSel = c.name === selectedClock;
                  return (
                    <tr key={i}
                        style={{
                          background: isSel ? "#2d3f52" : issue ? "#3a2020" : c.period === 0 ? "#3a2020" : undefined,
                          cursor: "pointer",
                        }}
                        title={[
                          issue ? `⚠ ${issue}` : undefined,
                          onJumpToClock ? "double-click to reveal on the schematic" : undefined,
                        ].filter(Boolean).join("\n") || undefined}
                        onClick={() => setSelectedClock(c.name)}
                        onDoubleClick={() => c.name && jump(c.name)}>
                      <td style={td}>{c.name || "(unnamed)"}</td>
                      <td style={td}>{c.generated ? "generated" : "primary"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{c.period > 0 ? fmt(c.period) : "—"}</td>
                      <td style={td}>
                        {c.masterClock
                          ? <>{c.masterClock}{c.masterInferred && <span className="muted" style={{ marginLeft: 4 }}>(inferred)</span>}</>
                          : "—"}
                      </td>
                      <td style={td}>
                        {issue
                          ? <span style={{ color: "#f85149" }} title={issue}>✗ not in design</span>
                          : data.summary.designAware
                          ? <span style={{ color: "#5be8a0" }}>✓ resolved</span>
                          : <span className="muted">—</span>}
                      </td>
                      <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }} title={c.file}>
                        {c.file ? `${c.file.split(/[\\/]/).pop()}:${c.line}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {tab === "generated" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
              <div className="crseg" style={{ flex: "0 0 auto" }}>
                <button className={"findbtn" + (genSubTab === "define" ? " on" : "")} data-on={genSubTab === "define" || undefined}
                        onClick={() => setGenSubTab("define")}>
                  add_clock<span style={{ marginLeft: 6, opacity: 0.7 }}>{liveCount} live · {commentedCount} commented</span>
                </button>
                <button className={"findbtn" + (genSubTab === "mapping" ? " on" : "")} data-on={genSubTab === "mapping" || undefined}
                        onClick={() => setGenSubTab("mapping")}>
                  tessent_clock_mapping<span style={{ marginLeft: 6, opacity: 0.7 }}>{mappingByClock.length}</span>
                </button>
                <button className={"findbtn" + (genSubTab === "yaml" ? " on" : "")} data-on={genSubTab === "yaml" || undefined}
                        onClick={() => setGenSubTab("yaml")}>YAML</button>
              </div>

              {data.clockgenWarnings.length > 0 && (
                <div className="muted" style={{ fontSize: 11, flex: "0 0 auto" }}>
                  <div className="dfxip-sect">clock-generation warnings<span>{data.clockgenWarnings.length}</span></div>
                  {data.clockgenWarnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              )}

              {genSubTab === "define" && (
                <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                  <label className="muted" style={{ fontSize: 11, display: "block", margin: "0 0 4px" }}>
                    <input type="checkbox" checked={showCommented} onChange={() => setShowCommented((v) => !v)} />
                    {" "}show commented-out lines (PAD / DFT-clock / superseded)
                  </label>
                  <div style={{ background: "#141414", border: "1px solid #333", padding: "4px 0",
                                flex: 1, overflow: "auto" }}>
                    {filteredCmds.length ? filteredCmds.map((c, i) => (
                      <ClickableLine key={i} text={c.text} clockName={c.clockName} dim={c.commented}
                        selected={c.clockName === selectedClock}
                        onJumpToClock={onJumpToClock} onSelect={setSelectedClock} />
                    )) : <div style={{ padding: "1px 8px", fontFamily: "monospace", fontSize: 11 }}>(none)</div>}
                  </div>
                  <button className="findbtn" style={{ marginTop: 6, alignSelf: "flex-start" }} title={writeTitle}
                          onClick={() => write("dft_clock_define.tcl", defineText, clockDefineFile(defineText))}>
                    Write dft_clock_define.tcl
                  </button>
                </div>
              )}

              {genSubTab === "mapping" && (
                <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                  <div style={{ background: "#141414", border: "1px solid #333", padding: "4px 0",
                                flex: 1, overflow: "auto" }}>
                    {filteredMapping.length ? filteredMapping.map((c, i) => (
                      <ClickableLine key={i} text={c.tessentClockMappingCmd} clockName={c.name}
                        selected={c.name === selectedClock}
                        onJumpToClock={onJumpToClock} onSelect={setSelectedClock} />
                    )) : <div style={{ padding: "1px 8px", fontFamily: "monospace", fontSize: 11 }}>(none)</div>}
                  </div>
                  <button className="findbtn" style={{ marginTop: 6, alignSelf: "flex-start" }} title={writeTitle}
                          onClick={() => write("dft_clock_mapping.tcl", mappingText, clockMappingFile(mappingText))}>
                    Write dft_clock_mapping.tcl
                  </button>
                </div>
              )}

              {genSubTab === "yaml" && (
                <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                  <pre style={{ background: "#141414", border: "1px solid #333", padding: 8, fontSize: 11,
                                flex: 1, overflow: "auto", margin: 0 }}>
                    {yamlText}
                  </pre>
                  <button className="findbtn" style={{ marginTop: 6, alignSelf: "flex-start" }} title={writeTitle}
                          onClick={() => write("clock_info_from_func_sdc.yaml", yamlText, clockInfoYamlFile(yamlText))}>
                    Write clock_info_from_func_sdc.yaml
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === "occ" && occ && (
            <div>
              <div className="dfxip-sect">dfx_occ_def_point.tcl (OCC definition points)<span>{occ.count}</span></div>
              {occ.points.length > 0 ? (
                <table style={{ borderCollapse: "collapse", width: "100%", background: "#252526",
                                border: "1px solid #3c3c3c", fontSize: 12, marginTop: 6 }}>
                  <thead><tr>
                    <th style={th}>Pin</th>
                    <th style={th}>Clock</th>
                    <th style={th}>Comment</th>
                  </tr></thead>
                  <tbody>
                    {filteredOccPoints.length === 0 && (
                      <tr><td colSpan={3} className="muted pad">no OCC points match "{filter}"</td></tr>
                    )}
                    {filteredOccPoints.map((p, i) => (
                      <tr key={i}
                          style={{ background: p.clock === selectedClock ? "#2d3f52" : undefined,
                                    cursor: p.clock ? "pointer" : undefined }}
                          title={p.clock
                            ? `${p.clock}${onJumpToClock ? " — click to preview, double-click to show on the schematic" : " — click to preview its SDC definition"}`
                            : "recorded without -clock — can't be tied to a specific SDC clock"}
                          onClick={() => p.clock && setSelectedClock(p.clock)}
                          onDoubleClick={() => p.clock && jump(p.clock)}>
                        <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{p.pin}</td>
                        <td style={td}>{p.clock || <span className="muted">—</span>}</td>
                        <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{p.comment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="muted pad">
                  {occ.busy ? "…" : "no OCC definition points recorded yet — right-click a clock pin -> add_occ_point"}
                </div>
              )}
              <details style={{ marginTop: 8 }}>
                <summary className="muted" style={{ fontSize: 11, cursor: "pointer" }}>raw text (write_occ_def_points format)</summary>
                <pre style={{ background: "#141414", border: "1px solid #333", padding: 8, fontSize: 11,
                              maxHeight: 200, overflow: "auto", margin: "6px 0" }}>
                  {occ.busy ? "…" : (occ.text ?? "")}
                </pre>
              </details>
              <button className="findbtn" style={{ marginTop: 6 }} onClick={occ.onRefresh} disabled={occ.busy}>Refresh</button>
            </div>
          )}
        </div>

        {/* RIGHT: the actual SDC source, centered on the selected clock's own command line —
            "看到它到底在 SDC 里长什么样", not just the resolved numbers — shared by every tab. */}
        <div style={{ flex: "1 1 50%", minWidth: 0, display: "flex", flexDirection: "column",
                      background: "#141414", border: "1px solid #333", overflow: "hidden" }}>
          <div style={{ padding: "4px 8px", borderBottom: "1px solid #333", fontSize: 11, color: "#9aa7b8" }}>
            {selected ? (selected.file ? `${selected.file.split(/[\\/]/).pop()}:${selected.line}` : selected.name)
                      : "click a clock (row, add_clock line, mapping line, or OCC point) to preview its SDC definition"}
          </div>
          <div style={{ flex: 1, overflow: "auto", fontFamily: "monospace", fontSize: 12 }}>
            {!selected && <div className="muted pad">—</div>}
            {selected && !sourceView && (
              <div className="muted pad">
                {selected.file ? "loading source…" : "no source location for this clock"}
              </div>
            )}
            {sourceView && sourceView.lines.map((ln, i) => (
              <div key={i} style={{ display: "flex",
                                     background: i === sourceView.centerIdx ? "#3a3410" : undefined }}>
                <span style={{ width: 44, flex: "0 0 auto", textAlign: "right", paddingRight: 8,
                               color: "#6b7785", userSelect: "none" }}>
                  {sourceView.start + i + 1}
                </span>
                <span style={{ whiteSpace: "pre" }}>{ln}</span>
              </div>
            ))}
          </div>
          {onJumpToClock && selected && (
            <button className="findbtn" style={{ margin: 8, alignSelf: "flex-start" }}
                    onClick={() => jump(selected.name)}>
              Show on schematic →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
