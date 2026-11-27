// VALUE-DISPLAY CONSISTENCY AUDIT — runs the frontend's OWN graph builders over the real
// design's real analysis and checks every painted value against the calculus invariants.
// A violation here is a lie on the screen; zero violations is the guarantee the user asked
// for ("仿真结果不可错").
import { buildCrSchematic } from "/mnt/c/Users/wongw/Desktop/DFT_STUDIO/dft_studio_qt/planner/dft-suite/src/hierarchy/core/crSchematic.ts";
import { withPlannedMuxes } from "/mnt/c/Users/wongw/Desktop/DFT_STUDIO/dft_studio_qt/planner/dft-suite/src/hierarchy/core/plannedMux.ts";
import type { SchematicGraph, SchNode } from "/mnt/c/Users/wongw/Desktop/DFT_STUDIO/dft_studio_qt/planner/dft-suite/src/hierarchy/core/schematic.ts";
import * as fs from "node:fs";

const data = JSON.parse(fs.readFileSync("/tmp/audit_data.json", "utf8"));
const items = data.items as any[];
const muxes = (data.muxes as any[]).map((m) => ({
  target: m.target, overrideSource: m.overrideSource, select: m.select }));
const ips = (data.ips as any[]).map((x) => ({
  instance: x.instance, module: x.module, at: x.at, ports: x.ports }));
const cons = data.cons as Array<{ pin: string; value: string }>;
const roots = ["processor_core"];

const u = (p: string) => p.replace(/[.:]/g, "/");
// the same pathOf the schematic uses for crsch node ids (hier path '.' joined)
const pathOf = (n: string, p: string) => u(`${n}.${p}`);

const bare = (v: string) => v.replace(/^C/, "");
const shiftOf = (v: string | undefined): string => {
  if (!v) return "";
  const m = /^s\(([^)]*)\)/.exec(v);
  return bare(m ? m[1] : v.split("‖")[0]);
};
const flip = (v: string) => (v === "0" ? "1" : v === "1" ? "0" : v === "010" ? "101" : v === "101" ? "010" : v);

let bad = 0;
const complain = (msg: string) => { bad++; console.log("VIOLATION: " + msg); };

// port state lookup for I2/I3
const portState = (full: string): { s: string } | undefined => {
  const p = u(full);
  for (const ip of ips) {
    const base = ip.at ? `${u(ip.at)}/${ip.instance}` : ip.instance;
    if (!p.startsWith(base + "/")) continue;
    const pin = p.slice(base.length + 1);
    const ps = (ip.ports ?? []).find((x: any) => x.port === pin);
    if (ps) return { s: ps.s };
  }
  return undefined;
};

const resets = items;  // resets AND clocks: the continuity invariant is calculus-wide
let graphs = 0, valueEdges = 0;
for (const it of resets) {
  const g0 = buildCrSchematic([it], { seedId: "audit", roots,
    isBad: (x: any) => !x.ok && !x.plannedFix });
  const g: SchematicGraph = withPlannedMuxes(g0, muxes, pathOf, ips, undefined, cons);
  graphs++;

  const nodeOf = (id: string): SchNode | undefined => g.nodes[id];

  // I1: the DFF stateLabel is exactly the daemon's per-phase answer
  const ff = Object.values(g.nodes).find((n) => n.id.startsWith("ff:" + it.kind + ":"));
  if (ff?.stateLabel) {
    const want = `s(${it.value})` + (it.sacValue !== undefined || it.ascValue !== undefined
      ? `-sac(${it.sacValue ?? it.value})/asc(${it.ascValue ?? it.value})` : "");
    if (ff.stateLabel !== want)
      complain(`${it.owner}/${it.net}: stateLabel "${ff.stateLabel}" != daemon "${want}"`);
  }

  for (const e of g.edges) {
    if (!e.val) continue;
    valueEdges++;
    const to = nodeOf(e.toNode);
    const isMux = e.toNode.startsWith("planmux:");
    // I5: the functional arm of a planned mux carries NO inherited value
    if (isMux && e.toPort === "b")
      complain(`${it.owner}/${it.net}: functional arm carries val "${e.val}"`);
    // I2: mux d1 equals the daemon's computed state of the recorded source pin
    if (isMux && e.toPort === "a") {
      const m = muxes.find((x) => e.toNode === `planmux:${u(x.target)}`);
      const ps = m ? portState(m.overrideSource) : undefined;
      if (m && ps && shiftOf(e.val) !== bare(ps.s))
        complain(`${it.owner}/${it.net}: mux d1 "${shiftOf(e.val)}" != daemon ${m.overrideSource}=${ps.s}`);
    }
    if (isMux && e.toPort === "s") {
      const m = muxes.find((x) => e.toNode === `planmux:${u(x.target)}`);
      const ps = m ? portState(m.select) : undefined;
      if (m && ps && shiftOf(e.val) !== bare(ps.s))
        complain(`${it.owner}/${it.net}: mux S "${shiftOf(e.val)}" != daemon ${m.select}=${ps.s}`);
    }
    // I4: value continuity — across every labeled edge chain the shift value only changes
    // through a NOT (flip), a planned mux (recomputed), or a flop (stored value).
    const conts = g.edges.filter((x) => x.fromNode === e.toNode && x.val);
    for (const c of conts) {
      if (!to) continue;
      if (to.prim === "dff" || to.prim === "dlatch") continue;      // stored value: new claim
      if (e.toNode.startsWith("planmux:")) continue;                 // recomputed by the plan
      const a = shiftOf(e.val), b = shiftOf(c.val);
      if (!a || !b) continue;
      const expect = to.prim === "not" ? flip(a) : a;
      // X may resolve to a definite value across the AUTHORITATIVE final edge (the daemon's
      // answer overrides the walk's provisional X) — definite values may never contradict.
      const finalOverride = expect === "X" &&
        (g.nodes[c.toNode]?.prim === "dff" || g.nodes[c.toNode]?.prim === "dlatch");
      if (expect !== b && !finalOverride)
        complain(`${it.owner}/${it.net}: "${a}" through ${to.prim ?? to.kind} -> "${b}" (expected ${expect})`);
    }
  }
}
console.log(`audited ${graphs} reset paths, ${valueEdges} value-labeled edges, ${bad} violation(s)`);
process.exit(bad ? 1 : 0);
