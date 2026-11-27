import assert from "node:assert/strict";
import { usingMain, preload, channels, URL } from "./electron-input.mjs";
import { checkpoint } from "./scope.mjs";
import { hello, reply, snapshot } from "../independent-electron-renderer/fixture.mjs";
export const mainCases = [],
  preloadCases = [];
const add = (list, id, input, expected, section, run) =>
  list.push({ id, input, expected, basis: "DESIGN §6.8." + section, run });
const main = (id, input, expected, section, fn) =>
  add(mainCases, "BHM-" + id, input, expected, section, (p) => usingMain(p, fn));
const pre = (id, input, expected, fn) => add(preloadCases, "BHP-" + id, input, expected, 4, fn);
const bad = (e) => e.code === "bad_request" && e.origin === "client";
for (const shape of ["relative-url", "different-url", "destroyed", "missing-contents"]) {
  main(
    "config-" + shape,
    { shape },
    "synchronous bad_request/client; no accepted process/session",
    2,
    async (c) => {
      const opts = await c.options();
      if (shape === "relative-url") opts.documentUrl = "./a";
      if (shape === "different-url") opts.documentUrl = URL + "?other";
      if (shape === "destroyed") opts.webContents.destroy();
      if (shape === "missing-contents") opts.webContents = null;
      assert.throws(() => c.create(opts), bad);
    },
  );
}
for (const origin of ["other-window", "child-frame", "null-frame", "changed-url"]) {
  main(
    "origin-" + origin,
    { origin },
    "generic bad_request/client, no claim or foreign close",
    2,
    async (c) => {
      const o = await c.session();
      let event = c.event(o.w);
      if (origin === "other-window") event = c.event(c.contents());
      if (origin === "child-frame") event = c.event(o.w, { url: URL });
      if (origin === "null-frame") event = c.event(o.w, null);
      if (origin === "changed-url") o.w.url = URL + "?changed";
      const r = await c.ipc.invoke(event, { version: 1, connectionId: "B-foreign" });
      assert.equal(r.ok, false);
      assert.equal(r.error.code, "bad_request");
      assert.equal(r.error.origin, "client");
      if (origin === "changed-url") o.w.url = URL;
      assert.equal((await c.connect(o)).ok, true);
    },
  );
}
main(
  "version",
  {},
  "wrong version does not claim/close; subsequent version1 succeeds",
  4,
  async (c) => {
    const o = await c.session(),
      r = await c.ipc.invoke(c.event(o.w), { version: 2, connectionId: "B-bad-version" });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "protocol_mismatch");
    assert.equal((await c.connect(o)).ok, true);
  },
);
main("second-claim", {}, "second claim bad_request without poisoning first", 2, async (c) => {
  const o = await c.session(),
    r = await c.connect(o);
  assert.equal(r.sessionId, o.s.id);
  const duplicate = await c.connect(o, "B-second");
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, "bad_request");
  c.dispatch("start", o);
  await o.p.bytes(hello + "\n");
  assert.equal((await c.next(o, "frame")).json, hello);
});
main(
  "start-order",
  {},
  "hello not forwarded before start; repeat start idempotent; raw content preserved",
  3,
  async (c) => {
    const o = await c.session();
    await o.p.bytes(hello + "  \r\n");
    const r = await c.connect(o);
    assert.equal(r.ok, true);
    await checkpoint();
    assert.equal(o.w.events.rows.filter((x) => x.event?.kind === "frame").length, 0);
    c.dispatch("start", o);
    assert.equal((await c.next(o, "frame")).json, hello + "  ");
    c.dispatch("start", o);
    const raw = reply(1, []);
    await o.p.bytes(raw + "\n");
    assert.equal((await c.next(o, "frame")).json, raw);
    await checkpoint();
    assert.equal(o.w.events.rows.filter((x) => x.event?.kind === "frame").length, 2);
  },
);
for (const foreign of ["sessionId", "connectionId", "sender", "frame"]) {
  main(
    "foreign-" + foreign,
    { foreign },
    "unauthorized one-way close/send ignored; current connection remains usable",
    2,
    async (c) => {
      const o = await c.session();
      await c.connect(o);
      c.dispatch("start", o);
      let event = c.event(o.w),
        body = { version: 1, sessionId: o.s.id, connectionId: "B-connection", json: "{}" };
      if (foreign === "sender") event = c.event(c.contents());
      if (foreign === "frame") event = c.event(o.w, { url: URL });
      if (foreign === "sessionId") body.sessionId = "B-old";
      if (foreign === "connectionId") body.connectionId = "B-old";
      c.ipc.dispatch("close", event, body);
      c.ipc.dispatch("send", event, body);
      const raw = JSON.stringify({
        id: 1,
        method: "inst.roots",
        snapshot: snapshot.snapshotId,
        params: {},
      });
      c.dispatch("send", o, "B-connection", { json: raw });
      assert.equal((await o.p.inbox.next((v) => v.stdin !== undefined)).stdin, raw);
      assert.equal(o.p.inbox.rows.filter((v) => v.stdin !== undefined).length, 1);
    },
  );
}
for (const [json, reason] of [
  [17, "invalid_ipc_frame"],
  ["{]", "invalid_frame"],
]) {
  main(
    "invalid-send-" + String(json),
    { json },
    "authorized invalid packet closes with " + reason + ", no stdout delivered",
    4,
    async (c) => {
      const o = await c.session();
      await c.connect(o);
      c.dispatch("start", o);
      c.dispatch("send", o, "B-connection", { json });
      const e = await c.next(o, "closed");
      assert.equal(e.error.code, "transport_closed");
      assert.equal(e.error.origin, "transport");
      assert.equal(e.error.data.reason, reason);
      await o.s.exited;
      assert.equal(o.p.inbox.rows.filter((v) => v.stdin !== undefined).length, 0);
    },
  );
}
for (const kind of ["same-document", "navigation", "gone", "destroyed"]) {
  main(
    "lifecycle-" + kind,
    { kind },
    "main document lifetime ends; process reaped without renderer cooperation",
    2,
    async (c) => {
      const o = await c.session();
      await c.connect(o);
      if (kind === "same-document") o.w.navigate(true);
      else if (kind === "navigation") o.w.navigate(false);
      else if (kind === "gone")
        o.w.emit("render-process-gone", {}, { reason: "crashed", exitCode: 17 });
      else o.w.destroy();
      await o.s.exited;
      if (kind !== "destroyed") {
        const e = await c.next(o, "closed");
        assert.equal(e.error.data.reason, kind === "gone" ? "renderer_gone" : "document_navigated");
      }
    },
  );
}
main(
  "early-exit",
  {},
  "process exited before claim yields unique id and saved async closed, never hello",
  3,
  async (c) => {
    const o = await c.session();
    await o.p.bytes(hello + "\n");
    await o.p.command("exit");
    await o.s.exited;
    const r = await c.connect(o);
    assert.equal(r.ok, true);
    assert.equal(r.sessionId, o.s.id);
    await c.next(o, "closed");
    assert.equal(o.w.events.rows.filter((x) => x.event?.kind === "frame").length, 0);
  },
);
main(
  "reopen",
  {},
  "no implicit replacement before exited; new id after exited; old id cannot close new",
  5,
  async (c) => {
    const o = await c.session();
    await c.connect(o);
    const before = await c.options(o.w);
    assert.throws(() => c.create(before), bad);
    o.s.close();
    o.s.close();
    await o.s.exited;
    const n = await c.session(o.w);
    assert.notEqual(n.s.id, o.s.id);
    assert.equal((await c.connect(n)).ok, true);
    c.ipc.dispatch("close", c.event(o.w), {
      version: 1,
      sessionId: o.s.id,
      connectionId: "B-connection",
    });
    c.dispatch("start", n);
    await n.p.bytes(hello + "\n");
    assert.equal((await c.next(n, "frame")).json, hello);
  },
);
for (const n of [256, 257])
  main(
    "buffer-" + n,
    { frames: n },
    "pre-start uses original256frame cap; overflow saved and hello not replayed",
    3,
    async (c) => {
      const o = await c.session();
      await o.p.bytes(Array.from({ length: n }, (_, i) => reply(i + 1, [])).join("\n") + "\n");
      if (n === 257) await o.s.exited;
      assert.equal((await c.connect(o)).ok, true);
      c.dispatch("start", o);
      if (n === 257)
        assert.equal((await c.next(o, "closed")).error.data.reason, "prebind_buffer_overflow");
      else {
        await o.w.events.next((x) => x.event?.json === reply(256, []));
        assert.deepEqual(
          o.w.events.rows.filter((x) => x.event?.kind === "frame").map((x) => x.event.json),
          Array.from({ length: n }, (_, i) => reply(i + 1, [])),
        );
      }
    },
  );
