// Propose a fix for the reset DRC violations — as a PLAN the engineer reviews, never as an
// edit that happens behind their back.
//
// Every failing reset group has the same shape of problem (the reset cannot be held inactive
// during scan) and the same shape of answer (a control mux driven by the DFX controller, held
// active in test). Doing that by hand is: work out which groups fail, dedupe them down to the
// nets that actually need patching, plan the two IPs once, then record one mux per net — for a
// design with dozens of resets that is an afternoon of identical decisions.
//
// So this computes the whole set and hands it back as a list of actions with reasons. NOTHING is
// recorded here: the caller shows the list, the user unticks what they disagree with, and only
// then are the commands run. An automatic fixer that skips that step is a tool that quietly
// changes a plan its user has not read.

import type { CrPathItem } from "../../core-bridge/model.ts";

export interface FixAction {
  /** "note" is not an action at all — it is something the list has to say (a connection that
   *  needs an inverter). Giving it its own kind stops it being counted, run, or mistaken for a
   *  command by anything downstream. */
  kind: "ip" | "mux" | "note";
  /** The dp_shell command this action will run, verbatim — what the review list shows. */
  command: string;
  /** One line saying why, in the engineer's terms. */
  why: string;
  /** mux only: the reset net being patched, and how many flops ride on it. */
  target?: string;
  flops?: number;
  /** Ticked by default; the review list can untick it. */
  on: boolean;
}

export interface FixInput {
  /** The DRC result being fixed. */
  items: readonly CrPathItem[];
  /** Already-planned IP instances (dp_shell add_dft_ip). */
  ips: ReadonlyArray<{ instance: string; module: string; at: string }>;
  /** Targets that already carry a recorded mux — never proposed twice. */
  patched: readonly string[];
  /** The CURRENT recorded muxes in full (report_dft_ctrl_mux) — lets the review dialog
   *  preview what dfx_dft_plan.tcl will contain AFTER the ticked actions run. */
  currentMuxes?: ReadonlyArray<{ target: string; overrideSource: string; select: string }>;
  /** Module names from the DFX IP library, if it has been scanned. */
  dynamicModule?: string;
  staticModule?: string;
}

const userPath = (p: string) => p.replace(/[.:]/g, "/");
const ipPath = (x: { instance: string; at: string }) =>
  x.at ? `${userPath(x.at)}/${x.instance}` : x.instance;

/** The net a reset group hangs on — `owner/net`, which is what a mux is recorded against. */
export const resetTarget = (i: CrPathItem): string => `${userPath(i.owner)}/${i.net}`;

/**
 * WHERE the fix goes: the common source of the reset, not the flop that suffers from it.
 *
 * A reset generated in one place and fanned out to the whole chip shows up as one violation per
 * destination — 118 of them on this design, every one saying `src=…/sync_cell_puc/data_sync`.
 * Patching each destination means 118 muxes for a problem that has ONE source, and no DFT
 * engineer would do that: you control the reset where it is made. The DRC already says so, in
 * as many words — "(insert the DFT control point here)".
 *
 * `detail` carries the source path plus a human tail ("… <- flop @clk, async reset rst (…)"), so
 * it is cut at the first space. A group with no source to name (undriven) is patched at its own
 * net, which is the only place there is.
 */
/**
 * What `dfx_rst_scan_n` is held at during SCAN SHIFT.
 *
 * It is ONE physical pin, active-low, and the methodology fixes its value per test phase:
 *   scan shift        — 1 (inactive): the chain cannot shift while a reset is asserted
 *   stuck-at capture  — 0 or 1, whichever the pattern wants (dfx_sa_mode makes it controllable)
 *   transition capture— 1 throughout: a reset firing mid-launch/capture destroys the transition
 *
 * The reset DRC checks SHIFT, so 1 is the value that matters here. It is a constant, not a
 * per-reset choice: picking 0 for one reset and 1 for another would need two different pins.
 */
export const RST_SCAN_N_SHIFT = "1";

/**
 * What actually arrives at the flop when the source is held at its shift value.
 *
 * The mux sits at the SOURCE, the requirement (`inactive`) is stated at the FLOP, and every
 * inverter between the two flips one into the other. A mux on the flop's own net has nothing in
 * between.
 */
