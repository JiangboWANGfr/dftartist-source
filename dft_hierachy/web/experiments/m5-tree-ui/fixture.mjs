// Experiment-only public Transport. No replacement SDK/model, no Core claims.
import { HierClient } from "@hier/client";
import { SelectionModel, TreeModel } from "@hier/viewmodel";

const complete = { status: "complete", reasons: [] };
const info = (ref, path, childCount = 0) => ({
  ref,
  path,
  name: path.at(-1),
  pathText: path.map((s) => `\\${s} `).join("."),
  kind: "module",
  def: "fixture-definition",
  defName: "fixture",
  childCount,
  hasParamOverrides: false,
});

function design(shape, size) {
  const children = new Map(),
    parents = new Map(),
    nodes = new Map();
  const add = (node, parent) => {
    nodes.set(node.ref, node);
    if (parent) {
      parents.set(node.ref, parent);
      const siblings = children.get(parent) ?? [];
      siblings.push(node);
      children.set(parent, siblings);
    }
  };
  add(info("top", ["top"], shape === "deep" ? 1 : shape === "wide" ? size : 6));
  if (shape === "wide") {
    for (let i = 0; i < size; i++) add(info(`w${i}`, ["top", `w${i}`]), "top");
  } else if (shape === "deep") {
    const path = ["top"];
    for (let i = 0; i < size; i++) {
      path.push(`d${i}`);
      add(
        info(`d${i}`, [...path], i + 1 < size ? 1 : 0),
        i ? `d${i - 1}` : "top",
      );
    }
  } else {
    add(info("a", ["top", "g", "a"]), "top");
    add(info("plain", ["top", "plain"]), "top");
    add(info("b", ["top", "g", "b"]), "top");
    add(info("c", ["top", "g", "nested", "c"]), "top");
    add(info("tail", ["top", "tail"]), "top");
    add(info("branch", ["top", "branch"], 1), "top");
    add(info("leaf", ["top", "branch", "leaf"]), "branch");
  }
  return { nodes, parents, children, roots: [nodes.get("top")] };
}

export async function createSession(shape = "small", size = 6, generation = 1) {
  const data = design(shape, size);
  const messages = new Set(),
    closes = new Set();
  const wire = {
    hold: false,
    failNext: false,
    closed: false,
    pending: [],
    sent: [],
    deliveredInstances: new Set(),
    onMessage(fn) {
      messages.add(fn);
      return () => messages.delete(fn);
    },
    onClose(fn) {
      closes.add(fn);
      return () => closes.delete(fn);
    },
    emit(frame) {
      for (const fn of messages) fn(structuredClone(frame));
    },
    close() {
      this.closed = true;
      for (const fn of closes) fn();
    },
    send(frame) {
      this.sent.push(structuredClone(frame));
      if (frame.method === "cancel") return;
      if (this.hold) this.pending.push(frame);
      else queueMicrotask(() => this.reply(frame));
    },
    release() {
      this.hold = false;
      const waiting = this.pending.splice(0);
      // Intentionally allow late delivery after cancel/dispose to test consumers.
      for (const frame of waiting) this.reply(frame);
    },
    reply(frame) {
      if (this.failNext) {
        this.failNext = false;
        this.emit({
          id: frame.id,
          ok: false,
          error: {
            code: "internal",
            message: "Fixture page failed",
            data: { request: frame.method },
          },
        });
        return;
      }
      let result;
      const p = frame.params;
      switch (frame.method) {
        case "inst.roots":
          result = data.roots;
          break;
        case "inst.children": {
          const siblings = data.children.get(p.inst) ?? [];
          const offset = Number(p.cursor || 0),
            end = Math.min(offset + p.limit, siblings.length);
          result = {
            items: siblings.slice(offset, end),
            ...(end < siblings.length ? { next: String(end) } : {}),
          };
          break;
        }
        case "obj.get": {
          const owner = p.ref === "port-tail" ? "tail" : p.ref;
          result = {
            ref: p.ref,
            inst: owner,
            kind: p.ref === "port-tail" ? "port" : "instance",
            name: p.ref,
            pathText: p.ref,
          };
          break;
        }
        case "inst.ancestors": {
          result = [];
          for (
            let ref = data.parents.get(p.inst);
            ref;
            ref = data.parents.get(ref)
          )
            result.unshift(data.nodes.get(ref));
          break;
        }
        default:
          throw new Error(`Unexpected fixture method: ${frame.method}`);
      }
      if (frame.method === "inst.roots" || frame.method === "inst.children") {
        for (const item of Array.isArray(result) ? result : result.items)
          this.deliveredInstances.add(item.ref);
      }
      this.emit({ id: frame.id, ok: true, result, completeness: complete });
    },
  };
  const client = new HierClient(wire, { cacheEntries: 0 });
  const snapshotId = `ui-comparison-${generation}`;
  wire.emit({
    event: "hello",
    protocol: 2,
    capabilities: ["cancel", "progress"],
    snapshot: {
      protocol: 2,
      schemaVersion: 7,
      snapshotId,
      inputHash: "0123456789abcdef".repeat(4),
      inputHashComplete: true,
      frontend: { name: "slang", version: "controlled-ui-fixture" },
      bodySharing: "fast",
      tops: data.roots,
      definitionCount: 1,
      bodyCount: 1,
      indexState: "building",
      openedAt: "2000-02-29T23:59:59.123Z",
      topCandidates: ["top"],
    },
  });
  await client.ready;
  const tree = new TreeModel(client, { pageSize: shape === "wide" ? 1000 : 2 });
  const selection = new SelectionModel({ snapshotId });
  // Evidence only: this experiment never reloads a model. Collapse retains data.
  // Count instances actually observed in committed rows, not late wire deliveries.
  const observedCommitted = new Set();
  tree.subscribe(() => {
    for (const row of tree.rows)
      if (row.kind === "instance") observedCommitted.add(row.instance.ref);
  });
  const session = {
    tree,
    selection,
    wire,
    client,
    generation,
    observedCommitted,
    errors: [],
    work: {
      projectionVisits: 0,
      ariaVisits: 0,
      idReads: 0,
      childrenReads: 0,
      renders: 0,
    },
    row(ref) {
      return tree.rows.find(
        (r) => r.kind === "instance" && r.instance.ref === ref,
      );
    },
    select(ref) {
      selection.select({ items: [{ ref }], origin: "external", snapshotId });
    },
    dispose() {
      tree.dispose();
      selection.dispose();
      client.dispose();
    },
  };
  await tree.loadRoots();
  return session;
}
