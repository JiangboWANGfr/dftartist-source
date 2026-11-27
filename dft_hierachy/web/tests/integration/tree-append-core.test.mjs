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
for (const showGenerateScopes of [false, true]) {
  test(`A M7 append: actual Core wide middle-page publication, scope fallback and reload (scopes=${showGenerateScopes})`,
    { timeout: 20000 }, async (t) => {
      assert.ok(process.env.HIER_BIN, "HIER_BIN must name this checkout's actual Core");
      const directory = await mkdtemp(join(tmpdir(), "hier-a-append-core-")), file = join(directory, "append.sv");
      const names = Array.from({ length: 70 }, (_, i) => `c${String(i).padStart(3, "0")}`);
      await writeFile(file, `module append_leaf; endmodule
module append_branch;
${names.map((n) => `append_leaf ${n}();`).join("\n")}
if (1) begin : g
  append_leaf generated();
end
endmodule
module append_top; append_branch left(); append_leaf tail(); endmodule\n`);
      const transport = createProcessTransport({ command: resolve(process.env.HIER_BIN), args: ["serve", file, "--top", "append_top"] });
      const client = new HierClient(transport, { cacheEntries: 0 }); let tree;
      t.after(async () => { tree?.dispose(); client.dispose();
        assert.deepEqual(await transport.exited, { code: 0, signal: null }); await rm(directory, { recursive: true }); });
      await client.ready; tree = new TreeModel(client, { pageSize: 16, showGenerateScopes });
      await tree.loadRoots(); const top = tree.rows[0]; await tree.setExpanded(top.id, true);
      const left = tree.rows.find((r) => r.kind === "instance" && r.instance.name === "left"), tail = tree.rows.at(-1);
      let notifications = 0;
      const unsubscribe = tree.subscribe(() => {
        notifications++; assert.ok(Object.isFrozen(tree.rows) && tree.rows.every(Object.isFrozen));
        const owner = tree.rows.find((r) => r.id === left.id);
        const loaded = tree.rows.filter((r) => r.kind === "instance" && r.depth === (showGenerateScopes && r.instance.name === "generated" ? 3 : 2));
        assert.equal(owner.children.loadedCount, loaded.length);
        const status = tree.rows.find((r) => r.kind === "status" && r.owner === left.id);
        if (status) { assert.equal(status.state, owner.children); assert.equal(tree.rows.at(-2), status); }
        assert.equal(tree.rows.at(-1), tail);
      });
      await tree.setExpanded(left.id, true);
      const first = tree.rows, text = JSON.stringify(first), prefix = first.find((r) => r.kind === "instance" && r.instance.name === "c000");
      while (tree.rows.find((r) => r.id === left.id).children.next) await tree.loadMore(left.id);
      const expected = ["append_top", "left", ...names, ...(showGenerateScopes ? ["g"] : []), "generated", "tail"];
      assert.deepEqual(labels(tree), expected); assert.equal(tree.rows.find((r) => r.id === prefix.id), prefix);
      assert.equal(JSON.stringify(first), text); assert.equal(notifications, 10); unsubscribe();
      const completeRows = tree.rows, completeText = JSON.stringify(completeRows);
      await tree.setExpanded(left.id, false); await tree.reload(left.id);
      assert.deepEqual(labels(tree), ["append_top", "left", "tail"]);
      await tree.setExpanded(left.id, true);
      while (tree.rows.find((r) => r.id === left.id).children.next) await tree.loadMore(left.id);
      assert.deepEqual(labels(tree), expected); assert.equal(tree.rows.find((r) => r.id === prefix.id).instance.ref, prefix.instance.ref);
      assert.equal(JSON.stringify(completeRows), completeText); tree.dispose();
      assert.equal((await client.roots()).result[0].ref, top.instance.ref);
    });
}
