// Read-only generated XiangShan input, public SDK/Node/Core under confirmed budgets.
// Counts are observations, not A-derived expected values. Semantic KATs are separate.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = process.env.HIER_B_PRODUCT_ROOT,
  bin = process.env.HIER_BIN;
const { createProcessTransport } = await import(
  pathToFileURL(path.join(root, "web/packages/client/dist/node/index.js"))
);
const { HierClient } = await import(
  pathToFileURL(path.join(root, "web/packages/client/dist/index.js"))
);
const filelist = process.argv[2],
  output = process.argv[3];
const transport = createProcessTransport({
  command: bin,
  args: [
    "serve",
    "--top",
    "XSTop",
    "--unknown-modules-are-errors",
    "-F",
    filelist,
  ],
  resourceLimits: {
    openTimeoutMillis: 30000,
    cancelTimeoutMillis: 2000,
    maxRssBytes: 4294967296,
  },
});
transport.exited.catch(() => {});
const client = new HierClient(transport),
  report = {
    filelist,
    limits: {
      openTimeoutMillis: 30000,
      cancelTimeoutMillis: 2000,
      maxRssBytes: 4294967296,
    },
    complete: false,
  };
const start = performance.now();
try {
  report.snapshot = await client.ready;
  report.openMillis = performance.now() - start;
  report.diagnostics = (await client.diagnostics({ maxItems: 10000 })).result;
  assert.equal(report.diagnostics.errorCount, 0);
  assert.equal(report.diagnostics.warningCount, 0);
  const roots = await client.roots();
  assert.equal(roots.completeness.status, "complete");
  assert.deepEqual(
    roots.result.map((x) => x.name),
    ["XSTop"],
  );
  report.ports = (await client.ports(roots.result[0].ref)).result.length;
  assert.ok(report.ports > 0);
  const refs = new Set(),
    cursors = new Set();
  let cursor;
  report.pages = [];
  do {
    const page = await client.search(
      { text: "", kinds: ["instance"] },
      { limit: 200, ...(cursor ? { cursor } : {}) },
    );
    assert.equal(page.completeness.status, "complete");
    for (const hit of page.result.items) {
      assert.equal(hit.kind, "instance");
      assert.ok(!refs.has(hit.ref), "no duplicate occurrence");
      refs.add(hit.ref);
    }
    report.pages.push(page.result.items.length);
    cursor = page.result.next;
    if (cursor) {
      assert.ok(!cursors.has(cursor), "cursor progresses");
      cursors.add(cursor);
    }
  } while (cursor);
  report.instances = refs.size;
  assert.ok(refs.has(roots.result[0].ref));
  report.complete = true;
} catch (error) {
  report.error = {
    name: error.name,
    message: error.message,
    code: error.code,
    data: error.data,
  };
  throw error;
} finally {
  client.dispose();
  report.exit = await transport.exited;
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
}
assert.deepEqual(report.exit, { code: 0, signal: null });
