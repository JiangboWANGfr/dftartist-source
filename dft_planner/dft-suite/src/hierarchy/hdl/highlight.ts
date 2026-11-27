// Verilog / SystemVerilog / VHDL tokenizer for the read-only source viewer.
// Self-contained (no external highlighter): the app runs offline behind a strict CSP, and a
// hand-rolled lexer is both smaller and lets search highlighting share the same token spans.
//
// Tokenizes the WHOLE file in one pass so block comments (/* */) and VHDL's line comments carry
// state across lines correctly, then slices the token stream per line.

export type Lang = "verilog" | "systemverilog" | "vhdl";

/** class name applied to the span */
export type TokClass =
  | "t-cmt" | "t-str" | "t-num" | "t-dir" | "t-kw" | "t-type" | "t-op" | "t-id";

/** A token inside one line, in COLUMN offsets (so search ranges can be merged with it). */
export interface Tok { c: TokClass; s: number; e: number }

const VERILOG_KW = `always always_comb always_ff always_latch and assign automatic begin buf bufif0
bufif1 case casex casez cell cmos config deassign default defparam design disable edge else end
endcase endconfig endfunction endgenerate endmodule endprimitive endspecify endtable endtask event
for force forever fork function generate genvar highz0 highz1 if ifnone incdir include initial
inout input instance join large liblist library localparam macromodule medium module nand negedge
nmos nor noshowcancelled not notif0 notif1 or output parameter pmos posedge primitive pull0 pull1
pulldown pullup rcmos real realtime reg release repeat rnmos rpmos rtran rtranif0 rtranif1 scalared
showcancelled signed small specify specparam strong0 strong1 supply0 supply1 table task time tran
tranif0 tranif1 tri tri0 tri1 triand trior trireg unsigned use vectored wait wand weak0 weak1 while
wire wor xnor xor`.split(/\s+/);

const SV_KW = `accept_on alias assert assume before bind bins binsof bit break byte chandle checker
class clocking const constraint context continue cover covergroup coverpoint cross dist do endclass
endclocking endgroup endinterface endpackage endprogram endproperty endsequence enum eventually
expect export extends extern final first_match foreach forkjoin global iff ignore_bins
illegal_bins implements implies import inside int interface intersect join_any join_none let local
logic longint matches modport new nexttime null package packed priority program property protected
pure rand randc randcase randsequence ref reject_on restrict return s_always s_eventually s_nexttime
s_until s_until_with sequence shortint shortreal soft solve static string strong struct super
sync_accept_on sync_reject_on tagged this throughout timeprecision timeunit type typedef union
unique unique0 until until_with untyped var virtual void wait_order weak wildcard with within`.split(/\s+/);

const VHDL_KW = `abs access after alias all and architecture array assert attribute begin block body
buffer bus case component configuration constant disconnect downto else elsif end entity exit file
for function generate generic group guarded if impure in inertial inout is label library linkage
literal loop map mod nand new next nor not null of on open or others out package port postponed
procedure process pure range record register reject rem report return rol ror select severity
shared signal sla sll sra srl subtype then to transport type unaffected units until use variable
wait when while with xnor xor`.split(/\s+/);

const VHDL_TYPES = `bit bit_vector boolean character integer natural positive real severity_level
signed std_logic std_logic_vector std_ulogic std_ulogic_vector string time unsigned`.split(/\s+/);

const set = (a: string[]) => new Set(a.filter(Boolean));
const VKW = set(VERILOG_KW);
const SVKW = set([...VERILOG_KW, ...SV_KW]);
const VHKW = set(VHDL_KW);
const VHTY = set(VHDL_TYPES);
/** Verilog/SV words rendered as types rather than control keywords. */
const V_TYPES = set(`wire reg logic bit byte int integer shortint longint real realtime time
string chandle event void struct union enum packed signed unsigned tri tri0 tri1 wand wor supply0
supply1 input output inout parameter localparam genvar var`.split(/\s+/));

