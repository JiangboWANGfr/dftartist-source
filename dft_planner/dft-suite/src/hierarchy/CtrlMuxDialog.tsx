// add_dft_ctrl_mux, asked for in one screen instead of two blind prompts.
//
// The old flow put up `add_dft_ctrl_mux <target> — -override_source:` and then, if you answered,
// `— -select:`. Both were empty text boxes labelled with a switch name, so answering them needed
// you to already know (a) what the three roles are, (b) the exact hierarchical path of two pins
// you could not see, and (c) that a mux was being planned at all rather than inserted. That is
// three pieces of knowledge to type two strings, which is why it read as confusing.
//
// What this asks instead: the same two values, but each one PICKED from what actually exists —
// the planned DFX IP pins, the declared DFT signals, and a live search of the design — with the
// roles stated in words and the exact command shown before it is recorded.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { dftDesign as hs } from "../core-bridge/client.ts";
import { DYNAMIC_RE, STATIC_RE, dfxIpDir, scanIpLibrary, type IpModule } from "./core/dfxIpLib.ts";

export interface CtrlMuxSpec { target: string; overrideSource: string; select: string }

// The DFT side of a control mux is the SAME pair of IP pins for every net in a design — that is
// what the methodology says. Asking for it again on the eleventh reset is the actual cost, so it
// is remembered once and reused: the dialog opens pre-filled, and the context menu can record a
// mux with no dialog at all.
const KEY_SRC = "dft-suite.ctrlMux.source";
const KEY_SEL = "dft-suite.ctrlMux.select";

export interface CtrlMuxDefaults { overrideSource: string; select: string }

export function ctrlMuxDefaults(): CtrlMuxDefaults {
  return {
    overrideSource: localStorage.getItem(KEY_SRC) ?? "",
    select: localStorage.getItem(KEY_SEL) ?? "",
  };
}
export function setCtrlMuxDefaults(d: CtrlMuxDefaults): void {
  if (d.overrideSource) localStorage.setItem(KEY_SRC, d.overrideSource);
  if (d.select) localStorage.setItem(KEY_SEL, d.select);
}
export const hasCtrlMuxDefaults = (): boolean => {
  const d = ctrlMuxDefaults();
  return !!d.overrideSource && !!d.select;
};

/** Suggestions gathered from the session: planned DFX IP pins and declared DFT signals, plus
 *  the ready-made pairs — a dynamic controller and a static TDR are always used together. */
interface Suggests { source: string[]; select: string[]; pairs: Array<{ label: string; src: string; sel: string }> }

const pathOf = (x: { instance: string; at: string }) =>
  (x.at ? x.at.replace(/[.:]/g, "/") + "/" : "") + x.instance;

async function gatherSuggests(): Promise<Suggests> {
  const source: string[] = [];
  const select: string[] = [];
  const pairs: Suggests["pairs"] = [];
  let ips: Array<{ instance: string; module: string; at: string }> = [];
  try {
    const st = await hs.dpShell("report_dft_ips");
    ips = (st.dftIps ?? []).map((x) => ({ instance: x.instance, module: x.module, at: x.at }));
  } catch { /* shell not ready */ }

  // The IP's pins live in the LIBRARY, not in the design: nothing is instantiated yet, so a
  // design search finds none of them. Every output pin of every planned IP is a candidate, and
  // the two house pins are floated to the front of their list.
  let lib: IpModule[] = [];
  try {
    lib = await scanIpLibrary(dfxIpDir(),
      (d) => (window as unknown as { dft: { project: { listDir(d: string): Promise<string[]> } } }).dft.project.listDir(d),
      (f) => hs.readSource(f));
  } catch { /* no library configured */ }

  const rank = (pin: string, want: RegExp) => (want.test(pin) ? 0 : 1);
  for (const ip of ips) {
    const mod = lib.find((m) => m.name === ip.module);
    const outs = (mod?.ports ?? []).filter((p) => p.dir !== "in").map((p) => p.name);
    const pins = outs.length ? outs : (DYNAMIC_RE.test(ip.module) ? ["dfx_rst_scan_n"]
                                     : STATIC_RE.test(ip.module) ? ["dfx_scan_mode"] : []);
    const base = pathOf(ip);
    for (const pin of pins) {
      const full = `${base}/${pin}`;
      if (DYNAMIC_RE.test(ip.module)) source.push(full);
      else if (STATIC_RE.test(ip.module)) select.push(full);
      else { source.push(full); select.push(full); }
    }
  }
  source.sort((a, b) => rank(a, /rst|reset/i) - rank(b, /rst|reset/i));
  select.sort((a, b) => rank(a, /scan_mode|mode/i) - rank(b, /scan_mode|mode/i));

  try {
    const st = await hs.dpShell("report_dft_signals");
    // "  scan_en  <- top/scan_en" — the declared signals are exactly what a select should be.
    for (const line of st.output.split(/\r?\n/)) {
      const m = /^\s{2,}(\S+)/.exec(line);
      if (m && !select.includes(m[1])) select.push(m[1]);
    }
  } catch { /* no signals declared */ }

  // One button that fills both fields: the pair is how these IPs are actually used.
  if (source.length && select.length)
    pairs.push({ label: `${source[0].split("/").slice(-2).join("/")}  +  ${select[0].split("/").slice(-2).join("/")}`,
                 src: source[0], sel: select[0] });
  return { source, select, pairs };
}

