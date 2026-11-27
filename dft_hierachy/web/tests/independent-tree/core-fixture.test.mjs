// Real-Core source KAT is independent of missing Tree capability.
import assert from "node:assert/strict";
import { test } from "node:test";
import { guard } from "./harness.mjs";
import { real, full, paths, resolve } from "./real-core.mjs";
test(
  "B Core KAT: new source literal tops/direct paths/pages/arrays/escaped segment and owner chain",
  guard,
  async (t) => {
    const c = await real(t),
      top = c.roots.find((r) => r.name === "b_tree_top"),
      other = c.roots.find((r) => r.name === "b_tree_other");
    assert.equal(other.childCount, 1);
    assert.equal(top.childCount, 10);
    const all = [],
      cursors = new Set();
    let cursor;
    do {
      const result = full(
        await c.client.children(
          top.ref,
          cursor === undefined ? { limit: 1 } : { limit: 1, cursor },
        ),
      );
      assert.equal(result.items.length, 1);
      all.push(...result.items);
      cursor = result.next;
      if (cursor !== undefined) {
        assert.equal(typeof cursor, "string");
        assert.ok(cursor.length > 0);
        assert.equal(cursors.has(cursor), false);
        cursors.add(cursor);
      }
      assert.ok(all.length <= 10);
    } while (cursor !== undefined);
    assert.deepEqual(
      all.map((r) => r.path),
      paths.map((p) => ["b_tree_top", ...p]),
    );
    assert.deepEqual(
      all.map((r) => r.name),
      [
        "left",
        "right",
        "left",
        "right",
        "left",
        "right",
        "a.b",
        "lanes[0]",
        "lanes[1]",
        "plain",
      ],
    );
    assert.deepEqual(
      all.map((r) => r.childCount),
      [1, 0, 1, 0, 1, 0, 0, 1, 1, 0],
    );
    assert.equal(new Set(all.map((r) => r.ref)).size, 10);
    const ref = await resolve(c, "b_tree_top/g[2]/left/child");
    assert.deepEqual(
      full(await c.client.ancestors(ref)).map((x) => x.path),
      [["b_tree_top"], ["b_tree_top", "g[2]", "left"]],
    );
    const ports = full(await c.client.ports(ref));
    assert.deepEqual(
      ports.map((p) => [p.name, p.direction, p.width]),
      [
        ["d", "in", 1],
        ["y", "out", 1],
      ],
    );
    const port = full(await c.client.object(ports[0].ref));
    assert.equal(port.inst, ref);
    assert.equal(port.kind, "port");
    await c.close();
  },
);
