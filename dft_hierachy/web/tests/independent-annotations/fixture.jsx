// B public-model host, borrowing the original context/DTOs. No annotation substitute.
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as VM from "@hier/viewmodel";
import * as V from "@hier/views";
import { HierClient } from "@hier/client";
import {
  context,
  observeMethod,
  check,
  eq,
  instance,
  snapshot,
  target,
} from "../independent-properties-panel/public-model.mjs";
import { content, X, Y } from "../independent-schematic-view/input.mjs";
const Layer = Reflect.get(VM, "AnnotationLayer"),
  resolve = Reflect.get(VM, "resolveObjectAnnotations");
const Tree = Reflect.get(V, "HierarchyTree"),
  Graph = Reflect.get(V, "SchematicView");
const contexts = [],
  roots = new Map(),
  caught = [],
  unhandled = [];
window.addEventListener("unhandledrejection", (e) => unhandled.push(e.reason));
class Boundary extends React.Component {
  state = { bad: false };
  static getDerivedStateFromError() {
    return { bad: true };
  }
  componentDidCatch(e) {
    caught.push(e);
  }
  render() {
    return this.state.bad ? <b>B90 boundary</b> : this.props.children;
  }
}
const turn = () =>
  new Promise((r) => {
    const m = new MessageChannel();
    m.port1.onmessage = () => {
      m.port1.close();
      m.port2.close();
      r();
    };
    m.port2.postMessage(0);
  });
