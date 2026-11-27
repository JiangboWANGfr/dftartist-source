// Scan plan: chain families and EDT coverage over the design hierarchy.
//
// Two INDEPENDENT dimensions, deliberately:
//   * family   — what KIND of flop this is (OCC / hyper / wrapper / the rest). Design-level:
//                `create_scan_chain_family` defines them once and every scan mode selects from
//                the same set, so one INT EDT cannot have a different idea of OCC_CHAIN than
//                another one.
//   * coverage — which CONTROLLER carries this part of the design.
// They are orthogonal: flops of the same family can belong to different internal EDTs. Merging
// them would give every controller its own family, which is exactly what design-level families
// rule out.
//
// Counting happens HERE, off the daemon, so painting a node updates the numbers immediately.
// The daemon is only asked for things it alone knows: the wrapper-cell count, and the final
// budget that turns cells into chain counts.

import type {
  RegCount, RegCountResult, ScanBudgetResult, WrapperCellsResult,
} from "../../core-bridge/model.ts";

export type FamilyKind = "normal" | "wrapper" | "rest" | "nonscan";

export interface Family {
  id: string;
  name: string;          // becomes the create_scan_chain_family name
  color: string;
  globs: string;         // optional batch rule, space/comma separated
  instances: string[];   // painted subtree roots
  /** Subtrees this family must NOT claim, whatever its rules say. Without this a glob is a
   *  one-way door: the rule keeps re-matching, so clicking the instance off does nothing and
   *  the only way out is to edit the rule until it stops covering that one instance. An
   *  exception list is what makes "this rule, except that block" expressible at all. An
   *  explicit pick still wins over an exception — a deliberate click is the strongest signal. */
  excludes: string[];
  kind: FamilyKind;
  /** create_scan_chain_family switches for this family, verbatim (option -> value, no leading
   *  dash). Whatever is set here is passed straight through to the generated Tcl, where a user
   *  value overrides the derived default for the same switch (include_elements included — that
   *  is how the membership FILTER itself is overridden when the glob/pick model is not enough). */
  tclOptions?: Record<string, string>;
}

/** Every create_scan_chain_family switch (tshell_ref p.638), with the enum values the manual
 *  gives, in the manual's order. `values` empty = free text. This is the UI's menu; the engine
 *  passes anything through, so an option missing here would still work if typed elsewhere. */
export const FAMILY_TCL_OPTIONS: { name: string; values?: string[]; hint?: string }[] = [
  { name: "ordered_elements", hint: "ordered list of mandatory scan elements" },
  { name: "include_elements", hint: "overrides the derived membership filter" },
  { name: "include_chain_families", hint: "immutable families used as hard building blocks" },
  { name: "edt_instances" },
  { name: "ssh_instance" },
  { name: "ssh_chain_groups" },
  { name: "si_connections" },
  { name: "so_connections" },
  { name: "si_associated_ports" },
  { name: "so_associated_ports" },
  { name: "mutable", values: ["auto", "off", "on"] },
  { name: "attribute_set_for_chain_assembly", hint: "e.g. { quadrant testpoint_type }" },
  { name: "single_attribute_set_chains", values: ["on", "off"] },
  { name: "single_class_chains", values: ["on", "off"] },
  { name: "single_clock_domain_chains", values: ["on", "off"] },
  { name: "single_clock_edge_chains", values: ["on", "off"] },
  { name: "single_power_domain_chains", values: ["on", "off"] },
  { name: "single_cluster_chains", values: ["on", "off"] },
  { name: "single_wrapper_type_chains", values: ["on", "off"] },
  { name: "port_index_start_value" },
  { name: "port_scalar_index_modifier" },
  { name: "chain_length", hint: "integer | unlimited" },
  { name: "chain_count", hint: "integer | unlimited" },
  { name: "si_port_format", hint: "e.g. ts_%s_si[%d]" },
  { name: "so_port_format" },
  { name: "si_timing", values: ["leading_edge", "trailing_edge", "any_edge"] },
  { name: "so_timing", values: ["leading_edge", "trailing_edge", "any_edge"] },
  { name: "lockup_cell_type", values: ["latch", "flop"] },
  { name: "si_lockup_cell_type", values: ["latch", "flop"] },
  { name: "so_lockup_cell_type", values: ["latch", "flop"] },
  { name: "unused_chain_connection_handling",
    values: ["auto", "insert_pipelining_flop", "tie_off_chain_output", "dont_touch"] },
  { name: "si_pipelining", values: ["wrapper_chains_only", "all_chains", "off"] },
  { name: "si_pipelining_type", values: ["non_scan_flop", "holding_scan_flop"] },
];

export interface ScanPlan {
  families: Family[];
  /** instance path -> EDT controller name. Only top-most assignments are stored. */
  coverage: Record<string, string>;
  /** Which chain families each CONTROLLER carries, by controller name. This is the EDT-to-family
   *  relationship, and it is per controller because that is how it is really decided: the EXT
   *  controller takes WRAPPER, the INT one takes the core, and both may take OCC. A missing
   *  entry falls back to the int/ext default, so an unconfigured controller still works. */
  edtFamilies?: Record<string, string[]>;
  /** Per-controller sizing, by controller name. Same reasoning as the families: two INT
   *  controllers can want different chain lengths, and one shared "default" block cannot say so.
   *  A missing field falls back to the int/ext seed. */
  edtSizing?: Record<string, Partial<EdtSizing>>;
}

