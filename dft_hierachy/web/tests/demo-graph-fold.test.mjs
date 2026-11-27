import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { transform } from "esbuild";
import { _electron } from "playwright";

const web = fileURLToPath(new URL("../", import.meta.url));
const consumer = process.env.HIER_A_DEMO_DELIVERY;
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo");
const requireProduct = createRequire(path.join(consumer ?? web, "package.json"));
const design = fileURLToPath(new URL("./demo-graph/hierarchy.sv", import.meta.url));
async function publicEntry(packageName, subpath = ".") {
  const root = path.join(consumer ?? web, "node_modules", packageName);
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const exported = manifest.exports[subpath];
  return pathToFileURL(path.join(root, typeof exported === "string" ? exported : exported.import));
}

test("A: real Core instance groups reject cancelled, stale and disposed results", async (t) => {
  assert(process.env.HIER_BIN, "explicit actual Core executable");
  // Compile the actual host, resolving the same installed public model used by this consumer.
  const compiled = await transform(await readFile(path.join(app, "src/design-graph.ts"), "utf8"), {
    loader: "ts",
    format: "esm",
    target: "es2022",
  });
  const code = compiled.code.replace(
    '"@hier/viewmodel"',
    JSON.stringify(pathToFileURL(requireProduct.resolve("@hier/viewmodel")).href),
  );
  const { DesignGraph } = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  // Consumer SDK as well: brands, graph and host must all come from that one installation.
  const { HierClient: Client } = await import(await publicEntry("@hier/client"));
  const { createProcessTransport: transportFactory } = await import(
    await publicEntry("@hier/client", "./node")
  );
  const transport = transportFactory({
    command: process.env.HIER_BIN,
    args: ["serve", "--top", "demo_fold_top", design],
  });
  const client = new Client(transport);
  t.after(async () => {
    client.dispose();
    await transport.exited;
  });
  await client.ready;
  const owned = new DesignGraph(client);
  t.after(() => owned.dispose());
  const top = (await client.roots()).result.find((item) => item.name === "demo_fold_top");
  const port = (await client.ports(top.ref)).result.find((item) => item.name === "y");
  await owned.load({
    start: { slice: { ref: port.ref, bits: { lsb: 0, width: 4 } }, side: "inside" },
    direction: "back",
    policy: "combinational",
    budget: { maxNodes: 100, maxEdges: 200, maxDepth: 20, maxMillis: 1000 },
  });
  const state = owned.graph.state;
  const groups = await owned.instanceGroups(state, new AbortController().signal);
  assert.deepEqual(
    groups
      .filter((group) => group.kind === "hierarchy")
      .map((group) => group.label)
      .sort(),
    ["实例 demo_fold_top", "实例 demo_fold_top.first", "实例 demo_fold_top.second"],
  );
  assert.equal(owned.graph.state, state, "metadata lookup never republishes graph facts");
  assert.equal(groups.filter((group) => group.kind === "bus").length, 1);

  // Delay only the delivery of a genuine SDK/Core result; no invented DTO, time race or sleep.
  const object = client.object.bind(client);
  client.object = (_ref, signal) => object("invalid-reference", signal);
  await assert.rejects(owned.instanceGroups(state, new AbortController().signal), {
    code: "bad_request",
  });
  assert.equal(owned.graph.state, state, "Core metadata failure keeps the trace facts");
  let release;
  let queried;
  let arrived;
  const hold = () => {
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    arrived = new Promise((resolve) => {
      queried = resolve;
    });
    client.object = async (...args) => {
      const reply = await object(...args);
      queried();
      await gate;
      return reply;
    };
  };
  hold();
  const cancel = new AbortController();
  const cancelled = assert.rejects(owned.instanceGroups(state, cancel.signal), {
    name: "AbortError",
  });
  await arrived;
  cancel.abort();
  release();
  await cancelled;
  assert.equal(owned.graph.state, state);

  hold();
  const stale = assert.rejects(owned.instanceGroups(state, new AbortController().signal), {
    code: "stale_graph",
  });
  await arrived;
  await owned.trace.clear();
  release();
  await stale;
  assert.equal(owned.graph.state.nodes.length, 0);
  owned.dispose();
  await assert.rejects(owned.instanceGroups(state, new AbortController().signal), {
    code: "disposed",
  });
});

