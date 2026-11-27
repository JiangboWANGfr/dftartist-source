import assert from "node:assert/strict";
import test from "node:test";
import { createProcessTransport } from "@hier/client/node";
import { HierClient } from "@hier/client";
import { ProcessResourceWatch } from "../../packages/client/dist/node/process-resource-watch.js";
import { snapshot } from "../independent-electron-renderer/fixture.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

for (const missing of [false, true])
  test(`public exited waits for sampler close, spawn failure=${missing}`, () => {
    const run = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./fixtures/rss-close-order.mjs", import.meta.url))],
      {
        encoding: "utf8",
        timeout: 5000,
        env: { ...process.env, HIER_A_RSS_MISSING: missing ? "1" : "0" },
      },
    );
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.before.transportSettled, false);
    assert.equal(result.after.probeClosed, true);
    assert.equal(result.after.transportSettled, true);
  });

const hello = {
  event: "hello",
  protocol: 2,
  snapshot,
  capabilities: ["cancel", "progress"],
};
const request = {
  id: 1,
  method: "inst.roots",
  snapshot: snapshot.snapshotId,
  params: {},
};
const cancel = { method: "cancel", params: { target: 1 } };
const terminal = {
  id: 1,
  ok: false,
  error: { code: "cancelled", message: "cancelled", data: {} },
};
const quiet = "process.stdin.resume(); process.on('SIGTERM',()=>{});";
function child(t, source, resourceLimits) {
  const transport = createProcessTransport({
    command: process.execPath,
    args: ["-e", source],
    shutdownGraceMillis: 0,
    ...(resourceLimits === undefined ? {} : { resourceLimits }),
  });
  t.after(async () => {
    transport.close();
    await transport.exited;
  });
  return transport;
}

test("invalid resource options reject before any spawn", () => {
  for (const resourceLimits of [
    null,
    [],
    2,
    ...["openTimeoutMillis", "cancelTimeoutMillis", "maxRssBytes"].flatMap((key) =>
      [0, -1, 1.1, NaN, Infinity, "100", null, Number.MAX_SAFE_INTEGER + 1].map((v) => ({
        [key]: v,
      })),
    ),
    { openTimeoutMillis: 2147483648 },
    { cancelTimeoutMillis: 2147483648 },
  ])
    assert.throws(
      () =>
        createProcessTransport({
          command: "/does-not-exist",
          args: [],
          resourceLimits,
        }),
      { code: "bad_request", origin: "client" },
    );
});

test("cancellation deadline ignores unknown targets, cannot be extended, and ignores event ids", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const errors = [];
  const watch = new ProcessResourceWatch({ cancelTimeoutMillis: 100 }, (...args) =>
    errors.push(args),
  );
  t.after(() => watch.stop());
  watch.sent(JSON.stringify(cancel));
  t.mock.timers.tick(200);
  assert.equal(errors.length, 0);
  watch.sent(JSON.stringify(request));
  watch.sent(JSON.stringify(cancel));
  t.mock.timers.tick(99);
  watch.sent(JSON.stringify(cancel));
  watch.received({ event: "future", id: 1, ok: true });
  assert.equal(errors.length, 0);
  t.mock.timers.tick(1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], "cancel_timeout");
  assert.equal(errors[0][2].requestId, 1);
});

test("valid terminal replies and stop release pending resource deadlines", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const errors = [];
  const watch = new ProcessResourceWatch(
    { openTimeoutMillis: 50, cancelTimeoutMillis: 100 },
    (...args) => errors.push(args),
  );
  watch.received(hello);
  watch.sent(JSON.stringify(request));
  watch.sent(JSON.stringify(cancel));
  watch.received(terminal);
  watch.sent(JSON.stringify(cancel));
  t.mock.timers.tick(200);
  assert.deepEqual(errors, []);
  watch.sent(JSON.stringify({ ...request, id: 2 }));
  watch.sent(JSON.stringify({ ...cancel, params: { target: 2 } }));
  await watch.stop();
  t.mock.timers.tick(200);
  assert.deepEqual(errors, []);
});