/** The three numbers that size a controller. */
export interface EdtSizing {
  targetChainLength: number;
  channels: number;
  chainsPerChannel: number;
}

export const FAMILY_COLORS = [
  "#61afef", "#c678dd", "#e5c07b", "#56b6c2", "#e06c75", "#98c379", "#d19a66",
];

export function defaultFamilies(): Family[] {
  return [
    { id: "occ", name: "OCC_CHAIN", color: FAMILY_COLORS[0], globs: "*tessent_occ*", instances: [], excludes: [], kind: "normal" },
    { id: "hyper", name: "HYPER_CHAIN", color: FAMILY_COLORS[1], globs: "*hyper*", instances: [], excludes: [], kind: "normal" },
    // Not a family the flow creates — a deduction. Kept in the same list so its bits are visible
    // in the same place as everything else instead of being an invisible correction.
    { id: "nonscan", name: "non-scan", color: FAMILY_COLORS[4], globs: "", instances: [], excludes: [], kind: "nonscan" },
    { id: "wrapper", name: "WRAPPER", color: FAMILY_COLORS[3], globs: "", instances: [], excludes: [], kind: "wrapper" },
    // Always last: whatever no other family claimed.
    { id: "int", name: "INT_CHAIN", color: FAMILY_COLORS[5], globs: "", instances: [], excludes: [], kind: "rest" },
  ];
}

/** Drop paths that are already inside another path in the list — a nested one adds nothing and
 *  double-counts when its bits are summed. */
export function maximalRoots(paths: readonly string[]): string[] {
  const sorted = [...new Set(paths)].sort((a, b) => a.length - b.length);
  const out: string[] = [];
  for (const p of sorted) if (!out.some((r) => isUnder(r, p))) out.push(p);
  return out;
}

/** Tcl-style glob: * ? and [set]. Same shapes as the user's `get_instance *tessent_occ* -h`. */
export function globMatch(pattern: string, s: string): boolean {
  const re = new RegExp(
    "^" + pattern.replace(/[.+^${}()|\\]/g, "\\$&")
                 .replace(/\*/g, ".*")
                 .replace(/\?/g, ".") + "$");
  return re.test(s);
}

export const isUnder = (ancestor: string, path: string): boolean =>
  path === ancestor || path.startsWith(ancestor + ".");

/** The design's real top: the elaborated root with the most flops beneath it. NOT the shortest
 *  instance name — a design with several uninstantiated modules reports each of them as a
 *  candidate top, and the shortest name is usually one of those, not the core. */
export function coreOf(rc: RegCountResult, preferred?: string | null): RegCount | undefined {
  const roots = rc.counts.filter((c) => !c.instanceId.includes("."));
  if (preferred) {
    const hit = rc.counts.find((c) => c.instanceId === preferred);
    if (hit) return hit;
  }
  return roots.reduce<RegCount | undefined>(
    (a, b) => (a && a.subtree >= b.subtree ? a : b), undefined);
}

/** Subtree roots a family claims: painted instances plus glob hits, with nested ones dropped
 *  (a nested root's bits are already inside its ancestor's subtree). */
export function familyRoots(fam: Family, counts: RegCount[], core: string): string[] {
  const pats = fam.globs.split(/[,\s]+/).filter(Boolean);
  // Exceptions suppress RULE hits only. A path the engineer clicked into the family stays in it:
  // the click is the later, more specific decision.
  const excluded = (p: string) => (fam.excludes ?? []).some((x) => isUnder(x, p));
  const hits = new Set(fam.instances.filter((p) => isUnder(core, p)));
  if (pats.length) {
    for (const c of counts) {
      if (!isUnder(core, c.instanceId) || excluded(c.instanceId)) continue;
      if (pats.some((p) => globMatch(p, c.instanceId))) hits.add(c.instanceId);
    }
  }
  return maximalRoots([...hits]);
}

/** Instances a family's rules match, ignoring what is already claimed elsewhere — what the user
 *  needs to see BEFORE committing a rule, and what makes "this rule covers 96 instances" a fact
 *  on screen rather than a surprise in the tree. */
export function globHits(pattern: string, counts: RegCount[], core: string): string[] {
  return counts.filter((c) => isUnder(core, c.instanceId) && globMatch(pattern, c.instanceId))
               .map((c) => c.instanceId);
}

export interface FamilyCount {
  family: Family;
  roots: string[];
  /** The family's exceptions that actually fall inside one of its roots — the ones doing work.
   *  A stale exception left over from a rule the user deleted is not shown as if it mattered. */
  excludes: string[];
  bits: number;
}

/** Bits per family, in list order, with `rest` receiving whatever nobody claimed.
 *  A flop belongs to exactly one family: the FIRST one in the list that claims it, so an
 *  instance painted into two families does not get counted twice. */
