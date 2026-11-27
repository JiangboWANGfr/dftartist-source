import React, { act } from "react";
import { createRoot } from "react-dom/client";
import * as vm from "@hier/viewmodel";
import { SourceCandidatesView } from "@hier/views";
import { createContext, page } from "./scenario.mjs";

window.IS_REACT_ACT_ENVIRONMENT = true;
let c, root, originals, calls, errors, subscriptions, releases;
function snapshot() {
  return {
    rows: [...document.querySelectorAll("li button")].map(b => ({ text: b.textContent, disabled: b.getAttribute("aria-disabled") === "true", tabIndex: b.tabIndex })),
    status: document.querySelector('[role="status"]')?.textContent,
    selection: c.selection.current,
    actions: calls,
    sdk: c.calls.map(({ method, ref, kind, file, query, request }) => ({ method, ref, kind, file, query, request })),
    failures: errors,
  };
}
window.candidate = {
  async setup() {
    c = await createContext(vm, { pageSize: 4 });
    originals = Array.from({ length: 8 }, (_, i) => page(i, `cursor-${i}`, { count: 4 }));
    await c.answer(() => c.model.locate(c.document, 0), originals[0]);
    for (const p of originals.slice(1)) await c.answer(() => c.model.loadMore(), p);
    calls = []; errors = []; subscriptions = 0; releases = 0;
    const issue = c.model.createCandidateAction.bind(c.model), subscribe = c.model.subscribe.bind(c.model);
    c.model.createCandidateAction = (p, i) => { calls.push([c.model.state.candidates.state.pages.indexOf(p), i]); return issue(p, i); };
    c.model.subscribe = notify => { subscriptions++; const off = subscribe(notify); return () => { releases++; off(); }; };
    root = createRoot(document.getElementById("app"));
    await act(async () => root.render(<React.StrictMode><SourceCandidatesView navigation={c.model} selection={c.selection} ariaLabel="A candidates" height={360} onCommandError={e => errors.push({ command: e.command, code: e.error.code })} /></React.StrictMode>));
    return snapshot();
  },
  async render() {
    await act(async () => root.render(<React.StrictMode><SourceCandidatesView navigation={c.model} selection={c.selection} ariaLabel="A candidates" height={360} onCommandError={e => errors.push({ command: e.command, code: e.error.code })} /></React.StrictMode>));
    return snapshot();
  },
  async cancel() {
    await act(async () => {
      const pending = c.model.loadMore(); const observed = pending.catch(error => error.code);
      await c.model.cancelCandidates();
      if (await observed !== "cancelled") throw Error("expected cancellation");
    });
    return snapshot();
  },
  async append() {
    await act(async () => { await c.answer(() => c.model.loadMore(), page(8, "next", { count: 4 })); });
    return snapshot();
  },
  async reloadSame() {
    await act(async () => { await c.answer(() => c.model.reloadCandidates(), originals[0]); });
    return snapshot();
  },
  snapshot,
  async close() {
    await act(async () => root.unmount());
    const borrowedAlive = !c.model.disposed && !c.selection.disposed;
    const cleanup = c.close();
    return { ...cleanup, subscriptions: subscriptions - releases, borrowedAlive, nodes: document.getElementById("app").childElementCount };
  },
};
