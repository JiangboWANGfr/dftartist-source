import React from "react";
import { createRoot } from "react-dom/client";
import { HierClient } from "@hier/client";
import {
  GraphSession,
  LayoutService,
  TreeModel,
  SelectionModel,
  createGraphProjection,
} from "@hier/viewmodel";
import { HierarchyTree } from "@hier/views";

// This transport forwards actual Core frames through the benchmark driver.
// No synthetic query replies or private model access are used.
let receive, closed;
const client = new HierClient(
  {
    send(frame) {
      void window.sendCore(frame).catch((error) => closed?.(error));
    },
    onMessage(handler) {
      receive = handler;
      return () => {
        receive = undefined;
      };
    },
    onClose(handler) {
      closed = handler;
      return () => {
        closed = undefined;
      };
    },
    close() {
      void window.closeCore();
    },
  },
  { cacheEntries: 0 },
);
window.receiveCore = (frame) => receive?.(frame);
window.coreClosed = (message) => closed?.(new Error(message));
const frame = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
const check = (value, message) => {
  if (!value) throw new Error(message);
};

window.measure = async ({ children, repetitions, graphSizes }) => {
  const snapshot = await client.ready;
  const tree = new TreeModel(client, { pageSize: 2000 });
  const selection = new SelectionModel({ snapshotId: snapshot.snapshotId });
  const graph = new GraphSession(client);
  const workers = new Set();
  const layout = new LayoutService(graph, {
    timeoutMs: 120_000, // benchmark watchdog, not a product performance budget
    workerFactory: () => {
      const worker = new Worker("./elk-worker.min.js");
      const terminate = worker.terminate.bind(worker);
      worker.terminate = () => {
        workers.delete(worker);
        terminate();
      };
      workers.add(worker);
      return worker;
    },
  });
  const root = createRoot(document.getElementById("root"));
  const result = { tree: {}, layouts: [], cleanup: {} };
  // Incremental checkpoints survive a later timeout/failure in the driver report.
  const checkpoint = () => window.saveBrowserSample(result);
  try {
    root.render(
      React.createElement(HierarchyTree, {
        tree,
        selection,
        ariaLabel: "Performance hierarchy",
        height: 560,
        rowHeight: 28,
        overscan: 2,
      }),
    );
    await tree.loadRoots();
    const top = tree.rows.find((row) => row.kind === "instance");
    check(top, "missing synthetic root");
    const start = performance.now();
    await tree.setExpanded(top.id, true);
    let pages = 1;
    while (tree.rows.some((row) => row.kind === "status" && row.state.next)) {
      await tree.loadMore(top.id);
      pages++;
    }
    result.tree.loadMs = performance.now() - start;
    result.tree.pages = pages;
    result.tree.modelRows = tree.rows.length;
    check(
      tree.rows.filter((row) => row.kind === "instance").length ===
        children + 1,
      "tree did not load every instance",
    );
    await frame();
    result.tree.visibleDomRows =
      document.querySelectorAll('[role="treeitem"]').length;
    check(
      result.tree.visibleDomRows <= 26,
      "tree DOM is not bounded by its viewport",
    );
    result.tree.domNodes = document.querySelectorAll("*").length;
    result.tree.scrollSamples = [];
    const viewport = document.querySelector('[role="tree"]');
    for (const fraction of [0.5, 1, 0]) {
      const begin = performance.now();
      viewport.scrollTop =
        (viewport.scrollHeight - viewport.clientHeight) * fraction;
      await frame();
      const items = [...viewport.querySelectorAll('[role="treeitem"]')];
      result.tree.scrollSamples.push({
        fraction,
        millis: performance.now() - begin,
        rows: items.length,
        first: items[0]?.textContent,
        last: items.at(-1)?.textContent,
      });
      check(
        items.length > 0 && items.length <= 26,
        "scrolled tree DOM is not bounded",
      );
    }
    await checkpoint();

    const source = graph.registerSource({
      origin: "plan",
      label: "Synthetic display workload",
    });
    for (const count of graphSizes) {
      // A bounded two-successor DAG exercises routing as well as isolated node layout.
      const nodes = Array.from({ length: count }, (_, i) => ({
        kind: "external",
        key: String(i),
        label: `Node ${i}`,
        ports: [],
      }));
      const edges = nodes.flatMap((_, i) =>
        [1, 7]
          .filter((step) => i + step < count)
          .map((step) => ({
            kind: "external",
            key: `${i}-${i + step}`,
            label: "",
            from: { node: { kind: "external", key: String(i) } },
            to: { node: { kind: "external", key: String(i + step) } },
          })),
      );
      await source.replace({
        snapshotId: snapshot.snapshotId,
        nodes,
        edges,
        completeness: { status: "complete", reasons: [] },
        frontier: [],
        hasConservative: false,
      });
      const projection = createGraphProjection(graph);
      const sample = {
        nodes: count,
        edges: edges.length,
        millis: [],
        cancelledMs: null,
      };
      result.layouts.push(sample);
      for (let i = 0; i < repetitions; i++) {
        const begin = performance.now();
        await layout.layout(projection.layout);
        sample.millis.push(performance.now() - begin);
        check(
          layout.state.status === "success" &&
            layout.state.result.nodes.length === count,
          "incomplete native layout",
        );
        check(workers.size === 0, "completed layout retained its Worker");
        await checkpoint();
      }
      // Cancellation is measured separately from successful layouts, with a real native Worker.
      const pending = layout.layout(projection.layout);
      const settled = pending.then(
        () => "success",
        (error) => error.code,
      );
      const begin = performance.now();
      await layout.cancel();
      sample.cancelledMs = performance.now() - begin;
      check(
        (await settled) === "cancelled",
        "layout cancellation did not settle as cancelled",
      );
      check(workers.size === 0, "cancelled layout retained its Worker");
      await checkpoint();
    }
  } finally {
    root.unmount();
    layout.dispose();
    graph.dispose();
    tree.dispose();
    selection.dispose();
    client.dispose();
    await frame();
    result.cleanup = {
      workers: workers.size,
      mountedNodes: document.getElementById("root").childElementCount,
    };
    await checkpoint();
    check(
      workers.size === 0 && result.cleanup.mountedNodes === 0,
      "browser resources retained",
    );
  }
  return result;
};