export function countFamilies(plan: ScanPlan, rc: RegCountResult, core: string): FamilyCount[] {
  const byId = new Map(rc.counts.map((c) => [c.instanceId, c] as const));
  const bitsOf = (p: string) => byId.get(p)?.subtree ?? 0;
  // Claimed subtrees, each carrying the exceptions punched out of it — a path inside an
  // exception is NOT claimed, so a later family (or the remainder) is free to take it.
  const taken: { root: string; excludes: string[] }[] = [];
  const isTaken = (p: string) =>
    taken.some((t) => isUnder(t.root, p) && !t.excludes.some((x) => isUnder(x, p)));
  const out: FamilyCount[] = [];

  for (const fam of plan.families) {
    if (fam.kind === "rest" || fam.kind === "wrapper") {
      out.push({ family: fam, roots: [], excludes: [], bits: 0 });
      continue;
    }
    const roots = familyRoots(fam, rc.counts, core).filter((r) => !isTaken(r));
    const excludes = maximalRoots((fam.excludes ?? []).filter((x) => roots.some((r) => isUnder(r, x) && r !== x)));
    // A root keeps its bits minus its holes: the parts an earlier family already claimed, and
    // the parts this family excepted. Holes are reduced to their outermost members first so a
    // nested pair is not subtracted twice.
    let bits = 0;
    for (const r of roots) {
      const holes = maximalRoots([...excludes, ...taken.map((t) => t.root)]
        .filter((h) => isUnder(r, h) && h !== r));
      // …and an instance clicked back in from inside a hole is still this family's.
      const addBack = maximalRoots(fam.instances.filter((p) => holes.some((h) => isUnder(h, p) && h !== p)));
      bits += bitsOf(r)
            - holes.reduce((n, h) => n + bitsOf(h), 0)
            + addBack.reduce((n, p) => n + bitsOf(p), 0);
    }
    taken.push(...roots.map((r) => ({ root: r, excludes })));
    out.push({ family: fam, roots, excludes, bits: Math.max(0, bits) });
  }

  const coreBits = bitsOf(core);
  const claimed = out.reduce((n, f) => n + f.bits, 0);
  for (const f of out) {
    if (f.family.kind === "rest") f.bits = Math.max(0, coreBits - claimed);
  }
  return out;
}

/** family id for each instance, for colouring the tree (inherited from the nearest claimed
 *  ancestor, so a painted parent visibly covers its children). */
export function familyOfInstance(counts: FamilyCount[]): (path: string) => FamilyCount | undefined {
  const claim = new Map<string, FamilyCount>();
  const block = new Map<string, string[]>();   // path -> family ids that except it
  for (const fc of counts) {
    for (const r of fc.roots) if (!claim.has(r)) claim.set(r, fc);
    for (const x of fc.excludes) block.set(x, [...(block.get(x) ?? []), fc.family.id]);
  }
  // Walk up from the instance rather than scanning every root: hierarchy depth is a handful of
  // levels, while one glob can produce thousands of roots.
  return (path) => {
    const blocked = new Set<string>();
    for (let p: string | undefined = path; p; ) {
      for (const id of block.get(p) ?? []) blocked.add(id);
      const c = claim.get(p);
      if (c && !blocked.has(c.family.id)) return c;
      const dot = p.lastIndexOf(".");
      p = dot < 0 ? undefined : p.slice(0, dot);
    }
    return undefined;
  };
}

/** Owning controller for each instance, same inheritance rule. */
export function coverageOfInstance(coverage: Record<string, string>): (path: string) => string | undefined {
  const entries = Object.entries(coverage).sort((a, b) => b[0].length - a[0].length);
  return (path) => entries.find(([root]) => isUnder(root, path))?.[1];
}

/** Paint `path` into `famId`, dropping any ancestor or descendant of it from EVERY family —
 *  an overlap the user cannot see is one only scan insertion rejects. */
export function paintFamily(plan: ScanPlan, famId: string, path: string): ScanPlan {
  return {
    ...plan,
    families: plan.families.map((f) => {
      const kept = f.instances.filter((p) => !isUnder(path, p) && !isUnder(p, path));
      if (f.id !== famId) return { ...f, instances: kept };
      // Clicking it in cancels any exception ON it — otherwise the click would be a no-op the
      // second time around, which is precisely the trap this whole mechanism exists to remove.
      return {
        ...f,
        instances: [...kept, path],
        excludes: (f.excludes ?? []).filter((x) => !isUnder(path, x)),
      };
    }),
  };
}

/** Paint a whole set at once. Assigning one instance per click is the right primitive but the
 *  wrong workflow: "every sync cell is non-scan" is one decision, not ninety-six. Nested picks
 *  collapse to their top-most ancestor so the family stores the decision, not its expansion. */
export function paintMany(plan: ScanPlan, famId: string, paths: string[]): ScanPlan {
  const sorted = [...new Set(paths)].sort((a, b) => a.length - b.length);
  const roots: string[] = [];
  for (const p of sorted) if (!roots.some((r) => isUnder(r, p))) roots.push(p);
  let next = plan;
  for (const r of roots) next = paintFamily(next, famId, r);
  return next;
}

/** Scan bits a set of instances is worth, counting each flop once even when the set contains
 *  both a parent and its child — the number the engineer is actually deciding about. */
export function bitsOf(paths: string[], counts: RegCount[]): number {
  const byId = new Map(counts.map((c) => [c.instanceId, c] as const));
  const sorted = [...new Set(paths)].sort((a, b) => a.length - b.length);
  const roots: string[] = [];
  for (const p of sorted) if (!roots.some((r) => isUnder(r, p))) roots.push(p);
  return roots.reduce((n, r) => n + (byId.get(r)?.subtree ?? 0), 0);
}

