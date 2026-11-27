// OCC definition points -> the `Occ { … }` DftSpecification block.
//
// The points themselves come from dp_shell (`add_occ_point` / `report_occ_def_points`), which is
// already the one record of what the engineer declared. This turns that record into the spec the
// flow reads, so the two cannot drift: the same list that drives the DRC run produces the
// controllers, and a point that is not in the shell does not appear here.
//
// Everything a controller needs beyond its intercept node is a JUDGEMENT — the capture window, a
// name that is not just the clock's — so those are stored per controller and survive round-trips.

import type { DpOccPoint } from "../../core-bridge/model.ts";

/** Per-controller settings. Absent fields fall back to the block-level value. */
export interface OccController {
  /** `capture_window_size` for this controller only. */
  captureWindowSize?: number;
  /** Overrides the pin from the shell — for the case where the real intercept is a cell output
   *  the shell recorded one level away (`…_buf/Z`). */
  interceptNode?: string;
  /** Anything else this controller needs, verbatim: `key: value;`. The Occ grammar carries more
   *  than we model, and a generator that cannot express the rest gets hand-edited afterwards. */
  extra?: Record<string, string>;
}

export interface OccSpecOptions {
  ijtagHostInterface: string;
  includeClocksInIclModel: boolean;
  /** Block-level default; a controller may narrow it. */
  captureWindowSize: number;
  /** Wrap in `read_config_data -in_wrapper $dftspec -rep -from_string { … }` — how the reference
   *  scripts feed it in. Off gives the bare block, for pasting into a spec file. */
  wrapInReadConfigData: boolean;
  controllers: Record<string, OccController>;
}

export function defaultOccSpecOptions(): OccSpecOptions {
  return {
    ijtagHostInterface: "Sib(occ)",
    includeClocksInIclModel: true,
    captureWindowSize: 5,
    wrapInReadConfigData: true,
    controllers: {},
  };
}

/** Controller name for an OCC point: the clock it belongs to, else the pin's leaf. Tessent's own
 *  scripts name them after the clock (`aclk`, `c2_atclk`), which is what makes the block
 *  readable next to the clock tree. */
export function occControllerName(p: DpOccPoint): string {
  if (p.clock && p.clock.trim()) return p.clock.trim();
  const leaf = p.pin.split(/[/.]/).filter(Boolean).pop() ?? p.pin;
  return leaf.replace(/[^\w]/g, "_");
}

/** The `Occ { … }` block. Deterministic: same points + same options give the same text, so it
 *  can be diffed against the checked-in spec. */
export function buildOccSpec(points: DpOccPoint[], opt: OccSpecOptions): string {
  const L: string[] = [];
  const ind = (n: number) => "  ".repeat(n);
  const base = opt.wrapInReadConfigData ? 1 : 0;

  if (opt.wrapInReadConfigData) L.push("read_config_data -in_wrapper $dftspec -rep -from_string {");
  L.push(`${ind(base)}Occ {`);
  L.push(`${ind(base + 1)}ijtag_host_interface : ${opt.ijtagHostInterface};`);
  L.push(`${ind(base + 1)}include_clocks_in_icl_model : ${opt.includeClocksInIclModel ? "on" : "off"};`);
  L.push(`${ind(base + 1)}capture_window_size: ${opt.captureWindowSize};`);

  // Stable order, and one controller per point — a duplicated pin would otherwise emit two
  // controllers of the same name, which the reader silently takes as one.
  const seen = new Set<string>();
  for (const p of points) {
    const name = occControllerName(p);
    if (seen.has(name)) continue;
    seen.add(name);
    const c = opt.controllers[name] ?? {};
    L.push(`${ind(base + 1)}Controller(${name}) {`);
    if (c.captureWindowSize !== undefined && c.captureWindowSize !== opt.captureWindowSize)
      L.push(`${ind(base + 2)}capture_window_size: ${c.captureWindowSize};`);
    L.push(`${ind(base + 2)}clock_intercept_node : ${c.interceptNode || p.pin};`);
    for (const [k, v] of Object.entries(c.extra ?? {}))
      if (v) L.push(`${ind(base + 2)}${k} : ${v};`);
    L.push(`${ind(base + 1)}}`);
  }

  L.push(`${ind(base)}}`);
  if (opt.wrapInReadConfigData) L.push("}");
  return L.join("\n") + "\n";
}

/** Tolerant read-back, same contract as the scan plan: a damaged document degrades to defaults
 *  rather than taking the page down. */
export function parseOccSpecOptions(raw: unknown): OccSpecOptions {
  const d = defaultOccSpecOptions();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  const controllers: Record<string, OccController> = {};
  if (o.controllers && typeof o.controllers === "object") {
    for (const [k, v] of Object.entries(o.controllers as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const c = v as Record<string, unknown>;
      const out: OccController = {};
      if (typeof c.captureWindowSize === "number") out.captureWindowSize = c.captureWindowSize;
      if (typeof c.interceptNode === "string") out.interceptNode = c.interceptNode;
      if (c.extra && typeof c.extra === "object") {
        const ex: Record<string, string> = {};
        for (const [ k2, v2 ] of Object.entries(c.extra as Record<string, unknown>))
          if (typeof v2 === "string") ex[k2] = v2;
        out.extra = ex;
      }
      controllers[k] = out;
    }
  }
  return {
    ijtagHostInterface: typeof o.ijtagHostInterface === "string" && o.ijtagHostInterface
      ? o.ijtagHostInterface : d.ijtagHostInterface,
    includeClocksInIclModel: typeof o.includeClocksInIclModel === "boolean"
      ? o.includeClocksInIclModel : d.includeClocksInIclModel,
    captureWindowSize: typeof o.captureWindowSize === "number"
      ? o.captureWindowSize : d.captureWindowSize,
    wrapInReadConfigData: typeof o.wrapInReadConfigData === "boolean"
      ? o.wrapInReadConfigData : d.wrapInReadConfigData,
    controllers,
  };
}
