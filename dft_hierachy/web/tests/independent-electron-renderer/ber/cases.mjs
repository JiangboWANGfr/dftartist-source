// Independent oracle: fixed DESIGN 6.8.3/4 after C-approved BER clarifications.
import assert from "node:assert/strict";
import {
  SESSION,
  OTHER,
  checkpoint,
  frame,
  closed,
  failure,
  hello,
  snapshot,
  reply,
} from "../fixture.mjs";
import { cases as original } from "../cases.mjs";
export const cases = [];
const add = (id, input, expected, basis, run) =>
  cases.push({ id, input, expected, basis, run });
const request = () => ({
  id: 1,
  method: "inst.roots",
  snapshot: snapshot.snapshotId,
  params: {},
});
const coreCause = {
  code: "not_found",
  origin: "core",
  message: "B saved core diagnostic",
  data: { b_keep: [1, "界"] },
};
export function exactCause(c, actual, dto) {
  if (dto === undefined)
    assert.equal(actual, undefined, "normal undefined remains the first cause");
  else {
    c.errorIs(dto.code, dto.origin)(actual);
    assert.equal(actual.message, dto.message);
    assert.deepEqual(actual.data, dto.data);
  }
}
export function early(b, events) {
  const connect = b.bridge.connect;
  b.bridge.connect = (callback) => {
    const result = connect(callback);
    for (const event of events) callback(event);
    return result;
  };
}
export function detachBrokenFixture(c, b) {
  // B's deliberately broken release may not detach its own callback. This is fixture teardown,
  // never a product-release assertion, remote-resource claim or production counter increment.
  const active = b.records.filter((r) => r.active);
  if (active.length)
    c.fixtureFaultDetach.push({
      callbacks: active.length,
      reason: "B broken-Bridge fixture teardown only",
    });
  for (const row of active) row.active = false;
}
for (const [label, cause] of [
  ["normal", undefined],
  ["transport", failure("document_navigated")],
  [
    "client",
    {
      code: "not_ready",
      origin: "client",
      message: "B first client diagnostic",
      data: { b_first: true },
    },
  ],
])
  for (const repeat of [false, true])
    add(
      `BER01-EARLY-${label}-${repeat ? "repeated" : "single"}`,
      { first: cause ?? "normal undefined", repeat },
      "factory fulfills with closed Transport; late onClose first cause; real SDK ready rejects transport_closed, never hello ready",
      "6.8.3 BER-Q01",
      async (c) => {
        const b = c.bridge(),
          events = [closed(cause)];
        if (repeat)
          events.push(
            closed(failure("renderer_gone")),
            closed(undefined, OTHER),
          );
        early(b, events);
        const { transport: t } = await c.open(b),
          seen = [];
        t.onClose((error) => seen.push(error));
        assert.deepEqual(seen, []);
        let client;
        try {
          client = new c.sdk.HierClient(t);
          client.ready.catch(() => {});
          await assert.rejects(
            client.ready,
            c.errorIs("transport_closed", "transport"),
          );
          await checkpoint();
          assert.equal(seen.length, 1);
          exactCause(c, seen[0], cause);
          assert.throws(
            () => t.send(request()),
            c.errorIs("transport_closed", "transport"),
          );
          assert.equal(b.sent.length, 0);
        } finally {
          client?.dispose();
        }
      },
    );
for (const source of original.filter((row) =>
  row.id.startsWith("ER-RAW-INVALID-"),
))
  add(
    "BER02-" + source.id,
    { json: source.input.json },
    "transport_closed/transport reason=invalid_frame and zero delivery (exact reason now specified)",
    "6.8.3 BER-Q02",
    async (c) => {
      const { b, transport: t } = await c.open(),
        seen = [],
        causes = [];
      t.onMessage((x) => seen.push(x));
      t.onClose((error) => causes.push(error));
      await checkpoint();
      b.emit(frame(source.input.json));
      await checkpoint();
      assert.deepEqual(seen, []);
      assert.equal(causes.length, 1);
      c.errorIs("transport_closed", "transport", "invalid_frame")(causes[0]);
    },
  );
