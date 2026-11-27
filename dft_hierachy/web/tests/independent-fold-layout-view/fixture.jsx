// Original public models, B DTOs and native Worker. No replacement view/service/projection.
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
} from "../independent-properties-panel/public-model.mjs";
import {
  content,
  fullOptions,
  hierarchy,
  expectedItems,
  unique,
  nodeKey,
  edgeKey,
} from "../independent-fold-projection/input.mjs";
const roots = new Map(),
  contexts = [],
  caught = [],
  unhandled = [];
window.addEventListener("unhandledrejection", (e) => unhandled.push(e.reason));
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
const json = (a, b, m) => eq(JSON.stringify(canonical(a)), JSON.stringify(canonical(b)), m);
const turn = () =>
  new Promise((resolve) => {
    const c = new MessageChannel();
    c.port1.onmessage = () => {
      c.port1.close();
      c.port2.close();
      resolve();
    };
    c.port2.postMessage(0);
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
    return this.state.bad ? <b>B97 boundary</b> : this.props.children;
  }
}
let C;
function subscribed(c, obj, label) {
  const descriptor = Object.getOwnPropertyDescriptor(obj, "subscribe"),
    original = obj.subscribe;
  c.stats97[label] = { active: 0, adds: 0, removes: 0 };
  Object.defineProperty(obj, "subscribe", {
    configurable: true,
    value: function (...args) {
      const off = original.apply(this, args),
        s = c.stats97[label];
      s.active++;
      s.adds++;
      let live = true;
      return () => {
        off();
        if (live) {
          live = false;
          s.active--;
          s.removes++;
        }
      };
    },
  });
  c.restores.push(() =>
    descriptor
      ? Object.defineProperty(obj, "subscribe", descriptor)
      : Reflect.deleteProperty(obj, "subscribe"),
  );
}
async function fresh({ folded = true, empty = false } = {}) {
  const c = await context({
    HierClient,
    InstancePropertiesModel: VM.InstancePropertiesModel,
    SelectionModel: VM.SelectionModel,
  });
  contexts.push(c);
  c.folded = folded;
  c.workers = [];
  c.layers = [];
  c.extras = [];
  c.stats97 = {};
  c.pending = [];
  c.intents = [];
  c.failures = [];
  c.workerMode = "real";
  c.graph = new VM.GraphSession(c.client);
  c.source = c.graph.registerSource({ origin: "analysis", label: "B97 source" });
  if (!empty) await c.source.replace(content(c.graph.state.snapshotId));
  const base = empty ? { groups: [], collapsed: [] } : fullOptions(c.graph);
  const options = empty
    ? base
    : {
        groups: [base.groups[0], hierarchy(c.graph, "H-in", ["B-x"], "B97 inner"), base.groups[1]],
        collapsed: base.collapsed,
      };
  c.p = VM.createFoldedGraphProjection(c.graph, options);
  c.options = {
    timeoutMs: 10000,
    workerFactory() {
      const worker = new Worker(
          c.workerMode === "real"
            ? "/worker.js"
            : c.workerMode === "crash"
              ? "/crash.js"
              : "/stall.js",
        ),
        row = { worker, posts: 0, terminated: 0 };
      c.workers.push(row);
      const post = worker.postMessage.bind(worker),
        terminate = worker.terminate.bind(worker);
      worker.postMessage = (...args) => {
        const r = post(...args);
        if (args[0]?.cmd === "layout") row.posts++;
        return r;
      };
      worker.terminate = () => {
        row.terminated++;
        terminate();
      };
      return worker;
    },
  };
  c.layout = folded
    ? new VM.LayoutService(c.graph, c.options, "folded")
    : new VM.LayoutService(c.graph, c.options);
  for (const [obj, label] of [
    [c.graph, "graph"],
    [c.layout, "layout"],
    [c.s, "selection"],
  ])
    subscribed(c, obj, label);
  for (const name of ["layout", "retry", "cancel", "dispose"])
    c.restores.push(observeMethod(c.layout, name, c.calls));
  c.onFoldChange = (options) => c.intents.push({ options, inEvent: c.inEvent === true });
  c.feedback = (f) => {
    c.failures.push({ failure: f, inEvent: c.inEvent === true });
    c.feedbackExtra?.(f);
  };
  return c;
}
function capable(c) {
  eq(c.layout.mode, "folded", "missing production folded LayoutService.mode capability");
}
function mount(c = C, extra = {}, strict = false) {
  const props = {
    graph: c.graph,
    layout: c.layout,
    selection: c.s,
    ariaLabel: "B97 graph",
    height: 360,
    onCommandError: c.feedback,
    ...(c.folded ? { projection: c.p, onFoldChange: c.onFoldChange } : {}),
    ...extra,
  };
  const child = (
    <Boundary>
      <V.SchematicView {...props} />
    </Boundary>
  );
  if (!roots.has("A")) roots.set("A", createRoot(document.getElementById("A")));
  flushSync(() => roots.get("A").render(strict ? <StrictMode>{child}</StrictMode> : child));
}
function unmount() {
  if (roots.has("A")) {
    flushSync(() => roots.get("A").unmount());
    roots.delete("A");
  }
}
const host = () => document.getElementById("A"),
  text = () => host().textContent ?? "",
  has = (x) => check(text().includes(String(x)), "raw visible field " + x);
