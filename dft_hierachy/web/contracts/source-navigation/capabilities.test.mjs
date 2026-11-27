// A evidence for existing public models only. No navigation coordinator substitute.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
import * as models from "@hier/viewmodel";

assert.equal("SourceNavigationModel" in models, false);
const { SourceCandidatesModel, SourceDocumentModel } = models;
const complete = { status: "complete", reasons: [] };
const partial = { status: "partial", reasons: [{ code: "indexing" }] };
const bounds = { timeout: 20000 }; // Harness bound, not product timing acceptance.
const snapshot = {
  protocol: 2,
  schemaVersion: 7,
  frontend: { name: "slang", version: "A-navigation-witness" },
  snapshotId: "navigation-witness",
  inputHash: "0".repeat(64),
  inputHashComplete: true,
  bodySharing: "fast",
  tops: [],
  definitionCount: 0,
  bodyCount: 0,
  indexState: "building",
  openedAt: "2026-01-01T00:00:00.000Z",
  topCandidates: [],
};

class ControlledTransport {
  sent = [];
  listener;
  closed = false;
  send(value) {
    this.sent.push(value);
  }
  onMessage(listener) {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }
  onClose() {
    return () => {};
  }
  close() {
    this.closed = true;
  }
  deliver(frame) {
    return new Promise((resolve, reject) =>
      queueMicrotask(() => {
        try {
          this.listener?.(frame);
          resolve();
        } catch (error) {
          reject(error);
        }
      }),
    );
  }
  reply(request, result, completeness = complete) {
    return this.deliver({ id: request.id, ok: true, result, completeness });
  }
}

async function setup(t) {
  const transport = new ControlledTransport();
  const client = new HierClient(transport, { cacheEntries: 0 });
  await transport.deliver({
    event: "hello",
    protocol: 2,
    snapshot,
    capabilities: ["cancel", "progress"],
  });
  await client.ready;
  const model = new SourceCandidatesModel(client);
  t.after(() => {
    model.dispose();
    client.dispose();
    assert.equal(transport.closed, true);
  });
  const query = {
    snapshotId: snapshot.snapshotId,
    file: "opaque-file",
    line: 1,
    col: 1,
  };
  return { transport, client, model, query };
}

test(
  "A existing SDK: ready-before-partial requires explicit reload; events do not replay",
  bounds,
  async (t) => {
    const { transport, client, model, query } = await setup(t);
    const statuses = [];
    const off = client.onIndexReady(() => statuses.push(model.state.status));
    t.after(off);
    const command = model.load(query);
    void command.catch(() => {});
    assert.equal(transport.sent.length, 1);
    assert.equal(transport.sent[0].method, "source.resolve");
    await transport.deliver({ event: "index", state: "ready" });
    await transport.reply(transport.sent[0], { items: [] }, partial);
    await command;
    assert.deepEqual(statuses, ["pending"]);
    assert.equal(model.state.status, "success");
    assert.equal(model.state.pages[0].completeness.status, "partial");
    assert.equal(transport.sent.length, 1); // Raw model deliberately has no auto refresh.
    let replayed = 0;
    const offLate = client.onIndexReady(() => {
      replayed++;
    });
    assert.equal(replayed, 0);
    const reload = model.reload();
    void reload.catch(() => {});
    assert.equal(transport.sent.length, 2);
    // SDK canonicalizes the omitted public cursor to Schema RequestCursor.default.
    assert.equal(transport.sent[1].params.cursor, "");
    await transport.reply(transport.sent[1], { items: [] });
    await reload;
    assert.equal(model.state.pages.length, 1);
    assert.equal(model.state.pages[0].completeness.status, "complete");
    await transport.deliver({ event: "index", state: "ready" });
    assert.equal(replayed, 1);
    offLate();
  },
);

test(
  "A existing candidate command can reject listener AggregateError while state succeeds",
  bounds,
  async (t) => {
    const { transport, model, query } = await setup(t);
    const thrown = Object.freeze({ listener: "original opaque value" });
    model.subscribe(() => {
      if (model.state.status === "success") throw thrown;
    });
    const command = model.load(query);
    const rejection = assert.rejects(command, (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [thrown]);
      assert.equal(error.errors[0], thrown);
      return true;
    });
    await transport.reply(transport.sent[0], { items: [] });
    await rejection;
    assert.equal(model.state.status, "success");
    assert.equal(Object.hasOwn(model.state, "error"), false);
  },
);

test(
  "A existing Core/models: a new document publication does not invalidate independent candidates",
  bounds,
  async (t) => {
    const command = process.env.HIER_BIN;
    assert.ok(command, "HIER_BIN must identify this checkout's Core");
    const fixture = fileURLToPath(
      new URL("../source-document/source-document.sv", import.meta.url),
    );
    const leaf = fileURLToPath(
      new URL("../source-document/source-document-leaf.svh", import.meta.url),
    );
    const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
    console.log(
      JSON.stringify({
        navigationRuntimeExecuted: false,
        coreSha256: sha(await readFile(command)),
        fixtureSha256: sha(await readFile(fixture)),
        leafSha256: sha(await readFile(leaf)),
      }),
    );
    const processTransport = createProcessTransport({
      command,
      args: ["serve", "--top", "source_document_top", fixture],
    });
    void processTransport.exited.catch(() => {});
    const client = new HierClient(processTransport);
    let document, candidates;
    t.after(async () => {
      document?.dispose();
      candidates?.dispose();
      client.dispose();
      assert.deepEqual(await processTransport.exited, {
        code: 0,
        signal: null,
      });
    });
    await client.ready;
    document = new SourceDocumentModel(client);
    candidates = new SourceCandidatesModel(client);
    const root = (await client.roots()).result[0];
    const child = (await client.children(root.ref)).result.items[0];
    await document.load(child.ref, "definition");
    const displayed = document.state.data;
    assert.equal(displayed.location.status, "exact");
    const query = document.queryAt(
      displayed,
      displayed.location.range.start.offset,
    );
    await candidates.load(query);
    const oldCandidates = candidates.state;
    assert.ok(oldCandidates.pages[0].result.items.length > 0);
    const reload = document.reload();
    assert.equal(document.state.status, "pending");
    assert.equal(candidates.state, oldCandidates);
    await reload;
    assert.notEqual(document.state.data, displayed);
    assert.equal(
      document.state.data.content.result.text,
      displayed.content.result.text,
    );
    assert.equal(candidates.state, oldCandidates);
    assert.throws(() => document.queryAt(displayed, 0), {
      code: "stale_document",
    });
    let notifications = 0;
    document.subscribe(() => {
      notifications++;
    });
    document.dispose();
    assert.equal(notifications, 0); // External disposal is not observable by subscribe.
    assert.equal(candidates.state, oldCandidates);
    await candidates.clear();
    assert.equal(candidates.state.status, "idle");
    assert.equal((await client.roots()).result.length, 1); // SDK remains host-owned.
  },
);
