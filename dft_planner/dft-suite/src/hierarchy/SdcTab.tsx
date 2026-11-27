// SDC checker workbench: check categories on the LEFT, one row per finding on the RIGHT.
//
// The three layers on the left mirror how an SDC file actually fails, and they are ordered the
// way they have to be fixed: a syntax error swallows everything after it, so there is no point
// reading the command errors until it is gone; and a command error means the constraint was
// never applied, so its design-level meaning is moot.
//
// All the knowledge lives in the daemon (sdc-core) — this file only groups and renders. Adding
// a rule there needs no change here, because the LAYERS map by rule prefix, not by a fixed list.

import { useCallback, useMemo, useState } from "react";
import { useStore } from "./store.ts";
import { dftDesign as hs } from "../core-bridge/client.ts";
import type { SdcFinding, SdcLintResult } from "../core-bridge/model.ts";
import { notify } from "../common/notify.ts";
import { SdcClocksPanel } from "./sdc/SdcClocksPanel.tsx";

interface Layer {
  id: string;
  label: string;
  desc: string;
  /** Rules belong to a layer by prefix, so a new rule in the daemon lands in the right group
   *  without a matching edit here. */
  rules: string[];
}

const LAYERS: Layer[] = [
  {
    id: "syntax",
    label: "1 · Tcl syntax",
    desc: "the file will not even read — brackets, continuations, comments, variables",
    rules: ["SDC-SYNTAX", "SDC-CONT-WS", "SDC-CRLF", "SDC-COMMENT", "SDC-BUS-BRACKET",
            "SDC-VAR-UNDEF", "SDC-EXPR", "SDC-EVAL", "SDC-SOURCE", "SDC-FILE", "SDC-NO-TCL",
            "SDC-INTERNAL"],
  },
  {
    id: "command",
    label: "2 · SDC commands",
    desc: "it reads, but a constraint is malformed and the tool will reject or ignore it",
    rules: ["SDC-CMD-UNKNOWN", "SDC-OPT-UNKNOWN", "SDC-OPT-AMBIGUOUS", "SDC-OPT-MISSING",
            "SDC-OPT-NOVALUE", "SDC-OPT-CONFLICT", "SDC-OPT-REQUIRES", "SDC-VALUE",
            "SDC-ARG-MISSING", "SDC-ARG-EXTRA"],
  },
  {
    id: "dialect",
    label: "3 · Portability",
    desc: "legal for one vendor, rejected by another",
    rules: ["SDC-DIALECT", "SDC-OPT-DIALECT"],
  },
  {
    id: "semantic",
    label: "4 · Constraint meaning",
    desc: "well-formed, but says something contradictory or weaker than intended",
    rules: ["SDC-CLK-VIRTUAL", "SDC-CLK-WAVEFORM", "SDC-CLK-DUTY", "SDC-CLK-REDEFINE",
            "SDC-CLK-UNDEF", "SDC-GENCLK-RATIO", "SDC-IO-NOCLOCK", "SDC-EXC-GLOBAL",
            "SDC-MCP-ONE", "SDC-CLKGRP-ONE", "SDC-NO-CLOCK"],
  },
  {
    id: "design",
    label: "5 · Against this design",
    desc: "the constraint is fine but matches no object in the elaborated netlist",
    rules: ["SDC-EMPTY-MATCH"],
  },
];

const layerOf = (rule: string): string =>
  LAYERS.find((l) => l.rules.includes(rule))?.id ?? "semantic";

const DIALECTS = [
  { id: "generic", label: "SDC standard" },
  { id: "dc",      label: "Synopsys DC/PT" },
  { id: "genus",   label: "Cadence Genus" },
] as const;

const SEV_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2 };

