import assert from "node:assert/strict";
import path from "node:path";
import { publicEntry } from "../independent-electron-renderer/public-entry.mjs";
import {
  Wire,
  rawSnapshot,
  observe,
  deep,
  tick,
} from "../independent-source-document/harness.mjs";
import { cases } from "./sdk-cases.mjs";
const P = process.env.HIER_B_PRODUCT_ROOT;
assert.ok(P && path.isAbsolute(P));
const sdk = await import(publicEntry(P, "@hier/client")),
  vm = await import(publicEntry(P, "@hier/viewmodel"));
const span = {
  file: "B-rk-file",
  path: "/B-rk-not-a-capability/尾.sv",
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 1, line: 1, column: 2 },
  contentHash: "0123456789abcdef".repeat(4),
};
const hit = (tag, extra = {}) => ({
  ref: "B opaque ref/尾",
  kind: "definition",
  span,
  ...(tag === undefined ? {} : { refKind: tag }),
  ...extra,
});
const complete = { status: "complete", reasons: [] };
const page = (items, next) => ({
  items,
  ...(next ? { next } : {}),
  B_extension: { preserved: [1, "尾"] },
});
const report = {
  kind: "B SourceRefKind real SDK/model controlled Transport NOT Core/UI",
  product: P,
  planned: cases.length,
  executed: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  blocked: 0,
  results: [],
  cleanupErrors: [],
  exitCode: 1,
};
const unhandled = [];
const rejection = (e) => unhandled.push(e);
process.on("unhandledRejection", rejection);
async function bounded(p) {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("B SDK facility watchdog, not SLA")),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
for (const row of cases) {
  const result = { ...row, pass: false };
  const wire = new Wire(),
    client = new sdk.HierClient(wire, { cacheEntries: 0 }),
    owned = [],
    commands = [];
  client.ready.catch(() => {});
  const watch = (p) => {
    const o = observe(p);
    commands.push(o);
    return o;
  };
  try {
    await bounded(
      (async () => {
        wire.emit({
          event: "hello",
          protocol: 2,
          snapshot: rawSnapshot("B-rk-snapshot"),
          capabilities: ["cancel", "progress"],
        });
        await client.ready;
        const mode = row.input.mode,
          query = { file: span.file, line: 1, col: 1 };
        if (mode === "model-pages" || mode === "invalid-model") {
          const model = new vm.SourceCandidatesModel(client, { pageSize: 1 });
          owned.push(model);
          const load = watch(
            model.load({ snapshotId: "B-rk-snapshot", ...query }),
          );
          const request = await wire.next("source.resolve");
          wire.ok(
            request,
            page(
              [hit(mode === "invalid-model" ? null : undefined)],
              mode === "model-pages" ? "B-rk-next" : undefined,
            ),
          );
          const outcome = await load.settled;
          if (mode === "invalid-model") {
            assert.equal(
              outcome.ok,
              false,
              "invalid tag must not publish candidate success",
            );
            assert.equal(outcome.error.code, "protocol_error");
            assert.equal(model.state.status, "failed");
            assert.equal(model.state.error.code, "protocol_error");
            assert.equal(wire.closed, true);
          } else {
            assert.equal(outcome.ok, true);
            const first = model.state.pages[0];
            assert.equal(
              Object.hasOwn(first.result.items[0], "refKind"),
              false,
            );
            deep(first);
            const more = watch(model.loadMore()),
              next = await wire.next("source.resolve");
            assert.equal(next.params.cursor, "B-rk-next");
            wire.ok(
              next,
              page([
                hit("definition", {
                  ref: "i:not-an-object-discriminator",
                  kind: "statement",
                  inst: "context",
                }),
              ]),
            );
            assert.equal((await more.settled).ok, true);
            assert.equal(model.state.pages[0], first);
            assert.equal(
              model.state.pages[1].result.items[0].refKind,
              "definition",
            );
            deep(model.state);
            assert.equal(wire.queries.length, 2);
          }
        } else if (mode === "concurrent") {
          const a = watch(client.resolveSource(query, { limit: 1 })),
            b = watch(client.resolveSource({ ...query, col: 2 }, { limit: 2 }));
          const qa = await wire.next(
              "source.resolve",
              (q) => q.params.col === 1,
            ),
            qb = await wire.next("source.resolve", (q) => q.params.col === 2);
          wire.ok(qb, page([hit("object")]));
          wire.ok(qa, page([hit("definition")]));
          assert.equal(
            (await a.settled).value.result.items[0].refKind,
            "definition",
          );
          assert.equal(
            (await b.settled).value.result.items[0].refKind,
            "object",
          );
          assert.equal(wire.queries.length, 2);
        } else {
          let first;
          if (mode === "invalid-page") {
            const before = watch(client.resolveSource(query, { limit: 1 })),
              q = await wire.next("source.resolve");
            wire.ok(q, page([hit()], "B-rk-next"));
            first = (await before.settled).value;
            deep(first);
          }
          const main = watch(
            client.resolveSource(query, {
              limit: 8,
              ...(first ? { cursor: "B-rk-next" } : {}),
            }),
          );
          const pending = mode.startsWith("invalid")
            ? watch(client.roots())
            : null;
          const request = await wire.next("source.resolve");
          let items =
            mode === "legacy"
              ? [hit()]
              : mode === "definition"
                ? [
                    hit("definition", {
                      ref: "i:object-looking",
                      kind: "statement",
                      inst: "B-context",
                    }),
                  ]
                : mode === "object"
                  ? [hit("object", { ref: "d:definition-looking" })]
                  : mode === "mixed"
                    ? [hit(), hit("definition"), hit("object")]
                    : mode === "empty"
                      ? []
                      : mode === "invalid-item"
                        ? [hit("object"), hit(null)]
                        : mode === "invalid"
                          ? [hit(row.input.value)]
                          : mode === "invalid-page"
                            ? [hit("unknown")]
                            : [hit("object")];
          const partial =
            mode === "partial"
              ? {
                  status: "partial",
                  reasons: [{ code: "indexing", detail: "B pending index" }],
                }
              : complete;
          const sent = page(
            items,
            mode === "partial" ? "B-rk-partial" : undefined,
          );
          wire.ok(request, sent, partial);
          const outcome = await main.settled;
          if (mode.startsWith("invalid")) {
            result.actualPrimary = {
              accepted: outcome.ok,
              errorCode: outcome.ok ? null : outcome.error.code,
            };
            assert.equal(
              outcome.ok,
              false,
              "invalid tag must produce protocol_error rather than be accepted as extension",
            );
            assert.equal(outcome.error.code, "protocol_error");
            assert.equal(outcome.error.origin, "client");
            const other = await pending.settled;
            assert.equal(other.ok, false);
            assert.equal(other.error.code, "protocol_error");
            assert.equal(wire.closed, true);
            assert.equal(wire.messages.size, 0);
            assert.equal(wire.closes.size, 0);
            if (first) {
              assert.equal(
                Object.hasOwn(first.result.items[0], "refKind"),
                false,
              );
              deep(first);
            }
          } else {
            assert.equal(outcome.ok, true);
            assert.deepEqual(outcome.value, {
              result: sent,
              completeness: partial,
            });
            deep(outcome.value);
            assert.equal(wire.closed, false);
            assert.equal(wire.queries.length, 1);
            if (mode === "legacy")
              assert.equal(
                Object.hasOwn(outcome.value.result.items[0], "refKind"),
                false,
              );
          }
        }
      })(),
    );
    result.pass = true;
  } catch (error) {
    result.error = String(error.stack ?? error);
  } finally {
    const cleanup = async (step, action) => {
      try {
        await action();
      } catch (error) {
        report.cleanupErrors.push({ id: row.id, step, error: String(error) });
        result.pass = false;
      }
    };
    for (const m of owned) await cleanup("model.dispose", () => m.dispose());
    await cleanup("client.dispose", () => client.dispose());
    await cleanup("wire.close", () => wire.close());
    await cleanup("release facility waiters", () => {
      for (const waiter of wire.waits) waiter.resolve(undefined);
      wire.waits = [];
    });
    await cleanup("pending settle exactly once", async () => {
      await bounded(Promise.all(commands.map((o) => o.settled)));
      for (const o of commands) assert.equal(o.count, 1);
    });
    await cleanup("transport listeners", () => {
      assert.equal(wire.messages.size, 0);
      assert.equal(wire.closes.size, 0);
      assert.equal(wire.closed, true);
    });
    await cleanup("unhandled rejection", async () => {
      await tick();
      assert.equal(unhandled.length, 0);
    });
  }
  report.executed++;
  report[result.pass ? "passed" : "failed"]++;
  report.results.push(result);
}
process.off("unhandledRejection", rejection);
report.exitCode = report.failed || report.cleanupErrors.length ? 1 : 0;
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.exitCode;
