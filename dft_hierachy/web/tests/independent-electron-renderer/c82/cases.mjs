// Oracle: DESIGN 6.8.3 other-id isolation + 5.6.5/6.8.4 first-cause retention.
// The metamorphic relation does NOT select BER-Q01's factory settlement form.
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
  instance,
} from "../fixture.mjs";
const foreignEvents = [
  ["frame", () => frame(reply(71, { b_foreign: true }), OTHER)],
  ["wrong-version", () => ({ ...frame(reply(72, {}), OTHER), version: 7 })],
  [
    "unknown-kind",
    () => ({ version: 1, sessionId: OTHER, kind: "b_future_kind" }),
  ],
  ["wrong-json-type", () => ({ ...frame("", OTHER), json: 123 })],
  ["closed", () => closed(failure("renderer_gone"), OTHER)],
];
function installEarly(b, events) {
  const connect = b.bridge.connect;
  b.bridge.connect = (callback) => {
    const pending = connect(callback);
    // Public callback delivery before the connect Promise resolves. No fake Transport.
    for (const event of events) callback(event);
    return pending;
  };
}
const describe = (error) =>
  error === undefined
    ? { normal: true }
    : {
        code: error.code,
        origin: error.origin,
        message: error.message,
        data: error.data,
      };
const ownedCalls = (b) => b.calls.map((call) => ({ ...call }));
function exactCause(c, actual, cause) {
  if (cause === undefined)
    assert.equal(actual, undefined, "normal first close must remain undefined");
  else {
    c.errorIs(cause.code, cause.origin, cause.data.reason)(actual);
    assert.equal(actual.message, cause.message);
    assert.deepEqual(actual.data, cause.data);
  }
}
async function closedOutcome(c, cause, foreign, order) {
  const b = c.bridge(),
    current = closed(cause),
    events = foreign
      ? order === "before"
        ? [foreign, current]
        : [current, foreign]
      : [current];
  installEarly(b, events);
  let t, client, off, claim;
  try {
    try {
      ({ transport: t } = await c.open(b));
      claim = "returned-closed";
    } catch (error) {
      c.errorIs("transport_closed", "transport")(error);
      if (cause !== undefined) exactCause(c, error, cause);
      await checkpoint();
      return {
        claim: "rejected",
        cause: describe(error),
        calls: ownedCalls(b),
      };
    }
    const seen = [];
    off = t.onClose((error) => seen.push(error));
    assert.deepEqual(seen, [], "late onClose is asynchronous");
    client = new c.sdk.HierClient(t);
    client.ready.catch(() => {});
    let readyError;
    await assert.rejects(client.ready, (error) => {
      c.errorIs("transport_closed", "transport")(error);
      readyError = error;
      return true;
    });
    await checkpoint();
    assert.equal(seen.length, 1);
    exactCause(c, seen[0], cause);
    if (cause !== undefined) exactCause(c, readyError, cause);
    assert.throws(
      () => t.send({ id: 1 }),
      c.errorIs("transport_closed", "transport"),
    );
    return {
      claim,
      cause: describe(seen[0]),
      ready: describe(readyError),
      calls: ownedCalls(b),
    };
  } finally {
    try {
      off?.();
    } finally {
      try {
        client?.dispose();
      } finally {
        t?.close();
      }
    }
  }
}
export const cases = [];
for (const [label, event] of foreignEvents) {
  cases.push({
    id: "ER82-OPEN-" + label,
    input: {
      claimId: SESSION,
      foreignId: OTHER,
      foreign: label,
      phase: "callback before connect result",
      currentClose: false,
    },
    expected:
      "foreign event has no effect: zero close/release, real SDK ready+roots succeeds using current session",
    basis:
      "DESIGN 6.8.3 other ids ignored at connect scope; 6.8.1 Core snapshot unchanged",
    async run(c) {
      const b = c.bridge();
      installEarly(b, [event()]);
      b.onStart = () => b.emit(frame(hello));
      const { transport: t } = await c.open(b);
      let client;
      try {
        assert.equal(
          b.count("close"),
          0,
          "foreign event must not close current claim",
        );
        assert.equal(
          b.count("release"),
          0,
          "foreign event must not release current claim",
        );
        client = new c.sdk.HierClient(t);
        client.ready.catch(() => {});
        assert.deepEqual(await client.ready, snapshot);
        const pending = client.roots();
        pending.catch(() => {});
        await checkpoint();
        assert.equal(b.sent.length, 1);
        const request = JSON.parse(b.sent[0].json);
        assert.equal(b.sent[0].sessionId, SESSION);
        assert.equal(request.snapshot, snapshot.snapshotId);
        b.emit(frame(reply(request.id, [instance])));
        assert.deepEqual((await pending).result, [instance]);
      } finally {
        try {
          client?.dispose();
        } finally {
          t.close();
        }
      }
    },
  });
  for (const causeName of ["normal", "diagnostic"])
    for (const order of ["before", "after"])
      cases.push({
        id: `ER82-CLOSED-${causeName}-${order}-${label}`,
        input: {
          claimId: SESSION,
          foreignId: OTHER,
          foreign: label,
          currentClose: causeName,
          foreignRelativeToCurrentClose: order,
          phase: "all callbacks before connect result",
        },
        expected:
          "inserting foreign event cannot change legal first close, factory outcome, ready failure or own IPC calls; both factory forms allowed by BER-Q01",
        basis:
          "DESIGN 6.8.3 other ids ignored / early first close saved; 5.6.5/6.8.4 first cause incl normal undefined",
        async run(c) {
          const cause =
            causeName === "normal" ? undefined : failure("document_navigated");
          const control = await closedOutcome(c, cause);
          const interleaved = await closedOutcome(c, cause, event(), order);
          assert.deepEqual(
            interleaved,
            control,
            "foreign-id insertion must be observationally irrelevant",
          );
        },
      });
}
