// Scan Planner — the single source of truth for everything design-level about scan: which flops
// belong to which chain family, how many there are, and how many wrapper cells the boundary
// needs.
//
// The EDT nodes on the DFTSpec Planner canvas READ from here and never write back. That one-way
// dependency is the point: three EDT dialogs cannot each hold a different idea of OCC_CHAIN,
// and no spec number is ever typed by hand.
//
// Deliberately NOT here: per-instance EDT coverage. A controller takes what the others have not
// claimed, which the budget engine already models; making the engineer paint the same hierarchy
// a second time to say so was a second, conflicting map of the design to keep in step.
//
// Working style is click-driven: pick a family, then click instances in the tree. Counts update
// on the click because they are computed here from the register counts rather than round-
// tripping to the daemon; the daemon is asked only for what it alone knows — the wrapper-cell
// count and the final chain arithmetic.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useStore } from "./store.ts";
import { useStore as useSpec } from "../genconn/store.ts";
import { leafName } from "./core/regcount.ts";
import { buildWrapperSchematic } from "./core/wrapperSchematic.ts";
import { splitDefId } from "./core/defId.ts";
import { chainGroupOf } from "../specgen/chaingroup.ts";
import { controllerBlock } from "./core/specblock.ts";
import { SchematicTab } from "./schematic/SchematicTab.tsx";
import {
  addFamily, autoClassify, clearFamilyAssignments, coreOf, countFamilies,
  defaultWrapperOptions,
  bitsOf, familyOfInstance, FAMILY_COLORS, globHits, globMatch, isUnder,
  paintFamily, paintMany, removeExclude, removeFamily, removeGlob,
  familiesForEdt, setEdtFamilies, sizingForEdt, setEdtSizing,
  removeInstance, renameFamily, setFamilyColor, setFamilyGlobs, suggestGlob, unassignFamily,
  setFamilyOption, familyTclOptions, FAMILY_TCL_OPTIONS, extraFamiliesForEdt,
  type EdtDefaults, type Family, type ScanPlan,
} from "./core/scanplan.ts";
import { ancestorsOf, initialExpansion, treeRows } from "./core/scanTree.ts";
import { useDesign } from "../store/design.ts";
import { useProject, writeToProject } from "../store/project.ts";
import type { RegCount, ScanBudgetEdtPlan, ScanBudgetResult, WrapperConeNode, WrapperPortCell } from "../core-bridge/model.ts";

type View = "edt" | "spec" | "tcl" | "wrapper" | "eab" | "log";

/** The options the analysis runs with. They used to be invisible: the transcript printed
 *  "input fanout 4, output fanin 4, feedback 4, levels 32" and there was nowhere to change any
 *  of it. Each one is a judgement about the block, so it is editable here and saved with the
 *  project — and the reset button makes "what were the defaults again?" a non-question. */
function WrapperOptions({ onRun, busy }: { onRun: () => void; busy: boolean }) {
  const o = useStore((s) => s.wrapperOptions);
  const set = useStore((s) => s.setWrapperOptions);
  const [open, setOpen] = useState(false);
  const dirty = JSON.stringify(o) !== JSON.stringify(defaultWrapperOptions());

  const num = (k: "inputFanoutFlopThreshold" | "outputFaninFlopThreshold" | "feedbackFlopThreshold" | "levelsThreshold",
               label: string, hint: string) => (
    <label className="sp-opt" title={hint}>
      {label}
      <input type="number" min={1} max={100000} value={o[k]}
             onChange={(e) => set({ [k]: Math.max(1, Number(e.target.value) || 1) })} />
    </label>
  );
  const list = (k: "excludePorts" | "clockPorts" | "forceDedicatedPorts" | "forceSharedPorts",
                label: string, ph: string, hint: string) => (
    <label className="sp-opt wide" title={hint}>
      {label}
      <input type="text" spellCheck={false} placeholder={ph} value={o[k].join(" ")}
             onChange={(e) => set({ [k]: e.target.value.split(/[,\s]+/).filter(Boolean) })} />
    </label>
  );
  const flag = (k: "registerUndrivenOutput" | "registerPortsReachingBlackboxes" | "logEveryPort"
                   | "inferClockPorts" | "skipFeedthroughPorts",
                label: string, hint: string) => (
    <label className="sp-opt check" title={hint}>
      <input type="checkbox" checked={o[k]} onChange={(e) => set({ [k]: e.target.checked })} />
      {label}
    </label>
  );

  return (
    <div className="sp-wopts">
      <div className="sp-colhead">
        <button onClick={() => setOpen(!open)} title="Thresholds and port exclusions for the analysis">
          {open ? "▾" : "▸"} Analysis options
        </button>
        <span className="sp-sub">
          fanout {o.inputFanoutFlopThreshold} · fanin {o.outputFaninFlopThreshold} ·
          {" "}feedback {o.feedbackFlopThreshold} · levels {o.levelsThreshold}
          {o.excludePorts.length ? ` · ${o.excludePorts.length} excluded` : ""}
        </span>
        <span style={{ flex: 1 }} />
        {dirty && <button title="Back to the tool's own defaults"
                          onClick={() => set(defaultWrapperOptions())}>reset</button>}
        <button disabled={busy} onClick={onRun}>{busy ? "Analyzing…" : "Run"}</button>
      </div>
      {open && (
        <div className="sp-optgrid">
          {num("inputFanoutFlopThreshold", "input fanout",
               "An input driving more flops than this gets its own dedicated cell instead of sharing one.")}
          {num("outputFaninFlopThreshold", "output fanin",
               "An output fed by more flops than this gets its own dedicated cell.")}
          {num("feedbackFlopThreshold", "feedback",
               "Ceiling on internal-feedback cells — flops that feed back into the same cone.")}
          {num("levelsThreshold", "levels",
               "How many levels of logic the cone walk crosses before it stops looking for a shareable flop. Raise it for deeply combinational boundaries.")}
          {flag("registerUndrivenOutput", "register undriven outputs",
                "An output with no driver still needs a cell to hold a safe value during EXTEST.")}
          {flag("registerPortsReachingBlackboxes", "register ports reaching blackboxes",
                "Ports whose cone ends in a memory, analog block or encrypted IP. Off by default: they normally get no cell.")}
          {flag("logEveryPort", "log every port",
                "One transcript line per port bit. Large boundaries make this a big log, which is why it is opt-in.")}
          {flag("inferClockPorts", "infer clocks",
                "Treat a port that reaches a flop's clock pin as a clock. It cannot see a clock that only feeds a synchroniser's data pin — name those below.")}
          {flag("skipFeedthroughPorts", "skip feedthroughs",
                "A port running straight from a core input to a core output with no flop between them gets no cell: it would sit in the middle of a pass-through path.")}
          {list("excludePorts", "exclude ports", "scan_enable scan_mode test_mode",
                "Globs that never get a wrapper cell — DFT signals only you know about.")}
          {list("clockPorts", "clock ports", "*clk* *clock*",
                "Clocks. A wrapper cell here would put a flop in the clock path, so these never get one — this beats every other setting, including force dedicated.")}
          {list("forceDedicatedPorts", "force dedicated", "",
                "Always add a dedicated cell on these, whatever the analysis concludes. Tessent's set_dedicated_wrapper_cell_options on.")}
          {list("forceSharedPorts", "force shared", "",
                "Share on these even when the fanout, fanin or depth thresholds say dedicated. Tessent's set_dedicated_wrapper_cell_options off. It cannot invent a flop: with none in the cone it falls back to dedicated and says so.")}
        </div>
      )}
    </div>
  );
}

/** The cone, drawn by the SAME canvas as every other schematic in the app: ELK lays it out,
 *  Konva draws the gate and DFF symbols, containers are the real instance hierarchy, and zoom /
 *  pan / Show HDL / the object bar all work because none of it is re-implemented here.
 *
 *  The first version of this view hand-rolled its own SVG and drew every node as an identical
 *  rounded box. Building a SchematicGraph instead is what crSchematic.ts already does for the
 *  clock/reset walk — one set of symbol conventions for the whole tool, not two. */
function WrapperConeView() {
  const cone = useStore((s) => s.wrapperCone);
  const busy = useStore((s) => s.wrapperConeBusy);
  const err = useStore((s) => s.wrapperConeError);
  const close = useStore((s) => s.closeWrapperCone);
  const putSchematic = useStore((s) => s.putSchematic);
  // ONE SEED PER PORT BIT. The canvas caches box positions, zoom and pan per seedNodeId
  // (prevPosBySeed / viewBySeed), so a shared constant meant the second cone you opened
  // inherited the first one's stage transform — its own layout sat outside the viewport and
  // the modal came up blank. Distinct seeds also mean reopening a port keeps the zoom you set.
  const seed = cone ? `wrapsch:${cone.core}:${cone.name}` : "wrapsch:";

  useEffect(() => {
    if (!cone || !cone.nodes.length) return;
    const insts = useStore.getState().instances;
    putSchematic(buildWrapperSchematic(cone, {
      core: cone.core, seedId: seed,
      moduleNameOf: (id) => {
        const d = insts[id]?.definitionId;
        return d ? splitDefId(d).designName : undefined;
      },
    }));
  }, [cone, putSchematic]);

  if (!busy && !err && !cone) return null;
  const levels = cone && cone.nodes.length
    ? Math.max(...cone.nodes.map((n) => n.level)) : 0;

  return (
    <div className="sp-modal" onClick={close}>
      <div className="sp-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="sp-colhead">
          <b>{cone ? cone.name : "…"}</b>
          {cone && (
            <span className="sp-sub">
              {cone.dir === "in" ? "input" : "output"} · {cone.decision}
              {cone.cell ? <> on <b style={{ color: "#98c379" }}>{cone.cell}</b></> : null}
              {cone.reason ? ` · ${cone.reason}` : ""} · {cone.nodes.length} nodes over {levels} level(s)
            </span>
          )}
          <span style={{ flex: 1 }} />
          <button onClick={close}>✕</button>
        </div>

        {busy && <div className="sp-sub" style={{ padding: 14 }}>Tracing the cone…</div>}
        {err && <div className="sp-err">Failed — {err}</div>}
        {cone && cone.nodes.length === 0 && (
          <div className="sp-sub" style={{ padding: 14 }}>
            Nothing to draw: the walk left this port immediately{cone.reason ? ` (${cone.reason})` : ""}.
          </div>
        )}

        {cone && cone.nodes.length > 0 && (
          <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
            <SchematicTab seedNodeId={seed} curated allowOcc={false} />
          </div>
        )}

        {cone && cone.truncated && (
          <div className="sp-sub" style={{ padding: "4px 9px" }}>
            The cone is larger than this view shows — the columns nearest the port are kept.
          </div>
        )}
      </div>
    </div>
  );
}