export function arrivesAtFlop(i: CrPathItem): string {
  const flip = (v: string) => (v === "1" ? "0" : v === "0" ? "1" : v);
  const atOwnNet = fixPoint(i) === resetTarget(i);
  return atOwnNet || !i.inverted ? RST_SCAN_N_SHIFT : flip(RST_SCAN_N_SHIFT);
}

/**
 * Does driving this reset from `dfx_rst_scan_n` actually hold it inactive?
 *
 * When it does not, the plan is not wrong — the CONNECTION is: that reset wants the inverse of
 * the pin (an inverter on the mux's test input, or an active-high sibling signal). Recording it
 * anyway with a value the pin cannot hold would make the DRC report a fix that does not exist,
 * so it is said out loud instead.
 */
export const needsInverter = (i: CrPathItem): boolean => arrivesAtFlop(i) !== i.inactive;

/** Does this path put an INVERTER between the fix point and the flop? Then the value the
 *  source must hold is the FLIP of the register's inactive value — the rail follows. */
export const invertedToSource = (i: CrPathItem): boolean =>
  i.inverted === true && fixPoint(i) !== resetTarget(i);

/**
 * The value the COMMON SOURCE must hold so this register's reset/set pin sits INACTIVE:
 * the register's polarity (its inactive value) pulled back through the path's inversions.
 * With nothing in between this IS the naming convention —
 *   dfx_rst_scan_n (1)  controls active-LOW  reset registers,
 *   dfx_rst_scan_p (0)  controls active-HIGH reset registers —
 * and an inverter on the way flips which rail reaches the register correctly. Both matter:
 * this design fixes 1323 active-HIGH bits from dfx_rst_scan_n BECAUSE an inverter sits
 * between the source and every one of them ("反相器一定不能忽略").
 */
export function requiredSourceValue(i: CrPathItem): string {
  const flip = (v: string) => (v === "1" ? "0" : v === "0" ? "1" : v);
  return invertedToSource(i) ? flip(i.inactive) : i.inactive;
}

/** The IP pin whose shift value equals `v`: the rst pair for reset pins, the set pair for
 *  SET pins; …_n computes 1 in shift, …_p its inverse. */
export const sourcePinFor = (v: string, set = false): string =>
  `dfx_${set ? "set" : "rst"}_scan_${v === "0" ? "p" : "n"}`;

export function fixPoint(i: CrPathItem): string {
  const src = userPath((i.detail ?? "").split(/\s/)[0] ?? "");
  if (!src || i.terminus === "undriven") return resetTarget(i);
  // The RECORDED point must be a real HIERARCHICAL PIN on a real instance ("在真实的实线框的
  // hierarchical pin 上插入 mux") — the insertion flow attaches control points to instance
  // pins, never to a net buried inside the module (data_sync is the flop's internal net; the
  // pin the wire leaves through is sync_cell_puc/data_out). The walk recorded exactly that
  // crossing: the LAST xdn out of the source's own instance. Electrically identical (same
  // net segment, zero gates between), but only the pin form is insertable.
  const srcInst = src.split("/").slice(0, -1).join("/");
  for (let k = i.elems.length - 1; k >= 0; k--) {
    const e = i.elems[k];
    if (!e.startsWith("xdn@")) continue;
    const body = e.slice(4).split("|")[0] ?? "";
    const c = body.lastIndexOf(":");
    if (c <= 0) continue;
    const inst = userPath(body.slice(0, c));
    if (inst === srcInst) return `${inst}/${body.slice(c + 1)}`;
  }
  return src;
}

/**
 * Which reset groups are worth patching.
 *
 * A group fails when its value at the flop is not the inactive one. `sequential` (R3 — the reset
 * comes out of a register) is included and SAID SO: a mux fixes controllability there too, but
 * the engineer should know that is what they are looking at. Groups that already pass are left
 * alone — a mux on a working reset is cost with no benefit.
 */
export function failingResets(items: readonly CrPathItem[]): CrPathItem[] {
  return items.filter((i) => i.kind === "reset" && !i.ok);
}

