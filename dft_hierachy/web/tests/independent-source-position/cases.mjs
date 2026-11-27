import assert from "node:assert/strict";
import {
  H,
  document,
  query,
  rejected,
  snapshot,
  unchanged,
} from "./harness.mjs";
import { texts, impostors, invalidOffsets, poison } from "./fixtures.mjs";
export const cases = [];
export function add(id, group, input, expected, run, basis = "DESIGN §6.12") {
  cases.push({ id: "SP-" + id, group, input, expected, basis, run });
}
for (const fixture of texts) {
  for (const [offset, line, col] of fixture.valid)
    add(
      "point-" + fixture.id + "-" + offset,
      "coordinates",
      { fixture: fixture.id, offset, line, col },
      "exact explicit byte point; own frozen four-field value; zero side effects, includes span-outside/EOF",
      () =>
        H.using(async (c) => {
          const doc = await document(c, fixture.text);
          query(c, doc, offset, line, col);
        }),
      "§6.12.3; B hand position table, not implementation output",
    );
  for (const offset of fixture.invalid)
    add(
      "internal-" + fixture.id + "-" + offset,
      "coordinates",
      { fixture: fixture.id, offset },
      "synchronous invalid_argument at surrogate/CRLF interior; no snapping or mutation",
      () =>
        H.using(async (c) => {
          const doc = await document(c, fixture.text);
          rejected(c, doc, offset, "invalid_argument");
        }),
    );
}
add(
  "negative-zero",
  "coordinates",
  { offset: "-0" },
  "negative zero accepted exactly as zero",
  () =>
    H.using(async (c) => {
      const d = await document(c, "A");
      query(c, d, -0, 1, 1);
    }),
);
for (const [name, make] of invalidOffsets)
  for (const changed of [false, true])
    add(
      "offset-" + name + "-" + changed,
      "error-priority",
      { offsetShape: name, changed },
      "exact rejects invalid_argument, changed wins with changed_document; no value/coercion probes",
      () =>
        H.using(async (c) => {
          const d = await document(c, "A", changed),
            n = { probes: 0 };
          rejected(
            c,
            d,
            make(n),
            changed ? "changed_document" : "invalid_argument",
          );
          assert.equal(n.probes, 0);
        }),
    );
for (const fixture of [texts[0], texts[1]])
  add(
    "beyond-" + fixture.id,
    "coordinates",
    { fixture: fixture.id, offset: fixture.text.length + 1 },
    "range beyond actual text rejects invalid_argument, not clamp",
    () =>
      H.using(async (c) => {
        const d = await document(c, fixture.text);
        rejected(c, d, fixture.text.length + 1, "invalid_argument");
      }),
  );
export async function setup(c, stage) {
  const d = await document(c, "A", stage === "changed");
  if (stage === "idle") await H.success(H.invoke(c, "clear"));
  else if (!["success", "changed"].includes(stage)) {
    const o = H.invoke(c, "reload"),
      q = await c.wire.next("obj.source"),
      t = { o, q };
    if (stage === "pending-read")
      await H.second(c, t, H.span(H.point(0), H.point(0)));
    else if (stage === "failed") {
      c.wire.fail(q);
      await H.failure(o, "not_found");
    } else if (stage === "cancelled") {
      await H.success(H.invoke(c, "cancel"));
      await H.failure(o, "cancelled");
    }
  }
  return d;
}
for (const stage of [
  "idle",
  "pending-source",
  "pending-read",
  "failed",
  "cancelled",
  "success",
  "changed",
])
  for (const [name, make] of impostors)
    add(
      "foreign-" + stage + "-" + name,
      "identity",
      { stage, documentShape: name, offset: "malicious" },
      "stale_document wins position/changed; caller document fields/prototype/descriptors/traps never touched",
      () =>
        H.using(async (c) => {
          const d = await setup(c, stage),
            n = { probes: 0 },
            off = { probes: 0 },
            bad = make(d, n);
          rejected(c, bad, poison(off), "stale_document");
          assert.equal(n.probes, 0);
          assert.equal(off.probes, 0);
        }),
    );
for (const [name, make] of impostors)
  add(
    "disposed-" + name,
    "error-priority",
    { documentShape: name, offset: "malicious" },
    "disposed wins identity/state/offset and no caller probes",
    () =>
      H.using(async (c) => {
        const d = await document(c),
          n = { probes: 0 },
          off = { probes: 0 },
          bad = make(d, n);
        c.m.dispose();
        rejected(c, bad, poison(off), "disposed");
        assert.equal(n.probes, 0);
        assert.equal(off.probes, 0);
      }),
  );