/** Modules in the library that look like the standard control pair, for the setup button. */
async function houseModules(): Promise<{ dynamic?: string; static?: string }> {
  try {
    const lib = await scanIpLibrary(dfxIpDir(),
      (d) => (window as unknown as { dft: { project: { listDir(d: string): Promise<string[]> } } }).dft.project.listDir(d),
      (f) => hs.readSource(f));
    return {
      dynamic: lib.find((m) => DYNAMIC_RE.test(m.name))?.name,
      static: lib.find((m) => STATIC_RE.test(m.name))?.name,
    };
  } catch { return {}; }
}

/** Design objects matching what has been typed so far — the picker's live half. */
async function searchDesign(term: string): Promise<string[]> {
  const t = term.trim();
  if (t.length < 2) return [];
  const pat = t.includes("*") ? t : `*${t}*`;
  try {
    const r = await hs.dpShell(`concat [get_pins {${pat}} -silent -limit 40] [get_ports {${pat}} -silent -limit 20]`);
    if (!r.ok) return [];
    // The result is a Tcl list on the last line of the output.
    const last = r.output.trim().split(/\r?\n/).pop() ?? "";
    return last.split(/\s+/).filter((s) => s && !s.startsWith("#")).slice(0, 40);
  } catch { return []; }
}