async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  flushSync(() => {});
  await turn();
  flushSync(() => {});
}
// The properties fixture deliberately has display-only path/name text. Tree inputs instead
// use one self-consistent root in both hello metadata and inst.roots (same ref/mark oracle).
const treeRoot = () => {
  const r = instance();
  return { ...r, path: [r.name], pathText: "\\" + r.name + " " };
};
function treeWire() {
  const messages = new Set(),
    closes = new Set(),
    sent = [];
  let closed = false;
  const emit = (frame) => {
    if (!closed) for (const f of [...messages]) if (messages.has(f)) f(structuredClone(frame));
  };
  return {
    messages,
    closes,
    sent,
    onMessage(f) {
      messages.add(f);
      queueMicrotask(() =>
        emit({
          event: "hello",
          protocol: 2,
          snapshot: { ...snapshot(), tops: [treeRoot()] },
          capabilities: ["cancel", "progress"],
        }),
      );
      return () => messages.delete(f);
    },
    onClose(f) {
      closes.add(f);
      return () => closes.delete(f);
    },
    send(frame) {
      check(!closed, "live tree input transport");
      sent.push(structuredClone(frame));
      if (frame.method === "cancel") return;
      let result;
      if (frame.method === "inst.roots") result = [treeRoot()];
      else if (frame.method === "inst.children")
        result = {
          items: [
            {
              ...instance("B90 child"),
              name: "child",
              path: [...treeRoot().path, "scope.with.dot", "child"],
              pathText: "B90 literal child path",
              childCount: 0,
            },
          ],
          next: "B90 next",
        };
      else throw Error("unexpected B90 tree input query " + frame.method);
      queueMicrotask(() =>
        emit({ id: frame.id, ok: true, result, completeness: { status: "complete", reasons: [] } }),
      );
    },
    close() {
      if (closed) return;
      closed = true;
      for (const f of [...closes]) if (closes.has(f)) f(Error("B90 controlled EOF"));
    },
  };
}
async function fresh() {
  const c = await context(
    {
      HierClient,
      InstancePropertiesModel: VM.InstancePropertiesModel,
      SelectionModel: VM.SelectionModel,
    },
    { wire: treeWire() },
  );
  contexts.push(c);
  c.layers = [];
  c.workers = [];
  c.tree = new VM.TreeModel(c.client, { showGenerateScopes: true, pageSize: 1 });
  c.graph = new VM.GraphSession(c.client);
  c.source = c.graph.registerSource({ origin: "analysis", label: "B90 original graph input" });
  c.layout = new VM.LayoutService(c.graph, {
    timeoutMs: 15000,
    workerFactory() {
      const worker = new Worker("/worker.js"),
        row = { worker, posts: 0, terminated: 0 };
      c.workers.push(row);
      const post = worker.postMessage.bind(worker),
        end = worker.terminate.bind(worker);
      worker.postMessage = (...a) => {
        if (a[0]?.cmd === "layout") row.posts++;
        return post(...a);
      };
      worker.terminate = () => {
        row.terminated++;
        end();
      };
      return worker;
    },
  });
  for (const [o, names] of [
    [c.tree, ["loadRoots", "setExpanded", "loadMore", "cancel", "dispose"]],
    [c.layout, ["layout", "retry", "cancel", "dispose"]],
  ])
    for (const n of names)
      if (typeof o[n] === "function") c.restores.push(observeMethod(o, n, c.calls));
  await c.hold(c.tree.loadRoots());
  await c.source.replace(content(c.graph.state.snapshotId));
  await c.layout.layout(VM.createGraphProjection(c.graph).layout);
  eq(c.layout.state.status, "success", "actual native ELK result");
  return c;
}
function layer(c, id = "B90 layer", snapshotId = c.tree.snapshotId) {
  const a = new Layer({ snapshotId, id, label: "label " + id }),
    stat = { active: 0, adds: 0, removes: 0 };
  c.layers.push({ a, stat });
  const sub = a.subscribe;
  a.subscribe = function (...args) {
    const off = sub.apply(this, args);
    stat.adds++;
    stat.active++;
    let live = true;
    return () => {
      off();
      if (live) {
        live = false;
        stat.active--;
        stat.removes++;
      }
    };
  };
  return a;
}
const mark = (ref, badge, extra = {}) => ({ ref, mark: { badge, ...extra } });
let epoch = 0;
function mount(c, annotations, slot = "A", strict = false, omit = false) {
  const props = {
    selection: c.s,
    ariaLabel: "B90 " + slot,
    height: 280,
    ...(omit ? {} : { annotations }),
  };
  const child = (
    <Boundary key={++epoch}>
      {slot === "A" ? (
        <Tree tree={c.tree} rowHeight={28} {...props} />
      ) : (
        <Graph graph={c.graph} layout={c.layout} {...props} />
      )}
    </Boundary>
  );
  if (!roots.has(slot)) roots.set(slot, createRoot(document.getElementById(slot)));
  flushSync(() => roots.get(slot).render(strict ? <StrictMode>{child}</StrictMode> : child));
}
// Updates preserve the Boundary/component identity, unlike explicit invalid-prop isolation.
function render(c, annotations, slot = "A", strict = false) {
  const props = { selection: c.s, ariaLabel: "B90 " + slot, height: 280, annotations };
  const child = (
    <Boundary key={slot}>
      {slot === "A" ? (
        <Tree tree={c.tree} rowHeight={28} {...props} />
      ) : (
        <Graph graph={c.graph} layout={c.layout} {...props} />
      )}
    </Boundary>
  );
  if (!roots.has(slot)) roots.set(slot, createRoot(document.getElementById(slot)));
  flushSync(() => roots.get(slot).render(strict ? <StrictMode>{child}</StrictMode> : child));
}
function unmount(slot) {
  if (roots.has(slot)) {
    flushSync(() => roots.get(slot).unmount());
    roots.delete(slot);
  }
}
const host = (slot = "A") => document.getElementById(slot),
  text = (slot = "A") => host(slot).textContent ?? "";
