import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as M from "@hier/viewmodel";
import { SchematicView } from "@hier/views";

const snapshotId = "A-schematic-geometry", complete = { status: "complete", reasons: [] };
let root, graph, source, layout, projection, selection, layers, workers, subscriptions, failures, strict, direction, input;
const track = model => {
  const subscribe = model.subscribe;
  model.subscribe = function (...args) {
    subscriptions++;
    const off = subscribe.apply(this, args); let active = true;
    return () => { if (active) subscriptions--; active = false; off(); };
  };
  return model;
};
const error = e => failures.push({ command: e.command, code: e.error?.code });
const foldIntent = () => failures.push("unexpected fold intent");
function render() {
  const content = <SchematicView graph={graph} layout={layout} selection={selection} annotations={layers} ariaLabel="geometry graph" height={320} direction={direction} onCommandError={error} {...(projection ? { projection, onFoldChange: foldIntent } : {})}/>;
  flushSync(() => root.render(strict ? <React.StrictMode>{content}</React.StrictMode> : content));
}
function snapshot() {
  const svg = document.querySelector("svg");
  return {
    html: document.getElementById("app").innerHTML,
    graph: [...document.querySelectorAll("[data-graph-key]")].map(n => ({ key: n.dataset.graphKey, label: n.getAttribute("aria-label"), title: n.querySelector("title")?.textContent, pressed: n.getAttribute("aria-pressed"), disabled: n.getAttribute("aria-disabled"), tabIndex: n.tabIndex })),
    geometry: [...document.querySelectorAll(".hier-schematic-view__node,.hier-schematic-view__edge")].map(n => n.outerHTML),
    readonly: svg.dataset.readonly,
    focus: document.activeElement === svg ? "canvas" : document.activeElement?.getAttribute("data-graph-key"),
    details: document.querySelector(".hier-schematic-view__information")?.textContent,
    selection: selection.current, revision: graph.state.revision,
    layout: { status: layout.state.status, request: layout.state.request, result: layout.state.result },
    failures: [...failures],
  };
}
function measure() {
  const result = layout.state.result, arrays = new Map([[result.nodes, "nodes"], [result.edges, "edges"]]);
  for (const node of result.nodes) arrays.set(node.ports, "ports");
  for (const edge of result.edges) { arrays.set(edge.sections, "sections"); for (const section of edge.sections) arrays.set(section, "points"); }
  const iterations = { nodes: 0, edges: 0, ports: 0, sections: 0, points: 0 }, original = Array.prototype.map;
  Array.prototype.map = function (fn, self) {
    const kind = arrays.get(this);
    return original.call(this, kind ? function (...args) { iterations[kind]++; return fn.apply(this, args); } : fn, self);
  };
  try { render(); } finally { Array.prototype.map = original; }
  // Counts and timings are separate; exclude native layout preparation and DOM readback.
  const samples = [];
  for (let i = 0; i < 5; i++) { const start = performance.now(); render(); samples.push(performance.now() - start); }
  return { iterations, samples, snapshot: snapshot() };
}
window.geometry = {
  async setup(count = 8, layerCount = 2, folded = false, isStrict = true) {
    strict = isStrict; direction = "RIGHT"; subscriptions = 0; failures = []; workers = new Set();
    selection = track(new M.SelectionModel({ snapshotId }));
    graph = track(new M.GraphSession({ snapshot: { snapshotId } }));
    source = graph.registerSource({ origin: "analysis", label: "geometry source" });
    const nodes = Array.from({ length: count }, (_, i) => ({ kind: "external", key: `n${i}`, label: i === 2 ? "long label <&> 超过二十二字符的完整节点名称" : `node ${i}`, ports: [], target: { ref: `A/object/${i}`, bits: { lsb: i, width: 1 }, side: "inside" } }));
    nodes.push({ kind: "external", key: "none", label: "no target", ports: [] });
    const edges = Array.from({ length: Math.max(0, count - 1) }, (_, i) => ({ kind: "external", key: `e${i}`, label: `edge ${i}`, from: { node: { kind: "external", key: `n${i}` } }, to: { node: { kind: "external", key: `n${i + 1}` } } }));
    await source.replace({ snapshotId, nodes, edges, completeness: complete, frontier: [], hasConservative: false });
    projection = folded ? M.createFoldedGraphProjection(graph, { groups: [{ kind: "hierarchy", key: "group", label: "folded a,b", nodes: graph.state.nodes.filter(n => ["n0", "n1"].includes(n.node.key)).map(n => n.id) }], collapsed: ["group"] }) : null;
    const options = { timeoutMs: 15000, workerFactory() {
      const w = new Worker("/worker.js"), terminate = w.terminate.bind(w); workers.add(w);
      w.terminate = () => { workers.delete(w); terminate(); }; return w;
    } };
    layout = track(folded ? new M.LayoutService(graph, options, "folded") : new M.LayoutService(graph, options));
    input = projection ?? M.createGraphProjection(graph).layout;
    await layout.layout(input, direction);
    layers = Array.from({ length: layerCount }, (_, i) => {
      const layer = track(new M.AnnotationLayer({ snapshotId, id: `layer/${i}`, label: `layer ${i}` }));
      layer.set(nodes.filter(n => n.target).map(n => ({ ref: n.target.ref, mark: { badge: `badge-${i}`, tooltip: "tip <&> 中文", color: "#123456" } })));
      return layer;
    });
    root = createRoot(document.getElementById("app")); render(); return snapshot();
  },
  snapshot, measure,
  rerender() { render(); return snapshot(); },
  selectLast() {
    const descriptor = (projection ?? M.createGraphProjection(graph)).nodes.filter(n => n.items.length).at(-1);
    flushSync(() => selection.select({ origin: "external", snapshotId, items: descriptor.items })); return snapshot();
  },
  annotation() { flushSync(() => layers[0]?.set([{ ref: "A/object/2", mark: { badge: "CHANGED", tooltip: "changed" } }])); return snapshot(); },
  async custom() {
    input = { ...M.createGraphProjection(graph).layout, nodes: M.createGraphProjection(graph).layout.nodes.map(n => ({ ...n, width: 237, height: 91, ports: n.ports.map(p => ({ ...p, width: 7, height: 9 })) })) };
    await layout.layout(input, direction); render(); return snapshot();
  },
  pendingCancel() {
    let promise;
    flushSync(() => { promise = layout.layout(input, direction); promise.catch(() => {}); });
    const pending = snapshot(); flushSync(() => layout.cancel());
    return { pending, cancelled: snapshot() };
  },
  async retry() { await layout.retry(); render(); return snapshot(); },
  async relayout() { direction = "DOWN"; input = projection ?? M.createGraphProjection(graph, direction).layout; await layout.layout(input, direction); render(); return snapshot(); },
  async expand() {
    projection = M.createFoldedGraphProjection(graph, { ...projection.options, collapsed: [] }); input = projection;
    render(); const hidden = snapshot(); await layout.layout(projection, direction); render(); return { hidden, success: snapshot() };
  },
  async withdraw() { await source.replace({ snapshotId, nodes: [], edges: [], completeness: complete, frontier: [], hasConservative: false }); render(); return snapshot(); },
  close() {
    flushSync(() => root.unmount());
    const borrowedAlive = !graph.disposed && !layout.disposed && !selection.disposed && layers.every(l => !l.disposed);
    layout.dispose(); graph.dispose(); selection.dispose(); for (const layer of layers) layer.dispose();
    return { subscriptions, workers: workers.size, nodes: document.getElementById("app").childElementCount, borrowedAlive, failures: failures.length };
  },
};
