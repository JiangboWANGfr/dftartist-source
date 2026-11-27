// Independent host, real public SDK/models/React. No candidate-view implementation.
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient } from "@hier/client";
import { SourceNavigationModel, SelectionModel } from "@hier/viewmodel";
import { cases } from "./cases.mjs";
import { observeDom } from "../independent-source-position-interaction/browser-observation.mjs";
const View = Reflect.get(Views, "SourceCandidatesView"),
  D = document;
const roots = new Map(),
  contexts = [],
  unhandled = [],
  caught = [];
let C;
window.addEventListener("unhandledrejection", (e) => {
  unhandled.push(e.reason);
  e.preventDefault();
});
const check = (v, m) => {
    if (!v) throw Error(m);
  },
  eq = (a, b, m) => check(Object.is(a, b), m);
const json = (a, b, m) => eq(JSON.stringify(a), JSON.stringify(b), m);
const hash = "0123456789abcdef".repeat(4),
  text = "ab中😀\r\nZ";
const complete = { status: "complete", reasons: [] };
const partial = {
  status: "partial",
  reasons: [
    { code: "unsupported", at: "B at", detail: "B detail" },
    { code: "indexing", detail: "B indexing" },
  ],
};
const span = (i = 0) => ({
  file: "B-file/尾",
  path: "/B <opaque>&.sv",
  start: { offset: i, line: 1, column: i + 1 },
  end: { offset: i + 1, line: 1, column: i + 2 },
  contentHash: hash,
});
const hit = (i = 0, kind = "object") => ({
  ref: "B:<opaque>&/α/" + i,
  kind: "definition",
  span: span(i),
  inst: "B/inst/" + i,
  ...(kind === null ? {} : { refKind: kind }),
});
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
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await turn();
  await turn();
}
class Boundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e) {
    caught.push(e);
  }
  render() {
    return this.state.failed ? (
      <b data-boundary="true">B boundary</b>
    ) : (
      this.props.children
    );
  }
}
function root(slot) {
  if (!roots.has(slot)) roots.set(slot, createRoot(D.getElementById(slot)));
  return roots.get(slot);
}
function mount(extra = {}, strict = false) {
  C.props = {
    navigation: C.n,
    selection: C.s,
    ariaLabel: "B 候选 原标签 ",
    height: 240,
    onCommandError: C.callback,
    ...extra,
  };
  const child = (
    <Boundary>
      <View {...C.props} />
    </Boundary>
  );
  flushSync(() =>
    root("A").render(strict ? <StrictMode>{child}</StrictMode> : child),
  );
}
function unmount(slot = "A") {
  const r = roots.get(slot);
  if (r) {
    flushSync(() => r.unmount());
    roots.delete(slot);
  }
}
const region = () =>
  D.getElementById("A").querySelector(
    '[role="region"],section[aria-label],section[aria-labelledby]',
  );
