// B genuine Node/Core session. No transport rewriting or another tree's binary.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
import { capability, vm } from "./harness.mjs";
export const fixture = fileURLToPath(
  new URL(
    "../../../core/tests/fixtures/m5/b_tree_navigation.sv",
    import.meta.url,
  ),
);
export const full = (reply) => {
  assert.deepEqual(reply.completeness, { status: "complete", reasons: [] });
  return reply.result;
};
export const paths = [
  ["g[0]", "left"],
  ["g[0]", "right"],
  ["g[1]", "left"],
  ["g[1]", "right"],
  ["g[2]", "left"],
  ["g[2]", "right"],
  ["a.b"],
  ["lanes[0]"],
  ["lanes[1]"],
  ["plain"],
];
export async function real(t, withTree = false, options = { pageSize: 1 }) {
  if (withTree) capability(); // Missing capability baseline occurs before Core spawn.
  assert.ok(process.env.HIER_BIN, "HIER_BIN must point to B's own fixed Core");
  const transport = createProcessTransport({
    command: process.env.HIER_BIN,
    args: ["serve", fixture],
  });
  transport.exited.catch(() => {});
  const client = new HierClient(transport);
  client.ready.catch(() => {});
  let model,
    closed = false,
    readyIndex = false,
    settleIndex;
  const index = new Promise((resolve) => {
    settleIndex = resolve;
  });
  const off = client.onIndexReady(() => {
    readyIndex = true;
    settleIndex();
  });
  const close = async () => {
    if (!closed) {
      closed = true;
      model?.dispose();
      off();
      client.dispose();
    }
    assert.deepEqual(await transport.exited, { code: 0, signal: null });
  };
  t.after(close);
  const snap = await client.ready;
  if (snap.indexState === "ready") {
    readyIndex = true;
    settleIndex();
  }
  const roots = full(await client.roots());
  assert.deepEqual(
    roots.map((r) => r.name),
    ["b_tree_other", "b_tree_top"],
  );
  if (withTree) model = new vm.TreeModel(client, options);
  return {
    client,
    transport,
    snap,
    roots,
    model,
    close,
    async indexed(work) {
      let reply = await work();
      if (reply.completeness.status === "partial") {
        assert.deepEqual(
          reply.completeness.reasons.map((x) => x.code),
          ["indexing"],
        );
        if (!readyIndex) await index;
        reply = await work();
      }
      return full(reply);
    },
  };
}
export const topRow = (c) => {
  const r = c.model.rows.find(
    (r) => r.kind === "instance" && r.instance.name === "b_tree_top",
  );
  assert.ok(r);
  return r;
};
export const targetRow = (c, path) => {
  const r = c.model.rows.find(
    (r) =>
      r.kind === "instance" &&
      r.instance.path.length === path.length &&
      r.instance.path.every((x, n) => x === path[n]),
  );
  assert.ok(r, JSON.stringify(path));
  return r;
};
export async function resolve(c, text) {
  const hits = await c.indexed(() => c.client.resolvePath(text));
  // Preimplementation Schema PathResolveResult is an opaque ObjectRef array.
  assert.equal(hits.length, 1);
  assert.equal(typeof hits[0], "string");
  assert.equal(full(await c.client.object(hits[0])).kind, "instance");
  return hits[0];
}