for (const key of ["", "bad-existing", 17])
  pre(
    "install-" + String(key),
    { key },
    "invalid parameter/existing key TypeError; failed install leaves no listener",
    async (product) => {
      const c = await preload(product, { existing: { "bad-existing": { original: true } } }),
        before = c.ipc.listenerCount(channels.event);
      assert.throws(
        () => c.install(key),
        (e) => e.name === "TypeError",
      );
      assert.equal(c.ipc.listenerCount(channels.event), before);
    },
  );
pre("subframe", {}, "subframe cannot expose bridge or retain listener", async (product) => {
  const c = await preload(product, { isMainFrame: false });
  assert.throws(() => c.install("BApi"));
  assert.equal(Object.hasOwn(c.exposed, "BApi"), false);
  assert.equal(c.ipc.listenerCount(channels.event), 0);
});
pre(
  "surface",
  {},
  "only version/connect/start/send/close/release; no Electron event or generic IPC capability",
  async (product) => {
    const c = await preload(product);
    c.install("BApi");
    assert.deepEqual(Object.keys(c.exposed.BApi).sort(), [
      "close",
      "connect",
      "release",
      "send",
      "start",
      "version",
    ]);
    assert.equal(c.exposed.BApi.version, 1);
    assert.throws(
      () => c.install("BApi"),
      (e) => e.name === "TypeError",
    );
  },
);
pre(
  "connect-order",
  {},
  "callback registered before invoke; closed-before-result routed to only own claim",
  async (product) => {
    const c = await preload(product);
    c.install("BApi");
    const events = [];
    c.outcomes.push((body) => {
      c.event(body.connectionId, { version: 1, kind: "closed", sessionId: "B-session" });
      return Promise.resolve({ ok: true, version: 1, sessionId: "B-session" });
    });
    const r = await c.exposed.BApi.connect((e) => events.push(e));
    assert.equal(r.ok, true);
    await checkpoint();
    assert.equal(events.length, 1);
    assert.equal(events[0].kind, "closed");
    assert.equal(events[0].B_rawElectronEvent, undefined);
    c.exposed.BApi.release(r.sessionId);
  },
);
pre(
  "invocation-reject",
  {},
  "invoke rejection becomes DTO transport_closed/ipc_unavailable, no Error prototype/stack",
  async (product) => {
    const c = await preload(product);
    c.install("BApi");
    c.outcomes.push(() => Promise.reject(Error("B raw")));
    const r = await c.exposed.BApi.connect(() => {});
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "transport_closed");
    assert.equal(r.error.origin, "transport");
    assert.equal(r.error.data.reason, "ipc_unavailable");
    assert.equal(r.error.stack, undefined);
    assert(!(r.error instanceof Error));
  },
);
pre(
  "routing",
  {},
  "concurrent connections distinct random routing ids; failed second claim cannot remove first callback",
  async (product) => {
    const c = await preload(product);
    c.install("BApi");
    const a = [],
      b = [];
    const first = await c.exposed.BApi.connect((e) => a.push(e));
    c.outcomes.push(() =>
      Promise.resolve({
        ok: false,
        error: { code: "bad_request", origin: "client", message: "already claimed", data: {} },
      }),
    );
    assert.equal((await c.exposed.BApi.connect((e) => b.push(e))).ok, false);
    const invokes = c.calls.filter((x) => x.kind === "invoke");
    assert.notEqual(invokes[0].value.connectionId, invokes[1].value.connectionId);
    const event = { version: 1, sessionId: first.sessionId, kind: "frame", json: hello };
    c.event(invokes[0].value.connectionId, event);
    c.event(invokes[1].value.connectionId, event);
    await checkpoint();
    assert.equal(a.length, 1);
    assert.equal(b.length, 0);
    c.exposed.BApi.release(first.sessionId);
    c.event(invokes[0].value.connectionId, event);
    await checkpoint();
    assert.equal(a.length, 1);
  },
);
pre(
  "fixed-channels",
  {},
  "send/start/close carry exact version/connection/session; release local only",
  async (product) => {
    const c = await preload(product);
    c.install("BApi");
    const api = c.exposed.BApi,
      r = await api.connect(() => {}),
      id = c.calls[0].value.connectionId;
    api.start(r.sessionId);
    api.send(r.sessionId, hello);
    api.close(r.sessionId);
    const sent = c.calls.filter((x) => x.kind === "send");
    assert.deepEqual(
      sent.map((x) => x.channel),
      [channels.start, channels.send, channels.close],
    );
    for (const x of sent) {
      assert.equal(x.value.version, 1);
      assert.equal(x.value.connectionId, id);
      assert.equal(x.value.sessionId, r.sessionId);
    }
    assert.equal(sent[1].value.json, hello);
    api.release(r.sessionId);
    api.release(r.sessionId);
    assert.equal(c.calls.filter((x) => x.kind === "send").length, 3);
  },
);
pre(
  "send-failure",
  {},
  "one-way IPC throw not leaked, closed/ipc_unavailable routed to own callback",
  async (product) => {
    const c = await preload(product);
    c.install("BApi");
    const events = [],
      r = await c.exposed.BApi.connect((e) => events.push(e));
    c.ipc.sendError = Error("B unavailable");
    assert.doesNotThrow(() => c.exposed.BApi.send(r.sessionId, hello));
    await checkpoint();
    assert.equal(events[0].kind, "closed");
    assert.equal(events[0].error.data.reason, "ipc_unavailable");
    c.exposed.BApi.release(r.sessionId);
  },
);
