// The instance tree the Scan Planner shows.
//
// The page used to open on ONE row (the core, collapsed): every block had to be found by
// clicking ▶ blindly, level after level, with no clue where the flops were ("操作起来不是很
// 方便"). Both fixes are pure functions so they are testable without the daemon: open on the
// design's real fan-out, and put the biggest blocks first.

import type { RegCount } from "../../core-bridge/model.ts";

/** Immediate children of `id` (counts carry full hierarchical paths). */
export function childrenOf(counts: readonly RegCount[], id: string): RegCount[] {
  const out: RegCount[] = [];
  const pre = id + ".";
  for (const c of counts) {
    if (!c.instanceId.startsWith(pre)) continue;
    if (c.instanceId.slice(pre.length).includes(".")) continue;
    out.push(c);
  }
  return out;
}

/**
 * The expansion the tree OPENS with: descend from the core revealing structure until `target`
 * rows are on screen, biggest subtree first, and never stop inside a single-child chain — a
 * wrapper holding one block tells the reader nothing, the block below it is what they came for.
 */
export function initialExpansion(counts: readonly RegCount[], coreId: string,
                                 target = 24): Set<string> {
  const open = new Set<string>();
  if (!counts.some((c) => c.instanceId === coreId)) return open;

  // Phase 1 — skip the WRAPPER CHAIN. While the current node has exactly one child, opening it
  // adds a row without adding information: a top that holds one core, holding one datapath, is
  // three rows saying the same thing. Follow it through, whatever the budget, so the first
  // screen is never a single row.
  let head = coreId;
  for (;;) {
    const kids = childrenOf(counts, head);
    if (kids.length !== 1) break;
    open.add(head);
    head = kids[0].instanceId;
  }
  const fanout = childrenOf(counts, head);
  if (!fanout.length) return open;
  open.add(head);

  // Phase 2 — reveal the fan-out biggest-subtree-first, under the row budget. Here a
  // single-child node gets NO exemption: fifty blocks each holding one sub-block would
  // otherwise open all fifty and bury the page they were meant to make readable.
  let shown = 1 + fanout.length;
  const frontier: RegCount[] = [...fanout];
  while (frontier.length) {
    frontier.sort((a, b) => b.subtree - a.subtree);
    const next = frontier.shift()!;
    const kids = childrenOf(counts, next.instanceId);
    if (!kids.length || shown + kids.length > target) continue;
    open.add(next.instanceId);
    shown += kids.length;
    frontier.push(...kids);
  }
  return open;
}

/**
 * The visible rows, in DFS order with siblings sorted. "bits" puts the biggest blocks first —
 * the question this page answers is "where are the flops", and daemon (declaration) order
 * buries a 1300-bit core under a 4-bit synchroniser.
 */
export function treeRows(counts: readonly RegCount[], coreId: string,
                         expanded: ReadonlySet<string>,
                         sort: "bits" | "name" = "bits"): RegCount[] {
  const core = counts.find((c) => c.instanceId === coreId);
  if (!core) return [];
  const out: RegCount[] = [];
  const walk = (node: RegCount): void => {
    out.push(node);
    if (!expanded.has(node.instanceId)) return;
    const kids = childrenOf(counts, node.instanceId);
    kids.sort((a, b) => (sort === "name"
      ? a.instanceId.localeCompare(b.instanceId)
      : b.subtree - a.subtree || a.instanceId.localeCompare(b.instanceId)));
    for (const k of kids) walk(k);
  };
  walk(core);
  return out;
}

/** Every ancestor of `id` below `coreId` — what a filter hit needs opened to be reachable
 *  once the filter is cleared, so "find it, then work around it" keeps the context. */
export function ancestorsOf(id: string, coreId: string): string[] {
  const out: string[] = [];
  let cur = id;
  while (cur.length > coreId.length && cur.startsWith(coreId + ".")) {
    const i = cur.lastIndexOf(".");
    if (i <= 0) break;
    cur = cur.slice(0, i);
    out.push(cur);
  }
  return out;
}
