// Independent B host: original public context/models; no substitute projection or view.
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as V from "@hier/views";
import * as VM from "@hier/viewmodel";
import { HierClient } from "@hier/client";
import {
  context,
  observeMethod,
  check,
  eq,
} from "../independent-properties-panel/public-model.mjs";
import { content, expected, edgeItems, X, Y } from "./input.mjs";
const View = Reflect.get(V, "SchematicView"),
  contexts = [],
  roots = new Map(),
  caught = [],
  unhandled = [];
const projection = (...args) => Reflect.get(VM, "createGraphProjection")(...args);
const canonical = (x) =>
  Array.isArray(x)
    ? x.map(canonical)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, canonical(x[k])]),
        )
      : x;
const json = (a, b, label) => eq(JSON.stringify(canonical(a)), JSON.stringify(canonical(b)), label);
window.addEventListener("unhandledrejection", (e) => unhandled.push(e.reason));
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
class Boundary extends React.Component {
  state = { bad: false };
  static getDerivedStateFromError() {
    return { bad: true };
  }
  componentDidCatch(e) {
    caught.push(e);
  }
  render() {
    return this.state.bad ? <b>B87 boundary</b> : this.props.children;
  }
}
let C, nativeStep;
async function fresh(options = {}) {
  const c = await context({
    HierClient,
    InstancePropertiesModel: VM.InstancePropertiesModel,
    SelectionModel: VM.SelectionModel,
  });
  contexts.push(c);
  c.workers = [];
  c.pending = [];
  c.failures = [];
  c.mode = "real";
  c.counts = { graph: 0, layout: 0 };
  try {
    c.graph = new VM.GraphSession(c.client);
    c.source = c.graph.registerSource({ origin: "analysis", label: "B87 main source" });
    c.layout = new VM.LayoutService(c.graph, {
      timeoutMs: 15000,
      workerFactory() {
        const w = new Worker(
            c.mode === "real" ? "/worker.js" : c.mode === "crash" ? "/crash.js" : "/stall.js",
          ),
          row = { worker: w, posts: 0, terminated: 0 };
        c.workers.push(row);
        const post = w.postMessage.bind(w),
          terminate = w.terminate.bind(w);
        w.postMessage = (...args) => {
          const r = post(...args);
          if (args[0]?.cmd === "layout") row.posts++;
          return r;
        };
        w.terminate = () => {
          row.terminated++;
          terminate();
        };
        return w;
      },
    });
    for (const [obj, key] of [
      [c.graph, "graph"],
      [c.layout, "layout"],
    ]) {
      const original = obj.subscribe;
      Object.defineProperty(obj, "subscribe", {
        configurable: true,
        value: function (...args) {
          const off = original.apply(this, args);
          c.counts[key]++;
          let live = true;
          return () => {
            off();
            if (live) {
              live = false;
              c.counts[key]--;
            }
          };
        },
      });
    }
    for (const name of ["layout", "retry", "cancel", "dispose"])
      c.restores.push(observeMethod(c.layout, name, c.calls));
    c.callback = (f) => c.failures.push({ failure: f, inEvent: c.inEvent === true });
    if (!options.empty) await c.source.replace(content(c.graph.state.snapshotId, options));
    return c;
  } catch (e) {
    try {
      c.layout?.dispose();
    } finally {
      c.graph?.dispose();
      await c.close();
    }
    throw e;
  }
}
function mount(extra = {}, strict = false, slot = "A", c = C) {
  const child = (
    <Boundary>
      <View
        graph={c.graph}
        layout={c.layout}
        selection={c.s}
        ariaLabel={"B87 graph " + slot}
        height={300}
        onCommandError={c.callback}
        {...extra}
      />
    </Boundary>
  );
  if (!roots.has(slot)) roots.set(slot, createRoot(document.getElementById(slot)));
  flushSync(() => roots.get(slot).render(strict ? <StrictMode>{child}</StrictMode> : child));
}
function unmount(slot = "A") {
  if (roots.has(slot)) {
    flushSync(() => roots.get(slot).unmount());
    roots.delete(slot);
  }
}
const host = (slot = "A") => document.getElementById(slot),
  text = () => host().textContent ?? "",
  has = (x) => check(text().includes(String(x)), "visible raw field " + x),
  items = () => [...host().querySelectorAll('svg [role="button"]')],
  group = () => host().querySelector('svg[role="group"],svg [role="group"]');
