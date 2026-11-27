import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";

const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must name this checkout's actual Core");
const file = fileURLToPath(new URL("../../../core/tests/fixtures/a_m7/source-window/20-top.sv", import.meta.url));
for (const perInstance of [false, true]) {
  test(`A source range windows preserve all real SDK occurrences (${perInstance ? "per instance" : "shared"})`,
    { timeout: 20000 }, async (t) => {
      const transport = createProcessTransport({ command: resolve(command),
        args: ["serve", file, "--top", "source_top", "-I", dirname(file), ...(perInstance ? ["--per-instance-bodies"] : [])] });
      const client = new HierClient(transport, { cacheEntries: 0 });
      t.after(async () => { client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null }); });
      await client.ready;
      async function collect(span) {
        const items = [];
        let cursor;
        let pages = 0;
        do {
          const reply = await client.resolveSource({ file: span.file, line: span.start.line, col: span.start.column },
            { limit: [1, 7, 3][pages++ % 3], ...(cursor === undefined ? {} : { cursor }) });
          assert.equal(reply.completeness.status, "complete");
          assert.ok(reply.result.items.length <= [1, 7, 3][(pages - 1) % 3]);
          items.push(...reply.result.items);
          const next = reply.result.next;
          if (next !== undefined) assert.notEqual(next, cursor);
          cursor = next;
          assert.ok(pages < 100);
        } while (cursor !== undefined);
        const keys = items.map((hit) => JSON.stringify([hit.ref, hit.kind, hit.span]));
        assert.equal(new Set(keys).size, keys.length);
        return items;
      }
      const root = (await client.roots()).result[0];
      const wrappers = (await client.children(root.ref)).result.items;
      assert.equal(wrappers.length, 2);
      const leaves = [];
      for (const wrapper of wrappers) leaves.push(...(await client.children(wrapper.ref)).result.items);
      assert.equal(leaves.length, 8);
      const wrapperSpan = (await client.source(wrappers[0].ref, "definition")).result;
      const wrapperHits = await collect(wrapperSpan);
      assert.deepEqual(wrapperHits.map((hit) => hit.ref), [wrappers[0].def, ...wrappers.map((item) => item.ref)]);
      assert.equal(wrapperHits[0].refKind, "definition");
      assert.ok(wrapperHits.slice(1).every((hit) => hit.refKind === "object"));
      const leafSpan = (await client.source(leaves[0].ref, "definition")).result;
      const leafHits = await collect(leafSpan);
      assert.deepEqual(leafHits.map((hit) => hit.ref), [leaves[0].def, ...leaves.map((item) => item.ref)]);
      const instantiation = (await client.source(leaves[0].ref, "instantiation")).result;
      const childHits = await collect(instantiation);
      for (const leaf of leaves) assert.ok(childHits.some((hit) => hit.ref === leaf.ref && hit.kind === "instantiation"));
      const expectedSignals = [];
      let macroSpan;
      for (const leaf of leaves) {
        const signals = (await client.signals(leaf.ref)).result.items.filter((item) => item.name === "left" || item.name === "right");
        assert.equal(signals.length, 2);
        expectedSignals.push(...signals.map((item) => item.ref));
        macroSpan ??= (await client.source(signals[0].ref, "definition")).result;
      }
      const macroHits = await collect(macroSpan);
      for (const ref of expectedSignals) assert.ok(macroHits.some((hit) => hit.ref === ref && hit.kind === "definition"));
      const first = await client.resolveSource({ file: macroSpan.file, line: macroSpan.start.line, col: macroSpan.start.column }, { limit: 1 });
      assert.ok(first.result.next);
      await assert.rejects(client.resolveSource({ file: wrapperSpan.file, line: macroSpan.start.line, col: macroSpan.start.column }, { cursor: first.result.next, limit: 3 }),
        (error) => error.code === "bad_request" && error.origin === "core");
      const stopped = new AbortController(); stopped.abort();
      await assert.rejects(client.resolveSource({ file: macroSpan.file, line: macroSpan.start.line, col: macroSpan.start.column }, { cursor: first.result.next, limit: 3 }, stopped.signal),
        (error) => error.code === "cancelled");
      assert.equal((await client.resolveSource({ file: macroSpan.file, line: macroSpan.start.line, col: macroSpan.start.column }, { cursor: first.result.next, limit: 3 })).result.items.length, 3);
      client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null });
      assert.equal(leafHits.length, 9); assert.equal(expectedSignals.length, 16);
    });
}