export function unpaintFamily(plan: ScanPlan, path: string): ScanPlan {
  return {
    ...plan,
    families: plan.families.map((f) => ({ ...f, instances: f.instances.filter((p) => p !== path) })),
  };
}

/** Take `path` OUT of a family for good, whichever way it got in.
 *
 *  Dropping the pick is not enough on its own: if a glob rule or a painted ancestor still covers
 *  the path, the tag comes straight back and the click looks broken. So the pick is dropped
 *  first, and only if the family would still claim the path is an exception recorded — which
 *  keeps the plan readable (no exception is written when none is needed). */
export function unassignFamily(
  plan: ScanPlan, famId: string, path: string, counts: RegCount[], core: string,
): ScanPlan {
  const dropped: ScanPlan = {
    ...plan,
    families: plan.families.map((f) =>
      f.id === famId ? { ...f, instances: f.instances.filter((p) => !isUnder(path, p)) } : f),
  };
  const fam = dropped.families.find((f) => f.id === famId);
  if (!fam) return dropped;
  if (!familyRoots(fam, counts, core).some((r) => isUnder(r, path))) return dropped;
  return {
    ...dropped,
    families: dropped.families.map((f) =>
      f.id === famId
        ? { ...f, excludes: [...(f.excludes ?? []).filter((x) => !isUnder(path, x)), path] }
        : f),
  };
}

/** Put an excepted subtree back under the family's rules. */
export function removeExclude(plan: ScanPlan, famId: string, path: string): ScanPlan {
  return {
    ...plan,
    families: plan.families.map((f) =>
      f.id === famId ? { ...f, excludes: (f.excludes ?? []).filter((x) => x !== path) } : f),
  };
}

/** Delete ONE glob from a family's rule, leaving its other rules alone. Editing a
 *  space-separated string by hand to remove one pattern is the kind of chore that makes people
 *  keep a rule they no longer want. */
export function removeGlob(plan: ScanPlan, famId: string, glob: string): ScanPlan {
  return {
    ...plan,
    families: plan.families.map((f) =>
      f.id === famId
        ? { ...f, globs: f.globs.split(/[,\s]+/).filter((g) => g && g !== glob).join(" ") }
        : f),
  };
}

/** Everything this family claims goes away: rules, picks and exceptions. */
export function clearFamilyAssignments(plan: ScanPlan, famId: string): ScanPlan {
  return {
    ...plan,
    families: plan.families.map((f) =>
      f.id === famId ? { ...f, globs: "", instances: [], excludes: [] } : f),
  };
}

export function assignCoverage(plan: ScanPlan, edt: string, path: string): ScanPlan {
  const coverage: Record<string, string> = {};
  for (const [p, n] of Object.entries(plan.coverage)) {
    if (!isUnder(path, p) && !isUnder(p, path)) coverage[p] = n;
  }
  coverage[path] = edt;
  return { ...plan, coverage };
}

/** Defaults a newly placed EDT picks up. Part of the persisted document: they are the user's
 *  house style, and re-typing them per project is exactly the friction this removes. */
export interface EdtDefaults {
  /** input_channel_count. 0 = derive it, which is what the flow's Run Analysis does:
   *  chains = ceil(cells / range_max), then channels = ceil(chains / chainsPerChannel).
   *  Taking this as an input while deriving the chain count from the target length
   *  independently is how a spec ends up with more channels than chains. */
  channels: number;
  targetChainLength: number;
  /** Chains one channel is expected to carry when the count is derived. The reference flow
   *  uses 150 — a house number, not a tool limit. */
  chainsPerChannel: number;
  families: string[];
}

/** What `analyze_wrapper_cells` is told before it runs. These are judgement calls about the
 *  design, not constants: a block whose ports fan out to hundreds of flops wants a different
 *  fanout ceiling than a narrow control block, and only the engineer knows which DFT signals
 *  must never get a cell. They live in the project document because the answer is a property of
 *  the block, and re-deciding it on every run is how two runs end up incomparable. */
export interface WrapperAnalysisOptions {
  /** Above this many flops in the cone, a shared cell stops being worth it and the port gets a
   *  dedicated one. Same meaning for the output side and for internal-feedback cells. */
  inputFanoutFlopThreshold: number;
  outputFaninFlopThreshold: number;
  feedbackFlopThreshold: number;
  /** Logic levels the cone walk will cross before it gives up on sharing. */
  levelsThreshold: number;
  registerUndrivenOutput: boolean;
  registerPortsReachingBlackboxes: boolean;
  /** Leaf port-name globs that never get a cell — scan_enable, test_mode and friends. */
  excludePorts: string[];
  /** Clocks. A wrapper cell here would put a flop in the clock path, so they never get one.
   *  The walk also infers clocks, but only for ports that actually reach a flop's clock pin in
   *  RTL — a clock that only feeds a synchroniser's data pin looks exactly like data and has to
   *  be named here. */
  clockPorts: string[];
  inferClockPorts: boolean;
  /** Ports running straight from a core input to a core output with no flop between them. */
  skipFeedthroughPorts: boolean;
  /** Per-port overrides: wrap this one whatever the analysis thinks … */
  forceDedicatedPorts: string[];
  /** … or share this one even past the thresholds. */
  forceSharedPorts: string[];
  /** One transcript line per port bit. Off by default; large boundaries make it a big file. */
  logEveryPort: boolean;
}

