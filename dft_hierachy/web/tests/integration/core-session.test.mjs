import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
import { METHODS } from "@hier/protocol-types";
import { SelectionModel, SelectionError } from "@hier/viewmodel";
import { createProcessTextTransport } from "../../packages/client/dist/node/process-transport.js";
import { decodeWireText } from "../../packages/client/dist/wire-frame.js";

const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must name this checkout’s actual built Core");
async function connect(t, file, args = []) {
  const transport = createProcessTransport({
    command: resolve(command),
    args: ["serve", ...args, file],
  });
  const client = new HierClient(transport);
  t.after(async () => {
    client.dispose();
    await transport.exited;
  });
  const snapshot = await client.ready;
  return { client, transport, snapshot };
}
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "hier-a-m4-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "design.sv");
  await writeFile(
    file,
    `module leaf(input logic [3:0] a, output logic [3:0] y);
  assign y = a;
endmodule
module top(input logic clk, input logic [3:0] a, output logic [3:0] q);
  parameter int W = 4;
  logic [3:0] intermediate;
  leaf u(.a(a), .y(intermediate));
  always_ff @(posedge clk) q <= intermediate;
endmodule\n`,
  );
  return { dir, file };
}

test(
  "A real Core raw text round-trip rebuilds SDK frames after string cloning",
  { timeout: 20000 },
  async (t) => {
    const { file } = await fixture(t);
    const text = createProcessTextTransport({
      command: resolve(command),
      args: ["serve", file],
    });
    let frames = 0;
    // This is a Node/Core serialization boundary, not Electron or contextBridge.
    const client = new HierClient({
      onMessage: (handler) =>
        text.onMessage((json) => {
          frames++;
          handler(decodeWireText(structuredClone(json)));
        }),
      onClose: (handler) => text.onClose(handler),
      send: (message) => text.send(JSON.stringify(message)),
      close: () => text.close(),
    });
    t.after(async () => {
      client.dispose();
      assert.deepEqual(await text.exited, { code: 0, signal: null });
    });
    const snapshot = await client.ready;
    const roots = await client.roots();
    assert.equal(snapshot.schemaVersion, 7);
    assert.equal(roots.completeness.status, "complete");
    const root = roots.result.find((item) => item.name === "top");
    assert.ok(root);
    const kids = await client.children(root.ref);
    assert.deepEqual(
      kids.result.items.map((item) => item.name),
      ["u"],
    );
    assert.ok(frames >= 3);
  },
);

