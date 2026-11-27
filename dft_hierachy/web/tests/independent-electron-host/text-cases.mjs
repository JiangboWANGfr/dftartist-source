import assert from "node:assert/strict";
import { withProcess, closed, transportFailure, checkpoint, queue } from "./scope.mjs";
import { hello, reply, byteFrame } from "../independent-electron-renderer/fixture.mjs";
export const cases = [];
const add = (id, input, expected, run) =>
  cases.push({
    id: "BPT-" + id,
    input,
    expected,
    basis: "DESIGN §6.8.3 + §5.6.5; original B renderer/M4 bytes",
    run,
  });
add(
  "raw-text",
  { line: hello + "  \r\n" },
  "raw JSON content preserves whitespace, excludes CRLF; not stringify(parsed)",
  async ({ factory }) =>
    withProcess(factory, async ({ p, t }) => {
      const q = queue();
      t.onMessage((v) => q.push(v));
      await p.bytes(hello + "  \r\n");
      assert.equal(await q.next(), hello + "  ");
    }),
);
for (const token of ["1e0", "1.0000000000000001"]) {
  const raw = reply(1, { future: 0 }).replace('"future":0', '"future":' + token);
  add(
    "token-" + token,
    { raw },
    "preserve original numeric token in raw text (no IPC object clone)",
    async ({ factory }) =>
      withProcess(factory, async ({ p, t }) => {
        const q = queue();
        t.onMessage((v) => q.push(v));
        await p.bytes(raw + "\n");
        assert.equal(await q.next(), raw);
      }),
  );
}
for (const [kind, bytes] of [
  ["duplicate", Buffer.from('{"id":1,"\\u0069d":1,"ok":true,"result":[]}\n')],
  ["unicode", Buffer.from('{"x":"\\ud800"}\n')],
  ["utf8", Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125, 10])],
  ["json", Buffer.from("{]\n")],
]) {
  add(
    "receive-" + kind,
    { hex: bytes.toString("hex") },
    "close transport, zero message delivery",
    async ({ factory }) =>
      withProcess(factory, async ({ p, t }) => {
        let n = 0;
        t.onMessage(() => n++);
        const end = closed(t);
        await p.bytes(bytes);
        transportFailure(await end);
        await t.exited;
        assert.equal(n, 0);
      }),
  );
}
add(
  "send-raw",
  {
    json: '{"id":1e0,"method":"inst.roots","snapshot":"B-electron-renderer-snapshot","params":{}}',
  },
  "one exact original request line written to child",
  async ({ factory }) =>
    withProcess(factory, async ({ p, t }) => {
      t.onMessage(() => {});
      const raw =
        '{"id":1e0,"method":"inst.roots","snapshot":"B-electron-renderer-snapshot","params":{}}';
      t.send(raw);
      assert.equal((await p.inbox.next((v) => v.stdin !== undefined)).stdin, raw);
    }),
);
for (const json of [
  '{"id":1,"method":"inst.roots","snapshot":"B-electron-renderer-snapshot","params":{}}\n',
  '{"id":1,"method":"inst.roots","snapshot":"B-electron-renderer-snapshot","params":{}}\r',
]) {
  add(
    "separator-" + (json.endsWith("\n") ? "LF" : "CR"),
    { json },
    "reject literal NDJSON separator; no child stdin line",
    async ({ factory }) =>
      withProcess(factory, async ({ p, t }) => {
        t.onMessage(() => {});
        assert.throws(() => t.send(json));
        await checkpoint();
        assert.equal(p.inbox.rows.filter((v) => v.stdin !== undefined).length, 0);
      }),
  );
}
for (const n of [256, 257])
  add(
    "frames-" + n,
    { count: n },
    "256 retained in order; 257 closes/clears before receiver",
    async ({ factory }) =>
      withProcess(factory, async ({ p, t }) => {
        const end = closed(t);
        await p.bytes(Array.from({ length: n }, (_, i) => reply(i + 1, [])).join("\n") + "\n");
        if (n === 257) {
          transportFailure(await end, "prebind_buffer_overflow");
          await t.exited;
          let count = 0;
          t.onMessage(() => count++);
          await checkpoint();
          assert.equal(count, 0);
        } else {
          const q = queue();
          t.onMessage((v) => q.push(v));
          await q.next((v) => v === reply(n, []));
          assert.deepEqual(
            q.rows,
            Array.from({ length: n }, (_, i) => reply(i + 1, [])),
          );
        }
      }),
  );
for (const extra of [0, 1])
  add(
    "bytes-" + extra,
    { bytes: 4194304 + extra },
    "exact raw UTF8 cap accepted, +1 closes with prebind_buffer_overflow",
    async ({ factory }) =>
      withProcess(factory, async ({ p, t }) => {
        const end = closed(t),
          raw = byteFrame(4194304 + extra, "é");
        await p.bytes(raw + "\n");
        if (extra) {
          transportFailure(await end, "prebind_buffer_overflow");
          await t.exited;
        } else {
          const q = queue();
          t.onMessage((v) => q.push(v));
          assert.equal(await q.next(), raw);
        }
      }),
  );
add(
  "close-before-bind",
  {},
  "queued hello cleared; late close async and send terminal precedence; second receiver denied",
  async ({ factory }) =>
    withProcess(factory, async ({ p, t }) => {
      await p.bytes(hello + "\n");
      t.close();
      await t.exited;
      let sync = true;
      const end = new Promise((done) =>
        t.onClose((e) => {
          assert.equal(sync, false);
          done(e);
        }),
      );
      let count = 0;
      const off = t.onMessage(() => count++);
      assert.equal(count, 0);
      sync = false;
      await end;
      await checkpoint();
      assert.equal(count, 0);
      assert.throws(
        () => t.onMessage(() => {}),
        (e) => e.code === "bad_request",
      );
      off();
      off();
      assert.throws(
        () => t.send("{}"),
        (e) => e.code === "transport_closed",
      );
    }),
);
