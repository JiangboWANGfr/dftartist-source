import { ready as realReady } from "../actions/public-model.mjs";
import { observePublicCalls } from "../pagination/public-calls.mjs";
import { unchanged } from "./assertions.mjs";
export async function ready(classes) {
  const c = await realReady(classes);
  try {
    c.originalState = c.n.state;
    c.history = { back: c.s.canGoBack, forward: c.s.canGoForward };
    c.feedback = [];
    c.trace = [];
    c.commitSnapshots = [];
    c.tap = observePublicCalls(c.n, [
      "load",
      "reloadDocument",
      "cancelDocument",
      "clear",
      "locate",
      "loadMore",
      "reloadCandidates",
      "cancelCandidates",
      "createCandidateAction",
      "confirmCandidate",
      "dispose",
    ]);
    c.subscribeTap = observePublicCalls(c.n, ["subscribe"]);
    c.selectionTap = observePublicCalls(c.s, [
      "select",
      "back",
      "forward",
      "subscribe",
      "dispose",
    ]);
    return c;
  } catch (error) {
    const errors = [error];
    for (const tap of [c.tap, c.subscribeTap, c.selectionTap])
      try {
        tap?.dispose();
      } catch (e) {
        errors.push(e);
      }
    try {
      errors.push(...(await c.close()).map((e) => e.error));
    } catch (e) {
      errors.push(e);
    }
    if (errors.length === 1) throw error;
    throw new AggregateError(errors, "B44 setup and release");
  }
}
export async function modelControl(classes) {
  const c = await ready(classes);
  try {
    const actions = c.page.result.items.map((_, i) =>
      c.n.createCandidateAction(c.page, i),
    );
    unchanged(c);
    return {
      id: "B44-real-ready-original-tuple-premise",
      pass: true,
      candidateUI: false,
      items: actions.length,
    };
  } finally {
    const errors = [];
    for (const tap of [c.tap, c.subscribeTap, c.selectionTap])
      try {
        tap?.dispose();
      } catch (e) {
        errors.push(e);
      }
    try {
      errors.push(...(await c.close()).map((e) => e.error));
    } catch (e) {
      errors.push(e);
    }
    if (errors.length)
      throw new AggregateError(errors, "B44 real model control release");
  }
}