function description(e) {
  return [
    e.textContent,
    e.getAttribute("aria-label"),
    e.getAttribute("title"),
    ...["aria-labelledby", "aria-describedby"].flatMap((k) =>
      (e.getAttribute(k) ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent ?? ""),
    ),
  ].join(" ");
}
function element(c, id) {
  const p = VM.createGraphProjection(c.graph),
    d =
      p.nodes.find((n) => (n.member.node.value?.id ?? n.member.node.key) === id) ??
      p.edges.find((e) => (e.member.edge.value?.id ?? e.member.edge.key) === id);
  check(d, "known original graph descriptor");
  const found = [...host("B").querySelectorAll('svg [role="button"]')].filter((e) =>
    description(e).includes(d.target.id),
  );
  eq(found.length, 1, "one original graph member");
  return found[0];
}
const same = (a, b, m) => eq(JSON.stringify(a), JSON.stringify(b), m);
function invariant(c) {
  return {
    graph: c.graph.state,
    result: c.layout.state.result,
    layout: c.layout.state,
    selection: c.s.current,
    back: c.s.canGoBack,
    forward: c.s.canGoForward,
    rows: JSON.stringify(c.tree.rows),
    queries: c.sent.length,
    calls: c.calls.length,
  };
}
function unchanged(c, b) {
  const a = invariant(c);
  for (const k of Object.keys(b)) eq(a[k], b[k], "annotation side effect " + k);
}
async function run(id) {
  check(
    typeof Layer === "function" && typeof resolve === "function",
    "production annotation capability",
  );
  const c = await fresh(),
    a = layer(c),
    b = layer(c, "B90 other");
  const xm = "B90 X marker",
    ym = "B90 Y marker",
    tm = "B90 actual row marker";
  if (id === "U01") {
    mount(c, undefined, "A", false, true);
    mount(c, undefined, "B", false, true);
    await settle();
    const before = { A: text(), B: text("B") },
      state = invariant(c);
    for (const list of [undefined, []]) {
      mount(c, list, "A");
      mount(c, list, "B");
      await settle();
      same({ A: text(), B: text("B") }, before, "omitted/undefined/empty original text");
      unchanged(c, state);
    }
  }
  if (id === "U02") {
    const root = c.tree.rows.find((r) => r.kind === "instance");
    await c.hold(c.tree.setExpanded(root.id, true));
    check(
      c.tree.rows.some((r) => r.kind === "scope"),
      "real scope row",
    );
    check(
      c.tree.rows.some((r) => r.kind === "status"),
      "real page status row",
    );
    c.s.select({
      snapshotId: c.tree.snapshotId,
      origin: "external",
      items: [{ ref: "B90 other selected" }],
    });
    a.set([mark(target, tm), mark("B90 other selected", "B90 wrong selection mark")]);
    render(c, [a]);
    await settle();
    check(text().includes(tm), "actual instance marked");
    check(!text().includes("B90 wrong selection mark"), "not selected ref projection");
    const hits = [...host().querySelectorAll('[role="treeitem"]')].filter((e) =>
      description(e).includes(tm),
    );
    eq(hits.length, 1, "scope/status do not inherit root annotation");
  }
  if (id === "U03") {
    a.set([
      mark("B87:x<&>", xm),
      mark("B87:y", ym),
      mark("B87:must-not-select", "B90 forbidden point fallback"),
      mark("B87:fact-low", "B90 forbidden fact"),
    ]);
    render(c, [a], "B");
    await settle();
    for (const id of [X, "B-self"]) {
      const d = description(element(c, id));
      check(d.includes(xm), "point ref marked");
      check(!d.includes(ym), "not other endpoint");
    }
    for (const id of ["B-low", "B-high"]) {
      const d = description(element(c, id));
      check(d.includes(xm) && d.includes(ym), "both original endpoint refs marked");
    }
    for (const id of ["B-none", "no-target"])
      check(!description(element(c, id)).includes(xm), "no guessed object");
    check(!text("B").includes("B90 forbidden"), "no ref/fact inference");
  }
  if (id === "U04") {
    const raw = "<img src=x onerror=window.B90_XSS=1> 尾";
    a.set([
      mark(target, "A visible", { color: "#aB12Ef", tooltip: raw, severity: "warn" }),
      mark("B87:x<&>", "A-X"),
      mark("B87:y", "A-Y"),
    ]);
    b.set([
      { ref: target, mark: { severity: "info", tooltip: "B90 tooltip" } },
      mark("B87:x<&>", "B-X"),
      mark("B87:y", "B-Y"),
    ]);
    render(c, [b, a]);
    render(c, [b, a], "B");
    await settle();
    const row = [...host().querySelectorAll('[role="treeitem"]')].find(
      (e) => description(e).includes(tm) || description(e).includes(instance().name),
    );
    check(row, "actual root row");
    const d = description(row);
    for (const x of [target, "B90 layer", "B90 other", raw, "warn", "info"])
      check(d.includes(x), "complete accessible annotation " + x);
    check(!host().querySelector("img"), "tooltip is text");
    check(!window.B90_XSS, "no HTML execution");
    check(
      [...host().querySelectorAll("*")].some(
        (e) =>
          getComputedStyle(e).backgroundColor === "rgb(171, 18, 239)" ||
          getComputedStyle(e).fill === "rgb(171, 18, 239)" ||
          getComputedStyle(e).color === "rgb(171, 18, 239)",
      ),
      "literal six-digit color swatch",
    );
    const e = description(element(c, "B-low"));
    const seq = ["B-X", "B-Y", "A-X", "A-Y"];
    for (let i = 1; i < seq.length; i++)
      check(e.indexOf(seq[i - 1]) < e.indexOf(seq[i]), "layer outer/ref inner visible order");
    b.set([mark(target, "", { severity: "error" })]);
    await settle();
    check(b.state.marks[0].mark.badge === "", "empty badge preserved");
  }
  if (id === "U05") {
    render(c, [a]);
    render(c, [a], "B");
    await settle();
    c.s.select({ snapshotId: c.tree.snapshotId, origin: "external", items: [{ ref: target }] });
    c.s.select({
      snapshotId: c.tree.snapshotId,
      origin: "external",
      items: [{ ref: "B90 history" }],
    });
    c.s.back();
    await settle();
    const rows = [...host().querySelectorAll('[role="treeitem"]')];
    check(rows.length > 0, "actual fixed-height rows");
    rows[0].focus();
    const rowFocus = document.activeElement;
    const heights = rows.map((e) => e.getBoundingClientRect().height);
    const before = invariant(c);
    for (const marks of [[mark(target, tm), mark("B87:x<&>", xm)], []]) {
      a.set(marks);
      await settle();
      unchanged(c, before);
      same(
        rows.map((e) => e.getBoundingClientRect().height),
        heights,
        "fixed rowHeight unchanged",
      );
      eq(document.activeElement, rowFocus, "annotation does not steal tree focus");
    }
    a.clear();
    await settle();
    unchanged(c, before);
  }
  if (id === "U06") {
    render(c, [a], "A", true);
    render(c, [a], "B", true);
    await settle();
    check(c.layers[0].stat.active > 0, "shared real subscriptions");
    render(c, [b], "A", true);
    await settle();
    unmount("B");
    await settle();
    eq(c.layers[0].stat.active, 0, "old list fully unsubscribed");
    check(c.layers[1].stat.active > 0, "new layer borrowed");
    unmount("A");
    eq(c.layers[1].stat.active, 0, "replacement unmounted");
    eq(a.disposed, false, "old shared layer not disposed");
    eq(b.disposed, false, "new layer not disposed");
    a.set([mark(target, tm)]);
    eq(a.state.revision, 1, "host still owns layer");
  }
  if (id === "U07") {
    const other = layer(c, "mismatch", "other snapshot"),
      sameId = layer(c, "B90 layer");
    for (const value of [null, {}, [{}], [a, a], [a, sameId], [other], [new Proxy(a, {})]])
      for (const slot of ["A", "B"]) {
        const n = caught.length;
        mount(c, value, slot);
        await settle();
        eq(caught.length, n + 1, "invalid props synchronously reaches boundary");
        check(caught.at(-1) instanceof TypeError, "props TypeError");
        eq(c.layers[0].stat.active, 0, "no partial subscription");
        unmount(slot);
      }
    a.dispose();
    render(c, [a]);
    render(c, [a], "B");
    await settle();
    eq(c.layers[0].stat.active, 0, "disposed same-snapshot accepted without subscription");
  }
  if (id === "U08") {
    a.set([mark(target, "B90 captured A")]);
    b.set([mark(target, "B90 captured B")]);
    const list = [a];
    render(c, list);
    await settle();
    list[0] = b;
    b.set([mark(target, "B90 mutated B")]);
    await settle();
    check(
      text().includes("B90 captured A") && !text().includes("B90 mutated B"),
      "caller array mutation alone does not change committed list",
    );
    render(c, list);
    await settle();
    check(text().includes("B90 mutated B"), "next render recaptures");
    eq(c.layers[0].stat.active, 0, "previous list unsubscribed");
  }
  if (id === "U09") {
    render(c, [a], "B");
    await settle();
    const el = element(c, X);
    el.focus();
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();
    const focus = document.activeElement,
      n = host("B").querySelectorAll("button,a[href],input,[tabindex]").length,
      full = text("B");
    check(focus === el, "public graph element focus");
    a.set([mark("B87:x<&>", xm)]);
    await settle();
    eq(element(c, X), el, "same graph DOM identity");
    eq(document.activeElement, focus, "no stolen focus");
    eq(
      host("B").querySelectorAll("button,a[href],input,[tabindex]").length,
      n,
      "no added activation/tab stop",
    );
    check(text("B").includes("B87:x<&>") && full.includes("B87:x<&>"), "focused details retained");
  }
  if (id === "U10") {
    a.set([mark(target, tm), mark("B87:x<&>", xm)]);
    render(c, [a]);
    render(c, [a], "B");
    await settle();
    a.dispose();
    render(c, [a]);
    render(c, [a], "B");
    await settle();
    check(!text().includes(tm) && !text("B").includes(xm), "silent disposal clears at next render");
    b.set([mark("B87:x<&>", "B90 old geometry mark")]);
    render(c, [b], "B");
    await settle();
    check(text("B").includes("B90 old geometry mark"), "initial geometry marked");
    const input = content(c.graph.state.snapshotId);
    input.nodes.pop();
    await c.source.replace(input);
    await settle();
    check(!text("B").includes("B90 old geometry mark"), "stale hidden geometry not marked");
  }
  return {
    pass: true,
    boundaryErrors: caught.length,
    queries: c.sent.length,
    workers: c.workers.map((w) => ({ posts: w.posts, terminated: w.terminated })),
  };
}
async function control() {
  const c = await fresh();
  mount(c, undefined, "A", false, true);
  mount(c, undefined, "B", false, true);
  await settle();
  check(host().querySelector('[role="tree"]'), "actual tree");
  check(host("B").querySelector('svg [role="button"]'), "actual schematic native geometry");
  return {
    pass: true,
    nodes: c.graph.state.nodes.length,
    edges: c.graph.state.edges.length,
    treeRows: c.tree.rows.length,
    layout: c.layout.state.status,
  };
}
async function cleanup() {
  const errors = [];
  for (const slot of [...roots.keys()])
    try {
      unmount(slot);
    } catch (e) {
      errors.push(String(e));
    }
  for (const c of contexts.reverse()) {
    for (const [name, fn] of [
      ["layout", () => c.layout?.dispose()],
      ["graph", () => c.graph?.dispose()],
      ["tree", () => c.tree?.dispose()],
    ])
      try {
        fn();
      } catch (e) {
        errors.push(name + ": " + String(e));
      }
    for (const { a, stat } of c.layers) {
      if (stat.active) errors.push("retained borrowed layer subscription");
      try {
        a.dispose();
      } catch (e) {
        errors.push(String(e));
      }
    }
    try {
      for (const x of await c.close()) errors.push(x.name + ": " + String(x.error));
    } catch (e) {
      errors.push(String(e));
    }
    for (const w of c.workers)
      if (w.terminated !== 1) errors.push("Worker release count " + w.terminated);
  }
  if (unhandled.length) errors.push("unhandled rejections " + unhandled.length);
  return {
    errors,
    contexts: contexts.length,
    pendingViews: roots.size,
    workers: contexts.flatMap((c) =>
      c.workers.map((w) => ({ posts: w.posts, terminated: w.terminated })),
    ),
    layers: contexts.flatMap((c) => c.layers.map((x) => x.stat)),
  };
}
window.BA = {
  capable:
    typeof Layer === "function" &&
    typeof resolve === "function" &&
    typeof Reflect.get(VM, "AnnotationError") === "function" &&
    typeof Tree === "function" &&
    typeof Graph === "function",
  run,
  control,
  cleanup,
};