/** Pick the language from the file extension, falling back to a content sniff. */
export function detectLang(file: string, text: string): Lang {
  const ext = (file.split(".").pop() ?? "").toLowerCase();
  if (ext === "vhd" || ext === "vhdl" || ext === "vho") return "vhdl";
  if (ext === "sv" || ext === "svh" || ext === "svi") return "systemverilog";
  if (ext === "v" || ext === "vh" || ext === "verilog") {
    // A .v file using SV-only constructs is still better highlighted as SystemVerilog.
    return /\b(always_ff|always_comb|always_latch|logic\s|typedef|interface\b|package\b)/.test(text)
      ? "systemverilog" : "verilog";
  }
  const head = text.slice(0, 8000);
  if (/\b(entity|architecture)\b[\s\S]*\bis\b/i.test(head) || /\blibrary\s+ieee\s*;/i.test(head))
    return "vhdl";
  if (/\b(always_ff|always_comb|logic\b|typedef|class\b|interface\b)/.test(head)) return "systemverilog";
  return "verilog";
}

const isIdStart = (ch: string) => /[A-Za-z_$\\]/.test(ch);
const isIdPart = (ch: string) => /[A-Za-z0-9_$]/.test(ch);
const isDigit = (ch: string) => ch >= "0" && ch <= "9";

/**
 * Tokenize `text` into per-line token arrays. Index i holds the tokens of line i (0-based).
 * Tokens never span lines: a multi-line construct (block comment, string) is emitted as one
 * token per line it covers, so column offsets stay local to the line.
 */
export function tokenize(text: string, lang: Lang): Tok[][] {
  const lines = text.split("\n");
  const out: Tok[][] = lines.map(() => []);
  const vhdl = lang === "vhdl";
  const kw = vhdl ? VHKW : lang === "systemverilog" ? SVKW : VKW;

  let inBlock = false;   // inside /* ... */ (Verilog/SV) — VHDL /* */ exists in VHDL-2008 too
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const toks = out[li];
    let i = 0;
    const push = (c: TokClass, s: number, e: number) => { if (e > s) toks.push({ c, s, e }); };

    while (i < line.length) {
      const ch = line[i];

      if (inBlock) {
        const end = line.indexOf("*/", i);
        if (end < 0) { push("t-cmt", i, line.length); i = line.length; }
        else { push("t-cmt", i, end + 2); i = end + 2; inBlock = false; }
        continue;
      }
      // whitespace
      if (ch === " " || ch === "\t" || ch === "\r") { i++; continue; }
      // comments
      if (!vhdl && ch === "/" && line[i + 1] === "/") { push("t-cmt", i, line.length); break; }
      if (vhdl && ch === "-" && line[i + 1] === "-") { push("t-cmt", i, line.length); break; }
      if (ch === "/" && line[i + 1] === "*") {
        const end = line.indexOf("*/", i + 2);
        if (end < 0) { push("t-cmt", i, line.length); inBlock = true; i = line.length; }
        else { push("t-cmt", i, end + 2); i = end + 2; }
        continue;
      }
      // strings
      if (ch === '"') {
        let j = i + 1;
        while (j < line.length && line[j] !== '"') { if (!vhdl && line[j] === "\\") j++; j++; }
        push("t-str", i, Math.min(line.length, j + 1));
        i = j + 1;
        continue;
      }
      // VHDL character literal '1' / 'Z' (but not an attribute tick like sig'event)
      if (vhdl && ch === "'" && line[i + 2] === "'" && !isIdPart(line[i - 1] ?? " ")) {
        push("t-str", i, i + 3); i += 3; continue;
      }
      // Verilog compiler directive: `define / `ifdef / `include ...
      if (!vhdl && ch === "`") {
        let j = i + 1;
        while (j < line.length && isIdPart(line[j])) j++;
        push("t-dir", i, j); i = j; continue;
      }
      // Verilog sized literal: 4'b1010, 32'h0, 'd7  — and plain numbers
      if (isDigit(ch) || (!vhdl && ch === "'" && /[bBoOdDhH]/.test(line[i + 1] ?? ""))) {
        let j = i;
        while (j < line.length && /[0-9_]/.test(line[j])) j++;
        if (!vhdl && line[j] === "'") {
          j++;
          if (/[sS]/.test(line[j] ?? "")) j++;
          if (/[bBoOdDhH]/.test(line[j] ?? "")) j++;
          while (j < line.length && /[0-9a-fA-FxXzZ?_]/.test(line[j])) j++;
        } else {
          if (line[j] === "." && isDigit(line[j + 1] ?? "")) { j++; while (j < line.length && /[0-9_]/.test(line[j])) j++; }
          if (/[eE]/.test(line[j] ?? "") && /[-+0-9]/.test(line[j + 1] ?? "")) {
            j += 2; while (j < line.length && isDigit(line[j])) j++;
          }
        }
        push("t-num", i, j); i = j; continue;
      }
      // VHDL based literal x"FF" / b"1010"
      if (vhdl && /[xXoObB]/.test(ch) && line[i + 1] === '"') {
        const end = line.indexOf('"', i + 2);
        const e = end < 0 ? line.length : end + 1;
        push("t-num", i, e); i = e; continue;
      }
      // identifiers / keywords (Verilog escaped id: \name<space>)
      if (isIdStart(ch)) {
        let j = i;
        if (ch === "\\") { j++; while (j < line.length && line[j] !== " ") j++; }
        else { while (j < line.length && isIdPart(line[j])) j++; }
        const word = line.slice(i, j);
        const lc = vhdl ? word.toLowerCase() : word;   // VHDL is case-insensitive
        if (kw.has(lc)) push(vhdl ? (VHTY.has(lc) ? "t-type" : "t-kw") : (V_TYPES.has(lc) ? "t-type" : "t-kw"), i, j);
        else if (vhdl && VHTY.has(lc)) push("t-type", i, j);
        else push("t-id", i, j);
        i = j; continue;
      }
      // operators / punctuation
      push("t-op", i, i + 1);
      i++;
    }
  }
  return out;
}

