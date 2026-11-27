// B-owned host fixture: real SDK/L6, public Transport and delegating call spies.
import React, { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { HierClient } from "@hier/client";
import { TreeModel, SelectionModel } from "@hier/viewmodel";
import * as Views from "@hier/views";
const HierarchyTree = Reflect.get(Views, "HierarchyTree");

const complete = { status: "complete", reasons: [] };
const contexts = [];
const boundaries = [];
const unhandled = [];
const windowErrors = [];
window.addEventListener("unhandledrejection", (event) =>
  unhandled.push(event.reason),
);
window.addEventListener("error", (event) => windowErrors.push(event.error));
let active, root, replacement;
const stat = { mounts: 0, cleanups: 0, clicks: 0 };
const inst = (ref, name, path, childCount = 0) => ({
  ref,
  name,
  path,
  pathText: path.map((x) => "\\" + x + " ").join("."),
  kind: "module",
  def: "B-ui-def",
  defName: "B_ui",
  childCount,
  hasParamOverrides: false,
});
const top = inst("B-ui-root", "top", ["top"], 2);
const a = inst("B-ui-a", "a", ["top", "g.with.dot", "a"]);
const b = inst("B-ui-b", "b", ["top", "g.with.dot", "b"]);
const snapshot = (id, roots = [top]) => ({
  protocol: 2,
  schemaVersion: 7,
  snapshotId: id,
  inputHash: "0123456789abcdef".repeat(4),
  inputHashComplete: true,
  frontend: { name: "slang", version: "B-public-ui-fixture" },
  bodySharing: "fast",
  tops: roots,
  definitionCount: 1,
  bodyCount: 1,
  indexState: "building",
  openedAt: "2000-02-29T23:59:59.123Z",
  topCandidates: roots.map((x) => x.ref),
});
class Wire {
  sent = [];
  messages = new Set();
  closes = new Set();
  pending = [];
  closed = false;
  hold = new Set();
  roots = [top];
  onMessage(f) {
    this.messages.add(f);
    return () => this.messages.delete(f);
  }
  onClose(f) {
    this.closes.add(f);
    return () => this.closes.delete(f);
  }
  emit(frame) {
    for (const f of [...this.messages])
      if (this.messages.has(f)) f(structuredClone(frame));
  }
  send(frame) {
    if (this.closed) throw new Error("B closed wire");
    this.sent.push(structuredClone(frame));
    if (frame.method === "cancel") return;
    this.pending.push(frame);
    if (!this.hold.has(frame.method)) queueMicrotask(() => this.reply(frame));
  }
  reply(frame, fail = false) {
    const i = this.pending.indexOf(frame);
    if (i < 0 || this.closed) return;
    this.pending.splice(i, 1);
    if (fail) {
      this.emit({
        id: frame.id,
        ok: false,
        error: {
          code: "not_found",
          message: "B Core retry",
          data: { ref: "B missing" },
        },
      });
      return;
    }
    let result;
    if (frame.method === "inst.roots") result = this.roots;
    else if (frame.method === "inst.children")
      result =
        frame.params.cursor === ""
          ? { items: [a], next: "B-ui-next" }
          : { items: [b] };
    else throw new Error("unexpected fixture method " + frame.method);
    this.emit({ id: frame.id, ok: true, result, completeness: complete });
  }
  settle(method, fail = false) {
    const frame = this.pending.findLast((x) => x.method === method);
    if (!frame) throw new Error("no held " + method);
    this.reply(frame, fail);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.pending = [];
    for (const f of [...this.closes]) f(new Error("B fixture EOF"));
  }
}
function observe(c, object, methods) {
  for (const name of methods) {
    const original = object[name];
    object[name] = function (...args) {
      const item = {
        name,
        args,
        returned: false,
        checkpoint: false,
        failed: false,
        sync: false,
      };
      c.calls.push(item);
      try {
        const value = Reflect.apply(original, this, args);
        if (value && typeof value.then === "function") {
          // Observe without substituting the Promise returned to the component.
          value.then(
            () => {
              item.settled = true;
            },
            (error) => {
              item.failed = true;
              item.raw = error;
              item.settled = true;
            },
          );
        }
        return value;
      } catch (error) {
        item.failed = true;
        item.sync = true;
        item.raw = error;
        throw error;
      } finally {
        item.returned = true;
        queueMicrotask(() => {
          item.checkpoint = true;
        });
      }
    };
  }
}
async function makeContext(options = {}) {
  const wire = new Wire();
  if (options.empty) wire.roots = [];
  for (const method of options.hold ?? []) wire.hold.add(method);
  const client = new HierClient(wire, { cacheEntries: 0 });
  const id = "B-ui-snapshot-" + contexts.length;
  wire.emit({
    event: "hello",
    protocol: 2,
    snapshot: snapshot(id, wire.roots),
    capabilities: ["cancel", "progress"],
  });
  await client.ready;
  const tree = new TreeModel(client, { pageSize: 1 });
  const selection = new SelectionModel({ snapshotId: tree.snapshotId });
  const c = {
    wire,
    client,
    tree,
    selection,
    calls: [],
    callbacks: [],
    marker: { B: "observer" },
    callbackMarker: { B: "callback" },
    callbackMode: "capture",
    fault: "",
    stale: "",
    notifications: 0,
    strict: false,
  };
  contexts.push(c);
  observe(c, tree, ["loadRoots", "setExpanded", "loadMore", "cancel"]);
  observe(c, selection, ["select"]);
  selection.subscribe(() => {
    if (c.fault !== "select") return;
    c.fault = "";
    if (c.stale === "unmount") unmount();
    if (c.stale === "replace") replace();
    if (c.stale === "remount") {
      unmount();
      mount();
    }
    throw c.marker;
  });
  tree.subscribe(() => {
    c.notifications++;
    const r = tree.rows.find(
      (x) => x.kind === "instance" && x.instance.ref === top.ref,
    );
    const hit =
      c.fault === "tree-any" ||
      (c.fault === "root-success" && tree.rootState.status === "success") ||
      (c.fault === "children-success" &&
        r?.children.status === "success" &&
        !r.children.next);
    if (hit) {
      c.fault = "";
      throw c.marker;
    }
  });
  return c;
}
class Boundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    boundaries.push(error);
  }
  render() {
    return this.state.failed ? (
      <div id="B-boundary">B boundary</div>
    ) : (
      this.props.children
    );
  }
}
function view(c) {
  const handler = (failure) => {
    const origin = c.calls.find((x) => x.failed && x.raw === failure.error);
    c.callbacks.push({
      failure,
      sameOriginal: Boolean(origin),
      checkpoint: origin?.checkpoint,
      returned: origin?.returned,
      sync: origin?.sync,
    });
    if (c.callbackMode === "throw") throw c.callbackMarker;
  };
  const props = {
    tree: c.tree,
    selection: c.selection,
    ariaLabel: "B hierarchy",
    height: 280,
    ...(c.callbackMode === "none" ? {} : { onCommandError: handler }),
  };
  const element = (
    <Boundary>
      <HierarchyTree {...props} />
    </Boundary>
  );
  return c.strict ? <StrictMode>{element}</StrictMode> : element;
}
function mount(options = {}) {
  if (typeof HierarchyTree !== "function")
    throw new Error("production HierarchyTree not exported");
  Object.assign(active, options);
  root ??= createRoot(document.getElementById("view-root"));
  flushSync(() => root.render(view(active)));
}
function unmount() {
  if (root) {
    flushSync(() => root.unmount());
    root = undefined;
  }
}
function replace() {
  if (!replacement)
    throw new Error("replacement must be ready before the event");
  active = replacement;
  replacement = undefined;
  flushSync(() => root.render(view(active)));
}
async function settle() {
  await Promise.resolve();
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
}
function rows(c) {
  return c.tree.rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    parentId: r.parentId,
    depth: r.depth,
    ...(r.kind === "instance"
      ? { ref: r.instance.ref, expanded: r.expanded, page: r.children.status }
      : {}),
    ...(r.kind === "scope" ? { label: r.label, expanded: r.expanded } : {}),
    ...(r.kind === "status" ? { owner: r.owner, page: r.state.status } : {}),
  }));
}
function state() {
  const c = active;
  return {
    capable: typeof HierarchyTree === "function",
    root: c.tree.rootState.status,
    rows: rows(c),
    selection: c.selection.current,
    disposed: c.tree.disposed,
    closed: c.wire.closed,
    queries: c.wire.sent
      .filter((x) => x.method !== "cancel")
      .map((x) => ({ method: x.method, params: x.params })),
    calls: c.calls.map((x) => ({
      name: x.name,
      args: x.args,
      failed: x.failed,
      sync: x.sync,
      checkpoint: x.checkpoint,
    })),
    callbacks: c.callbacks.map((x) => ({
      command: x.failure.command,
      rowId: x.failure.rowId,
      sameOriginal: x.sameOriginal,
      checkpoint: x.checkpoint,
      returned: x.returned,
      sync: x.sync,
      markerIdentity:
        x.failure.error instanceof AggregateError &&
        x.failure.error.errors.length === 1 &&
        x.failure.error.errors[0] === c.marker,
    })),
    allCallbacks: contexts.reduce((n, x) => n + x.callbacks.length, 0),
    allCalls: contexts.reduce((n, x) => n + x.calls.length, 0),
    boundary: boundaries.map((error) => ({
      aggregate: error instanceof AggregateError,
      firstIsOriginal: contexts.some((x) =>
        x.callbacks.some((y) => error.errors?.[0] === y.failure.error),
      ),
      secondIsCallback: contexts.some(
        (x) => error.errors?.[1] === x.callbackMarker,
      ),
      errorsLength: error.errors?.length,
    })),
    unhandled: unhandled.length,
    unexpectedWindowErrors: windowErrors.filter((e) => !boundaries.includes(e))
      .length,
  };
}
function Control() {
  const [n, set] = useState(0);
  useEffect(() => {
    stat.mounts++;
    return () => {
      stat.cleanups++;
    };
  }, []);
  return (
    <button
      id="B-fixture-probe"
      onClick={() => {
        stat.clicks++;
        set(n + 1);
      }}
    >
      B fixture {n}
    </button>
  );
}
let controlRoot;
window.B = {
  capable: typeof HierarchyTree === "function",
  async setup(options = {}) {
    active = await makeContext(options);
    return state();
  },
  mount,
  unmount,
  state,
  settle,
  configure(options) {
    Object.assign(active, options);
  },
  async prepareReplacement() {
    replacement = await makeContext();
  },
  replace,
  hold(method) {
    active.wire.hold.add(method);
  },
  reply(method, fail = false, index = null) {
    (index === null ? active : contexts[index]).wire.settle(method, fail);
  },
  async seed(expanded = false) {
    await active.tree.loadRoots();
    if (expanded)
      await active.tree.setExpanded(
        active.tree.rows.find((r) => r.kind === "instance").id,
        true,
      );
  },
  previous() {
    const c = contexts[0];
    return {
      root: c.tree.rootState.status,
      disposed: c.tree.disposed,
      closed: c.wire.closed,
      rows: rows(c),
      selectedRef: c.selection.current.items[0]?.ref,
    };
  },
  control() {
    controlRoot = createRoot(document.getElementById("probe-root"));
    flushSync(() =>
      controlRoot.render(
        <StrictMode>
          <Control />
        </StrictMode>,
      ),
    );
  },
  controlState() {
    return { ...stat };
  },
  async probeObserverFailures() {
    // Public model/spy controls, never a replacement component/error channel.
    const c = active;
    const source = c.tree.rows.find((x) => x.kind === "status");
    const owner = c.tree.rows.find((x) => x.kind === "instance");
    c.fault = "children-success";
    let pageError;
    try {
      await c.tree.loadMore(owner.id);
    } catch (error) {
      pageError = error;
    }
    await settle();
    const pageCall = c.calls.findLast((x) => x.name === "loadMore");
    c.fault = "select";
    let selectError;
    try {
      c.selection.select({
        snapshotId: c.tree.snapshotId,
        origin: "tree",
        items: [{ ref: top.ref }],
      });
    } catch (error) {
      selectError = error;
    }
    await settle();
    const selectCall = c.calls.findLast((x) => x.name === "select");
    return {
      sourceDiffersFromOwner: source.id !== owner.id,
      sourceDisappeared: !c.tree.rows.some((x) => x.id === source.id),
      retainedSourceId: typeof source.id === "string",
      pageAggregate: pageError instanceof AggregateError,
      pageOriginalObserved: pageCall.raw === pageError,
      selectAggregate: selectError instanceof AggregateError,
      selectOriginalObserved: selectCall.raw === selectError,
      selectMarkerIdentity: selectError?.errors[0] === c.marker,
      selectCheckpoint: selectCall.checkpoint,
      selectedRef: c.selection.current.items[0].ref,
      callbacks: c.callbacks.length,
    };
  },
  async shutdown() {
    unmount();
    if (controlRoot) {
      flushSync(() => controlRoot.unmount());
      controlRoot = undefined;
    }
    for (const c of contexts) {
      c.tree.dispose();
      c.selection.dispose();
      c.client.dispose();
    }
    await settle();
    return {
      ...stat,
      allDisposed: contexts.every(
        (c) => c.tree.disposed && c.selection.disposed && c.wire.closed,
      ),
    };
  },
};
