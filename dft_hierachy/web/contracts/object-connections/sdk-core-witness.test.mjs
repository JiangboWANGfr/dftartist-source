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
  new URL("./object-connections.sv", import.meta.url),
);
const bits = { lsb: 1, width: 2 };

async function session(t) {
  const transport = createProcessTransport({
    command: path.resolve(command),
    args: ["serve", fixture],
  });
  const client = new HierClient(transport);
  t.after(async () => {
    client.dispose();
    const exit = await transport.exited;
    assert.deepEqual(exit, { code: 0, signal: null });
    console.log(JSON.stringify({ test: t.name, coreExit: exit }));
  });
  await client.ready;
  const root = (await client.roots()).result.find(
    (item) => item.name === "connections_top",
  );
  assert.ok(root);
  const children = (await client.children(root.ref)).result.items;
  async function ports(name) {
    const instance =
      name === root.name ? root : children.find((item) => item.name === name);
    assert.ok(instance, name);
    return (await client.ports(instance.ref)).result;
  }
  return { client, root, ports };
}

function port(ports, name) {
  const found = ports.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

/** Exercise existing SDK calls only; this is not a replacement L6 model. */
async function query(client, target) {
  const object = await client.object(target.slice.ref);
  assert.equal(object.result.ref, target.slice.ref);
  const [drivers, loads] = await Promise.all([
    client.drivers(target),
    client.loads(target),
  ]);
  for (const reply of [object, drivers, loads]) {
    assert.ok(Object.isFrozen(reply));
    assert.ok(Object.isFrozen(reply.result));
    assert.ok(Object.isFrozen(reply.completeness));
  }
  return { object, drivers, loads };
}

test("A SDK/Core: explicit port slice preserves queried and endpoint coordinates", async (t) => {
  const { client, ports } = await session(t);
  const a = port(await ports("wired"), "a");
  const rootA = port(await ports("connections_top"), "a");
  for (const reach of ["local", "hier"]) {
    const result = await query(client, {
      slice: { ref: a.ref, bits },
      side: "outside",
      reach,
    });
    assert.equal(result.object.result.kind, "port");
    assert.equal(result.drivers.completeness.status, "complete");
    const [driver] = result.drivers.result;
    assert.equal(result.drivers.result.length, 1);
    assert.equal(driver.ref, rootA.ref);
    assert.equal(driver.kind, reach === "local" ? "own_port" : "top_port");
    assert.deepEqual(driver.queried, bits);
    assert.deepEqual(driver.bits, { lsb: 3, width: 2 });
    assert.ok(Object.isFrozen(driver.queried));
  }
  const sha256 = async (file) =>
    createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  console.log(
    JSON.stringify({
      core: path.resolve(command),
      coreSha256: await sha256(command),
      fixtureSha256: await sha256(fixture),
      productionModelExecuted: false,
    }),
  );
});

test("A SDK/Core: signal needs no side and hier retains process at and boundary route", async (t) => {
  const { client, ports } = await session(t);
  const rootA = port(await ports("connections_top"), "a");
  assert.equal(rootA.internal.kind, "direct");
  const input = port(await ports("wired"), "a");
  assert.equal(input.internal.kind, "direct");
  const slice = { ref: rootA.internal.signal, bits: { lsb: 3, width: 2 } };
  const local = await query(client, { slice, reach: "local" });
  const hier = await query(client, { slice, reach: "hier" });
  assert.equal(hier.object.result.kind, "signal");
  assert.equal(local.loads.result.length, 1);
  assert.equal(local.loads.result[0].kind, "module_pin");
  assert.equal(local.loads.result[0].ref, input.ref);
  assert.equal(hier.loads.result.length, 1);
  const process = hier.loads.result[0];
  assert.equal(process.kind, "process");
  assert.notEqual(process.ref, process.at.ref);
  assert.equal(process.at.ref, input.internal.signal);
  assert.deepEqual(process.queried, slice.bits);
  assert.deepEqual(process.bits, bits);
  assert.deepEqual(process.at.bits, bits);
  assert.equal(process.via.length, 1);
  assert.equal(process.via[0].via, input.ref);
});

test("A SDK/Core: four-state constants and unconnected endpoints stay original", async (t) => {
  const { client, ports } = await session(t);
  const tied = port(await ports("tied"), "a");
  const open = port(await ports("open_ports"), "a");
  const constant = await query(client, {
    slice: { ref: tied.ref },
    reach: "hier",
    side: "outside",
  });
  assert.deepEqual(constant.drivers.result, [
    { kind: "const", queried: { lsb: 0, width: 4 }, value: "4'b10xz", via: [] },
  ]);
  const disconnected = await query(client, {
    slice: { ref: open.ref, bits },
    reach: "local",
    side: "outside",
  });
  assert.deepEqual(disconnected.drivers.result, [
    { kind: "unconnected", queried: bits, via: [] },
  ]);
  assert.equal(disconnected.drivers.completeness.status, "complete");
});

test("A SDK/Core: empty partial retains its reason and differs from empty complete", async (t) => {
  const { client, ports } = await session(t);
  assert.equal(METHODS["obj.get"].allowsPartial, false);
  assert.equal(METHODS["conn.drivers"].allowsPartial, true);
  assert.equal(METHODS["conn.loads"].allowsPartial, true);
  const bus = port(await ports("unknown_port"), "bus");
  const result = await query(client, {
    slice: { ref: bus.ref },
    reach: "hier",
    side: "inside",
  });
  assert.equal(result.object.completeness.status, "complete");
  for (const reply of [result.drivers, result.loads]) {
    assert.deepEqual(reply.result, []);
    assert.deepEqual(reply.completeness, {
      status: "partial",
      reasons: [{ code: "interface_port", at: bus.ref }],
    });
  }
  const unused = port(await ports("connections_top"), "unused_input");
  const empty = await query(client, {
    slice: { ref: unused.ref },
    reach: "local",
    side: "inside",
  });
  assert.deepEqual(empty.loads.result, []);
  assert.deepEqual(empty.loads.completeness, {
    status: "complete",
    reasons: [],
  });
});

test("A SDK/Core: Core rejects semantic target errors without losing the session", async (t) => {
  const { client, root, ports } = await session(t);
  const a = port(await ports("connections_top"), "a");
  assert.equal(a.internal.kind, "direct");
  const invalid = [
    { slice: { ref: a.ref }, reach: "local" },
    { slice: { ref: a.ref }, reach: "hier", side: "outside" },
    { slice: { ref: a.internal.signal }, reach: "local", side: "inside" },
    {
      slice: { ref: a.internal.signal, bits: { lsb: 8, width: 1 } },
      reach: "local",
    },
    { slice: { ref: root.ref }, reach: "hier" },
  ];
  for (const target of invalid) {
    // Even an instance has valid obj.get metadata; connections reject its kind.
    assert.equal(
      (await client.object(target.slice.ref)).result.ref,
      target.slice.ref,
    );
    for (const method of ["drivers", "loads"])
      await assert.rejects(
        client[method](target),
        (error) =>
          error instanceof HierError &&
          error.code === "bad_request" &&
          error.origin === "core",
      );
  }
  const valid = await query(client, {
    slice: { ref: a.ref, bits },
    reach: "local",
    side: "inside",
  });
  assert.equal(valid.drivers.completeness.status, "complete");
});
