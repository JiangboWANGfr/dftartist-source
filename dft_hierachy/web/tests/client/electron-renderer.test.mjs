import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { build } from "esbuild";
import { HierClient, HierError } from "@hier/client";
import { connectElectronTransport } from "@hier/client/electron/renderer";

// A regression witnesses for the renderer implementation choices, including BER-Q01/Q03.
// The public Bridge is controlled input; neither these tests nor the VM are Electron IPC.
const sessionId = "A-renderer-session";
const snapshot = {
  protocol: 2,
  schemaVersion: 7,
  frontend: { name: "slang", version: "A-renderer-witness" },
  snapshotId: "A-core-snapshot",
  inputHash: "0".repeat(64),
  inputHashComplete: true,
  bodySharing: "fast",
  tops: [],
  definitionCount: 0,
  bodyCount: 0,
  indexState: "ready",
  openedAt: "2026-01-01T00:00:00.000Z",
  topCandidates: [],
};
// A watchdog prevents a broken lifecycle from hanging the test process; it is not a product SLA.
const watchdog = { timeout: 15000 };
const turn = () => new Promise(setImmediate);
const failure = (reason = "document_navigated") => ({
  code: "transport_closed",
  origin: "transport",
  message: "A original close",
  data: { reason, details: { lines: ["original"] } },
});
const closed = (error) => ({ version: 1, sessionId, kind: "closed", error });
function isClosed(reason) {
  return (error) => {
    assert.ok(error instanceof HierError);
    assert.equal(error.code, "transport_closed");
    assert.equal(error.origin, "transport");
    if (reason !== undefined) assert.equal(error.data.reason, reason);
    return true;
  };
}

function bridgeInput(hooks = {}) {
  const calls = [];
  let receive;
  let active = false;
  return {
    calls,
    emit(event) {
      assert.equal(typeof receive, "function");
      receive(event);
    },
    get active() {
      return active;
    },
    bridge: {
      version: 1,
      connect(callback) {
        calls.push({ method: "connect" });
        receive = callback;
        active = true;
        return hooks.connect
          ? hooks.connect(callback)
          : Promise.resolve({ ok: true, version: 1, sessionId });
      },
      start(id) {
        calls.push({ method: "start", id });
        hooks.start?.();
      },
      send(id, json) {
        calls.push({ method: "send", id, json });
        hooks.send?.(json);
      },
      close(id) {
        calls.push({ method: "close", id });
        hooks.close?.();
      },
      release(id) {
        calls.push({ method: "release", id });
        active = false;
        hooks.release?.();
      },
    },
  };
}

test(
  "A renderer: browser bundle actually connects, queries and releases without Node globals",
  watchdog,
  async () => {
    const bundle = await build({
      stdin: {
        contents: `
        export { connectElectronTransport } from "@hier/client/electron/renderer";
        export { HierClient } from "@hier/client";
      `,
        resolveDir: fileURLToPath(new URL("../..", import.meta.url)),
      },
      bundle: true,
      platform: "browser",
      target: "es2022",
      format: "iife",
      globalName: "RendererWitness",
      write: false,
      metafile: true,
    });
    assert.deepEqual(bundle.warnings, []);
    for (const input of Object.keys(bundle.metafile.inputs))
      assert.doesNotMatch(
        input,
        /(?:\/node\/|node_modules\/(?:electron|ajv))/u,
      );
    for (const output of Object.values(bundle.metafile.outputs))
      assert.deepEqual(output.imports, []);
    const realm = createContext({
      queueMicrotask,
      TextEncoder,
      TextDecoder,
      AbortController,
      AbortSignal,
      setTimeout,
      clearTimeout,
    });
    assert.equal(
      runInContext(
        "[typeof process, typeof Buffer, typeof require, typeof module].join(',')",
        realm,
      ),
      "undefined,undefined,undefined,undefined",
    );
    runInContext(bundle.outputFiles[0].text, realm, { timeout: 10000 });
    // Construct the Bridge, request and SDK inside the same browser-like realm.
    const result = await runInContext(
      `(async () => {
      const snapshot = ${JSON.stringify(snapshot)};
      const calls = [];
      let receive, active = false, started = false;
      const emit = json => receive({version: 1, sessionId: "browser-session", kind: "frame", json});
      const bridge = {
        version: 1,
        connect(callback) {
          calls.push("connect"); receive = callback; active = true;
          return Promise.resolve({ok: true, version: 1, sessionId: "browser-session"});
        },
        start(id) {
          if (id !== "browser-session") throw new Error("wrong start session");
          calls.push("start"); started = true;
          emit(JSON.stringify({event: "hello", protocol: 2, snapshot, capabilities: ["cancel", "progress"]}));
        },
        send(id, json) {
          if (!started || id !== "browser-session" || typeof json !== "string") throw new Error("invalid send boundary");
          const request = JSON.parse(json);
          if (request.method !== "inst.roots" || request.snapshot !== snapshot.snapshotId) throw new Error("invalid SDK request");
          calls.push("roots");
          emit(JSON.stringify({id: request.id, ok: true, result: [], completeness: {status: "complete", reasons: []}}));
        },
        close(id) {
          if (id !== "browser-session") throw new Error("wrong close session");
          calls.push("close");
        },
        release(id) {
          if (id !== "browser-session") throw new Error("wrong release session");
          calls.push("release"); active = false;
        }
      };
      const transport = await RendererWitness.connectElectronTransport(bridge);
      const client = new RendererWitness.HierClient(transport);
      try {
        const ready = await client.ready;
        const reply = await client.roots();
        return {snapshot: ready.snapshotId, reply, calls, get active() { return active; }};
      } finally {
        client.dispose(); transport.close();
      }
    })()`,
      realm,
      { timeout: 10000 },
    );
    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      snapshot: snapshot.snapshotId,
      reply: { result: [], completeness: { status: "complete", reasons: [] } },
      calls: ["connect", "start", "roots", "close", "release"],
      active: false,
    });
  },
);

