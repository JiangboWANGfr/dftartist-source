// D research: real library calls with controlled data; no browser or product UI.
// Usage: node client-ui.mjs <research temp dir> <workspace repo>
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const [base, repo] = process.argv.slice(2).map((p) => resolve(p));
const npmRequire = createRequire(resolve(base, "npm/package.json"));
const { build } = createRequire(resolve(repo, "web/package.json"))("esbuild");
const { LRUCache } = npmRequire("lru-cache");
const { QueryClient, QueryObserver } = npmRequire("@tanstack/query-core");
const { Virtualizer } = npmRequire("@tanstack/virtual-core");
const ELK = npmRequire("elkjs/lib/elk.bundled.js");
const out = resolve(base, "js-build");
await mkdir(out, { recursive: true });
const result = { limits: "Controlled Node probes; no React rendering, browser Worker, accessibility or performance acceptance." };

async function bundle(file, name) {
  const output = resolve(out, name + ".mjs");
  await build({ entryPoints: [file], bundle: true, platform: "node", format: "esm", outfile: output });
  return import(pathToFileURL(output).href);
}
const { ReplyCache } = await bundle(resolve(base, "source/web/packages/client/src/reply-cache.ts"), "reply-cache");
const bytes = (value, key) => new TextEncoder().encode(key).length + new TextEncoder().encode(JSON.stringify(value)).length;
const value = (text) => Object.freeze({ result: text, completeness: { status: "complete" } });
function candidate(max, maxSize) {
  const cache = max && maxSize ? new LRUCache({ max, maxSize, sizeCalculation: bytes }) : null;
  return {
    get: (key) => cache?.get(key),
    put: (key, v) => {
      // Current contract: oversized insertion is ignored, including replacement.
      if (cache && bytes(v, key) <= maxSize) cache.set(key, v);
    },
    clear: () => cache?.clear(),
  };
}
let observations = 0;
for (const [entries, budget] of [[2, 200], [3, 125], [0, 200], [2, 0]]) {
  const a = new ReplyCache(entries, budget), b = candidate(entries, budget);
  const ops = [
    ["put", "a", value("甲")], ["put", "b", value("乙")], ["get", "a"],
    ["put", "c", value("丙")], ["get", "b"], ["get", "a"],
    ["put", "a", value("x".repeat(300))], ["get", "a"],
    ["put", "c", value("new")], ["get", "c"], ["clear"], ["get", "c"],
  ];
  for (const [op, ...args] of ops) {
    assert.deepEqual(a[op](...args), b[op](...args));
    observations++;
  }
}
result.cache = { matched_operations: observations, scenarios: 4, candidate_adapter: "max + maxSize + UTF-8 sizeCalculation; zero/oversized guards" };
for (const [name, source, dir] of [
  ["current_cache", `export { ReplyCache } from ${JSON.stringify(resolve(base, "source/web/packages/client/src/reply-cache.ts"))};`, base],
  ["lru_cache", 'export { LRUCache } from "lru-cache";', resolve(base, "npm")],
]) {
  const built = await build({ stdin: { contents: source, resolveDir: dir, loader: "ts" }, bundle: true, minify: true, platform: "browser", format: "esm", write: false, metafile: true });
  const data = built.outputFiles[0].contents;
  result.cache[name] = { minified_bytes: data.length, gzip_bytes: gzipSync(data).length, inputs: Object.keys(built.metafile.inputs) };
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
let starts = 0, aborts = 0;
const options = { queryKey: ["snapshot", "ports", "i1"], queryFn: ({ signal }) => {
  starts++;
  return new Promise((_, reject) => signal.addEventListener("abort", () => { aborts++; reject(new Error("aborted")); }, { once: true }));
} };
const o1 = new QueryObserver(qc, options), o2 = new QueryObserver(qc, options);
const off1 = o1.subscribe(() => {}), off2 = o2.subscribe(() => {});
assert.equal(starts, 1);
off1(); assert.equal(aborts, 0);
off2(); assert.equal(aborts, 1);
const partial = { result: [], completeness: { status: "partial" } };
await qc.fetchQuery({ queryKey: ["trace"], queryFn: async () => partial });
assert.deepEqual(qc.getQueryData(["trace"]), partial);
result.query = { starts_for_two_observers: starts, aborts_after_last_unsubscribe: aborts, partial_cached_as_success: true, configuration: "retry false, gcTime Infinity; signal consumed" };
qc.clear();

const { createRoot, ROOT_ID } = await bundle(resolve(repo, "ref/react-arborist/modules/react-arborist/src/data/create-root.ts"), "arborist-root");
const { createList } = await bundle(resolve(repo, "ref/react-arborist/modules/react-arborist/src/data/create-list.ts"), "arborist-list");
let visits = 0;
const tree = {
  props: { data: [{ id: "branch", children: [] }] },
  accessId: (d) => { visits++; return d.id; },
  accessChildren: (d) => d.children ?? null,
  isDraggable: () => false,
  isOpen: (id) => id === ROOT_ID,
  isFiltered: false,
};
tree.root = createRoot(tree);
assert.equal(tree.root.children[0].isInternal, true);
const emptyVisits = visits;
tree.props.data[0].children = Array.from({ length: 10000 }, (_, i) => ({ id: `i${i}` }));
visits = 0; tree.root = createRoot(tree);
const collapsed = createList(tree).list;
assert.equal(visits, 10001); assert.equal(collapsed.length, 1);
const collapsedVisits = visits;
tree.isOpen = () => true;
const expanded = createList(tree).list;
assert.equal(expanded.length, 10001);
tree.props.data[0].children.push({ id: "next-page" });
visits = 0; tree.root = createRoot(tree);
assert.equal(visits, 10002);
result.arborist = { empty_remote_branch_is_internal: true, initial_visits: emptyVisits, collapsed_visible_rows: collapsed.length, collapsed_loaded_nodes_visited: collapsedVisits, expanded_rows: expanded.length, visits_after_page_append: visits, note: "Real createRoot/createList/NodeApi; controlled TreeApi-shaped object. No rendered Tree component." };

const virtual = new Virtualizer({ count: 100001, getScrollElement: () => null, estimateSize: () => 20, scrollToFn: () => {}, observeElementRect: () => {}, observeElementOffset: () => {}, initialRect: { width: 800, height: 500 }, overscan: 2, getItemKey: (i) => `object-${i}` });
const rows = virtual.getVirtualItems();
assert.ok(rows.length > 0 && rows.length < 40);
assert.equal(rows[0].key, "object-0");
result.virtual = { count: 100001, returned_rows: rows.length, total_size: virtual.getTotalSize(), note: "Synthetic initialRect, no DOM/scroll events. Count is supplied, no remote fetch." };

const elk = new ELK();
const graph = {
  id: "root", layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT" },
  children: [
    { id: "a", width: 80, height: 60, layoutOptions: { "elk.portConstraints": "FIXED_ORDER" }, ports: [
      { id: "a.p0", width: 4, height: 4, layoutOptions: { "elk.port.side": "EAST", "elk.port.index": "0" } },
      { id: "a.p1", width: 4, height: 4, layoutOptions: { "elk.port.side": "EAST", "elk.port.index": "1" } },
    ] },
    { id: "b", width: 80, height: 60, ports: [{ id: "b.p", width: 4, height: 4 }] },
    { id: "c", width: 80, height: 60, ports: [{ id: "c.p", width: 4, height: 4 }] },
  ],
  edges: [
    { id: "fact1", sources: ["a.p0"], targets: ["b.p"] },
    { id: "fact2", sources: ["a.p0"], targets: ["b.p"] },
    { id: "fact3", sources: ["a.p1"], targets: ["c.p"] },
  ],
};
const before = JSON.stringify(graph);
const laid = await elk.layout(graph);
assert.deepEqual(laid.edges.map((e) => e.id), ["fact1", "fact2", "fact3"]);
assert.ok(laid.edges.every((e) => e.sections?.length));
assert.ok(laid.children.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
result.elk = { input_unchanged: before === JSON.stringify(graph), nodes: laid.children.length, independent_parallel_edge_ids: laid.edges.map((e) => e.id), edge_sections: laid.edges.map((e) => e.sections.length), ports: laid.children[0].ports, note: "Actual bundled layout in Node; not a browser Worker test." };
try {
  elk.terminateWorker();
  result.elk.bundled_terminate = "returned";
} catch (error) {
  result.elk.bundled_terminate = { error: String(error), scope: "Bundled no-worker fallback only" };
}

await writeFile(resolve(base, "client-ui-result.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