/**
 * Recorded muxes that are REDUNDANT: something upstream on the same reset is patched too.
 *
 * Two muxes in series on one reset is one mux of wasted hardware and two things to maintain. It
 * happens honestly — patch a destination today, discover the common source tomorrow — so the
 * tool has to be able to SEE it rather than leaving the engineer to spot two violet boxes on one
 * wire. A mux is redundant when the reset it patches is itself generated behind another patched
 * point.
 */
export function redundantMuxes(items: readonly CrPathItem[], patched: readonly string[]): Array<{
  target: string; upstream: string;
}> {
  const set = new Set(patched.map(userPath));
  const out: Array<{ target: string; upstream: string }> = [];
  const seen = new Set<string>();
  for (const i of items) {
    if (i.kind !== "reset") continue;
    const here = resetTarget(i);
    if (!set.has(here) || seen.has(here)) continue;
    const src = fixPoint(i);
    // fixPoint returns the net itself when there is no source to name — that is not "upstream".
    if (src === here || !set.has(src)) continue;
    seen.add(here);
    out.push({ target: here, upstream: src });
  }
  return out;
}

/** What one planned mux actually buys: the reset groups it is the fix point for. */
export interface MuxCoverage {
  target: string;
  /** Failing groups whose fix point IS this mux (the ones it exists for). */
  groups: number;
  flops: number;
  /** The nets/pins those groups reset (a few, for the label). */
  serves: string[];
  /** Nothing needs it — the honest definition of a redundant mux. */
  redundant: boolean;
}

/**
 * Why several muxes sit on ONE wire.
 *
 * A reset chain crosses several REGISTER outputs (sync_reset_por -> por -> puc_a -> sync_cell_puc
 * -> puc_rst). Every register output is X while the chain shifts no matter what feeds it, so each
 * one needs its OWN control point: the muxes are in series on the picture but they serve disjoint
 * flop groups. That reads as duplicated work unless the tool says who each mux is for — which is
 * exactly what this computes, and it is also the only sound way to spot a mux that is genuinely
 * redundant (one no failing group names as its fix point).
 */
/** Groups a control point exists FOR: still-failing resets, and resets that pass ONLY because
 *  a planned mux holds them. Counting just the failing ones makes every mux look redundant the
 *  moment its fix lands — the exact moment the question "why is it here" gets asked. */
const controlledResets = (items: readonly CrPathItem[]): CrPathItem[] =>
  items.filter((i) => i.kind === "reset" && (!i.ok || i.plannedFix === true));

/** Which mux a group belongs to. A group HELD by a planned mux carries the daemon's own
 *  attribution (plannedMuxTarget — the nearest planned point decided its value); a group still
 *  failing names the point where its fix would go. */
const attributedTo = (i: CrPathItem): string =>
  i.plannedFix && i.plannedMuxTarget ? userPath(i.plannedMuxTarget) : fixPoint(i);

export function muxCoverage(items: readonly CrPathItem[],
                            targets: readonly string[]): MuxCoverage[] {
  const byTarget = new Map<string, MuxCoverage>();
  for (const t of targets.map(userPath))
    byTarget.set(t, { target: t, groups: 0, flops: 0, serves: [], redundant: true });
  for (const i of controlledResets(items)) {
    const cov = byTarget.get(attributedTo(i));
    if (!cov) continue;
    cov.groups++;
    cov.flops += i.flopCount;
    cov.redundant = false;
    const net = i.net ?? "";
    if (net && cov.serves.length < 4 && !cov.serves.includes(net)) cov.serves.push(net);
  }
  return [...byTarget.values()].sort((a, b) => b.flops - a.flops);
}

/**
 * One-line "who is this mux for", for the box on the canvas.
 *
 * `forItem` is the violation the picture is about (the DRC debug view has one). A mux that is
 * NOT that violation's fix point is doing its work on another branch — the picture must say so,
 * because two muxes drawn in series on one wire otherwise read as the same fix applied twice.
 */
