// Pure tab reducers (no React/zustand). The store is a thin wrapper over these,
// mirroring GenConnection's core/edit.ts + store split. Unit-tested directly.

import type { Tab } from "./model.ts";

export interface TabState { tabs: Tab[]; activeTabId: string | null; }

/** Open a tab (caller sets the dedupe id); activate the existing one instead of duplicating. */
export function addTab(state: TabState, t: Tab): TabState {
  if (state.tabs.some((x) => x.id === t.id)) return { tabs: state.tabs, activeTabId: t.id };
  return { tabs: [...state.tabs, t], activeTabId: t.id };
}

/** Open a SINGLETON view tab: if one with this id exists, RETARGET it (replace its props)
 *  instead of leaving the stale one in place. Used by the HDL source view so repeated
 *  Show-HDL calls reuse one tab rather than piling up one tab per file:line. */
export function upsertTab(state: TabState, t: Tab): TabState {
  const idx = state.tabs.findIndex((x) => x.id === t.id);
  if (idx < 0) return { tabs: [...state.tabs, t], activeTabId: t.id };
  const tabs = state.tabs.slice();
  tabs[idx] = t;
  return { tabs, activeTabId: t.id };
}

/** Close a tab; if it was active, activate a neighbor (else null). */
export function removeTab(state: TabState, id: string): TabState {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx < 0) return state;
  const tabs = state.tabs.filter((t) => t.id !== id);
  let activeTabId = state.activeTabId;
  if (activeTabId === id) {
    const neighbor = tabs[idx] ?? tabs[idx - 1] ?? null;
    activeTabId = neighbor ? neighbor.id : null;
  }
  return { tabs, activeTabId };
}
