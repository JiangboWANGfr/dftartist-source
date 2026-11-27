// Independent oracle: approved DESIGN/public Bridge types and handwritten B wire KAT.
import assert from "node:assert/strict";
import {
  SESSION,
  OTHER,
  BridgeInput,
  checkpoint,
  frame,
  closed,
  failure,
  reply,
  byteFrame,
  instance,
  snapshot,
  hello,
} from "./fixture.mjs";
export const cases = [];
function add(id, input, expected, basis, run) {
  cases.push({ id, input, expected, basis, run });
}
const error = (c, code, origin = "client", reason) =>
  c.errorIs(code, origin, reason);
for (const [label, value] of [
  ["undefined", undefined],
  ["null", null],
  ["number", 7],
  ["string", "bridge"],
  ["empty-object", {}],
  ["empty-array", []],
]) {
  add(
    "ER-SHAPE-" + label,
    { bridge: label },
    "Promise rejects bad_request/client, no bridge IPC",
    "6.8.1",
    async (c) => {
      let p;
      assert.doesNotThrow(() => {
        p = c.factory(value);
      });
      assert.ok(p && typeof p.then === "function");
      await assert.rejects(p, error(c, "bad_request"));
    },
  );
}
for (const member of ["connect", "start", "send", "close", "release"])
  for (const [label, value] of [
    ["missing", undefined],
    ["null", null],
    ["number", 1],
  ]) {
    add(
      `ER-SHAPE-${member}-${label}`,
      { member, value: label },
      "reject bad_request/client before connect",
      "6.8.1/6.8.4",
      async (c) => {
        const b = c.bridge(),
          bad = { ...b.bridge, [member]: value };
        await assert.rejects(c.factory(bad), error(c, "bad_request"));
        assert.equal(b.calls.length, 0);
      },
    );
  }
for (const [label, value, code] of [
  ["missing", undefined, "bad_request"],
  ["text", "1", "bad_request"],
  ["null", null, "bad_request"],
  ["zero", 0, "protocol_mismatch"],
  ["two", 2, "protocol_mismatch"],
]) {
  add(
    "ER-VERSION-" + label,
    { version: label },
    `${code}/client, no connect or downgrade`,
    "6.8.1/6.8.4",
    async (c) => {
      const b = c.bridge();
      b.bridge.version = value;
      await assert.rejects(c.factory(b.bridge), error(c, code));
      assert.equal(b.calls.length, 0);
    },
  );
}
for (const [code, origin, data] of [
  ["not_ready", "client", {}],
  ["bad_request", "client", {}],
  ["protocol_mismatch", "client", {}],
  ["transport_closed", "transport", { reason: "ipc_unavailable" }],
]) {
  add(
    "ER-CONNECT-FAIL-" + code,
    { ok: false, code, origin, data },
    "local HierError retains code/origin/message/data; no guessed session close",
    "6.8.1/6.8.4",
    async (c) => {
      const b = c.bridge(),
        dto = { code, origin, message: "B exact connect error", data };
      b.outcomes.push({ ok: false, error: dto });
      await assert.rejects(c.factory(b.bridge), (e) => {
        error(c, code, origin)(e);
        assert.equal(e.message, dto.message);
        assert.deepEqual(e.data, data);
        assert.notEqual(e, dto);
        return true;
      });
      assert.deepEqual(
        b.calls.map((x) => x.method),
        ["connect"],
      );
    },
  );
}
for (const [label, value] of [
  ["null", null],
  ["number", 1],
  ["empty", {}],
  ["ok-not-boolean", { ok: "true" }],
  ["success-no-id", { ok: true, version: 1 }],
  ["success-numeric-id", { ok: true, version: 1, sessionId: 7 }],
  ["failure-no-error", { ok: false }],
  ["failure-string-error", { ok: false, error: "bad" }],
]) {
  add(
    "ER-CONNECT-CORRUPT-" + label,
    { result: label },
    "reject protocol_error/client; no guessed sessionId close/release",
    "6.8.4",
    async (c) => {
      const b = c.bridge();
      b.outcomes.push(value);
      await assert.rejects(c.factory(b.bridge), error(c, "protocol_error"));
      assert.equal(b.count("close"), 0);
      assert.equal(b.count("release"), 0);
    },
  );
}
add(
  "ER-OPEN-LAZY",
  {},
  "connect once with receiver; no start/send until onMessage; close once before release",
  "6.8.1/6.8.3/6.8.4",
  async (c) => {
    const { b, transport: t } = await c.open();
    assert.equal(typeof b.records[0].callback, "function");
    assert.deepEqual(
      b.calls.map((x) => x.method),
      ["connect"],
    );
    t.close();
    t.close();
    assert.deepEqual(
      b.calls.map((x) => x.method),
      ["connect", "close", "release"],
    );
    assert.equal(b.calls[1].sessionId, SESSION);
  },
);
add(
  "ER-START-ASYNC",
  {},
  "first owner schedules one start after subscribe returns; frames later, never same stack",
  "6.8.3",
  async (c) => {
    const { b, transport: t } = await c.open();
    let inSubscribe = true;
    const seen = [];
    b.onStart = () => {
      assert.equal(inSubscribe, false);
      b.emit(frame(reply(1, { tag: 1 })));
    };
    t.onMessage((x) => {
      assert.equal(inSubscribe, false);
      seen.push(x);
    });
    assert.equal(b.count("start"), 0);
    assert.equal(seen.length, 0);
    inSubscribe = false;
    await checkpoint();
    assert.equal(b.count("start"), 1);
    assert.equal(seen.length, 1);
  },
);
for (const offFirst of [false, true])
  add(
    "ER-OWNER-" + offFirst,
    { unsubscribeFirst: offFirst },
    "second receiver bad_request/client; unsubscribe does not restore ownership or close",
    "5.6.5/6.8.3",
    async (c) => {
      const { b, transport: t } = await c.open();
      const off = t.onMessage(() => {});
      if (offFirst) {
        off();
        off();
      }
      assert.throws(() => t.onMessage(() => {}), error(c, "bad_request"));
      assert.equal(b.count("close"), 0);
    },
  );