/** The exact register groups a planned mux serves — the on-demand PROOF behind the role
 *  caption. "这个 mux 没 drive 任何寄存器" is answerable only by listing them: owner instance,
 *  reset net, flop count, and whether the group is currently HELD by the plan or still
 *  failing. Sorted biggest first. */
export interface CoveredGroup {
  owner: string; net: string; flops: number; held: boolean;
  /** enough to DRAW the group as a real DFF box: active edge, required inactive value, and
   *  the per-phase values at the flop pin (what the reset actually is right now). */
  edge: string; inactive: string; set: boolean;
  s: string; sac: string; asc: string;
}
export function muxCoveredGroups(items: readonly CrPathItem[], target: string): CoveredGroup[] {
  const t = userPath(target);
  const out: CoveredGroup[] = [];
  for (const i of controlledResets(items))
    if (attributedTo(i) === t)
      out.push({ owner: userPath(i.owner ?? ""), net: i.net ?? "",
                 flops: i.flopCount, held: i.ok === true,
                 edge: i.edge ?? "", inactive: i.inactive ?? "", set: i.set === true,
                 s: i.value ?? "X",
                 sac: (i as { sacValue?: string }).sacValue ?? "",
                 asc: (i as { ascValue?: string }).ascValue ?? "" });
  return out.sort((a, b) => b.flops - a.flops);
}

export function muxRole(items: readonly CrPathItem[], target: string,
                        forItem?: CrPathItem): string {
  const t = userPath(target);
  const mine: CrPathItem[] = [];
  for (const i of controlledResets(items)) if (attributedTo(i) === t) mine.push(i);
  if (!mine.length) return "无复位组需要它 — 可删";
  const flops = mine.reduce((n, i) => n + i.flopCount, 0);
  const owners = [...new Set(mine.map((i) => {
    const o = userPath(i.owner ?? "");
    return `${o.split("/").pop() ?? o}/${i.net}`;
  }))];
  const head = `${flops} flop`;
  const who = owners.slice(0, 3).join(", ") + (owners.length > 3 ? ` +${owners.length - 3}` : "");
  if (!forItem) return `${head} · ${who}`;
  // Is the violation on screen one of the groups this mux exists for?
  const isMine = attributedTo(forItem) === t;
  return isMine ? `本组的修复点 · ${head} · ${who}`
                : `其他分支 · ${head} · ${who}`;
}

/**
 * The full proposal, in the order it must run: the IPs first (a mux references their pins), then
 * one mux per reset SOURCE, biggest first — the source feeding 800 flops is the one whose
 * correctness matters most, and reading the list top-down should show that.
 */