/** Why ONE port bit got the decision it got. The table can only ever show the conclusion; this
 *  is the working — the cone's depth, every flop it reached, and how close the port came to each
 *  threshold. Each candidate opens the schematic at that flop, so "why is p1_din[0] shared on
 *  data_sync[0]" ends at the actual circuit rather than at a string in a table. */
function PortDetail({ c, thresholds, open, onToggle, onClose }: {
  c: WrapperPortCell;
  thresholds: { fanout: number; fanin: number; feedback: number; levels: number };
  open: boolean; onToggle: () => void; onClose: () => void;
}) {
  const openSchematic = useStore((s) => s.openSchematic);
  const openCone = useStore((s) => s.openWrapperCone);
  const isIn = c.dir === "in";
  const limit = isIn ? thresholds.fanout : thresholds.fanin;
  const direct = c.flops - c.flopsFeedback;

  // The same sentence the engine's decision came from, in prose. A reason code is a label; this
  // says which number crossed which line.
  const why =
    c.decision === "shared"
      ? `${c.flops} flop(s) in the ${isIn ? "fanout" : "fanin"} — under the limit of ${limit}, so an existing flop is reused and no scan cell is added.`
      : c.reason === "max identified cells"
        ? `${c.flops} flop(s) in the ${isIn ? "fanout" : "fanin"} exceeds the limit of ${limit}: sharing would need one cell to control all of them, so a dedicated cell is added.`
        : c.reason === "max identified cells (fanout + feedback)"
          ? `${c.flopsFeedback} of the ${c.flops} flop(s) sit on a sequential loop, over the feedback limit of ${thresholds.feedback}. One wrapper cell cannot place a looping flop in a single shift.`
          : c.reason === "cone depth limit"
            ? `The cone ran past ${thresholds.levels} levels of logic without settling, so no flop was trusted as shareable.`
            : c.reason === "feedthrough"
              ? "Input wired straight through to an output with no flop between them. A cell here would sit in the middle of a pass-through path, and both of its ends are already controlled and observed from the boundary either side."
              : c.reason.startsWith("clock")
                ? "A clock. A wrapper cell here would put a flop in the clock path."
                : c.reason || "—";

  const row = (k: string, v: ReactNode) => (
    <tr><td className="k">{k}</td><td>{v}</td></tr>
  );

  return (
    <div className={"sp-detail" + (open ? "" : " shut")}>
      <div className="sp-colhead">
        <button className="sp-caret" onClick={onToggle}
                title={open ? "Collapse this panel" : "Expand this panel"}>{open ? "▾" : "▸"}</button>
        <b>{c.name}</b>
        <span className="sp-sub">{isIn ? "input" : "output"} · {c.decision}
          {c.reason ? ` · ${c.reason}` : ""}</span>
        <span style={{ flex: 1 }} />
        {/* Collapsed, the circuit stays one click away: it is why most people open this panel
            at all, so hiding the rest must not bury it. */}
        <button onClick={() => void openCone(c.port, c.bit)}>Show the circuit</button>
        <button className="sp-x" onClick={onClose} title="Hide this panel">✕</button>
      </div>
      {open && <div className="sp-scroll" style={{ padding: "6px 9px" }}>
        <p style={{ margin: "0 0 8px" }}>{why}</p>
        <table className="sp-kv">
          <tbody>
            {row("cone depth", `${c.levels} level(s) of logic  (limit ${thresholds.levels})`)}
            {row("flops reached", `${c.flops}  (limit ${limit})`)}
            {c.flopsFeedback > 0 &&
              row("on a loop", `${c.flopsFeedback} of them  (limit ${thresholds.feedback})`)}
            {direct > 0 && row("direct", String(direct))}
            {c.cell && row("wrapper cell", <code>{c.cell}</code>)}
            {c.clock && row("clock", <code>{c.clock}</code>)}
          </tbody>
        </table>

        {c.candidates.length > 0 && (
          <>
            <div className="sp-sect">
              candidate flops<span>{c.candidates.length}{c.flops > c.candidates.length ? ` of ${c.flops}` : ""}</span>
            </div>
            <div className="sp-cands">
              {c.candidates.map((f) => (
                <button key={f.label} className={f.label === c.cell ? "on" : ""}
                        title={`${f.instance}\nOpen the schematic here`}
                        onClick={() => void openSchematic(f.instance, { newTab: true })}>
                  {f.label}{f.label === c.cell ? "  ← chosen" : ""}
                </button>
              ))}
            </div>
            {c.flops > c.candidates.length && (
              <div className="sp-sub">
                showing the first {c.candidates.length}; the cone reached {c.flops}
              </div>
            )}
          </>
        )}
        {c.candidates.length === 0 && (
          <div className="sp-sub">
            The cone reached no flop, so there is nothing to open. {c.reason ? `(${c.reason})` : ""}
          </div>
        )}
      </div>}
    </div>
  );
}

/** The wrapper analysis, in the shape `analyze_wrapper_cells` prints it — the run's own summary
 *  plus the per-port decisions that `report_wrapper_cells` gives. Without this the page's only
 *  feedback was a cell count on a button, which says nothing about WHY a port got what it got. */