/** The daemon's own defaults, restated here so the UI can show them and offer a reset. Keep in
 *  step with WrapperOptions in DesignDb.h. */
export function defaultWrapperOptions(): WrapperAnalysisOptions {
  return {
    inputFanoutFlopThreshold: 4,
    outputFaninFlopThreshold: 4,
    feedbackFlopThreshold: 4,
    levelsThreshold: 32,
    registerUndrivenOutput: true,
    registerPortsReachingBlackboxes: false,
    excludePorts: ["scan_enable", "scan_mode", "test_mode"],
    clockPorts: [],
    inferClockPorts: true,
    skipFeedthroughPorts: true,
    forceDedicatedPorts: [],
    forceSharedPorts: [],
    logEveryPort: false,
  };
}

/** The last RESULTS, cached in the document so reopening a project shows the analysis instead
 *  of an empty page. Derived data, never a source of truth: it is stamped with when it ran so
 *  the page can say so, and re-running always overwrites it. If the design changed underneath,
 *  the numbers are stale — which is exactly why the timestamp is shown rather than hidden. */
export interface ScanPlanResults {
  wrapper?: { at: string; data: WrapperCellsResult };
  budget?: { at: string; data: ScanBudgetResult };
}

export interface ScanPlanDoc {
  version: 1;
  plan: ScanPlan;
  edtDefaults: { int: EdtDefaults; ext: EdtDefaults };
  wrapper: WrapperAnalysisOptions;
  results?: ScanPlanResults;
}

export function defaultEdtDefaults(): { int: EdtDefaults; ext: EdtDefaults } {
  return {
    int: { channels: 0, chainsPerChannel: 150, targetChainLength: 400,
           families: ["INT_CHAIN", "OCC_CHAIN", "HYPER_CHAIN"] },
    ext: { channels: 0, chainsPerChannel: 150, targetChainLength: 300,
           families: ["OCC_CHAIN", "HYPER_CHAIN", "WRAPPER"] },
  };
}

export function serializeScanPlan(doc: ScanPlanDoc): string {
  return JSON.stringify(doc, null, 2) + "\n";
}

/** Tolerant on purpose: a plan written by an older build, hand-edited, or truncated must degrade
 *  to defaults rather than take the workspace down. Every field is checked, none is trusted. */
