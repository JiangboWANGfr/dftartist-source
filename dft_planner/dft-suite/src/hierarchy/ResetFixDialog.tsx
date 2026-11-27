// "Fix the reset DRC" — the proposal, for review, before anything is recorded.
//
// The engineer's judgement is the point of this screen. The tool can work out which resets fail
// and what the standard patch is; it cannot know that one of them is deliberately uncontrollable,
// or that another is someone else's block. So every proposed action is listed with the command it
// will run and the reason it was proposed, ticked, and untickable — and nothing happens until
// Apply. What Apply then runs is exactly the list that was read.

import { useMemo, useState } from "react";
import { proposeResetFixes, type FixAction, type FixInput } from "./core/resetFix.ts";

function Dialog({ input, onDone }: { input: FixInput; onDone: (a: FixAction[] | null) => void }) {
  const proposed = useMemo(() => proposeResetFixes(input), [input]);
  const [on, setOn] = useState<boolean[]>(() => proposed.map((a) => a.on));
  const picked = proposed.filter((_, i) => on[i]);
  const muxes = proposed.filter((a) => a.kind === "mux").length;
  const dels = proposed.filter((a) => a.command.startsWith("delete_")).length;
  const flops = proposed.filter((a, i) => a.kind === "mux" && on[i])
                        .reduce((n, a) => n + (a.flops ?? 0), 0);

  // ---- GENERATED SCRIPTS, right here in the review ("同时 review 生成的脚本") ----
  // Block 1: exactly what Apply will run, live with the checkboxes. Block 2: what the
  // replayable dfx_dft_plan.tcl becomes AFTER those commands — current plan state with the
  // ticked deletes removed and the ticked adds appended. What is read here is what lands on
  // disk; no surprise between the dialog and the file.
  const [showScript, setShowScript] = useState(true);
  const norm = (x: string) => x.replace(/[.:]/g, "/");
  const runScript = picked.filter((a) => !a.command.startsWith("#"))
                          .map((a) => a.command).join("\n");
  const planPreview = useMemo(() => {
    const deleted = new Set(
      picked.filter((a) => a.command.startsWith("delete_dft_ctrl_mux"))
            .map((a) => norm(a.target ?? a.command.split(/\s+/)[1] ?? "")));
    const lines: string[] = ["# dfx_dft_plan.tcl (计划部分, 执行后)"];
    for (const ip of input.ips)
      lines.push(`add_dft_ip ${ip.module} -instance ${ip.instance}` +
                 (ip.at ? ` -at ${ip.at}` : ""));
    for (const a of picked) if (a.kind === "ip") lines.push(a.command);
    for (const m of input.currentMuxes ?? [])
      if (!deleted.has(norm(m.target)))
        lines.push(`add_dft_ctrl_mux ${norm(m.target)} -override_source ${m.overrideSource}` +
                   ` -select ${m.select}`);
    for (const a of picked)
      if (a.kind === "mux" && a.command.startsWith("add_dft_ctrl_mux")) lines.push(a.command);
    return lines.join("\n");
  }, [picked, input.ips, input.currentMuxes]);
  const copy = (t: string) => { void navigator.clipboard?.writeText(t); };
  const preStyle: React.CSSProperties = {
    margin: 0, padding: "6px 8px", maxHeight: 140, overflow: "auto",
    fontSize: 11, lineHeight: 1.45, whiteSpace: "pre", background: "rgba(0,0,0,0.25)",
    border: "1px solid #333a44", borderRadius: 4,
  };

  return (
    <div className="gc-prompt-overlay" onMouseDown={() => onDone(null)}>
      <div className="cmux-box rfix-box" onMouseDown={(e) => e.stopPropagation()}
           onKeyDown={(e) => { if (e.key === "Escape") onDone(null); }}>
        <div className="cmux-head">Fix the reset DRC — review before it is recorded</div>
        <div className="cmux-why">
          {dels > 0 && <><b>{dels} recorded mux(es) are redundant</b> — something upstream on the
            same reset is patched too, so one of them is enough. Deleting them is the first thing
            in this list.<br /></>}
          {muxes === 0
            ? "No failing reset needs a new mux. Anything already patched is left alone."
            : <>Every failing reset gets a control mux driven by the DFX controller, so it can be
                held inactive in test. <b>Nothing is inserted</b> — this records a plan into{" "}
                <code>dfx_dft_plan.tcl</code> that your insertion flow applies. Untick anything
                you do not want.</>}
        </div>

        <div className="rfix-list">
          {proposed.map((a, i) => (
            <label key={a.command} className={"rfix-row" + (on[i] ? "" : " off")}>
              <input type="checkbox" checked={on[i]}
                     onChange={(e) => setOn((v) => v.map((x, k) => (k === i ? e.target.checked : x)))} />
              {/* A delete is not an insertion — it must not read like one in a list you are
                  about to approve. */}
              <span className={"rfix-kind" + (a.command.startsWith("delete_") ? " del" :
                                               a.kind === "note" ? " note" : "")}>
                {a.command.startsWith("delete_") ? "DEL"
                  : a.kind === "note" ? "!"
                  : a.kind === "ip" ? "IP" : "MUX"}
              </span>
              <span className="rfix-main">
                <span className="rfix-cmd">{a.command}</span>
                <span className="rfix-why">{a.why}</span>
              </span>
            </label>
          ))}
          {proposed.length === 0 && <div className="muted pad">nothing to do</div>}
        </div>

        {/* the generated scripts, reviewed together with the actions that generate them */}
        <div style={{ padding: "4px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                        fontSize: 12, opacity: 0.85 }}
               data-btn="toggle-script"
               onClick={() => setShowScript((v) => !v)}>
            <span>{showScript ? "▾" : "▸"} 生成脚本预览 (script preview)</span>
          </div>
          {showScript && (
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, opacity: 0.7, display: "flex" }}>
                  将执行的命令 · Apply runs exactly this
                  <span style={{ flex: 1 }} />
                  <a style={{ cursor: "pointer" }} data-btn="copy-run"
                     onClick={() => copy(runScript)}>copy</a>
                </div>
                <pre style={preStyle} data-panel="run-script">{runScript || "# nothing ticked"}</pre>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, opacity: 0.7, display: "flex" }}>
                  执行后的 dfx_dft_plan.tcl(计划部分)
                  <span style={{ flex: 1 }} />
                  <a style={{ cursor: "pointer" }} data-btn="copy-plan"
                     onClick={() => copy(planPreview)}>copy</a>
                </div>
                <pre style={preStyle} data-panel="plan-preview">{planPreview}</pre>
              </div>
            </div>
          )}
        </div>

        <div className="cmux-foot">
          <span className="muted">
            {picked.length} action(s){flops ? ` · ${flops} flop(s) become controllable` : ""}
          </span>
          <span style={{ flex: 1 }} />
          <button onClick={() => onDone(null)}>Cancel</button>
          <button className="primary" disabled={!picked.length} onClick={() => onDone(picked)}>
            Record {picked.length}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Show the proposal. Resolves to the ticked actions, or null when cancelled. */
export function askResetFix(input: FixInput): Promise<FixAction[] | null> {
  return new Promise((resolve) => {
    void import("react-dom/client").then(({ createRoot }) => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      const done = (a: FixAction[] | null) => {
        root.unmount();
        host.remove();
        resolve(a);
      };
      root.render(<Dialog input={input} onDone={done} />);
    });
  });
}
