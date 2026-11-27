// B realm controls, from DESIGN 5.6.5 and original B private functional contract.
// Only test event sequences and fixtures; FrameInbox/HierClient are real product modules.
import { HierClient, HierError } from "@hier/client";
import { FrameInbox } from "B-original-inbox";
export const globals = () => ({
  Buffer: typeof globalThis.Buffer,
  process: typeof globalThis.process,
  require: typeof globalThis.require,
  module: typeof globalThis.module,
  nativePromises: typeof Promise,
  microtasks: typeof queueMicrotask,
});
const cap = 4 * 1024 * 1024;
const tick = () => new Promise((resolve) => queueMicrotask(resolve));
const size = (value) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;
function packet(bytes) {
  const value = { future: "位😀é" };
  value.future += "a".repeat(bytes - size(value));
  if (size(value) !== bytes) throw new Error("B fixture byte count");
  return value;
}
function owner() {
  const seen = [];
  let overflows = 0;
  const box = new FrameInbox(() => {
    overflows++;
    box.close();
  });
  return {
    box,
    seen,
    get overflows() {
      return overflows;
    },
    push(value) {
      return box.push(value, size(value));
    },
  };
}
export async function fifo() {
  const o = owner();
  let returned = false,
    inStack = 0;
  for (let sequence = 0; sequence < 3; sequence++) o.push({ sequence });
  const off = o.box.bind((value) => {
    if (!returned) inStack++;
    o.seen.push(value.sequence);
  });
  returned = true;
  const synchronous = o.seen.length;
  o.push({ sequence: 3 });
  await tick();
  let duplicate;
  try {
    o.box.bind(() => {});
  } catch (error) {
    duplicate = {
      code: error.code,
      origin: error.origin,
      isHierError: error instanceof HierError,
    };
  }
  off();
  off();
  o.box.close();
  return { synchronous, inStack, seen: o.seen, duplicate };
}
export async function closeBeforeDelivery() {
  const o = owner();
  o.push({ sequence: 1 });
  const off = o.box.bind((value) => o.seen.push(value));
  o.box.close();
  await tick();
  off();
  off();
  o.box.close();
  return {
    seen: o.seen.length,
    overflows: o.overflows,
    latePush: o.push({ sequence: 2 }),
  };
}
export async function offBeforeDelivery() {
  const o = owner();
  o.push({ sequence: 1 });
  const off = o.box.bind((value) => o.seen.push(value));
  off();
  off();
  await tick();
  let duplicate;
  try {
    o.box.bind(() => {});
  } catch (error) {
    duplicate = error.code;
  }
  o.box.close();
  return { seen: o.seen.length, duplicate, bound: o.box.bound };
}
export async function frameCap(extra) {
  const o = owner(),
    accepted = [];
  for (let sequence = 0; sequence < 256 + extra; sequence++)
    accepted.push(o.push({ sequence }));
  const off = o.box.bind((value) => o.seen.push(value.sequence));
  await tick();
  const result = { accepted, seen: o.seen, overflows: o.overflows };
  off();
  o.box.close();
  return result;
}
export async function afterActualDelivery() {
  const o = owner(),
    off = o.box.bind((value) => o.seen.push(value));
  await tick(); // Empty drain does not relax the cap; original B27 covers that negative.
  o.push({ sequence: 1 });
  await tick();
  const large = packet(cap + 1),
    accepted = o.push(large);
  await tick();
  const result = {
    accepted,
    delivered: o.seen.length,
    bytes: size(o.seen[1]),
    overflows: o.overflows,
  };
  off();
  o.box.close();
  return result;
}
export async function sdkRoundTrip() {
  const o = owner(),
    closes = new Set(),
    sent = [];
  let closed = false;
  const transport = {
    onMessage: (f) => o.box.bind(f),
    onClose: (f) => {
      const token = { f };
      closes.add(token);
      return () => closes.delete(token);
    },
    send(frame) {
      sent.push(frame);
      queueMicrotask(() =>
        o.push({
          id: frame.id,
          ok: true,
          result: [],
          completeness: { status: "complete", reasons: [] },
        }),
      );
    },
    close() {
      if (closed) return;
      closed = true;
      o.box.close();
      for (const token of [...closes])
        queueMicrotask(() => {
          if (closes.has(token)) token.f();
        });
    },
  };
  const snapshot = {
    protocol: 2,
    schemaVersion: 7,
    snapshotId: "B-shared-realm",
    inputHash: "0123456789abcdef".repeat(4),
    inputHashComplete: true,
    frontend: { name: "slang", version: "B-original-public-fixture" },
    bodySharing: "fast",
    tops: [],
    definitionCount: 0,
    bodyCount: 0,
    indexState: "ready",
    openedAt: "2000-02-29T23:59:59.123Z",
    topCandidates: [],
  };
  o.push({
    event: "hello",
    protocol: 2,
    snapshot,
    capabilities: ["cancel", "progress"],
  });
  const client = new HierClient(transport);
  const ready = await client.ready;
  const reply = await client.roots();
  client.dispose();
  client.dispose();
  await tick();
  let disposed;
  try {
    await client.roots();
  } catch (error) {
    disposed = { code: error.code, origin: error.origin };
  }
  return {
    snapshotId: ready.snapshotId,
    rootCount: reply.result.length,
    complete: reply.completeness.status,
    methods: sent.map((x) => x.method),
    closed,
    remainingCloseSubscriptions: closes.size,
    disposed,
  };
}