test(
  "A: real Electron instance folding and bus bundling preserve every original member",
  { timeout: 90_000 },
  async () => {
    assert(process.env.HIER_BIN, "explicit actual Core executable");
    const electron = await _electron.launch({
      executablePath: requireProduct("electron"),
      args: [app],
      env: process.env,
    });
    const errors = [];
    try {
      await electron.evaluate(({ dialog }, input) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
      }, design);
      const page = await electron.firstWindow();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.waitForSelector(".demo-status[data-phase=idle]");
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
      await page.waitForSelector(".demo-status[data-phase=ready]");
      await page.getByRole("button", { name: "显示原理图", exact: true }).click();
      await page.getByRole("button", { name: "双视图", exact: true }).click();
      await page.getByRole("button", { name: "高级控制", exact: true }).click();
      await page.getByRole("button", { name: "来源与详情", exact: true }).click();
      for (const label of ["追踪选项", "演示与标注", "分组与折叠"]) {
        await page.locator("summary").filter({ hasText: label }).click();
      }
      await page
        .getByRole("tree", { name: "设计层级", exact: true })
        .getByRole("treeitem")
        .filter({ hasText: "demo_fold_top" })
        .first()
        .click();
      await page
        .getByRole("region", { name: "实例属性", exact: true })
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: "y", exact: true }) })
        .getByRole("button", { name: "选择端口", exact: true })
        .click();
      await page.getByRole("combobox", { name: "追踪侧", exact: true }).selectOption("inside");
      await page.getByRole("spinbutton", { name: "追踪 width", exact: true }).fill("4");
      await page.getByRole("button", { name: "追踪所选对象", exact: true }).click();
      const schematic = page.getByRole("region", { name: "设计原理图", exact: true });
      await schematic.getByText("design · success", { exact: true }).waitFor();
      const layout = async () => {
        await schematic.getByRole("button", { name: "布局", exact: true }).click();
        await schematic.locator('[role="status"]').getByText("success", { exact: true }).waitFor();
      };
      await layout();
      const counts = async () => ({
        nodes: await schematic.locator("svg g.hier-schematic-view__node").count(),
        edges: await schematic.locator("svg g.hier-schematic-view__edge").count(),
      });
      const members = async () => {
        const result = [];
        const items = schematic.locator("svg g[data-graph-key]");
        for (let i = 0; i < (await items.count()); i++) {
          await items.nth(i).focus();
          const key = await items.nth(i).getAttribute("data-graph-key");
          await page.waitForFunction((expected) => {
            const split = expected.indexOf(":");
            const kind = expected.slice(0, split),
              id = expected.slice(split + 1);
            return document
              .querySelector('[aria-label="图元详情"]')
              ?.textContent.includes(`${kind} · ${id}`);
          }, key);
          result.push(
            ...(await schematic.locator(".hier-schematic-view__member").allTextContents()),
          );
        }
        assert.equal(new Set(result).size, result.length, "no original member is duplicated");
        return result.sort();
      };
      const initial = await counts();
      const original = await members();
      assert(initial.nodes > 6 && initial.edges > 6);
      const sources = await schematic
        .getByRole("region", { name: "图来源", exact: true })
        .textContent();
      await page.getByRole("button", { name: "按所属实例分组", exact: true }).click();
      await page
        .getByRole("region", { name: "图工作区", exact: true })
        .getByText("分组查询：success", { exact: true })
        .waitFor();
      const folds = schematic.getByRole("region", { name: "折叠分组", exact: true });
      assert.equal(await folds.getByRole("button", { name: /^折叠 hierarchy 实例 / }).count(), 3);
      const toggleInstances = async (verb) => {
        const buttons = folds.getByRole("button", { name: new RegExp(`^${verb} hierarchy 实例 `) });
        while (await buttons.count()) await buttons.first().click();
      };
      const foldedCounts = [];
      // Both operation orders reach the same lossless display, then recover every original edge.
      for (const busFirst of [false, true]) {
        if (busFirst) await folds.getByRole("button", { name: /^折叠 bus 追踪边束/ }).click();
        await toggleInstances("折叠");
        if (!busFirst) await folds.getByRole("button", { name: /^折叠 bus 追踪边束/ }).click();
        await layout();
        const folded = await counts();
        foldedCounts.push(folded);
        assert.equal(folded.nodes, 3);
        assert(folded.edges < initial.edges);
        assert(
          (await schematic.locator('svg g[aria-label$=" 追踪边束"]').count()) > 0,
          "real parallel boundary edges are bundled",
        );
        assert.deepEqual(
          await members(),
          original,
          "visible members plus internal edges preserve full facts and owners",
        );
        if (process.env.HIER_A_FOLD_SCREENSHOT && !busFirst)
          await page.screenshot({ path: process.env.HIER_A_FOLD_SCREENSHOT });
        await toggleInstances("展开");
        await folds.getByRole("button", { name: /^展开 bus 追踪边束/ }).click();
        await layout();
        assert.deepEqual(await counts(), initial);
        assert.deepEqual(await members(), original);
      }
      assert.equal(
        await schematic.getByRole("region", { name: "图来源", exact: true }).textContent(),
        sources,
        "folding issues no source refresh",
      );
      await page.getByRole("button", { name: "添加外部示例", exact: true }).click();
      await folds.getByRole("button", { name: /^折叠 hierarchy 追踪显示组/ }).waitFor();
      assert.equal(
        await folds.getByRole("button", { name: /hierarchy 实例/ }).count(),
        0,
        "source revision invalidates old groups",
      );
      await page.getByRole("button", { name: "关闭设计", exact: true }).click();
      await page.getByText("设计已关闭", { exact: true }).waitFor();
      assert.deepEqual(errors, []);
      console.log(
        JSON.stringify({
          initial,
          foldedCounts,
          originalMembers: original.length,
          operationOrders: 2,
          pageErrors: errors,
        }),
      );
    } finally {
      await electron.close();
    }
  },
);
