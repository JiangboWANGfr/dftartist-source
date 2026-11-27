import assert from "node:assert/strict";
import net from "node:net";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
export const checkpoint = () => new Promise(setImmediate);
export function queue() {
  const rows = [],
    waiters = [],
    used = new Set();
  let failure;
  return {
    rows,
    push(v) {
      const i = rows.push(v) - 1,
        w = waiters.find((w) => w.p(v));
      if (w) {
        waiters.splice(waiters.indexOf(w), 1);
        used.add(i);
        w.done(v);
      }
    },
    next(p = () => true) {
      const i = rows.findIndex((v, i) => !used.has(i) && p(v));
      if (i >= 0) {
        used.add(i);
        return Promise.resolve(rows[i]);
      }
      if (failure) return Promise.reject(failure);
      return new Promise((done, reject) => waiters.push({ p, done, reject }));
    },
    fail(e) {
      failure = e;
      for (const w of waiters.splice(0)) w.reject(e);
    },
  };
}
export async function producer() {
  const inbox = queue(),
    server = net.createServer(),
    sockets = new Set();
  let socket,
    sequence = 0,
    ready;
  server.on("connection", (s) => {
    socket = s;
    sockets.add(s);
    s.once("close", () => {
      sockets.delete(s);
      inbox.fail(Error("B producer control closed"));
    });
    createInterface({ input: s }).on("line", (line) => inbox.push(JSON.parse(line)));
  });
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  let closePromise;
  return {
    inbox,
    options: {
      command: process.execPath,
      args: [fileURLToPath(new URL("./producer.mjs", import.meta.url))],
      env: { ...process.env, B_HOST_PORT: String(server.address().port) },
      shutdownGraceMillis: 0,
    },
    ready: () => (ready ??= inbox.next((v) => v.ready)),
    async command(op, fields = {}) {
      await this.ready();
      const id = ++sequence;
      socket.write(JSON.stringify({ op, id, ...fields }) + "\n");
      if (op !== "exit") await inbox.next((v) => v.ack === id);
    },
    async bytes(bytes) {
      await this.command("bytes", { base64: Buffer.from(bytes).toString("base64") });
    },
    close() {
      return (closePromise ??= new Promise((done, reject) => {
        for (const s of sockets) s.destroy();
        server.close((e) => (e ? reject(e) : done()));
      }));
    },
  };
}
const active = new Set();
export async function releaseAll() {
  for (const close of [...active]) await close();
}
export async function withProcess(factory, fn) {
  const p = await producer();
  let transport;
  let closing;
  const close = () =>
    (closing ??= (async () => {
      if (transport) {
        transport.close();
        await transport.exited.catch(() => {});
      }
      await p.close();
      active.delete(close);
    })());
  active.add(close);
  try {
    transport = factory(p.options);
    transport.exited.catch(() => {});
    await p.ready();
    return await fn({ p, t: transport });
  } finally {
    await close();
  }
}
export function closed(t) {
  return new Promise((done) => t.onClose(done));
}
export function transportFailure(e, reason) {
  assert.equal(e.code, "transport_closed");
  assert.equal(e.origin, "transport");
  if (reason) assert.equal(e.data.reason, reason);
}
