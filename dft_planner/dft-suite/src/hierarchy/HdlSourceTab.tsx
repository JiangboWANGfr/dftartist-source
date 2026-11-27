// Read-only source viewer: loads a file via window.hs.readSource, renders with line numbers,
// syntax highlighting (Verilog / SystemVerilog / VHDL, auto-detected) and a Ctrl+F find bar.
// Highlights + scrolls to the target line. Shared by Show-HDL-definition and
// Show-HDL-instantiation (one component, two callers).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HdlTab } from "./core/model.ts";
import { dftDesign as hs } from "../core-bridge/client.ts";
import { detectLang, findInLine, sliceLine, tokenize } from "./hdl/highlight.ts";

/** Scroll memory per file (module level, so it survives the tab unmounting on tab switch).
 *  `line` records which target line that scroll position belonged to: reopening the SAME file at
 *  the SAME target restores where the user was reading; a Show-HDL pointing at a NEW line still
 *  jumps to it. */
const scrollMem = new Map<string, { top: number; line: number }>();

export function HdlSourceTab({ tab }: { tab: HdlTab }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const hitRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const curRef = useRef<HTMLSpanElement>(null);

  // ---- find state
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [cur, setCur] = useState(0);

  useEffect(() => {
    let alive = true;
    setText(null);
    setErr(null);
    hs.readSource(tab.file)
      .then((t) => { if (alive) setText(t); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [tab.file]);

  const lines = useMemo(() => (text == null ? [] : text.split("\n")), [text]);
  const lang = useMemo(() => (text == null ? "verilog" : detectLang(tab.file, text)), [tab.file, text]);
  // Tokenizing is the expensive step — do it once per file, not per keystroke.
  const toks = useMemo(() => (text == null ? [] : tokenize(text, lang)), [text, lang]);

  // Matches as flat [lineIdx, start, end] so prev/next is a simple index walk.
  const matches = useMemo(() => {
    if (!query) return [] as Array<[number, number, number]>;
    const out: Array<[number, number, number]> = [];
    for (let i = 0; i < lines.length; i++)
      for (const [s, e] of findInLine(lines[i], query, caseSensitive)) out.push([i, s, e]);
    return out;
  }, [lines, query, caseSensitive]);

  // Per-line match ranges, for rendering.
  const byLine = useMemo(() => {
    const m = new Map<number, Array<[number, number]>>();
    for (const [li, s, e] of matches) {
      const a = m.get(li);
      if (a) a.push([s, e]); else m.set(li, [[s, e]]);
    }
    return m;
  }, [matches]);

  useEffect(() => { setCur(0); }, [query, caseSensitive]);

  // Restore where the user was reading when reopening the same file at the same target;
  // otherwise jump to the target line. Afterwards the find bar owns scrolling.
  useEffect(() => {
    if (text == null) return;
    const mem = scrollMem.get(tab.file);
    if (mem && mem.line === tab.line && wrapRef.current) wrapRef.current.scrollTop = mem.top;
    else hitRef.current?.scrollIntoView({ block: "center" });
  }, [text, tab.file, tab.line]);
  useEffect(() => {
    if (matches.length) curRef.current?.scrollIntoView({ block: "center" });
  }, [cur, matches.length]);

  const step = useCallback((d: number) => {
    setCur((c) => (matches.length === 0 ? 0 : (c + d + matches.length) % matches.length));
  }, [matches.length]);

  // Ctrl+F opens the bar and focuses it; Esc closes. Bound on the container so it only fires
  // for this tab (and does not fight the app-level shortcuts when the tab is not focused).
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      setFindOpen(true);
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
      return;
    }
    if (e.key === "Escape" && findOpen) { e.preventDefault(); setFindOpen(false); wrapRef.current?.focus(); }
  }, [findOpen]);

  const onFindKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    else if (e.key === "Escape") { e.preventDefault(); setFindOpen(false); wrapRef.current?.focus(); }
  };

  if (err) return <div className="muted pad">Read failed: {tab.file} ({err})</div>;
  if (text == null) return <div className="muted pad">Loading {tab.file}…</div>;

  const curMatch = matches[cur];
  return (
    <div className="hdlwrap" ref={wrapRef} tabIndex={0} onKeyDown={onKeyDown}
         onScroll={(e) => scrollMem.set(tab.file, { top: e.currentTarget.scrollTop, line: tab.line })}>
      {findOpen && (
        <div className="findbar">
          <input
            ref={inputRef}
            className="findinput"
            placeholder="Find"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onFindKey}
            spellCheck={false}
          />
          <span className="findcount">
            {query === "" ? "" : matches.length === 0 ? "No results" : `${cur + 1}/${matches.length}`}
          </span>
          <button className="findbtn" title="Match case (Aa)" data-on={caseSensitive || undefined}
                  onClick={() => setCaseSensitive((v) => !v)}>Aa</button>
          <button className="findbtn" title="Previous (Shift+Enter)" onClick={() => step(-1)} disabled={!matches.length}>↑</button>
          <button className="findbtn" title="Next (Enter)" onClick={() => step(1)} disabled={!matches.length}>↓</button>
          <button className="findbtn" title="Close (Esc)" onClick={() => setFindOpen(false)}>✕</button>
        </div>
      )}
      <div className={"hdl lang-" + lang}>
        {lines.map((ln, i) => {
          const n = i + 1;
          const hit = n === tab.line;
          const lm = byLine.get(i);
          const pieces = lm && lm.length
            ? sliceLine(ln, toks[i] ?? [], lm)
            : sliceLine(ln, toks[i] ?? [], []);
          // column where the current match starts on this line (to tag the active mark)
          const curCol = curMatch && curMatch[0] === i ? curMatch[1] : -1;
          let col = 0;
          return (
            <div key={n} ref={hit ? hitRef : undefined} className={"hline" + (hit ? " hit" : "")}>
              <span className="lno">{n}</span>
              <span className="lcode">
                {ln === "" ? " " : pieces.map((p, k) => {
                  const start = col;
                  col += p.text.length;
                  const active = p.hit && start === curCol;
                  return (
                    <span key={k}
                          ref={active ? curRef : undefined}
                          className={(p.c || "") + (p.hit ? (active ? " mark cur" : " mark") : "")}>
                      {p.text}
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