for (const [label, patch] of [
  ["version", { version: 7 }],
  ["json-type", { json: 123 }],
])
  add(
    "BER02-SHELL-" + label,
    { patch },
    "bad shell remains invalid_ipc_frame, zero delivery",
    "6.8.3/4 BER-Q02",
    async (c) => {
      const { b, transport: t } = await c.open(),
        seen = [],
        causes = [];
      t.onMessage((x) => seen.push(x));
      t.onClose((error) => causes.push(error));
      await checkpoint();
      b.emit({ ...frame(reply(1, {})), ...patch });
      await checkpoint();
      assert.deepEqual(seen, []);
      assert.equal(causes.length, 1);
      c.errorIs(
        "transport_closed",
        "transport",
        "invalid_ipc_frame",
      )(causes[0]);
    },
  );
for (const mode of ["throw", "reject"])
  add(
    "BER03-CONNECT-" + mode,
    { mode, existingClaim: true },
    "ipc_unavailable rejection without guessing/closing/releasing existing claim; first receiver still works",
    "6.8.4 BER-Q03",
    async (c) => {
      const b = c.bridge(),
        { transport: t } = await c.open(b),
        seen = [];
      t.onMessage((x) => seen.push(x.id));
      await checkpoint();
      b.bridge.connect = () => {
        b.calls.push({ method: "connect" });
        const error = new Error("B bridge connect failure");
        if (mode === "throw") throw error;
        return Promise.reject(error);
      };
      await assert.rejects(
        c.factory(b.bridge),
        c.errorIs("transport_closed", "transport", "ipc_unavailable"),
      );
      assert.equal(b.count("close"), 0);
      assert.equal(b.count("release"), 0);
      b.emit(frame(reply(79, {})));
      await checkpoint();
      assert.deepEqual(seen, [79]);
    },
  );
for (const state of ["open-error", "open-string", "normal", "diagnostic"])
  add(
    "BER03-START-" + state,
    { state, bridgeThrows: "start" },
    "fresh failure ipc_unavailable; observed prior normal/diagnostic first cause survives; no delivery or later resurrection",
    "6.8.4 BER-Q03",
    async (c) => {
      const { b, transport: t } = await c.open(),
        seen = [],
        causes = [],
        prior =
          state === "diagnostic" ? failure("document_navigated") : undefined;
      b.onStart = () => {
        if (state === "normal" || state === "diagnostic") b.emit(closed(prior));
        throw state === "open-string"
          ? "B non-Error throw"
          : new Error("B start fault");
      };
      t.onClose((error) => causes.push(error));
      t.onMessage((x) => seen.push(x));
      await checkpoint();
      assert.equal(causes.length, 1);
      if (state.startsWith("open"))
        c.errorIs(
          "transport_closed",
          "transport",
          "ipc_unavailable",
        )(causes[0]);
      else exactCause(c, causes[0], prior);
      assert.throws(
        () => t.send(request()),
        c.errorIs("transport_closed", "transport"),
      );
      b.emitLate(frame(reply(1, {})));
      await checkpoint();
      assert.deepEqual(seen, []);
    },
  );
for (const state of ["open", "normal", "diagnostic"])
  add(
    "BER03-SEND-" + state,
    { state, bridgeThrows: "send" },
    "send reports transport_closed/transport; fresh fault ipc_unavailable, prior first cause remains original",
    "6.8.3/4 BER-Q03",
    async (c) => {
      const b = c.bridge(),
        send = b.bridge.send,
        prior = state === "diagnostic" ? coreCause : undefined;
      b.bridge.send = (id, json) => {
        send(id, json);
        if (state !== "open") b.emit(closed(prior));
        throw new Error("B send fault");
      };
      const { transport: t } = await c.open(b),
        causes = [];
      t.onClose((error) => causes.push(error));
      t.onMessage(() => {});
      await checkpoint();
      assert.throws(
        () => t.send(request()),
        c.errorIs("transport_closed", "transport"),
      );
      await checkpoint();
      assert.equal(causes.length, 1);
      if (state === "open")
        c.errorIs(
          "transport_closed",
          "transport",
          "ipc_unavailable",
        )(causes[0]);
      else exactCause(c, causes[0], prior);
    },
  );
