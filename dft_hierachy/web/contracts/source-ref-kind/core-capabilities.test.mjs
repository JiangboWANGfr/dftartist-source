// Current SDK/Core evidence for the proposal, not a new-field implementation.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";

const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must identify the actual Core artifact");
const design = new URL(
  "../source-document/source-document.sv",
  import.meta.url,
);
const include = new URL(
  "../source-document/source-document-leaf.svh",
  import.meta.url,
);
const originals = await Promise.all(
  [design, include].map((file) => readFile(file)),
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
console.log(
  JSON.stringify({
    kind: "A pre-extension SDK/Core capability witness",
    coreSha256: hash(await readFile(command)),
    fixtures: originals.map(hash),
    newRefKindImplemented: false,
  }),
);
function complete(reply) {
  assert.deepEqual(reply.completeness, { status: "complete", reasons: [] });
  return reply.result;
}
for (const separate of [false, true]) {
  test(
    `current Core: authoritative metadata, ambiguous kind, paging (${separate ? "per-instance" : "shared"})`,
    { timeout: 20000 },
    async (t) => {
      const raw = createProcessTransport({
        command: resolve(command),
        args: [
          "serve",
          "--top",
          "source_document_top",
          ...(separate ? ["--per-instance-bodies"] : []),
          fileURLToPath(design),
        ],
      });
      void raw.exited.catch(() => {});
      const client = new HierClient(raw);
      t.after(async () => {
        client.dispose();
        assert.deepEqual(await raw.exited, { code: 0, signal: null });
        assert.deepEqual(
          await Promise.all([design, include].map((file) => readFile(file))),
          originals,
        );
      });
      const snapshot = await client.ready;
      assert.equal(snapshot.schemaVersion, 7);
      const roots = complete(await client.roots());
      assert.equal(roots.length, 1);
      const children = complete(await client.children(roots[0].ref)).items;
      assert.deepEqual(
        children.map((c) => c.name),
        ["left", "right"],
      );
      const definitions = complete(await client.definitions()).items;
      const definition = definitions.find(
        (d) => d.name === "source_document_leaf",
      );
      assert.ok(definition);
      assert.ok(children.every((c) => c.def === definition.ref));
      const processes = await Promise.all(
        children.map(async (c) => {
          const items = complete(await client.procs(c.ref)).items;
          assert.equal(items.length, 1);
          return items[0];
        }),
      );
      const span = complete(await client.source(children[0].ref, "definition"));
      const query = { file: span.file, line: 3, col: 18 };
      const all = complete(await client.resolveSource(query, { limit: 200 }));
      assert.equal(all.next, undefined);
      assert.equal(all.items.length, 5);
      // Address expectations come from public definition/instance/process results,
      // never from ref strings, range kind, optional inst or a failed lookup.
      const objects = [...children, ...processes].map((item) => item.ref);
      assert.deepEqual(
        all.items.map((hit) => hit.ref).sort(),
        [definition.ref, ...objects].sort(),
      );
      const declarationHits = all.items.filter(
        (hit) => hit.kind === "definition",
      );
      assert.deepEqual(
        declarationHits.map((hit) => hit.ref).sort(),
        [definition.ref, ...children.map((c) => c.ref)].sort(),
      );
      assert.ok(all.items.every((hit) => !Object.hasOwn(hit, "refKind")));
      assert.ok(all.items.every((hit) => Object.isFrozen(hit)));
      const pages = [];
      const seen = new Set();
      let cursor;
      do {
        const limit = pages.length === 0 ? 1 : 2;
        const page = complete(
          await client.resolveSource(query, {
            limit,
            ...(cursor === undefined ? {} : { cursor }),
          }),
        );
        pages.push(page);
        cursor = page.next;
        if (cursor !== undefined) {
          assert.equal(seen.has(cursor), false);
          seen.add(cursor);
        }
        assert.ok(pages.length <= 3);
      } while (cursor !== undefined);
      assert.deepEqual(
        pages.map((page) => page.items.length),
        [1, 2, 2],
      );
      assert.deepEqual(
        pages.flatMap((page) => page.items),
        all.items,
      );
      const chosenDefinition = declarationHits.find(
        (hit) => hit.ref === definition.ref,
      );
      assert.ok(chosenDefinition);
      console.log(
        JSON.stringify({
          separate,
          snapshot: snapshot.snapshotId,
          knownDefinition: definition.ref,
          knownObjects: objects,
          declarationHits: declarationHits.map((hit) => hit.ref),
          hitCount: all.items.length,
          pageSizes: pages.map((p) => p.items.length),
          refKindPresent: false,
          rawHits: all.items,
        }),
      );
    },
  );
}