add(
  "ER-SEND-UNBOUND",
  {},
  "not_ready/client before ownership, no send",
  "5.6.5/6.8.3",
  async (c) => {
    const { b, transport: t } = await c.open();
    assert.throws(() => t.send({ id: 1 }), error(c, "not_ready"));
    assert.equal(b.sent.length, 0);
  },
);
for (const bind of [false, true])
  add(
    "ER-SEND-CLOSED-" + bind,
    { bind },
    "closed takes precedence over not_ready; synchronous transport_closed/transport",
    "5.6.5/6.8.3",
    async (c) => {
      const { b, transport: t } = await c.open();
      if (bind) t.onMessage(() => {});
      t.close();
      assert.throws(
        () => t.send({ id: 1 }),
        error(c, "transport_closed", "transport"),
      );
      assert.equal(b.sent.length, 0);
    },
  );
add(
  "ER-FIFO",
  { frames: [1, 2, 3] },
  "parsed frames arrive asynchronously in original order",
  "5.6.5/6.8.3",
  async (c) => {
    const { b, transport: t } = await c.open(),
      seen = [];
    t.onMessage((x) => seen.push(x.id));
    await checkpoint();
    for (const id of [1, 2, 3]) b.emit(frame(reply(id, { tag: id })));
    assert.deepEqual(seen, []);
    await checkpoint();
    assert.deepEqual(seen, [1, 2, 3]);
  },
);
add(
  "ER-OFF-QUEUED",
  {},
  "unsubscribe cancels already queued frame callbacks, idempotent",
  "5.6.5/6.8.3",
  async (c) => {
    const { b, transport: t } = await c.open(),
      seen = [];
    const off = t.onMessage((x) => seen.push(x));
    await checkpoint();
    b.emit(frame(reply(1, {})));
    off();
    off();
    await checkpoint();
    assert.deepEqual(seen, []);
  },
);
add(
  "ER-CLOSE-QUEUED",
  {},
  "local close cancels queued frame, notifies later, closes then releases once",
  "5.6.5/6.8.3/6.8.4",
  async (c) => {
    const { b, transport: t } = await c.open(),
      seen = [],
      causes = [];
    t.onMessage((x) => seen.push(x));
    t.onClose((x) => causes.push(x));
    await checkpoint();
    b.emit(frame(reply(1, {})));
    t.close();
    assert.equal(causes.length, 0);
    await checkpoint();
    assert.deepEqual(seen, []);
    assert.equal(causes.length, 1);
    assert.deepEqual(
      b.calls.slice(-2).map((x) => x.method),
      ["close", "release"],
    );
  },
);
add(
  "ER-CLOSE-IN-HANDLER",
  {},
  "first running handler stays executed; queued later frames discarded",
  "5.6.5/6.8.3",
  async (c) => {
    const { b, transport: t } = await c.open(),
      seen = [];
    b.onStart = () => {
      b.emit(frame(reply(1, {})));
      b.emit(frame(reply(2, {})));
    };
    t.onMessage((x) => {
      seen.push(x.id);
      t.close();
    });
    await checkpoint();
    assert.deepEqual(seen, [1]);
  },
);
add(
  "ER-CLOSE-BEFORE-FIRST-OWNER",
  {},
  "closed Transport allows first owner/off but no historical delivery",
  "5.6.5/6.8.3",
  async (c) => {
    const { transport: t } = await c.open();
    t.close();
    const seen = [],
      off = t.onMessage((x) => seen.push(x));
    assert.equal(typeof off, "function");
    off();
    off();
    await checkpoint();
    assert.deepEqual(seen, []);
    assert.throws(() => t.onMessage(() => {}), error(c, "bad_request"));
  },
);
add(
  "ER-CLOSE-SUBSCRIPTIONS",
  {},
  "same callback registered twice gets two independent notifications; late registration gets first cause once",
  "5.6.5/6.8.3",
  async (c) => {
    const { b, transport: t } = await c.open(),
      seen = [],
      listener = (x) => seen.push(x);
    t.onClose(listener);
    t.onClose(listener);
    b.emit(closed(failure()));
    assert.equal(seen.length, 0);
    await checkpoint();
    assert.equal(seen.length, 2);
    t.onClose(listener);
    assert.equal(seen.length, 2);
    await checkpoint();
    assert.equal(seen.length, 3);
    for (const e of seen)
      error(c, "transport_closed", "transport", "renderer_gone")(e);
    t.close();
    await checkpoint();
    assert.equal(seen.length, 3);
  },
);
add(
  "ER-CLOSE-OFF",
  {},
  "cancelled close registration is silent, a new registration remains independent",
  "5.6.5",
  async (c) => {
    const { transport: t } = await c.open(),
      seen = [];
    const off = t.onClose(() => seen.push("old"));
    off();
    off();
    t.close();
    t.onClose(() => seen.push("new"));
    await checkpoint();
    assert.deepEqual(seen, ["new"]);
  },
);
add(
  "ER-FIRST-CAUSE",
  {},
  "later remote errors and local close cannot overwrite first reason",
  "5.6.5/6.8.4",
  async (c) => {
    const { b, transport: t } = await c.open();
    b.emit(closed(failure("document_navigated")));
    b.emitLate(closed(failure("renderer_gone")));
    t.close();
    const seen = [];
    t.onClose((e) => seen.push(e));
    await checkpoint();
    assert.equal(seen.length, 1);
    error(c, "transport_closed", "transport", "document_navigated")(seen[0]);
  },
);
add(
  "ER-STALE-ID",
  { id: OTHER },
  "well-shaped other-id frame and close ignored; current-id frame still delivered",
  "6.8.3",
  async (c) => {
    const { b, transport: t } = await c.open(),
      seen = [],
      causes = [];
    t.onMessage((x) => seen.push(x.id));
    t.onClose((x) => causes.push(x));
    await checkpoint();
    b.emit(frame(reply(9, {}), OTHER));
    b.emit(closed(failure(), OTHER));
    b.emit(frame(reply(1, {})));
    await checkpoint();
    assert.deepEqual(seen, [1]);
    assert.deepEqual(causes, []);
  },
);
add(
  "ER-EXTRA-IPC-FIELDS",
  {},
  "unknown outer event fields ignored, original frame preserved",
  "6.8.4",
  async (c) => {
    const { b, transport: t } = await c.open(),
      seen = [];
    t.onMessage((x) => seen.push(x));
    await checkpoint();
    b.emit({ ...frame(reply(1, { tag: 1 })), future: { safe: true } });
    await checkpoint();
    assert.equal(seen[0].result.tag, 1);
  },
);
for (const [label, patch] of [
  ["kind", { kind: "future" }],
  ["version", { version: 2 }],
  ["json-number", { json: 7 }],
  ["json-null", { json: null }],
  ["json-missing", { json: undefined }],
  ["error-string", { kind: "closed", error: "bad" }],
  ["error-data-null", { kind: "closed", error: { ...failure(), data: null } }],
]) {
  add(
    "ER-BAD-EVENT-" + label,
    { mutation: label, patch },
    "transport_closed/transport invalid_ipc_frame, no Core frame delivery",
    "6.8.4",
    async (c) => {
      const { b, transport: t } = await c.open(),
        seen = [],
        causes = [];
      t.onMessage((x) => seen.push(x));
      t.onClose((e) => causes.push(e));
      await checkpoint();
      const event = { ...frame(reply(1, {})), ...patch };
      if (label === "json-missing") delete event.json;
      b.emit(event);
      await checkpoint();
      assert.deepEqual(seen, []);
      assert.equal(causes.length, 1);
      error(c, "transport_closed", "transport", "invalid_ipc_frame")(causes[0]);
    },
  );
}
for (const [label, json] of [
  ["syntax", "{"],
  ["nonobject", "null"],
  ["decoded-duplicate-key", '{"id":1,"ok":true,"result":{"x":1,"\\u0078":2}}'],
  ["unpaired-high-surrogate", '{"id":1,"ok":true,"result":{"x":"\\ud800"}}'],
  ["unpaired-low-surrogate", '{"id":1,"ok":true,"result":{"x":"\\udc00"}}'],
])
  add(
    "ER-RAW-INVALID-" + label,
    { json },
    "transport_closed/transport and zero Core frame delivery; exact reason left BER-Q02",
    "5.6.2/6.8.3 (same raw decoder)/BER-Q02",
    async (c) => {
      const { b, transport: t } = await c.open(),
        seen = [],
        causes = [];
      t.onMessage((x) => seen.push(x));
      t.onClose((e) => causes.push(e));
      await checkpoint();
      b.emit(frame(json));
      await checkpoint();
      assert.deepEqual(seen, []);
      assert.equal(causes.length, 1);
      error(c, "transport_closed", "transport")(causes[0]);
    },
  );
