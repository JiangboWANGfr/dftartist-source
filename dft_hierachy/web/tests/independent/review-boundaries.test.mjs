// Independent B: DESIGN5.6.2/.5/.7 and C-approved Unicode policy (doc7903957).
// Raw numeric/escape tokens reach the real Node parser WITHOUT JSON.parse/stringify.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { HierClient, HierError } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
const producer = fileURLToPath(
  new URL("./fixtures/raw-wire-producer.mjs", import.meta.url),
);
const bounds = { timeout: 12000 };
const harness = async (promise) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise(
        (_, reject) =>
          (timer = setTimeout(
            () => reject(new Error("B harness guard: query remained pending")),
            5000,
          )),
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const scoped = (code, origin) => (error) => {
  assert.ok(error instanceof HierError);
  assert.equal(error.code, code);
  assert.equal(error.origin, origin);
  return true;
};
const badInteger = (error) => {
  assert.ok(error instanceof HierError);
  assert.ok(
    (error.code === "protocol_error" && error.origin === "client") ||
      (error.code === "transport_closed" && error.origin === "transport"),
    "invalid known integer must terminate, not resolve",
  );
  return true;
};
async function session(mode = "normal", token = "1", where = "value") {
  const raw = createProcessTransport({
    command: process.execPath,
    args: [producer, mode, token, where],
  });
  raw.exited.catch(() => {});
  const sends = [];
  const transport = {
    send: (value) => {
      sends.push(value);
      raw.send(value);
    },
    onMessage: (handler) => raw.onMessage(handler),
    onClose: (handler) => raw.onClose(handler),
    close: () => raw.close(),
  };
  const client = new HierClient(transport);
  try {
    await harness(client.ready);
  } catch (error) {
    client.dispose();
    await raw.exited.catch(() => {});
    throw error;
  }
  return {
    client,
    raw,
    sends,
    async close() {
      client.dispose();
      const exit = await raw.exited;
      assert.equal(exit.code, 0);
      assert.equal(exit.signal, null);
    },
  };
}
const idGood = ["1", "1.0", "1e0", "10e-1", "0.1e1"];
for (const token of idGood)
  test("B raw id exact integer accepts " + token, bounds, async () => {
    const s = await session("id", token);
    try {
      assert.equal((await harness(s.client.instance("i:0"))).result.ref, "i:0");
    } finally {
      await s.close();
    }
  });
const idBad = [
  "1.0000000000000001",
  "0.99999999999999999",
  "1.000000000000000000000000000000000001e0",
];
for (const token of idBad)
  test(
    "B raw id rejects noninteger rounded to pending id: " + token,
    bounds,
    async () => {
      const s = await session("id", token);
      try {
        await assert.rejects(harness(s.client.instance("i:0")), badInteger);
      } finally {
        await s.close();
      }
    },
  );
const countGood = [
  ["0", 0],
  ["-0", 0],
  ["0e999", 0],
  ["1.0", 1],
  ["10e-1", 1],
  ["0.1e1", 1],
  ["4294967295", 4294967295],
  ["4294967295.0", 4294967295],
  ["4.294967295e9", 4294967295],
];
for (const [token, value] of countGood)
  test("B raw nested known integer accepts " + token, bounds, async () => {
    const s = await session("count", token);
    try {
      assert.ok(
        (await harness(s.client.instance("i:0"))).result.childCount === value,
      );
    } finally {
      await s.close();
    }
  });
const countBad = [
  "1.0000000000000001",
  "0.99999999999999999",
  "1.99999999999999999",
  "9007199254740991.1",
  "9007199254740990.5",
  "1.000000000000000000000000000000000001e0",
  "1e-400",
  "-1e-400",
  "-1",
  "9007199254740992",
  "1e309",
];
for (const token of countBad)
  test("B raw nested known integer rejects " + token, bounds, async () => {
    const s = await session("count", token);
    try {
      await assert.rejects(harness(s.client.instance("i:0")), badInteger);
    } finally {
      await s.close();
    }
  });
// InstInfo.childCount is uint32. Diagnostics.errorCount is UInt (JS safe range).
for (const token of [
  "9007199254740991",
  "9007199254740991.0",
  "9.007199254740991e15",
])
  test("B raw nested UInt accepts safe maximum " + token, bounds, async () => {
    const s = await session("safe-count", token);
    try {
      assert.equal(
        (await harness(s.client.diagnostics())).result.errorCount,
        Number.MAX_SAFE_INTEGER,
      );
    } finally {
      await s.close();
    }
  });
for (const token of [
  "9007199254740991.1",
  "9007199254740990.5",
  "9007199254740992",
  "1e309",
  "1.0000000000000001",
])
  test(
    "B raw nested UInt rejects unsafe or noninteger " + token,
    bounds,
    async () => {
      const s = await session("safe-count", token);
      try {
        await assert.rejects(harness(s.client.diagnostics()), badInteger);
      } finally {
        await s.close();
      }
    },
  );
test(
  "B raw unknown extension fraction remains accepted, no global integer ban",
  bounds,
  async () => {
    const s = await session("fraction", "1.25");
    try {
      assert.equal((await harness(s.client.instance("i:0"))).result.ref, "i:0");
    } finally {
      await s.close();
    }
  },
);
const getterCases = [
  [
    "diagnostics.maxItems",
    (client, get) =>
      client.diagnostics({
        get maxItems() {
          return get();
        },
      }),
    1,
  ],
  [
    "definitions.limit",
    (client, get) =>
      client.definitions({
        get limit() {
          return get();
        },
      }),
    1,
  ],
  [
    "drivers.slice.ref",
    (client, get) =>
      client.drivers({
        slice: {
          get ref() {
            return get();
          },
        },
        reach: "local",
      }),
    "s:0:0",
  ],
];
for (const [name, call, value] of getterCases) {
  test("B parameter getter normal " + name, bounds, async () => {
    const s = await session();
    let reads = 0;
    try {
      await harness(
        call(s.client, () => {
          reads++;
          return value;
        }),
      );
      assert.ok(reads > 0);
      assert.equal(s.sends.length, 1);
    } finally {
      await s.close();
    }
  });
  test(
    "B dispose during parameter snapshot " +
      name +
      " settles disposed and sends nothing",
    bounds,
    async () => {
      const s = await session();
      try {
        const pending = call(s.client, () => {
          s.client.dispose();
          return value;
        });
        pending.catch(() => {});
        assert.equal(s.sends.length, 0);
        await assert.rejects(harness(pending), scoped("disposed", "client"));
        s.client.dispose();
        assert.equal(s.sends.length, 0);
      } finally {
        await s.close();
      }
    },
  );
}
test(
  "B abort during parameter getter settles cancelled and sends nothing",
  bounds,
  async () => {
    const s = await session(),
      abort = new AbortController();
    try {
      await assert.rejects(
        harness(
          s.client.diagnostics(
            {
              get maxItems() {
                abort.abort();
                return 1;
              },
            },
            abort.signal,
          ),
        ),
        scoped("cancelled", "client"),
      );
      assert.equal(s.sends.length, 0);
    } finally {
      await s.close();
    }
  },
);
test("B already disposed query cannot send or hang", bounds, async () => {
  const s = await session();
  try {
    s.client.dispose();
    await assert.rejects(
      harness(s.client.diagnostics({ maxItems: 1 })),
      scoped("disposed", "client"),
    );
    assert.equal(s.sends.length, 0);
  } finally {
    await s.close();
  }
});
const scalarGood = [
  ['"\\ud83d\\ude00"', "😀"],
  ['"\\u0000"', "\0"],
  ['"汉é😀"', "汉é😀"],
  ['"e\\u0301"', "e\u0301"],
];
const scalarBad = [
  '"\\ud800"',
  '"\\udc00"',
  '"\\udc00\\ud800"',
  '"\\ud800x"',
  '"\\ud800\\u0041"',
  '"\\ud800\\ud800"',
];
for (const [token, value] of scalarGood) {
  test(
    "B raw Unicode scalar preserves known name " + token,
    bounds,
    async () => {
      const s = await session("unicode", token, "name");
      try {
        assert.equal(
          (await harness(s.client.instance("i:0"))).result.name,
          value,
        );
      } finally {
        await s.close();
      }
    },
  );
  for (const where of ["key", "value"])
    test(
      "B raw Unicode scalar unknown " + where + " accepts " + token,
      bounds,
      async () => {
        const s = await session("unicode", token, where);
        try {
          assert.equal(
            (await harness(s.client.instance("i:0"))).result.ref,
            "i:0",
          );
        } finally {
          await s.close();
        }
      },
    );
}
for (const token of scalarBad)
  for (const where of ["name", "key", "value"])
    test("B raw Unicode rejects " + where + " " + token, bounds, async () => {
      const s = await session("unicode", token, where);
      try {
        await assert.rejects(harness(s.client.instance("i:0")), (error) => {
          scoped("transport_closed", "transport")(error);
          assert.equal(error.data.reason, "invalid_frame");
          return true;
        });
      } finally {
        await s.close();
      }
    });
for (const token of scalarBad) {
  const value = JSON.parse(token); // Deliberately JS invalid UTF-16 input, not a raw-wire rewrite.
  for (const where of ["known", "unknown", "key", "nested"])
    test(
      "B outbound Unicode rejects " + where + " " + token + " before send",
      bounds,
      async () => {
        const s = await session();
        try {
          const request =
            where === "known"
              ? s.client.resolvePath(value)
              : s.client.diagnostics(
                  where === "key"
                    ? { [value]: 1 }
                    : where === "nested"
                      ? { future: [{ v: value }] }
                      : { future: value },
                );
          await assert.rejects(
            harness(request),
            scoped("bad_request", "client"),
          );
          assert.equal(s.sends.length, 0);
          // Caller bad_request is local, not connection poisoning.
          assert.equal(
            (await harness(s.client.diagnostics())).result.errorCount,
            0,
          );
          assert.equal(s.sends.length, 1);
        } finally {
          await s.close();
        }
      },
    );
}
for (const [token, value] of scalarGood)
  test(
    "B outbound Unicode scalar/NUL preserved, no normalization " + token,
    bounds,
    async () => {
      const s = await session();
      try {
        await harness(s.client.resolvePath(value));
        assert.equal(s.sends[0].params.text, value);
      } finally {
        await s.close();
      }
    },
  );

class OwnedTransport {
  messages = [];
  closes = [];
  closed = false;
  owner = false;
  sent = [];
  onMessage(handler) {
    assert.equal(this.owner, false);
    this.owner = true;
    const token = { handler, live: true };
    this.messages.push(token);
    return () => (token.live = false);
  }
  onClose(handler) {
    const token = { handler, live: true, notified: false };
    this.closes.push(token);
    if (this.closed) this.notify(token);
    return () => (token.live = false);
  }
  notify(token) {
    queueMicrotask(() => {
      if (token.live && !token.notified) {
        token.notified = true;
        token.handler();
      }
    });
  }
  send(value) {
    assert.equal(this.closed, false);
    this.sent.push(value);
  }
  receive(value) {
    queueMicrotask(() => {
      if (!this.closed)
        for (const token of this.messages) if (token.live) token.handler(value);
    });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const token of this.closes) this.notify(token);
  }
}
async function controlled() {
  const transport = new OwnedTransport(),
    client = new HierClient(transport);
  client.ready.catch(() => {});
  transport.receive({
    event: "hello",
    protocol: 2,
    capabilities: ["cancel", "progress"],
    snapshot: {
      protocol: 2,
      schemaVersion: 7,
      snapshotId: "b-custom",
      inputHash: "a".repeat(64),
      inputHashComplete: true,
      frontend: { name: "slang", version: "12.0" },
      bodySharing: "fast",
      tops: [],
      topCandidates: [],
      definitionCount: 0,
      bodyCount: 0,
      indexState: "ready",
      openedAt: "2026-10-13T00:00:00.000Z",
    },
  });
  await harness(client.ready);
  return { client, transport };
}
for (const token of scalarBad)
  for (const where of ["key", "value"])
    test(
      "B custom Transport Unicode rejects " + where + " " + token,
      bounds,
      async () => {
        const { client, transport } = await controlled();
        try {
          const pending = client.diagnostics();
          pending.catch(() => {});
          const value = JSON.parse(token);
          transport.receive({
            id: transport.sent[0].id,
            ok: true,
            result: {
              errorCount: 0,
              warningCount: 0,
              items: [],
              truncated: false,
            },
            completeness: { status: "complete", reasons: [] },
            future: where === "key" ? { [value]: true } : { v: [value] },
          });
          await assert.rejects(
            harness(pending),
            scoped("protocol_error", "client"),
          );
          assert.equal(transport.closed, true);
        } finally {
          client.dispose();
        }
      },
    );
for (const [token, value] of scalarGood)
  test(
    "B custom Transport valid Unicode extension remains accepted " + token,
    bounds,
    async () => {
      const { client, transport } = await controlled();
      try {
        const pending = client.diagnostics();
        transport.receive({
          id: transport.sent[0].id,
          ok: true,
          result: {
            errorCount: 0,
            warningCount: 0,
            items: [],
            truncated: false,
          },
          completeness: { status: "complete", reasons: [] },
          future: { [value]: [value] },
        });
        assert.equal((await harness(pending)).result.errorCount, 0);
        assert.equal(transport.closed, false);
      } finally {
        client.dispose();
      }
    },
  );
