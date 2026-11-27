// SRAM repair advisory — a faithful port of the standalone SRAM Repair Advisor
// (src/ui/SramRepairAdvisor.cpp) as pure functions, so the MBIST Planner's Repair tab can be a
// 100% replica of it. Kept numerically/behaviorally identical to the Qt source: the same
// negative-binomial defect model, the same 99.9% repair criterion, the same fuse formulas, the
// same editable/persisted Redundancy Guideline (Table 1), and the same Foundry Model math.

/** Parameters of the negative-binomial (Stapper) defect model. */
export interface YieldInputs {
  /** defect density D0, defects per square inch */
  d0: number;
  /** process complexity factor */
  complexity: number;
  /** adjustment factor */
  adjust: number;
  /** memory area, square mm */
  area: number;
  /** clustering parameter alpha */
  alpha: number;
}

export interface YieldResult {
  /** defect density per square mm, after complexity/adjust */
  d0PerSqMm: number;
  /** mean defects per memory (m = area * d0PerSqMm / alpha) */
  m: number;
  /** cumulative yield for 0..99 repairs */
  cdf: number[];
  /** repairs needed: 1.5 x the first repair count whose cumulative yield exceeds 99.9% */
  repairs: number;
}

/** ln Γ(x) — Lanczos approximation; the model needs lgamma and JS has none built in. */
function lgamma(x: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += g[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** The yield curve and the repair count that reaches 99.9% cumulative yield. */
export function computeYield(i: YieldInputs): YieldResult {
  // 25.4^2 = 645.16 mm^2 per square inch
  const d0PerSqMm = (i.d0 / (25.4 * 25.4)) * i.complexity * i.adjust;
  const m = (i.area * d0PerSqMm) / i.alpha;
  const pmf = new Array<number>(101).fill(0);
  for (let x = 0; x < 100; x++) {
    const logc = lgamma(i.alpha + x) - lgamma(x + 1) - lgamma(i.alpha);
    pmf[x] = (Math.exp(logc) * Math.pow(m, x)) / Math.pow(1 + m, i.alpha + x);
  }
  const cdf = new Array<number>(101).fill(0);
  cdf[0] = pmf[0];
  for (let k = 1; k < 100; k++) cdf[k] = pmf[k] + cdf[k - 1];
  let repairs = 0;
  for (let j = 1; j < 100; j++) {
    if (cdf[j] > 0.999) { repairs = j * 1.5; break; }
  }
  return { d0PerSqMm, m, cdf, repairs };
}

export interface FuseInputs {
  /** repair-data buffer width */
  buffer: number;
  /** zero-count bits */
  zeroCnt: number;
  /** number of fuse groups */
  groups: number;
  /** max sessions */
  maxSess: number;
  /** fuse box address bits */
  boxAddr: number;
}

/** Fuse counts for a given repair count (repairs may be fractional). */
export function computeFuses(repairs: number, f: FuseInputs): {
  fusesPerSession: number; singleBitsNumberOfFuses: number;
} {
  const fps = repairs * f.buffer
            + (repairs + 1) * (f.zeroCnt + 1)
            + (f.groups - 1) * (f.boxAddr + (f.zeroCnt + 1));
  const single = f.maxSess * fps + ((f.maxSess - 1) * (f.boxAddr + 1) + 1);
  return { fusesPerSession: fps, singleBitsNumberOfFuses: single };
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage-unit parsing/formatting — port of parseStorageUnits/formatStorageUnits
// (SramRepairAdvisor.cpp:55-84). 1K = 1024; "E" anywhere -> scientific float.
// ─────────────────────────────────────────────────────────────────────────────

export function parseStorageUnits(raw: string): number {
  const v = raw.trim().toUpperCase();
  if (!v) return 0;
  if (v.includes("E")) {
    const d = Number(v);
    return Number.isFinite(d) ? d : 0;
  }
  let mult = 1, body = v;
  if (v.endsWith("K")) { mult = 1024; body = v.slice(0, -1); }
  else if (v.endsWith("M")) { mult = 1024 * 1024; body = v.slice(0, -1); }
  else if (v.endsWith("G")) { mult = 1024 * 1024 * 1024; body = v.slice(0, -1); }
  const d = Number(body);
  return Number.isFinite(d) ? d * mult : 0;
}

export function formatStorageUnits(value: number): string {
  const units = ["", "K", "M", "G"];
  let v = value;
  for (const u of units) {
    if (v < 1024) return `${v.toFixed(2)}${u}`;
    v /= 1024;
  }
  return `${v.toFixed(2)}T`;
}

/** Tier bound formatting used by the strategy display (SramRepairAdvisor.cpp:87-94). */
export function tierBound(v: number): string {
  if (v === Infinity) return "∞";
  if (v >= 1024) return `${(v / 1024).toFixed(0)}K`;
  return v.toFixed(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Redundancy Guideline (Table 1) — editable, persisted. Port of the
// RedundancyGuideline struct + defaultGuideline/loadGuideline/saveGuideline
// (SramRepairAdvisor.cpp:1022-1103), using localStorage (this app's own
// persistence convention, e.g. MbistTab.tsx's DEF_KEY/OPT_KEY) in place of the
// Qt version's AppConfigLocation JSON file.
// ─────────────────────────────────────────────────────────────────────────────

export interface RedundancyGuideline {
  /** size-band edges in physical bits, length = nBands()+1 */
  edges: number[];
  /** row labels (redundancy methods) */
  methods: string[];
  /** pct[method][band], percent 0..100 */
  pct: number[][];
}

export const nBands = (g: RedundancyGuideline): number => g.edges.length - 1;
export const nMethods = (g: RedundancyGuideline): number => g.methods.length;

export function defaultGuideline(): RedundancyGuideline {
  const K = 1024;
  return {
    edges: [0, 32 * K, 64 * K, 128 * K, 256 * K, 512 * K, 1024 * K],
    methods: ["No Redundancy", "Column Only", "Column + Row"],
    pct: [
      [0, 0, 0, 0, 0, 0],
      [100, 100, 50, 25, 0, 0],
      [0, 0, 50, 75, 100, 100],
    ],
  };
}

const GUIDELINE_KEY = "dft-suite.sramRepairGuideline";

/** Basic shape validation, mirroring the C++ loader's fallback-to-default guard. */
function validGuideline(g: unknown): g is RedundancyGuideline {
  if (!g || typeof g !== "object") return false;
  const t = g as RedundancyGuideline;
  if (!Array.isArray(t.edges) || t.edges.length < 2) return false;
  if (!Array.isArray(t.methods) || t.methods.length === 0) return false;
  if (!Array.isArray(t.pct) || t.pct.length !== t.methods.length) return false;
  const bands = t.edges.length - 1;
  return t.pct.every((row) => Array.isArray(row) && row.length === bands);
}

/** localStorage is undefined outside a browser/Electron renderer (e.g. the plain-Node unit test
 *  runner) — fall back to defaultGuideline() there rather than throwing. */
function hasLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

export function loadGuideline(): RedundancyGuideline {
  if (hasLocalStorage()) {
    try {
      const raw = localStorage.getItem(GUIDELINE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (validGuideline(parsed)) return parsed;
      }
    } catch { /* fall through to default */ }
  }
  return defaultGuideline();
}

export function saveGuideline(g: RedundancyGuideline): void {
  if (hasLocalStorage()) localStorage.setItem(GUIDELINE_KEY, JSON.stringify(g));
}

export function bandLabel(g: RedundancyGuideline, col: number): string {
  return `${formatStorageUnits(g.edges[col])} → ${formatStorageUnits(g.edges[col + 1])}`;
}

/** Colour for a redundancy method, matched by name (SramRepairAdvisor.cpp:1112-1119) — so a
 *  renamed method still maps sensibly. Row-tint colors for the Foundry spare-scheme table. */
export function methodColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("row")) return "rgb(255,205,170)";      // Column + Row
  if (n.includes("column")) return "rgb(200,255,200)";   // Column Only
  if (n.includes("no")) return "rgb(224,236,224)";       // No Redundancy
  return "rgb(255,235,150)";
}

export interface RepairTier { min: number; max: number; repair: string }

/** Guideline table -> tiers (each band's DOMINANT redundancy method; ties favor the LATER
 *  method — SramRepairAdvisor.cpp:1130-1134 iterates forward with `>=`, not `>`). Consecutive
 *  bands with the same verdict merge into one tier; the last tier's max extends to Infinity. */
export function tiersFromGuideline(g: RedundancyGuideline = loadGuideline()): RepairTier[] {
  const tiers: RepairTier[] = [];
  for (let b = 0; b < nBands(g); b++) {
    let best = 0, bestPct = -1;
    for (let m = 0; m < nMethods(g); m++)
      if (g.pct[m][b] >= bestPct) { bestPct = g.pct[m][b]; best = m; }
    const repair = g.methods[best];
    const prev = tiers[tiers.length - 1];
    if (prev && prev.repair === repair) prev.max = g.edges[b + 1];
    else tiers.push({ min: g.edges[b], max: g.edges[b + 1], repair });
  }
  if (tiers.length) tiers[tiers.length - 1].max = Infinity;
  return tiers;
}

/** The recommended redundancy for a memory of `bits` physical bits. */
export function repairFor(bits: number, tiers = tiersFromGuideline()): string {
  for (const t of tiers) if (bits >= t.min && bits < t.max) return t.repair;
  return tiers.length ? tiers[tiers.length - 1].repair : "";
}

/** Port of doLookup (SramRepairAdvisor.cpp:1670-1705): which band a memory's total physical
 *  bits falls in, the dominant method, and the full recommended mix for that band. */
export interface LookupResult {
  band: number;
  bandLabel: string;
  dominant: string;
  /** e.g. "Column Only 50% · Column + Row 50%" — every method with a nonzero share */
  mix: string;
}
// NOTE: this uses STRICT `>` for `best` (first method wins a tie) — matching the C++ doLookup
// exactly (SramRepairAdvisor.cpp:1693-1699: `if (pct[r][band] > pct[best][band]) best = r;`).
// tiersFromGuideline above uses `>=` (LAST method wins). That is a genuine inconsistency already
// present in the original tool — Lookup and the merged Repair Strategy panel can disagree on a
// tie band's "dominant" method — preserved here deliberately for fidelity, not unified.
export function lookupGuideline(bits: number, g: RedundancyGuideline = loadGuideline()): LookupResult | null {
  if (bits <= 0) return null;
  const bands = nBands(g);
  let band = -1;
  for (let c = 0; c < bands; c++) {
    const lastLo = c === bands - 1;
    if (bits >= g.edges[c] && (bits < g.edges[c + 1] || lastLo)) { band = c; break; }
  }
  if (band < 0) return null;
  const parts: string[] = [];
  let best = 0;
  for (let r = 0; r < nMethods(g); r++) {
    if (g.pct[r][band] > 0) parts.push(`${g.methods[r]} ${g.pct[r][band]}%`);
    if (g.pct[r][band] > g.pct[best][band]) best = r;
  }
  return {
    band, bandLabel: bandLabel(g, band), dominant: g.methods[best],
    mix: parts.length ? parts.join(" · ") : "(no recommendation)",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Foundry Model — port of FoundryModelWindow's calculateYield/applySpareScheme/
// updateDistribution (SramRepairAdvisor.cpp:788-887). Works from an actual memory
// list rather than process parameters.
// ─────────────────────────────────────────────────────────────────────────────

export interface FoundryMemory { normalized: number; generateNum: number }

/** Ascending-by-size order (stable), matching sortedOrder (SramRepairAdvisor.cpp:776-786). */
export function foundrySortedOrder(mems: FoundryMemory[]): number[] {
  return mems.map((_, i) => i).sort((a, b) => mems[a].normalized - mems[b].normalized);
}

export interface FoundryCalcResult { redundancyFree: number; needRedundancy: number; repairs: number }

/** Port of calculateYield (SramRepairAdvisor.cpp:788-820): memories are sorted by size, and
 *  every one whose CUMULATIVE size (running total, smallest first) exceeds the redundancy-free
 *  density needs a spare, weighted by its generateNum. */
export function foundryCalculate(mems: FoundryMemory[], redundancyFree: number, efuse: number): FoundryCalcResult {
  const order = foundrySortedOrder(mems);
  let cumulative = 0, needRedundancy = 0;
  for (const r of order) {
    cumulative += mems[r].normalized;
    if (cumulative > redundancyFree) needRedundancy += mems[r].generateNum || 1;
  }
  return { redundancyFree, needRedundancy, repairs: Math.ceil(needRedundancy * efuse) };
}

export interface SpareSchemeRow {
  index: number;          // index into the ORIGINAL mems array
  normalized: number;
  generateNum: number;
  spareScheme: string;    // "No spare needed" | a repair method | "N/A"
  color: string;
  tier: number;           // -1 = no spare needed, -2 = N/A (no tier matched), else tier index
}

/** Port of applySpareScheme (SramRepairAdvisor.cpp:822-868): sorted ascending, each memory
 *  gets "No spare needed" while the running cumulative size stays under the redundancy-free
 *  density, else the guideline's tier for its OWN size (not the cumulative). */
export function applySpareScheme(
  mems: FoundryMemory[], redundancyFree: number, tiers: RepairTier[],
): SpareSchemeRow[] {
  const order = foundrySortedOrder(mems);
  const NO_SPARE_COLOR = "rgb(230,255,230)";
  const NA_COLOR = "rgb(255,255,255)";
  let cumulative = 0;
  return order.map((i) => {
    const m = mems[i];
    cumulative += m.normalized;
    if (cumulative <= redundancyFree)
      return { index: i, normalized: m.normalized, generateNum: m.generateNum,
                spareScheme: "No spare needed", color: NO_SPARE_COLOR, tier: -1 };
    const ti = tiers.findIndex((t) => m.normalized >= t.min && m.normalized < t.max);
    if (ti >= 0)
      return { index: i, normalized: m.normalized, generateNum: m.generateNum,
                spareScheme: tiers[ti].repair, color: methodColor(tiers[ti].repair), tier: ti };
    return { index: i, normalized: m.normalized, generateNum: m.generateNum,
              spareScheme: "N/A", color: NA_COLOR, tier: -2 };
  });
}

export interface DistributionLine { label: string; count: number; pct: number }

/** Port of updateDistribution (SramRepairAdvisor.cpp:870-887): how many memories (and what
 *  percent) landed in "no spare needed" vs. each tier. */
export function foundryDistribution(rows: SpareSchemeRow[], tiers: RepairTier[]): DistributionLine[] {
  const total = rows.length;
  const pct = (n: number) => (total > 0 ? (n * 100) / total : 0);
  const noSpare = rows.filter((r) => r.tier === -1).length;
  const out: DistributionLine[] = [{ label: "No spare needed", count: noSpare, pct: pct(noSpare) }];
  tiers.forEach((t, i) => {
    const count = rows.filter((r) => r.tier === i).length;
    out.push({ label: `${tierBound(t.min)}-${tierBound(t.max)}: ${t.repair}`, count, pct: pct(count) });
  });
  return out;
}
