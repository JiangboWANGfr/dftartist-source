import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
import { TreeModel } from "@hier/viewmodel";

for (const showGenerateScopes of [false, true])
  test(`A M7 loaded navigation: actual Core paged reveal, cached prefix and reload (scopes=${showGenerateScopes})`, { timeout: 20000 }, async (t) => {
    assert.ok(process.env.HIER_BIN, "HIER_BIN must name A's own fixed Core");
    const directory = await mkdtemp(join(tmpdir(), "hier-a-loaded-core-")), file = join(directory, "loaded.sv");
    await writeFile(file, `module loaded_leaf; endmodule
module loaded_branch;
${Array.from({ length: 511 }, (_, i) => `loaded_leaf n${String(i).padStart(3, "0")}();`).join("\n")}
if (1) begin : g loaded_leaf target(); end
endmodule
module loaded_top; loaded_branch owner(); loaded_leaf tail(); endmodule\n`);
    const transport = createProcessTransport({ command: resolve(process.env.HIER_BIN), args: ["serve", file, "--top", "loaded_top"] }), sent = [];
    // Observe outgoing frames only; all responses and lifecycle are genuine Core.
    const client = new HierClient({ send(frame) { sent.push(structuredClone(frame)); transport.send(frame); },
      onMessage: (h) => transport.onMessage(h), onClose: (h) => transport.onClose(h), close: () => transport.close() }, { cacheEntries: 0 });
    let tree; t.after(async () => { tree?.dispose(); client.dispose(); assert.deepEqual(await transport.exited, { code: 0, signal: null }); await rm(directory, { recursive: true }); });
    await client.ready; tree = new TreeModel(client, { pageSize: 64, showGenerateScopes }); await tree.loadRoots();
    const top = tree.rows[0]; await tree.setExpanded(top.id, true);
    const owner = tree.rows.find((r) => r.kind === "instance" && r.instance.name === "owner");
    const facts = await client.children(owner.instance.ref, { limit: 1000 }); assert.equal(facts.result.items.length, 512);
    const target = facts.result.items.find((i) => i.name === "target"); assert.ok(target);
    const queries = () => sent.filter((q) => q.method === "inst.children" && q.params.inst === owner.instance.ref).length;
    const before = queries(); await tree.reveal(target.ref); assert.equal(queries() - before, 8);
    const targetRow = tree.rows.find((r) => r.kind === "instance" && r.instance.ref === target.ref);
    assert.equal(tree.revealState.rowId, targetRow.id); assert.equal(tree.rows.filter((r) => r.kind === "instance").length, 515);
    assert.equal(tree.rows.filter((r) => r.kind === "scope").length, showGenerateScopes ? 1 : 0);
    const previous = tree.rows, text = JSON.stringify(previous), loaded = queries();
    await tree.reveal(target.ref); assert.equal(queries(), loaded);
    await tree.setExpanded(owner.id, false); await tree.reload(owner.id);
    const afterFirstReloadPage = queries(); await tree.reveal(target.ref); assert.equal(queries() - afterFirstReloadPage, 7);
    assert.equal(tree.revealState.rowId, targetRow.id); assert.equal(JSON.stringify(previous), text);
    tree.dispose(); assert.deepEqual(tree.rows, []); assert.equal((await client.roots()).result[0].ref, top.instance.ref);
    console.log(JSON.stringify({ actualCore: true, showGenerateScopes, firstRevealPages: 8, cachedRevealPages: 0, reloadRemainingPages: 7, loadedInstances: 515 }));
  });