function element(desc) {
  const found = items().filter((e) => {
    const named = e
      .getAttribute("aria-labelledby")
      ?.split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    return (e.getAttribute("aria-label") ?? named ?? e.textContent).includes(desc.target.id);
  });
  eq(found.length, 1, "one complete member accessible name");
  return found[0];
}
function desc(id, p = projection(C.graph)) {
  return (
    p.nodes.find((n) => (n.member.node.value?.id ?? n.member.node.key) === id) ??
    p.edges.find((e) => (e.member.edge.value?.id ?? e.member.edge.key) === id)
  );
}
function button(kind) {
  const re = { layout: /布局|layout/i, retry: /重试|retry/i, cancel: /取消|cancel/i }[kind];
  const list = [...host().querySelectorAll("button")].filter((b) =>
    re.test((b.getAttribute("aria-label") ?? "") + " " + b.textContent),
  );
  eq(list.length, 1, "one native command " + kind);
  return list[0];
}
function click(e) {
  C.inEvent = true;
  try {
    e.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  } finally {
    C.inEvent = false;
  }
}
const keep = (p) => {
  p.catch(() => {});
  return p;
};
async function callUI(kind) {
  const at = C.calls.length;
  click(button(kind));
  await settle();
  const calls = C.calls.slice(at).filter((c) => c.name === kind);
  eq(calls.length, 1, "one service command " + kind);
  keep(calls[0].returned);
  return calls[0];
}
async function ready() {
  const call = await callUI("layout");
  await call.returned;
  await settle();
  eq(C.layout.state.status, "success", "actual LayoutService result");
  return C.layout.state.result;
}
async function currentReady() {
  keep(C.layout.layout(projection(C.graph).layout));
  const call = C.calls.findLast((c) => c.name === "layout");
  await call.returned;
  await settle();
}
const selects = () => C.calls.filter((c) => c.name === "select");
function exactSelection(want) {
  json(C.s.current.items, want, "exact shared selection items");
  eq(C.s.current.origin, "graph", "graph origin");
}
async function rejected(p) {
  return p.then(
    () => {
      throw Error("expected rejection");
    },
    (e) => e,
  );
}
async function customLayout(c = C) {
  const state = c.graph.state,
    projection = {
      sessionId: state.sessionId,
      graphRevision: state.revision,
      direction: "UP",
      nodes: state.nodes.map((n) => ({ id: n.id, width: 223, height: 97, ports: [] })),
      edges: state.edges.map((e) => ({ id: e.id })),
    };
  await c.layout.layout(projection);
  return projection;
}
async function run(id) {
  C = await fresh({ empty: id === "U01", partial: id === "U02" });
  const c = C;
  mount();
  await settle();
  if (id === "U01") {
    eq(c.workers.length, 0, "mount creates no Worker");
    eq(c.sent.length, 0, "no Core query");
    has("idle");
    check(/无成员|empty/i.test(text()), "explicit empty graph");
    await ready();
    eq(c.workers.length, 0, "empty layout no Worker");
    return;
  }
  if (id === "U14") {
    unmount();
    const other = await fresh(),
      invalid = [
        { graph: {} },
        { graph: new Proxy(c.graph, {}) },
        { layout: other.layout },
        { selection: new VM.SelectionModel() },
        { ariaLabel: " " },
        { height: 0 },
        { height: NaN },
        { direction: "diagonal" },
        { className: 2 },
        { onCommandError: 2 },
      ];
    try {
      for (const bad of invalid) {
        const n = caught.length;
        mount(bad);
        await settle();
        check(
          caught.slice(n).some((e) => e instanceof TypeError),
          "invalid initial props TypeError",
        );
        eq(c.counts.graph, 0, "no graph subscriptions");
        eq(c.counts.layout, 0, "no layout subscriptions");
        eq(c.stats.selection.active, 0, "no selection subscriptions");
        unmount();
      }
      mount();
      await settle();
      const n = caught.length;
      c.graph.dispose();
      mount({ className: "force render" });
      await settle();
      eq(caught.length, n, "later disposal not invalid initial props");
      has("disposed");
      for (const b of host().querySelectorAll("button"))
        check(b.disabled, "disposed commands disabled");
    } finally {
      invalid[3].selection.dispose();
    }
    return;
  }
  if (id === "U04") {
    const raw = content(c.graph.state.snapshotId),
      copy = structuredClone(raw.edges[0]);
    copy.value.id = "B87-same-items";
    copy.value.fact = "B87:independent-fact";
    raw.edges.push(copy);
    await c.source.replace(raw);
    await settle();
  }
  const initial = await ready();
  const original = JSON.stringify(c.graph.state),
    layoutJSON = JSON.stringify(initial);
  if (id === "U02") {
    for (const value of [
      "B87 main source",
      "analysis",
      "partial",
      "budget_nodes",
      "B87:frontier",
      "B87:opaque-cursor",
    ])
      has(value);
    click(element(desc("B-high")));
    await settle();
    for (const value of [
      "B87:fact-high",
      "B-x",
      "B-y",
      "data",
      "exact",
      "bitwise",
      "B87 main source",
    ])
      has(value);
    click(element(desc("ext")));
    await settle();
    has("pin[3]");
    has("opaque port");
    has("<img src=x onerror=alert(1)>");
    eq(host().querySelectorAll("img").length, 0, "labels not interpreted HTML");
    const never = c.graph.registerSource({ origin: "plan", label: "B87 empty-source" });
    await never.clear();
    await settle();
    has("B87 empty-source");
    check(/尚无结果|no result/i.test(text()), "null content is not complete empty result");
    await rejected(
      c.source.refresh(() => {
        throw new Error("B87 source provider failure");
      }),
    );
    await settle();
    for (const value of [
      c.source.state.error.code,
      c.source.state.error.origin,
      c.source.state.error.message,
    ])
      has(value);
    check(/先前|旧|previous/i.test(text()), "failed source retained content is marked previous");
  }
  if (id === "U03") {
    for (const id of ["B-low", "B-high"]) {
      click(element(desc(id)));
      await settle();
      exactSelection(edgeItems(id));
      eq(selects().at(-1).args.length, 1, "one replacement request");
    }
    eq(selects().length, 2, "one selection per click");
    c.s.back();
    await settle();
    json(c.s.current.items, edgeItems("B-low"), "shared back history");
    c.s.forward();
    await settle();
    json(c.s.current.items, edgeItems("B-high"), "shared forward history");
    eq(JSON.stringify(c.graph.state), original, "facts not changed");
    eq(JSON.stringify(c.layout.state.result), layoutJSON, "layout not changed");
  }
  if (id === "U04") {
    const target = desc("B-low");
    for (const value of [
      [{ ref: "B87:x<&>" }],
      [{ def: "B87:definition" }],
      [...target.items].reverse().concat([{ ref: "B87:other" }]),
    ]) {
      c.s.select({ snapshotId: c.graph.state.snapshotId, origin: "external", items: value });
      await settle();
      eq(
        element(target).getAttribute("aria-pressed"),
        value.length === 3 ? "true" : "false",
        "exact subset, no broad ref/definition match",
      );
      eq(
        element(desc("B87-same-items")).getAttribute("aria-pressed"),
        value.length === 3 ? "true" : "false",
        "independent fact with same items highlights independently",
      );
    }
    eq(
      items().length,
      c.graph.state.nodes.length + c.graph.state.edges.length,
      "one DOM target per raw member",
    );
  }
  if (id === "U05") {
    const sequence = items();
    eq(sequence.filter((e) => e.tabIndex === 0).length, 1, "one roving tabstop");
    sequence[0].focus();
    let at = 0;
    const scroll = window.scrollY;
    nativeStep = async (i) => {
      const last = sequence.length - 1;
      at = [1, 2, 1, 0, last, last, last, last][i];
      eq(document.activeElement, sequence[at], "native key index " + i);
      eq(items().filter((e) => e.tabIndex === 0).length, 1, "one roving focus");
      if (i < 6) eq(selects().length, 0, "focus does not select");
      else {
        eq(selects().length, i - 5, "one Enter/Space activation");
        json(
          c.s.current.items,
          projection(c.graph).edges.at(-1).items,
          "native selected last edge",
        );
      }
      eq(window.scrollY, scroll, "Space does not scroll page");
      return { pass: true };
    };
    return {
      keys: ["ArrowRight", "ArrowDown", "ArrowLeft", "Home", "End", "ArrowRight", "Enter", "Space"],
    };
  }
  if (id === "U06") {
    c.s.select({
      snapshotId: c.graph.state.snapshotId,
      origin: "external",
      items: [{ ref: "B87:unrelated" }],
    });
    const saved = c.s.current;
    const e = element(desc("B-none"));
    click(e);
    await settle();
    eq(document.activeElement, e, "unselectable still focusable");
    eq(e.getAttribute("aria-disabled"), "true", "no fabricated selection");
    eq(c.s.current, saved, "no-object does not clear selection");
    has("unknown_pin_width");
    click(host().querySelector("svg"));
    await settle();
    eq(c.s.current, saved, "blank click leaves selection");
  }
  if (id === "U07") {
    const target = desc(X),
      old = element(target);
    click(old);
    await settle();
    const saved = c.s.current;
    const shared = c.graph.registerSource({ origin: "design", label: "B87 shared" }),
      raw = content(c.graph.state.snapshotId);
    await shared.replace({
      ...raw,
      nodes: raw.nodes.filter((n) => n.kind === "design" && [X, Y].includes(n.value.id)),
      edges: [raw.edges[0]],
    });
    await c.source.clear();
    await settle();
    eq(items().length, 0, "new revision cannot draw old geometry");
    eq(c.s.current, saved, "withdraw does not clear shared selection");
    const n = selects().length;
    click(old);
    eq(selects().length, n, "stale detached hit ignored");
    await ready();
    eq(c.graph.state.nodes.length, 2, "shared nodes survive");
    eq(c.graph.state.edges.length, 1, "shared fact survives");
  }
  if (id === "U08") {
    const old = element(desc("B-low")),
      selection = c.s.current;
    c.mode = "stall";
    const layoutCall = await callUI("layout");
    eq(c.layout.state.status, "pending", "real pending");
    eq(c.layout.state.result, initial, "same-revision previous result retained");
    const n = selects().length;
    click(old);
    eq(selects().length, n, "pending old hit disabled");
    const cancel = await callUI("cancel");
    await cancel.returned;
    const error = await rejected(layoutCall.returned);
    eq(error.code, "cancelled", "caller settles cancelled");
    await settle();
    eq(c.layout.state.status, "cancelled", "cancel state");
    eq(c.s.current, selection, "cancel does not clear selection");
    c.mode = "real";
    const retry = await callUI("retry");
    await retry.returned;
    await settle();
    eq(c.layout.state.status, "success", "retry recovers");
  }
  if (id === "U09") {
    const old = element(desc("B-low")),
      before = selects().length,
      task = c.layout.state.result.taskId;
    await currentReady();
    check(c.layout.state.result.taskId !== task, "new task same revision");
    click(old);
    await settle();
    eq(selects().length, before, "old task DOM handler cannot select");
    click(element(desc("B-low")));
    await settle();
    eq(selects().length, before + 1, "current hit valid");
  }
  if (id === "U10") {
    c.mode = "crash";
    const failure = await callUI("layout"),
      error = await rejected(failure.returned);
    await settle();
    eq(c.layout.state.status, "failed", "Worker failure state");
    has("worker_failure");
    eq(c.failures.length, 1, "one command feedback");
    eq(c.failures[0].failure.error, error, "original error identity");
    eq(c.failures[0].failure.command, "layout", "command");
    eq(c.failures[0].inEvent, false, "feedback is deferred");
    const n = selects().length;
    click(element(desc("B-low")));
    eq(selects().length, n, "failure old layout not selectable");
    c.mode = "real";
    const retry = await callUI("retry");
    await retry.returned;
    await settle();
    eq(c.layout.state.status, "success", "new Worker retry");
  }
  if (id === "U11") {
    unmount();
    eq(c.counts.graph, 0, "graph unsubscribe");
    eq(c.counts.layout, 0, "layout unsubscribe");
    eq(c.stats.selection.active, 0, "selection unsubscribe");
    const workers = c.workers.length;
    mount({}, true);
    await settle();
    eq(c.workers.length, workers, "StrictMode no implicit task");
    c.mode = "stall";
    const cmd = await callUI("layout");
    unmount();
    eq(c.layout.state.status, "pending", "unmount borrows pending host task");
    eq(c.graph.disposed, false, "graph borrowed");
    eq(c.s.disposed, false, "selection borrowed");
    await c.layout.cancel();
    await rejected(cmd.returned);
    await settle();
    eq(c.failures.length, 0, "unmounted callback revoked");
    c.mode = "real";
    await c.layout.retry();
    mount();
    await settle();
    eq(c.layout.state.status, "success", "host continues/retries without view");
  }
  if (id === "U12") {
    c.mode = "stall";
    const cmd = await callUI("layout");
    const other = await fresh();
    mount({}, false, "A", other);
    await settle();
    eq(c.counts.graph, 0, "old graph detached");
    eq(c.counts.layout, 0, "old layout detached");
    eq(c.layout.state.status, "pending", "replacement not owner of old task");
    await c.layout.cancel();
    await rejected(cmd.returned);
    await settle();
    eq(c.failures.length, 0, "replacement revokes prior feedback");
    eq(other.layout.state.status, "idle", "new session unaffected");
  }
  if (id === "U13") {
    const focused = element(desc(X));
    focused.focus();
    await c.source.clear();
    await settle();
    eq(document.activeElement, group(), "removed own element restores own container focus");
    await c.source.replace(content(c.graph.state.snapshotId));
    await ready();
    document.getElementById("after").focus();
    await c.source.clear();
    await settle();
    eq(document.activeElement, document.getElementById("after"), "no external focus theft");
  }
  if (id === "U15") {
    const before = c.workers.length;
    mount({ direction: "DOWN" });
    await settle();
    eq(c.workers.length, before, "direction prop has no automatic layout");
    eq(c.layout.state.result.direction, "RIGHT", "render keeps actual direction");
    await customLayout();
    await settle();
    eq(c.layout.state.result.direction, "UP", "host actual direction");
    for (const n of c.layout.state.result.nodes) {
      const e = element(projection(c.graph).nodes.find((d) => d.target.id === n.id));
      const rect = e.tagName.toLowerCase() === "rect" ? e : e.querySelector("rect");
      check(rect, "node rectangle");
      eq(Number(rect.getAttribute("width")), 223, "actual host width");
      eq(Number(rect.getAttribute("height")), 97, "actual host height");
    }
    eq(c.graph.state.revision, initial.graphRevision, "custom anchors do not change facts");
  }
  if (id === "U16") {
    const original = { B87: "original" },
      callback = { B87: "callback" };
    let reads = 0;
    Object.defineProperty(original, "message", {
      get() {
        reads++;
        throw Error("do not render arbitrary message");
      },
    });
    Object.defineProperty(c.s, "select", {
      configurable: true,
      value() {
        throw original;
      },
    });
    mount({
      onCommandError() {
        throw callback;
      },
    });
    await settle();
    click(element(desc(X)));
    await settle();
    check(
      caught.some(
        (e) => e instanceof AggregateError && e.errors[0] === original && e.errors[1] === callback,
      ),
      "boundary receives original and callback error",
    );
    eq(reads, 0, "never reads arbitrary thrown message");
  }
  await settle();
  eq(c.sent.length, 0, "no Core query");
  return { pass: true };
}
async function cleanup() {
  for (const key of [...roots.keys()]) unmount(key);
  const errors = [];
  for (const c of contexts) {
    for (const [name, fn] of [
      ["layout", () => c.layout?.dispose()],
      ["graph", () => c.graph?.dispose()],
      ["context", () => c.close()],
    ])
      try {
        const r = await fn();
        if (Array.isArray(r) && r.length) errors.push(...r.map((x) => name + ":" + String(x.name)));
      } catch (e) {
        errors.push(name + ":" + String(e));
      }
    if (c.counts.graph || c.counts.layout || c.stats.selection.active)
      errors.push("retained subscriptions");
    for (const w of c.workers)
      if (w.terminated !== 1) errors.push("Worker termination " + w.terminated);
  }
  if (unhandled.length) errors.push("unhandled rejections " + unhandled.length);
  return {
    errors,
    contexts: contexts.length,
    workers: contexts.map((c) =>
      c.workers.map((w) => ({ posts: w.posts, terminated: w.terminated })),
    ),
    pendingViews: roots.size,
  };
}
window.BS = {
  capable:
    typeof View === "function" &&
    ["createGraphProjection", "selectGraphElement", "GraphProjectionError"].every(
      (n) => typeof VM[n] === "function",
    ),
  run,
  verify: (i) => nativeStep(i),
  cleanup,
  async control() {
    C = await fresh();
    await customLayout();
    eq(C.layout.state.status, "success", "real Graph/Selection/Layout/ELK fixture");
    eq(C.graph.state.nodes.length, 8, "legal raw members");
    eq(C.graph.state.edges.length, 5, "parallel facts survive");
    eq(C.sent.length, 0, "no query");
    return { pass: true };
  },
};