export function proposeResetFixes(inp: FixInput): FixAction[] {
  const { items, ips, patched } = inp;
  const out: FixAction[] = [];

  // Clean up first, HARMFUL before redundant: a recorded mux that drives a reset to its ACTIVE
  // value is worse than no mux at all — the plan itself asserts the reset. The daemon names the
  // culprit (the nearest mux decided the value), so the deletion targets exactly it. This is the
  // state a plan gets stuck in when a wire was right-clicked on the wrong side of an inverter,
  // and it used to require the user to notice and delete by hand.
  const harmful = new Map<string, { flops: number; value: string; inactive: string }>();
  for (const i of items) {
    if (i.kind !== "reset" || i.ok || !i.plannedFix || !i.plannedMuxTarget) continue;
    const t = userPath(i.plannedMuxTarget);
    const cur = harmful.get(t);
    if (cur) cur.flops += i.flopCount;
    else harmful.set(t, { flops: i.flopCount, value: i.value, inactive: i.inactive });
  }
  for (const [t, h] of harmful)
    out.push({
      kind: "mux", on: true, target: t,
      command: `delete_dft_ctrl_mux ${t}`,
      why: `HARMFUL — this planned mux drives the reset to ${h.value}, its ACTIVE value ` +
           `(inactive is ${h.inactive}); ${h.flops} flop(s) held in reset by the plan itself. ` +
           `Delete it; whatever the source patch covers takes over on the re-run.`,
    });

  // A mux that something upstream already covers is hardware for nothing, and leaving it in
  // place while adding more is how a plan grows two muxes on one wire.
  for (const r of redundantMuxes(items, patched))
    out.push({
      kind: "mux", on: true, target: r.target,
      command: `delete_dft_ctrl_mux ${r.target}`,
      why: `redundant — ${r.upstream} is patched too, and it is upstream of this one`,
    });

  const dyn = ips.find((x) => /dynamic/i.test(x.module));
  const sta = ips.find((x) => /static/i.test(x.module));
  const dynModule = inp.dynamicModule ?? "dfx_dynamic_hyper_ctl";
  const staModule = inp.staticModule ?? "dfx_static_hyper_ctl_tdr";
  const dynInst = dyn ? ipPath(dyn) : `u_${dynModule}`;
  const staInst = sta ? ipPath(sta) : `u_${staModule}`;

  if (!dyn)
    out.push({
      kind: "ip", on: true,
      command: `add_dft_ip ${dynModule} -instance ${dynInst}`,
      why: "drives the reset in test mode (dfx_rst_scan_n); planned only — no RTL is edited",
    });
  if (!sta)
    out.push({
      kind: "ip", on: true,
      command: `add_dft_ip ${staModule} -instance ${staInst}`,
      why: "drives the mux select (dfx_scan_mode); planned only — no RTL is edited",
    });

  // ONE mux per SOURCE. Everything that reset feeds is fixed by controlling where it is made.
  // Each failing group states what the SOURCE must be (requiredSourceValue: the flop's
  // inactive value pulled back through the path's inversions) and the tally picks the IP pin:
  // 1 -> dfx_rst_scan_n, 0 -> dfx_rst_scan_p. High-active reset, low-active reset and SET all
  // reduce to this one question — which rail does this source need.
  const done = new Set(patched.map(userPath));
  // Tally per source by the PIN each group needs (family x register polarity): rst/set rail
  // pair from whether the async branch loads ones, n/p from the register's inactive value.
  // An inverter on the way does NOT change the rail — it is counted and flagged instead.
  const bySource = new Map<string, {
    flops: number; groups: number; item: CrPathItem; pins: Map<string, number>; inv: number;
  }>();
  for (const i of failingResets(items)) {
    if (i.plannedFix) continue;   // its fix this round is the deletion above; re-run decides
    const t = fixPoint(i);
    if (done.has(t)) continue;
    const pin = sourcePinFor(requiredSourceValue(i), i.set === true);
    const cur = bySource.get(t) ??
      { flops: 0, groups: 0, item: i, pins: new Map<string, number>(), inv: 0 };
    cur.flops += i.flopCount;
    cur.groups++;
    cur.pins.set(pin, (cur.pins.get(pin) ?? 0) + i.flopCount);
    if (invertedToSource(i)) cur.inv += i.flopCount;   // shown for transparency, not a warning
    bySource.set(t, cur);
  }

  const rows = [...bySource.entries()].sort((a, b) => b[1].flops - a[1].flops);

  // A source both polarities claim is a REAL conflict: one wire cannot deliver 0 and 1 at
  // once. The majority rail wins the mux; the minority needs an inverter on its branch, and
  // the DRC keeps saying so until the connection provides one.
  const conflicts = rows.filter(([, r]) => r.pins.size > 1);
  if (conflicts.length)
    out.push({
      kind: "note", on: false,
      command: `# ${conflicts.length} source(s) feed pins that need DIFFERENT rails — the ` +
               `minority side needs an INVERTER on its branch (or its own mux)`,
      why: "one source wire cannot serve two rails at once; the mux takes the rail that fixes " +
           "the most flops, the other branches keep failing until an inverter (or a separate " +
           "mux behind one) serves them",
    });

  const rowsInv = new Map([...bySource.entries()].map(([t, r]) => [t, r.inv]));
  for (const [target, { flops, groups, item, pins }] of rows) {
    const why =
      item.terminus === "sequential"
        ? `driven by a register (R3) — value ${item.value}, needs ${item.inactive}`
        : item.terminus === "undriven"
        ? `undriven — value ${item.value}, needs ${item.inactive}`
        : `not held inactive — value ${item.value}, needs ${item.inactive}`;
    const ranked = [...pins.entries()].sort((a, b) => b[1] - a[1]);
    const srcPin = ranked[0][0];
    const srcValue = srcPin.endsWith("_p") ? "0" : "1";
    const minority = flops - ranked[0][1];
    const invFlops = rowsInv.get(target) ?? 0;
    out.push({
      kind: "mux", on: true, target, flops,
      // NO -source_value, NO hidden constraints: the pin is CHOSEN so its computed shift value
      // (dfx_rst_scan_n -> 1, dfx_rst_scan_p -> 0) is what this source needs; the values
      // themselves compute from the IP circuit, and only the user's own constraints override.
      command: `add_dft_ctrl_mux ${target} -override_source ${dynInst}/${srcPin}` +
               ` -select ${staInst}/dfx_scan_mode`,
      why: `${why}; ${flops} flop(s)` +
           (groups > 1 ? ` across ${groups} reset group(s) — one mux at the source fixes them all` : "") +
           `; register inactive=${item.inactive}` +
           (invFlops > 0 ? ` through an inverter (${invFlops} flop(s))` : "") +
           ` -> source must be ${srcValue} -> ${srcPin}` +
           (minority > 0
             ? `  ⚠ ${minority} flop(s) here need the OPPOSITE rail — an inverter on their branch`
             : ""),
    });
  }
  // dfx_scan_mode / dfx_rst_scan_n themselves are NEVER constrained — their values compute
  // from the IP inputs. When the DRC shows X, the thing to constrain is an INPUT (a mode pin,
  // scan_enable), and the circuit report names the first missing one.
  if (rows.length)
    out.push({
      kind: "note", on: false,
      command: `# X 处理: 只约束 IP 的输入(例: add_pin_constraint ${dynInst}/dfx_lbist_mode 0),` +
               `不要约束 dfx_scan_mode/dfx_rst_scan_n 本身; ` +
               `report_dft_ip_circuit ${dynInst}/dfx_rst_scan_n 会指名第一个未约束的输入`,
      why: "the DFT-side values COMPUTE from the IP's input pins through its real gates; an X means " +
           "an input (mode pin / scan_enable / a hold register's programming input) is undeclared — " +
           "constrain that input, never the computed output",
    });
  return out;
}


