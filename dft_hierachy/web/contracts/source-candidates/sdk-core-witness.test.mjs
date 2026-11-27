// Existing SDK/Core capability evidence, not a SourceCandidatesModel oracle.
// All filesystem changes are confined to temporary copies of A's Source fixture.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { HierClient, HierError } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";

const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must identify the actual Core artifact");
const names = ["source-document.sv", "source-document-leaf.svh"];
const originals = await Promise.all(
  names.map((name) =>
    readFile(new URL(`../source-document/${name}`, import.meta.url)),
  ),
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
console.log(
  JSON.stringify({
    coreSha256: hash(await readFile(command)),
    fixtures: Object.fromEntries(
      names.map((name, i) => [name, hash(originals[i])]),
    ),
    sourceCandidatesModelExecuted: false,
  }),
);
const bounds = { timeout: 20000 }; // Harness bound, not a product SLA.
function complete(reply) {
  assert.deepEqual(reply.completeness, { status: "complete", reasons: [] });
  assert.ok(Object.isFrozen(reply));
  return reply.result;
}
function coreError(code) {
  return (error) => {
    assert.ok(error instanceof HierError);
    assert.equal(error.origin, "core");
    assert.equal(error.code, code);
    return true;
  };
}
async function fixture(t, newline = "\n") {
  const folder = await realpath(
    await mkdtemp(join(tmpdir(), "hier-a-candidates-")),
  );
  const paths = names.map((name) => join(folder, name));
  const texts = originals.map((bytes) =>
    bytes.toString("utf8").replaceAll("\n", newline),
  );
  const sessions = [];
  t.after(async () => {
    const exits = await Promise.allSettled(
      sessions.map(async ({ client, raw }) => {
        client.dispose();
        return raw.exited;
      }),
    );
    await rm(folder, { recursive: true, force: true });
    for (const exit of exits) {
      assert.equal(exit.status, "fulfilled");
      assert.deepEqual(exit.value, { code: 0, signal: null });
    }
  });
  await Promise.all(paths.map((path, i) => writeFile(path, texts[i])));
  async function connect() {
    const raw = createProcessTransport({
      command: resolve(command),
      args: ["serve", "--top", "source_document_top", paths[0]],
    });
    void raw.exited.catch(() => {});
    const client = new HierClient(raw);
    sessions.push({ client, raw });
    const snapshot = await client.ready;
    const roots = complete(await client.roots());
    assert.equal(roots.length, 1);
    const children = complete(await client.children(roots[0].ref)).items;
    assert.deepEqual(
      children.map((item) => item.name),
      ["left", "right"],
    );
    const span = complete(await client.source(children[0].ref, "definition"));
    return { client, snapshot, children, span };
  }
  return { paths, texts, connect };
}

for (const [label, newline] of [
  ["LF", "\n"],
  ["CRLF", "\r\n"],
]) {
  test(
    `A candidates SDK/Core: ${label} UTF-8 columns and all occurrences across page sizes`,
    bounds,
    async (t) => {
      const input = await fixture(t, newline);
      const { client, children, span } = await input.connect();
      const prefix = "  /* 中😀\t */ ";
      assert.equal(prefix.length + 1, 14);
      assert.equal(Buffer.byteLength(prefix) + 1, 18);
      const query = { file: span.file, line: 3, col: 18 };
      const all = complete(await client.resolveSource(query, { limit: 200 }));
      assert.equal(all.next, undefined);
      const processes = await Promise.all(
        children.map(async (child) => {
          const procs = complete(await client.procs(child.ref)).items;
          assert.equal(procs.length, 1);
          return procs[0];
        }),
      );
      const expected = [
        children[0].def,
        ...children.map((x) => x.ref),
        ...processes.map((x) => x.ref),
      ];
      assert.equal(all.items.length, 5);
      assert.deepEqual(all.items.map((hit) => hit.ref).sort(), expected.sort());
      // Definition range kind applies to both the definition and its occurrences.
      assert.deepEqual(
        all.items
          .filter((hit) => hit.kind === "definition")
          .map((hit) => hit.ref)
          .sort(),
        [children[0].def, ...children.map((x) => x.ref)].sort(),
      );
      assert.equal(
        all.items.filter((hit) => hit.kind === "statement").length,
        2,
      );
      const pages = [];
      const seen = new Set();
      let cursor;
      do {
        const limit = pages.length === 0 ? 1 : 2; // Existing Core allows changed limits.
        const reply = await client.resolveSource(query, {
          limit,
          ...(cursor === undefined ? {} : { cursor }),
        });
        const page = complete(reply);
        assert.ok(page.items.length > 0 && page.items.length <= limit);
        assert.ok(Object.isFrozen(page.items));
        assert.ok(
          page.items.every(
            (hit) =>
              Object.isFrozen(hit) &&
              hit.span.contentHash === hash(input.texts[1]),
          ),
        );
        pages.push(reply);
        cursor = page.next;
        if (cursor !== undefined) {
          assert.ok(!seen.has(cursor));
          seen.add(cursor);
        }
        assert.ok(
          pages.length <= 3,
          "Authored five-hit fixture must terminate",
        );
      } while (cursor !== undefined);
      assert.deepEqual(
        pages.map((page) => page.result.items.length),
        [1, 2, 2],
      );
      assert.deepEqual(
        pages.flatMap((page) => page.result.items),
        all.items,
      );
    },
  );
}

test(
  "A candidates SDK/Core: omitted column, whitespace, empty line and cursor query binding",
  bounds,
  async (t) => {
    const input = await fixture(t);
    const { client, span } = await input.connect();
    const wholeLine = { file: span.file, line: 3 };
    assert.equal(
      complete(await client.resolveSource(wholeLine)).items.length,
      5,
    );
    assert.equal(
      complete(await client.resolveSource({ ...wholeLine, col: 1 })).items
        .length,
      3,
    );
    assert.deepEqual(
      complete(await client.resolveSource({ file: span.file, line: 1 })).items,
      [],
    );
    const first = complete(await client.resolveSource(wholeLine, { limit: 1 }));
    assert.equal(typeof first.next, "string");
    for (const query of [
      { ...wholeLine, col: 1 },
      { ...wholeLine, line: 2 },
    ]) {
      await assert.rejects(
        client.resolveSource(query, { limit: 1, cursor: first.next }),
        coreError("bad_request"),
      );
    }
    await assert.rejects(
      client.resolveSource({ file: "f:999", line: 1 }),
      coreError("not_found"),
    );
    await assert.rejects(
      client.resolveSource({ file: span.file, line: 999 }),
      coreError("bad_request"),
    );
    assert.equal(
      complete(
        await client.resolveSource(wholeLine, { limit: 1, cursor: first.next }),
      ).items.length,
      1,
    );
  },
);

test(
  "A candidates SDK/Core: changed disk text does not move a snapshot query or cursor",
  bounds,
  async (t) => {
    const input = await fixture(t);
    const { client, span } = await input.connect();
    const query = { file: span.file, line: 3, col: 18 };
    const before = await client.resolveSource(query);
    const first = complete(await client.resolveSource(query, { limit: 1 }));
    const continuation = { limit: 2, cursor: first.next };
    const expected = await client.resolveSource(query, continuation);
    await writeFile(input.paths[1], "// changed source\n" + input.texts[1]);
    assert.equal(
      complete(await client.readSource(span.file)).matchesSnapshot,
      false,
    );
    assert.deepEqual(await client.resolveSource(query), before);
    assert.deepEqual(await client.resolveSource(query, continuation), expected);
    // This boundary proves no conversion for changed editor text; that is future L6 work.
  },
);

test(
  "A candidates SDK/Core: a cursor cannot cross snapshot sessions",
  bounds,
  async (t) => {
    const input = await fixture(t);
    const first = await input.connect();
    const second = await input.connect();
    assert.notEqual(first.snapshot.snapshotId, second.snapshot.snapshotId);
    assert.equal(first.snapshot.inputHash, second.snapshot.inputHash);
    const query = { file: first.span.file, line: 3, col: 18 };
    const page = complete(
      await first.client.resolveSource(query, { limit: 1 }),
    );
    assert.equal(typeof page.next, "string");
    await assert.rejects(
      second.client.resolveSource(
        { ...query, file: second.span.file },
        { limit: 1, cursor: page.next },
      ),
      coreError("stale_cursor"),
    );
    assert.equal(
      complete(
        await second.client.resolveSource({ ...query, file: second.span.file }),
      ).items.length,
      5,
    );
  },
);