export function SdcTab() {
  const setError = useStore((s) => s.setError);
  const [file, setFile] = useState(
    () => localStorage.getItem("dft-suite.sdcLintFile")
       ?? localStorage.getItem("dft-suite.funcSdc") ?? "");
  // Which vendors the file has to satisfy. Checking more than one is the point: an option only
  // Genus accepts is exactly what breaks the PrimeTime run three weeks later.
  const [dialects, setDialects] = useState<string[]>(() => {
    const s = localStorage.getItem("dft-suite.sdcDialects");
    return s ? s.split(",").filter(Boolean) : ["generic", "dc", "genus"];
  });
  const [design, setDesign] = useState(true);
  const [data, setData] = useState<SdcLintResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [layer, setLayer] = useState("syntax");
  const [sel, setSel] = useState("");

  const toggleDialect = (id: string) =>
    setDialects((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  const run = useCallback(async () => {
    if (!file.trim()) { notify("pick an SDC file first"); return; }
    setBusy(true);
    try {
      const r = await hs.sdcLint({
        sdcFile: file.trim(),
        // No dialect ticked would mean "accept nothing", which is never what the user wants —
        // read it as "no portability opinion" and accept all three.
        dialects: dialects.length ? dialects.join(",") : "all",
        design,
      });
      setData(r);
      localStorage.setItem("dft-suite.sdcLintFile", file.trim());
      localStorage.setItem("dft-suite.sdcDialects", dialects.join(","));
      // Land the user on the first layer that actually has something, so the default view is
      // never an empty table when there are errors one click away.
      const first = LAYERS.find((l) => r.findings.some((f) => layerOf(f.rule) === l.id));
      setLayer(first?.id ?? "syntax");
      notify(`SDC check: ${r.summary.errors} error(s), ${r.summary.warnings} warning(s) over ${r.summary.commands} command(s)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [file, dialects, design, setError]);

  const findings = data?.findings ?? [];
  const byLayer = useMemo(() => {
    const m = new Map<string, SdcFinding[]>();
    for (const l of LAYERS) m.set(l.id, []);
    for (const f of findings) m.get(layerOf(f.rule))?.push(f);
    for (const [, v] of m)
      v.sort((a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) || (a.line - b.line));
    return m;
  }, [findings]);
  const errorsIn = (id: string) =>
    (byLayer.get(id) ?? []).filter((f) => f.severity === "error").length;

  const rows = byLayer.get(layer) ?? [];
  const base = (p: string) => p.split(/[\\/]/).pop() ?? p;

  const summary = data?.summary;
  return (
    <div className="crtab">
      <div className="crhead">
        <span style={{ fontWeight: 600 }}>SDC Check</span>
        <input className="findinput" style={{ width: 340 }} placeholder="SDC / XDC file"
               value={file} spellCheck={false}
               onChange={(e) => setFile(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") void run(); }} />
        <button className="findbtn" title="Pick an SDC/XDC file"
                onClick={() => void (async () => {
                  const p = await window.dft.design.pickSdc();
                  if (p) setFile(p);
                })()}>
          Browse…
        </button>
        <span className="crseg" title="which tools this file has to read into — anything outside the ticked set is reported as a portability problem">
          {DIALECTS.map((d) => (
            <label key={d.id} className="crchk">
              <input type="checkbox" checked={dialects.includes(d.id)}
                     onChange={() => toggleDialect(d.id)} />
              {d.label}
            </label>
          ))}
        </span>
        <label className="crchk"
               title="resolve get_ports/get_pins against the open design — catches constraints that parse but match nothing. Needs a design to be loaded.">
          <input type="checkbox" checked={design} onChange={() => setDesign((v) => !v)} />
          vs design
        </label>
        <button className="findbtn" onClick={() => void run()} disabled={busy}>
          {busy ? "…" : "Check"}
        </button>
        <span className="crstat">
          {summary && (
            <>
              <b className={summary.errors ? "crbad" : ""}>{summary.errors} error(s)</b>
              {" · "}{summary.warnings} warning(s){" · "}
              {summary.commands} command(s), {summary.clocks} clock(s)
              {summary.generatedClocks > 0 ? ` (+${summary.generatedClocks} generated)` : ""}
            </>
          )}
        </span>
      </div>

      {/* The user has to know when a whole layer of checking did NOT run — a clean report from a
          checker that skipped the design layer is not the same claim as a clean report. */}
      {summary && !summary.tclAvailable && (
        <div className="crnote">⚠ this daemon has no embedded Tcl interpreter — nothing was checked</div>
      )}
      {summary && summary.tclAvailable && !summary.designAware && (
        <div className="crnote">
          {summary.designTruncated
            ? "⚠ the design is too large to enumerate — object-existence checks were skipped"
            : design
              ? "⚠ no design open — syntax, command and meaning were checked; object existence was not"
              : "object-existence checks are off — syntax, command and meaning were checked"}
        </div>
      )}

      <div className="drcbody">
        {/* LEFT: the failure layers, in fixing order */}
        <div className="drcrules">
          {LAYERS.map((l) => {
            const all = byLayer.get(l.id) ?? [];
            const errs = errorsIn(l.id);
            return (
              <div key={l.id}
                   className={"drcrule" + (layer === l.id ? " sel" : "") + (errs ? " has" : "")}
                   onClick={() => setLayer(l.id)}>
                <span className="drcid">{l.label}</span>
                <span className="drcdesc">{l.desc}</span>
                <span className={"drccnt" + (errs ? " bad" : "")}>{all.length}</span>
              </div>
            );
          })}
          {/* Not a findings layer — the resolved clock list + generated Tessent commands
              (parse_sdc_to_yaml port). Same parse pass as the layers above, different lens. */}
          <div className={"drcrule" + (layer === "clocks" ? " sel" : "")}
               onClick={() => setLayer("clocks")}>
            <span className="drcid">6 · Clocks &amp; add_clock</span>
            <span className="drcdesc">resolved clock periods/masters, generated Tessent commands</span>
            <span className="drccnt">{data?.resolvedClocks.length ?? 0}</span>
          </div>
        </div>

        {/* RIGHT: findings of the selected layer, grouped by rule — one rule is usually one
            mistake repeated, and fixing it clears the whole group. Except "clocks", which is a
            different kind of view entirely (resolved clocks + generated commands, not findings). */}
        {layer === "clocks" ? (
          <SdcClocksPanel data={data} sdcFile={file} />
        ) : (
        <div className="drclist">
          <div className="drcrow drchd">
            <span className="c-sdcloc">line</span>
            <span className="c-sdcsev">severity</span>
            <span className="c-sdccmd">command</span>
            <span className="c-src">what is wrong</span>
          </div>
          {!data && <div className="muted pad">pick an SDC file and press Check</div>}
          {data && rows.length === 0 && <div className="muted pad">nothing found in this layer</div>}
          {(() => {
            const m = new Map<string, SdcFinding[]>();
            for (const f of rows) {
              const a = m.get(f.rule);
              if (a) a.push(f); else m.set(f.rule, [f]);
            }
            return [...m.entries()].map(([rule, list]) => (
              <div key={rule}>
                <div className="drcgroup" data-row="rule"
                     title="every finding below is the same mistake — one fix usually clears the group">
                  {rule}
                  <span className="muted" style={{ marginLeft: 8 }}>×{list.length}</span>
                  {list[0].hint && <span className="sdchint">{list[0].hint}</span>}
                </div>
                {list.map((f, i) => {
                  const key = `${f.file}:${f.line}:${f.rule}:${i}`;
                  return (
                    <div key={key} className={"drcrow" + (sel === key ? " sel" : "")}
                         title={`${f.file}:${f.line}\n${f.message}${f.hint ? "\n\n" + f.hint : ""}`}
                         onClick={() => setSel(key)}>
                      <span className="c-sdcloc" title={f.file}>
                        {base(f.file)}:{f.line}
                      </span>
                      <span className={"c-sdcsev sev-" + f.severity}>{f.severity}</span>
                      <span className="c-sdccmd">{f.command}</span>
                      <span className="c-src">{f.message}</span>
                    </div>
                  );
                })}
              </div>
            ));
          })()}
        </div>
        )}
      </div>
    </div>
  );
}
