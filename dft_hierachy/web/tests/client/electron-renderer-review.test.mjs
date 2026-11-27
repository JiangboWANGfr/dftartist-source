import assert from "node:assert/strict";
import { test } from "node:test";
import { HierError } from "@hier/client";
import { connectElectronTransport } from "@hier/client/electron/renderer";

// A review regressions through the public Bridge/Transport boundary. These are
// additional implementation controls, not B's frozen matrix or Electron IPC.
const sessionId = "A-renderer-review-session";
const turn = () => new Promise(setImmediate);
const watchdog = { timeout: 15000 }; // Harness guard, not a product SLA.
const claim = { ok: true, version: 1, sessionId };
const diagnostic = (code, origin) => ({
  code,
  origin,
  message: "A preserved close diagnostic",
  data: { reason: "A_original", nested: { lines: ["unchanged"] } },
});
const closed = (error) => ({ version: 1, sessionId, kind: "closed", error });

function input(hooks = {}) {
  const calls = [];
  let receive;
  return {
    calls,
    emit(event) {
      assert.equal(typeof receive, "function");
      receive(event);
    },
    bridge: {
      version: 1,
      connect(callback) {
        calls.push(["connect"]);
        receive = callback;
        return hooks.connect ? hooks.connect(callback) : Promise.resolve(claim);
      },
      start(id) {
        calls.push(["start", id]);
      },
      send(id, json) {
        calls.push(["send", id, json]);
        hooks.send?.();
      },
      close(id) {
        calls.push(["close", id]);
      },
      release(id) {
        calls.push(["release", id]);
      },
    },
  };
}
function isClosed(error) {
  assert.ok(error instanceof HierError);
  assert.equal(error.code, "transport_closed");
  assert.equal(error.origin, "transport");
  return true;
}

test(
  "A C82 control: this id's early faults reject and unidentified envelopes keep first-cause order",
  watchdog,
  async (t) => {
    const unidentified = { version: 1, kind: "frame", json: "{}" };
    const scenarios = [
      ...[
        { version: 1, sessionId, kind: "frame", json: "{}" },
        { version: 7, sessionId, kind: "closed" },
      ].map((first) => ({
        events: [
          first,
          closed(undefined),
          closed(diagnostic("transport_closed", "transport")),
        ],
        fault: true,
      })),
      // A controls of the clarified observed-order choice, not B frozen input.
      { events: [closed(undefined), unidentified], fault: false },
      { events: [unidentified, closed(undefined)], fault: true },
    ];
    for (const { events, fault } of scenarios) {
      const b = input({
        connect(receive) {
          for (const event of events) receive(event);
          return Promise.resolve(claim);
        },
      });
      const transport = await connectElectronTransport(b.bridge);
      t.after(() => transport.close());
      const causes = [];
      let frames = 0;
      transport.onClose((cause) => causes.push(cause));
      transport.onMessage(() => frames++);
      await turn();
      assert.equal(frames, 0);
      assert.equal(causes.length, 1);
      if (fault) {
        isClosed(causes[0]);
        assert.equal(causes[0].data.reason, "invalid_ipc_frame");
      } else assert.equal(causes[0], undefined);
      assert.deepEqual(b.calls, [
        ["connect"],
        ...(fault ? [["close", sessionId]] : []),
        ["release", sessionId],
      ]);
      assert.throws(() => transport.send({}), isClosed);
    }
  },
);

test(
  "A C82 control: failed or corrupt connect never adopts an event id for cleanup",
  watchdog,
  async () => {
    const refused = diagnostic("not_ready", "client");
    for (const [result, code] of [
      [{ ok: false, error: refused, sessionId: "unconfirmed-id" }, "not_ready"],
      [{ ok: true, version: 7, sessionId: "unconfirmed-id" }, "protocol_error"],
    ]) {
      const b = input({
        connect(receive) {
          receive({
            version: 1,
            sessionId: "unconfirmed-id",
            kind: "frame",
            json: "{}",
          });
          return Promise.resolve(result);
        },
      });
      await assert.rejects(connectElectronTransport(b.bridge), (error) => {
        assert.ok(error instanceof HierError);
        assert.equal(error.code, code);
        assert.equal(error.origin, "client");
        if (code === "not_ready") {
          assert.equal(error.message, refused.message);
          assert.deepEqual(error.data, refused.data);
        }
        return true;
      });
      b.emit(closed(diagnostic("transport_closed", "transport")));
      await turn();
      assert.deepEqual(b.calls, [["connect"]]);
    }
  },
);

for (const [code, origin] of [
  ["not_ready", "client"],
  ["not_found", "core"],
  ["transport_closed", "core"],
])
  test(
    `A C83: reentrant ${code}/${origin} close during send retains diagnostics but sends throw transport_closed`,
    watchdog,
    async (t) => {
      const dto = diagnostic(code, origin);
      const expectedData = structuredClone(dto.data);
      let diagnosticReads = 0;
      const thrown = Object.defineProperty({}, "message", {
        get() {
          diagnosticReads++;
          throw new Error("Do not inspect arbitrary bridge failures");
        },
      });
      const b = input({
        send() {
          b.emit(closed(dto));
          throw thrown;
        },
      });
      const transport = await connectElectronTransport(b.bridge);
      t.after(() => transport.close());
      const causes = [];
      transport.onClose((cause) => causes.push(cause));
      transport.onMessage(() => {});
      await turn();
      let sendError;
      try {
        transport.send({ id: 1, method: "inst.roots", params: {} });
      } catch (error) {
        sendError = error;
      }
      dto.data.nested.lines[0] = "caller changed the DTO";
      await turn();
      assert.equal(diagnosticReads, 0);
      assert.equal(causes.length, 1);
      assert.ok(causes[0] instanceof HierError);
      assert.equal(causes[0].code, code);
      assert.equal(causes[0].origin, origin);
      assert.equal(causes[0].message, dto.message);
      assert.deepEqual(causes[0].data, expectedData);
      assert.ok(Object.isFrozen(causes[0].data.nested.lines));
      isClosed(sendError);
      assert.equal(sendError.message, dto.message);
      assert.deepEqual(sendError.data, expectedData);
      assert.throws(
        () => transport.send({}),
        (error) => {
          isClosed(error);
          assert.equal(error.message, dto.message);
          assert.deepEqual(error.data, expectedData);
          return true;
        },
      );
      assert.deepEqual(
        b.calls.map(([method]) => method),
        ["connect", "start", "send", "release"],
      );
    },
  );

test(
  "A C83 control: an existing transport_closed/transport retains identity through reentrant and subsequent send failures",
  watchdog,
  async (t) => {
    const dto = diagnostic("transport_closed", "transport");
    const b = input({
      send() {
        b.emit(closed(dto));
        throw new Error("later bridge failure");
      },
    });
    const transport = await connectElectronTransport(b.bridge);
    t.after(() => transport.close());
    const causes = [];
    transport.onClose((cause) => causes.push(cause));
    transport.onMessage(() => {});
    await turn();
    let sendError;
    assert.throws(
      () => transport.send({}),
      (error) => {
        sendError = error;
        return isClosed(error);
      },
    );
    await turn();
    assert.equal(causes.length, 1);
    assert.equal(sendError, causes[0]);
    assert.notEqual(sendError, dto);
    assert.throws(
      () => transport.send({}),
      (error) => error === sendError,
    );
    assert.equal(sendError.message, dto.message);
    assert.deepEqual(sendError.data, dto.data);
    assert.deepEqual(
      b.calls.map(([method]) => method),
      ["connect", "start", "send", "release"],
    );
  },
);
