import { HierClient } from "@hier/client";
import { GraphSession, LayoutService, SelectionModel } from "@hier/viewmodel";
import { snapshot, fragments } from "./fixture.mjs";
import { layoutInput, project } from "./projection.mjs";
export async function createController(render) {
  const messages = new Set(),
    closes = new Set();
  const client = new HierClient({
    send() {
      throw Error("Controlled DTO experiment does not query Core");
    },
    onMessage(fn) {
      messages.add(fn);
      return () => messages.delete(fn);
    },
    onClose(fn) {
      closes.add(fn);
      return () => closes.delete(fn);
    },
    close() {},
  });
  for (const fn of messages)
    fn({ event: "hello", protocol: 2, snapshot, capabilities: ["cancel", "progress"] });
  await client.ready;
  const graph = new GraphSession(client),
    selection = new SelectionModel({ snapshotId: snapshot.snapshotId });
  const sources = Object.fromEntries(
    ["a", "b", "trace"].map((label) => [label, graph.registerSource({ origin: "design", label })]),
  );
  for (const name of ["a", "b", "trace"]) await sources[name].replace(fragments[name]);
  const workers = [],
    commands = [],
    timings = [],
    unsubscribers = [];
  let mode = "real",
    disposed = false,
    notifications = 0,
    subscribers = 0,
    rendered = Promise.resolve(),
    folded = { hierarchy: false, bus: false },
    lastHit = null;
  const layout = new LayoutService(graph, {
    timeoutMs: 4000,
    workerFactory() {
      const url =
        mode === "real" ? "/worker.js" : mode === "crash" ? "/crash-worker.js" : "/stall-worker.js";
      const w = new Worker(url),
        row = { url, layoutPosts: 0, terminated: 0 };
      workers.push(row);
      const post = w.postMessage.bind(w),
        terminate = w.terminate.bind(w);
      w.postMessage = (...args) => {
        post(...args);
        if (args[0]?.cmd === "layout") row.layoutPosts++;
      };
      w.terminate = () => {
        row.terminated++;
        terminate();
      };
      return w;
    },
  });
  let current;
  const publish = () => {
    if (disposed) return;
    notifications++;
    current = project(graph.state, layout.state, selection.current, folded);
    // One serialized rendering queue: framework render promises never re-enter a model listener.
    const display = current;
    rendered = rendered.then(() => (disposed ? undefined : render(display)));
  };
  for (const model of [graph, selection, layout]) {
    unsubscribers.push(model.subscribe(publish));
    subscribers++;
  }
  const observe = (name, p) => {
    const row = { name, status: "pending" };
    commands.push(row);
    return p.then(
      () => {
        row.status = "success";
        return row;
      },
      (e) => {
        row.status = "failed";
        row.code = e.code;
        row.message = e.message;
        return row;
      },
    );
  };
  const settle = async () => {
    await rendered;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };
  async function relayout(workerMode = "real") {
    mode = workerMode;
    const start = performance.now();
    const result = await observe("layout:" + workerMode, layout.layout(layoutInput(graph.state)));
    await settle();
    timings.push({ operation: "layout:" + workerMode, ms: performance.now() - start });
    return result;
  }
  function pick(id, origin = "graph") {
    if (disposed || !current.interactive) return;
    const hit = current.hits.find((h) => h.id === id);
    if (!hit) return;
    // Inspector is a hit receipt, not a second selection authority/history.
    lastHit = { id: hit.id, memberIds: hit.memberIds, facts: hit.facts ?? [], items: hit.items };
    selection.select({ snapshotId: snapshot.snapshotId, origin, items: hit.items });
  }
  function read() {
    return {
      graph: graph.state,
      layout: layout.state,
      selection: selection.current,
      display: current,
      folded,
      lastHit,
      workers,
      commands,
      timings,
      notifications,
      subscribers,
      transportListeners: messages.size + closes.size,
      disposed,
      pending: commands.filter((c) => c.status === "pending").length,
    };
  }
  const api = {
    read,
    pick,
    settle,
    relayout,
    external() {
      const n = current.nodes.find((n) => n.label === "x");
      pick(n.id, "external");
    },
    back() {
      selection.back();
    },
    forward() {
      selection.forward();
    },
    fold(kind) {
      folded = { ...folded, [kind]: !folded[kind] };
      publish();
    },
    async replace() {
      await observe("source:replace", sources.a.replace(fragments.replacement));
      return relayout();
    },
    async reset() {
      await observe("source:reset", sources.a.replace(fragments.a));
      return relayout();
    },
    async withdrawLate() {
      let resolve;
      const delayed = new Promise((r) => (resolve = r));
      const old = observe(
        "source:late",
        sources.a.refresh(() => delayed),
      );
      await observe("source:clear", sources.a.clear());
      await old;
      resolve(fragments.a);
      await delayed;
      await Promise.resolve();
      await relayout();
      return read();
    },
    async supersede() {
      mode = "stall";
      const old = observe("layout:L1", layout.layout(layoutInput(graph.state)));
      await observe("source:new-revision", sources.a.replace(fragments.replacement));
      const oldResult = await old;
      const newResult = await relayout();
      return { oldResult, newResult, state: read() };
    },
    async retry() {
      mode = "real";
      const result = await observe("layout:retry", layout.retry());
      await settle();
      return result;
    },
    async disposePending() {
      mode = "stall";
      const pending = observe("layout:dispose-pending", layout.layout(layoutInput(graph.state)));
      await api.dispose();
      return pending;
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
        subscribers--;
      }
      layout.dispose();
      graph.dispose();
      selection.dispose();
      client.dispose();
      await rendered;
    },
  };
  publish();
  await relayout();
  return api;
}
