// B host only. Uses the public production SourceView; never supplies an event implementation.
import React, { Suspense, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { SourceView } from "@hier/views";
import { HierClient } from "@hier/client";
import { SourceNavigationModel } from "@hier/viewmodel";
import {
  document as dto,
  success,
  state as dtoState,
  hashA,
  longText,
  point as longPoint,
} from "../independent-source-view/source-data.mjs";
import { cases, text } from "./cases.mjs";
import { installEventStackProbe, observeDom } from "./browser-observation.mjs";
const D = window.document;
const roots = new Map(),
  restores = [],
  deferreds = [],
  models = [];
const unhandled = [],
  caught = [];
let C;
const OMIT = Symbol("B omit positionQuery");
window.addEventListener("unhandledrejection", (e) => {
  unhandled.push(e.reason);
  e.preventDefault();
});
const check = (x, m) => {
  if (!x) throw Error(m);
};
const eq = (a, b, m) => check(Object.is(a, b), m);
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
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await turn();
  await turn();
}
async function committedDom(predicate) {
  const wait = observeDom(D.getElementById("A"), predicate);
  (C.domWaits ??= []).push(wait);
  await wait.promise;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  const d = { promise, resolve, reject };
  deferreds.push(d);
  return d;
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
function Suspend({ blocked }) {
  if (blocked) {
    C.suspended?.();
    throw C.never;
  }
  return null;
}
function tree(props, blocked = false) {
  return (
    <Boundary>
      <Suspense fallback={<b>B pending render</b>}>
        <SourceView {...props} />
        <Suspend blocked={blocked} />
      </Suspense>
    </Boundary>
  );
}
function render(extra = {}, state = C.state, slot = "A") {
  let root = roots.get(slot);
  if (!root) {
    root = createRoot(D.getElementById(slot));
    roots.set(slot, root);
  }
  const props = {
    state,
    ariaLabel: "B source " + slot,
    height: 220,
    positionQuery: C.config,
    ...extra,
  };
  if (props.positionQuery === OMIT) delete props.positionQuery;
  flushSync(() => root.render(tree(props)));
  return props;
}
function unmount(slot = "A") {
  const r = roots.get(slot);
  if (r) {
    flushSync(() => r.unmount());
    roots.delete(slot);
  }
}
function code(slot = "A") {
  const all = D.getElementById(slot).querySelectorAll("pre > code");
  eq(all.length, 1, "one public pre > code");
  return all[0];
}
function body(slot = "A") {
  let n = code(slot);
  for (; n && !(n === D.getElementById(slot)); n = n.parentElement)
    if (n.tabIndex === 0) return n;
  throw Error("public focusable source scroller");
}
function outsideText(slot = "A") {
  const p = D.getElementById(slot).cloneNode(true);
  for (const n of p.querySelectorAll("code")) n.remove();
  return p.textContent;
}
function refs(slot = "A") {
  return (body(slot).getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => D.getElementById(id));
}
function isHint(t) {
  return outsideText().includes(t);
}
const instruction = "查询此处对象：双击源码，或在源码选区处按 Alt+Enter";
const mouseHint = "无法从鼠标位置查询，请选中文本后按 Alt+Enter";
const failHint = "源码位置查询失败";
function endpoint(offset, slot = "A") {
  const c = code(slot),
    w = D.createTreeWalker(c, NodeFilter.SHOW_TEXT);
  let n,
    left = offset;
  while ((n = w.nextNode())) {
    if (left <= n.data.length) return [n, left];
    left -= n.data.length;
  }
  eq(left, 0, "fixture boundary in raw code");
  return [c, c.childNodes.length];
}
function selection(a, b = a, slot = "A") {
  const x = Array.isArray(a) ? a : endpoint(a, slot),
    y = Array.isArray(b) ? b : endpoint(b, slot);
  const s = D.getSelection();
  s.removeAllRanges();
  s.setBaseAndExtent(...x, ...y);
  return {
    anchor: s.anchorNode,
    anchorOffset: s.anchorOffset,
    focus: s.focusNode,
    focusOffset: s.focusOffset,
    rangeCount: s.rangeCount,
  };
}
function saved() {
  const s = D.getSelection();
  return {
    anchor: s.anchorNode,
    anchorOffset: s.anchorOffset,
    focus: s.focusNode,
    focusOffset: s.focusOffset,
    rangeCount: s.rangeCount,
    active: D.activeElement,
    scroll: [
      body().scrollTop,
      body().scrollLeft,
      window.scrollX,
      window.scrollY,
    ],
  };
}
function unchanged(s) {
  const n = saved();
  for (const k of [
    "anchor",
    "anchorOffset",
    "focus",
    "focusOffset",
    "rangeCount",
    "active",
  ])
    eq(n[k], s[k], "no component " + k + " mutation");
  eq(
    JSON.stringify(n.scroll),
    JSON.stringify(s.scroll),
    "no component scrolling",
  );
  eq(
    code().textContent,
    C.doc.content.result.text,
    "raw text remains identical",
  );
}
function dispatchKey(options = {}) {
  const target = options.target ?? body(),
    init = {
      key: "Enter",
      altKey: true,
      bubbles: true,
      cancelable: true,
      ...options,
    };
  delete init.target;
  const e = new KeyboardEvent("keydown", init);
  C.inEvent = true;
  target.dispatchEvent(e);
  C.inEvent = false;
  return e;
}
function checkCall(offset, count = 1, doc = C.doc) {
  eq(C.calls.length, count, "exactly one call per explicit valid action");
  const c = C.calls.at(-1);
  eq(c.document, doc, "original displayed document identity");
  eq(c.offset, offset, "raw UTF16 offset");
  eq(c.inEvent, true, "locate in same event stack");
}
function callback(document, offset) {
  const inEvent = C.eventProbe
    ? C.eventProbe.active && C.eventProbe.event === C.lastEvent
    : C.inEvent;
  const item = { document, offset, inEvent };
  C.calls.push(item);
  return C.behavior(document, offset);
}
function feedback(f) {
  C.failures.push({ value: f, inEvent: C.inEvent });
  return C.onError(f);
}
function init() {
  C = {
    doc: dto(text, 4, 9),
    calls: [],
    failures: [],
    inEvent: false,
    behavior: () => Promise.resolve(),
    onError: () => {},
  };
  C.state = success(C.doc);
  C.config = { locate: callback, onError: feedback };
  D.getElementById("A").style.transform = "";
  D.getElementById("outside").focus();
  for (const type of ["keydown", "dblclick"]) {
    D.getElementById("A").addEventListener(
      type,
      (e) => {
        C.lastEvent = e;
        C.inEvent = true;
        queueMicrotask(() => {
          C.inEvent = false;
        });
      },
      true,
    );
  }
}
function patch(object, key, value) {
  const old = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, { configurable: true, value });
  restores.push(() =>
    old
      ? Object.defineProperty(object, key, old)
      : Reflect.deleteProperty(object, key),
  );
}
function hostile() {
  const counts = { reads: 0 };
  return {
    counts,
    value: new Proxy(
      {},
      {
        get() {
          counts.reads++;
          throw Error("forbidden opaque error probe");
        },
        ownKeys() {
          counts.reads++;
          throw Error("forbidden opaque enumeration");
        },
        getPrototypeOf() {
          counts.reads++;
          throw Error("forbidden opaque prototype");
        },
      },
    ),
  };
}
function visibleFailure(error, offset = 8) {
  eq(C.failures.length, 1, "one failure callback");
  const f = C.failures[0];
  eq(f.inEvent, false, "failure after DOM call stack");
  eq(f.value.document, C.doc, "failure document raw identity");
  eq(f.value.utf16Offset, offset, "failure original offset");
  eq(f.value.error, error, "failure original thrown/rejected value");
  check(Object.isFrozen(f.value), "shallow frozen failure");
  check(
    ["document", "utf16Offset", "error"].every((k) =>
      Object.hasOwn(f.value, k),
    ),
    "required failure fields",
  );
  check(isHint(failHint), "visible fixed failure hint outside code");
  check(
    refs().some((e) => e?.textContent.includes(failHint)),
    "direct source body description for command failure",
  );
}
function caretAt(x, y) {
  if (typeof D.caretPositionFromPoint === "function") {
    const p = D.caretPositionFromPoint(x, y);
    return p ? [p.offsetNode, p.offset] : null;
  }
  if (typeof D.caretRangeFromPoint === "function") {
    const r = D.caretRangeFromPoint(x, y);
    return r ? [r.startContainer, r.startOffset] : null;
  }
  return null;
}
function rawOffset(node, offset) {
  const c = code();
  check(c === node || c.contains(node), "native caret lies in this code");
  let total = 0,
    found = false;
  function visit(n) {
    if (found) return;
    if (n === node) {
      if (n.nodeType === Node.TEXT_NODE) total += offset;
      else
        for (let i = 0; i < offset; i++)
          total += n.childNodes[i].textContent.length;
      found = true;
      return;
    }
    if (n.nodeType === Node.TEXT_NODE) total += n.data.length;
    else for (const child of n.childNodes) visit(child);
  }
  visit(c);
  check(found, "native endpoint recognized");
  return total;
}
function point() {
  const wanted = C.desired ?? 8,
    r = D.createRange();
  r.setStart(...endpoint(wanted));
  r.setEnd(...endpoint(wanted + 1));
  const b = r.getBoundingClientRect(),
    x = b.left + Math.min(2, b.width / 4),
    y = b.top + b.height / 2;
  const hit = caretAt(x, y);
  check(hit, "native caret available in trusted pointer fixture");
  return { x, y, offset: rawOffset(...hit) };
}
function noQuery() {
  eq(C.calls.length, 0, "disabled/invalid event cannot query");
}
async function setupModel(mode) {
  const listeners = new Set(),
    closes = new Set(),
    sent = [];
  const emit = (value) => {
    for (const f of [...listeners]) f(structuredClone(value));
  };
  const respond = (q, result) =>
    emit({
      id: q.id,
      ok: true,
      result,
      completeness: { status: "complete", reasons: [] },
    });
  const file = "B-SPI-file",
    span = {
      file,
      path: "/B/space 中文.sv",
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 0, line: 1, column: 1 },
      contentHash: hashA,
    };
  const wire = {
    onMessage(f) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    onClose(f) {
      closes.add(f);
      return () => closes.delete(f);
    },
    send(q) {
      sent.push(structuredClone(q));
      if (q.method === "obj.source") queueMicrotask(() => respond(q, span));
      if (q.method === "source.read")
        queueMicrotask(() =>
          respond(q, { text, contentHash: hashA, matchesSnapshot: true }),
        );
    },
    close() {
      for (const f of [...closes]) f(Error("B close"));
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
      snapshotId: "B-SPI-snapshot",
      inputHash: hashA,
      inputHashComplete: true,
      frontend: { name: "slang", version: "B-independent" },
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
  const model = new SourceNavigationModel(client);
  models.push({ model, client, listeners, closes });
  await model.load("B-target", "definition");
  C.doc = model.state.document.data;
  C.state = model.state.document;
  C.behavior = (d, o) => {
    const p = model.locate(d, o);
    C.modelPromise = p;
    return p;
  };
  render();
  if (mode === "stale") await model.reloadDocument();
  return { model, client, sent, respond, span };
}
async function run(id) {
  const c = cases.find((x) => x.id === id);
  check(c, "known frozen id");
  init();
  if (c.group === "config") {
    if (id.endsWith("-omitted")) {
      const p = { state: C.state, ariaLabel: "B omitted", height: 220 };
      let r = createRoot(D.getElementById("A"));
      roots.set("A", r);
      flushSync(() => r.render(tree(p)));
      check(!isHint(instruction), "no omitted interaction hint");
      selection(8);
      dispatchKey();
      noQuery();
      eq(code().textContent, text, "old rendering");
      return { pass: true };
    }
    if (id.includes("old-validation")) {
      let reads = 0;
      const q = {
        get locate() {
          reads++;
          return callback;
        },
        get onError() {
          reads++;
          return feedback;
        },
      };
      const extra = {
        positionQuery: q,
        [c.input.key]: c.input.key === "height" ? 0 : null,
      };
      render(extra);
      check(
        caught.some((e) => e instanceof TypeError),
        "old field TypeError",
      );
      eq(reads, 0, "old fields checked before new callbacks");
      return { pass: true };
    }
    if (id.includes("config-read-once")) {
      let l = 0,
        e = 0,
        probes = 0;
      const target = {
        get locate() {
          l++;
          return callback;
        },
        get onError() {
          e++;
          return feedback;
        },
        get extension() {
          probes++;
          throw Error("extension");
        },
      };
      const q = new Proxy(target, {
        ownKeys() {
          probes++;
          throw Error("enumeration");
        },
      });
      render({ positionQuery: q });
      eq(l, 1, "locate read once");
      eq(e, 1, "onError read once");
      eq(probes, 0, "no extension access/enumeration");
      eq(Object.isFrozen(target), false, "caller config not frozen");
      return { pass: true };
    }
    if (id.includes("-getter-")) {
      const error = Object.freeze({ B: "raw getter throw" }),
        q = { locate: callback, onError: feedback };
      Object.defineProperty(q, c.input.key, {
        get() {
          throw error;
        },
      });
      render({ positionQuery: q });
      check(
        caught.includes(error),
        "original accessor throw at React boundary",
      );
      noQuery();
      return { pass: true };
    }
    const q = {
      undefined: undefined,
      null: null,
      array: [],
      function: () => {},
      "missing-locate": { onError: feedback },
      "missing-onError": { locate: callback },
      "bad-locate": { locate: 4, onError: feedback },
      "bad-onError": { locate: callback, onError: "bad" },
    }[c.input.value];
    render({ positionQuery: q });
    check(
      caught.some((e) => e instanceof TypeError),
      "invalid positionQuery must synchronously TypeError",
    );
    noQuery();
    return { pass: true };
  }
  if (c.group === "model") {
    const { model, sent, respond, span } = await setupModel(c.input.mode),
      offset = { valid: 4, CRLF: 3, surrogate: 6, stale: 8 }[c.input.mode];
    selection(offset);
    dispatchKey();
    checkCall(offset);
    if (c.input.mode === "valid") {
      eq(
        model.state.candidates.state.status,
        "pending",
        "real model publishes pending",
      );
      await settle();
      const q = sent.find((q) => q.method === "source.resolve");
      check(q, "actual SDK sends source.resolve");
      eq(q.params.file, span.file, "actual file");
      eq(q.params.line, 2, "L6 maps CRLF line");
      eq(q.params.col, 1, "L6 byte column");
      respond(q, { items: [{ ref: "B-hit", kind: "definition", span }] });
      await C.modelPromise;
      await settle();
      eq(
        model.state.candidates.state.status,
        "success",
        "actual candidate publication",
      );
      eq(
        model.state.candidates.state.pages[0].result.items[0].ref,
        "B-hit",
        "actual reply",
      );
      eq(C.failures.length, 0, "success not failure");
      unmount();
      eq(model.disposed, false, "view does not dispose borrowed model");
    } else {
      await settle();
      const error = await C.modelPromise.then(
        () => {
          throw Error("expected L6 rejection");
        },
        (e) => e,
      );
      visibleFailure(error, offset);
      eq(
        error.code,
        c.input.mode === "stale" ? "stale_document" : "invalid_argument",
        "actual L6 boundary code",
      );
      eq(
        sent.filter((q) => q.method === "source.resolve").length,
        0,
        "invalid/stale no resolveSource",
      );
    }
    return {
      pass: true,
      layer: "production DOM + actual L6/SDK + controlled Transport, NOT Core",
    };
  }
  render();
  await settle();
  noQuery();
  if (c.group === "activation") {
    if (c.input.multi) {
      const bdoc = dto(text, 4, 9),
        bCalls = [];
      render(
        {
          positionQuery: {
            locate(d, o) {
              bCalls.push([d, o]);
              return Promise.resolve();
            },
            onError() {},
          },
        },
        success(bdoc),
        "B",
      );
      check(
        outsideText("B").includes(instruction),
        "second instance instruction",
      );
      const aRefs = refs(),
        bRefs = refs("B");
      check(
        aRefs.length >= 2 &&
          bRefs.length >= 2 &&
          [...aRefs, ...bRefs].every(Boolean),
        "all descriptions resolve",
      );
      check(
        aRefs.every((n) => D.getElementById("A").contains(n)) &&
          bRefs.every((n) => D.getElementById("B").contains(n)),
        "no cross-instance description IDs",
      );
      selection(8, 8, "B");
      dispatchKey({ target: body("B") });
      noQuery();
      eq(bCalls.length, 1, "B handler only");
      eq(bCalls[0][0], bdoc, "B displayed document");
      eq(bCalls[0][1], 8, "B raw offset");
      return { pass: true };
    }
    check(isHint(instruction), "enabled visible instruction");
    eq(body().getAttribute("aria-keyshortcuts"), "Alt+Enter", "body shortcut");
    check(
      refs().length >= 2 && refs().every(Boolean),
      "append direct description without losing range",
    );
    check(
      refs().some((e) => e.textContent.includes(instruction)),
      "instruction direct relation",
    );
    return { pass: true };
  }
  if (c.group === "disabled") {
    render(
      {},
      c.input.status === "changed"
        ? success(dto(text, 0, 0, true))
        : dtoState(c.input.status),
    );
    check(!isHint(instruction), "disabled no instruction");
    if (c.input.status === "changed") {
      selection(8);
      const e = dispatchKey();
      eq(e.defaultPrevented, false, "changed key native");
      eq(
        body().hasAttribute("aria-keyshortcuts"),
        false,
        "changed no shortcut",
      );
    } else {
      const e = new KeyboardEvent("keydown", {
        key: "Enter",
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      D.getElementById("A").dispatchEvent(e);
      eq(e.defaultPrevented, false, "non-success native");
    }
    noQuery();
    return { pass: true };
  }
  if (c.group === "ignore") {
    selection(8);
    const target = c.input.name === "selectionchange" ? D : code();
    const e = new Event(c.input.name, { bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    await settle();
    noQuery();
    return { pass: true };
  }
  if (c.group === "key" || c.group === "key-ignore") {
    const input = c.input;
    if (input.name === "owner-document") {
      const frame = D.createElement("iframe");
      D.body.append(frame);
      restores.push(() => frame.remove());
      const fdoc = frame.contentDocument,
        host = fdoc.createElement("div");
      fdoc.body.append(host);
      const root = createRoot(host);
      roots.set("iframe", root);
      flushSync(() =>
        root.render(
          tree({
            state: C.state,
            ariaLabel: "B iframe source",
            height: 220,
            positionQuery: C.config,
          }),
        ),
      );
      const fc = host.querySelector("pre > code");
      check(fc, "iframe actual public source code");
      let fb = fc;
      while (fb && fb.tabIndex !== 0) fb = fb.parentElement;
      check(fb, "iframe source scroller");
      const walker = fdoc.createTreeWalker(fc, NodeFilter.SHOW_TEXT);
      let n,
        left = 8;
      while ((n = walker.nextNode())) {
        if (left <= n.data.length) break;
        left -= n.data.length;
      }
      check(n, "iframe raw position");
      const s = fdoc.getSelection();
      s.setBaseAndExtent(n, left, n, left);
      D.getSelection().removeAllRanges();
      const e = new frame.contentWindow.KeyboardEvent("keydown", {
        key: "Enter",
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      C.inEvent = true;
      fb.dispatchEvent(e);
      C.inEvent = false;
      checkCall(8);
      eq(e.defaultPrevented, true, "iframe own Selection recognized");
      eq(s.focusNode, n, "iframe Selection retained");
      eq(s.focusOffset, left, "iframe focus retained");
      eq(D.getSelection().rangeCount, 0, "outer document Selection unused");
      return { pass: true };
    }
    let a = input.offset ?? 8,
      b = a,
      opts = {};
    if (input.name === "empty-code") {
      C.doc = dto("", 0, 0);
      C.state = success(C.doc);
      render();
      a = [code(), 0];
      b = a;
    }
    if (input.name?.startsWith("code-element")) {
      a = [code(), input.name.endsWith("start") ? 0 : code().childNodes.length];
      b = a;
    }
    if (input.name?.startsWith("mark-element")) {
      const m = code().querySelector("mark");
      check(m, "mark fixture");
      a = [m, input.name.endsWith("start") ? 0 : m.childNodes.length];
      b = a;
    }
    if (input.name === "backward-focus") {
      a = 14;
      b = 1;
    }
    selection(a, b);
    const outside = D.getElementById("external").firstChild;
    if (input.name === "no-selection") D.getSelection().removeAllRanges();
    if (input.name === "anchor-outside") selection([outside, 0], endpoint(8));
    if (input.name === "focus-outside") selection(endpoint(8), [outside, 1]);
    if (
      ["anchor-other-instance", "focus-other-instance"].includes(input.name)
    ) {
      render({}, C.state, "B");
      if (input.name === "anchor-other-instance")
        selection(endpoint(8, "B"), endpoint(8));
      else selection(endpoint(8), endpoint(8, "B"));
    }
    if (input.name === "two-ranges") {
      const s = D.getSelection();
      patch(D, "getSelection", () => ({
        rangeCount: 2,
        anchorNode: s.anchorNode,
        anchorOffset: s.anchorOffset,
        focusNode: s.focusNode,
        focusOffset: s.focusOffset,
      }));
    }
    if (input.name === "repeat") opts.repeat = true;
    if (input.name === "composing") opts.isComposing = true;
    if (["ctrl", "meta", "shift"].includes(input.name))
      opts[input.name + "Key"] = true;
    if (input.name === "without-alt") opts.altKey = false;
    if (input.name === "other-key") opts.key = "Escape";
    if (input.name === "target-outside")
      opts.target = D.getElementById("outside");
    const before = saved(),
      e = dispatchKey(opts);
    if (c.group === "key") {
      checkCall(input.offset);
      eq(e.defaultPrevented, true, "valid key only is prevented");
    } else {
      noQuery();
      eq(e.defaultPrevented, false, "invalid key not prevented");
    }
    if (input.name !== "two-ranges") unchanged(before);
    return { pass: true };
  }
  if (c.group === "mouse") {
    const mode = c.input.mode;
    selection(8);
    const before = saved();
    let reads = 0;
    const hit = endpoint(8),
      outside = D.getElementById("external").firstChild;
    patch(
      D,
      "caretPositionFromPoint",
      mode === "fallback" || mode === "unavailable"
        ? undefined
        : (x, y) => {
            reads++;
            eq(x, 101, "viewport X");
            eq(y, 103, "viewport Y");
            return mode === "null"
              ? null
              : {
                  offsetNode: mode === "outside" ? outside : hit[0],
                  offset: mode === "outside" ? 0 : hit[1],
                };
          },
    );
    patch(
      D,
      "caretRangeFromPoint",
      mode === "unavailable"
        ? undefined
        : () => {
            reads++;
            const r = D.createRange();
            r.setStart(...hit);
            r.collapse(true);
            return r;
          },
    );
    const opts = {
      button: mode === "button" ? 1 : 0,
      clientX: 101,
      clientY: 103,
      bubbles: true,
      cancelable: true,
    };
    if (["ctrl", "meta", "shift", "alt"].includes(mode))
      opts[mode + "Key"] = true;
    const e = new MouseEvent("dblclick", opts);
    C.inEvent = true;
    (mode === "wrong-target" ? body() : code()).dispatchEvent(e);
    C.inEvent = false;
    eq(e.defaultPrevented, false, "mouse remains native");
    if (["primary", "fallback"].includes(mode)) {
      checkCall(8);
      eq(reads, 1, "one appropriate native interface");
    } else {
      noQuery();
      if (mode === "unavailable") {
        await committedDom(() => isHint(mouseHint));
        check(isHint(mouseHint), "fixed native API fallback instruction");
        check(
          refs().some((e) => e?.textContent.includes(mouseHint)),
          "fallback linked directly",
        );
      }
    }
    unchanged(before);
    return { pass: true };
  }
  if (c.group === "feedback") {
    const mode = c.input.mode,
      opaque = hostile(),
      error = mode.includes("undefined")
        ? undefined
        : mode === "reject-aggregate"
          ? new AggregateError([opaque.value], "B raw aggregate")
          : opaque.value;
    const d = deferred();
    C.behavior = () => d.promise;
    if (
      mode.startsWith("sync-") &&
      !["sync-unmount", "sync-new-config"].includes(mode)
    )
      C.behavior = () => {
        throw error;
      };
    if (mode.startsWith("return-"))
      C.behavior = () =>
        ({
          undefined: undefined,
          null: null,
          number: 7,
          object: {},
          "bad-then": { then: 7 },
        })[mode.slice(7)];
    let thenReads = 0;
    if (mode === "then-nested-first-wins") {
      const inner = {
        get then() {
          thenReads++;
          return function (resolve, reject) {
            eq(this, inner, "nested then receiver");
            reject(error);
          };
        },
      };
      const outer = {
        get then() {
          thenReads++;
          return function (resolve, reject) {
            eq(this, outer, "outer then receiver");
            resolve(inner);
            const late = Object.freeze({ B: "late must not win" });
            reject(late);
            throw late;
          };
        },
      };
      C.behavior = () => outer;
    }
    if (mode === "then-receiver") {
      const value = {
        get then() {
          thenReads++;
          return function (resolve) {
            eq(this, value, "native then receiver");
            resolve();
          };
        },
      };
      C.behavior = () => value;
    }
    let callbackReturnReads = 0;
    if (mode === "callback-return-ignored")
      C.onError = () => ({
        get then() {
          callbackReturnReads++;
          throw Error("callback return must not be observed");
        },
      });
    if (mode === "then-getter-throw")
      C.behavior = () => ({
        get then() {
          thenReads++;
          throw error;
        },
      });
    if (mode === "then-call-throw")
      C.behavior = () => ({
        get then() {
          thenReads++;
          return () => {
            throw error;
          };
        },
      });
    if (mode === "then-read-once" || mode === "thenable-first-wins")
      C.behavior = () => ({
        get then() {
          thenReads++;
          return (resolve, reject) => {
            if (mode === "thenable-first-wins") {
              resolve();
              reject(error);
              throw error;
            } else reject(error);
          };
        },
      });
    if (mode === "foreign-promise") {
      const frame = D.createElement("iframe");
      D.body.append(frame);
      restores.push(() => frame.remove());
      C.behavior = () => frame.contentWindow.Promise.reject(error);
    }
    if (mode === "function-thenable") {
      const callable = () => {};
      Object.defineProperty(callable, "then", {
        get() {
          thenReads++;
          return (resolve, reject) => reject(error);
        },
      });
      C.behavior = () => callable;
    }
    let registrations = 0;
    if (["sync-unmount", "sync-new-config"].includes(mode)) {
      const rawThen = d.promise.then;
      Object.defineProperty(d.promise, "then", {
        value: function (a, b) {
          registrations++;
          check(
            (a === undefined || typeof a === "function") &&
              typeof b === "function",
            "raw Promise rejection observation immediately registered",
          );
          return Reflect.apply(rawThen, this, [a, b]);
        },
      });
      C.behavior = () => {
        if (mode === "sync-unmount") unmount();
        else {
          C.config = { locate: callback, onError: feedback };
          render();
        }
        return d.promise;
      };
    }
    if (mode === "uncommitted-config") {
      C.never = new Promise(() => {});
      const reached = new Promise((resolve) => {
        C.suspended = resolve;
      });
      let newCalls = 0;
      const q = {
        locate() {
          newCalls++;
          return Promise.resolve();
        },
        onError() {
          newCalls++;
        },
      };
      startTransition(() =>
        roots.get("A").render(
          tree(
            {
              state: C.state,
              ariaLabel: "B source A",
              height: 220,
              positionQuery: q,
            },
            true,
          ),
        ),
      );
      await reached;
      check(
        code().isConnected,
        "old committed code remains during suspended transition",
      );
      C.newCalls = () => newCalls;
    }
    if (mode === "mouse-hint-clears") {
      patch(D, "caretPositionFromPoint", undefined);
      patch(D, "caretRangeFromPoint", undefined);
      code().dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true, button: 0 }),
      );
      noQuery();
      await committedDom(() => isHint(mouseHint));
      check(
        isHint(mouseHint),
        "mouse capability hint established before valid keyboard action",
      );
    }
    selection(8);
    const before = saved();
    dispatchKey();
    checkCall(8);
    eq(C.failures.length, 0, "no synchronous failure feedback");
    if (mode === "mouse-hint-clears") {
      await committedDom(() => !isHint(mouseHint));
      check(!isHint(mouseHint), "next valid query clears native mouse hint");
    }
    if (mode === "uncommitted-config")
      eq(C.newCalls(), 0, "uncommitted config cannot receive action");
    if (["same-data-render"].includes(mode))
      render(
        { height: 230, ariaLabel: "B renamed", className: "B" },
        success(C.doc),
      );
    if (mode === "new-data") {
      C.doc = dto(text, 4, 9);
      C.state = success(C.doc);
      render();
    }
    if (mode === "new-config") {
      C.config = { locate: callback, onError: feedback };
      render();
    }
    if (mode === "exit-restore") {
      render({}, dtoState("pending"));
      render();
    }
    if (mode === "remove-restore") {
      render({ positionQuery: OMIT });
      render();
    }
    if (mode === "changed-restore") {
      render({}, success(dto(text, 0, 0, true)));
      render();
    }
    if (mode === "unmount-remount") {
      unmount();
      render();
    }
    if (mode === "invalid-click-preserves")
      code().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    if (mode === "callback-throw")
      C.onError = () => {
        throw C.callbackError;
      };
    if (mode === "callback-reconfigure-throw")
      C.onError = () => {
        C.config = { locate: callback, onError: feedback };
        render();
        throw C.callbackError;
      };
    if (mode === "callback-unmount-throw")
      C.onError = () => {
        unmount();
        throw C.callbackError;
      };
    C.callbackError = Object.freeze({ B: "callback original" });
    if (mode === "latest-action") {
      const second = deferred();
      C.behavior = () => second.promise;
      selection(9);
      dispatchKey();
      checkCall(9, 2);
      d.reject(error);
      await settle();
      eq(C.failures.length, 0, "old action consumed without feedback");
      second.reject(error);
      await settle();
      visibleFailure(error, 9);
    } else if (
      ["success", "mouse-hint-clears", "then-receiver"].includes(mode)
    ) {
      d.resolve();
      await settle();
      eq(C.failures.length, 0, "success no feedback");
      unchanged(before);
    } else {
      if (
        !mode.startsWith("sync-") &&
        !mode.startsWith("return-") &&
        !mode.startsWith("then-") &&
        !mode.startsWith("thenable-") &&
        !["foreign-promise", "function-thenable"].includes(mode)
      )
        d.reject(error);
      if (["sync-unmount", "sync-new-config"].includes(mode)) {
        check(
          registrations >= 1,
          "original returned Promise observed despite synchronous invalidation",
        );
        d.reject(error);
      }
      await settle();
      const stale = [
        "new-data",
        "new-config",
        "exit-restore",
        "remove-restore",
        "changed-restore",
        "unmount-remount",
        "sync-unmount",
        "sync-new-config",
      ].includes(mode);
      if (stale) {
        eq(C.failures.length, 0, "invalidated feedback cannot revive");
        if (roots.has("A")) check(!isHint(failHint), "no stale hint");
      } else if (mode === "thenable-first-wins") {
        eq(C.failures.length, 0, "Promise resolution first settlement wins");
      } else if (mode === "callback-throw") {
        check(
          caught.length === 1 && caught[0] instanceof AggregateError,
          "callback throw reaches render boundary",
        );
        eq(
          caught[0].errors[0],
          error,
          "aggregate original command error first",
        );
        eq(
          caught[0].errors[1],
          C.callbackError,
          "aggregate callback throw second",
        );
      } else if (
        ["callback-reconfigure-throw", "callback-unmount-throw"].includes(mode)
      ) {
        eq(C.failures.length, 1, "old callback received once");
        eq(
          caught.length,
          0,
          "no render error into a different/removed session",
        );
        if (roots.has("A"))
          check(!isHint(failHint), "no old command hint in new session");
      } else if (mode.startsWith("return-")) {
        eq(C.failures.length, 1, "nonthenable is failure");
        check(
          C.failures[0].value.error instanceof TypeError,
          "nonthenable TypeError",
        );
        visibleFailure(C.failures[0].value.error);
      } else {
        visibleFailure(error);
        if (mode === "failure-frozen") {
          check(!Object.isFrozen(opaque.counts), "not deep frozen caller data");
        }
      }
      if (mode === "new-action-clears") {
        check(isHint(failHint), "first error visible");
        const next = deferred();
        C.behavior = () => next.promise;
        selection(9);
        dispatchKey();
        checkCall(9, 2);
        await committedDom(() => !isHint(failHint));
        check(!isHint(failHint), "valid new action clears prompt");
        next.resolve();
        await settle();
      }
      if (mode === "failure-config-clears") {
        C.config = { locate: callback, onError: feedback };
        render();
        check(
          !isHint(failHint),
          "changing config clears a displayed old failure",
        );
      }
      if (mode === "failure-document-clears") {
        C.doc = dto(text, 4, 9);
        C.state = success(C.doc);
        render();
        check(
          !isHint(failHint),
          "changing document clears a displayed old failure",
        );
      }
    }
    if (mode === "callback-return-ignored")
      eq(
        callbackReturnReads,
        0,
        "callback return value is not awaited/observed",
      );
    if (mode === "then-nested-first-wins")
      eq(thenReads, 2, "one read on each nested thenable");
    else if (
      mode.startsWith("then-") ||
      mode.startsWith("thenable-") ||
      mode === "function-thenable"
    )
      eq(thenReads, 1, "then accessor read exactly once");
    eq(opaque.counts.reads, 0, "never inspect/format/deep-freeze opaque error");
    eq(unhandled.length, 0, "no unobserved rejection");
    return { pass: true, assertions: "command lifecycle and feedback" };
  }
  throw Error("trusted case must use runner trusted path");
}
async function trustedPrepare(id) {
  const c = cases.find((x) => x.id === id);
  init();
  const probe = installEventStackProbe(window);
  C.eventProbe = probe;
  restores.push(() => probe.dispose());
  render();
  await settle();
  noQuery();
  if (c.group === "trusted-mouse") {
    if (c.input.scroll) {
      C.doc = dto(longText, longPoint, longPoint + 1);
      C.state = success(C.doc);
      C.desired = longPoint;
      render();
      await settle();
      check(
        body().scrollTop > 0 && body().scrollLeft > 0,
        "fixture actual local scroll on both axes",
      );
    }
    D.getElementById("A").style.transform = "scale(" + c.input.scale + ")";
    const p = point();
    C.trustedOffset = p.offset;
    return { kind: "mouse", ...p };
  }
  selection(14, 1);
  body().focus();
  C.trustedOffset = 1;
  return { kind: "key" };
}
async function trustedFinish() {
  checkCall(C.trustedOffset);
  eq(C.failures.length, 0, "successful trusted action");
  eq(code().textContent, C.doc.content.result.text, "raw text preserved");
  check(C.lastEvent, "trusted native event observed at host capture");
  eq(
    C.lastEvent.defaultPrevented,
    C.lastEvent.type === "keydown",
    "trusted default prevention policy",
  );
  return { pass: true, offset: C.trustedOffset };
}
async function cleanup() {
  const errors = [];
  for (const wait of C?.domWaits ?? []) wait.cancel();
  for (const r of [...roots.keys()])
    try {
      unmount(r);
    } catch (e) {
      errors.push("root " + String(e));
    }
  for (const d of deferreds.splice(0)) {
    d.promise.catch(() => {});
    d.resolve();
  }
  for (const f of restores.splice(0).reverse())
    try {
      f();
    } catch (e) {
      errors.push(String(e));
    }
  for (const x of models.splice(0)) {
    x.model.dispose();
    x.client.dispose();
    if (x.listeners.size || x.closes.size)
      errors.push("SDK subscriptions leaked");
  }
  await settle();
  if (unhandled.length) errors.push("unhandled rejection " + unhandled.length);
  return { remainingRoots: roots.size, errors };
}
window.BSPI = {
  run,
  trustedPrepare,
  trustedFinish,
  cleanup,
  capable: typeof SourceView === "function",
};
