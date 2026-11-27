// Only real public SourceDocumentModel; no fake queryAt or inverse mapper.
import assert from "node:assert/strict";
import * as H from "../independent-source-document/harness.mjs";
import * as C from "../independent-source-candidates/harness.mjs";
export { H };
export async function boot(required = true) {
  await H.boot();
  if (required) {
    const c = await H.context();
    try {
      assert.equal(
        typeof c.m.queryAt,
        "function",
        "missing public SourceDocumentModel.queryAt",
      );
      assert.equal(
        typeof H.vm.SourcePositionError,
        "function",
        "missing public SourcePositionError",
      );
    } finally {
      await c.close();
    }
  }
}
export async function bootCore() {
  await C.boot(false);
}
export async function document(
  c,
  text = "A",
  changed = false,
  range = { start: H.point(0), end: H.point(0) },
  ref = "B-position-object",
) {
  const t = await H.second(
    c,
    await H.begin(c, ref),
    H.span(range.start, range.end),
  );
  await H.finish(c, t, H.read(text, changed ? H.hashB : H.hashA, !changed));
  assert.equal(c.m.state.data.content.result.text, text);
  assert.equal(c.m.state.data.location.status, changed ? "changed" : "exact");
  return c.m.state.data;
}
export function snapshot(c) {
  return {
    state: c.m.state,
    sent: c.wire.sent.length,
    calls: c.calls.length,
    events: c.events.length,
    registrations: c.registrations,
    messages: c.wire.messages.size,
    closes: c.wire.closes.size,
  };
}
export function unchanged(c, before) {
  assert.deepEqual(snapshot(c), before);
  assert.equal(c.m.state, before.state);
}
export function query(c, doc, offset, line, col) {
  const before = snapshot(c),
    value = c.m.queryAt(doc, offset);
  unchanged(c, before);
  assert.equal(value instanceof Promise, false);
  assert.deepEqual(
    Object.fromEntries(Reflect.ownKeys(value).map((key) => [key, value[key]])),
    { snapshotId: c.m.snapshotId, file: doc.source.result.file, line, col },
  );
  assert.deepEqual(Reflect.ownKeys(value).sort(), [
    "col",
    "file",
    "line",
    "snapshotId",
  ]);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(Object.hasOwn(d, "value"));
    assert.equal(d.writable, false);
    assert.equal(d.configurable, false);
  }
  return value;
}
export function rejected(c, doc, offset, code) {
  const before = snapshot(c);
  let error;
  try {
    c.m.queryAt(doc, offset);
  } catch (e) {
    error = e;
  }
  assert.ok(
    error instanceof H.vm.SourcePositionError,
    "synchronous SourcePositionError, not rejected Promise",
  );
  assert.equal(error.name, "SourcePositionError");
  assert.equal(error.code, code);
  assert.equal(typeof error.message, "string");
  assert.equal(Object.hasOwn(error, "cause"), false);
  unchanged(c, before);
  return error;
}