for (const count of [256, 257])
  add(
    "ER-CAP-FRAMES-" + count,
    {
      completeFrames: count,
      arrival: "inside start before actual first delivery",
    },
    count === 256
      ? "256 delivered FIFO without overflow"
      : "close overflow before any frame delivered",
    "5.6.5/6.8.3",
    async (c) => {
      const { b, transport: t } = await c.open(),
        seen = [],
        causes = [];
      b.onStart = () => {
        for (let i = 1; i <= count; i++) b.emit(frame(reply(i, { tag: i })));
      };
      t.onClose((e) => causes.push(e));
      t.onMessage((x) => seen.push(x.id));
      await checkpoint();
      if (count === 256) {
        assert.deepEqual(
          seen,
          Array.from({ length: 256 }, (_, i) => i + 1),
        );
        assert.deepEqual(causes, []);
      } else {
        assert.deepEqual(seen, []);
        assert.equal(causes.length, 1);
        error(
          c,
          "transport_closed",
          "transport",
          "prebind_buffer_overflow",
        )(causes[0]);
      }
    },
  );
for (const unit of ["a", "界"])
  for (const delta of [-1, 0, 1])
    add(
      `ER-CAP-BYTES-${unit}-${delta}`,
      { bytes: 4 * 1024 * 1024 + delta, unit, delimiterBytes: 0 },
      delta <= 0
        ? "at/below raw UTF8 cap delivered"
        : "one byte above cap closes before delivery",
      "5.6.5/6.8.3",
      async (c) => {
        const { b, transport: t } = await c.open(),
          seen = [],
          causes = [];
        b.onStart = () =>
          b.emit(frame(byteFrame(4 * 1024 * 1024 + delta, unit)));
        t.onClose((e) => causes.push(e));
        t.onMessage((x) => seen.push(x));
        await checkpoint();
        assert.equal(seen.length, delta <= 0 ? 1 : 0);
        assert.equal(causes.length, delta > 0 ? 1 : 0);
        if (delta > 0)
          error(
            c,
            "transport_closed",
            "transport",
            "prebind_buffer_overflow",
          )(causes[0]);
      },
    );