test(
  "A real SDK → Node → serve exercises all 27 methods and preserves snapshot facts",
  { timeout: 20000 },
  async (t) => {
    const { file } = await fixture(t);
    const { client, snapshot } = await connect(t, file);
    const touched = new Set();
    const call = async (name, ...args) => {
      touched.add(Object.entries(METHODS).find(([, v]) => v.clientMethod === name)[0]);
      const reply = await client[name](...args).catch((error) => {
        throw new Error(`method ${name}: ${error.message}`, { cause: error });
      });
      assert.ok(reply.result !== undefined);
      assert.ok(["complete", "partial"].includes(reply.completeness.status));
      return reply.result;
    };
    const roots = await call("roots");
    const root = roots.find((x) => x.name === "top");
    assert.ok(root);
    assert.equal(snapshot.schemaVersion, 7);
    assert.equal(snapshot.inputHashComplete, true);
    assert.match(snapshot.inputHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(
      snapshot.topCandidates,
      roots.map((x) => x.ref),
    );
    assert.deepEqual(await call("info"), snapshot);
    await call("diagnostics", { maxItems: 0 });
    assert.deepEqual(await call("checkInputs"), { changed: [], complete: true });
    const kids = await call("children", root.ref, { limit: 1 });
    assert.equal(kids.items[0].name, "u");
    const ancestors = await call("ancestors", kids.items[0].ref);
    assert.equal(ancestors[0].ref, root.ref);
    assert.equal((await call("instance", root.ref)).ref, root.ref);
    const ports = await call("ports", root.ref);
    assert.equal(ports.length, 3);
    assert.equal((await call("params", root.ref)).find((p) => p.name === "W").value, "4");
    const signals = await call("signals", root.ref);
    assert.ok(signals.items.length >= 4);
    const a = signals.items.find((x) => x.name === "a"),
      q = signals.items.find((x) => x.name === "q");
    assert.ok(a && q);
    const filtered = await client.signals(root.ref, { filter: { text: "intermediate" } });
    assert.deepEqual(
      filtered.result.items.map((x) => x.name),
      ["intermediate"],
    );
    const definitions = await call("definitions");
    assert.equal(definitions.items.length, 2);
    assert.ok((await call("instancesOf", root.def)).items.some((x) => x.ref === root.ref));
    assert.ok(
      (await call("search", { text: "intermediate", kinds: ["signal"] })).items.some(
        (x) => x.name === "intermediate",
      ),
    );
    assert.ok((await call("resolvePath", "top.a")).includes(a.ref));
    assert.equal((await call("bindings", root.ref)).bindings.length, 2);
    const slice = { ref: q.ref, bits: { lsb: 0, width: 4 } };
    assert.ok((await call("drivers", { slice, reach: "local" })).length);
    assert.ok((await call("loads", { slice: { ref: a.ref }, reach: "hier" })).length);
    assert.ok((await call("step", { from: slice, direction: "back" })).hops.length);
    const point = { slice };
    assert.ok(
      (await call("cone", { start: point, direction: "back", policy: "full" })).nodes.length,
    );
    assert.ok(
      (
        await call("paths", {
          from: { slice: { ref: a.ref, bits: { lsb: 0, width: 4 } } },
          to: point,
        })
      ).nodes.length,
    );
    assert.equal((await call("registers", root.ref)).items.length, 1);
    const procs = await call("procs", root.ref);
    assert.ok(procs.items.length);
    assert.equal((await call("proc", procs.items[0].ref)).ref, procs.items[0].ref);
    assert.equal((await call("object", q.ref)).name, "q");
    const span = await call("source", root.ref, "definition");
    assert.ok(
      (await call("resolveSource", { file: span.file, line: span.start.line })).items.length,
    );
    const source = await call("readSource", span.file);
    assert.equal(source.matchesSnapshot, true);
    assert.match(source.text, /module top/);
    assert.equal(touched.size, 27);
    await writeFile(file, source.text + "// changed after snapshot\n");
    assert.equal((await client.readSource(span.file)).result.matchesSnapshot, false);
    assert.deepEqual((await client.checkInputs()).result.changed, [span.file]);
    assert.equal((await client.info()).result.inputHash, snapshot.inputHash);
    await assert.rejects(
      client.instance("i:999"),
      (e) => e.code === "not_found" && e.origin === "core",
    );
    assert.deepEqual((await client.roots()).result, roots);
  },
);

test(
  "A snapshot IDs vary, semantic hashes are stable, explicit tops and filelists are honest",
  { timeout: 20000 },
  async (t) => {
    const { file, dir } = await fixture(t);
    const one = await connect(t, file),
      two = await connect(t, file, ["--per-instance-bodies"]);
    assert.notEqual(one.snapshot.snapshotId, two.snapshot.snapshotId);
    assert.equal(one.snapshot.inputHash, two.snapshot.inputHash);
    const explicit = await connect(t, file, ["--top", "top"]);
    assert.deepEqual(explicit.snapshot.topCandidates, []);
    assert.notEqual(one.snapshot.inputHash, explicit.snapshot.inputHash);
    const list = join(dir, "sources.f");
    await writeFile(list, `${file}\n+define+HASH_MARKER=1\n`);
    const transport = createProcessTransport({
      command: resolve(command),
      args: ["serve", "-f", list],
    });
    const client = new HierClient(transport);
    t.after(async () => {
      client.dispose();
      await transport.exited;
    });
    const listed = await client.ready;
    assert.equal(listed.inputHashComplete, false);
    assert.notEqual(listed.inputHash, one.snapshot.inputHash);
  },
);

test(
  "A real Core selections drive properties and preserve isolation across reopened sessions",
  { timeout: 20000 },
  async (t) => {
    const { file } = await fixture(t);
    const first = await connect(t, file);
    const model = new SelectionModel({ snapshotId: first.snapshot.snapshotId });
    t.after(() => model.dispose());
    const root = (await first.client.roots()).result.find((item) => item.name === "top");
    assert.ok(root);
    const seen = [];
    model.subscribe((selection) => seen.push(selection));
    model.select({
      snapshotId: first.snapshot.snapshotId,
      origin: "tree",
      items: [{ ref: root.ref }],
    });
    const instanceSelection = model.current;
    assert.equal(
      (await first.client.instance(instanceSelection.items[0].ref)).result.def,
      root.def,
    );
    model.select({
      snapshotId: first.snapshot.snapshotId,
      origin: "source",
      items: [{ def: root.def }],
    });
    const definitionSelection = model.current;
    assert.ok(
      (await first.client.instancesOf(definitionSelection.items[0].def)).result.items.some(
        (item) => item.ref === root.ref,
      ),
    );
    model.back();
    assert.equal(model.current, instanceSelection);
    model.forward();
    assert.equal(model.current, definitionSelection);
    assert.equal(seen.length, 4);

    const reopened = await connect(t, file);
    const nextModel = new SelectionModel({
      snapshotId: reopened.snapshot.snapshotId,
    });
    t.after(() => nextModel.dispose());
    assert.notEqual(model.snapshotId, nextModel.snapshotId);
    assert.throws(
      () => nextModel.select(definitionSelection),
      (error) => error instanceof SelectionError && error.code === "snapshot_mismatch",
    );
    assert.deepEqual(nextModel.current.items, []);
    const nextRoot = (await reopened.client.roots()).result.find((item) => item.name === "top");
    assert.ok(nextRoot);
    nextModel.select({
      snapshotId: nextModel.snapshotId,
      origin: "tree",
      items: [{ ref: nextRoot.ref }],
    });

    model.dispose();
    assert.equal(seen.length, 4);
    assert.deepEqual(model.current.items, []);
    // Selection owns no transport: both sessions remain usable until host cleanup.
    assert.equal((await first.client.info()).result.snapshotId, first.snapshot.snapshotId);
    assert.equal(
      (await reopened.client.instance(nextModel.current.items[0].ref)).result.ref,
      nextRoot.ref,
    );
    assert.equal(definitionSelection.items[0].def, root.def);
  },
);