for (const state of ["normal", "core"])
  add(
    "BER03-SNAPSHOT-REENTRANT-" + state,
    { state, action: "owning JSON getter closes then throws" },
    "closed-send classification wins over later snapshot exception, zero bridge send and first onClose preserved",
    "6.8.3 closed priority / 5.6.2 owning snapshot",
    async (c) => {
      const { b, transport: t } = await c.open(),
        causes = [],
        prior = state === "core" ? coreCause : undefined;
      t.onMessage(() => {});
      await checkpoint();
      t.onClose((error) => causes.push(error));
      const input = request();
      Object.defineProperty(input.params, "b_getter", {
        enumerable: true,
        get() {
          b.emit(closed(prior));
          throw new Error("B snapshot getter fault");
        },
      });
      assert.throws(
        () => t.send(input),
        c.errorIs("transport_closed", "transport"),
      );
      await checkpoint();
      assert.equal(b.sent.length, 0);
      assert.equal(causes.length, 1);
      exactCause(c, causes[0], prior);
    },
  );
for (const first of ["normal", "ipc-unavailable"])
  for (const fault of ["close", "release", "both"])
    for (const timing of ["before", "after"])
      add(
        `BER03-CLEANUP-${first}-${fault}-${timing}`,
        { first, fault, timing },
        "attempt needed close then release exactly once; preserve first cause/local closed state; broken fixture detach is NOT product release",
        "6.8.4 BER-Q03 limited defense",
        async (c) => {
          const b = c.bridge(),
            attempts = [];
          for (const method of ["close", "release"]) {
            const original = b.bridge[method];
            b.bridge[method] = (id) => {
              attempts.push({ method, id });
              const broken = fault === method || fault === "both";
              if (broken && timing === "before") {
                b.calls.push({ method, sessionId: id });
                throw new Error("B " + method + " before fixture effect");
              }
              original(id);
              if (broken)
                throw new Error("B " + method + " after fixture effect");
            };
          }
          if (first === "ipc-unavailable")
            b.onStart = () => {
              throw new Error("B start initiates transport failure");
            };
          let t;
          try {
            ({ transport: t } = await c.open(b));
            const causes = [];
            t.onClose((error) => causes.push(error));
            if (first === "normal") {
              try {
                t.close();
              } catch (error) {
                c.surfaceThrows.push(String(error));
              }
            } else t.onMessage(() => {});
            await checkpoint();
            assert.equal(causes.length, 1);
            if (first === "normal") exactCause(c, causes[0], undefined);
            else
              c.errorIs(
                "transport_closed",
                "transport",
                "ipc_unavailable",
              )(causes[0]);
            assert.deepEqual(attempts, [
              { method: "close", id: SESSION },
              { method: "release", id: SESSION },
            ]);
            assert.throws(
              () => t.send(request()),
              c.errorIs("transport_closed", "transport"),
            );
            b.emitLate(closed(failure("document_navigated")));
            await checkpoint();
            assert.equal(causes.length, 1);
          } finally {
            detachBrokenFixture(c, b);
          }
        },
      );
for (const id of ["", "b:opaque", "会话🙂", "id / ? #"])
  add(
    "BER03-OPAQUE-ID-" + JSON.stringify(id),
    { id },
    "opaque string accepted incl empty; real SDK hello/roots and cleanup use exact id, not UUID/trim/nonempty restrictions",
    "6.8.3 BER-Q03",
    async (c) => {
      const b = c.bridge();
      b.outcomes.push({ ok: true, version: 1, sessionId: id });
      b.onStart = (actual) => {
        assert.equal(actual, id);
        b.emit(frame(hello, id));
      };
      const { transport: t } = await c.open(b);
      let client;
      try {
        client = new c.sdk.HierClient(t);
        client.ready.catch(() => {});
        assert.deepEqual(await client.ready, snapshot);
        const pending = client.roots();
        pending.catch(() => {});
        await checkpoint();
        assert.equal(b.sent.length, 1);
        assert.equal(b.sent[0].sessionId, id);
        const sent = JSON.parse(b.sent[0].json);
        b.emit(frame(reply(sent.id, []), id));
        assert.deepEqual((await pending).result, []);
      } finally {
        client?.dispose();
      }
    },
  );
