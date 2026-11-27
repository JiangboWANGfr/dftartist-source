// Installed public packages only. Native browser Worker; no worker_threads or source alias.
import { HierClient } from "@hier/client";
import { GraphSession, LayoutService, LayoutError } from "@hier/viewmodel";
const check = (v, m) => {
  if (!v) throw new Error("P01: " + m);
};
const fixture = await (await fetch("/fixture.json")).json();
const handlers = new Set(),
  closes = new Set();
const wire = {
  send() {
    throw new Error("P01 graph/layout must not query Core");
  },
  onMessage(fn) {
    handlers.add(fn);
    return () => handlers.delete(fn);
  },
  onClose(fn) {
    closes.add(fn);
    return () => closes.delete(fn);
  },
  close() {},
};
const client = new HierClient(wire);
for (const fn of handlers)
  fn({
    event: "hello",
    protocol: 2,
    snapshot: fixture.snapshot,
    capabilities: ["cancel", "progress"],
  });
await client.ready;
const graph = new GraphSession(client),
  source = graph.registerSource({ origin: "design", label: "B outside controlled source" });
await source.replace(fixture.fragment);
const services = [],
  workers = [];
const posted = new Set();
let mode = "real";
const factory = () => {
  const url = {
    real: "/worker.js",
    missing: "/missing-worker.js",
    crash: "/crash-worker.js",
    stall: "/stall-worker.js",
  }[mode];
  const worker = new Worker(url),
    row = { url, terminated: 0, layoutPosts: 0 };
  workers.push(row);
  const terminate = worker.terminate.bind(worker);
  worker.terminate = () => {
    row.terminated++;
    terminate();
  };
  const post = worker.postMessage.bind(worker);
  worker.postMessage = (...args) => {
    post(...args);
    if (args[0]?.cmd === "layout") {
      row.layoutPosts++;
      for (const notify of [...posted]) notify(row);
    }
  };
  return worker;
};
const projection = () => ({
  sessionId: graph.state.sessionId,
  graphRevision: graph.state.revision,
  direction: "RIGHT",
  nodes: graph.state.nodes.map((n) => ({
    id: n.id,
    width: 60,
    height: 30,
    ports: [
      { key: "out", width: 0, height: 0, side: "EAST" },
      { key: "in", width: 0, height: 0, side: "WEST" },
    ],
  })),
  edges: graph.state.edges.map((e) => ({ id: e.id, fromPort: "out", toPort: "in" })),
});
const watch = (p) => {
  p.catch(() => {});
  return p;
};
async function pending(service) {
  let notify;
  const begun = new Promise((resolve) => {
    notify = (row) => {
      posted.delete(notify);
      resolve(row);
    };
    posted.add(notify);
  });
  const promise = watch(service.layout(projection()));
  try {
    await Promise.race([
      begun,
      promise.then(() => {
        throw Error("P01 no pending native Worker");
      }),
    ]);
    return { promise };
  } finally {
    posted.delete(notify);
  }
}
async function rejected(p, code) {
  let error;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  check(error instanceof LayoutError && error.code === code, "waiter " + code);
  return error;
}
function service() {
  const s = new LayoutService(graph, { workerFactory: factory, timeoutMs: 2000 });
  services.push(s);
  return s;
}
window.B_LAYOUT = {
  async run() {
    try {
      const s = service(),
        input = projection(),
        before = graph.state;
      mode = "real";
      await s.layout(input);
      check(s.state.status === "success", "native ELK success");
      const r = s.state.result;
      check(
        r.graphRevision === before.revision && r.sessionId === before.sessionId,
        "result identity",
      );
      check(graph.state === before, "facts untouched");
      check(
        r.nodes.length === before.nodes.length && r.edges.length === before.edges.length,
        "all members retained",
      );
      check(
        r.edges.every(
          (e, i) =>
            e.id === before.edges[i].id &&
            e.from === before.edges[i].from &&
            e.to === before.edges[i].to,
        ),
        "parallel edge reverse mapping",
      );
      check(
        r.nodes.every(
          (n) => Number.isFinite(n.x) && Number.isFinite(n.y) && n.width > 0 && n.height > 0,
        ),
        "finite geometry",
      );
      check(
        r.edges.every(
          (e) =>
            e.sections.length &&
            e.sections.every(
              (s) => s.length >= 2 && s.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
            ),
        ),
        "native routed sections",
      );
      check(Object.isFrozen(r) && Object.isFrozen(r.nodes[0].ports), "owned frozen geometry");
      for (const fail of ["missing", "crash"]) {
        const old = s.state.result;
        mode = fail;
        await rejected(watch(s.layout(projection())), "worker_failure");
        check(s.state.result === old, "old geometry retained");
        mode = "real";
        const n = workers.length;
        await s.retry();
        check(workers.length === n + 1, "retry fresh native Worker");
      }
      mode = "stall";
      const timeout = service();
      await rejected(watch(timeout.layout(projection())), "timeout");
      mode = "real";
      await timeout.retry();
      check(timeout.state.status === "success", "timeout retry");
      mode = "stall";
      const cancelled = (await pending(s)).promise;
      await s.cancel();
      await rejected(cancelled, "cancelled");
      mode = "real";
      await s.retry();
      mode = "stall";
      const disposed = (await pending(s)).promise;
      s.dispose();
      await rejected(disposed, "disposed");
      check(!graph.disposed, "layout borrows graph");
      mode = "stall";
      const a = service(),
        b = service(),
        pa = (await pending(a)).promise,
        pb = (await pending(b)).promise;
      let notifications = 0;
      a.subscribe(() => notifications++);
      b.subscribe(() => notifications++);
      graph.subscribe(() => notifications++);
      graph.dispose();
      await rejected(pa, "disposed");
      await rejected(pb, "disposed");
      check(
        a.disposed && b.disposed && notifications === 0,
        "graph synchronous release, no public notifications",
      );
      check(
        workers.every((w) => w.terminated === 1),
        "each native Worker reclaimed once",
      );
      return {
        passed: true,
        native: true,
        workers,
        geometry: { nodes: r.nodes.length, edges: r.edges.length },
        controlledSource: true,
      };
    } finally {
      for (const s of services) s.dispose();
      graph.dispose();
      client.dispose();
    }
  },
};
