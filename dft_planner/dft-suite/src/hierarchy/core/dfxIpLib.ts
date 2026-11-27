// The user's dfx_ip library: module names and their ports, parsed from the Verilog.
//
// This exists as its own module because TWO screens need it and for the same reason: the pins of
// a DFX IP (`dfx_rst_scan_n`, `dfx_scan_mode`) do NOT exist in the elaborated design — the IP has
// not been instantiated yet, that is the whole point of planning one. Searching the design for
// them therefore returns nothing, which is why the control-mux dialog could only be filled in by
// typing from memory. The library is where those names actually live.

export interface IpPort { name: string; dir: "in" | "out" | "inout" }
export interface IpModule {
  name: string;
  file: string;
  ports: IpPort[];
  /** Byte range of this module inside its file, so a source view can show THIS module. */
  at: number;
  end: number;
}

/** Light Verilog header parse: module name + ANSI/non-ANSI port decls. Enough for IP stubs. */
export function parseModules(file: string, text: string): IpModule[] {
  const out: IpModule[] = [];
  const re = /(^|\n)\s*module\s+([A-Za-z_]\w*)/g;
  let m: RegExpExecArray | null;
  const marks: Array<{ name: string; at: number }> = [];
  while ((m = re.exec(text))) marks.push({ name: m[2], at: m.index });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].at : text.length;
    const body = text.slice(marks[i].at, end);
    const ports: IpPort[] = [];
    const pre = /(^|\n|\(|,)\s*(input|output|inout)\b[^;,)]*?([A-Za-z_]\w*)\s*(?=[,;)\n])/g;
    let pm: RegExpExecArray | null;
    while ((pm = pre.exec(body))) {
      const dir = pm[2] === "input" ? "in" : pm[2] === "output" ? "out" : "inout";
      if (!ports.some((p) => p.name === pm![3])) ports.push({ name: pm[3], dir });
    }
    out.push({ name: marks[i].name, file, ports, at: marks[i].at, end });
  }
  return out;
}

export const DFX_IP_DIR_KEY = "dft-suite.dfxIpDir";
export const dfxIpDir = (): string => localStorage.getItem(DFX_IP_DIR_KEY) ?? "";

/** Scanned once per directory per session — the dialog opens often and the files do not move. */
const cache = new Map<string, IpModule[]>();

export async function scanIpLibrary(
  dir: string,
  listDir: (d: string) => Promise<string[]>,
  readSource: (f: string) => Promise<string>,
): Promise<IpModule[]> {
  const key = dir.replace(/[\\/]$/, "");
  if (!key) return [];
  const hit = cache.get(key);
  if (hit) return hit;
  const mods: IpModule[] = [];
  const names = await listDir(key);
  for (const n of names.filter((x) => x.endsWith(".v") || x.endsWith(".sv"))) {
    const full = `${key}/${n}`;
    try { mods.push(...parseModules(full, await readSource(full))); }
    catch { /* unreadable file — skip */ }
  }
  cache.set(key, mods);
  localStorage.setItem(DFX_IP_DIR_KEY, key);
  return mods;
}

/** Drop the memo for a directory (the Scan button re-reads from disk). */
export function forgetIpLibrary(dir?: string): void {
  if (dir) cache.delete(dir.replace(/[\\/]$/, ""));
  else cache.clear();
}

/** The house pair: the dynamic controller drives the test value, the static TDR the select. */
export const DYNAMIC_RE = /dynamic/i;
export const STATIC_RE = /static/i;