function WrapperReport({ onRun }: { onRun: () => void }) {
  const r = useStore((s) => s.wrapperCells);
  const busy = useStore((s) => s.wrapperBusy);
  const err = useStore((s) => s.wrapperError);
  const projOpen = useProject((s) => !!s.path);
  const [only, setOnly] = useState<"all" | "shared" | "dedicated" | "none">("all");
  const [q, setQ] = useState("");
  /** The port bit whose working is on screen. */
  const [sel, setSel] = useState<string | null>(null);
  /** Kept OUTSIDE the panel so collapsing it once stays collapsed for the next row clicked —
   *  the panel is tall, and re-collapsing it on every row would be the annoying half of this. */
  const [detailOpen, setDetailOpen] = useState(true);
  const opts2 = useStore((s) => s.wrapperOptions);
  const openCone = useStore((s) => s.openWrapperCone);
  // ABOVE the early returns: React counts hooks per render, and one placed after a conditional
  // return changes that count the moment data arrives.
  const prev = useStore((s) => s.wrapperPrevCells);
  const ranAt = useStore((s) => s.wrapperAt);

  const opts = <WrapperOptions onRun={onRun} busy={busy} />;
  if (busy) return <>{opts}<pre className="sp-pre">Analyzing the boundary…</pre></>;
  if (err) return <>{opts}<pre className="sp-pre" style={{ color: "#e06c75" }}>Failed: {err}</pre></>;
  if (!r) return <>{opts}<pre className="sp-pre">Set the options above, then Run.</pre></>;

  const by = (dir: "in" | "out", pred: (c: WrapperPortCell) => boolean) =>
    r.cells.filter((c) => c.dir === dir && pred(c)).length;
  const excl = (dir: "in" | "out") => by(dir, (c) => c.reason === "excluded");
  // "Ignored" in the tool's own wording: recognised as something that takes no cell — a clock,
  // a reset, a dead or blocked port — as opposed to a port the user excluded by name.
  const ign = (dir: "in" | "out") => by(dir, (c) => c.decision === "none" && c.reason !== "excluded");
  const line = (dir: "in" | "out", total: number) =>
    `${dir === "in" ? "Input" : "Output"} ports:`.padEnd(16) +
    `${total} total,`.padStart(12) + `${ign(dir)} ignored,`.padStart(14) +
    `${excl(dir)} excluded,`.padStart(15) +
    `${by(dir, (c) => c.decision !== "none")} auto`.padStart(12);

  // ---- is the threshold doing anything? -----------------------------------------------------
  // Moving a limit and seeing the total not budge is indistinguishable from the run not having
  // happened. On this design the input cones are almost all single synchroniser flops, so any
  // limit from 2 to 33 gives the identical answer — which is worth SAYING, because otherwise the
  // only conclusion available is "the setting is broken".
  const sensitivity = (dir: "in" | "out", limit: number, label: string) => {
    const cones = r.cells.filter((c) => c.dir === dir && c.flops > 0);
    if (!cones.length) return `      ${label} ${limit}: no port on this side has a flop in its cone.`;
    const over = cones.filter((c) => c.flops > limit).sort((a, b) => a.flops - b.flops);
    const under = cones.filter((c) => c.flops <= limit).sort((a, b) => b.flops - a.flops);
    const lo = under.length ? under[0].flops : 0;            // lowering to below this changes things
    const hi = over.length ? over[0].flops : Infinity;       // raising to this or above changes things
    const band = hi === Infinity ? `${lo} and up` : `${lo}..${hi - 1}`;
    const head =
      `      ${label} ${limit}: ${over.length} of ${cones.length} port(s) over the limit` +
      (over.length ? ` (${over[0].name} has ${over[0].flops}${over.length > 1 ? ", …" : ""})` : "");
    const move =
      over.length === 0
        ? `        nothing is over it. The largest cone is ${lo} flop(s), so any limit of ${lo} or more gives this same answer.`
        : `        any limit in ${band} gives this same answer. Raise it to ${hi} to make ` +
          `${over[0].name} shared; drop it below ${lo} to start converting the other ${under.length}.`;
    return head + "\n" + move;
  };

  const deepest = r.cells.reduce((m, c) => Math.max(m, c.levels), 0);
  const total = r.wrapperIn + r.wrapperOut;

  const summary = [
    "Port information and user constraints:",
    "--------------------------------------",
    line("in", r.inputBits),
    line("out", r.outputBits),
    "",
    "Wrapper analysis summary:",
    "   -------------------------",
    `      ${r.dedicatedOut} output port(s) required a dedicated wrapper cell.`,
    `      ${r.dedicatedIn} input port(s) required a dedicated wrapper cell.`,
    `      ${r.sharedOut} flip-flop(s) were converted into output shared wrapper cells.`,
    `      ${r.sharedIn} flip-flop(s) were converted into input shared wrapper cells.`,
    "",
    `   wrapper cells: ${r.wrapperCells}  (in ${r.wrapperIn}, out ${r.wrapperOut})`,
    `   new scan cells added: ${r.addedScanCells}   (shared cells are already flops)`,
    `   analysis: ${r.analysisMs} ms, ${r.coneNodes} net bits visited`,
    // A result restored from the project must never be mistaken for one that just ran against
    // the current RTL — the design may have moved on since.
    ranAt ? `   analysed: ${new Date(ranAt).toLocaleString()}` : "",
    prev === null || prev === total ? "" : `   change since the last run: ${prev} -> ${total}`,
    prev !== null && prev === total
      ? "   same total as the last run — the settings you changed are not binding on this design"
      : "",
    "",
    "Threshold sensitivity:",
    "   -------------------------",
    sensitivity("in", opts2.inputFanoutFlopThreshold, "input fanout "),
    sensitivity("out", opts2.outputFaninFlopThreshold, "output fanin "),
    `      levels ${opts2.levelsThreshold}: the deepest cone reached ${deepest} level(s)` +
      (deepest < opts2.levelsThreshold
        ? " — the limit is never approached, so changing it does nothing."
        : " — at the limit, so raising it may find more."),
    "   Counts are measured AT the current limit: a cone that hit it may really be larger.",
  ].filter((l) => l !== "").join("\n");

  const rows = r.cells.filter((c) =>
    (only === "all" || c.decision === only) &&
    (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) ||
                  c.cell.toLowerCase().includes(q.trim().toLowerCase())));

  const reportText = () => {
    const w = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
    return summary + "\n\n" +
      w("Boundary port bit", 24) + w("Dir", 5) + w("Decision", 11) +
      w("Cells(direct/fb)", 18) + w("Wrapper cell", 38) + w("Clock", 14) + "Reason\n" +
      "-".repeat(130) + "\n" +
      r.cells.map((c) =>
        w(c.name, 24) + w(c.dir === "in" ? "I" : "O", 5) + w(c.decision, 11) +
        w(c.flops ? `${c.flops - c.flopsFeedback}/${c.flopsFeedback}` : "-", 18) +
        w(c.cell || "--", 38) + w(c.clock || "--", 14) + (c.reason || "--")).join("\n") + "\n";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      {opts}
      <pre className="sp-pre" style={{ flex: "0 0 auto", maxHeight: "42%" }}>{summary}</pre>
      <div className="sp-colhead">
        <input type="text" placeholder="Filter ports / cells…" value={q} style={{ width: 150 }}
               onChange={(e) => setQ(e.target.value)} />
        <select value={only} onChange={(e) => setOnly(e.target.value as typeof only)}>
          <option value="all">all</option><option value="shared">shared</option>
          <option value="dedicated">dedicated</option><option value="none">no cell</option>
        </select>
        <span style={{ flex: 1 }} />
        {projOpen && (
          <button onClick={() => void writeToProject([
            { relPath: `Spec/scan/${r.core}.wrapper_cells.rpt`, text: reportText() },
          ])}>Export report</button>
        )}
      </div>
      <div className="sp-scroll" style={{ flex: 1 }}>
        <table className="sp-tree sp-click">
          {/* The old "Cells" column was `direct/feedback`, which printed 0/1 for a port whose
              single shareable flop happens to sit on a loop — reading as "no cells" when the
              answer is one. It is the size of the CONE, not a cell count: named as such, total
              first, with the loop split only when there is one. */}
          <thead><tr><th>Port bit</th><th>Dir</th><th>Decision</th>
                     <th className="num" title="flops the cone reached (how many sit on a sequential loop in brackets)">Flops</th>
                     <th className="num" title="deepest level of logic the cone reached; 0 = the flop sits straight on the port">Lvl</th>
                     <th>Wrapper cell</th><th>Clock</th><th>Reason</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.name} className={sel === c.name ? "on" : ""}
                  title="Show the analysis behind this decision"
                  onClick={() => setSel(sel === c.name ? null : c.name)}
                  onDoubleClick={() => void openCone(c.port, c.bit)}>
                <td>{c.name}</td>
                <td>{c.dir === "in" ? "I" : "O"}</td>
                <td style={{ color: c.decision === "shared" ? "#98c379"
                           : c.decision === "dedicated" ? "#d29a22" : "var(--text-faint)" }}>
                  {c.decision}
                </td>
                <td className="num"
                    title={c.flops
                      ? `${c.flops} flop(s) in the cone` +
                        (c.flopsFeedback ? `, ${c.flopsFeedback} of them on a sequential loop` : "")
                      : "the cone reached no flop"}>
                  {c.flops || ""}{c.flopsFeedback ? ` (${c.flopsFeedback})` : ""}
                </td>
                {/* level 0 is a fact — the flop sits straight on the port — not a missing value */}
                <td className="num">{c.decision === "none" && !c.flops ? "" : c.levels}</td>
                {/* A dedicated cell does not exist yet, so there is no path to print. Saying so
                    beats an empty cell that reads as missing data. */}
                <td title={c.cell || (c.decision === "dedicated" ? "a NEW scan cell is added at this port" : "")}
                    style={c.decision === "dedicated" ? { color: "#d29a22" } : undefined}>
                  {c.cell || (c.decision === "dedicated" ? "+ new scan cell" : "")}
                </td>
                <td style={{ color: "var(--text-dim)" }} title="the clock the shared flop shifts on">{c.clock}</td>
                <td style={{ color: "var(--text-dim)" }}>{c.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <WrapperConeView />
      {(() => {
        const c = r.cells.find((x) => x.name === sel);
        return c ? <PortDetail c={c} open={detailOpen}
          onToggle={() => setDetailOpen((o) => !o)} onClose={() => setSel(null)}
          thresholds={{
            fanout: opts2.inputFanoutFlopThreshold, fanin: opts2.outputFaninFlopThreshold,
            feedback: opts2.feedbackFlopThreshold, levels: opts2.levelsThreshold,
          }} /> : null;
      })()}
    </div>
  );
}

/** The EDT configuration, one controller at a time, with the arithmetic that produced it stated
 *  above the block — the shape the flow's own Run Analysis uses.
 *
 *  The whole-file view is still a tab away, but a spec is reviewed per controller: "why is
 *  scan_chain_count 4" is a question about ONE controller, and answering it needs the target
 *  length, the cell total and the two divisions, not a scroll through the other controllers. */
function EdtConfigView({ budget, defaults, plan, groups }: {
  budget: ScanBudgetResult;
  defaults: { int: EdtDefaults; ext: EdtDefaults };
  plan: ScanPlan;
  /** EDT instanceName -> the ScanHost chain group it joins, read off the canvas. */
  groups: Map<string, string>;
}) {
  const [sel, setSel] = useState(0);
  if (!budget.edts.length)
    return <div className="sp-sub" style={{ padding: 14 }}>No controllers in this budget.</div>;

  const b = budget.edts[Math.min(sel, budget.edts.length - 1)];
  const d = sizingForEdt(plan, defaults, b.name, b.external);
  const mode = b.external ? "ext_edt_mode" : "int_edt_mode";
  const block = controllerBlock(budget.edtSpec, b.name);
  const perCh = d.chainsPerChannel || 150;
  const group = groups.get(b.name) ?? b.name;
  const mates = [...groups.entries()].filter(([, g]) => g === group).map(([n]) => n);

  const parts = [
    ["core", b.cellsCore], ["occ", b.cellsOcc],
    ["hyper", b.cellsHyper], ["wrapper", b.cellsWrapper],
  ].filter(([, n]) => (n as number) > 0);

  return (
    <div className="sp-edtcfg">
      {budget.edts.length > 1 && (
        <div className="sp-colhead">
          <span className="sp-seg">
            {budget.edts.map((e, i) => (
              <button key={e.name} className={i === sel ? "on" : ""} onClick={() => setSel(i)}>
                {e.name} <i>{e.external ? "ext_edt_mode" : "int_edt_mode"}</i>
              </button>
            ))}
          </span>
        </div>
      )}

      <div className="sp-scroll" style={{ padding: "10px 12px" }}>
        <div className="sp-derive">
          <div className="lbl">Derived EDT config — {b.name} ({mode})</div>
          <table className="sp-kv">
            <tbody>
              <tr>
                <td className="k">families</td>
                <td>{familiesForEdt(plan, defaults, b.name, b.external).join(" + ") || "none"}</td>
              </tr>
              <tr>
                <td className="k">scan cells</td>
                <td><b>{b.cells}</b>
                  {parts.length > 1 &&
                    <span className="sp-sub"> = {parts.map(([k, n]) => `${k} ${n}`).join(" + ")}</span>}
                </td>
              </tr>
              <tr>
                <td className="k">longest_chain_range</td>
                <td>target {d.targetChainLength} ±10% →{" "}
                  <b>{b.longestMin}, {b.longestMax}</b></td>
              </tr>
              <tr>
                <td className="k">scan_chain_count</td>
                <td>ceil({b.cells} / {b.longestMax}) = <b>{b.chainCount}</b>
                  <span className="sp-sub"> · achieved length {b.achievedLength}</span></td>
              </tr>
              <tr>
                <td className="k">input_channel_count</td>
                <td>ceil({b.chainCount} / {perCh}) = <b>{b.channels}</b>
                  <span className="sp-sub"> · compression {b.compression}×</span></td>
              </tr>
              {/* A chain group can carry several controllers — the ScanHost is then sized for
                  all of them. The name comes from the canvas (this controller's own
                  ssh_chain_group, else its instance name); type the same name on two
                  controllers and they share one group. */}
              <tr>
                <td className="k">ssh_chain_group</td>
                <td><b>{group}</b>
                  <span className="sp-sub">
                    {" · "}{mates.length > 1
                      ? `shared by ${mates.join(" + ")} — the ScanHost carries all of them`
                      : "this controller only"}
                  </span></td>
              </tr>
            </tbody>
          </table>
          <p className="sp-sub" style={{ margin: "8px 0 0" }}>
            The chain count divides by the range MAX, not by the target — that is what keeps the
            achieved length ({b.achievedLength}) inside the range it writes.
          </p>
        </div>

        {b.warnings.map((w) => <div key={w} className="sp-warnline">{w}</div>)}

        <div className="sp-sect">Controller block<span>as generated</span></div>
        <pre className="sp-block">{block || "(not in the generated spec)"}</pre>
      </div>
    </div>
  );
}

