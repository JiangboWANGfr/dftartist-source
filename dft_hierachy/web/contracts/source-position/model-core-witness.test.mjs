// Existing model/Core capability evidence. queryAt is a declaration-only proposal.
// The byte query below is authored explicitly; this is NOT an inverse mapper.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
import { SourceCandidatesModel, SourceDocumentModel } from "@hier/viewmodel";

const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must identify the actual Core artifact");
assert.equal("queryAt" in SourceDocumentModel.prototype, false);
const names = ["source-document.sv", "source-document-leaf.svh"];
const originals = await Promise.all(
  names.map((name) =>
    readFile(new URL(`../source-document/${name}`, import.meta.url)),
  ),
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
console.log(
  JSON.stringify({
    queryAtRuntimeExecuted: false,
    coreSha256: digest(await readFile(command)),
    fixtures: Object.fromEntries(
      names.map((name, i) => [name, digest(originals[i])]),
    ),
  }),
);
const bounds = { timeout: 20000 }; // Harness bound, not a product SLA.
function complete(reply) {
  assert.deepEqual(reply.completeness, { status: "complete", reasons: [] });
  return reply.result;
}
function current(model) {
  assert.equal(model.state.status, "success");
  assert.ok(Object.isFrozen(model.state.data));
  return model.state.data;
}
async function fixture(t, newline = "\n", bom = "") {
  const folder = await realpath(
    await mkdtemp(join(tmpdir(), "hier-a-source-position-")),
  );
  const paths = names.map((name) => join(folder, name));
  const texts = originals.map(
    (bytes, i) =>
      (i === 1 ? bom : "") + bytes.toString("utf8").replaceAll("\n", newline),
  );
  await Promise.all(paths.map((path, i) => writeFile(path, texts[i])));
  const raw = createProcessTransport({
    command: resolve(command),
    args: ["serve", "--top", "source_document_top", paths[0]],
  });
  void raw.exited.catch(() => {});
  const client = new HierClient(raw);
  const models = [];
  t.after(async () => {
    for (const model of models) model.dispose();
    client.dispose();
    try {
      assert.deepEqual(await raw.exited, { code: 0, signal: null });
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
  const snapshot = await client.ready;
  const roots = complete(await client.roots());
  assert.equal(roots.length, 1);
  const children = complete(await client.children(roots[0].ref)).items;
  assert.deepEqual(
    children.map((child) => child.name),
    ["left", "right"],
  );
  const document = () => {
    const model = new SourceDocumentModel(client);
    models.push(model);
    return model;
  };
  const candidates = new SourceCandidatesModel(client, { pageSize: 2 });
  models.push(candidates);
  return { client, snapshot, children, document, candidates, paths, texts };
}

for (const [label, newline, bom] of [
  ["LF", "\n", ""],
  ["BOM + CRLF", "\r\n", "\uFEFF"],
]) {
  test(
    `A existing models: ${label} publication identity and byte query`,
    bounds,
    async (t) => {
      const f = await fixture(t, newline, bom);
      const model = f.document();
      await model.load(f.children[0].ref, "definition");
      const first = current(model);
      assert.equal(first.content.result.text, f.texts[1]);
      assert.equal(first.location.status, "exact");
      await model.load(f.children[0].ref, "definition");
      assert.equal(current(model), first); // Existing same-target success no-op.

      const twin = f.document();
      await twin.load(f.children[0].ref, "definition");
      assert.notEqual(current(twin), first);
      assert.equal(
        current(twin).content.result.contentHash,
        first.content.result.contentHash,
      );

      const pending = model.reload();
      assert.equal(model.state.status, "pending");
      assert.equal(Object.hasOwn(model.state, "data"), false);
      await pending;
      const fresh = current(model);
      assert.notEqual(fresh, first);
      assert.equal(fresh.content.result.text, first.content.result.text);

      const processes = [];
      for (const child of f.children) {
        const rows = complete(await f.client.procs(child.ref)).items;
        assert.equal(rows.length, 1);
        processes.push(rows[0]);
      }
      await model.load(processes[0].ref, "statement");
      const statement = current(model);
      assert.equal(statement.location.status, "exact");
      assert.deepEqual(statement.location.range.start, {
        offset: f.texts[1].indexOf("assign y = a;"),
        line: 3,
        column: 14,
      });
      assert.deepEqual(statement.source.result.start, {
        offset: Buffer.from(f.texts[1]).indexOf(Buffer.from("assign y = a;")),
        line: 3,
        column: 18,
      });
      // Authored byte coordinate, not a queryAt implementation or round-trip oracle.
      await f.candidates.load({
        snapshotId: f.snapshot.snapshotId,
        file: statement.source.result.file,
        line: 3,
        col: 18,
      });
      while (f.candidates.state.pages.at(-1).result.next !== undefined)
        await f.candidates.loadMore();
      assert.equal(f.candidates.state.status, "success");
      const hits = f.candidates.state.pages.flatMap(
        (page) => complete(page).items,
      );
      assert.deepEqual(
        hits.map((hit) => hit.ref).sort(),
        [
          f.children[0].def,
          ...f.children.map((child) => child.ref),
          ...processes.map((proc) => proc.ref),
        ].sort(),
      );
      assert.deepEqual(
        f.candidates.state.pages.map((page) => page.result.items.length),
        [2, 2, 1],
      );
      await model.clear();
      assert.equal(model.state.status, "idle");
      assert.equal(Object.hasOwn(model.state, "data"), false);
      model.dispose();
      assert.equal(model.disposed, true);
      assert.equal(complete(await f.client.roots()).length, 1); // Borrowed client.
    },
  );
}

test(
  "A existing models: changed publication cannot supply an exact display range",
  bounds,
  async (t) => {
    const f = await fixture(t);
    const model = f.document();
    await model.load(f.children[0].ref, "definition");
    const old = current(model);
    await writeFile(f.paths[1], "// changed 中😀\r\n");
    await model.reload();
    const changed = current(model);
    assert.notEqual(changed, old);
    assert.equal(changed.content.result.matchesSnapshot, false);
    assert.deepEqual(changed.location, { status: "changed" });
    assert.equal(Object.hasOwn(changed.location, "range"), false);
    assert.equal(old.location.status, "exact"); // Old immutable value is not current.
    await writeFile(f.paths[1], f.texts[1]);
    await model.reload();
    const restored = current(model);
    assert.equal(restored.location.status, "exact");
    assert.notEqual(restored, old);
    assert.notEqual(restored, changed);
  },
);
