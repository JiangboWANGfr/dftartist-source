import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as M from "@hier/viewmodel";
import * as V from "@hier/views";
const snapshotId = "A-annotation-render", complete = { status: "complete", reasons: [] };
const freeze = v => { if (v && typeof v === "object" && !Object.isFrozen(v)) { for (const x of Object.values(v)) freeze(x); Object.freeze(v); } return v; };
const reply = result => freeze({ result, completeness: complete });
let root, graph, source, layout, projection, selection, tree, layers, allLayers, workers, subscriptions, calls, failures, strict;
const track = model => {
  const subscribe = model.subscribe;
  model.subscribe = function (...args) { subscriptions++; const off = subscribe.apply(this, args); let active = true; return () => { if (active) subscriptions--; active = false; off(); }; };
  return model;
};
function render() {
  const error = e => failures.push({ command: e.command, code: e.error?.code });
  const content = <><div data-view="tree"><V.HierarchyTree tree={tree} selection={selection} annotations={layers} ariaLabel="annotation tree" height={160} rowHeight={24} overscan={2} onCommandError={error}/></div><div data-view="graph"><V.SchematicView graph={graph} layout={layout} selection={selection} annotations={layers} ariaLabel="annotation graph" height={280} onCommandError={error} {...(projection ? { projection, onFoldChange: () => failures.push("unexpected fold intent") } : {})}/></div></>;
  flushSync(() => root.render(strict ? <React.StrictMode>{content}</React.StrictMode> : content));
}
function snapshot() {
  return {
    graph: [...document.querySelectorAll("[data-graph-key]")].map(n => ({ label: n.getAttribute("aria-label"), title: n.querySelector("title")?.textContent, pressed: n.getAttribute("aria-pressed"), disabled: n.getAttribute("aria-disabled") })),
    tree: [...document.querySelectorAll('[role="treeitem"]')].map(n => ({ text: n.textContent, label: n.getAttribute("aria-label"), title: n.title, selected: n.getAttribute("aria-selected") })),
    details: document.querySelector(".hier-schematic-view__information")?.textContent,
    focus: document.activeElement?.getAttribute("data-graph-key"),
    selection: selection.current,
    graphRevision: graph.state.revision,
    layout: { status: layout.state.status, request: layout.state.request, result: layout.state.result },
    layers: layers.map(layer => layer.state), calls: [...calls], failures: [...failures],
  };
}
window.annotation = {
  async setup(count = 8, layerCount = 3, folded = false, isStrict = true) {
    strict = isStrict; subscriptions = 0; calls = []; failures = []; workers = new Set();
    const refs = Array.from({ length: Math.max(64, count) }, (_, i) => i < 2 ? `A/mark/${i ? "b" : "a"}` : `A/mark/tree/${i}`);
    const client = { snapshot: { snapshotId }, roots: async () => { calls.push("roots"); return reply(refs.map((ref, i) => ({ ref, name: `root-${i}`, path: [`root-${i}`], pathText: `root-${i}`, kind: "module", def: "d", defName: "d", childCount: 0, hasParamOverrides: false }))); } };
    tree = track(new M.TreeModel(client, { pageSize: 10000 })); await tree.loadRoots();
    selection = track(new M.SelectionModel({ snapshotId })); graph = track(new M.GraphSession(client)); source = graph.registerSource({ origin: "analysis", label: "annotation source" });
    const nodes = Array.from({ length: count }, (_, i) => ({ kind: "external", key: `n${i}`, label: `node ${i}`, ports: [], target: { ref: `A/mark/${i % 2 ? "b" : "a"}`, bits: { lsb: i, width: 1 }, side: "inside" } }));
    nodes.push({ kind: "external", key: "none", label: "no target", ports: [] });
    const edges = count >= 3 ? [{ kind: "external", key: "reverse", label: "reverse b,a", from: { node: { kind: "external", key: "n1" } }, to: { node: { kind: "external", key: "n2" } } }] : [];
    await source.replace({ snapshotId, nodes, edges, completeness: complete, frontier: [], hasConservative: false });
    projection = folded ? M.createFoldedGraphProjection(graph, { groups: [{ kind: "hierarchy", key: "group", label: "folded a,b", nodes: graph.state.nodes.filter(n => ["n0", "n1"].includes(n.node.key)).map(n => n.id) }], collapsed: ["group"] }) : null;
    const options = { timeoutMs: 15000, workerFactory() { const w = new Worker("/worker.js"), terminate = w.terminate.bind(w); workers.add(w); w.terminate = () => { workers.delete(w); terminate(); }; return w; } };
    layout = track(folded ? new M.LayoutService(graph, options, "folded") : new M.LayoutService(graph, options));
    await layout.layout(projection ?? M.createGraphProjection(graph).layout);
    layers = allLayers = Array.from({ length: layerCount }, (_, i) => {
      const layer = track(new M.AnnotationLayer({ snapshotId, id: `layer/${i}`, label: `layer ${i}` }));
      layer.set(refs.map((ref, j) => ({ ref, mark: { badge: i === 1 ? "" : `badge-${i}`, color: i % 2 ? "#aAbB09" : "#112233", tooltip: `tip ${j} <&> 尾`, severity: i % 2 ? "warn" : "info" } })));
      return layer;
    });
    root = createRoot(document.getElementById("app")); render(); return snapshot();
  },
  snapshot,
  rerender() { render(); return snapshot(); },
  change() { flushSync(() => layers[0].set([{ ref: "A/mark/b", mark: { tooltip: "changed", badge: "NEW" } }])); return snapshot(); },
  clear() { flushSync(() => layers[1]?.clear()); return snapshot(); },
  reorder() { layers = [...layers].reverse(); render(); return snapshot(); },
  disposeLayer() { layers[0]?.dispose(); render(); return snapshot(); },
  async withdraw() { await source.replace({ snapshotId, nodes: [], edges: [], completeness: complete, frontier: [], hasConservative: false }); flushSync(() => {}); return snapshot(); },
  measure() {
    const original = Map.prototype.get; let modelHits = 0;
    Map.prototype.get = function (key) { const value = original.call(this, key); if (typeof key === "string" && key.startsWith("A/mark/") && value?.mark) modelHits++; return value; };
    try { render(); } finally { Map.prototype.get = original; }
    const samples = []; for (let i = 0; i < 5; i++) { const start = performance.now(); render(); samples.push(performance.now() - start); }
    return { modelHits, samples, snapshot: snapshot(), html: document.getElementById("app").innerHTML };
  },
  close() {
    flushSync(() => root.unmount());
    const borrowedAlive = !tree.disposed && !graph.disposed && !layout.disposed && !selection.disposed;
    layout.dispose(); graph.dispose(); tree.dispose(); selection.dispose(); for (const layer of allLayers) layer.dispose();
    return { subscriptions, workers: workers.size, nodes: document.getElementById("app").childElementCount, borrowedAlive, failures: failures.length };
  },
};