/** EDT-Aborted risk, per controller. The advice comes from the budget engine, which applies the
 *  OCC sub-chain stitching thresholds to the families as actually cut. */
function EabReport() {
  const budget = useStore((s) => s.scanBudget);
  if (!budget) return <pre className="sp-pre">Compute the budget to see the EAB assessment.</pre>;
  return (
    <div className="sp-scroll" style={{ padding: 8 }}>
      {budget.edts.map((b) => (
        <div key={b.name} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>
            {b.name} <span style={{ color: "var(--text-dim)" }}>
              {b.chainCount} × {b.achievedLength} · OCC {b.cellsOcc} ({b.occChainRatio}% of a chain)
            </span>
          </div>
          {(b.eabAdvice.length ? b.eabAdvice : ["No EAB concern flagged."]).map((a) => (
            <div key={a} style={{ marginTop: 4, fontSize: "var(--fs-sm)",
                                  color: a.startsWith("EAB risk") ? "#e06c75"
                                       : a.startsWith("EAB watch") ? "#d29a22" : "var(--text-dim)" }}>
              {a}
            </div>
          ))}
        </div>
      ))}
      <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-faint)", marginTop: 8 }}>
        Thresholds are the TestKompress OCC sub-chain stitching rules: OCC bits under 25% of a
        chain sit comfortably in one compressed chain; at 75% or more than one chain, an
        uncompressed chain is the safer cut (2 extra chip pins per core) — confirm with ATPG
        first, compressed chains are preferred when they work.
      </div>
    </div>
  );
}

/** The transcript of the last run of each engine. A number with no visible derivation is a
 *  number an engineer has to take on faith; this is where "why 337?" gets answered, and it is
 *  also the file to attach when a decision looks wrong. */
function RunLog() {
  const wrapper = useStore((s) => s.wrapperCells);
  const budget = useStore((s) => s.scanBudget);
  const projOpen = useProject((s) => !!s.path);
  const [which, setWhich] = useState<"wrapper" | "budget">("wrapper");

  const lines = (which === "wrapper" ? wrapper?.log : budget?.log) ?? [];
  const core = (which === "wrapper" ? wrapper?.core : budget?.core) ?? "core";
  const text = lines.join("\n");

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div className="sp-colhead">
        <span className="sp-seg">
          <button className={which === "wrapper" ? "on" : ""}
                  onClick={() => setWhich("wrapper")}>analyze_wrapper_cells</button>
          <button className={which === "budget" ? "on" : ""}
                  onClick={() => setWhich("budget")}>scan budget</button>
        </span>
        <span style={{ flex: 1 }} />
        <span className="sp-sub">{lines.length} lines</span>
        {projOpen && lines.length > 0 && (
          <button onClick={() => void writeToProject([
            { relPath: `Spec/scan/${core}.${which === "wrapper" ? "wrapper_analysis" : "scan_budget"}.log`,
              text: text + "\n" },
          ])}>Save logfile</button>
        )}
      </div>
      <pre className="sp-pre" style={{ flex: 1 }}>
        {text || (which === "wrapper" ? "Run “Analyze wrapper cells” to see its transcript."
                                      : "Run “Compute budget” to see its transcript.")}
      </pre>
    </div>
  );
}

const depthOf = (id: string) => id.split(".").length - 1;
const globList = (f: Family) => f.globs.split(/[,\s]+/).filter(Boolean);

/** The page is four separate jobs, and showing all four at once is what made it unreadable:
 *  three toolbars, three columns and five output tabs competing for attention when only one of
 *  them was ever the current job. They are steps now — one at a time, each with only its own
 *  buttons, and the hierarchy tree gets the width it needs. */
type Step = "families" | "wrapper" | "budget";
const STEPS: { id: Step; n: string; label: string }[] = [
  { id: "families", n: "1", label: "Chain families" },
  { id: "wrapper", n: "2", label: "Wrapper cells" },
  { id: "budget", n: "3", label: "Budget & output" },
];

// ---- undo/redo for the scan plan -----------------------------------------------------------
// Keyed by PROJECT PATH, not a useRef: switching workspaces (Clock Tree, DFTSpec Planner, …)
// and back UNMOUNTS this component, so a component-local stack would forget everything the
// moment the engineer bounced to another tab — which, given the click-heavy workflow here,
// would happen constantly. Mirrors ClockResetTab.tsx's crHist/histFor pattern.
interface SpHist { past: ScanPlan[]; future: ScanPlan[] }
const spHist = new Map<string, SpHist>();
const histFor = (key: string): SpHist => {
  let h = spHist.get(key);
  if (!h) { h = { past: [], future: [] }; spHist.set(key, h); }
  return h;
};

