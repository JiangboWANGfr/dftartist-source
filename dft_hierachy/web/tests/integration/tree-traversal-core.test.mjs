import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
const { TreeModel } = await import(process.env.HIER_A_VIEWMODEL_ROOT
  ? pathToFileURL(join(process.env.HIER_A_VIEWMODEL_ROOT, "index.js")) : "@hier/viewmodel");
const labels = (tree) => tree.rows.map((row) => row.kind === "instance" ? row.instance.name
  : row.kind === "scope" ? row.label : row.state.status);
const byRef = (tree, ref) => tree.rows.find((row) => row.kind === "instance" && row.instance.ref === ref);
for (const showGenerateScopes of [false, true]) {
  test(`A M7 tree traversal: actual Core paged scopes, nested status order and reload (scopes=${showGenerateScopes})`,
    { timeout: 20000 }, async (t) => {
      assert.ok(process.env.HIER_BIN, "HIER_BIN must name this checkout's actual Core");
      const directory = await mkdtemp(join(tmpdir(), "hier-a-traversal-core-")), file = join(directory, "walk.sv");
      await writeFile(file, `module walk_leaf; endmodule
module walk_branch;
  walk_leaf first();
  for (genvar i=0; i<2; i++) begin : g
    walk_leaf generated();
  end
endmodule
module walk_top; walk_branch left(); walk_branch right(); endmodule\n`);
      const transport = createProcessTransport({ command: resolve(process.env.HIER_BIN), args: ["serve", file, "--top", "walk_top"] });
      const client = new HierClient(transport, { cacheEntries: 0 }); let tree;
      t.after(async () => { tree?.dispose(); client.dispose();
        assert.deepEqual(await transport.exited, { code: 0, signal: null });
        await rm(directory, { recursive: true }); });
      await client.ready; tree = new TreeModel(client, { pageSize: 1, showGenerateScopes });
      await tree.loadRoots(); const top = tree.rows[0];
      await tree.setExpanded(top.id, true);
      const left = tree.rows.find((row) => row.kind === "instance" && row.instance.name === "left");
      await tree.setExpanded(left.id, true);
      assert.deepEqual(labels(tree), ["walk_top", "left", "first", "success", "success"]);
      assert.equal(tree.rows.at(-2).owner, left.id); assert.equal(tree.rows.at(-1).owner, top.id);
      const prefix = tree.rows, prefixText = JSON.stringify(prefix);
      while (byRef(tree, left.instance.ref).children.next) await tree.loadMore(left.id);
      assert.equal(tree.rows.at(-1).kind, "status"); assert.equal(tree.rows.at(-1).owner, top.id);
      await tree.loadMore(top.id);
      const right = tree.rows.find((row) => row.kind === "instance" && row.instance.name === "right");
      assert.equal(tree.rows.at(-1), right);
      await tree.setExpanded(right.id, true);
      while (byRef(tree, right.instance.ref).children.next) await tree.loadMore(right.id);
      const branchLabels = showGenerateScopes ? ["first", "g[0]", "generated", "g[1]", "generated"]
        : ["first", "generated", "generated"];
      assert.deepEqual(labels(tree), ["walk_top", "left", ...branchLabels, "right", ...branchLabels]);
      assert.equal(tree.rows.filter((row) => row.kind === "instance").length, 9);
      assert.equal(tree.rows.some((row) => row.kind === "status"), false);
      const completeRows = tree.rows, completeText = JSON.stringify(completeRows);
      await tree.setExpanded(left.id, false);
      assert.deepEqual(labels(tree), ["walk_top", "left", "right", ...branchLabels]);
      await tree.reload(left.id); // A collapsed reload must not expose its loaded prefix.
      assert.deepEqual(labels(tree), ["walk_top", "left", "right", ...branchLabels]);
      await tree.setExpanded(left.id, true);
      while (byRef(tree, left.instance.ref).children.next) await tree.loadMore(left.id);
      assert.deepEqual(labels(tree), ["walk_top", "left", ...branchLabels, "right", ...branchLabels]);
      assert.equal(JSON.stringify(prefix), prefixText); assert.equal(JSON.stringify(completeRows), completeText);
      assert.ok(tree.rows.every(Object.isFrozen));
      tree.dispose(); assert.deepEqual(tree.rows, []);
      assert.equal((await client.roots()).result[0].ref, top.instance.ref);
    });
}