add(
  "ER-CAP-AFTER-DELIVERY",
  {},
  "first actual handler delivery lifts local prebind cap, later 4MiB+1 legal response delivered",
  "5.6.5/6.8.3",
  async (c) => {
    const { b, transport: t } = await c.open(),
      seen = [];
    t.onMessage((x) => seen.push(x));
    await checkpoint();
    b.emit(frame(reply(1, {})));
    await checkpoint();
    assert.equal(seen.length, 1);
    b.emit(frame(byteFrame(4 * 1024 * 1024 + 1)));
    await checkpoint();
    assert.equal(seen.length, 2);
    assert.equal(b.count("close"), 0);
  },
);
add(
  "ER-SEND-OWNING-JSON",
  {},
  "bound send emits JSON text for own session, nested mutation after send cannot change it",
  "6.8.3/5.6.2",
  async (c) => {
    const { b, transport: t } = await c.open();
    t.onMessage(() => {});
    const request = {
      id: 1,
      method: "inst.roots",
      snapshot: snapshot.snapshotId,
      params: { note: "界😀", extra: [1, 2] },
    };
    t.send(request);
    request.params.extra[0] = 99;
    assert.equal(b.sent.length, 1);
    assert.equal(b.sent[0].sessionId, SESSION);
    assert.equal(typeof b.sent[0].json, "string");
    assert.equal(/[\r\n]/u.test(b.sent[0].json), false);
    assert.deepEqual(JSON.parse(b.sent[0].json).params, {
      note: "界😀",
      extra: [1, 2],
    });
  },
);
for (const scalar of ["\ud800", "\udc00"])
  add(
    "ER-SEND-UNICODE-" + scalar.charCodeAt(0).toString(16),
    { unpairedSurrogate: scalar.charCodeAt(0) },
    "bad_request/client, no bridge send or replacement-character repair",
    "5.6.2/6.8.3",
    async (c) => {
      const { b, transport: t } = await c.open();
      t.onMessage(() => {});
      assert.throws(
        () =>
          t.send({
            id: 1,
            method: "inst.roots",
            snapshot: snapshot.snapshotId,
            params: { note: scalar },
          }),
        error(c, "bad_request"),
      );
      assert.equal(b.sent.length, 0);
    },
  );
