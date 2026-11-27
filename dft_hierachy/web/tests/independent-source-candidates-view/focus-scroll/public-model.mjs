// B controlled Transport: legal protocol frames and original public models only.
export const text = ("0123456789abcdef".repeat(6) + "\n").repeat(80),
  complete = Object.freeze({ status: "complete", reasons: [] });
const check = (x, m) => {
  if (!x) throw Error(m);
};
export async function ready(
  { HierClient, SourceNavigationModel, SelectionModel },
  { empty = false } = {},
) {
  const hash = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
      ),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join(""),
    span = {
      file: "B41/focus",
      path: "/B41/focus-scroll.sv",
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: text.length, line: 81, column: 1 },
      contentHash: hash,
    },
    messages = new Set(),
    closes = new Set(),
    sent = [],
    claimed = new Set(),
    waits = [],
    owned = [];
  let closed = false,
    page = 0;
  const emit = (v) => {
      if (!closed)
        for (const f of [...messages])
          if (messages.has(f)) f(structuredClone(v));
    },
    ok = (q, result) =>
      emit({ id: q.id, ok: true, result, completeness: complete });
  const wire = {
    onMessage(f) {
      messages.add(f);
      return () => messages.delete(f);
    },
    onClose(f) {
      closes.add(f);
      return () => closes.delete(f);
    },
    send(v) {
      check(!closed, "live B41 wire");
      const q = structuredClone(v);
      sent.push(q);
      const i = waits.findIndex((w) => w.method === q.method);
      if (i >= 0) {
        claimed.add(q);
        waits.splice(i, 1)[0].resolve(q);
      }
      if (q.method === "obj.source") queueMicrotask(() => ok(q, span));
      if (q.method === "source.read")
        queueMicrotask(() =>
          ok(q, { text, contentHash: hash, matchesSnapshot: true }),
        );
    },
    close() {
      if (closed) return;
      closed = true;
      for (const w of waits.splice(0)) w.resolve(null);
      for (const f of [...closes]) f(Error("B41 wire closed"));
    },
  };
  const client = new HierClient(wire, { cacheEntries: 0 });
  client.ready.catch(() => {});
  emit({
    event: "hello",
    protocol: 2,
    capabilities: ["cancel", "progress"],
    snapshot: {
      protocol: 2,
      schemaVersion: 7,
      snapshotId: "B41/snapshot",
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
  const n = new SourceNavigationModel(client, { pageSize: 4 }),
    s = new SelectionModel({ snapshotId: n.snapshotId }),
    c = {
      client,
      n,
      s,
      sent,
      owned,
      messages,
      closes,
      span,
      ok,
      waits,
      hostRecords: [],
    };
  c.next = (method) => {
    const q = sent.find((q) => q.method === method && !claimed.has(q));
    if (q) {
      claimed.add(q);
      return Promise.resolve(q);
    }
    return new Promise((resolve) => waits.push({ method, resolve }));
  };
  const items = (count, start) =>
    Array.from({ length: count }, (_, i) => ({
      ref: "B41:row-" + (start + i),
      kind: "definition",
      ...(start + i === 39 ? {} : { refKind: "object" }),
      span,
    }));
  c.fill = (q, count = 2, next = true) => {
    check(q, "actual source.resolve request");
    check(q.params.limit === 4, "public pageSize option maps to wire limit4");
    const start = page++ * 2;
    ok(q, {
      items: items(count, start),
      ...(next ? { next: "B41/cursor/" + page } : {}),
    });
  };
  c.append = async () => {
    const at = c.tap?.records.length;
    const p = n.loadMore();
    p.catch(() => {});
    owned.push(p);
    if (c.tap) {
      const r = c.tap.records[at];
      check(
        r?.name === "loadMore" &&
          r.receiver === n &&
          r.value === p &&
          r.args.length === 0,
        "exact host loadMore record",
      );
      c.hostRecords.push(r);
    }
    const q = await c.next("source.resolve");
    c.fill(q);
    await p;
    return n.state.candidates.state.pages.at(-1);
  };
  c.reload = async (afterPending) => {
    const at = c.tap?.records.length;
    const p = n.reloadCandidates();
    p.catch(() => {});
    owned.push(p);
    if (c.tap) {
      const r = c.tap.records[at];
      check(
        r?.name === "reloadCandidates" &&
          r.receiver === n &&
          r.value === p &&
          r.args.length === 0,
        "exact host reload record",
      );
      c.hostRecords.push(r);
    }
    const q = await c.next("source.resolve");
    check(
      n.state.candidates.state.status === "pending" &&
        n.state.candidates.state.pages.length === 0,
      "actual pending and cleared page chain",
    );
    if (afterPending) await afterPending();
    c.fill(q, 1, false);
    await p;
    return n.state.candidates.state.pages[0];
  };
  c.close = async () => {
    const errors = [];
    for (const [label, fn] of [
      ["navigation", () => n.dispose()],
      ["selection", () => s.dispose()],
      ["client", () => client.dispose()],
      ["wire", () => wire.close()],
    ])
      try {
        fn();
      } catch (error) {
        errors.push({ label, error });
      }
    await Promise.allSettled(owned);
    if (messages.size || closes.size || waits.length)
      errors.push({ label: "retained-fixture-subscriptions" });
    return errors;
  };
  try {
    await n.load("B41/source", "definition");
    c.document = n.state.document.data;
    const p = n.locate(c.document, 0);
    p.catch(() => {});
    owned.push(p);
    c.fill(await c.next("source.resolve"), empty ? 0 : 2, !empty);
    await p;
    if (!empty) for (let i = 1; i < 20; i++) await c.append();
    c.before = s.current;
    c.sentBefore = sent.length;
    c.pages = n.state.candidates.state.pages;
    check(c.pages.length === (empty ? 1 : 20), "original page count");
    check(
      c.pages.flatMap((p) => p.result.items).length === (empty ? 0 : 40),
      "legal forty hits",
    );
    return c;
  } catch (error) {
    await c.close();
    throw error;
  }
}
export async function modelControl(classes, mode) {
  const c = await ready(classes, { empty: mode === "empty" });
  try {
    check(
      c.document.content.result.text === text,
      "actual complete source document",
    );
    if (mode === "append") {
      const first = c.pages[0];
      await c.append();
      check(
        c.n.state.candidates.state.pages[0] === first,
        "append retains original first page",
      );
      check(c.n.state.candidates.state.pages.length === 21, "one new page");
    }
    check(c.s.current === c.before && !c.s.canGoBack, "no selection/history");
    return {
      id: "B41-model-" + mode,
      pass: true,
      candidateUI: false,
      pages: c.n.state.candidates.state.pages.length,
      items: c.n.state.candidates.state.pages.flatMap((p) => p.result.items)
        .length,
    };
  } finally {
    check((await c.close()).length === 0, "all real model resources released");
  }
}
