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
const row = (tree, ref) => tree.rows.find((r) => r.kind === "instance" && r.instance.ref === ref);
const watch = (p) => { void p.catch(() => {}); return p; };
for (const showGenerateScopes of [false, true]) {
  test(`A M7 tree state publication: actual Core queued cancel/retry, atomic pages and reload (scopes=${showGenerateScopes})`,
    { timeout: 20000 }, async (t) => {
      const directory = await mkdtemp(join(tmpdir(), "hier-a-tree-state-core-"));
      const file = join(directory, "state.sv");
      await writeFile(file, `module state_leaf; endmodule
module state_branch; state_leaf a(); state_leaf b(); endmodule
module tree_state_top;
  for (genvar i=0; i<3; i++) begin : g
    state_branch branch();
  end
endmodule
`);
      const transport = createProcessTransport({ command: resolve(command),
        args: ["serve", file, "--top", "tree_state_top"] });
      const client = new HierClient(transport, { cacheEntries: 0 });
      let tree;
      t.after(async () => {
        tree?.dispose(); client.dispose();
        assert.deepEqual(await transport.exited, { code: 0, signal: null });
        await rm(directory, { recursive: true });
      });
      await client.ready;
      tree = new TreeModel(client, { pageSize: 1, showGenerateScopes });
      const notices = [];
      tree.subscribe(() => notices.push(tree.rows));
      await tree.loadRoots();
      const top = tree.rows.find((r) => r.kind === "instance");
      await tree.setExpanded(top.id, true);
      const first = tree.rows.find((r) => r.kind === "instance" && r.id !== top.id);
      const page = watch(tree.loadMore(top.id));
      assert.equal(row(tree, top.instance.ref).children.status, "pending");
      assert.equal(row(tree, first.instance.ref), first);
      const pending = tree.rows, text = JSON.stringify(pending);
      await tree.cancel(top.id); // Queued cancellation, not a CPU-interruption SLA.
      await assert.rejects(page, (error) => error.code === "cancelled");
      assert.equal(row(tree, top.instance.ref).children.status, "cancelled");
      assert.equal(row(tree, top.instance.ref).children.loadedCount, 1);
      assert.equal(JSON.stringify(pending), text);
      while (row(tree, top.instance.ref).children.next) await tree.loadMore(top.id);
      const expected = (await client.children(top.instance.ref, { limit: 200 })).result.items;
      const branches = tree.rows.filter((r) => r.kind === "instance" && r.id !== top.id);
      assert.deepEqual(branches.map((r) => r.instance), expected);
      assert.equal(branches.length, 3);
      const commands = branches.map((r) => watch(tree.setExpanded(r.id, true)));
      const before = tree.rows, beforeText = JSON.stringify(before), count = notices.length;
      const cancel = tree.cancel(null);
      assert.equal(notices.length, count + 1, "the cancellation batch has one publication");
      for (const branch of branches) {
        const current = row(tree, branch.instance.ref);
        assert.equal(current.children.status, "cancelled");
        const status = tree.rows.find((r) => r.kind === "status" && r.owner === current.id);
        assert.equal(status.state, current.children);
      }
      await cancel;
      await Promise.all(commands.map((p) => assert.rejects(p, (error) => error.code === "cancelled")));
      assert.equal(JSON.stringify(before), beforeText);
      for (const branch of branches) {
        while (row(tree, branch.instance.ref).children.status === "cancelled" ||
          row(tree, branch.instance.ref).children.next) await tree.loadMore(branch.id);
        const children = (await client.children(branch.instance.ref, { limit: 200 })).result.items;
        assert.deepEqual(children.map((x) => row(tree, x.ref).instance), children);
        assert.ok(children.every((x) => row(tree, x.ref).depth === row(tree, branch.instance.ref).depth + 1));
      }
      assert.equal(tree.rows.filter((r) => r.kind === "instance").length, 10);
      assert.equal(tree.rows.some((r) => r.kind === "status"), false);
      const retained = tree.rows, retainedText = JSON.stringify(retained);
      await tree.reload(null);
      assert.equal(row(tree, top.instance.ref).id, top.id);
      assert.equal(row(tree, top.instance.ref).children.status, "idle");
      await tree.setExpanded(top.id, true);
      assert.equal(row(tree, top.instance.ref).children.loadedCount, 1);
      assert.equal(JSON.stringify(retained), retainedText);
      assert.equal(JSON.stringify(pending), text);
      assert.ok(notices.every((rows) => Object.isFrozen(rows) && rows.every(Object.isFrozen)));
      tree.dispose();
      assert.deepEqual(tree.rows, []);
      assert.equal((await client.roots()).result[0].ref, top.instance.ref);
    });
}