for (const reason of [
  "ipc_unavailable",
  "renderer_gone",
  "document_navigated",
  "invalid_ipc_frame",
])
  add(
    "ER-DTO-" + reason,
    { reason },
    "local HierError retains exact JSON diagnostics, no DTO identity/remote stack transfer",
    "6.8.4",
    async (c) => {
      const { b, transport: t } = await c.open(),
        dto = { ...failure(reason), stack: "B_REMOTE_STACK_MUST_NOT_TRANSFER" },
        seen = [];
      t.onClose((e) => seen.push(e));
      b.emit(closed(dto));
      await checkpoint();
      assert.equal(seen.length, 1);
      error(c, "transport_closed", "transport", reason)(seen[0]);
      assert.equal(seen[0].message, dto.message);
      assert.deepEqual(seen[0].data, dto.data);
      assert.notEqual(seen[0], dto);
      assert.equal(seen[0].stack?.includes(dto.stack), false);
    },
  );
add(
  "ER-REJECT-SECOND-CLAIM",
  {},
  "second factory rejection must not release/close first claim or remove its receiver",
  "6.8.1/6.8.4",
  async (c) => {
    const b = c.bridge(),
      { transport: t } = await c.open(b),
      seen = [];
    t.onMessage((x) => seen.push(x.id));
    await checkpoint();
    b.outcomes.push({
      ok: false,
      error: {
        code: "bad_request",
        origin: "client",
        message: "already claimed",
        data: {},
      },
    });
    await assert.rejects(c.factory(b.bridge), error(c, "bad_request"));
    assert.equal(b.count("release"), 0);
    assert.equal(b.count("close"), 0);
    b.emit(frame(reply(1, {})));
    await checkpoint();
    assert.deepEqual(seen, [1]);
  },
);
add(
  "ER-SDK-HELLO-ROOTS",
  {},
  "real SDK receives original Core snapshot (not IPC sessionId), sends typed roots, returns original reply",
  "6.8.1/6.8.3",
  async (c) => {
    const { b, client } = await c.client();
    const p = client.roots();
    await checkpoint();
    assert.equal(b.sent.length, 1);
    const request = JSON.parse(b.sent[0].json);
    assert.equal(request.method, "inst.roots");
    assert.equal(request.snapshot, snapshot.snapshotId);
    b.emit(frame(reply(request.id, [instance])));
    assert.deepEqual(await p, {
      result: [instance],
      completeness: { status: "complete", reasons: [] },
    });
    assert.equal(client.snapshot.snapshotId, snapshot.snapshotId);
    assert.notEqual(client.snapshot.snapshotId, SESSION);
  },
);
for (const [token, accepted, value] of [
  ["1.0", true, 1],
  ["10e-1", true, 1],
  ["0.1e1", true, 1],
  ["4294967295", true, 4294967295],
  ["1.0000000000000001", false],
  ["0.99999999999999999", false],
  ["-1e-400", false],
  ["1.000000000000000000000000000000000001e0", false],
]) {
  add(
    "ER-SDK-NUMBER-" + token,
    { method: "inst.get", field: "childCount", rawToken: token },
    accepted
      ? "exact legal integer accepted"
      : "raw noninteger rejected protocol_error/client even if JSON.parse rounds",
    "5.6.2/6.8.3",
    async (c) => {
      const { b, client } = await c.client(),
        p = client.instance("i:0");
      p.catch(() => {});
      await checkpoint();
      const request = JSON.parse(b.sent[0].json);
      const result = JSON.stringify(instance).replace(
        '"childCount":1',
        '"childCount":' + token,
      );
      b.emit(
        frame(
          '{"id":' +
            request.id +
            ',"ok":true,"result":' +
            result +
            ',"completeness":{"status":"complete","reasons":[]}}',
        ),
      );
      if (accepted) assert.equal((await p).result.childCount, value);
      else await assert.rejects(p, error(c, "protocol_error"));
    },
  );
}
for (const code of ["bad_request", "not_found", "unsupported", "cancelled"])
  add(
    "ER-SDK-CORE-" + code,
    { code },
    "Core code/message/data retained; next independent request can succeed",
    "5.6.5/6.8.4",
    async (c) => {
      const { b, client } = await c.client(),
        p = client.instance("i:0");
      p.catch(() => {});
      await checkpoint();
      const request = JSON.parse(b.sent[0].json),
        dto = {
          code,
          message: "B raw Core error",
          data: { detail: [1, "界"], reason: "B_core" },
        };
      b.emit(frame(JSON.stringify({ id: request.id, ok: false, error: dto })));
      await assert.rejects(p, (e) => {
        error(c, code, "core")(e);
        assert.equal(e.message, dto.message);
        assert.deepEqual(e.data, dto.data);
        return true;
      });
      const next = client.roots();
      await checkpoint();
      const last = JSON.parse(b.sent.at(-1).json);
      b.emit(frame(reply(last.id, [])));
      assert.deepEqual((await next).result, []);
    },
  );
