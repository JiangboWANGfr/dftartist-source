// dp_shell — the Tcl console at the bottom of the hierarchy workspace.
// Same backend as the schematic right-click DFT actions, so both can never drift apart.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { dftDesign as hs } from "../core-bridge/client.ts";
import { complete, parseCompletion, type CmdInfo } from "./core/complete.ts";
import { useStore } from "./store.ts";
import type { DpOccPoint, DpCtrlMux } from "../core-bridge/model.ts";

interface Line { kind: "cmd" | "out" | "err"; text: string; }

const WELCOME =
  "dp_shell — Tcl over the elaborated design.\n" +
  "  report_commands            every DFT planner command, by group\n" +
  "  <command> -help            one command in full\n" +
  "  Tab                        complete a command or a switch (twice to list)\n" +
  "  ls / cat / grep / find …   the usual Unix basics work here too";

export function DpShellPanel({ onClose }: { onClose?: () => void }) {
  const [lines, setLines] = useState<Line[]>([{ kind: "out", text: WELCOME }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [occ, setOcc] = useState<DpOccPoint[]>([]);
  const [muxes, setMuxes] = useState<DpCtrlMux[]>([]);
  // Command history (↑/↓), newest last.
  const hist = useRef<string[]>([]);
  const histIdx = useRef<number>(-1);
  // The completion table comes from the shell itself (`report_commands -completion`), so it
  // describes the commands this build actually has rather than a list maintained over here.
  const [cmds, setCmds] = useState<CmdInfo[]>([]);
  const tabbedOnce = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [lines]);

  useEffect(() => {
    let dead = false;
    void hs.dpShell("report_commands -completion")
      .then((r) => { if (!dead && r.ok) setCmds(parseCompletion(r.output)); })
      .catch(() => {});   // no daemon yet: Tab simply has nothing to offer
    return () => { dead = true; };
  }, []);

  const run = useCallback(async (script: string) => {
    const cmd = script.trim();
    if (!cmd || busy) return;
    hist.current.push(cmd);
    histIdx.current = -1;
    setLines((l) => [...l, { kind: "cmd", text: cmd }]);
    setBusy(true);
    try {
      const r = await hs.dpShell(cmd);
      setOcc(r.occPoints);
      setMuxes(r.ctrlMuxes);
      // A command that changed the plan has to move what the analysis views are showing —
      // `add_pin_constraint` then `run_drc` in the console used to leave the clock/reset
      // schematic sitting on the values from before either of them.
      useStore.getState().notePlanRev(r.planRev);
      // `clear` typed has to mean what the toolbar button means; the shell says so with \f.
      if (r.output.includes("\f")) {
        const rest = r.output.replace(/\f/g, "").replace(/\n+$/, "");
        setLines(rest ? [{ kind: "out", text: rest }] : []);
      } else if (r.output) {
        setLines((l) => [...l, { kind: "out", text: r.output.replace(/\n+$/, "") }]);
      }
      if (!r.ok && r.error) setLines((l) => [...l, { kind: "err", text: r.error }]);
    } catch (e) {
      setLines((l) => [...l, { kind: "err", text: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [busy]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); void run(input); setInput(""); tabbedOnce.current = false; return; }
    if (e.key === "Tab") {
      // Shell rules: one Tab completes as far as the choice is unambiguous, a second Tab on the
      // same text lists what the choices are.
      e.preventDefault();
      const r = complete(input, cmds);
      if (r.line !== null) { setInput(r.line); tabbedOnce.current = false; return; }
      if (r.candidates.length > 1 && tabbedOnce.current) {
        setLines((l) => [...l, { kind: "cmd", text: input },
                                { kind: "out", text: r.candidates.join("   ") }]);
        tabbedOnce.current = false;
      } else {
        tabbedOnce.current = true;
      }
      return;
    }
    tabbedOnce.current = false;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!hist.current.length) return;
      histIdx.current = histIdx.current < 0 ? hist.current.length - 1 : Math.max(0, histIdx.current - 1);
      setInput(hist.current[histIdx.current] ?? "");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx.current < 0) return;
      histIdx.current += 1;
      if (histIdx.current >= hist.current.length) { histIdx.current = -1; setInput(""); }
      else setInput(hist.current[histIdx.current] ?? "");
    }
  };

  /** Keys pressed on the panel itself (not already in the input) belong to the prompt. Only
   *  plain typing is forwarded — a modifier means a shortcut, and Ctrl-C over a selection has to
   *  keep meaning copy. */
  const focusOnType = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target === inputRef.current) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1 && e.key !== "Backspace" && e.key !== "ArrowUp" && e.key !== "ArrowDown")
      return;
    inputRef.current?.focus();
  };

  return (
    <div className="dpsh" tabIndex={-1} onKeyDown={focusOnType}>
      <div className="dpsh-bar">
        <span className="dpsh-title">dp_shell</span>
        <span className="dpsh-stat">
          OCC {occ.length} · ctrl-mux {muxes.length}
        </span>
        <button className="findbtn" title="report_clock_tree" onClick={() => void run("report_clock_tree")}>clock</button>
        <button className="findbtn" title="report_reset -violations" onClick={() => void run("report_reset -violations")}>reset DRC</button>
        <button className="findbtn" title="report_occ_def_points" onClick={() => void run("report_occ_def_points")}>OCC</button>
        <button className="findbtn" title="write_occ_def_points dfx_occ_def_point.tcl"
                onClick={() => void run("write_occ_def_points dfx_occ_def_point.tcl")}>write tcl</button>
        <button className="findbtn" title="Clear the console" onClick={() => setLines([])}>clear</button>
        {onClose && <button className="findbtn" title="Hide dp_shell" onClick={onClose}>✕</button>}
      </div>
      {/* A TERMINAL, not a log with a box under it. The prompt is the LAST LINE OF THE STREAM —
          it sits under the newest output and scrolls with it, exactly where the next command
          will be echoed, instead of being pinned to the panel bottom as a separate widget.
          Clicking anywhere in the output puts the caret on the prompt, and so does typing. A
          click that SELECTED something is left alone: copying an error out of the log must not
          steal the caret. */}
      <div className="dpsh-log" ref={logRef}
           onMouseUp={() => {
             if (!window.getSelection()?.toString()) inputRef.current?.focus();
           }}>
        {lines.map((l, i) => (
          <div key={i} className={"dpsh-line dpsh-" + l.kind}>
            {l.kind === "cmd" ? "dp_shell> " + l.text : l.text}
          </div>
        ))}
        {busy && <div className="dpsh-line dpsh-out">…</div>}
        <div className="dpsh-in">
          <span className="dpsh-prompt">dp_shell&gt;</span>
          <input
            ref={inputRef}
            value={input}
            disabled={busy}
            spellCheck={false}
            placeholder="get_cells *clk*   |   help"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
      </div>
    </div>
  );
}