/** What a round of auto-fixing actually achieved, counted off the re-run DRC. */
export interface FixOutcome {
  /** Failing reset groups before the fix. */
  before: number;
  /** Groups that now pass BECAUSE of a planned mux — designed, not inserted. */
  fixed: number;
  /** Groups still failing: the plan could not solve them and they need a decision. */
  left: number;
  /** Flops covered by the fixed groups. */
  fixedFlops: number;
  /** The still-failing sources, biggest first — what to look at next. */
  remaining: Array<{ target: string; flops: number; why: string }>;
}

/** Compare a re-run DRC against the count taken before the fix. */
export function fixOutcome(before: number, items: readonly CrPathItem[]): FixOutcome {
  const resets = items.filter((i) => i.kind === "reset");
  const fixedItems = resets.filter((i) => i.ok && i.plannedFix);
  const failing = resets.filter((i) => !i.ok);

  // Report what is LEFT by source too — 118 rows all naming one source is not 118 problems.
  const bySource = new Map<string, { flops: number; why: string }>();
  for (const i of failing) {
    const t = fixPoint(i);
    const cur = bySource.get(t);
    if (cur) cur.flops += i.flopCount;
    else bySource.set(t, {
      flops: i.flopCount,
      why: i.terminus === "sequential" ? "driven by a register (R3)"
         : i.terminus === "undriven" ? "undriven"
         : i.terminus === "blackbox" ? "driven by a blackbox — no model to trace"
         : `value ${i.value}, needs ${i.inactive}`,
    });
  }
  return {
    before,
    fixed: fixedItems.length,
    left: failing.length,
    fixedFlops: fixedItems.reduce((n, i) => n + i.flopCount, 0),
    remaining: [...bySource.entries()]
      .map(([target, r]) => ({ target, ...r }))
      .sort((a, b) => b.flops - a.flops),
  };
}
