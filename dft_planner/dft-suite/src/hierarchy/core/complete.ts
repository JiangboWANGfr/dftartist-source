// Tab completion for the dp_shell console.
//
// The candidate list is NOT written here: it comes from `report_commands -completion`, which the
// shell generates from the same registry that answers `-help`. A completion table maintained on
// this side would start offering switches the command no longer takes the first time one is
// renamed, and nobody would notice until it was typed at a real design.

export interface CmdInfo { name: string; opts: string[] }

/** Parse the shell's completion feed: one line per command, `name\t-opt -opt …`. */
export function parseCompletion(text: string): CmdInfo[] {
  const out: CmdInfo[] = [];
  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf("\t");
    if (at <= 0) continue;
    const name = line.slice(0, at).trim();
    if (!name || name.startsWith("#")) continue;
    out.push({ name, opts: line.slice(at + 1).split(/\s+/).filter(Boolean) });
  }
  return out;
}

/** The longest string every candidate starts with — what Tab fills in when the choice is not
 *  yet unique, the way a shell does it. */
export function commonPrefix(xs: readonly string[]): string {
  if (!xs.length) return "";
  let p = xs[0];
  for (const s of xs) {
    let i = 0;
    while (i < p.length && i < s.length && p[i] === s[i]) i++;
    p = p.slice(0, i);
    if (!p) break;
  }
  return p;
}

export interface Completion {
  /** The line after completing, or null when there is nothing to add. */
  line: string | null;
  /** Every candidate, for the "press Tab twice to list" behaviour. */
  candidates: string[];
}

/**
 * Complete `line` (caret assumed at the end).
 *
 * Three cases, decided by what is actually being typed:
 *   - the first word            -> a command name
 *   - a word starting with '-'  -> a switch of the command in the first word
 *   - anything else             -> a path, offered by the caller through `paths`
 */
export function complete(line: string, cmds: readonly CmdInfo[], paths: readonly string[] = []): Completion {
  // Complete the word under the caret; everything before it is kept verbatim so quoting,
  // brackets and multi-command lines survive.
  const word = wordAt(line);
  const head = line.slice(0, line.length - word.length);
  // Command position is where Tcl would start a command: line start, or after ; [ { } or a
  // newline. `foreach p [get_po` is completing a COMMAND, not a path — the bracket is what says
  // so, and treating it as a path is why nested commands used to complete to nothing.
  const seg = head.slice(Math.max(0, ...[";", "[", "{", "}", "\n"].map((ch) => head.lastIndexOf(ch) + 1)));
  const before = seg.trim();

  let pool: string[];
  if (!before) {
    pool = cmds.map((c) => c.name);
  } else if (word.startsWith("-")) {
    const cmd = cmds.find((c) => c.name === before.split(/\s+/)[0]);
    pool = cmd ? cmd.opts : [];
  } else {
    pool = [...paths];
  }
  const hits = pool.filter((p) => p.startsWith(word)).sort();
  if (!hits.length) return { line: null, candidates: [] };
  const pre = commonPrefix(hits);
  // A single hit is finished off with a space — the next thing typed is a new word.
  if (hits.length === 1) return { line: head + hits[0] + " ", candidates: hits };
  return { line: pre.length > word.length ? head + pre : null, candidates: hits };
}

/** The word the caret sits in: everything back to the last separator. */
export function wordAt(line: string): string {
  const m = /[^\s;[\]{}"]*$/.exec(line);
  return m ? m[0] : "";
}
