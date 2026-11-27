// Existing Navigation/SDK/Core capability only, not the proposed UI interaction.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
import { SourceNavigationModel, SourcePositionError } from "@hier/viewmodel";

assert.ok(process.env.HIER_BIN, "explicit existing Core binary is required");
for (const [name, newline] of [
  ["LF", "\n"],
  ["CRLF", "\r\n"],
]) {
  test(
    `A existing Navigation + real Core: ${name} identity, position and errors`,
    { timeout: 20000 },
    async (t) => {
      const dir = await mkdtemp(join(tmpdir(), "hier-a-position-ui-core-"));
      const names = ["source-document.sv", "source-document-leaf.svh"];
      const texts = await Promise.all(
        names.map(async (name) =>
          (
            await readFile(
              new URL("../source-document/" + name, import.meta.url),
              "utf8",
            )
          ).replaceAll("\n", newline),
        ),
      );
      await Promise.all(names.map((n, i) => writeFile(join(dir, n), texts[i])));
      const raw = createProcessTransport({
        command: resolve(process.env.HIER_BIN),
        args: ["serve", "--top", "source_document_top", join(dir, names[0])],
      });
      void raw.exited.catch(() => {});
      const client = new HierClient(raw);
      let navigation;
      t.after(async () => {
        navigation?.dispose();
        client.dispose();
        try {
          assert.deepEqual(await raw.exited, { code: 0, signal: null });
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      });
      await client.ready;
      const root = (await client.roots()).result[0];
      const children = (await client.children(root.ref)).result.items;
      assert.deepEqual(
        children.map((c) => c.name),
        ["left", "right"],
      );
      navigation = new SourceNavigationModel(client, { pageSize: 2 });
      await navigation.load(children[0].ref, "definition");
      assert.equal(navigation.state.document.status, "success");
      const document = navigation.state.document.data;
      assert.equal(document.location.status, "exact");
      assert.equal(document.content.result.text, texts[1]);
      const offset = texts[1].indexOf("assign y = a;");
      const states = [];
      const off = navigation.subscribe(() =>
        states.push(navigation.state.candidates?.state.status),
      );
      await navigation.locate(document, offset);
      assert.ok(states.includes("pending"));
      assert.equal(navigation.state.candidates.document, document);
      assert.equal(navigation.state.candidates.utf16Offset, offset);
      assert.deepEqual(navigation.state.candidates.state.query, {
        snapshotId: client.snapshot.snapshotId,
        file: document.source.result.file,
        line: 3,
        col: 18,
      });
      while (
        navigation.state.candidates.state.pages.at(-1).result.next !== undefined
      )
        await navigation.loadMore();
      assert.equal(navigation.state.candidates.state.status, "success");
      const hits = navigation.state.candidates.state.pages.flatMap(
        (p) => p.result.items,
      );
      for (const child of children)
        assert.ok(hits.some((hit) => hit.ref === child.ref));
      const bound = navigation.state.candidates;
      await assert.rejects(
        navigation.locate(document, texts[1].indexOf("😀") + 1),
        (e) =>
          e instanceof SourcePositionError && e.code === "invalid_argument",
      );
      if (newline.length === 2)
        await assert.rejects(
          navigation.locate(document, texts[1].indexOf("\r\n") + 1),
          (e) =>
            e instanceof SourcePositionError && e.code === "invalid_argument",
        );
      assert.equal(navigation.state.candidates, bound);
      await navigation.reloadDocument();
      assert.notEqual(navigation.state.document.data, document);
      await assert.rejects(
        navigation.locate(document, offset),
        (e) => e instanceof SourcePositionError && e.code === "stale_document",
      );
      assert.equal(navigation.state.candidates, null);
      await writeFile(join(dir, names[1]), texts[1] + "// changed\n");
      await navigation.reloadDocument();
      const changed = navigation.state.document.data;
      assert.equal(changed.location.status, "changed");
      await assert.rejects(
        navigation.locate(changed, offset),
        (e) =>
          e instanceof SourcePositionError && e.code === "changed_document",
      );
      assert.equal(navigation.state.candidates, null);
      off();
      console.log(
        JSON.stringify({
          format: name,
          pointOffset: offset,
          coreQuery: { line: 3, col: 18 },
          candidateCount: hits.length,
          pendingObserved: true,
          staleAndChangedRejected: true,
          invalidBoundaryRejected: true,
          productionInteractionExecuted: false,
        }),
      );
    },
  );
}
