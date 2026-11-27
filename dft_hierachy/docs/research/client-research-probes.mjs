// Exploratory calls into fixed upstream source, not Hierarchy product tests.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const [ref, output] = process.argv.slice(2);
if (!ref || !output) throw new Error("usage: node client-research-probes.mjs <ref-directory> <output.json>");
const sources = [];
async function sourceModule(relative) {
  const bytes = await readFile(path.join(ref, relative));
  sources.push({ path: relative, sha256: createHash("sha256").update(bytes).digest("hex") });
  return import("data:text/javascript;base64," + bytes.toString("base64"));
}

const findings = [];
const { hyperEdgesToEdges, getNet } = await sourceModule("d3-hwschematic/src/dataPrepare.js");
const net = { id: "fact-net", sources: [["d0", "o"], ["d1", "o"]], targets: [["l0", "i"], ["l1", "i"]], hwMeta: { name: "bus" } };
const graph = { id: "g", edges: [net] };
assert.equal(hyperEdgesToEdges(graph, 10), 14);
assert.equal(graph.edges.length, 4);
assert.ok(graph.edges.every(edge => getNet(edge) === net));
assert.equal(new Set(graph.edges.map(edge => edge.id)).size, 4);
findings.push({ id: "D3-1", scope: "upstream projection function; no DOM or HDL semantics", sources: 2, targets: 2, renderedEdges: 4, originalNetRetained: true, generatedIds: graph.edges.map(edge => edge.id) });

const single = { id: "one", sources: [["d", "o"]], targets: [["l", "i"]], hwMeta: { name: "wire" } };
const small = { id: "g2", edges: [single] };
hyperEdgesToEdges(small, 20);
assert.equal(small.edges[0], single);
assert.equal(single.sources, undefined);
assert.equal(single.source, "d");
findings.push({ id: "D3-2", scope: "upstream projection function", oneToOneInputMutated: true });

const { default: ELK } = await sourceModule("elkjs/src/js/elk-api.js");
class ControlledWorker {
  sent = [];
  terminated = false;
  postMessage(message) { this.sent.push(message); }
  terminate() { this.terminated = true; }
  reply(id, data) { this.onmessage({ data: { id, data } }); }
}
const worker = new ControlledWorker();
const elk = new ELK({ workerFactory: () => worker });
worker.reply(worker.sent[0].id, {});
const old = elk.layout({ id: "old" });
const oldId = worker.sent.at(-1).id;
const fresh = elk.layout({ id: "fresh" });
const freshId = worker.sent.at(-1).id;
worker.reply(freshId, { id: "fresh", children: [] });
assert.equal((await fresh).id, "fresh");
worker.reply(oldId, { id: "old", children: [] });
assert.equal((await old).id, "old");
findings.push({ id: "ELK-1", scope: "upstream JS API with controlled worker transport; no layout computation", freshReplyThenOldReplyBothResolve: true });

const pending = elk.layout({ id: "pending" });
const pendingId = worker.sent.at(-1).id;
let settled = false;
pending.then(() => { settled = true; }, () => { settled = true; });
elk.terminateWorker();
await Promise.resolve();
assert.equal(worker.terminated, true);
assert.equal(typeof elk.worker.resolvers[pendingId], "function");
assert.equal(settled, false);
findings.push({ id: "ELK-2", scope: "deterministic API state inspection, not real Worker termination timing", workerTerminateCalled: true, pendingResolverRetained: true, promiseSettledByTerminate: false });

const result = { node: process.version, kind: "source-behavior probes; not product or GUI acceptance", sources, findings };
await writeFile(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
