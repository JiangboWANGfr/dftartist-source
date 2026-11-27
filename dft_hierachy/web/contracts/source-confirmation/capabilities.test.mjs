// A witnesses of existing capabilities, NOT the proposed confirmation runtime.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
import * as models from "@hier/viewmodel";

const { SourceNavigationModel, SelectionModel, SelectionError } = models;
assert.equal(SourceNavigationModel.prototype.createCandidateAction, undefined);
assert.equal(SourceNavigationModel.prototype.confirmCandidate, undefined);
assert.equal(models.SourceConfirmationError, undefined);
const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must identify the actual existing Core binary");
const fixtures = [
  new URL("../source-document/source-document.sv", import.meta.url),
  new URL("../source-document/source-document-leaf.svh", import.meta.url),
];
const originals = await Promise.all(fixtures.map((file) => readFile(file)));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
console.log(
  JSON.stringify({
    kind: "A existing capability witnesses; confirmation methods remain absent",
    coreSha256: hash(await readFile(command)),
    fixtures: originals.map(hash),
    productionConfirmationImplemented: false,
  }),
);
function complete(reply) {
  assert.deepEqual(reply.completeness, { status: "complete", reasons: [] });
  return reply.result;
}

for (const separate of [false, true]) {
  test(
    `existing Core/navigation/Selection (${separate ? "per-instance" : "shared"})`,
    { timeout: 25000 },
    async (t) => {
      const raw = createProcessTransport({
        command: resolve(command),
        args: [
          "serve",
          "--top",
          "source_document_top",
          ...(separate ? ["--per-instance-bodies"] : []),
          fileURLToPath(fixtures[0]),
        ],
      });
      void raw.exited.catch(() => {});
      const client = new HierClient(raw);
      let navigation, mirror, selection, other, unbound;
      t.after(async () => {
        navigation?.dispose();
        mirror?.dispose();
        for (const model of [selection, other, unbound]) model?.dispose();
        client.dispose();
        assert.deepEqual(await raw.exited, { code: 0, signal: null });
        assert.deepEqual(
          await Promise.all(fixtures.map((file) => readFile(file))),
          originals,
        );
      });
      const snapshot = await client.ready;
      assert.equal(snapshot.schemaVersion, 7);
      const roots = complete(await client.roots());
      const children = complete(await client.children(roots[0].ref)).items;
      assert.deepEqual(
        children.map((c) => c.name),
        ["left", "right"],
      );
      const definition = complete(await client.definitions()).items.find(
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
      const expected = new Map([
        [definition.ref, "definition"],
        ...[...children, ...processes].map((item) => [item.ref, "object"]),
      ]);
      navigation = new SourceNavigationModel(client, { pageSize: 1 });
      await navigation.load(children[0].ref, "definition");
      assert.equal(navigation.state.document.status, "success");
      const document = navigation.state.document.data;
      assert.equal(document.location.status, "exact");
      const offset = document.content.result.text.indexOf("assign");
      assert.ok(offset >= 0);
      await navigation.locate(document, offset);
      const firstPage = navigation.state.candidates.state.pages[0];
      while (
        navigation.state.candidates.state.pages.at(-1).result.next !== undefined
      ) {
        assert.ok(navigation.state.candidates.state.pages.length < 6);
        await navigation.loadMore();
      }
      const pages = navigation.state.candidates.state.pages;
      assert.equal(pages.length, 5);
      assert.strictEqual(pages[0], firstPage);
      const hits = pages.flatMap((page) => complete(page).items);
      assert.equal(hits.length, 5);
      assert.deepEqual(
        hits.map((hit) => hit.ref).sort(),
        [...expected.keys()].sort(),
      );
      for (const hit of hits) {
        assert.equal(hit.refKind, expected.get(hit.ref));
        assert.ok(Object.isFrozen(hit));
      }
      const definitionHit = hits.find((hit) => hit.refKind === "definition");
      const objectHit = hits.find(
        (hit) => hit.kind === "definition" && hit.refKind === "object",
      );
      assert.ok(definitionHit && objectHit);
      selection = new SelectionModel({ snapshotId: snapshot.snapshotId });
      const notifications = [];
      selection.subscribe((value) => notifications.push(value));
      // Directly exercise the existing Selection contract. This deliberately does
      // not implement action issuance, stale-action guards or confirmCandidate.
      selection.select({
        items: [{ def: definitionHit.ref }],
        origin: "source",
        snapshotId: snapshot.snapshotId,
      });
      assert.deepEqual(selection.current.items, [{ def: definition.ref }]);
      selection.select({
        items: [{ ref: objectHit.ref }],
        origin: "source",
        snapshotId: snapshot.snapshotId,
      });
      assert.deepEqual(selection.current.items, [{ ref: objectHit.ref }]);
      assert.equal(notifications.length, 2);
      selection.back();
      assert.deepEqual(selection.current.items, [{ def: definition.ref }]);
      selection.forward();
      assert.deepEqual(selection.current.items, [{ ref: objectHit.ref }]);

      await navigation.reloadCandidates();
      const reloadedPage = navigation.state.candidates.state.pages[0];
      assert.notStrictEqual(
        reloadedPage,
        firstPage,
        "source.resolve does not cache sequential replies",
      );
      assert.deepEqual(
        reloadedPage,
        firstPage,
        "equal query content is not action provenance",
      );
      // Concurrent identical requests may coalesce across two navigation models.
      mirror = new SourceNavigationModel(client, { pageSize: 1 });
      await mirror.load(children[0].ref, "definition");
      const mirrorDocument = mirror.state.document.data;
      assert.notStrictEqual(mirrorDocument, document);
      await Promise.all([
        navigation.reloadCandidates(),
        mirror.locate(mirrorDocument, offset),
      ]);
      const coalescedPage = navigation.state.candidates.state.pages[0];
      assert.strictEqual(coalescedPage, mirror.state.candidates.state.pages[0]);
      assert.notStrictEqual(coalescedPage, reloadedPage);
      const concurrentModelsShareReply =
        coalescedPage === mirror.state.candidates.state.pages[0];
      await navigation.reloadDocument();
      assert.equal(navigation.state.candidates, null);
      const newDocumentIdentity = navigation.state.document.data !== document;
      assert.equal(newDocumentIdentity, true);
      assert.equal(
        navigation.state.document.data.content.result.text,
        document.content.result.text,
      );
      // The existing SelectionModel cannot know that a source row is stale.
      selection.select({
        items: [{ def: definitionHit.ref }],
        origin: "source",
        snapshotId: snapshot.snapshotId,
      });
      assert.deepEqual(selection.current.items, [{ def: definitionHit.ref }]);
      other = new SelectionModel({
        snapshotId: snapshot.snapshotId + "-other",
      });
      unbound = new SelectionModel();
      for (const target of [other, unbound]) {
        const before = target.current;
        assert.throws(
          () =>
            target.select({
              items: [{ def: definitionHit.ref }],
              origin: "source",
              snapshotId: snapshot.snapshotId,
            }),
          (error) =>
            error instanceof SelectionError &&
            error.code === "snapshot_mismatch",
        );
        assert.strictEqual(target.current, before);
      }
      navigation.dispose();
      assert.equal(
        complete(await client.roots()).length,
        1,
        "borrowed client remains usable",
      );
      console.log(
        JSON.stringify({
          separate,
          hitCount: hits.length,
          pageSizes: pages.map((page) => page.result.items.length),
          authorityFromPublicMetadata: true,
          sameReplyAfterReload: reloadedPage === firstPage,
          concurrentModelsShareReply,
          newDocumentIdentity,
          staleGuardAlreadyImplemented: false,
          selectionCommitAndHistory: true,
          snapshotGuards: 2,
          rawHits: hits,
        }),
      );
    },
  );
}

test("existing Selection no-op, notification failure and disposal semantics", () => {
  const selection = new SelectionModel({ snapshotId: "confirmation-witness" });
  try {
    const payload = {
      items: [{ ref: "opaque-object" }],
      origin: "tree",
      snapshotId: selection.snapshotId,
    };
    selection.select(payload);
    const original = selection.current;
    let calls = 0;
    const off = selection.subscribe(() => calls++);
    selection.select({ ...payload, origin: "source" });
    assert.strictEqual(selection.current, original);
    assert.equal(selection.current.origin, "tree");
    assert.equal(calls, 0);
    const failure = new Error("Selection witness listener failure");
    const stopFailure = selection.subscribe(() => {
      throw failure;
    });
    assert.throws(
      () =>
        selection.select({
          ...payload,
          items: [{ def: "opaque-definition" }],
          origin: "source",
        }),
      (error) =>
        error instanceof AggregateError &&
        error.errors.length === 1 &&
        error.errors[0] === failure,
    );
    assert.deepEqual(selection.current.items, [{ def: "opaque-definition" }]);
    assert.equal(calls, 1);
    stopFailure();
    off();
    selection.back();
    assert.strictEqual(selection.current, original);
    selection.dispose();
    assert.throws(
      () => selection.select(payload),
      (error) => error instanceof SelectionError && error.code === "disposed",
    );
    console.log(
      JSON.stringify({
        sameIdentityPreservesOrigin: true,
        listenerFailureAfterCommit: true,
        historyAfterFailure: true,
        disposedGuard: true,
      }),
    );
  } finally {
    selection.dispose();
  }
});
