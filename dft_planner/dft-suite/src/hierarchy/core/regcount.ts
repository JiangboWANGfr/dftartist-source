import type { RegCount, RegCountResult } from "../../core-bridge/model.ts";

// "hier" = the daemon's pre-order (each parent immediately before its descendants) — preserves
// the design hierarchy; the numeric keys sort flat for "biggest-flop" analysis.
export type RegSortKey = "hier" | "own" | "subtree" | "memoryBits";
export interface RegSort { key: RegSortKey; dir: "asc" | "desc"; }

/** Depth of an instance in the hierarchy = number of path segments below the root. */
export function depthOf(instanceId: string): number {
  return instanceId.split(".").length - 1;
}

/** Last path segment (the instance's own name), for indented tree display. */
export function leafName(instanceId: string): string {
  const i = instanceId.lastIndexOf(".");
  return i < 0 ? instanceId : instanceId.slice(i + 1);
}

/** Filter by instanceId substring, then either keep hierarchical (pre-order) order ("hier")
 *  or sort flat by the chosen numeric column. */
export function regRows(result: RegCountResult, sort: RegSort, filter: string): RegCount[] {
  const f = filter.trim().toLowerCase();
  const rows = f
    ? result.counts.filter(c => c.instanceId.toLowerCase().includes(f))
    : result.counts.slice();
  if (sort.key === "hier") return rows;   // preserve daemon pre-order (the hierarchy)
  const key = sort.key;
  const sign = sort.dir === "asc" ? 1 : -1;
  rows.sort((a, b) => (a[key] - b[key]) * sign);
  return rows;
}