add(
  "ER-SDK-PENDING-CLOSE",
  {},
  "already ready remains settled; pending query rejects saved transport cause exactly once",
  "5.6.5/6.8.4",
  async (c) => {
    const { b, client } = await c.client(),
      p = client.roots();
    p.catch(() => {});
    let settlements = 0;
    p.then(
      () => settlements++,
      () => settlements++,
    );
    await checkpoint();
    b.emit(closed(failure("document_navigated")));
    await assert.rejects(
      p,
      error(c, "transport_closed", "transport", "document_navigated"),
    );
    b.emitLate(closed(failure("renderer_gone")));
    await checkpoint();
    assert.equal(settlements, 1);
    assert.deepEqual(await client.ready, snapshot);
  },
);
add(
  "ER-SDK-ILLEGAL-FIRST",
  {},
  "nonhello first frame followed by hello is not filtered into valid handshake",
  "5.6.1/5.6.5/6.8.3",
  async (c) => {
    const b = c.bridge();
    b.onStart = () => {
      b.emit(frame(reply(1, {})));
      b.emit(frame(hello));
    };
    const { transport } = await c.open(b),
      client = new c.sdk.HierClient(transport);
    try {
      await assert.rejects(client.ready, error(c, "protocol_error"));
    } finally {
      client.dispose();
    }
  },
);