test(
  "A renderer BER-Q01: close before connect resolution returns a closed transport and rejects SDK ready",
  watchdog,
  async (t) => {
    const connect = Promise.withResolvers();
    const input = bridgeInput({
      connect(receive) {
        receive(closed(failure()));
        return connect.promise;
      },
    });
    const pending = connectElectronTransport(input.bridge);
    connect.resolve({ ok: true, version: 1, sessionId });
    const transport = await pending;
    t.after(() => transport.close());
    const client = new HierClient(transport);
    t.after(() => client.dispose());
    await assert.rejects(client.ready, isClosed("document_navigated"));
    await assert.rejects(client.roots(), isClosed("document_navigated"));
    await turn();
    assert.equal(
      input.calls.filter(
        ({ method }) => method === "start" || method === "send",
      ).length,
      0,
    );
    assert.equal(
      input.calls.filter(({ method }) => method === "release").length,
      1,
    );
    assert.equal(input.active, false);
  },
);

test(
  "A renderer: a send getter that closes the transport cannot enqueue an outbound request",
  watchdog,
  async (t) => {
    const input = bridgeInput();
    const transport = await connectElectronTransport(input.bridge);
    t.after(() => transport.close());
    transport.onMessage(() => {});
    await turn();
    let reads = 0;
    const params = {
      get text() {
        reads++;
        transport.close();
        return "close during snapshot";
      },
    };
    assert.throws(
      () =>
        transport.send({
          id: 1,
          method: "search",
          snapshot: snapshot.snapshotId,
          params,
        }),
      isClosed(),
    );
    assert.equal(reads, 1);
    assert.equal(
      input.calls.filter(({ method }) => method === "send").length,
      0,
    );
    assert.deepEqual(
      input.calls.slice(-2).map(({ method }) => method),
      ["close", "release"],
    );
    assert.equal(input.active, false);
  },
);

test(
  "A renderer: diagnostics own nested JSON and never import a remote Error stack",
  watchdog,
  async (t) => {
    const input = bridgeInput();
    const transport = await connectElectronTransport(input.bridge);
    t.after(() => transport.close());
    const observed = [];
    transport.onClose((error) => observed.push(error));
    const dto = { ...failure(), stack: "REMOTE_STACK_SENTINEL" };
    input.emit(closed(dto));
    dto.data.reason = "overwritten";
    dto.data.details.lines[0] = "overwritten";
    await turn();
    assert.equal(observed.length, 1);
    const error = observed[0];
    isClosed("document_navigated")(error);
    assert.equal(error.message, "A original close");
    assert.deepEqual(error.data.details, { lines: ["original"] });
    assert.notEqual(error.data, dto.data);
    assert.notEqual(error.data.details, dto.data.details);
    assert.doesNotMatch(error.stack ?? "", /REMOTE_STACK_SENTINEL/u);
    assert.equal(input.active, false);
  },
);

test(
  "A renderer BER-Q03: start failure settles locally even when close and release throw",
  watchdog,
  async (t) => {
    const input = bridgeInput({
      start() {
        throw new Error("start bridge failed");
      },
      close() {
        throw new Error("close bridge failed");
      },
      release() {
        throw new Error("release bridge failed");
      },
    });
    const transport = await connectElectronTransport(input.bridge);
    t.after(() => transport.close());
    const observed = [];
    transport.onClose((error) => observed.push(error));
    transport.onMessage(() => assert.fail("failed start delivered a frame"));
    await turn();
    assert.equal(observed.length, 1);
    isClosed("ipc_unavailable")(observed[0]);
    assert.deepEqual(
      input.calls.map(({ method }) => method),
      ["connect", "start", "close", "release"],
    );
    assert.equal(input.active, false);
    input.emit(closed(failure("renderer_gone")));
    transport.onClose((error) => observed.push(error));
    assert.doesNotThrow(() => transport.close());
    await turn();
    assert.equal(observed.length, 2);
    assert.equal(observed[1], observed[0]);
    assert.equal(
      input.calls.filter(({ method }) => method === "release").length,
      1,
    );
  },
);