export function ScanPlannerTab() {
  const rc = useStore((s) => s.regCounts);
  const plan = useStore((s) => s.scanPlan);
  const setPlan = useStore((s) => s.setScanPlan);
  const defaults = useStore((s) => s.edtDefaults);
  const setDefaults = useStore((s) => s.setEdtDefaults);
  const wrapper = useStore((s) => s.wrapperCells);
  const wrapperBusy = useStore((s) => s.wrapperBusy);
  const runWrapper = useStore((s) => s.runWrapperAnalysis);
  const wrapperOpts = useStore((s) => s.wrapperOptions);
  const budget = useStore((s) => s.scanBudget);
  const budgetBusy = useStore((s) => s.scanBudgetBusy);
  const budgetError = useStore((s) => s.scanBudgetError);
  const runBudget = useStore((s) => s.runScanBudget);
  const top = useDesign((s) => s.top);
  const doc = useSpec((s) => s.doc);
  const projOpen = useProject((s) => !!s.path);
  const projectPath = useProject((s) => s.path);
  const saveNow = useStore((s) => s.saveScanPlanNow);
  const savedAt = useStore((s) => s.planSavedAt);

  // ---- undo/redo ----------------------------------------------------------------------------
  // A wrong bulk-assign (mistyped digit, wrong row, wrong filter-bulk) used to have NO recovery
  // except manual per-row re-assignment — the single biggest gap in this page's reliability.
  const histKey = projectPath ?? "__no_project__";
  const burst = useRef<string | null>(null);   // which field is mid-edit, for keystroke coalescing
  const [, bumpHist] = useState(0);
  /** One user gesture = one undo step (a click, a digit-assign, a filter-bulk, a dropdown pick…). */
  const commit = (next: ScanPlan) => {
    const h = histFor(histKey);
    h.past.push(plan);
    if (h.past.length > 80) h.past.shift();
    h.future = [];
    burst.current = null;
    setPlan(next);
    bumpHist((n) => n + 1);
  };
  /** A live per-keystroke text/number field (rename, Tcl option value, EDT sizing) — coalesces a
   *  whole typing burst into ONE undo step, so Ctrl+Z removes the edit, not one character. */
  const commitBurst = (id: string, next: ScanPlan) => {
    const h = histFor(histKey);
    if (burst.current !== id) {
      h.past.push(plan);
      if (h.past.length > 80) h.past.shift();
      h.future = [];
      burst.current = id;
    }
    setPlan(next);
    bumpHist((n) => n + 1);
  };
  const endBurst = () => { burst.current = null; };
  const doUndo = () => {
    const h = histFor(histKey);
    const prev = h.past.pop();
    if (prev === undefined) return;
    h.future.push(plan);
    burst.current = null;
    setPlan(prev);
    bumpHist((n) => n + 1);
  };
  const doRedo = () => {
    const h = histFor(histKey);
    const next = h.future.pop();
    if (next === undefined) return;
    h.past.push(plan);
    burst.current = null;
    setPlan(next);
    bumpHist((n) => n + 1);
  };
  // Ctrl+Z/Ctrl+Y (or Ctrl+Shift+Z), ignored while typing — several fields on this page (family
  // rename, glob rule, filter, Tcl option text, EDT sizing numbers) rely on the browser's own
  // native undo, which this must not steal focus from.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.matches("input, textarea, select") || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); doRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const [step, setStep] = useState<Step>("families");
  const [activeFam, setActiveFam] = useState<string>("occ");
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Biggest blocks first by default: the question this page answers is "where are the flops",
  // and declaration order buries a 1300-bit core under a 4-bit synchroniser.
  const [sortBy, setSortBy] = useState<"bits" | "name">("bits");
  // The tree opens on the design's real fan-out ONCE per core; a manual collapse then stays.
  const autoOpened = useRef<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // The row a shift-click ranges FROM — additive to the existing checkboxes, not a replacement:
  // scattered cross-cutting selections (e.g. every sync_cell_* leaf) still tick one at a time,
  // but a contiguous run of rows no longer needs one click per row.
  const [selAnchor, setSelAnchor] = useState<string | null>(null);
  /** Right-click position, when the context menu was opened that way (vs. the Family-cell's own
   *  click-to-open, which stays anchored to the cell itself). */
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [view, setView] = useState<View>("edt");
  // The left column's width is the user's, not ours: 300px was fine for a family list and is
  // cramped the moment a family carries Tcl options. Dragged on the divider, remembered.
  const [leftW, setLeftW] = useState<number>(() => {
    const v = Number(localStorage.getItem("sp:leftW"));
    return Number.isFinite(v) && v >= 240 ? Math.min(v, 700) : 360;
  });
  const dragLeft = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = leftW;
    let w = startW;
    const move = (ev: MouseEvent) => {
      w = Math.max(240, Math.min(700, startW + (ev.clientX - startX)));
      setLeftW(w);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      localStorage.setItem("sp:leftW", String(w));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const leftResizer = <div className="sp-resizer" onMouseDown={dragLeft}
                           title="Drag to resize the panel" />;
  const [note, setNote] = useState("");
  /** Text of the rule being typed. Held here rather than bound to the family's glob string so a
   *  half-typed pattern never counts as a live rule — `*hyp` on its way to `*hyper*` would
   *  otherwise repaint the tree on every keystroke. */
  const [ruleDraft, setRuleDraft] = useState("");
  /** The row whose Family cell has its assignment menu open. */
  const [menu, setMenu] = useState<string | null>(null);

  const core = useMemo(() => (rc ? coreOf(rc, top) : undefined), [rc, top]);
  const counts = useMemo(
    () => (rc && core ? countFamilies(plan, rc, core.instanceId) : []), [plan, rc, core]);
  const famAt = useMemo(() => familyOfInstance(counts), [counts]);

  const edts = useMemo(() => {
    const out: { name: string; external: boolean }[] = [];
    for (const def of doc.library.defs)
      for (const ip of def.dftIps ?? [])
        if (ip.ipType === "Edt") out.push({ name: ip.instanceName, external: /^ext/i.test(ip.instanceName) });
    return out;
  }, [doc]);

  // Which ScanHost chain group each controller joins, straight off the canvas — several may
  // name the same one, and then the group carries all of them.
  const edtGroups = useMemo(() => {
    const m = new Map<string, string>();
    for (const def of doc.library.defs)
      for (const ip of def.dftIps ?? [])
        if (ip.ipType === "Edt") m.set(ip.instanceName, chainGroupOf(ip));
    return m;
  }, [doc]);

  const rows = useMemo<RegCount[]>(() => {
    if (!rc || !core) return [];
    const scoped = rc.counts.filter((c) => isUnder(core.instanceId, c.instanceId));
    const t = filter.trim().toLowerCase();
    if (t) return scoped.filter((c) => c.instanceId.toLowerCase().includes(t)).slice(0, 500);
    // DFS with siblings sorted — biggest subtree first, so the blocks that carry the flops are
    // the ones on screen instead of whatever the netlist declared first.
    return treeRows(scoped, core.instanceId, expanded, sortBy);
  }, [rc, core, filter, expanded, sortBy]);

  const hasKids = useMemo(() => {
    const s = new Set<string>();
    for (const c of rc?.counts ?? []) {
      const i = c.instanceId.lastIndexOf(".");
      if (i > 0) s.add(c.instanceId.slice(0, i));
    }
    return s;
  }, [rc]);

  // Everything the filter matches, not only the rows the tree draws — a bulk action that acted
  // on the visible slice would quietly do less than its label says.
  //
  // These hooks live ABOVE the early return on purpose: React counts hooks per render, and a
  // useMemo after a conditional `return` changes that count the moment the counts arrive.
  const matches = useMemo<RegCount[]>(() => {
    const t = filter.trim().toLowerCase();
    if (!t || !rc || !core) return [];
    return rc.counts.filter((c) => isUnder(core.instanceId, c.instanceId) &&
                                   c.instanceId !== core.instanceId &&
                                   c.instanceId.toLowerCase().includes(t));
  }, [rc, core, filter]);
  const matchBits = useMemo(
    () => bitsOf(matches.map((m) => m.instanceId), rc?.counts ?? []), [matches, rc]);
  const selectedBits = useMemo(
    () => bitsOf([...selected], rc?.counts ?? []), [selected, rc]);

  // OPEN ON THE DESIGN, not on one collapsed row. Runs once per core: the first screen shows
  // the real fan-out (biggest subtree first, single-child chains followed through), and any
  // later collapse the user makes is theirs to keep.
  useEffect(() => {
    if (!rc || !core || autoOpened.current === core.instanceId) return;
    autoOpened.current = core.instanceId;
    const scoped = rc.counts.filter((c) => isUnder(core.instanceId, c.instanceId));
    setExpanded(initialExpansion(scoped, core.instanceId));
  }, [rc, core]);

  if (!rc || !core) return <div className="regcount muted">Loading register counts…</div>;

  const coreId = core.instanceId;
  const wrapperCount = wrapper ? wrapper.wrapperIn + wrapper.wrapperOut : 0;
  const famBits = (f: Family) =>
    f.kind === "wrapper" ? wrapperCount : (counts.find((c) => c.family.id === f.id)?.bits ?? 0);

  /** Commit the typed rule. Empty input is not an error, it is just nothing to add. */
  const addRule = (f: Family) => {
    const g = ruleDraft.trim();
    setRuleDraft("");
    if (!g || globList(f).includes(g)) return;
    commit(setFamilyGlobs(plan, f.id, (f.globs ? f.globs + " " : "") + g));
    const n = globHits(g, rc.counts, coreId).length;
    setNote(n ? `${f.name}: rule ${g} matches ${n} instance(s)`
              : `${f.name}: rule ${g} matches nothing — check the pattern`);
  };

  /** A family with rules but no bits is almost always a typo, and it is invisible unless the
   *  list says so — the count alone reads as "nothing here yet". */
  const famDead = (f: Family) =>
    (f.kind === "normal" || f.kind === "nonscan") && globList(f).length > 0 && famBits(f) === 0;

  /** Families an instance can actually be put INTO. The remainder is defined as what is left
   *  over and the wrapper family comes from the analysis, so neither is a target. */
  const assignable = plan.families.filter((f) => f.kind === "normal" || f.kind === "nonscan");
  const targetName = plan.families.find((f) => f.id === activeFam)?.name ?? "—";

  const assignMany = (paths: string[]) => {
    if (!paths.length) return;
    commit(paintMany(plan, activeFam, paths));
    setNote(`${paths.length} instance(s), ${bitsOf(paths, rc.counts)} scan bits → ${targetName}`);
    setSelected(new Set());
  };

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  /** Put an instance into a named family directly, without first selecting that family on the
   *  left. Reaching across the page to change the target, then coming back to click the row,
   *  was two thirds of the work of every edit. */
  const assignTo = (famId: string, paths: string[]) => {
    commit(paintMany(plan, famId, paths));
    const f = plan.families.find((x) => x.id === famId);
    setNote(`${paths.length} instance(s), ${bitsOf(paths, rc.counts)} bits → ${f?.name ?? famId}`);
    setSelected(new Set());
  };

  /** Take instances out of whatever family currently claims them, however they got in. */
  const unassignAt = (paths: string[]) => {
    let next = plan;
    for (const p of paths) {
      const fc = familyOfInstance(countFamilies(next, rc, coreId))(p);
      if (fc) next = unassignFamily(next, fc.family.id, p, rc.counts, coreId);
    }
    commit(next);
    setNote(`${paths.length} instance(s) removed from their family`);
    setSelected(new Set());
  };

  const clickRow = (path: string) => {
    const fam = plan.families.find((f) => f.id === activeFam);
    if (!fam || fam.kind === "rest" || fam.kind === "wrapper") {
      setNote(fam?.kind === "rest"
        ? `${fam.name} is the remainder — it holds whatever no other family claims, so nothing is assigned to it by hand.`
        : "That family is filled in by the wrapper analysis. Select a normal family to paint.");
      return;
    }
    // The click acts on what the row SHOWS, not on the pick list. A tag that came from a glob
    // rule or from a painted ancestor is removed the same way as one that came from a pick —
    // anything else leaves tags on screen that no click can take off.
    const here = famAt(path);
    commit(here?.family.id === activeFam
      ? unassignFamily(plan, activeFam, path, rc.counts, coreId)
      : paintFamily(plan, activeFam, path));
  };

  /** Shift-range-select / Ctrl-toggle-add, additive to the existing per-row checkboxes — a plain
   *  click keeps painting immediately (unchanged), so nothing about the fast single-row path
   *  gets slower for this. */
  const handleRowClick = (e: ReactMouseEvent, id: string) => {
    if (e.shiftKey && selAnchor) {
      const ids = rows.map((r) => r.instanceId);
      const a = ids.indexOf(selAnchor), b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelected(new Set(ids.slice(lo, hi + 1)));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelected((s) => {
        const n = new Set(s);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      });
      setSelAnchor(id);
      return;
    }
    setSelAnchor(id);
    clickRow(id);
  };

  // One run path for both entry points — the toolbar button and the wrapper step's Run must not
  // be able to analyse the same block with different settings.
  const runWrapperNow = (verbose = false) =>
    void runWrapper({ ...wrapperOpts, core: coreId, logEveryPort: wrapperOpts.logEveryPort || verbose });

  /** One line about what fills a family, for the master list and its tooltip. */
  const famWhat = (f: Family) =>
    f.kind === "rest" ? "the remainder — everything no other family claimed"
    : f.kind === "wrapper" ? (wrapper ? "from the wrapper analysis" : "run the wrapper analysis")
    : [globList(f).length ? `${globList(f).length} rule(s)` : "",
       f.instances.length ? `${f.instances.length} picked` : "",
       (f.excludes ?? []).length ? `${f.excludes.length} except` : ""].filter(Boolean).join(" · ")
      || "empty — click instances in the tree";

  // Tab moves between families instead of tabbing through every control in the panel. Only when
  // the focus is not in a text field, where Tab still has to mean what it always means.
  const onFamKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).matches("input, textarea, select")) return;
    const dir = e.key === "Tab" ? (e.shiftKey ? -1 : 1)
              : e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const ids = plan.families.map((f) => f.id);
    const i = Math.max(0, ids.indexOf(activeFam));
    setActiveFam(ids[(i + dir + ids.length) % ids.length]);
  };

  /** Tab (or 1-4) walks the steps. The whole page is one flow, so the key that means "next" in
   *  every other form means "next step" here. */
  const onStepKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).matches("input, textarea, select")) return;
    const at = STEPS.findIndex((s) => s.id === step);
    const dir = e.key === "Tab" ? (e.shiftKey ? -1 : 1)
              : e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (dir) {
      e.preventDefault();
      setStep(STEPS[(at + dir + STEPS.length) % STEPS.length].id);
      return;
    }
    const n = Number(e.key);
    if (n >= 1 && n <= STEPS.length) { e.preventDefault(); setStep(STEPS[n - 1].id); }
  };

  /** In the tree, a digit assigns the checked rows to that family — the fast path for "these
   *  ninety-six are all non-scan" without travelling to the left panel at all. */
  const onTreeKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).matches("input, textarea, select")) return;
    if (e.key === "Escape") { setMenu(null); setMenuPos(null); return; }
    if (!selected.size) return;
    const n = Number(e.key);
    if (n >= 1 && n <= assignable.length) { e.preventDefault(); assignTo(assignable[n - 1].id, [...selected]); }
    else if (e.key === "0" || e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      unassignAt([...selected]);
    }
  };

  const doAutoClassify = () => {
    const r = autoClassify(plan, rc.counts, coreId);
    commit(r.plan);
    const parts = Object.entries(r.added).map(([n, xs]) => `${n} +${xs.length}`);
    setNote(parts.length ? `Auto-classified: ${parts.join(", ")}` : "Nothing new matched the known DFT name patterns.");
  };

  const compute = () => {
    const famNames = (k: "int" | "ext") => defaults[k].families;
    const fam = (kind: Family["kind"], name?: string) =>
      plan.families.find((x) => (name ? x.name === name : x.kind === kind));
    const g = (kind: Family["kind"], name?: string) => {
      const f = fam(kind, name);
      return f ? [...f.globs.split(/[,\s]+/).filter(Boolean), ...f.instances] : [];
    };
    // Exceptions travel beside the rules rather than being folded into them: the budget has to
    // subtract exactly what this page shows subtracted, and the emitted Tcl has to say so too.
    const ex = (kind: Family["kind"], name?: string) => fam(kind, name)?.excludes ?? [];
    const edtPlans: ScanBudgetEdtPlan[] = edts.map((e) => {
      const side = e.external ? "ext" : "int";
      const sz = sizingForEdt(plan, defaults, e.name, e.external);
      const fams = familiesForEdt(plan, defaults, e.name, e.external);
      return {
        name: e.name,
        external: e.external,
        // No per-instance coverage any more: an internal controller takes whatever the other
        // controllers have not claimed, which is what an empty list means to the budget engine.
        instances: [],
        includeOcc: fams.includes("OCC_CHAIN"),
        includeHyper: fams.includes("HYPER_CHAIN"),
        includeWrapper: fams.includes("WRAPPER"),
        channels: sz.channels,
        chainsPerChannel: sz.chainsPerChannel,
        targetChainLength: sz.targetChainLength,
        sshChainGroup: edtGroups.get(e.name) ?? e.name,
        extraFamilies: extraFamiliesForEdt(plan, defaults, e.name, e.external),
      };
    });
    void runBudget({
      core: coreId, designName: coreId,
      occInstances: g("normal", "OCC_CHAIN"),
      hyperInstances: g("normal", "HYPER_CHAIN"),
      nonscanInstances: g("nonscan"),
      occExcludes: ex("normal", "OCC_CHAIN"),
      hyperExcludes: ex("normal", "HYPER_CHAIN"),
      nonscanExcludes: ex("nonscan"),
      familyOptions: familyTclOptions(plan),
      edts: edtPlans,
    });
  };

  /** Where each step stands, shown on its own tab so the flow reports progress without a
   *  separate status area. */
  const stepState = (id: Step) =>
    id === "families" ? `${plan.families.length}`
    : id === "wrapper" ? (wrapper ? `${wrapperCount}` : "—")
    : (budget ? `${budget.edts.length}` : "—");

  // ---- the family panel (step 1) and the controller panel (step 2) --------------------------
  const familyPanel = (
    <div className="sp-col sp-left" style={{ flex: `0 0 ${leftW}px` }}>
      <div className="sp-colhead">
        <b style={{ flex: 1 }}>Chain families</b>
        {/* One deliberate handover: everything configured on this panel — families, rules,
            exceptions, the Tcl switches — recomputes the budget (so scan_insertion.tcl and
            edt.spec carry it) AND writes the plan to the project, in one press. Editing stays
            cheap because nothing is applied until this says so. */}
        <button className="primary" disabled={budgetBusy}
                title="Recompute the budget with this configuration (scan_insertion.tcl, edt.spec) and save the plan to the project"
                onClick={() => {
                  compute();
                  void saveNow().then((ok) =>
                    setNote(ok ? "Applied — budget recomputed, plan saved."
                               : "Applied — budget recomputed. (Plan not saved — is a project open?)"));
                }}>
          {budgetBusy ? "Applying…" : "Apply"}
        </button>
        <button onClick={() => commit(addFamily(plan))}>+ family</button>
        <button data-btn="undo" title="Undo (Ctrl+Z)" disabled={histFor(histKey).past.length === 0}
                onClick={doUndo}>↶</button>
        <button data-btn="redo" title="Redo (Ctrl+Y)" disabled={histFor(histKey).future.length === 0}
                onClick={doRedo}>↷</button>
      </div>
      {/* MASTER: one line per family. Six families used to be six fully expanded cards, so the
          one being worked on looked exactly like the five that were not. */}
      <div className="sp-famlist" tabIndex={0} onKeyDown={onFamKey}
           title="Tab / ↓ next family · Shift-Tab / ↑ previous">
        {plan.families.map((f, i) => (
          <div key={f.id} className={"sp-famrow" + (activeFam === f.id ? " on" : "")}
               onClick={() => { setActiveFam(f.id); setRuleDraft(""); }} title={famWhat(f)}>
            <span className="sp-dot" style={{ background: f.color }} />
            <span className="sp-famname">{f.name}</span>
            {famDead(f) && <span className="sp-warn" title={`${f.name} has rules but claims nothing — the pattern probably does not match this design.`}>!</span>}
            {assignable.includes(f) && <kbd>{assignable.indexOf(f) + 1}</kbd>}
            <span className="sp-bits">{f.kind === "nonscan" && famBits(f) ? `−${famBits(f)}` : famBits(f)}</span>
          </div>
        ))}
      </div>
      {/* DETAIL: only the selected family. Everything editable about a family is here and
          nowhere else, so there is exactly one place to look. */}
      {(() => {
        const f = plan.families.find((x) => x.id === activeFam);
        if (!f) return null;
        const editable = f.kind !== "rest" && f.kind !== "wrapper";
        const hits = (g: string) => globHits(g, rc.counts, coreId).length;
        /* The switches apply to EVERY family — the remainder and wrapper families are
           create_scan_chain_family commands too (INT_CHAIN / WRAPPER_CHAIN in the Tcl); only
           their MEMBERSHIP is structural. Hiding the whole editor for them hid this. */
        const tclOptsEditor = (
          <>
            <div className="sp-sect">
              Tcl options<span>create_scan_chain_family · {Object.keys(f.tclOptions ?? {}).length || "none"}</span>
            </div>
            <div className="sp-opts">
              {Object.entries(f.tclOptions ?? {}).map(([k, v]) => {
                const meta = FAMILY_TCL_OPTIONS.find((o) => o.name === k);
                return (
                  <div key={k} className="sp-optrow" title={meta?.hint ?? `-${k}`}>
                    <span className="sp-optname">-{k}</span>
                    {meta?.values ? (
                      <select value={v}
                              onChange={(ev) => commit(setFamilyOption(plan, f.id, k, ev.target.value))}>
                        {meta.values.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={v} spellCheck={false}
                             placeholder={meta?.hint ?? "value"}
                             onChange={(ev) => commitBurst("fam:" + f.id + ":opt:" + k,
                               setFamilyOption(plan, f.id, k, ev.target.value))}
                             onBlur={endBurst} />
                    )}
                    <button title={`Remove -${k} — back to the derived default`}
                            onClick={() => commit(setFamilyOption(plan, f.id, k, null))}>×</button>
                  </div>
                );
              })}
              <select className="sp-optadd" value=""
                      title="Add a create_scan_chain_family switch"
                      onChange={(ev) => {
                        const k = ev.target.value;
                        if (!k) return;
                        const meta = FAMILY_TCL_OPTIONS.find((o) => o.name === k);
                        // Enums start on the manual's default; free text starts blank and is
                        // not emitted until something is typed.
                        commit(setFamilyOption(plan, f.id, k, meta?.values?.[0] ?? ""));
                      }}>
                <option value="">+ option…</option>
                {FAMILY_TCL_OPTIONS.filter((o) => (f.tclOptions ?? {})[o.name] === undefined).map((o) => (
                  <option key={o.name} value={o.name}>-{o.name}</option>
                ))}
              </select>
            </div>
          </>
        );
        return (
          <div className="sp-famdetail">
            <div className="sp-fam-top">
              {/* Cycles the preset palette. A native colour picker opens an OS dialog, which is
                  a poor trade for choosing one of seven tree colours. */}
              <button className="sp-swatch" style={{ background: f.color }} title="Change colour"
                      onClick={() => {
                        const i = FAMILY_COLORS.indexOf(f.color);
                        commit(setFamilyColor(plan, f.id, FAMILY_COLORS[(i + 1) % FAMILY_COLORS.length]));
                      }} />
              <input className="sp-name" type="text" value={f.name} spellCheck={false}
                     title="Family name — this is the create_scan_chain_family name"
                     onChange={(e) => commitBurst("fam:" + f.id + ":name", renameFamily(plan, f.id, e.target.value))}
                     onBlur={endBurst} />
              {/* Emptying a family and deleting it are different acts, so they sit together and
                  say which is which rather than one hiding at the bottom of the pane. */}
              {editable && (globList(f).length > 0 || f.instances.length > 0 || (f.excludes ?? []).length > 0) && (
                <button className="sp-x" title={`Empty ${f.name} — remove its rules, picks and exceptions, but keep the family`}
                        onClick={() => { commit(clearFamilyAssignments(plan, f.id)); setNote(`${f.name}: emptied`); }}>⌫</button>
              )}
              {/* The remainder family stays: flops nobody claimed have to land somewhere. */}
              <button className="sp-x" disabled={f.kind === "rest"}
                      title={f.kind === "rest"
                        ? "Cannot delete the remainder family — the flops no other family claims have to land somewhere."
                        : `Delete ${f.name}`}
                      onClick={() => commit(removeFamily(plan, f.id))}>✕</button>
            </div>

            {!editable && (
              <div className="sp-scroll">
                <div className="sp-sub">{famWhat(f)}</div>
                {tclOptsEditor}
              </div>
            )}

            {editable && (
              <div className="sp-scroll">
                {/* Rules are the chips and ONLY the chips. Binding the text box to the whole glob
                    string made every rule appear twice — once as a chip and once as raw text —
                    and left "is this two rules or one written twice?" as the reader's problem.
                    The box adds one rule and then empties. */}
                <div className="sp-chips">
                  {globList(f).map((g) => (
                    <span key={g} className={"sp-chip rule" + (hits(g) ? "" : " dead")}
                          title={hits(g)
                            ? `${g} — matches ${hits(g)} instance(s)`
                            : `${g} matches nothing in this design. A typo, or a block that is not instantiated.`}>
                      {g}<i>{hits(g) || "no match"}</i>
                      <button title={`Delete rule ${g}`}
                              onClick={() => { commit(removeGlob(plan, f.id, g)); setNote(`${f.name}: rule ${g} deleted`); }}>×</button>
                    </span>
                  ))}
                  <input className="sp-addrule" type="text" spellCheck={false} value={ruleDraft}
                         placeholder={globList(f).length ? "+ rule" : "+ rule, e.g. *tessent_occ*"}
                         title="A glob rule keeps matching when the design gains another instance of the same kind; a list of picks does not. Enter adds it."
                         onChange={(e) => setRuleDraft(e.target.value)}
                         onKeyDown={(e) => { if (e.key === "Enter") addRule(f); }}
                         onBlur={() => addRule(f)} />
                </div>

                {/* WHAT THIS FAMILY ACTUALLY CONTAINS — the resolved membership, not the inputs
                    that produced it. Rules and picks are what you TYPE; one rule can claim
                    ninety-six instances, and until now the only way to see which was to read the
                    tree. Each member is removable here, which writes the exception for you. */}
                {(() => {
                  const fc = counts.find((c) => c.family.id === f.id);
                  const roots = fc?.roots ?? [];
                  if (!roots.length) return null;
                  return (
                    <>
                      <div className="sp-sect">
                        contains<span>{roots.length} subtree(s) · {fc?.bits ?? 0} bits</span>
                      </div>
                      <div className="sp-chips">
                        {roots.slice(0, 60).map((p) => (
                          <span key={p} className="sp-chip" title={`${p}\nRemove it from ${f.name}`}>
                            {leafName(p)}
                            <button title={`Take ${p} out of ${f.name}`}
                                    onClick={() => commit(
                                      unassignFamily(plan, f.id, p, rc.counts, coreId))}>×</button>
                          </span>
                        ))}
                        {roots.length > 60 && (
                          <span className="sp-sub">+{roots.length - 60} more</span>
                        )}
                      </div>
                    </>
                  );
                })()}

                {f.instances.length > 0 && (
                  <>
                    <div className="sp-sect">picked by hand<span>{f.instances.length}</span></div>
                    <div className="sp-chips">
                      {f.instances.map((p) => (
                        <span key={p} className="sp-chip" title={p}>
                          {leafName(p)}
                          <button title={`Remove ${p}`}
                                  onClick={() => commit(removeInstance(plan, f.id, p))}>×</button>
                        </span>
                      ))}
                      <button title="Replace these picks with one glob rule that covers them"
                              onClick={() => {
                                const g = suggestGlob(f.instances);
                                if (!g) { setNote("Those picks share no common name, so they cannot become one rule."); return; }
                                commit(setFamilyGlobs(
                                  { ...plan, families: plan.families.map((x) => x.id === f.id ? { ...x, instances: [] } : x) },
                                  f.id, (f.globs ? f.globs + " " : "") + g));
                                setNote(`${f.name}: ${f.instances.length} picks replaced by ${g}`);
                              }}>→ rule</button>
                    </div>
                  </>
                )}

                {/* create_scan_chain_family switches, the full set from the manual (p.638).
                    The glob/pick model above decides MEMBERSHIP; everything else the command
                    can say is set here and passed through verbatim, a user value overriding
                    the derived default. */}
                {tclOptsEditor}

                {/* Exceptions: what "click a rule-tagged instance off" leaves behind. Shown so
                    the subtraction is visible and reversible, not a silent hole. */}
                {(f.excludes ?? []).length > 0 && (
                  <>
                    <div className="sp-sect">except<span>{f.excludes.length}</span></div>
                    <div className="sp-chips">
                      {f.excludes.map((p) => (
                        <span key={p} className="sp-chip except" title={`${p} — excepted from ${f.name}; × lets the rules claim it again`}>
                          {leafName(p)}
                          <button title={`Put ${p} back under ${f.name}`}
                                  onClick={() => commit(removeExclude(plan, f.id, p))}>×</button>
                        </span>
                      ))}
                    </div>
                  </>
                )}

              </div>
            )}
          </div>
        );
      })()}
    </div>
  );

  const controllerPanel = (
    <div className="sp-col sp-left" style={{ flex: `0 0 ${leftW}px` }}>
      <div className="sp-colhead"><b>EDT controllers</b></div>
      <div className="sp-scroll">
        {!edts.length && <div className="sp-sub" style={{ padding: 8 }}>
          Drop an EDT onto the DFTSpec Planner canvas first — controllers are created there.
        </div>}
        {edts.map((e) => {
          const b = budget?.edts.find((x) => x.name === e.name);
          const mine = familiesForEdt(plan, defaults, e.name, e.external);
          const sz = sizingForEdt(plan, defaults, e.name, e.external);
          const own = !!plan.edtFamilies?.[e.name];
          return (
            <div key={e.name} className="sp-edt">
              <div className="sp-famrow">
                <span className="sp-famname">{e.name}</span>
                <span className="sp-bits">{e.external ? "ext" : "int"}</span>
                {b && <span className="sp-bits">{b.cells} → {b.chainCount}×{b.achievedLength}</span>}
              </div>
              {/* THE EDT-TO-FAMILY RELATIONSHIP, on the controller it belongs to. It used to
                  exist only as one set per int/ext kind, which cannot express "this INT EDT
                  carries OCC and that one does not". */}
              {/* Sizing belongs on the controller too. A single defaults block could not say
                  that one INT controller wants 400-cell chains and another wants 200. */}
              <div className="sp-edtfams sizing">
                <label title="Target chain length. The range is this ±10%, and the chain count is cells / range-max.">
                  len <input type="number" value={sz.targetChainLength}
                             onChange={(ev) => commitBurst("edt:" + e.name + ":len", setEdtSizing(plan, e.name,
                               { targetChainLength: Number(ev.target.value) || 0 }))}
                             onBlur={endBurst} />
                </label>
                <label title="input_channel_count. 0 = derive it from the chain count, the way Run Analysis does.">
                  ch <input type="number" min={0} value={sz.channels}
                            onChange={(ev) => commitBurst("edt:" + e.name + ":ch", setEdtSizing(plan, e.name,
                              { channels: Number(ev.target.value) || 0 }))}
                            onBlur={endBurst} />
                  {sz.channels === 0 && <span className="sp-sub">auto</span>}
                </label>
                <label title="Chains one channel carries when the count is derived; the reference flow uses 150.">
                  /ch <input type="number" min={1} value={sz.chainsPerChannel}
                             onChange={(ev) => commitBurst("edt:" + e.name + ":perch", setEdtSizing(plan, e.name,
                               { chainsPerChannel: Number(ev.target.value) || 1 }))}
                             onBlur={endBurst} />
                </label>
              </div>
              <div className="sp-edtfams">
                {plan.families.filter((f) => f.kind !== "nonscan").map((f) => (
                  <label key={f.id} title={`Does ${e.name} carry ${f.name}?`}>
                    <input type="checkbox" checked={mine.includes(f.name)}
                           onChange={(ev) => commit(setEdtFamilies(plan, e.name,
                             ev.target.checked ? [...mine, f.name]
                                               : mine.filter((n) => n !== f.name)))} />
                    <span style={{ color: f.color }}>{f.name.replace("_CHAIN", "")}</span>
                  </label>
                ))}
                {own && (
                  <button title={`Back to the ${e.external ? "EXT" : "INT"} default`}
                          onClick={() => commit(setEdtFamilies(plan, e.name, null))}>default</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ---- the tree, shared by the two assignment steps ----------------------------------------
  const tree = (
    <div className="sp-col sp-mid" tabIndex={0} onKeyDown={onTreeKey}>
      <div className="sp-colhead">
        <input type="text" placeholder="Filter instances…  e.g. sync_cell" value={filter}
               style={{ width: 200 }} onChange={(e) => setFilter(e.target.value)} />
        <button onClick={() => setExpanded(new Set(hasKids))}>Expand</button>
        <button onClick={() => setExpanded(new Set())}>Collapse</button>
        <button data-btn="sp-sort" title="sort siblings by scan bits (biggest first) or by name"
                onClick={() => setSortBy((v) => (v === "bits" ? "name" : "bits"))}>
          {sortBy === "bits" ? "Sort: bits ↓" : "Sort: name"}
        </button>
        <span style={{ flex: 1 }} />
        {/* The two bulk paths. "Every sync cell is non-scan" is ONE decision, and clicking
            ninety-six rows to express it is why this page felt unusable. */}
        {filter.trim() && matches.length > 0 && (
          <button className="sp-bulk" onClick={() => assignMany(matches.map((m) => m.instanceId))}>
            All {matches.length} matches ({matchBits} bits) → {targetName}
          </button>
        )}
        {selected.size > 0 && (
          <>
            <button className="sp-bulk" onClick={() => assignMany([...selected])}>
              {selected.size} selected ({selectedBits} bits) → {targetName}
            </button>
            <button onClick={() => setSelected(new Set())}>Clear</button>
          </>
        )}
      </div>
      <div className="sp-sub sp-hint">
        Click a row to put it in{" "}
        <span className="sp-dot" style={{ background: plan.families.find((f) => f.id === activeFam)?.color }} />
        <b>{targetName}</b> · click the <b>Family</b> cell to send it
        anywhere · tick rows and press <kbd>1</kbd>…<kbd>{assignable.length}</kbd> to assign,
        {" "}<kbd>0</kbd> to clear
      </div>
      <div className="sp-scroll" onClick={() => { if (menu) setMenu(null); if (menuPos) setMenuPos(null); }}>
        <table className="sp-tree">
          <thead><tr>
            <th style={{ width: 24 }}>
              <input type="checkbox" title="Select every row shown"
                     checked={rows.length > 0 && rows.every((r) => selected.has(r.instanceId))}
                     onChange={(e) => setSelected(e.target.checked
                       ? new Set(rows.map((r) => r.instanceId))
                       : new Set())} />
            </th>
            <th>Instance</th><th className="num">Scan bits</th><th className="num">%</th>
            <th className="num">Memory</th><th>Family</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const fc = famAt(r.instanceId);
              const ownFam = plan.families.find((f) => f.instances.includes(r.instanceId));
              const owned = !!ownFam;
              const open = expanded.has(r.instanceId);
              const pct = core.subtree ? Math.round((r.subtree / core.subtree) * 100) : 0;
              const famMenu = menu === r.instanceId;
              const ctxMenu = menuPos && menu === r.instanceId + "@ctx";
              return (
                <tr key={r.instanceId} className={owned ? "owned" : ""} title={r.instanceId}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu(r.instanceId + "@ctx");
                      setMenuPos({ x: e.clientX, y: e.clientY });
                    }}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(r.instanceId)}
                           onChange={(e) => {
                             setSelAnchor(r.instanceId);
                             setSelected((s) => {
                               const n = new Set(s);
                               e.target.checked ? n.add(r.instanceId) : n.delete(r.instanceId);
                               return n;
                             });
                           }} />
                  </td>
                  <td style={{ paddingLeft: 8 + depthOf(r.instanceId) * 14 }}
                      onClick={(e) => handleRowClick(e, r.instanceId)}>
                    <span className={"sp-caret" + (hasKids.has(r.instanceId) ? "" : " leaf")}
                          onClick={(e) => { e.stopPropagation(); toggle(r.instanceId); }}>
                      {hasKids.has(r.instanceId) ? (open ? "▾" : "▸") : "·"}
                    </span>
                    {leafName(r.instanceId)}
                  </td>
                  <td className="num" onClick={(e) => handleRowClick(e, r.instanceId)}>{r.subtree}</td>
                  <td className="num" onClick={(e) => handleRowClick(e, r.instanceId)}>{pct || ""}</td>
                  <td className="num">{r.memoryBits || ""}</td>
                  {/* The Family cell IS the editor: click it and choose. Changing an instance's
                      family used to mean going to the left panel, selecting the target family,
                      coming back and clicking the row — three moves for one decision. */}
                  <td className="sp-cell"
                      onClick={(e) => { e.stopPropagation(); setMenu(famMenu ? null : r.instanceId); }}>
                    {fc ? (() => {
                      // Why this row carries this tag — the three origins behave differently and
                      // used to be indistinguishable.
                      const own = fc.family.instances.includes(r.instanceId);
                      const rule = !own && globList(fc.family).find((g) => globMatch(g, r.instanceId));
                      const from = own ? "picked" : rule ? `rule ${rule}` : "inherited from a parent";
                      return (
                        <span className={"sp-tag" + (own ? "" : " inherit")}
                              style={{ background: fc.family.color + "33", color: fc.family.color }}
                              title={`${fc.family.name} — ${from}. Click to change or remove.`}>
                          {/* A solid dot that never fades, unlike the tag's own opacity treatment
                              (dimmed on purpose for inherited rows so real picks don't drown out)
                              — the one thing that still lets a misclassified inherited row be
                              spotted by color alone, at a glance, without reading text. */}
                          <span className="sp-dot" style={{ background: fc.family.color }} />
                          {fc.family.name}{own ? "" : rule ? " ⁂" : " ↳"}
                        </span>
                      );
                    })() : (() => {
                      // An unclaimed instance is NOT unassigned — it belongs to the remainder
                      // family, which is what that family means. The column was blank for it
                      // because the remainder has no per-instance roots to resolve, which read
                      // as "no family" for the majority of the design.
                      const rest = plan.families.find((f) => f.kind === "rest");
                      return rest ? (
                        <span className="sp-tag inherit rest"
                              style={{ color: rest.color }}
                              title={`${rest.name} — the remainder: everything no other family claimed. Click to put this instance in a family instead.`}>
                          <span className="sp-dot" style={{ background: rest.color }} />
                          {rest.name} ·
                        </span>
                      ) : <span className="sp-tagempty" title="Click to put this instance in a family">+</span>;
                    })()}
                    {famMenu && (
                      <div className="sp-cellmenu" onClick={(e) => e.stopPropagation()}>
                        {assignable.map((f, i) => (
                          <div key={f.id} className="sp-cmi"
                               onClick={() => { assignTo(f.id, [r.instanceId]); setMenu(null); }}>
                            <span className="sp-dot" style={{ background: f.color }} />
                            {f.name}<kbd>{i + 1}</kbd>
                          </div>
                        ))}
                        {fc && (
                          <div className="sp-cmi rm"
                               onClick={() => { unassignAt([r.instanceId]); setMenu(null); }}>
                            remove from {fc.family.name}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Right-click: the SAME assignable list the Family-cell dropdown already
                        offers ("assign to →"), plus "select all children" — removes the
                        "click the family in the sidebar to make it active, THEN click the row"
                        two-step for one-off subtree assignments. Fixed-position (not cell-
                        relative like famMenu above), so it renders at the cursor regardless of
                        which cell was right-clicked. */}
                    {ctxMenu && menuPos && (
                      <div className="sp-cellmenu ctx" style={{ left: menuPos.x, top: menuPos.y }}
                           onClick={(e) => e.stopPropagation()}>
                        <div className="sp-cmi-hd">{leafName(r.instanceId)}</div>
                        {assignable.map((f, i) => (
                          <div key={f.id} className="sp-cmi"
                               onClick={() => { assignTo(f.id, [r.instanceId]); setMenu(null); setMenuPos(null); }}>
                            <span className="sp-dot" style={{ background: f.color }} />
                            assign to {f.name}<kbd>{i + 1}</kbd>
                          </div>
                        ))}
                        {fc && (
                          <div className="sp-cmi rm"
                               onClick={() => { unassignAt([r.instanceId]); setMenu(null); setMenuPos(null); }}>
                            remove from {fc.family.name}
                          </div>
                        )}
                        {hasKids.has(r.instanceId) && (
                          <div className="sp-cmi"
                               onClick={() => {
                                 const kids = rc.counts
                                   .filter((c) => isUnder(r.instanceId, c.instanceId) && c.instanceId !== r.instanceId)
                                   .map((c) => c.instanceId);
                                 setSelected((s) => new Set([...s, ...kids]));
                                 setMenu(null); setMenuPos(null);
                               }}>
                            select all children
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filter && rows.length === 500 && (
          <div className="sp-sub" style={{ padding: 6 }}>showing the first 500 matches</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="sp">
      {/* ONE bar: where you are, and only the buttons this step needs. */}
      <div className="sp-bar" tabIndex={0} onKeyDown={onStepKey}
           title="Tab / ← → move between steps · 1-4 jump straight to one">
        <span className="sp-core">{coreId} · {core.subtree} bits</span>
        <span className="sp-steps">
          {STEPS.map((s) => (
            <button key={s.id} className={step === s.id ? "on" : ""} onClick={() => setStep(s.id)}>
              <b>{s.n}</b> {s.label}<i>{stepState(s.id)}</i>
            </button>
          ))}
        </span>
        <span style={{ flex: 1 }} />
        {/* Autosave runs on a debounce, but "did that save?" deserves an answer, and a plan you
            are about to hand over deserves a deliberate write. Both steps show it: the thing
            being saved is the whole planner, not the step you happen to be on. */}
        {projOpen && (
          <>
            {savedAt && <span className="sp-sub" title="last written to the project">
              saved {new Date(savedAt).toLocaleTimeString()}
            </span>}
            <button title="Write the plan, the analysis options and the cached results to the project"
                    onClick={() => void saveNow().then((ok) =>
                      setNote(ok ? "Scan plan saved to the project."
                                 : "Could not save — is a project open?"))}>
              Save
            </button>
          </>
        )}
        {step === "families" && (
          <button onClick={doAutoClassify} title="Paint the usual DFT structures (OCC, hyper, lockups, channel pipelines) into their families. Never overwrites anything you assigned.">
            Auto-classify
          </button>
        )}
        {step === "wrapper" && (
          <button disabled={wrapperBusy} title="Ctrl-click forces a per-port transcript for this run."
                  onClick={(e) => runWrapperNow(e.ctrlKey || e.metaKey)}>
            {wrapperBusy ? "Analyzing…" : wrapper ? `Re-run (${wrapperCount} cells)` : "Analyze wrapper cells"}
          </button>
        )}
        {step === "budget" && (
          <>
            <button disabled={budgetBusy || !edts.length} onClick={compute}>
              {budgetBusy ? "Computing…" : budget ? "Recompute" : "Compute budget"}
            </button>
            {projOpen && budget && (
              <button onClick={() => void writeToProject([
                { relPath: `Spec/edt/${coreId}.budget.spec`, text: budget.edtSpec },
                { relPath: `Spec/scan/${coreId}.scan_insertion.tcl`, text: budget.scanTcl },
              ])}>Export</button>
            )}
          </>
        )}
      </div>
      {note && <div className="sp-err" style={{ color: "var(--fg)" }}>{note}</div>}
      {/* A budget that FAILED used to look exactly like one that was never run: the store kept
          the message and nothing rendered it. */}
      {budgetError && <div className="sp-err">Budget failed — {budgetError}</div>}
      {budget?.errors.map((e) => <div key={e} className="sp-err">ERROR {e}</div>)}

      <div className="sp-body">
        {step === "families" && <>{familyPanel}{leftResizer}{tree}</>}
        {step === "wrapper" && (
          <div className="sp-col sp-full"><WrapperReport onRun={() => runWrapperNow()} /></div>
        )}
        {step === "budget" && (
          <>
            {controllerPanel}
            {leftResizer}
            <div className="sp-col sp-mid">
              <div className="sp-colhead">
                <span className="sp-seg">
                  <button className={view === "edt" ? "on" : ""} onClick={() => setView("edt")}>EDT config</button>
                  <button className={view === "spec" ? "on" : ""} onClick={() => setView("spec")}>edt.spec</button>
                  <button className={view === "tcl" ? "on" : ""} onClick={() => setView("tcl")}>scan_insertion.tcl</button>
                  <button className={view === "eab" ? "on" : ""} onClick={() => setView("eab")}>EAB risk</button>
                  <button className={view === "log" ? "on" : ""} onClick={() => setView("log")}>log</button>
                </span>
              </div>
              {view === "eab" ? <EabReport /> : view === "log" ? <RunLog /> :
               budget && view === "edt" ? <EdtConfigView budget={budget} defaults={defaults} plan={plan} groups={edtGroups} /> :
               budget ? (
                <pre className="sp-pre">{view === "spec" ? budget.edtSpec : budget.scanTcl}</pre>
              ) : (
                /* An empty pane that only describes the button somewhere else is a dead end. */
                <div className="sp-empty">
                  <p>Nothing computed yet.</p>
                  <p className="sp-sub">
                    {edts.length
                      ? <>{edts.length} controller(s) from the DFTSpec Planner · {plan.families.length} chain
                          families · {wrapper ? `${wrapperCount} wrapper cells` : "wrapper analysis not run"}</>
                      : <>No EDT controllers yet — drop one onto the DFTSpec Planner canvas first.</>}
                  </p>
                  <button disabled={budgetBusy || !edts.length} onClick={compute}>
                    {budgetBusy ? "Computing…" : "Compute budget"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