const items = () => [...host().querySelectorAll('svg [role="button"]')];
function name(e) {
  return (
    e.getAttribute("aria-label") ??
    e
      .getAttribute("aria-labelledby")
      ?.split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ") ??
    e.textContent ??
    ""
  );
}
function member(desc) {
  const all = items().filter((e) => name(e).includes(desc.target.id));
  eq(all.length, 1, "one complete display identity hit");
  return all[0];
}
function control(key) {
  const g = C.p.options.groups.find((g) => g.key === key),
    all = [...host().querySelectorAll("button[aria-expanded]")].filter(
      (e) => name(e).includes(g.key) && name(e).includes(g.label),
    );
  eq(all.length, 1, "one native group control " + key);
  return all[0];
}
function commandButton(command) {
  const re = { layout: /布局|layout/i, retry: /重试|retry/i, cancel: /取消|cancel/i }[command],
    all = [...host().querySelectorAll("button:not([aria-expanded])")].filter((e) =>
      re.test(name(e)),
    );
  eq(all.length, 1, "one command " + command);
  return all[0];
}
function click(e) {
  C.inEvent = true;
  try {
    e.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  } finally {
    C.inEvent = false;
  }
}
function keep(c, p) {
  p.catch(() => {});
  c.pending.push(p);
  return p;
}
async function call(command) {
  const at = C.calls.length;
  click(commandButton(command));
  await settle();
  const calls = C.calls.slice(at).filter((c) => c.name === command);
  eq(calls.length, 1, "once explicit " + command);
  keep(C, calls[0].returned);
  return calls[0];
}
async function ready() {
  const command = await call("layout");
  await command.returned;
  await settle();
  eq(C.layout.state.status, "success", "actual ELK layout success");
  return C.layout.state.result;
}
function publish(options) {
  C.p = VM.createFoldedGraphProjection(C.graph, options);
  mount();
  return C.p;
}
async function rejects(p) {
  return p.then(
    () => {
      throw Error("expected rejected command");
    },
    (e) => e,
  );
}
function checkIdentity(c, p = c.p) {
  const r = c.layout.state.result;
  eq(r.projectionId, p.id, "captured projection identity");
  eq(r.graphRevision, c.graph.state.revision, "current graph revision");
  json(
    r.nodes.map((n) => n.id),
    p.nodes.map((n) => n.target.id),
    "display node order",
  );
  json(
    r.edges.map((e) => [e.id, e.from, e.to]),
    p.edges.map((e) => [e.target.id, e.from, e.to]),
    "display edge endpoints/order",
  );
  for (const n of r.nodes)
    for (const v of [n.x, n.y, n.width, n.height])
      check(Number.isFinite(v), "finite native geometry");
}
function readOnly() {
  for (const e of items()) eq(e.getAttribute("aria-disabled"), "true", "retained hit read-only");
}
async function run(id) {
  C = await fresh();
  const c = C;
  capable(c);
  if (id === "FU11") {
    const other = await fresh(),
      bad = [
        { projection: { ...c.p } },
        { projection: new Proxy(c.p, {}) },
        { layout: new VM.LayoutService(c.graph, c.options) },
        { onFoldChange: undefined },
        { selection: new VM.SelectionModel({ snapshotId: "B97 foreign" }) },
        { projection: other.p },
      ];
    c.extras.push(bad[2].layout, bad[4].selection);
    for (const props of bad) {
      const n = caught.length;
      mount(c, props);
      await settle();
      check(
        caught.slice(n).some((e) => e instanceof TypeError),
        "invalid initial Props TypeError",
      );
      for (const s of Object.values(c.stats97))
        eq(s.active, 0, "no subscription before validation");
      unmount();
    }
    mount();
    await settle();
    const before = caught.length;
    c.graph.dispose();
    mount();
    await settle();
    eq(caught.length, before, "accepted later disposal not invalid initial props");
    for (const button of host().querySelectorAll("button"))
      check(button.disabled, "disposed native control disabled");
    void other;
    return;
  }
  mount(c, {}, id === "FU01");
  await settle();
  if (id === "FU01" || id === "FU02") {
    eq(c.workers.length, 0, "mount has no implicit Worker");
    mount(c, { direction: "UP" }, id === "FU01");
    await settle();
    eq(c.workers.length, 0, "direction prop no implicit layout");
    const controls = [...host().querySelectorAll("button[aria-expanded]")];
    eq(controls.length, c.p.options.groups.length, "including nested controls");
    for (let i = 0; i < controls.length; i++) {
      const g = c.p.options.groups[i];
      check(
        name(controls[i]).includes(g.kind) &&
          name(controls[i]).includes(g.key) &&
          name(controls[i]).includes(g.label),
        "ordered complete accessible control",
      );
      eq(
        controls[i].getAttribute("aria-expanded"),
        String(!c.p.options.collapsed.includes(g.key)),
        "controlled expanded state",
      );
    }
    const before = c.graph.state,
      sel = c.s.current,
      opts = c.p.options,
      key = id === "FU01" ? "H-in" : "H";
    click(control(key));
    eq(c.intents.length, 1, "one synchronous intent");
    eq(c.intents[0].inEvent, true, "sync within native activation");
    const next = c.intents[0].options;
    eq(next.groups, opts.groups, "reuse original frozen groups");
    json(
      next.collapsed,
      id === "FU01" ? [...opts.collapsed, key] : opts.collapsed.filter((k) => k !== key),
      "single-key append/remove and order",
    );
    check(Object.isFrozen(next) && Object.isFrozen(next.collapsed), "frozen next options");
    eq(c.p.options, opts, "host declining keeps controlled state");
    eq(
      control(key).getAttribute("aria-expanded"),
      String(!opts.collapsed.includes(key)),
      "no optimistic state",
    );
    eq(c.graph.state, before, "no graph mutation");
    eq(c.s.current, sel, "no selection mutation");
    eq(c.workers.length, 0, "intent no layout");
    return;
  }
  if (id === "FU09") {
    let reads = 0;
    const raw = { opaque: 97 };
    Object.defineProperties(raw, {
      message: {
        get() {
          reads++;
          throw Error("unknown message read");
        },
      },
      toJSON: {
        get() {
          reads++;
          throw Error("unknown toJSON read");
        },
      },
    });
    c.onFoldChange = () => {
      throw raw;
    };
    mount();
    click(control("H"));
    eq(c.failures.length, 0, "no synchronous feedback");
    await settle();
    eq(c.failures.length, 1, "once eligible microtask feedback");
    const f = c.failures[0].failure;
    eq(f.command, "fold", "fold feedback");
    eq(f.error, raw, "raw original thrown value");
    eq(f.projectionId, c.p.id, "start projection");
    eq(f.groupKey, "H", "group identity");
    eq(f.collapsed, false, "requested unfold");
    check(!("target" in f) && !("layoutIdentity" in f), "no fabricated hit identity");
    eq(c.failures[0].inEvent, false, "feedback after event");
    const oldCount = c.failures.length;
    c.onFoldChange = (options) => {
      publish(options);
      throw raw;
    };
    mount();
    click(control("H"));
    await settle();
    eq(c.failures.length, oldCount, "new projection revokes old fold feedback");
    const second = { second: 97 };
    c.onFoldChange = () => {
      throw raw;
    };
    c.feedbackExtra = () => {
      throw second;
    };
    mount();
    click(control("H"));
    await settle();
    check(
      caught.some(
        (e) => e instanceof AggregateError && e.errors[0] === raw && e.errors[1] === second,
      ),
      "boundary receives AggregateError preserving both raw errors",
    );
    eq(reads, 0, "no reads of opaque errors");
    return;
  }
  const initial = await ready(),
    raw = JSON.stringify(c.graph.state);
  if (id === "FU03" || id === "FU04") {
    const node = c.p.nodes.find((n) => n.kind === "hierarchy"),
      bus = c.p.edges.find((e) => e.kind === "bus");
    check(node && bus, "legal aggregate fixture");
    for (const desc of [node, bus]) {
      click(member(desc));
      await settle();
      has(desc.groupKey);
      for (const m of desc.members) {
        const value = m.node ?? m.edge,
          raw = value.value ?? value;
        for (const k of ["id", "key", "fact"]) if (raw[k] !== undefined) has(raw[k]);
        for (const end of ["from", "to"]) {
          const endpoint = raw[end];
          if (typeof endpoint === "string") has(endpoint);
          else if (endpoint !== undefined) {
            has(endpoint.node.kind);
            has(endpoint.node.kind === "design" ? endpoint.node.id : endpoint.node.key);
            if (endpoint.port !== undefined) has(endpoint.port);
          }
        }
      }
      for (const m of desc.internalEdges ?? []) {
        has(edgeKey(m));
        if (m.edge.kind === "design") has(m.edge.value.fact);
      }
    }
    if (id === "FU04") {
      click(member(node));
      await settle();
      json(
        c.s.current.items,
        unique(node.members.flatMap(expectedItems)),
        "exact node original items excluding internal edge endpoints",
      );
      eq(c.s.current.origin, "graph", "shared graph origin");
      click(member(bus));
      await settle();
      json(
        c.s.current.items,
        unique(bus.members.flatMap(expectedItems)),
        "exact original edge items",
      );
      c.s.back();
      await settle();
      json(c.s.current.items, unique(node.members.flatMap(expectedItems)), "shared undo");
      c.s.forward();
      await settle();
      json(c.s.current.items, unique(bus.members.flatMap(expectedItems)), "shared redo");
      const layer = new VM.AnnotationLayer({
        snapshotId: c.graph.state.snapshotId,
        id: "B97 layer",
        label: "B97 layer",
      });
      c.layers.push(layer);
      subscribed(c, layer, "layer");
      layer.set([{ ref: node.items[0].ref, mark: { badge: "B97 shared mark" } }]);
      mount(c, { annotations: [layer] });
      await settle();
      has("B97 shared mark");
      layer.clear();
      await settle();
      check(!text().includes("B97 shared mark"), "live annotation removal");
    }
    eq(JSON.stringify(c.graph.state), raw, "no fact/owner/source edits");
    return;
  }
  if (id === "FU05") {
    click(member(c.p.nodes[0]));
    await settle();
    const n = c.workers.length,
      p = publish(c.p.options);
    await settle();
    eq(items().length, 0, "new projection hides old result");
    has("折叠状态已改变，重新布局");
    eq(c.workers.length, n, "replacement no Worker");
    eq(c.layout.state.result, initial, "borrowed old geometry untouched");
    check(!c.calls.some((c) => c.name === "cancel"), "no implicit cancellation");
    await ready();
    checkIdentity(c, p);
    return;
  }
  if (id === "FU06" || id === "FU07") {
    const old = member(c.p.nodes[0]);
    c.workerMode = "stall";
    const task = await call("layout");
    eq(c.layout.state.status, "pending", "pending actual task");
    if (id === "FU06") {
      readOnly();
      const oldSelect = c.s.current;
      click(old);
      eq(c.s.current, oldSelect, "read-only hit cannot select");
      await (
        await call("cancel")
      ).returned;
      eq((await rejects(task.returned)).code, "cancelled", "cancel waiter settles");
      await settle();
      readOnly();
      c.workerMode = "real";
      const retry = await call("retry");
      await retry.returned;
      await settle();
      checkIdentity(c);
      c.workerMode = "crash";
      const count = c.failures.length,
        failed = await call("layout");
      const error = await rejects(failed.returned);
      await settle();
      eq(c.failures.length, count + 1, "one eligible error feedback");
      eq(c.failures.at(-1).failure.error, error, "raw command error");
      eq(c.failures.at(-1).failure.projectionId, c.p.id, "error projection identity");
      return;
    }
    const p = publish(c.p.options);
    await settle();
    eq(c.layout.state.status, "pending", "old task not auto cancelled");
    check(!commandButton("layout").disabled, "different projection permits explicit layout");
    const count = c.failures.length;
    c.workerMode = "real";
    await ready();
    eq((await rejects(task.returned)).code, "superseded", "new explicit task supersedes");
    await settle();
    eq(c.failures.length, count, "old task feedback suppressed");
    const sel = c.s.current;
    click(old);
    eq(c.s.current, sel, "detached old DOM ignored");
    checkIdentity(c, p);
    return;
  }
  if (id === "FU08") {
    await c.source.replace({
      ...content(c.graph.state.snapshotId),
      completeness: { status: "partial", reasons: [{ code: "budget_nodes" }] },
      frontier: [],
      hasConservative: true,
    });
    await settle();
    has("图已改变，更新折叠投影");
    has("partial");
    eq(items().length, 0, "stale projection hides geometry");
    for (const button of host().querySelectorAll("button"))
      check(button.disabled, "stale commands disabled");
    await rejects(
      c.source.refresh(() => {
        throw Error("B97 source provider failure");
      }),
    );
    await settle();
    has(c.source.state.error.code);
    has(c.source.state.error.origin);
    return;
  }
  if (id === "FU10") {
    const old = member(c.p.nodes[0]);
    old.focus();
    publish(c.p.options);
    await settle();
    check(
      host().contains(document.activeElement),
      "removed own focus falls back into own container",
    );
    document.getElementById("before").focus();
    publish(c.p.options);
    await settle();
    eq(document.activeElement, document.getElementById("before"), "external focus not stolen");
    await ready();
    c.workerMode = "stall";
    const pending = await call("layout"),
      other = await fresh();
    mount(other);
    await settle();
    eq(c.layout.state.status, "pending", "model replacement not cancellation");
    unmount();
    eq(c.layout.disposed, false, "borrowed layout not disposed");
    eq(c.graph.disposed, false, "borrowed graph not disposed");
    eq(c.s.disposed, false, "borrowed selection not disposed");
    await c.layout.cancel();
    await rejects(pending.returned);
    return;
  }
  if (id === "FU12") {
    const old = member(c.p.nodes[0]),
      before = c.s.current,
      noObject = c.p.nodes.find((n) => n.items.length === 0);
    check(noObject, "no-object fixture display");
    click(member(noObject));
    await settle();
    eq(c.s.current, before, "no-object hit never fabricates selection");
    await ready();
    click(old);
    eq(c.s.current, before, "old task same projection event ignored");
    await c.source.clear();
    publish({ groups: [], collapsed: [] });
    await settle();
    await ready();
    eq(items().length, 0, "empty display contains no fake hits");
    eq(host().querySelectorAll("button[aria-expanded]").length, 0, "no pseudo groups");
    eq(c.s.current, before, "empty operations leave shared selection");
    return;
  }
  throw Error("unknown frozen case " + id);
}
async function native() {
  C = await fresh();
  const c = C;
  capable(c);
  const raw = JSON.stringify(c.graph.state),
    before = c.graph.state,
    p = c.p;
  await keep(c, c.layout.layout(p));
  checkIdentity(c, p);
  c.p = VM.createFoldedGraphProjection(c.graph, { groups: p.options.groups, collapsed: [] });
  await keep(c, c.layout.layout(c.p));
  checkIdentity(c);
  eq(c.layout.state.result.nodes.length, before.nodes.length, "every original node restored");
  eq(c.layout.state.result.edges.length, before.edges.length, "every original edge restored");
  json(
    c.p.nodes.map((n) => nodeKey(n.members[0])),
    before.nodes.map(nodeKey),
    "raw node membership restored",
  );
  json(
    c.p.edges.map((e) => edgeKey(e.members[0])),
    before.edges.map(edgeKey),
    "raw edge membership restored",
  );
  eq(c.graph.state, before, "same original state reference");
  eq(JSON.stringify(before), raw, "original endpoints/facts/bits/owners unchanged");
  return { nodes: c.p.nodes.length, edges: c.p.edges.length, projectionId: c.p.id };
}
async function inputControl() {
  C = await fresh({ folded: false });
  const c = C,
    p = c.p;
  const all = [...p.edges.flatMap((e) => e.members), ...p.nodes.flatMap((n) => n.internalEdges)];
  eq(all.length, c.graph.state.edges.length, "legal folded input partitions all original edges");
  eq(new Set(all).size, all.length, "no duplicate hidden/visible members");
  mount();
  await keep(c, c.layout.layout(VM.createGraphProjection(c.graph).layout));
  await settle();
  eq(c.layout.state.status, "success", "original mode native ELK input control");
  eq(
    items().length,
    c.graph.state.nodes.length + c.graph.state.edges.length,
    "real original view DOM",
  );
  return { nodes: c.graph.state.nodes.length, edges: c.graph.state.edges.length };
}
async function cleanup() {
  const errors = [];
  try {
    unmount();
  } catch (e) {
    errors.push(String(e));
  }
  const workerRows = [],
    subscriptions = [];
  for (const c of contexts.splice(0)) {
    for (const m of [c.layout, c.graph, ...c.layers, ...c.extras])
      try {
        m?.dispose();
      } catch (e) {
        errors.push(String(e));
      }
    await Promise.allSettled(c.pending);
    try {
      for (const s of Object.values(c.stats97)) {
        eq(s.active, 0, "borrowed subscriptions released");
        eq(s.adds, s.removes, "subscription accounting");
        subscriptions.push({ ...s });
      }
      for (const w of c.workers) {
        eq(w.terminated, 1, "each Worker terminated once");
        eq(w.posts, 1, "one layout per owned Worker");
        workerRows.push({ posts: w.posts, terminated: w.terminated });
      }
    } catch (e) {
      errors.push(String(e));
    }
    try {
      const failures = await c.close();
      eq(failures.length, 0, "original context close");
    } catch (e) {
      errors.push(String(e));
    }
  }
  eq(unhandled.length, 0, "no unhandled rejected commands");
  return {
    errors,
    pendingViews: roots.size,
    unhandled: unhandled.length,
    workers: workerRows,
    subscriptions,
  };
}
window.BF = { run, native, control: inputControl, cleanup };