export function parseScanPlan(text: string): ScanPlanDoc {
  const fallback: ScanPlanDoc = {
    version: 1, plan: { families: defaultFamilies(), coverage: {} }, edtDefaults: defaultEdtDefaults(),
    wrapper: defaultWrapperOptions(),
  };
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return fallback;
  }
  if (!o || typeof o !== "object") return fallback;
  const raw = o as Record<string, unknown>;
  const rawPlan = (raw.plan ?? {}) as Record<string, unknown>;

  const families = Array.isArray(rawPlan.families)
    ? (rawPlan.families as unknown[]).flatMap((f) => {
        if (!f || typeof f !== "object") return [];
        const x = f as Record<string, unknown>;
        if (typeof x.id !== "string" || typeof x.name !== "string") return [];
        let tclOptions: Record<string, string> | undefined;
        if (x.tclOptions && typeof x.tclOptions === "object" && !Array.isArray(x.tclOptions)) {
          const t: Record<string, string> = {};
          for (const [k, v] of Object.entries(x.tclOptions as Record<string, unknown>))
            if (typeof v === "string") t[k] = v;
          if (Object.keys(t).length) tclOptions = t;
        }
        return [{
          id: x.id,
          name: x.name,
          color: typeof x.color === "string" ? x.color : FAMILY_COLORS[0],
          globs: typeof x.globs === "string" ? x.globs : "",
          instances: Array.isArray(x.instances) ? (x.instances as unknown[]).filter((s): s is string => typeof s === "string") : [],
          // Absent in plans written before exceptions existed — an empty list is the correct
          // reading of those, not a reason to reject the document.
          excludes: Array.isArray(x.excludes) ? (x.excludes as unknown[]).filter((s): s is string => typeof s === "string") : [],
          kind: (["normal", "wrapper", "rest", "nonscan"] as const).includes(x.kind as FamilyKind)
            ? (x.kind as FamilyKind) : "normal",
          ...(tclOptions ? { tclOptions } : {}),
        } satisfies Family];
      })
    : [];
  // A document with no `rest` family could never account for the flops nobody claimed.
  if (!families.some((f) => f.kind === "rest")) return fallback;

  const edtSizing: Record<string, Partial<EdtSizing>> = {};
  if (rawPlan.edtSizing && typeof rawPlan.edtSizing === "object") {
    for (const [k, v] of Object.entries(rawPlan.edtSizing as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
      const e: Partial<EdtSizing> = {};
      if (num(o.targetChainLength) !== undefined) e.targetChainLength = o.targetChainLength as number;
      if (num(o.channels) !== undefined) e.channels = o.channels as number;
      if (num(o.chainsPerChannel) !== undefined) e.chainsPerChannel = o.chainsPerChannel as number;
      edtSizing[k] = e;
    }
  }

  const edtFamilies: Record<string, string[]> = {};
  if (rawPlan.edtFamilies && typeof rawPlan.edtFamilies === "object") {
    for (const [k, v] of Object.entries(rawPlan.edtFamilies as Record<string, unknown>)) {
      if (Array.isArray(v))
        edtFamilies[k] = (v as unknown[]).filter((x): x is string => typeof x === "string");
    }
  }

  const coverage: Record<string, string> = {};
  if (rawPlan.coverage && typeof rawPlan.coverage === "object") {
    for (const [k, v] of Object.entries(rawPlan.coverage as Record<string, unknown>)) {
      if (typeof v === "string") coverage[k] = v;
    }
  }

  const d = defaultEdtDefaults();
  const readDefaults = (side: "int" | "ext"): EdtDefaults => {
    const src = ((raw.edtDefaults ?? {}) as Record<string, unknown>)[side];
    if (!src || typeof src !== "object") return d[side];
    const s = src as Record<string, unknown>;
    return {
      channels: typeof s.channels === "number" ? s.channels : d[side].channels,
      chainsPerChannel: typeof s.chainsPerChannel === "number" && s.chainsPerChannel > 0
        ? s.chainsPerChannel : d[side].chainsPerChannel,
      targetChainLength: typeof s.targetChainLength === "number" ? s.targetChainLength : d[side].targetChainLength,
      families: Array.isArray(s.families) ? (s.families as unknown[]).filter((x): x is string => typeof x === "string") : d[side].families,
    };
  };

  // Each wrapper option is read on its own: a document missing one (written by an older build,
  // or hand-edited) keeps the default for that one field rather than losing the rest.
  const w = defaultWrapperOptions();
  const rawW = (raw.wrapper ?? {}) as Record<string, unknown>;
  const wnum = (k: keyof WrapperAnalysisOptions, def: number) =>
    typeof rawW[k] === "number" && Number.isFinite(rawW[k]) ? (rawW[k] as number) : def;
  const wflag = (k: keyof WrapperAnalysisOptions, def: boolean) =>
    typeof rawW[k] === "boolean" ? (rawW[k] as boolean) : def;
  const wlist = (k: keyof WrapperAnalysisOptions, def: string[]) =>
    Array.isArray(rawW[k])
      ? (rawW[k] as unknown[]).filter((x): x is string => typeof x === "string")
      : def;
  const wrapper: WrapperAnalysisOptions = {
    inputFanoutFlopThreshold: wnum("inputFanoutFlopThreshold", w.inputFanoutFlopThreshold),
    outputFaninFlopThreshold: wnum("outputFaninFlopThreshold", w.outputFaninFlopThreshold),
    feedbackFlopThreshold: wnum("feedbackFlopThreshold", w.feedbackFlopThreshold),
    levelsThreshold: wnum("levelsThreshold", w.levelsThreshold),
    registerUndrivenOutput: wflag("registerUndrivenOutput", w.registerUndrivenOutput),
    registerPortsReachingBlackboxes: wflag("registerPortsReachingBlackboxes", w.registerPortsReachingBlackboxes),
    excludePorts: wlist("excludePorts", w.excludePorts),
    clockPorts: wlist("clockPorts", w.clockPorts),
    inferClockPorts: wflag("inferClockPorts", w.inferClockPorts),
    skipFeedthroughPorts: wflag("skipFeedthroughPorts", w.skipFeedthroughPorts),
    forceDedicatedPorts: wlist("forceDedicatedPorts", w.forceDedicatedPorts),
    forceSharedPorts: wlist("forceSharedPorts", w.forceSharedPorts),
    logEveryPort: wflag("logEveryPort", w.logEveryPort),
  };

  // Results are OUR OWN output read back, so the check is shape-level: enough that a truncated
  // or hand-edited file degrades to "no cached result" instead of rendering half a table.
  const results: ScanPlanResults = {};
  const rawR = (raw.results ?? {}) as Record<string, unknown>;
  const cached = (k: "wrapper" | "budget", ok: (d: Record<string, unknown>) => boolean) => {
    const e = rawR[k] as Record<string, unknown> | undefined;
    if (!e || typeof e !== "object") return undefined;
    const d = e.data as Record<string, unknown> | undefined;
    if (!d || typeof d !== "object" || !ok(d)) return undefined;
    return { at: typeof e.at === "string" ? e.at : "", data: d as never };
  };
  const w0 = cached("wrapper", (d) => Array.isArray(d.cells));
  const b0 = cached("budget", (d) => Array.isArray(d.edts));
  if (w0) results.wrapper = w0;
  if (b0) results.budget = b0;

  return {
    version: 1, plan: { families, coverage, edtFamilies, edtSizing },
    edtDefaults: { int: readDefaults("int"), ext: readDefaults("ext") }, wrapper,
    ...(w0 || b0 ? { results } : {}),
  };
}

/** Sizing for one controller: its own values where set, the int/ext seed otherwise. */
export function sizingForEdt(
  plan: ScanPlan, defaults: { int: EdtDefaults; ext: EdtDefaults },
  name: string, external: boolean,
): EdtSizing {
  const d = defaults[external ? "ext" : "int"];
  const own = plan.edtSizing?.[name] ?? {};
  return {
    targetChainLength: own.targetChainLength ?? d.targetChainLength,
    channels: own.channels ?? d.channels,
    chainsPerChannel: own.chainsPerChannel ?? d.chainsPerChannel,
  };
}

