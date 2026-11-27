import { check, equal } from "../pagination/public-model.mjs";
import { bindings } from "../actions/assertions.mjs";
export function unchanged(c) {
  equal(c.n.state, c.originalState, "same original Navigation state");
  equal(c.n.state.candidates.state.pages[0], c.page, "same original page");
  equal(c.s.current, c.before, "Selection unchanged");
  equal(c.s.canGoBack, c.history.back, "back history unchanged");
  equal(c.s.canGoForward, c.history.forward, "forward history unchanged");
  equal(c.n.disposed, false, "borrowed navigation remains live");
  equal(c.s.disposed, false, "borrowed Selection remains live");
  equal(c.sent.length, c.sentBefore, "no query/cancel/wire operation");
  equal(
    c.selectionTap.records.length,
    0,
    "no Selection command/subscription/disposal",
  );
  equal(c.feedback.length, 0, "no view command failure");
}
export function beforeCommit(c) {
  unchanged(c);
  equal(
    c.tap.records.length,
    0,
    "uncommitted primary has zero public commands",
  );
  equal(c.commitSnapshots.length, 0, "primary has not committed");
}
export function afterCommit(c) {
  unchanged(c);
  const actions = bindings(c.tap.records, c.n, c.page);
  equal(c.tap.records.length, 2, "only one original tuple binding batch");
  equal(c.commitSnapshots.length, 1, "host witness first actual primary mount");
  equal(
    c.commitSnapshots[0].state,
    c.originalState,
    "commit uses original state identity",
  );
  equal(
    c.commitSnapshots[0].commands.length,
    0,
    "post-candidate layout witness has no command yet",
  );
  check(
    c.subscribeTap.records.length > 0,
    "actual primary subscribed to Navigation",
  );
  for (const r of c.subscribeTap.records) {
    equal(r.receiver, c.n, "original subscription receiver");
    equal(r.args.length, 1, "original subscription arity");
    check(typeof r.args[0] === "function", "original listener");
    equal(r.status, "returned", "original subscribe returned");
    check(typeof r.value === "function", "original unsubscribe return");
  }
  return actions;
}