const list = () => region()?.querySelector("ul,ol");
const rows = () => [...(list()?.querySelectorAll("li button") ?? [])];
const allText = () => region()?.textContent ?? "";
async function prepared() {
  const wait = observeDom(D.getElementById("A"), () => {
    const items =
        C.n.state.candidates?.state.pages.flatMap((p) => p.result.items) ?? [],
      buttons = rows();
    return (
      buttons.length > 0 &&
      buttons.length === items.length &&
      buttons.every(
        (b, i) =>
          items[i].refKind === undefined ||
          b.getAttribute("aria-disabled") !== "true",
      )
    );
  });
  C.waits ??= [];
  C.waits.push(wait);
  await wait.promise;
}
function actionButton(name) {
  const a = [...region().querySelectorAll("button")].filter(
    (b) => !list()?.contains(b) && b.textContent.includes(name),
  );
  eq(a.length, 1, "one operation " + name);
  return a[0];
}
function point(el) {
  const r = el.getBoundingClientRect();
  check(r.width > 0 && r.height > 0, "visible actual DOM target");
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
function selected(refKind = "object", index = 0) {
  json(
    C.s.current.items,
    [
      refKind === "definition"
        ? { def: hit(index).ref }
        : { ref: hit(index).ref },
    ],
    "authority address not hit.kind/inst/prefix",
  );
  eq(C.s.current.origin, "source", "source origin");
  eq(C.s.current.snapshotId, C.n.snapshotId, "bound snapshot");
}
function emptySelection() {
  eq(C.s.current.items.length, 0, "no implicit semantic selection");
  eq(C.s.canGoBack, false, "no implicit history");
}
async function setup() {
  const messages = new Set(),
    closes = new Set(),
    sent = [],
    taken = new Set(),
    waits = [];
  const emit = (v) => {
    for (const f of [...messages]) if (messages.has(f)) f(structuredClone(v));
  };
  const ok = (q, result, completeness = complete) =>
    emit({ id: q.id, ok: true, result, completeness });
  const next = (method) => {
    const q = sent.find((x) => x.method === method && !taken.has(x));
    if (q) {
      taken.add(q);
      return Promise.resolve(q);
    }
    return new Promise((resolve) => waits.push({ method, resolve }));
  };
  const wire = {
    onMessage(f) {
      messages.add(f);
      return () => messages.delete(f);
    },
    onClose(f) {
      closes.add(f);
      return () => closes.delete(f);
    },
    send(value) {
      const q = structuredClone(value);
      sent.push(q);
      for (const w of [...waits])
        if (q.method === w.method && !taken.has(q)) {
          taken.add(q);
          waits.splice(waits.indexOf(w), 1);
          w.resolve(q);
          break;
        }
      if (q.method === "obj.source") queueMicrotask(() => ok(q, span(0)));
      if (q.method === "source.read")
        queueMicrotask(() =>
          ok(q, { text, contentHash: hash, matchesSnapshot: true }),
        );
    },
    close() {
      for (const f of [...closes]) f(Error("B fixture close"));
    },
  };
  const client = new HierClient(wire, { cacheEntries: 0 });
  client.ready.catch(() => {});
  emit({
    event: "hello",
    protocol: 2,
    capabilities: ["cancel", "progress"],
    snapshot: {
      protocol: 2,
      schemaVersion: 7,
      snapshotId: "B-CV-snapshot",
      inputHash: hash,
      inputHashComplete: true,
      frontend: { name: "slang", version: "B-fixture" },
      bodySharing: "fast",
      tops: [],
      definitionCount: 0,
      bodyCount: 0,
      indexState: "ready",
      openedAt: "2000-01-01T00:00:00.000Z",
      topCandidates: [],
    },
  });
  await client.ready;
  const n = new SourceNavigationModel(client, { pageSize: 200 }),
    s = new SelectionModel({ snapshotId: n.snapshotId });
  const c = {
    client,
    n,
    s,
    messages,
    closes,
    sent,
    next,
    ok,
    emit,
    models: [],
    off: [],
    failures: [],
    hostPromises: [],
    notices: [],
    callback: (f) => {
      c.failures.push(f);
    },
    error: Error("B original listener"),
  };
  c.off.push(s.subscribe((v) => c.notices.push(v)));
  // Host alone consumes automatic completions it owns, never the view's commands.
  c.off.push(
    n.subscribe(() => {
      if (n.state.refresh) {
        const p = n.state.refresh.completion;
        p.catch(() => {});
        c.hostPromises.push(p);
      }
    }),
  );
  contexts.push(c);
  C = c;
  return c;
}
async function load() {
  await C.n.load("B-target", "definition");
  return C.n.state.document.data;
}
async function start(method = "locate") {
  const p =
    method === "locate"
      ? C.n.locate(C.n.state.document.data, 0)
      : C.n[method]();
  p.catch(() => {});
  C.hostPromises.push(p);
  const q = await C.next("source.resolve");
  return { p, q };
}
async function finish(
  t,
  items = [hit(), hit(1, "definition")],
  next,
  completeness = complete,
) {
  C.ok(t.q, { items, ...(next === undefined ? {} : { next }) }, completeness);
  await t.p;
  await settle();
}
async function ready(items, next, completeness = complete) {
  await load();
  await finish(await start(), items, next, completeness);
}
function failureDiag(mode) {
  const txt = allText();
  check(
    txt.includes(mode === "failed-prefix" ? "候选查询失败" : "候选查询已取消"),
    "original model status shown",
  );
  const e = C.n.state.candidates.state.error;
  for (const k of ["origin", "code", "message"])
    check(txt.includes(e[k]), "raw diagnostic " + k);
}
function checkDisplay(mode) {
  const txt = allText(),
    r = rows();
  emptySelection();
  if (mode === "idle") {
    check(txt.includes("尚未查询源码位置"), "no binding hint");
    eq(r.length, 0, "no old rows");
    return;
  }
  const state = C.n.state.candidates.state,
    items = state.pages.flatMap((p) => p.result.items);
  eq(r.length, items.length, "all items including duplicates in order");
  for (let i = 0; i < items.length; i++) {
    const h = items[i],
      t = r[i].closest("li").textContent;
    for (const v of [
      h.ref,
      h.kind,
      h.span.file,
      h.inst,
      ...[h.span.start, h.span.end].flatMap((p) => [p.line, p.column]),
    ])
      check(t.includes(String(v)), "raw escaped row field " + v);
    check(
      t.includes(
        h.refKind === "definition"
          ? "定义"
          : h.refKind === "object"
            ? "对象"
            : "地址类型不可用",
      ),
      "explicit address marker",
    );
    eq(r[i].hasAttribute("aria-selected"), false, "focus is not Selection");
    eq(r[i].disabled, false, "inspectable rows not native disabled");
  }
  check(!region().querySelector("opaque"), "raw text cannot become markup");
  check(region().querySelector('[role="status"]'), "separate status");
  check(
    !region().querySelector('[role="status"] li'),
    "whole list not live region",
  );
  if (mode.includes("partial")) {
    check(txt.includes("结果不完整"), "partial persists");
    for (const x of partial.reasons)
      for (const k of ["code", "at", "detail"])
        if (x[k]) check(txt.includes(x[k]), "reason original " + k);
  }
  if (mode === "complete-empty")
    check(txt.includes("未找到候选"), "complete empty");
  if (mode === "partial-empty")
    check(txt.includes("当前结果未找到候选"), "not a negative existence claim");
  if (mode === "legacy")
    eq(
      r[0].getAttribute("aria-disabled"),
      "true",
      "missing refKind not confirmable",
    );
  if (mode === "pending-prefix") {
    check(txt.includes("正在查询候选"), "pending prefix");
    check(
      region().matches('[aria-busy="true"]') ||
        region().querySelector('[aria-busy="true"]'),
      "query busy",
    );
    for (const b of r)
      eq(
        b.getAttribute("aria-disabled"),
        "true",
        "pending prefix cannot confirm",
      );
  }
  if (mode === "failed-prefix" || mode === "cancelled-prefix") {
    failureDiag(mode);
    for (const b of r)
      eq(
        b.getAttribute("aria-disabled"),
        "true",
        "failed prefix cannot confirm",
      );
  }
}
function invalidValue(key, value) {
  const values = {
    blank: " \t ",
    boxed: new String("B"),
    null: null,
    zero: 0,
    negative: -1,
    nan: NaN,
    infinity: Infinity,
    string: "240",
    undefined: undefined,
    fake: {},
    proxy: null,
  };
  if (value === "disposed") {
    const model = key === "navigation" ? C.n : C.s;
    model.dispose();
    return model;
  }
  if (value === "proxy") return new Proxy(key === "navigation" ? C.n : C.s, {});
  if (value === "unbound" || value === "other-snapshot") {
    const s = new SelectionModel(
      value === "unbound" ? undefined : { snapshotId: "B-other" },
    );
    C.models.push(s);
    return s;
  }
  return values[value];
}
async function prepare(id) {
  const c = cases.find((c) => c.id === id);
  check(c, "frozen case id");
  await setup();
  C.case = c;
  const { group, input } = c;
  if (group === "props") {
    const value = invalidValue(input.key, input.value),
      before = C.sent.length;
    mount({ [input.key]: value });
    await settle();
    check(
      caught.some((e) => e instanceof TypeError),
      "host TypeError boundary",
    );
    eq(C.sent.length, before, "invalid render zero query");
    if (!C.s.disposed) emptySelection();
    return { done: true };
  }
  if (group === "display") {
    const mode = input.mode;
    if (mode !== "idle") {
      const items = mode.endsWith("empty")
        ? []
        : mode === "duplicates"
          ? [hit(), hit()]
          : mode === "legacy"
            ? [hit(0, null)]
            : [hit(), hit(1, "definition")];
      await ready(
        items,
        [
          "partial-pages",
          "pending-prefix",
          "failed-prefix",
          "cancelled-prefix",
        ].includes(mode)
          ? "B-cursor"
          : undefined,
        mode === "partial-empty" ? partial : complete,
      );
      // §6.11: after a partial page, loadMore is a no-op. Use complete head + partial tail,
      // never manufacture an unreachable partial-head/complete-tail model state.
      if (mode === "partial-pages")
        await finish(await start("loadMore"), [], undefined, partial);
      if (
        ["pending-prefix", "failed-prefix", "cancelled-prefix"].includes(mode)
      ) {
        const t = await start("loadMore");
        if (mode === "failed-prefix") {
          C.emit({
            id: t.q.id,
            ok: false,
            error: {
              code: "internal",
              message: "B 原查询错误",
              data: { B: "opaque" },
            },
          });
          await t.p.catch(() => {});
        }
        if (mode === "cancelled-prefix") {
          await C.n.cancelCandidates();
          await t.p.catch(() => {});
        }
      }
    }
    mount();
    await settle();
    checkDisplay(mode);
    return { done: true };
  }
  if (group === "lifecycle") {
    await ready();
    if (input.mode === "selection-aggregate")
      C.off.push(
        C.s.subscribe(() => {
          throw C.error;
        }),
      );
    mount({}, input.mode === "strict-mount");
    await settle();
    await prepared();
    if (input.mode === "rerender") {
      const before = C.sent.length;
      mount({ className: "B-rerender" });
      await settle();
      eq(C.sent.length, before, "rerender zero query");
    }
    if (input.mode === "unmount") {
      const before = C.sent.length;
      unmount();
      await settle();
      eq(C.n.disposed, false, "borrow nav survives");
      eq(C.s.disposed, false, "borrow selection survives");
      eq(C.sent.length, before, "unmount no cancel");
      await C.n.reloadDocument();
      eq(C.n.state.document.status, "success", "borrowed client still usable");
      return { done: true };
    }
    if (input.mode !== "selection-aggregate") {
      emptySelection();
      eq(
        C.sent.filter((q) => q.method === "source.resolve").length,
        1,
        "mount did not query again",
      );
      return { done: true };
    }
    return { click: point(rows()[0]) };
  }
  if (group === "vertical") {
    await load();
    mount();
    return await sourcePositionPrepare();
  }
  const mode = input.mode;
  const items =
    group === "activation" && mode === "legacy"
      ? [hit(0, null), hit(1, "definition")]
      : [hit(), hit(1, "definition"), hit(2)];
  await ready(
    items,
    group === "command" ? "B-cursor" : undefined,
    mode === "partial" ? partial : complete,
  );
  if (group === "command" && mode === "cancelCandidates") {
    C.pending = await start("loadMore");
  }
  mount();
  await settle();
  if (group !== "command" || mode !== "cancelCandidates") await prepared();
  check(rows().length > 0, "actual displayed rows");
  if (group === "command")
    return {
      click: point(
        actionButton(
          {
            loadMore: "加载更多",
            reloadCandidates: "重新查询",
            cancelCandidates: "取消查询",
          }[mode],
        ),
      ),
    };
  if (group === "activation") {
    if (mode !== "legacy")
      check(
        rows()[mode === "definition" ? 1 : 0].getAttribute("aria-disabled") !==
          "true",
        "actions prepared",
      );
    return { click: point(rows()[mode === "definition" ? 1 : 0]) };
  }
  if (group === "keyboard") {
    const index = input.key === "ArrowUp" || input.key === "Home" ? 1 : 0;
    rows()[index].focus();
    C.focusIndex = index;
    if (mode === "repeat" || mode === "composing") {
      const e = new KeyboardEvent("keydown", {
        key: "Enter",
        repeat: mode === "repeat",
        isComposing: mode === "composing",
        bubbles: true,
        cancelable: true,
      });
      rows()[index].dispatchEvent(e);
      await settle();
      emptySelection();
      return { done: true };
    }
    const keys = {
      Space: "Space",
      control: "Control+Enter",
      meta: "Meta+Enter",
      alt: "Alt+Enter",
      shift: "Shift+Enter",
      escape: "Escape",
      tab: "Tab",
    };
    return { key: keys[input.key] ?? keys[mode] ?? input.key };
  }
  throw Error("unhandled frozen case " + id);
}
async function verify() {
  await settle();
  const { group, input } = C.case;
  if (group === "activation") {
    if (input.mode === "legacy") emptySelection();
    else
      selected(
        input.mode === "definition" ? "definition" : "object",
        input.mode === "definition" ? 1 : 0,
      );
    if (input.mode === "partial")
      check(allText().includes("结果不完整"), "confirmation not completeness");
  } else if (group === "keyboard") {
    if (input.key === "Enter" || input.key === "Space") {
      selected();
      eq(
        C.notices.length,
        1,
        "one semantic commit, no native double confirmation",
      );
    } else {
      emptySelection();
      const dest = { ArrowDown: 1, ArrowUp: 0, Home: 0, End: 2 }[input.key];
      if (dest !== undefined) {
        eq(D.activeElement, rows()[dest], "keyboard local focus");
        eq(
          rows().filter((b) => b.tabIndex === 0).length,
          1,
          "one roving tabindex",
        );
      }
      if (input.mode === "tab")
        check(!list().contains(D.activeElement), "Tab leaves list");
      if (input.mode === "escape")
        eq(C.n.state.candidates.state.status, "success", "Escape not cancel");
    }
  } else if (group === "command") {
    if (input.mode === "cancelCandidates") {
      await C.pending.p.catch(() => {});
      eq(C.n.state.candidates.state.status, "cancelled", "public cancel");
    } else {
      const q = await C.next("source.resolve");
      eq(
        q.params.cursor,
        input.mode === "loadMore" ? "B-cursor" : "",
        "model supplied cursor, view does not construct it",
      );
      C.ok(q, { items: [hit(3)], ...(input.mode === "loadMore" ? {} : {}) });
      await settle();
      eq(C.n.state.candidates.state.status, "success", "command completes");
      eq(
        rows().length,
        input.mode === "loadMore" ? 4 : 1,
        "append or fresh head",
      );
      emptySelection();
    }
  } else if (group === "lifecycle") {
    selected();
    eq(C.failures.length, 1, "one current failure");
    const f = C.failures[0];
    eq(f.command, "confirm", "failure command");
    check(Object.isFrozen(f), "shallow frozen failure");
    check(f.action !== null, "original action present");
    check(
      f.error instanceof AggregateError && f.error.errors.includes(C.error),
      "original postcommit listener error",
    );
    check(
      allText().includes("候选操作未正常完成"),
      "neutral postcommit feedback",
    );
    check(!allText().includes("未选择"), "not failed selection claim");
  } else throw Error("verify phase not applicable");
  eq(unhandled.length, 0, "no unexpected fixture/page unhandled rejection");
  return {
    pass: true,
    selection: C.s.current,
    queries: C.sent.filter((q) => q.method !== "cancel").length,
  };
}
async function verticalContinue() {
  const q = await C.next("source.resolve");
  eq(q.params.line, 1, "real offset line");
  eq(q.params.col, 2, "real UTF16→UTF8 point");
  C.ok(q, { items: [hit(1, "definition")] });
  await Promise.allSettled(C.hostPromises);
  await settle();
  await prepared();
  emptySelection();
  return { click: point(rows()[0]) };
}
async function verticalVerify() {
  await settle();
  selected("definition", 1);
  eq(C.sourceError, undefined, "source callback succeeds");
  return { pass: true };
}
async function cleanup() {
  const errors = [];
  for (const w of C?.waits ?? [])
    try {
      w.cancel();
    } catch (e) {
      errors.push(String(e));
    }
  for (const slot of [...roots.keys()])
    try {
      unmount(slot);
    } catch (e) {
      errors.push(String(e));
    }
  for (const c of contexts.splice(0).reverse()) {
    for (const off of c.off.reverse())
      try {
        off();
      } catch (e) {
        errors.push(String(e));
      }
    for (const m of [...c.models, c.n, c.s])
      try {
        m.dispose();
      } catch (e) {
        errors.push(String(e));
      }
    try {
      c.client.dispose();
    } catch (e) {
      errors.push(String(e));
    }
    await Promise.allSettled(c.hostPromises);
    if (c.messages.size || c.closes.size)
      errors.push("SDK subscriptions leaked");
  }
  return { errors, unhandled: unhandled.map((e) => String(e)) };
}
async function controls() {
  await setup();
  await ready();
  const page = C.n.state.candidates.state.pages[0],
    a = C.n.createCandidateAction(page, 1);
  C.n.confirmCandidate(a, C.s);
  selected("definition", 1);
  const before = C.sent.length;
  eq(before, 3, "real SDK obj.source/read/resolve");
  eq(C.notices.length, 1, "real Selection notice");
  // Render existing SourceView, not a candidate substitute.
  flushSync(() =>
    root("B").render(
      React.createElement(Views.SourceView, {
        state: C.n.state.document,
        ariaLabel: "B control source",
        height: 220,
      }),
    ),
  );
  await settle();
  eq(
    D.querySelector("#B pre > code").textContent,
    text,
    "real old SourceView raw text",
  );
  // Native events are observed, not used as candidate UI implementation.
  const b = D.createElement("button");
  b.textContent = "B native control";
  D.getElementById("control").append(b);
  let count = 0;
  b.addEventListener("click", () => count++);
  return {
    click: point(b),
    before,
    check: () => {
      eq(count, 1, "one trusted native activation");
      eq(C.sent.length, before, "native control no product command");
      return { pass: true };
    },
  };
}
async function sourcePositionPrepare() {
  const source = Reflect.get(Views, "SourceView");
  check(typeof source === "function", "real old SourceView");
  const renderSource = () =>
    flushSync(() =>
      root("B").render(
        React.createElement(source, {
          state: C.n.state.document,
          ariaLabel: "B source",
          height: 220,
          positionQuery: {
            locate: (d, o) => {
              const p = C.n.locate(d, o);
              p.catch(() => {});
              C.hostPromises.push(p);
              return p;
            },
            onError: (e) => {
              C.sourceError = e;
            },
          },
        }),
      ),
    );
  C.off.push(C.n.subscribe(renderSource));
  renderSource();
  await settle();
  const code = D.querySelector("#B pre > code"),
    w = D.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  eq(code.textContent, text, "SourceView original text");
  let t,
    offset = 1;
  while ((t = w.nextNode())) {
    if (offset <= t.length) break;
    offset -= t.length;
  }
  check(t, "UTF16 point lies within original code");
  let focus = code;
  while (focus && focus.tabIndex !== 0) focus = focus.parentElement;
  check(focus, "focusable real SourceView");
  focus.focus();
  D.getSelection().setBaseAndExtent(t, offset, t, offset);
  return { key: "Alt+Enter", vertical: true };
}
let nativeControl;
async function premiseControls() {
  const result = [];
  for (const mode of [
    "complete-empty",
    "partial-empty",
    "legacy",
    "duplicates",
    "partial-pages",
    "pending-prefix",
    "failed-prefix",
    "cancelled-prefix",
  ]) {
    await setup();
    const items = mode.endsWith("empty")
      ? []
      : mode === "legacy"
        ? [hit(0, null)]
        : mode === "duplicates"
          ? [hit(), hit()]
          : [hit(), hit(1, "definition")];
    await ready(
      items,
      [
        "partial-pages",
        "pending-prefix",
        "failed-prefix",
        "cancelled-prefix",
      ].includes(mode)
        ? "B-cursor"
        : undefined,
      mode === "partial-empty" ? partial : complete,
    );
    if (mode === "partial-pages")
      await finish(await start("loadMore"), [], undefined, partial);
    if (
      ["pending-prefix", "failed-prefix", "cancelled-prefix"].includes(mode)
    ) {
      const t = await start("loadMore");
      if (mode === "failed-prefix") {
        C.emit({
          id: t.q.id,
          ok: false,
          error: {
            code: "internal",
            message: "B 原查询错误",
            data: { B: "opaque" },
          },
        });
        await t.p.catch(() => {});
      }
      if (mode === "cancelled-prefix") {
        await C.n.cancelCandidates();
        await t.p.catch(() => {});
      }
    }
    const s = C.n.state.candidates.state;
    eq(
      s.status,
      mode === "pending-prefix"
        ? "pending"
        : mode === "failed-prefix"
          ? "failed"
          : mode === "cancelled-prefix"
            ? "cancelled"
            : "success",
      "legal public premise status",
    );
    if (mode.includes("prefix")) eq(s.pages.length, 1, "prefix kept");
    if (mode === "partial-pages") {
      eq(s.pages.length, 2, "two legal pages");
      eq(s.pages[0].completeness.status, "complete", "complete head");
      eq(s.pages[1].completeness.status, "partial", "partial tail");
    }
    if (mode === "partial-empty")
      eq(s.pages[0].result.items.length, 0, "partial empty valid");
    if (mode === "legacy")
      eq(
        Object.hasOwn(s.pages[0].result.items[0], "refKind"),
        false,
        "legacy omission preserved",
      );
    if (mode === "duplicates")
      eq(s.pages[0].result.items.length, 2, "duplicate refs not coalesced");
    result.push({
      id: mode,
      status: s.status,
      pages: s.pages.length,
      pass: true,
    });
  }
  return result;
}
window.BCV = {
  capable: View !== undefined && View !== null,
  prepare,
  verify,
  verticalContinue,
  verticalVerify,
  cleanup,
  premiseControls,
  async sourceControlPrepare() {
    await setup();
    await load();
    return sourcePositionPrepare();
  },
  async sourceControlVerify() {
    const q = await C.next("source.resolve");
    eq(q.params.line, 1, "real SourceView line");
    eq(q.params.col, 2, "real SourceView UTF16/UTF8 column");
    C.ok(q, { items: [hit()] });
    await Promise.allSettled(C.hostPromises);
    emptySelection();
    return {
      pass: true,
      id: "real SourceView Alt+Enter to navigation, no candidate UI",
      query: q.params,
    };
  },
  async controlPrepare() {
    nativeControl = await controls();
    return { click: nativeControl.click };
  },
  controlVerify() {
    return nativeControl.check();
  },
};