for (const stage of [
  "idle",
  "pending-source",
  "pending-read",
  "failed",
  "cancelled",
])
  add(
    "former-current-" + stage,
    "identity",
    { stage },
    "held genuine previous data is stale in every non-success state; cannot revive or affect pending task",
    () =>
      H.using(async (c) => {
        const d = await setup(c, stage);
        rejected(c, d, 0, "stale_document");
      }),
  );
add(
  "no-op-keeps-current",
  "identity",
  { repeat: "same target load" },
  "success no-op retains data identity and queryAt validity without new SDK/notification",
  () =>
    H.using(async (c) => {
      const d = await document(c),
        before = snapshot(c);
      await H.success(H.invoke(c, "load", "B-position-object", "definition"));
      unchanged(c, before);
      assert.equal(c.m.state.data, d);
      query(c, d, 0, 1, 1);
    }),
);
add(
  "reload-same-replies-new-wrapper",
  "identity",
  { replies: "exact same SDK objects" },
  "pending invalidates old data; identical Replies/text/hash do not restore old wrapper; new wrapper current",
  () =>
    H.using(async (c) => {
      const d = await document(c),
        source = c.calls.find((x) => x.method === "source").reply,
        read = c.calls.find((x) => x.method === "readSource").reply;
      // Public SDK instrumentation supplies existing real frozen Replies; no model/private replacement.
      const oldSource = c.client.source,
        oldRead = c.client.readSource;
      c.client.source = () => Promise.resolve(source);
      c.client.readSource = () => Promise.resolve(read);
      const o = H.invoke(c, "reload");
      rejected(c, d, 0, "stale_document");
      await H.success(o);
      const next = c.m.state.data;
      assert.notEqual(next, d);
      assert.equal(next.source, source);
      assert.equal(next.content, read);
      rejected(c, d, 0, "stale_document");
      query(c, next, 0, 1, 1);
      c.client.source = oldSource;
      c.client.readSource = oldRead;
    }),
);
for (const mode of ["other-model", "other-snapshot", "other-same-ref-text"])
  add(
    "cross-owner-" + mode,
    "identity",
    { mode },
    "another owner data never valid even equal snapshot/file/text or shared Replies; each own document works",
    () =>
      H.using(async (c) => {
        const first = await document(c);
        const id =
          mode === "other-snapshot"
            ? "B-position-other-snapshot"
            : c.m.snapshotId;
        if (mode === "other-model") {
          const m = c.newModel(),
            o = m.load("B-position-object", "definition");
          o.catch(() => {});
          const q = await c.wire.next("obj.source");
          c.wire.ok(q, H.span(H.point(0), H.point(0)));
          const r = await c.wire.next("source.read");
          c.wire.ok(r, H.read("A"));
          await o;
          rejected(c, m.state.data, 0, "stale_document");
          assert.notEqual(m.state.data, first);
          m.dispose();
          query(c, first, 0, 1, 1);
        } else
          await H.using(
            async (other) => {
              const second = await document(other);
              rejected(c, second, 0, "stale_document");
              rejected(other, first, 0, "stale_document");
              query(c, first, 0, 1, 1);
              query(other, second, 0, 1, 1);
            },
            { id },
          );
      }),
  );
add(
  "changed-does-not-use-span",
  "error-priority",
  { text: "different", span: "past current EOF", offset: 0 },
  "changed_document never searches/clamps old span into new text",
  () =>
    H.using(async (c) => {
      const t = await H.second(
        c,
        await H.begin(c),
        H.span(H.point(1000), H.point(2000)),
      );
      await H.finish(c, t, H.read("A", H.hashB, false));
      rejected(c, c.m.state.data, 0, "changed_document");
    }),
);
add(
  "query-value-not-revoked",
  "lifetime",
  { action: "clear after mapping" },
  "returned query remains frozen value; former document becomes stale; no automatic candidate/task creation",
  () =>
    H.using(async (c) => {
      const d = await document(c, "A"),
        value = query(c, d, 1, 1, 2),
        saved = Reflect.ownKeys(value).map((key) => [key, value[key]]);
      await H.success(H.invoke(c, "clear"));
      assert.deepEqual(
        Reflect.ownKeys(value).map((key) => [key, value[key]]),
        saved,
      );
      assert.equal(Object.isFrozen(value), true);
      rejected(c, d, 1, "stale_document");
    }),
);
