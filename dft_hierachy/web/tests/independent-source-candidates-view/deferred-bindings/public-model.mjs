import { ready, names } from "../pointer-rebind/public-model.mjs";
import { observePublicCalls } from "../pagination/public-calls.mjs";
import { complete, equal, check } from "../pagination/public-model.mjs";
import { bindings, onlyHost } from "./assertions.mjs";
export { ready, names, observePublicCalls, complete, equal, check };
export async function reload(c, afterPending) {
  const at = c.tap.records.length,
    p = c.n.reloadCandidates();
  p.catch(() => {});
  c.owned.push(p);
  const host = c.tap.records[at];
  equal(host.name, "reloadCandidates", "one explicit host command");
  equal(host.receiver, c.n, "host receiver");
  equal(host.args.length, 0, "host arity");
  equal(host.value, p, "host original Promise");
  equal(c.n.state.candidates.state.status, "pending", "actual pending");
  equal(c.n.state.candidates.state.pages.length, 0, "old page chain removed");
  // Start the fixture's pending commit before the first await yields to old work.
  const pendingStep = afterPending?.();
  const q = await c.next("source.resolve");
  check(q, "reload request");
  if (pendingStep) await pendingStep;
  c.ok(q, { items: c.items }, complete);
  await p;
  const page = c.n.state.candidates.state.pages[0];
  check(page !== c.page, "new original noncached Reply");
  equal(c.n.state.document.data, c.document, "same original document");
  return { host, page };
}
export async function modelControl(classes, mode) {
  const c = await ready(classes),
    errors = [];
  let release;
  try {
    c.tap = observePublicCalls(c.n, names);
    const notifications = [];
    release = c.n.subscribe(() => notifications.push(c.n.state));
    let page = c.page,
      host = [];
    if (mode === "reload") {
      const t = await reload(c);
      page = t.page;
      host = [t.host];
      check(
        notifications.some((s) => s.candidates?.state.status === "pending"),
        "pending notification",
      );
      check(
        notifications.some((s) => s.candidates?.state.status === "success"),
        "success notification",
      );
    }
    c.n.createCandidateAction(page, 0);
    c.n.createCandidateAction(page, 1);
    bindings(c.tap.records, c.n, page);
    onlyHost(c.tap.records, host);
    equal(c.s.current, c.before, "host premise no selection");
    equal(
      c.sent.length - c.sentBefore,
      mode === "reload" ? 1 : 0,
      "host-only query count",
    );
    return {
      id: "B40-model-" + mode,
      pass: true,
      candidateUI: false,
      notifications: notifications.length,
    };
  } finally {
    try {
      release?.();
    } catch (e) {
      errors.push(e);
    }
    try {
      c.tap?.dispose();
    } catch (e) {
      errors.push(e);
    }
    try {
      errors.push(...(await c.close()));
    } catch (e) {
      errors.push(e);
    }
    check(errors.length === 0, "all model control cleanup attempted");
  }
}
