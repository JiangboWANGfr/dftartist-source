import {
  ready as originalReady,
  names,
} from "../pointer-rebind/public-model.mjs";
import { check, equal } from "../pagination/public-model.mjs";
import { selectionSnapshot, unchanged } from "./assertions.mjs";
export { names };
export async function group(classes, mode) {
  const contexts = [],
    extra = [];
  let closed = false;
  const dispose = async () => {
    if (closed) return [];
    closed = true;
    const errors = [];
    for (const s of extra)
      try {
        s.dispose();
      } catch (e) {
        errors.push({ label: "extra-selection", error: e });
      }
    for (const c of contexts.reverse())
      try {
        errors.push(...(await c.close()));
      } catch (e) {
        errors.push({ label: "context", error: e });
      }
    return errors;
  };
  try {
    const old = await originalReady(classes);
    contexts.push(old);
    let current;
    if (mode === "pair") {
      current = await originalReady(classes);
      contexts.push(current);
    } else {
      equal(mode, "selection", "known switch mode");
      const s = new classes.SelectionModel({ snapshotId: old.n.snapshotId });
      extra.push(s);
      current = { n: old.n, s, page: old.page };
    }
    check(current.s !== old.s, "Selection identity changed");
    equal(current.s.snapshotId, old.n.snapshotId, "same supported snapshot");
    const oldState = old.n.state,
      currentState = current.n.state,
      oldSelection = selectionSnapshot(old.s),
      currentSelection = selectionSnapshot(current.s),
      sent = contexts.map((c) => c.sent.length);
    return {
      old,
      current,
      contexts,
      dispose,
      oldState,
      currentState,
      oldSelection,
      currentSelection,
      sent,
    };
  } catch (e) {
    const errors = await dispose();
    if (errors.length)
      throw new AggregateError(
        [e, ...errors.map((entry) => entry.error)],
        "B47 model setup and resource cleanup failed",
        { cause: e },
      );
    throw e;
  }
}
export function preserved(g) {
  unchanged(g.old.s, g.oldSelection);
  unchanged(g.current.s, g.currentSelection);
  equal(g.old.n.state, g.oldState, "old navigation original state");
  equal(g.current.n.state, g.currentState, "new navigation original state");
  g.contexts.forEach((c, i) =>
    equal(c.sent.length, g.sent[i], "no new wire query"),
  );
  check(
    !g.old.n.disposed && !g.current.n.disposed,
    "borrowed navigation alive",
  );
}
export async function modelPremise(classes, mode) {
  const g = await group(classes, mode);
  try {
    const action = g.old.n.createCandidateAction(g.old.page, 0);
    const used =
      mode === "selection"
        ? action
        : g.current.n.createCandidateAction(g.current.page, 0);
    g.current.n.confirmCandidate(used, g.current.s);
    unchanged(g.old.s, g.oldSelection);
    equal(g.current.s.current.origin, "source", "source confirmation");
    equal(
      g.current.s.current.items[0].ref,
      g.current.page.result.items[0].ref,
      "authoritative original item",
    );
    equal(g.old.n.state, g.oldState, "old state untouched");
    equal(g.current.n.state, g.currentState, "current state untouched");
    g.contexts.forEach((c, i) =>
      equal(c.sent.length, g.sent[i], "confirmation no query"),
    );
    return {
      id: "B47-real-" + mode,
      pass: true,
      candidateUI: false,
      oldActionValidAcrossSelectionOnly: mode === "selection",
    };
  } finally {
    const errors = await g.dispose();
    check(
      errors.length === 0,
      "all model premise resources released: " +
        errors.map((e) => e.label).join(","),
    );
  }
}