function Field({ label, hint, value, onChange, suggests }: {
  label: string; hint: string; value: string;
  onChange: (v: string) => void; suggests: string[];
}) {
  const [hits, setHits] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // Search the design as you type — a pin you cannot name is a pin you cannot type.
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void searchDesign(value).then(setHits); }, 250);
    return () => window.clearTimeout(timer.current);
  }, [value]);

  const list = useMemo(() => {
    const seen = new Set<string>();
    return [...suggests, ...hits].filter((s) => !seen.has(s) && seen.add(s)).slice(0, 24);
  }, [suggests, hits]);

  return (
    <div className="cmux-field">
      <div className="cmux-label">{label}</div>
      <div className="cmux-hint">{hint}</div>
      <input type="text" value={value} spellCheck={false} placeholder="type to search the design…"
             onChange={(e) => { onChange(e.target.value); setOpen(true); }}
             onFocus={() => setOpen(true)} />
      {open && list.length > 0 && (
        <div className="cmux-hits">
          {list.map((s) => (
            <button key={s} className={s === value ? "on" : ""}
                    onClick={() => { onChange(s); setOpen(false); }}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Dialog({ target, onDone }: { target: string; onDone: (s: CtrlMuxSpec[] | null) => void }) {
  const [tgt, setTgt] = useState(target);
  const d0 = ctrlMuxDefaults();
  const [src, setSrc] = useState(d0.overrideSource);
  const [sel, setSel] = useState(d0.select);
  const [remember, setRemember] = useState(true);
  const [sug, setSug] = useState<Suggests>({ source: [], select: [], pairs: [] });
  const [house, setHouse] = useState<{ dynamic?: string; static?: string }>({});
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const s = await gatherSuggests();
    setSug(s);
    // Only fill what is still empty — a remembered answer outranks a fresh guess.
    setSrc((v) => v || s.source[0] || "");
    setSel((v) => v || s.select[0] || "");
  }, []);
  useEffect(() => { void reload(); void houseModules().then(setHouse); }, [reload]);

  /** Plan the standard control pair right here. Until the IPs exist there is nothing to pick
   *  from, and sending the user to another tab to come back is the long way round. */
  const setupPair = useCallback(async () => {
    setBusy(true);
    try {
      for (const m of [house.dynamic, house.static]) {
        if (!m) continue;
        await hs.dpShell(`add_dft_ip ${m} -instance u_${m}`);
      }
      await reload();
    } finally { setBusy(false); }
  }, [house, reload]);

  // Several targets at once: one mux per line/space-separated path. Patching eight resets is
  // eight identical answers to the same two questions otherwise.
  const targets = useMemo(
    () => tgt.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean),
    [tgt]);
  const ready = targets.length > 0 && !!src.trim() && !!sel.trim();
  const specs = (): CtrlMuxSpec[] =>
    targets.map((t) => ({ target: t, overrideSource: src.trim(), select: sel.trim() }));
  const cmd = targets.length
    ? `add_dft_ctrl_mux ${targets[0]} -override_source ${src.trim() || "<source>"} -select ${sel.trim() || "<select>"}` +
      (targets.length > 1 ? `
…and ${targets.length - 1} more` : "")
    : "add_dft_ctrl_mux <target> …";

  return (
    <div className="gc-prompt-overlay" onMouseDown={() => onDone(null)}>
      <div className="cmux-box" onMouseDown={(e) => e.stopPropagation()}
           onKeyDown={(e) => { if (e.key === "Escape") onDone(null); }}>
        <div className="cmux-head">Plan a DFT control mux</div>
        <div className="cmux-why">
          Records a mux on this net so test mode can drive it. Nothing is inserted now — the plan
          is written to <code>dfx_dft_plan.tcl</code> and your insertion flow applies it.
        </div>

        <div className="cmux-field">
          <div className="cmux-label">on this net / pin{targets.length > 1 ? ` — ${targets.length} targets` : ""}</div>
          <div className="cmux-hint">what gets a mux in front of it; keeps its functional driver in
            normal mode. Paste several, one per line, to patch them all at once.</div>
          <textarea rows={targets.length > 1 ? 4 : 1} value={tgt} spellCheck={false}
                    onChange={(e) => setTgt(e.target.value)} />
        </div>

        {/* THE ONE-CLICK PATH. The DFT side is the same pair for every net in a design; picking
            it twice per mux was the whole complaint. */}
        {sug.pairs.length > 0 && (
          <div className="cmux-presets">
            <span className="cmux-hint">use the planned DFX IPs:</span>
            {sug.pairs.map((p) => (
              <button key={p.src + p.sel} className="findbtn"
                      title={`-override_source ${p.src}
-select ${p.sel}`}
                      onClick={() => { setSrc(p.src); setSel(p.sel); }}>{p.label}</button>
            ))}
          </div>
        )}
        {/* Nothing to pick from because nothing is planned yet. The pins of a DFX IP are not in
            the design — that is what an un-instantiated IP means — so this is the step that has
            to happen first, and it may as well happen here. */}
        {sug.pairs.length === 0 && (house.dynamic || house.static) && (
          <div className="cmux-presets">
            <span className="cmux-hint">no DFX IP planned yet —</span>
            <button className="findbtn" disabled={busy}
                    title={`add_dft_ip ${house.dynamic ?? "?"} / ${house.static ?? "?"} (virtual: no RTL is edited)`}
                    onClick={() => void setupPair()}>
              {busy ? "planning…" : `plan ${house.dynamic ?? ""}${house.dynamic && house.static ? " + " : ""}${house.static ?? ""}`}
            </button>
          </div>
        )}
        {sug.pairs.length === 0 && !house.dynamic && !house.static && (
          <div className="cmux-presets">
            <span className="cmux-hint">
              no DFX IP library scanned — set the dfx_ip directory on the DFX IP page and the
              driver pins become pickable here.
            </span>
          </div>
        )}

        <Field label="in TEST mode, drive it from" hint="-override_source — the DFT-side driver"
               value={src} onChange={setSrc} suggests={sug.source} />
        <Field label="switched by" hint="-select — the signal that picks test over functional"
               value={sel} onChange={setSel} suggests={sug.select} />

        <div className="cmux-cmd">{cmd}</div>
        <div className="cmux-foot">
          <label className="cmux-remember" title="Remembered for this design: the next mux records straight from the context menu, no dialog.">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            remember this pair
          </label>
          <span style={{ flex: 1 }} />
          <button onClick={() => onDone(null)}>Cancel</button>
          <button className="primary" disabled={!ready}
                  onClick={() => {
                    if (remember) setCtrlMuxDefaults({ overrideSource: src.trim(), select: sel.trim() });
                    onDone(specs());
                  }}>
            Record{targets.length > 1 ? ` ${targets.length}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Ask for control muxes. Resolves to null when cancelled, else one spec per target. */
export function askCtrlMuxDialog(target: string): Promise<CtrlMuxSpec[] | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (s: CtrlMuxSpec[] | null) => {
      root.unmount();
      host.remove();
      resolve(s);
    };
    root.render(<Dialog target={target} onDone={done} />);
  });
}

/** The command this spec records — one renderer, so the preview and what runs cannot differ. */
export function ctrlMuxCommand(s: CtrlMuxSpec): string {
  return `add_dft_ctrl_mux ${s.target} -override_source ${s.overrideSource} -select ${s.select}`;
}
