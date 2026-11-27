import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { publicEntry } from "../independent-electron-renderer/public-entry.mjs";
import { sdk, vm, product, deep } from "./harness.mjs";
import {
  leafText,
  topText,
  leafDeclaration,
  macroLeaf,
  macroTop,
  macroDeclaration,
  macroInvocation,
  byteRange,
} from "./core-fixture.mjs";
const active = new Set(),
  hash = (s) => createHash("sha256").update(s).digest("hex");
const result = (r) => {
  assert.deepEqual(r.completeness, { status: "complete", reasons: [] });
  return r.result;
};
export async function releaseCore() {
  const errors = [];
  for (const c of [...active])
    try {
      await c.close();
    } catch (e) {
      errors.push(e);
    }
  if (errors.length) throw new AggregateError(errors, "B Core cleanup");
}
export async function real(kind, withModel, fn) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "hier-b-candidates-fixture-"),
  );
  const macro = kind === "macro",
    lf = kind === "LF",
    convert = (s) => (lf ? s.replaceAll("\r\n", "\n") : s);
  const leaf = convert(macro ? macroLeaf : leafText),
    top = convert(macro ? macroTop : topText),
    leafName = macro ? "b_sc_macro.svh" : "b_sd_leaf.svh",
    topName = macro ? "b_sc_macro_top.sv" : "b_sd_top.sv";
  const rootName = macro ? "b_sc_macro_top" : "b_sd_top",
    declaration = convert(macro ? macroDeclaration : leafDeclaration),
    statement = macro ? macroInvocation : "assign q = d;";
  let c;
  try {
    await fs.writeFile(path.join(dir, leafName), leaf);
    await fs.writeFile(path.join(dir, topName), top);
    const { createProcessTransport } = await import(
      publicEntry(product, "@hier/client/node")
    );
    const wire = createProcessTransport({
      command: process.env.HIER_BIN,
      args: ["serve", path.join(dir, topName)],
    });
    wire.exited.catch(() => {});
    const client = new sdk.HierClient(wire, { cacheEntries: 0 });
    client.ready.catch(() => {});
    c = {
      wire,
      client,
      models: [],
      calls: [],
      dir,
      leaf,
      top,
      leafName,
      statement,
      declaration,
      receipts: [],
      withModel,
    };
    let closing;
    c.close = () =>
      (closing ??= (async () => {
        const errors = [];
        try {
          for (const m of c.models)
            try {
              m.dispose();
            } catch (e) {
              errors.push(e);
            }
          try {
            client.dispose();
          } catch (e) {
            errors.push(e);
          }
          try {
            wire.close();
          } catch (e) {
            errors.push(e);
          }
          try {
            assert.deepEqual(await wire.exited, { code: 0, signal: null });
          } catch (e) {
            errors.push(e);
          }
        } finally {
          active.delete(c);
        }
        if (errors.length) throw new AggregateError(errors, "B Core cleanup");
      })());
    active.add(c);
    c.snapshot = await client.ready;
    const roots = result(await client.roots());
    c.root = roots.find((x) => x.name === rootName);
    assert.ok(c.root);
    c.children = result(await client.children(c.root.ref, { limit: 64 })).items;
    assert.deepEqual(
      c.children.map((x) => x.name),
      macro ? ["west", "east"] : ["left", "right"],
    );
    const source = result(await client.source(c.children[0].ref, "definition"));
    c.file = source.file;
    c.filePath = source.path;
    c.query = {
      snapshotId: c.snapshot.snapshotId,
      file: c.file,
      line: byteRange(leaf, statement).start.line,
      col: byteRange(leaf, statement).start.column,
    };
    c.expected = [
      {
        ref: c.children[0].def,
        kind: "definition",
        ...byteRange(leaf, declaration),
      },
      ...c.children.map((x) => ({
        ref: x.ref,
        kind: "definition",
        ...byteRange(leaf, declaration),
      })),
    ];
    // Resolve process handles through independent public connectivity facts, not resolveSource output.
    for (const child of c.children) {
      const ports = result(await client.ports(child.ref)),
        q = ports.find((x) => x.name === "q");
      assert.ok(q);
      const drivers = result(
        await client.drivers({
          slice: { ref: q.ref },
          reach: "local",
          side: "inside",
        }),
      ).filter((x) => x.kind === "process");
      assert.equal(drivers.length, 1);
      assert.ok(drivers[0].ref);
      c.expected.push({
        ref: drivers[0].ref,
        kind: "statement",
        ...byteRange(leaf, statement),
      });
    }
    const original = client.resolveSource;
    client.resolveSource = function (...args) {
      const call = { args };
      c.calls.push(call);
      const p = Reflect.apply(original, this, args);
      p.then(
        (reply) => {
          call.reply = reply;
        },
        (error) => {
          call.error = error;
        },
      );
      return p;
    };
    c.newModel = (limit) => {
      const m = new vm.SourceCandidatesModel(client, { pageSize: limit });
      c.models.push(m);
      return m;
    };
    c.collect = async (query, limit) => {
      const rows = [];
      if (withModel) {
        const m = c.newModel(limit);
        await m.load(query);
        for (let i = 0; i < 16; i++) {
          if (!m.state.pages.at(-1).result.next) break;
          await m.loadMore();
        }
        assert.equal(m.state.status, "success");
        assert.equal(m.state.pages.at(-1).result.next, undefined);
        deep(m.state);
        for (const p of m.state.pages) {
          assert.ok(c.calls.some((x) => x.reply === p));
          rows.push(p);
        }
        m.dispose();
      } else {
        let cursor;
        for (let i = 0; i < 16; i++) {
          const p = await client.resolveSource(
            {
              file: query.file,
              line: query.line,
              ...(Object.hasOwn(query, "col") ? { col: query.col } : {}),
            },
            { limit, ...(cursor ? { cursor } : {}) },
          );
          rows.push(p);
          if (!p.result.next) break;
          assert.notEqual(p.result.next, cursor);
          cursor = p.result.next;
        }
        assert.equal(rows.at(-1).result.next, undefined);
      }
      for (const p of rows) {
        assert.ok(result(p).items.length <= limit);
        deep(p);
      }
      c.receipts.push({
        limit,
        pageCounts: rows.map((p) => p.result.items.length),
        items: rows
          .flatMap((p) => p.result.items)
          .map((h) => ({
            ref: h.ref,
            kind: h.kind,
            start: h.span.start,
            end: h.span.end,
          })),
      });
      return rows.flatMap((p) => p.result.items);
    };
    c.exact = (items) => {
      assert.deepEqual(
        items.map((h) => ({
          ref: h.ref,
          kind: h.kind,
          start: h.span.start,
          end: h.span.end,
        })),
        c.expected,
      );
      for (const h of items) {
        assert.equal(h.span.file, c.file);
        assert.equal(h.span.path, c.filePath);
        assert.equal(h.span.contentHash, hash(leaf));
      }
    };
    return await fn(c);
  } finally {
    try {
      if (c) await c.close();
    } finally {
      assert.ok(path.basename(dir).startsWith("hier-b-candidates-fixture-"));
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}
const definitions = [];
function define(id, input, expected, body) {
  definitions.push({
    id,
    group: "real-chain",
    input,
    expected,
    basis:
      "DESIGN §6.11/§5.5.6; B original HDL byte literals and independent connectivity refs",
    body,
  });
}
for (const kind of ["CRLF", "LF", "macro"])
  for (const limit of [1, 2, 200])
    define(
      "ordered-" + kind + "-" + limit,
      { kind, limit },
      "exact five overlapping definition/instance/process occurrences, independent spans/order/hash; each page bounded",
      async (c) => c.exact(await c.collect(c.query, limit)),
    );
define(
  "whole-line-empty-end",
  { kind: "CRLF", queries: 3 },
  "whole line same five; comment empty; statement half-open end excludes its two occurrences",
  async (c) => {
    const whole = { ...c.query };
    delete whole.col;
    c.exact(await c.collect(whole, 2));
    assert.deepEqual(await c.collect({ ...c.query, line: 1, col: 1 }, 1), []);
    const end = byteRange(c.leaf, c.statement).end,
      items = await c.collect(
        { ...c.query, line: end.line, col: end.column },
        2,
      );
    assert.deepEqual(
      items.map((h) => ({ ref: h.ref, kind: h.kind })),
      c.expected.slice(0, 3).map(({ ref, kind }) => ({ ref, kind })),
    );
  },
);
define(
  "disk-changed",
  { kind: "CRLF", mutation: "prepend and truncate" },
  "snapshot positions/hash and cursor sequence unchanged after disk modification",
  async (c) => {
    const first = await c.client.resolveSource(
      { file: c.file, line: c.query.line, col: c.query.col },
      { limit: 1 },
    );
    assert.ok(first.result.next);
    await fs.writeFile(
      path.join(c.dir, c.leafName),
      "// B replaced current disk; not snapshot\r\n",
    );
    c.exact(await c.collect(c.query, 2));
    const rest = await c.client.resolveSource(
      { file: c.file, line: c.query.line, col: c.query.col },
      { limit: 200, cursor: first.result.next },
    );
    assert.deepEqual(
      [first, ...[rest]]
        .flatMap((p) => p.result.items)
        .map((h) => ({
          ref: h.ref,
          kind: h.kind,
          start: h.span.start,
          end: h.span.end,
        })),
      c.expected,
    );
  },
);
define(
  "model-release",
  { kind: "CRLF" },
  "model dispose does not close borrowed SDK/Core; fresh direct SDK query succeeds",
  async (c) => {
    const m = c.newModel(1);
    await m.load(c.query);
    assert.equal(m.state.pages.length, 1);
    m.dispose();
    c.exact(
      await (async () => {
        const rows = [];
        let cursor;
        do {
          const r = await c.client.resolveSource(
            { file: c.file, line: c.query.line, col: c.query.col },
            { limit: 2, ...(cursor ? { cursor } : {}) },
          );
          rows.push(...r.result.items);
          cursor = r.result.next;
        } while (cursor);
        return rows;
      })(),
    );
  },
);
define(
  "cursor-binding-session",
  { kind: "CRLF", snapshots: 2 },
  "wire query binds col-presence/position and snapshot; new model rejects foreign snapshot then loads own first page",
  async (c) => {
    const first = await c.client.resolveSource(
      { file: c.file, line: c.query.line, col: c.query.col },
      { limit: 1 },
    );
    assert.ok(first.result.next);
    await assert.rejects(
      c.client.resolveSource(
        { file: c.file, line: c.query.line },
        { limit: 2, cursor: first.result.next },
      ),
      (e) => e.code === "bad_request",
    );
    await assert.rejects(
      c.client.resolveSource(
        { file: c.file, line: 1, col: 1 },
        { limit: 2, cursor: first.result.next },
      ),
      (e) => e.code === "bad_request",
    );
    await real("CRLF", false, async (other) => {
      assert.notEqual(other.snapshot.snapshotId, c.snapshot.snapshotId);
      await assert.rejects(
        other.client.resolveSource(
          { file: other.file, line: other.query.line, col: other.query.col },
          { limit: 2, cursor: first.result.next },
        ),
        (e) => e.code === "stale_cursor",
      );
      // The SDK control cannot create a model.
      if (c.withModel) {
        const m = other.newModel(2);
        await assert.rejects(
          m.load(c.query),
          (e) => e.code === "snapshot_mismatch",
        );
        await m.load(other.query);
        assert.equal(m.state.pages.length, 1);
        assert.equal(m.state.status, "success");
        m.dispose();
      }
      other.exact(await other.collect(other.query, 2));
    });
  },
);
export const coreCases = definitions.map(({ body, ...row }) => ({
  ...row,
  id: "SC-CORE-" + row.id,
  run: () => real(row.input.kind, true, body),
}));
export const sdkControls = definitions
  .filter((x) => x.id !== "model-release")
  .map(({ body, ...row }) => ({
    ...row,
    id: "SC-SDK-CONTROL-" + row.id,
    run: () => real(row.input.kind, false, body),
  }));
