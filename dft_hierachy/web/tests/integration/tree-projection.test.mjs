import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
import { TreeModel } from "@hier/viewmodel";

const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must name this checkout's actual Core");
const instance = (tree, ref) => tree.rows.find(
  (row) => row.kind === "instance" && row.instance.ref === ref,
);
for (const perInstance of [false, true]) {
  test(`A M7 tree projection: real Core paging/reload and scope visibility (${perInstance ? "per instance" : "shared"})`,
    { timeout: 20000 }, async (t) => {
      const directory = await mkdtemp(join(tmpdir(), "hier-a-tree-projection-core-"));
      const file = join(directory, "projection.sv");
      await writeFile(file, `module projection_leaf; endmodule
module projection_branch; projection_leaf inside_leaf(); endmodule
module tree_projection_top;
  for (genvar i=0; i<3; i++) begin : g
    projection_branch a();
    projection_leaf b();
  end
  projection_leaf tail();
endmodule
`);
      const transport = createProcessTransport({ command: resolve(command),
        args: ["serve", file, "--top", "tree_projection_top", ...(perInstance ? ["--per-instance-bodies"] : [])] });
      const client = new HierClient(transport, { cacheEntries: 0 });
      let tree;
      t.after(async () => {
        tree?.dispose();
        client.dispose();
        assert.deepEqual(await transport.exited, { code: 0, signal: null });
        await rm(directory, { recursive: true });
      });
      await client.ready;
      tree = new TreeModel(client, { pageSize: 2 });
      await tree.loadRoots();
      const top = tree.rows.find((row) => row.kind === "instance");
      const expected = (await client.children(top.instance.ref, { limit: 200 })).result.items;
      assert.equal(expected.length, 7);
      await tree.setExpanded(top.id, true);
      const first = instance(tree, expected[0].ref), firstScope = tree.rows.find((row) => row.kind === "scope");
      assert.equal(firstScope.label, "g[0]");
      const retained = tree.rows, retainedText = JSON.stringify(retained);
      while (instance(tree, top.instance.ref).children.next) await tree.loadMore(top.id);
      assert.deepEqual(tree.rows.filter((row) => row.kind === "instance").slice(1).map((row) => row.instance), expected);
      assert.equal(instance(tree, first.instance.ref), first);
      assert.equal(tree.rows.find((row) => row.id === firstScope.id), firstScope);
      assert.equal(JSON.stringify(retained), retainedText);
      assert.ok(Object.isFrozen(retained) && retained.every(Object.isFrozen));
      await tree.setExpanded(first.id, true);
      const nested = tree.rows.find((row) => row.kind === "instance" && row.instance.name === "inside_leaf");
      assert.equal(nested.depth, 3);
      await tree.setShowGenerateScopes(false);
      assert.equal(instance(tree, first.instance.ref).depth, 1);
      assert.equal(instance(tree, first.instance.ref).parentId, top.id);
      assert.equal(instance(tree, nested.instance.ref).depth, 2);
      assert.equal(tree.rows.some((row) => row.kind === "scope"), false);
      await tree.setShowGenerateScopes(true);
      assert.equal(instance(tree, nested.instance.ref).depth, 3);
      await tree.setExpanded(firstScope.id, false);
      assert.equal(instance(tree, first.instance.ref), undefined);
      await tree.reload(top.id);
      while (instance(tree, top.instance.ref).children.next) await tree.loadMore(top.id);
      assert.equal(instance(tree, first.instance.ref), undefined);
      assert.equal(tree.rows.find((row) => row.id === firstScope.id).expanded, false);
      await tree.setExpanded(firstScope.id, true);
      const reloaded = instance(tree, first.instance.ref);
      assert.equal(reloaded.id, first.id);
      assert.notEqual(reloaded.instance, first.instance);
      assert.equal(reloaded.expanded, true);
      assert.equal(reloaded.children.status, "idle");
      await tree.setExpanded(first.id, true);
      assert.equal(instance(tree, nested.instance.ref).id, nested.id);
      assert.equal(instance(tree, nested.instance.ref).depth, 3);
      const last = tree.rows, text = JSON.stringify(last);
      tree.dispose();
      assert.deepEqual(tree.rows, []);
      assert.equal((await client.roots()).result[0].ref, top.instance.ref);
      assert.equal(JSON.stringify(last), text);
      assert.equal(JSON.stringify(retained), retainedText);
    });
}
