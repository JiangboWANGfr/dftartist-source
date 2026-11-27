// A integration: actual SDK -> Node -> Core -> issued action -> Selection.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import test from "node:test";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
import {
  SelectionModel,
  SourceNavigationModel,
  SourceConfirmationError,
} from "@hier/viewmodel";

const fixtures = [
  new URL("../contracts/source-document/source-document.sv", import.meta.url),
  new URL(
    "../contracts/source-document/source-document-leaf.svh",
    import.meta.url,
  ),
];
const original = await Promise.all(fixtures.map((file) => readFile(file)));
const complete = (reply) => {
  assert.deepEqual(reply.completeness, { status: "complete", reasons: [] });
  return reply.result;
};
const stale = (fn) =>
  assert.throws(
    fn,
    (error) =>
      error instanceof SourceConfirmationError && error.code === "stale_action",
  );

for (const separate of [false, true]) {
  test(
    `source candidate confirmation through real Core (${separate ? "per-instance" : "shared"})`,
    { timeout: 25000 },
    async (t) => {
      assert.ok(
        process.env.HIER_BIN,
        "HIER_BIN must name the existing Core binary",
      );
      const transport = createProcessTransport({
        command: resolve(process.env.HIER_BIN),
        args: [
          "serve",
          "--top",
          "source_document_top",
          ...(separate ? ["--per-instance-bodies"] : []),
          fileURLToPath(fixtures[0]),
        ],
      });
      void transport.exited.catch(() => {});
      const client = new HierClient(transport);
      let nav, selection;
      t.after(async () => {
        nav?.dispose();
        selection?.dispose();
        client.dispose();
        assert.deepEqual(await transport.exited, { code: 0, signal: null });
        assert.deepEqual(
          await Promise.all(fixtures.map((file) => readFile(file))),
          original,
        );
      });
      const snapshot = await client.ready;
      const root = complete(await client.roots())[0];
      const instances = complete(await client.children(root.ref)).items;
      assert.deepEqual(
        instances.map((item) => item.name),
        ["left", "right"],
      );
      const definition = complete(await client.definitions()).items.find(
        (item) => item.name === "source_document_leaf",
      );
      assert.ok(definition);
      const objects = [...instances];
      for (const instance of instances)
        objects.push(...complete(await client.procs(instance.ref)).items);
      assert.equal(objects.length, 4);
      const expected = new Map([
        [definition.ref, "definition"],
        ...objects.map((item) => [item.ref, "object"]),
      ]);
      nav = new SourceNavigationModel(client, { pageSize: 1 });
      selection = new SelectionModel({ snapshotId: snapshot.snapshotId });
      await nav.load(instances[0].ref, "definition");
      const document = nav.state.document.data;
      await nav.locate(
        document,
        document.content.result.text.indexOf("assign"),
      );
      const page = nav.state.candidates.state.pages[0];
      const firstAction = nav.createCandidateAction(page, 0);
      while (nav.state.candidates.state.pages.at(-1).result.next !== undefined)
        await nav.loadMore();
      const pages = nav.state.candidates.state.pages;
      assert.equal(pages.length, 5);
      assert.equal(firstAction.page, pages[0]);
      const actions = [
        firstAction,
        ...pages.slice(1).map((p) => nav.createCandidateAction(p, 0)),
      ];
      let notifications = 0;
      const off = selection.subscribe(() => notifications++);
      for (const action of actions) {
        const hit = complete(action.page).items[action.itemIndex];
        assert.equal(hit.refKind, expected.get(hit.ref));
        assert.ok(Object.isFrozen(action));
        assert.equal(nav.confirmCandidate(action, selection), undefined);
        assert.deepEqual(selection.current, {
          items: [
            hit.refKind === "definition" ? { def: hit.ref } : { ref: hit.ref },
          ],
          origin: "source",
          snapshotId: snapshot.snapshotId,
        });
      }
      assert.equal(notifications, 5);
      off();
      const last = selection.current;
      selection.back();
      selection.forward();
      assert.strictEqual(selection.current, last);
      await nav.reloadCandidates();
      const refreshed = nav.state.candidates.state.pages[0];
      assert.notStrictEqual(
        refreshed,
        page,
        "source.resolve remains noncached",
      );
      stale(() => nav.confirmCandidate(firstAction, selection));
      assert.strictEqual(selection.current, last);
      const fresh = nav.createCandidateAction(refreshed, 0);
      nav.confirmCandidate(fresh, selection);
      await nav.reloadDocument();
      stale(() => nav.confirmCandidate(fresh, selection));
      assert.equal(nav.state.candidates, null);
      assert.notStrictEqual(nav.state.document.data, document);
      nav.dispose();
      assert.equal(complete(await client.roots()).length, 1);
      console.log(
        JSON.stringify({
          separate,
          actualCore: true,
          confirmations: 6,
          originalPageActionsPreservedByAppend: true,
          staleAfterCandidateAndDocumentReload: true,
        }),
      );
    },
  );
}
