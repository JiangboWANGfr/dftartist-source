import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { HierClient, HierError } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
import { METHODS } from "@hier/protocol-types";

const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must point to this checkout's built Core");
const fixture = fileURLToPath(
  new URL("./instance-properties.sv", import.meta.url),
);
async function ownedSession(t) {
  const transport = createProcessTransport({
    command: path.resolve(command),
    args: ["serve", fixture],
  });
  const client = new HierClient(transport);
  t.after(async () => {
    client.dispose();
    assert.deepEqual(await transport.exited, { code: 0, signal: null });
  });
  const snapshot = await client.ready;
  const root = (await client.roots()).result.find(
    (x) => x.name === "property_top",
  );
  assert.ok(root);
  const children = (await client.children(root.ref)).result.items;
  return { client, snapshot, root, children };
}
async function bundle(client, target) {
  const instance = await client.instance(target);
  const [ports, params] = await Promise.all([
    client.ports(target),
    client.params(target),
  ]);
  for (const reply of [instance, ports, params]) {
    assert.equal(reply.completeness.status, "complete");
    assert.deepEqual(reply.completeness.reasons, []);
    assert.ok(Object.isFrozen(reply));
    assert.ok(Object.isFrozen(reply.result));
  }
  return { instance, ports, params };
}

test("A SDK/Core capability: parameters and port widths belong to the selected instance", async (t) => {
  const { client, children } = await ownedSession(t);
  for (const [name, width] of [
    ["narrow", 3],
    ["wide", 7],
  ]) {
    const child = children.find((x) => x.name === name);
    assert.ok(child);
    const data = await bundle(client, child.ref);
    assert.equal(data.instance.result.ref, child.ref);
    assert.deepEqual(
      data.ports.result.map((p) => [p.name, p.width]),
      [
        ["a", width],
        ["y", width],
      ],
    );
    assert.equal(
      data.params.result.find((p) => p.name === "W").value,
      String(width),
    );
    assert.equal(
      data.params.result.find((p) => p.name === "DOUBLE_W").value,
      String(width * 2),
    );
    assert.ok(data.ports.result.every(Object.isFrozen));
    assert.ok(data.params.result.every(Object.isFrozen));
  }
  for (const method of ["inst.get", "inst.ports", "inst.params"])
    assert.equal(METHODS[method].allowsPartial, false);
  console.log(
    JSON.stringify({
      coreSha256: createHash("sha256")
        .update(await readFile(command))
        .digest("hex"),
      fixtureSha256: createHash("sha256")
        .update(await readFile(fixture))
        .digest("hex"),
      productionModelExecuted: false,
    }),
  );
});

test("A SDK/Core capability: empty properties remain complete and a bad target preserves the session", async (t) => {
  const { client, children, root } = await ownedSession(t);
  const empty = children.find((x) => x.name === "empty");
  assert.ok(empty);
  const data = await bundle(client, empty.ref);
  assert.deepEqual(data.ports.result, []);
  assert.deepEqual(data.params.result, []);
  await assert.rejects(
    client.instance("i:999"),
    (error) =>
      error instanceof HierError &&
      error.code === "not_found" &&
      error.origin === "core",
  );
  assert.equal((await client.instance(root.ref)).result.ref, root.ref);
});

test("A SDK/Core capability: reopening the same input creates a distinct snapshot", async (t) => {
  const first = await ownedSession(t);
  const second = await ownedSession(t);
  assert.notEqual(first.snapshot.snapshotId, second.snapshot.snapshotId);
  assert.equal(first.snapshot.inputHash, second.snapshot.inputHash);
  await bundle(first.client, first.root.ref);
  await bundle(second.client, second.root.ref);
});