test(
  "A renderer BER-Q03: a send bridge fault preserves a closure observed during that call",
  watchdog,
  async (t) => {
    const input = bridgeInput({
      send() {
        input.emit(closed(failure("document_navigated")));
        throw new Error("later send bridge failure");
      },
    });
    const transport = await connectElectronTransport(input.bridge);
    t.after(() => transport.close());
    const observed = [];
    transport.onClose((error) => observed.push(error));
    transport.onMessage(() => {});
    await turn();
    assert.throws(
      () =>
        transport.send({
          id: 1,
          method: "inst.roots",
          snapshot: snapshot.snapshotId,
          params: {},
        }),
      isClosed("document_navigated"),
    );
    await turn();
    assert.equal(observed.length, 1);
    isClosed("document_navigated")(observed[0]);
    assert.equal(input.active, false);
    assert.equal(
      input.calls.filter(({ method }) => method === "release").length,
      1,
    );
  },
);

test(
  "A renderer BER-Q03: connect throw or rejection does not guess an id to close",
  watchdog,
  async () => {
    for (const synchronous of [true, false]) {
      const input = bridgeInput({
        connect() {
          if (synchronous) throw new Error("connect bridge failed");
          return Promise.reject(new Error("connect bridge rejected"));
        },
      });
      let pending;
      assert.doesNotThrow(() => {
        pending = connectElectronTransport(input.bridge);
      });
      await assert.rejects(pending, isClosed("ipc_unavailable"));
      assert.deepEqual(
        input.calls.map(({ method }) => method),
        ["connect"],
      );
    }
  },
);

test(
  "A renderer: normal first closure stays normal when later bridge cleanup fails",
  watchdog,
  async (t) => {
    for (const remote of [false, true]) {
      const input = bridgeInput({
        close() {
          throw new Error("later close failure");
        },
        release() {
          throw new Error("later release failure");
        },
      });
      const transport = await connectElectronTransport(input.bridge);
      t.after(() => transport.close());
      const causes = [];
      transport.onClose((cause) => causes.push(cause));
      if (remote) input.emit(closed(undefined));
      else transport.close();
      input.emit(closed(failure()));
      transport.onClose((cause) => causes.push(cause));
      await turn();
      assert.deepEqual(causes, [undefined, undefined]);
      assert.equal(input.active, false);
      assert.equal(
        input.calls.filter(({ method }) => method === "release").length,
        1,
      );
      assert.equal(
        input.calls.filter(({ method }) => method === "close").length,
        remote ? 0 : 1,
      );
    }
  },
);

test(
  "A renderer BER-Q01: another early session id cannot hide the claimed session's close",
  watchdog,
  async (t) => {
    const input = bridgeInput({
      connect(receive) {
        receive({
          ...closed(failure("renderer_gone")),
          sessionId: "old-session",
        });
        receive(closed(failure("document_navigated")));
        receive(closed(failure("ipc_unavailable")));
        return Promise.resolve({ ok: true, version: 1, sessionId });
      },
    });
    const transport = await connectElectronTransport(input.bridge);
    t.after(() => transport.close());
    const causes = [];
    transport.onClose((cause) => causes.push(cause));
    await turn();
    assert.equal(causes.length, 1);
    isClosed("document_navigated")(causes[0]);
    assert.deepEqual(input.calls, [
      { method: "connect" },
      { method: "release", id: sessionId },
    ]);
    assert.equal(input.active, false);
  },
);

test(
  "A renderer BER-Q01: early first closure wins over later invalid events for that id",
  watchdog,
  async (t) => {
    for (const normal of [true, false]) {
      for (const later of [
        { version: 1, sessionId, kind: "future" },
        { version: 2, sessionId, kind: "closed" },
        { version: 1, sessionId, kind: "closed", error: {} },
        { version: 1, sessionId, kind: "frame", json: "{}" },
      ]) {
        const input = bridgeInput({
          connect(receive) {
            receive(closed(normal ? undefined : failure("document_navigated")));
            receive(later);
            return Promise.resolve({ ok: true, version: 1, sessionId });
          },
        });
        const transport = await connectElectronTransport(input.bridge);
        t.after(() => transport.close());
        const causes = [];
        transport.onClose((cause) => causes.push(cause));
        await turn();
        assert.equal(causes.length, 1);
        if (normal) assert.equal(causes[0], undefined);
        else isClosed("document_navigated")(causes[0]);
        assert.deepEqual(input.calls, [
          { method: "connect" },
          { method: "release", id: sessionId },
        ]);
        assert.equal(input.active, false);
      }
    }
  },
);
