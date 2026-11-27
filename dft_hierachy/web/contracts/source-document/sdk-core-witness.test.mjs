// A capability witness for the existing SDK/Core, not a SourceDocumentModel
// implementation or B's independent oracle. Only temporary input copies mutate.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { HierClient, HierError } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";

const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must point to this checkout's actual built Core");
const bounds = { timeout: 20000 }; // Harness guard, not a cancellation SLA.
const names = ["source-document.sv", "source-document-leaf.svh"];
const originals = await Promise.all(
  names.map((name) => readFile(new URL(name, import.meta.url))),
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
console.log(
  JSON.stringify({
    coreSha256: digest(await readFile(command)),
    fixtures: Object.fromEntries(
      names.map((name, index) => [name, digest(originals[index])]),
    ),
    productionSourceModelExecuted: false,
  }),
);

function complete(reply) {
  assert.deepEqual(reply.completeness, { status: "complete", reasons: [] });
  assert.ok(Object.isFrozen(reply));
  assert.ok(Object.isFrozen(reply.result));
  return reply.result;
}
function coreError(code) {
  return (error) => {
    assert.ok(error instanceof HierError);
    assert.equal(error.code, code);
    assert.equal(error.origin, "core");
    assert.ok(error.message.length);
    return true;
  };
}
async function fixture(t, newline = "\n") {
  const folder = await realpath(
    await mkdtemp(join(tmpdir(), "hier-a-source-contract-")),
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
    for (const result of exits) {
      assert.equal(result.status, "fulfilled");
      assert.deepEqual(result.value, { code: 0, signal: null });
    }
  });
  await Promise.all(paths.map((path, i) => writeFile(path, texts[i])));
  async function connect() {
    const raw = createProcessTransport({
      command: resolve(command),
      args: ["serve", "--top", "source_document_top", paths[0]],
    });
    void raw.exited.catch(() => {});
    const sent = [];
    const transport = {
      send: (request) => {
        sent.push(request);
        raw.send(request);
      },
      onMessage: (listener) => raw.onMessage(listener),
      onClose: (listener) => raw.onClose(listener),
      close: () => raw.close(),
    };
    const client = new HierClient(transport);
    const session = { client, raw, sent };
    sessions.push(session);
    const snapshot = await client.ready;
    const roots = complete(await client.roots());
    assert.equal(roots.length, 1);
    assert.equal(roots[0].name, "source_document_top");
    const children = complete(await client.children(roots[0].ref)).items;
    assert.deepEqual(
      children.map((child) => child.name),
      ["left", "right"],
    );
    return { ...session, snapshot, root: roots[0], children };
  }
  return { paths, texts, connect };
}
function assertSpan(span, text, token, start, end) {
  const bytes = Buffer.from(text);
  const offset = bytes.indexOf(Buffer.from(token));
  assert.ok(offset >= 0, "Expected literal exists in the authored fixture");
  assert.equal(span.start.offset, offset);
  assert.equal(span.end.offset, offset + Buffer.byteLength(token));
  assert.deepEqual([span.start.line, span.start.column], start);
  assert.deepEqual([span.end.line, span.end.column], end);
  assert.equal(
    bytes.subarray(span.start.offset, span.end.offset).toString("utf8"),
    token,
  );
  assert.equal(span.contentHash, digest(text));
}

for (const [label, newline] of [
  ["LF", "\n"],
  ["CRLF", "\r\n"],
]) {
  test(
    `A SDK/Core Source capability: ${label}, BMP/astral/tab bytes, definition, include and instantiation`,
    bounds,
    async (t) => {
      const input = await fixture(t, newline);
      const { client, root, children } = await input.connect();
      const top = complete(await client.source(root.ref, "definition"));
      const leaf = complete(await client.source(children[0].ref, "definition"));
      const definition = complete(
        await client.source(children[0].def, "definition"),
      );
      assert.deepEqual(leaf, definition);
      assert.notEqual(top.file, leaf.file);
      assert.equal(top.path, input.paths[0]);
      assert.equal(leaf.path, input.paths[1]);
      assertSpan(
        leaf,
        input.texts[1],
        [
          "module source_document_leaf(input logic a, output wire y);",
          "  /* 中😀\t */ assign y = a;",
          "endmodule",
        ].join(newline),
        [2, 1],
        [4, 10],
      );
      const instance = complete(
        await client.source(children[0].ref, "instantiation"),
      );
      assert.equal(instance.file, top.file);
      assertSpan(
        instance,
        input.texts[0],
        "left(.a(a), .y(middle))",
        [5, 24],
        [5, 47], // 24 + the authored declarator's 23 ASCII bytes.
      );
      const processes = complete(await client.procs(children[0].ref)).items;
      assert.equal(processes.length, 1);
      const statement = complete(
        await client.source(processes[0].ref, "statement"),
      );
      assertSpan(statement, input.texts[1], "assign y = a;", [3, 18], [3, 31]);
      const prefix = "  /* 中😀\t */ ";
      assert.equal(prefix.length + 1, 14); // UTF-16 presentation column.
      assert.equal(Buffer.byteLength(prefix) + 1, 18); // Core byte column.
      for (const [span, text] of [
        [top, input.texts[0]],
        [leaf, input.texts[1]],
      ]) {
        const content = complete(await client.readSource(span.file));
        assert.deepEqual(content, {
          text,
          contentHash: digest(text),
          matchesSnapshot: true,
        });
      }
    },
  );
}