test(
  "opening timeout preserves the first cause, kills and reaps the owned process",
  { timeout: 5000 },
  async (t) => {
    const limits = { openTimeoutMillis: 100 };
    const transport = child(t, quiet, limits);
    limits.openTimeoutMillis = 100000;
    const closed = Promise.withResolvers();
    transport.onClose(closed.resolve);
    const error = await closed.promise;
    assert.equal(error.code, "transport_closed");
    assert.equal(error.origin, "transport");
    assert.equal(error.data.reason, "open_timeout");
    assert.equal(error.data.limitMillis, 100);
    assert.deepEqual(await transport.exited, { code: null, signal: "SIGKILL" });
    const late = Promise.withResolvers();
    transport.onClose(late.resolve);
    assert.equal(await late.promise, error);
  },
);

test(
  "unacknowledged SDK cancellation terminates the whole connection and other waiters",
  { timeout: 5000 },
  async (t) => {
    const source = `console.log(${JSON.stringify(JSON.stringify(hello))});
    let text='';process.stdin.on('data',c=>{text+=c;let p;
    while((p=text.indexOf('\\n'))>=0){const r=JSON.parse(text.slice(0,p));text=text.slice(p+1);
    if(r.method!=='cancel') console.log(JSON.stringify({event:'index',state:'ready'}));}});`;
    const transport = child(t, source, { cancelTimeoutMillis: 100 });
    const client = new HierClient(transport);
    t.after(() => client.dispose());
    await client.ready;
    const started = Promise.withResolvers();
    client.onIndexReady(started.resolve);
    const controller = new AbortController();
    const query = client.roots(controller.signal);
    const cancelled = assert.rejects(query, { code: "cancelled" });
    await started.promise;
    const other = client.info();
    const failed = assert.rejects(other, (error) => error.data.reason === "cancel_timeout");
    controller.abort();
    await cancelled;
    await failed;
    assert.deepEqual(await transport.exited, { code: null, signal: "SIGKILL" });
  },
);

test(
  "RSS overage closes with the observed limit and releases sampler and process",
  { timeout: 5000 },
  async (t) => {
    const transport = child(t, quiet, { maxRssBytes: 1 });
    const closed = Promise.withResolvers();
    transport.onClose(closed.resolve);
    const error = await closed.promise;
    assert.equal(error.data.reason, "memory_limit");
    assert.equal(error.data.limitBytes, 1);
    assert(error.data.observedBytes > 1);
    assert.deepEqual(await transport.exited, { code: null, signal: "SIGKILL" });
  },
);

test(
  "healthy session succeeds with every resource limit and original no-limit calls still work",
  { timeout: 5000 },
  async (t) => {
    for (const limits of [
      undefined,
      {},
      {
        openTimeoutMillis: 2000,
        cancelTimeoutMillis: 100,
        maxRssBytes: 2 ** 30,
      },
    ]) {
      const source = `console.log(${JSON.stringify(JSON.stringify(hello))});let text='';
      process.stdin.on('data',c=>{text+=c;let p;while((p=text.indexOf('\\n'))>=0){
      const r=JSON.parse(text.slice(0,p));text=text.slice(p+1);if(r.id)console.log(JSON.stringify({
      id:r.id,ok:true,result:[],completeness:{status:'complete',reasons:[]}}));}});`;
      const transport = child(t, source, limits);
      const client = new HierClient(transport);
      await client.ready;
      assert.deepEqual((await client.roots()).result, []);
      client.dispose();
      await transport.exited;
    }
  },
);

test(
  "RSS monitoring failure is diagnostic and its probe is reaped",
  { timeout: 5000 },
  async () => {
    const failed = Promise.withResolvers();
    const watch = new ProcessResourceWatch({ maxRssBytes: 2 ** 30 }, (...args) =>
      failed.resolve(args),
    );
    watch.startSampling(-1); // An unavailable process forces the real ps error path.
    try {
      const [reason, message, data] = await failed.promise;
      assert.equal(reason, "resource_monitor_failed");
      assert.match(message, /monitoring failed/);
      assert.equal(typeof data.detail, "string");
    } finally {
      await watch.stop();
    }
  },
);
