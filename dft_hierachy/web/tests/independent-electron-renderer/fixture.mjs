// Public Bridge input controller only. Never a Transport or Electron/preload substitute.
import assert from "node:assert/strict";
export const SESSION = "b0000000-0000-4000-8000-000000000001";
export const OTHER = "b0000000-0000-4000-8000-000000000002";
export const complete = { status: "complete", reasons: [] };
export const instance = {
  ref: "i:0",
  name: "B_renderer",
  path: ["B_renderer"],
  pathText: "B_renderer",
  kind: "module",
  def: "d:0",
  defName: "B_renderer",
  childCount: 1,
  hasParamOverrides: false,
};
export const snapshot = {
  protocol: 2,
  schemaVersion: 7,
  snapshotId: "B-electron-renderer-snapshot",
  inputHash: "0123456789abcdef".repeat(4),
  inputHashComplete: true,
  frontend: { name: "slang", version: "B-independent-fixture" },
  bodySharing: "fast",
  tops: [instance],
  definitionCount: 1,
  bodyCount: 1,
  indexState: "building",
  openedAt: "2000-02-29T23:59:59.123Z",
  topCandidates: [instance.ref],
};
export const hello = JSON.stringify({
  event: "hello",
  protocol: 2,
  snapshot,
  capabilities: ["cancel", "progress"],
});
export const checkpoint = () => new Promise((resolve) => setImmediate(resolve));
export const reply = (id, result) =>
  JSON.stringify({ id, ok: true, result, completeness: complete });
export function frame(json, sessionId = SESSION) {
  return { version: 1, sessionId, kind: "frame", json };
}
export function closed(error, sessionId = SESSION) {
  return {
    version: 1,
    sessionId,
    kind: "closed",
    ...(error === undefined ? {} : { error }),
  };
}
export function failure(reason = "renderer_gone") {
  return {
    code: "transport_closed",
    origin: "transport",
    message: "B independent close",
    data: { reason, stderr: "B stderr", code: 17, signal: null },
  };
}
export function byteFrame(target, unit = "a") {
  const empty = reply(1, { text: "" }),
    remaining = target - Buffer.byteLength(empty);
  assert.ok(remaining >= 0);
  const n = Math.floor(remaining / Buffer.byteLength(unit));
  const text =
    unit.repeat(n) + "a".repeat(remaining - n * Buffer.byteLength(unit));
  const json = reply(1, { text });
  assert.equal(Buffer.byteLength(json), target);
  return json;
}
export class BridgeInput {
  calls = [];
  records = [];
  outcomes = [];
  onStart;
  constructor() {
    this.bridge = {
      version: 1,
      connect: (callback) => {
        this.calls.push({ method: "connect" });
        const record = { callback, active: false, sessionId: null };
        this.records.push(record);
        const result = this.outcomes.length
          ? this.outcomes.shift()
          : { ok: true, version: 1, sessionId: SESSION };
        return Promise.resolve(result).then((value) => {
          if (
            value?.ok === true &&
            value.version === 1 &&
            typeof value.sessionId === "string"
          ) {
            record.sessionId = value.sessionId;
            record.active = true;
          }
          return value;
        });
      },
      start: (sessionId) => {
        this.calls.push({ method: "start", sessionId });
        this.onStart?.(sessionId);
      },
      send: (sessionId, json) => {
        this.calls.push({ method: "send", sessionId, json });
      },
      close: (sessionId) => {
        this.calls.push({ method: "close", sessionId });
      },
      release: (sessionId) => {
        this.calls.push({ method: "release", sessionId });
        for (const record of this.records)
          if (record.sessionId === sessionId) record.active = false;
      },
    };
  }
  emit(event, index = 0) {
    const record = this.records[index];
    assert.ok(record?.active, "live test Bridge registration required");
    record.callback(event);
  }
  emitLate(event, index = 0) {
    this.records[index].callback(event);
  }
  count(method) {
    return this.calls.filter((call) => call.method === method).length;
  }
  get sent() {
    return this.calls.filter((call) => call.method === "send");
  }
}
export function errorIs(sdk, code, origin, reason) {
  return (error) => {
    assert.ok(error instanceof sdk.HierError);
    assert.equal(error.code, code);
    assert.equal(error.origin, origin);
    if (reason !== undefined) assert.equal(error.data.reason, reason);
    return true;
  };
}
export function context(factory, sdk) {
  const bridges = [],
    transports = [],
    clients = [];
  return {
    sdk,
    factory,
    errorIs: (code, origin, reason) => errorIs(sdk, code, origin, reason),
    bridge() {
      const b = new BridgeInput();
      bridges.push(b);
      return b;
    },
    async open(b = this.bridge()) {
      const transport = await factory(b.bridge);
      transports.push(transport);
      return { b, transport };
    },
    async client() {
      const b = this.bridge();
      b.onStart = () => b.emit(frame(hello));
      const { transport } = await this.open(b),
        client = new sdk.HierClient(transport);
      clients.push(client);
      client.ready.catch(() => {});
      assert.deepEqual(await client.ready, snapshot);
      return { b, transport, client };
    },
    async cleanup() {
      const errors = [];
      for (const client of clients) {
        try {
          client.dispose();
        } catch (error) {
          errors.push(error);
        }
      }
      for (const transport of transports) {
        try {
          transport.close();
        } catch (error) {
          errors.push(error);
        }
      }
      await checkpoint();
      for (const b of bridges) {
        try {
          assert.equal(
            b.records.filter((r) => r.active).length,
            0,
            "all owned Bridge callbacks released",
          );
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length)
        throw new AggregateError(errors, "B resource cleanup failures");
    },
  };
}
