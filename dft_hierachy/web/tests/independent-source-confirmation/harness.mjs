// Independent B: real public models/client. No fallback confirmation model.
import assert from "node:assert/strict";
import * as N from "../independent-source-navigation/harness.mjs";
export { N };
export const vm = () => N.H.vm;
export const codes = Object.freeze([
  "disposed",
  "reentrant_change",
  "not_ready",
  "invalid_page",
  "invalid_index",
  "invalid_action",
  "stale_action",
  "address_unavailable",
  "invalid_selection_model",
]);
export async function boot(required = true) {
  await N.boot();
  if (required) {
    const c = await N.context();
    try {
      for (const name of ["createCandidateAction", "confirmCandidate"])
        assert.equal(
          typeof c.m[name],
          "function",
          "missing production SourceNavigationModel." + name,
        );
    } finally {
      await c.close();
    }
    assert.equal(
      typeof vm().SourceConfirmationError,
      "function",
      "missing public SourceConfirmationError",
    );
  }
}
export const hit = (refKind = "object", n = 0, extra = {}) => ({
  ...N.hit(n),
  ref: "B/opaque:α/" + n,
  kind: "definition",
  ...(refKind === undefined ? {} : { refKind }),
  ...extra,
});
export function selection(
  c,
  options = { snapshotId: c.m.snapshotId },
  Class = vm().SelectionModel,
) {
  const s = new Class(options);
  c.models.push(s);
  return s;
}
export async function using(fn) {
  return N.using(async (c) => {
    c.s = selection(c);
    return fn(c);
  });
}
export async function ready(
  c,
  { items = [hit()], next, completeness = N.complete } = {},
) {
  const d = await N.document(c);
  await N.candidateFinish(c, await N.candidateStart(c, d), {
    items,
    next,
    completeness,
  });
  return { d, page: c.m.state.candidates.state.pages[0] };
}
export const issue = (
  c,
  page = c.m.state.candidates.state.pages[0],
  ...indices
) => c.m.createCandidateAction(page, indices.length ? indices[0] : 0);
export const expected = (c, h) => ({
  items: [h.refKind === "definition" ? { def: h.ref } : { ref: h.ref }],
  origin: "source",
  snapshotId: c.m.snapshotId,
});
export function local(fn, code) {
  let e;
  assert.throws(fn, (x) => {
    e = x;
    return true;
  });
  assert.ok(e instanceof vm().SourceConfirmationError);
  assert.equal(e.code, code);
  assert.ok(typeof e.message === "string" && e.message.length > 0);
  return e;
}
export function selectedError(fn, code) {
  let e;
  assert.throws(fn, (x) => {
    e = x;
    return true;
  });
  assert.ok(e instanceof vm().SelectionError);
  assert.equal(e.code, code);
  return e;
}
export function noWrites(c, fn) {
  const old = N.snapshot(c),
    v = c.s.current,
    b = c.s.canGoBack,
    f = c.s.canGoForward;
  const out = fn();
  N.unchanged(c, old);
  assert.equal(c.s.current, v);
  assert.equal(c.s.canGoBack, b);
  assert.equal(c.s.canGoForward, f);
  return out;
}
export function confirm(c, a, target = c.s) {
  const old = N.snapshot(c);
  let notifications = 0;
  const off = target.subscribe(() => notifications++);
  try {
    assert.equal(c.m.confirmCandidate(a, target), undefined);
  } finally {
    off();
  }
  N.unchanged(c, old);
  return notifications;
}
export function poison() {
  const counts = { probes: 0 };
  const boom = () => {
    counts.probes++;
    throw Error("B prohibited probe");
  };
  return {
    counts,
    value: new Proxy(Object.create(null), {
      get: boom,
      getPrototypeOf: boom,
      ownKeys: boom,
      getOwnPropertyDescriptor: boom,
      has: boom,
    }),
  };
}
// Explicit PUBLIC SDK return adapter. This is NOT SDK cache behavior and never
// accesses a model's private state. C review required for the adapter's scope.
export async function republish(c, page, fn) {
  const own = Object.getOwnPropertyDescriptor(c.client, "resolveSource");
  let calls = 0;
  c.client.resolveSource = () => {
    calls++;
    return Promise.resolve(page);
  };
  try {
    return await fn(() => calls);
  } finally {
    if (own) Object.defineProperty(c.client, "resolveSource", own);
    else delete c.client.resolveSource;
  }
}