test(
  "A SDK/Core Source capability: changed and restored reads preserve the snapshot span and bypass settled cache",
  bounds,
  async (t) => {
    const input = await fixture(t, "\r\n");
    const { client, snapshot, children, sent } = await input.connect();
    const span = complete(await client.source(children[0].ref, "definition"));
    const before = complete(await client.readSource(span.file));
    const changed = "// prepended 当前😀\r\n" + input.texts[1];
    await writeFile(input.paths[1], changed);
    const after = complete(await client.readSource(span.file));
    assert.deepEqual(after, {
      text: changed,
      contentHash: digest(changed),
      matchesSnapshot: false,
    });
    assert.deepEqual(
      complete(await client.source(children[0].ref, "definition")),
      span,
    );
    assert.deepEqual(complete(await client.checkInputs()), {
      changed: [span.file],
      complete: true,
    });
    assert.equal(complete(await client.info()).inputHash, snapshot.inputHash);
    assert.equal(before.text, input.texts[1]);
    await writeFile(input.paths[1], input.texts[1]);
    assert.deepEqual(complete(await client.readSource(span.file)), before);
    assert.deepEqual(complete(await client.checkInputs()), {
      changed: [],
      complete: true,
    });
    assert.equal(sent.filter((x) => x.method === "source.read").length, 3);
  },
);

test(
  "A SDK/Core Source capability: missing source, outside path, invalid UTF-8, deletion and abort keep the borrowed session usable",
  bounds,
  async (t) => {
    const input = await fixture(t);
    const { client, root, children, sent } = await input.connect();
    const span = complete(await client.source(children[0].ref, "definition"));
    for (const query of [
      () => client.source(root.ref, "instantiation"),
      () => client.source(children[0].def, "statement"),
      () => client.source("i:999", "definition"),
      () => client.readSource(span.path),
      () => client.readSource("f:999"),
    ]) {
      await assert.rejects(query(), coreError("not_found"));
      assert.equal(complete(await client.instance(root.ref)).ref, root.ref);
    }
    await writeFile(input.paths[1], Buffer.from([0xff, 0xc3, 0x28]));
    await assert.rejects(
      client.readSource(span.file),
      coreError("unsupported"),
    );
    assert.deepEqual(
      complete(await client.source(children[0].ref, "definition")),
      span,
    );
    await rm(input.paths[1]);
    await assert.rejects(client.readSource(span.file), coreError("not_found"));
    assert.equal(complete(await client.instance(root.ref)).ref, root.ref);
    await writeFile(input.paths[1], input.texts[1]);
    assert.equal(
      complete(await client.readSource(span.file)).matchesSnapshot,
      true,
    );
    const count = sent.length;
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      client.readSource(span.file, controller.signal),
      (error) =>
        error instanceof HierError &&
        error.code === "cancelled" &&
        error.origin === "client",
    );
    assert.equal(sent.length, count);
    assert.equal(complete(await client.instance(root.ref)).ref, root.ref);
  },
);

test(
  "A SDK/Core Source capability: reopened snapshots have distinct identities and capture their own source hash",
  bounds,
  async (t) => {
    const input = await fixture(t);
    const first = await input.connect();
    const same = await input.connect();
    assert.notEqual(first.snapshot.snapshotId, same.snapshot.snapshotId);
    assert.equal(first.snapshot.inputHash, same.snapshot.inputHash);
    const oldSpan = complete(
      await first.client.source(first.children[0].ref, "definition"),
    );
    const changed = "// new snapshot source\n" + input.texts[1];
    await writeFile(input.paths[1], changed);
    const fresh = await input.connect();
    assert.notEqual(fresh.snapshot.snapshotId, first.snapshot.snapshotId);
    assert.notEqual(fresh.snapshot.inputHash, first.snapshot.inputHash);
    const newSpan = complete(
      await fresh.client.source(fresh.children[0].ref, "definition"),
    );
    assert.equal(oldSpan.contentHash, digest(input.texts[1]));
    assert.equal(newSpan.contentHash, digest(changed));
    assert.equal(newSpan.start.line, oldSpan.start.line + 1);
    assert.equal(
      complete(await first.client.readSource(oldSpan.file)).matchesSnapshot,
      false,
    );
    assert.equal(
      complete(await fresh.client.readSource(newSpan.file)).matchesSnapshot,
      true,
    );
  },
);

test(
  "A SDK/Core Source capability: existing reverse API pages the definition and both occurrences without choosing a candidate",
  bounds,
  async (t) => {
    const input = await fixture(t);
    const { client, children } = await input.connect();
    const span = complete(await client.source(children[0].ref, "definition"));
    const query = { file: span.file, line: 2, col: 1 };
    const hits = [];
    const cursors = new Set();
    let cursor;
    do {
      const page = complete(
        await client.resolveSource(query, { cursor, limit: 1 }),
      );
      assert.equal(page.items.length, 1);
      hits.push(...page.items);
      cursor = page.next;
      if (cursor !== undefined) {
        assert.ok(cursor.length);
        assert.ok(!cursors.has(cursor));
        cursors.add(cursor);
      }
      assert.ok(
        hits.length <= 3,
        "The authored fixture has exactly three hits",
      );
    } while (cursor !== undefined);
    assert.deepEqual(
      hits.map((hit) => [hit.ref, hit.kind, hit.inst]),
      [
        [children[0].def, "definition", undefined],
        [children[0].ref, "definition", children[0].ref],
        [children[1].ref, "definition", children[1].ref],
      ],
    );
    assert.ok(hits.every((hit) => Object.isFrozen(hit)));
    assert.ok(hits.every((hit) => hit.span.contentHash === span.contentHash));
  },
);
