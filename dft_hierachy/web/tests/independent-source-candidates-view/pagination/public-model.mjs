// B fixture only: legal wire, real injected public SDK/classes. Browser and Node share this input.
export const complete = Object.freeze({ status: "complete", reasons: [] });
export const partial = Object.freeze({
  status: "partial",
  reasons: [{ code: "unsupported", at: "B33/raw-at", detail: "B33 原因<&>" }],
});
export const cursor = "B33 original cursor 中文";
export const check = (x, message) => {
  if (!x) throw Error(message);
};
export const equal = (a, b, message) => check(Object.is(a, b), message);
const hash = "0123456789abcdef".repeat(4);
const span = {
  file: "B33/file",
  path: "/B33/not-a-path-capability.sv",
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 1, line: 1, column: 2 },
  contentHash: hash,
};
const item = {
  ref: "B33:opaque<&>",
  kind: "definition",
  refKind: "object",
  span,
};
export async function context({
  HierClient,
  SourceNavigationModel,
  SelectionModel,
}) {
  const messages = new Set(),
    closes = new Set(),
    sent = [],
    claimed = new Set(),
    waits = [];
  let closed = false;
  const emit = (value) => {
    if (!closed)
      for (const f of [...messages])
        if (messages.has(f)) f(structuredClone(value));
  };
  const ok = (q, result, completeness = complete) =>
    emit({ id: q.id, ok: true, result, completeness });
  const wire = {
    onMessage(f) {
      messages.add(f);
      return () => messages.delete(f);
    },
    onClose(f) {
      closes.add(f);
      return () => closes.delete(f);
    },
    send(value) {
      check(!closed, "live fixture transport");
      const q = structuredClone(value);
      sent.push(q);
      const i = waits.findIndex(
        (w) => w.method === q.method && !claimed.has(q),
      );
      if (i >= 0) {
        claimed.add(q);
        waits.splice(i, 1)[0].resolve(q);
      }
      if (q.method === "obj.source") queueMicrotask(() => ok(q, span));
      if (q.method === "source.read")
        queueMicrotask(() =>
          ok(q, { text: "abc", contentHash: hash, matchesSnapshot: true }),
        );
    },
    close() {
      if (closed) return;
      closed = true;
      for (const w of waits.splice(0)) w.resolve(null);
      for (const f of [...closes]) f(Error("B33 transport closed"));
    },
  };
  // The scope owns each resource as soon as its constructor returns, not only
  // after a complete context can be handed back to its caller.
  let client, n, s, closing;
  const owned = [];
  const close = () => {
    if (!closing) {
      let resolveClose, rejectClose;
      // Publish the one closing operation before synchronous dispose callbacks
      // can reenter it; retain the original synchronous cleanup start.
      closing = new Promise((resolve, reject) => {
        resolveClose = resolve;
        rejectClose = reject;
      });
      (async () => {
        const errors = [];
        for (const [label, fn] of [
          ["navigation", () => n?.dispose()],
          ["selection", () => s?.dispose()],
          ["client", () => client?.dispose()],
          ["wire", () => wire.close()],
        ])
          try {
            fn();
          } catch (error) {
            errors.push({ label, error });
          }
        await Promise.allSettled(owned);
        if (messages.size || closes.size)
          errors.push({
            label: "wire-subscriptions",
            error: Error("subscriptions retained"),
          });
        return errors;
      })().then(resolveClose, rejectClose);
    }
    return closing;
  };
  try {
    client = new HierClient(wire, { cacheEntries: 0 });
    client.ready.catch(() => {});
    emit({
      event: "hello",
      protocol: 2,
      capabilities: ["cancel", "progress"],
      snapshot: {
        protocol: 2,
        schemaVersion: 7,
        snapshotId: "B33/snapshot",
        inputHash: hash,
        inputHashComplete: true,
        frontend: { name: "slang", version: "B-independent" },
        bodySharing: "fast",
        tops: [],
        definitionCount: 0,
        bodyCount: 0,
        indexState: "ready",
        openedAt: "2000-01-01T00:00:00.000Z",
        topCandidates: [],
      },
    });
    await client.ready;
    n = new SourceNavigationModel(client, { pageSize: 4 });
    s = new SelectionModel({ snapshotId: n.snapshotId });
    const c = {
      n,
      s,
      client,
      sent,
      messages,
      closes,
      owned,
      ok,
      queries: () => sent.filter((q) => q.method === "source.resolve"),
      next(method) {
        const q = sent.find((q) => q.method === method && !claimed.has(q));
        if (q) {
          claimed.add(q);
          return Promise.resolve(q);
        }
        return new Promise((resolve) => waits.push({ method, resolve }));
      },
      async head(status, next) {
        await n.load("B33/source", "definition");
        const p = n.locate(n.state.document.data, 0);
        p.catch(() => {});
        owned.push(p);
        const q = await c.next("source.resolve");
        check(q, "head request");
        ok(
          q,
          { items: [item], ...(next ? { next: cursor } : {}) },
          status === "partial" ? partial : complete,
        );
        await p;
        return n.state.candidates.state.pages[0];
      },
      reply(q, status, next, empty = false) {
        check(q, "live request");
        ok(
          q,
          {
            items: empty ? [] : [item],
            ...(next ? { next: cursor + " tail" } : {}),
          },
          status === "partial" ? partial : complete,
        );
      },
      close,
    };
    return c;
  } catch (error) {
    const errors = await close();
    if (errors.length)
      throw new AggregateError(
        [error, ...errors.map((entry) => entry.error)],
        "B fixture construction and owned resource cleanup failed",
        { cause: error },
      );
    throw error;
  }
}