/** Byte ranges of every match of `q` in `line`. Plain substring search (case-optional). */
export function findInLine(line: string, q: string, caseSensitive: boolean): Array<[number, number]> {
  if (!q) return [];
  const hay = caseSensitive ? line : line.toLowerCase();
  const needle = caseSensitive ? q : q.toLowerCase();
  const out: Array<[number, number]> = [];
  let from = 0;
  for (;;) {
    const k = hay.indexOf(needle, from);
    if (k < 0) break;
    out.push([k, k + needle.length]);
    from = k + Math.max(1, needle.length);
  }
  return out;
}

/** Split a line's tokens at match boundaries so search marks compose with syntax colours.
 *  Returns render-ready pieces covering the whole line, including untokenized whitespace. */
export function sliceLine(line: string, toks: Tok[], matches: Array<[number, number]>,
): Array<{ text: string; c: TokClass | ""; hit: boolean }> {
  const cuts = new Set<number>([0, line.length]);
  for (const t of toks) { cuts.add(t.s); cuts.add(t.e); }
  for (const [s, e] of matches) { cuts.add(s); cuts.add(e); }
  const pts = [...cuts].filter((p) => p >= 0 && p <= line.length).sort((a, b) => a - b);
  const classAt = (p: number): TokClass | "" => {
    for (const t of toks) if (p >= t.s && p < t.e) return t.c;
    return "";
  };
  const inMatch = (p: number) => matches.some(([s, e]) => p >= s && p < e);
  const out: Array<{ text: string; c: TokClass | ""; hit: boolean }> = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const s = pts[k], e = pts[k + 1];
    if (e <= s) continue;
    out.push({ text: line.slice(s, e), c: classAt(s), hit: inMatch(s) });
  }
  return out;
}
