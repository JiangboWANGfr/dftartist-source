import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
import {
  DefinitionInstancesModel,
  InstancePropertiesModel,
  PathResolutionModel,
  SearchModel,
  SelectionModel,
  SourceNavigationModel,
  TreeModel,
} from "@hier/viewmodel";

const command = process.env.HIER_BIN;
assert(command, "explicit checkout-owned Core required");
const fixture = fileURLToPath(new URL("../search/search.sv", import.meta.url));

// Existing packages only: no proposed host IPC, controller, React UI or Electron.
for (const kind of ["source", "filelist"]) {
  test(`A demo capability: ${kind} input to existing shared models and owned close`, async (t) => {
    // Relative filelist entries must start at the actual directory, including
    // macOS's /var -> /private/var alias. Do not change Core path semantics.
    const dir = await realpath(await mkdtemp(path.join(tmpdir(), "hier-demo-contract-")));
    const list = path.join(dir, "design.f");
    await writeFile(list, path.relative(dir, fixture) + "\n");
    const transport = createProcessTransport({
      command: path.resolve(command),
      args: ["serve", "--top", "search_top", ...(kind === "source" ? [fixture] : ["-F", list])],
      cwd: kind === "source" ? path.dirname(fixture) : dir,
    });
    const client = new HierClient(transport);
    const models = [];
    t.after(async () => {
      try {
        for (const model of models) model.dispose();
      } finally {
        client.dispose();
        try {
          const exited = await transport.exited;
          assert.deepEqual(exited, { code: 0, signal: null });
          console.log(JSON.stringify({ kind, exited, demoExecuted: false }));
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      }
    });
    const { snapshotId } = await client.ready;
    const selection = new SelectionModel({ snapshotId });
    const tree = new TreeModel(client);
    const properties = new InstancePropertiesModel(client);
    const navigation = new SourceNavigationModel(client);
    const search = new SearchModel(client);
    const instances = new DefinitionInstancesModel(client);
    const resolution = new PathResolutionModel(client);
    models.push(tree, properties, navigation, search, instances, resolution, selection);
    const roots = (await client.roots()).result;
    assert.equal(roots.length, 1);
    const root = roots[0];
    await tree.loadRoots();
    selection.select({ snapshotId, origin: "tree", items: [{ ref: root.ref }] });
    await properties.load(root.ref);
    assert.equal(properties.state.status, "success");
    await navigation.load(root.ref, "definition");
    assert.equal(navigation.state.document.status, "success");
    assert.equal(navigation.state.document.data.location.status, "exact");
    await search.load({ snapshotId, text: "needle" });
    assert.equal(search.state.status, "success");
    assert(search.state.pages.some((page) => page.result.items.length > 0));
    await resolution.load({ snapshotId, text: "search_top.left" });
    assert.equal(resolution.state.status, "success");
    assert.equal(resolution.state.reply.result.length, 1);
    // Resolving alone does not select. Explicit original-ref selection drives reveal.
    assert.equal(selection.current.items[0].ref, root.ref);
    const ref = resolution.state.reply.result[0];
    selection.select({ snapshotId, origin: "external", items: [{ ref }] });
    await tree.reveal(ref);
    await instances.load({ snapshotId, def: root.def });
    assert.equal(instances.state.status, "success");
    assert.equal(selection.current.items[0].ref, ref);
    assert.equal((await client.roots()).result[0].ref, root.ref);
  });
}