export function setEdtSizing(plan: ScanPlan, name: string, patch: Partial<EdtSizing>): ScanPlan {
  const cur = plan.edtSizing?.[name] ?? {};
  return { ...plan, edtSizing: { ...(plan.edtSizing ?? {}), [name]: { ...cur, ...patch } } };
}

/** Which chain families a controller carries. Per-controller when it has been set, otherwise
 *  the int/ext default — so the common case needs no configuration and the uncommon one is
 *  expressible without inventing a second controller kind. */
export function familiesForEdt(
  plan: ScanPlan, defaults: { int: EdtDefaults; ext: EdtDefaults },
  name: string, external: boolean,
): string[] {
  const own = plan.edtFamilies?.[name];
  return own ?? defaults[external ? "ext" : "int"].families;
}

/** Set (or clear back to the default) the families one controller carries. */
export function setEdtFamilies(plan: ScanPlan, name: string, families: string[] | null): ScanPlan {
  const next = { ...(plan.edtFamilies ?? {}) };
  if (families) next[name] = families;
  else delete next[name];
  return { ...plan, edtFamilies: next };
}

/** Add a family. It goes BEFORE the remainder family, because that one is defined as "whatever
 *  is left" and only means anything if it is evaluated last. */
export function addFamily(plan: ScanPlan, name?: string): ScanPlan {
  const restAt = plan.families.findIndex((f) => f.kind === "rest");
  const at = restAt < 0 ? plan.families.length : restAt;
  const used = new Set(plan.families.map((f) => f.name));
  let n = name ?? "NEW_CHAIN";
  for (let i = 2; used.has(n); i++) n = `${name ?? "NEW_CHAIN"}_${i}`;
  const fam: Family = {
    id: `f${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    name: n,
    color: FAMILY_COLORS[plan.families.length % FAMILY_COLORS.length],
    globs: "", instances: [], excludes: [], kind: "normal",
  };
  return { ...plan, families: [...plan.families.slice(0, at), fam, ...plan.families.slice(at)] };
}

/** Remove a family. The remainder family stays: every flop the others did not claim has to land
 *  somewhere, and without it the totals would silently stop adding up. */
export function removeFamily(plan: ScanPlan, id: string): ScanPlan {
  const fam = plan.families.find((f) => f.id === id);
  if (!fam || fam.kind === "rest") return plan;
  return { ...plan, families: plan.families.filter((f) => f.id !== id) };
}

export function renameFamily(plan: ScanPlan, id: string, name: string): ScanPlan {
  return { ...plan, families: plan.families.map((f) => (f.id === id ? { ...f, name } : f)) };
}

export function setFamilyGlobs(plan: ScanPlan, id: string, globs: string): ScanPlan {
  return { ...plan, families: plan.families.map((f) => (f.id === id ? { ...f, globs } : f)) };
}

export function setFamilyColor(plan: ScanPlan, id: string, color: string): ScanPlan {
  return { ...plan, families: plan.families.map((f) => (f.id === id ? { ...f, color } : f)) };
}

/** Set one create_scan_chain_family switch on one family. `null` removes it; an empty string
 *  keeps the switch listed (a just-added option waiting to be typed into) but the request
 *  builder below skips it, so a blank never reaches the Tcl. */
export function setFamilyOption(plan: ScanPlan, id: string, key: string, value: string | null): ScanPlan {
  return {
    ...plan,
    families: plan.families.map((f) => {
      if (f.id !== id) return f;
      const next = { ...(f.tclOptions ?? {}) };
      if (value === null) delete next[key];
      else next[key] = value;
      return { ...f, tclOptions: Object.keys(next).length ? next : undefined };
    }),
  };
}

/** The family's name as the ENGINE knows it: the wrapper/remainder families are structural and
 *  the Tcl generator names them itself, so their options must travel under those names whatever
 *  the row in the UI is called. */
export function engineFamilyName(f: Family): string {
  return f.kind === "wrapper" ? "WRAPPER_CHAIN" : f.kind === "rest" ? "INT_CHAIN" : f.name;
}

/** The CUSTOM families this controller ticked — the ones beyond the OCC/HYPER/INT/WRAPPER model
 *  that the engine derives itself. They go to the request as extraFamilies, joining the mode's
 *  -include_chain_families; only families that will actually be created (they resolve to a
 *  familyOptions entry) are named, so the mode never references a family that does not exist. */
export function extraFamiliesForEdt(
  plan: ScanPlan, defaults: { int: EdtDefaults; ext: EdtDefaults },
  name: string, external: boolean,
): string[] {
  const famOpts = familyTclOptions(plan);
  const BUILTIN = new Set(["OCC_CHAIN", "HYPER_CHAIN", "INT_CHAIN", "WRAPPER_CHAIN"]);
  const out: string[] = [];
  for (const n of familiesForEdt(plan, defaults, name, external)) {
    const f = plan.families.find((x) => x.name === n);
    if (!f) continue;
    const en = engineFamilyName(f);
    if (!BUILTIN.has(en) && famOpts[en] && !out.includes(en)) out.push(en);
  }
  return out;
}

/** familyOptions for the scan-budget request: every family that has switches set, under its
 *  engine name. A custom family (one the generator does not derive a filter for) additionally
 *  carries its membership as include_elements — without that its create_scan_chain_family would
 *  name no elements at all — unless the user overrode include_elements/ordered_elements. */
export function familyTclOptions(plan: ScanPlan): Record<string, Record<string, string>> {
  const BUILTIN = new Set(["OCC_CHAIN", "HYPER_CHAIN", "INT_CHAIN", "WRAPPER_CHAIN"]);
  const out: Record<string, Record<string, string>> = {};
  for (const f of plan.families) {
    if (f.kind === "nonscan") continue;  // a deduction, not a create_scan_chain_family
    const name = engineFamilyName(f);
    const opts: Record<string, string> = {};
    for (const [k, v] of Object.entries(f.tclOptions ?? {}))
      if (v.trim()) opts[k] = v.trim();  // a just-added blank switch is not a Tcl argument yet
    if (!BUILTIN.has(name) && !opts.include_elements && !opts.ordered_elements) {
      const pats = [...f.globs.split(/[,\s]+/).filter(Boolean), ...f.instances];
      if (pats.length) opts.include_elements = `[get_cells {${pats.join(" ")}}]`;
    }
    if (Object.keys(opts).length) out[name] = opts;
  }
  return out;
}

/** Drop one painted instance from one family — the counterpart of clicking it in the tree, for
 *  when the instance is buried and hunting for it again would be the slow way. */
export function removeInstance(plan: ScanPlan, id: string, path: string): ScanPlan {
  return {
    ...plan,
    families: plan.families.map((f) =>
      f.id === id ? { ...f, instances: f.instances.filter((p) => p !== path) } : f),
  };
}

/** A glob that covers everything painted into a family, so the plan can be expressed as a RULE
 *  instead of a list. A rule keeps working when the design gains another instance of the same
 *  kind; a list silently misses it. Returns "" when the leaf names have nothing in common. */
export function suggestGlob(paths: string[]): string {
  const leaves = paths.map((p) => p.split(".").pop() ?? p);
  if (!leaves.length) return "";
  if (leaves.length === 1) return `*${leaves[0]}*`;
  const common = (a: string, b: string, fromEnd: boolean) => {
    const [x, y] = fromEnd ? [[...a].reverse().join(""), [...b].reverse().join("")] : [a, b];
    let i = 0;
    while (i < x.length && i < y.length && x[i] === y[i]) i++;
    const s = x.slice(0, i);
    return fromEnd ? [...s].reverse().join("") : s;
  };
  let pre = leaves[0];
  let suf = leaves[0];
  for (const l of leaves.slice(1)) {
    pre = common(pre, l, false);
    suf = common(suf, l, true);
  }
  // Guard against a suffix that overlaps the prefix on short names ("p1in"/"p1in").
  if (pre.length + suf.length > Math.min(...leaves.map((l) => l.length))) suf = "";
  if (!pre && !suf) return "";
  return `*${pre}*${suf ? suf + "*" : ""}`.replace("**", "*");
}

/** Name patterns that identify the usual DFT structures, so a fresh design can be classified in
 *  one click instead of hunting through the hierarchy. Only a STARTING POINT — every hit lands
 *  in the tree as a normal painted instance the engineer can move or remove. */
const AUTO_RULES: { famKind: FamilyKind; famName: string; re: RegExp }[] = [
  { famKind: "normal", famName: "OCC_CHAIN", re: /tessent_occ|(^|[._])occ([._]|$)|clock_?gate/i },
  { famKind: "normal", famName: "HYPER_CHAIN", re: /hyper/i },
  { famKind: "nonscan", famName: "non-scan", re: /lockup|retim|(channels?|chan)_.*pipe|_pipe(line)?([._]|$)/i },
];

export interface AutoClassifyResult {
  plan: ScanPlan;
  /** family name -> instances it just claimed, for a "here is what I did" summary. */
  added: Record<string, string[]>;
}

/** Paint the obvious structures into their families. Anything already claimed is left alone, so
 *  running it twice is harmless and it never overwrites a decision the engineer made. */
export function autoClassify(plan: ScanPlan, counts: RegCount[], core: string): AutoClassifyResult {
  const claimed = new Set(plan.families.flatMap((f) => f.instances));
  let next = plan;
  const added: Record<string, string[]> = {};
  for (const rule of AUTO_RULES) {
    const fam = next.families.find((f) => f.name === rule.famName || f.kind === rule.famKind);
    if (!fam) continue;
    const roots: string[] = [];
    for (const c of counts) {
      if (!isUnder(core, c.instanceId) || c.instanceId === core) continue;
      const leaf = c.instanceId.split(".").pop() ?? "";
      if (!rule.re.test(leaf)) continue;
      if (claimed.has(c.instanceId)) continue;
      // Only the top-most hit of a chain of matches; its subtree comes with it.
      if (roots.some((r) => isUnder(r, c.instanceId))) continue;
      roots.push(c.instanceId);
    }
    for (const r of roots) {
      next = paintFamily(next, fam.id, r);
      claimed.add(r);
    }
    if (roots.length) added[fam.name] = roots;
  }
  return { plan: next, added };
}

export function clearCoverage(plan: ScanPlan, path: string): ScanPlan {
  const coverage = { ...plan.coverage };
  delete coverage[path];
  return { ...plan, coverage };
}
