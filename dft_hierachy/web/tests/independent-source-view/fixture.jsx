// B-owned browser host. No fallback SourceView implementation.
import React, { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient } from "@hier/client";
import { SourceDocumentModel } from "@hier/viewmodel";
import { cases, texts } from "./cases.mjs";
import {
  document as makeDocument,
  state as makeState,
  success,
  badValue,
  longText,
  point,
  complete,
  hashA,
} from "./source-data.mjs";
const SourceView = Reflect.get(Views, "SourceView"),
  roots = new Map(),
  caught = [],
  windowErrors = [],
  unhandled = [],
  contexts = [];
window.addEventListener("error", (e) => windowErrors.push(e.error));
window.addEventListener("unhandledrejection", (e) => unhandled.push(e.reason));
const check = (v, msg) => {
    if (!v) throw Error(msg);
  },
  equal = (a, b, msg) =>
    check(
      Object.is(a, b),
      msg + "; actual=" + String(a) + " expected=" + String(b),
    );
class Boundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(e) {
    caught.push(e);
  }
  render() {
    return this.state.error
      ? React.createElement("div", { "data-B-boundary": true }, "B boundary")
      : this.props.children;
  }
}
function Invoke({ value }) {
  return SourceView(value);
}
const host = (slot) => window.document.getElementById(slot);
function outsideCodeText(slot = "A") {
  const copy = region(slot).cloneNode(true);
  for (const c of copy.querySelectorAll("code")) c.remove();
  return copy.textContent;
}
function componentHeight(slot = "A") {
  const boxes = [...host(slot).children]
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.height > 0);
  check(boxes.length > 0, "measurable component roots");
  return (
    Math.max(...boxes.map((r) => r.bottom)) -
    Math.min(...boxes.map((r) => r.top))
  );
}
function render(state = makeState(), options = {}, slot = "A", strict = false) {
  let root = roots.get(slot);
  if (!root) {
    root = createRoot(host(slot));
    roots.set(slot, root);
  }
  const value = {
    state,
    ariaLabel: "B source " + slot,
    height: 280,
    ...options,
  };
  const view = React.createElement(
    Boundary,
    null,
    React.createElement(Invoke, { value }),
  );
  flushSync(() =>
    root.render(strict ? React.createElement(StrictMode, null, view) : view),
  );
  return value;
}
function unmount(slot = "A") {
  const root = roots.get(slot);
  if (root) {
    flushSync(() => root.unmount());
    roots.delete(slot);
  }
}
function region(slot = "A") {
  const all = [
    ...host(slot).querySelectorAll(
      '[role="region"],section[aria-label],section[aria-labelledby],section[title]',
    ),
  ];
  equal(all.length, 1, "one named region in host slot");
  return all[0];
}
function name(el) {
  const ids = el.getAttribute("aria-labelledby");
  return ids
    ? ids
        .split(/\s+/)
        .map((id) => window.document.getElementById(id)?.textContent ?? "")
        .join(" ")
    : (el.getAttribute("aria-label") ?? el.getAttribute("title"));
}
function code(slot = "A") {
  const all = region(slot).querySelectorAll("pre > code");
  equal(all.length, 1, "one pre > code");
  return all[0];
}
function scroller(slot = "A") {
  const c = code(slot);
  for (let n = c; n && host(slot).contains(n); n = n.parentElement)
    if (n.tabIndex === 0) return n;
  throw Error("source body requires tabIndex0");
}
function description(slot = "A") {
  const r = region(slot),
    nodes = [r, ...r.querySelectorAll("[aria-describedby]")],
    ids = [
      ...new Set(
        nodes.flatMap((n) =>
          (n.getAttribute("aria-describedby") ?? "")
            .split(/\s+/)
            .filter(Boolean),
        ),
      ),
    ];
  check(
    ids.length > 0,
    "source/region has description association (target shape deferred Q2)",
  );
  const descriptions = ids.map((id) => {
    const el = window.document.getElementById(id);
    check(el, "description ID resolves");
    check(!code(slot).contains(el), "position/warning outside code");
    return el;
  });
  return descriptions.map((e) => e.textContent).join(" ");
}
function current(status, slot = "A") {
  const r = region(slot);
  equal(name(r), "B source " + slot, "accessible name uses given value");
  const busy = r.getAttribute("aria-busy");
  if (status === "pending") equal(busy, "true", "pending busy");
  else check(busy === null || busy === "false", "not busy");
  const statuses = [...r.querySelectorAll('[role="status"]')];
  check(statuses.length > 0, "polite status exists");
  for (const s of statuses) {
    check(!s.closest("code"), "not entire source in live region");
    check(
      [null, "polite"].includes(s.getAttribute("aria-live")),
      "role=status implicit/explicit polite",
    );
  }
  const text = r.textContent;
  const messages = {
    idle: "未选择源码",
    pending: "正在加载源码",
    failed: "源码加载失败",
    cancelled: "源码加载已取消",
  };
  if (messages[status])
    check(text.includes(messages[status]), "visible current-state message");
  if (status !== "success") {
    check(
      [...r.querySelectorAll("pre > code")].every((c) => c.textContent === ""),
      "no source body on non-success; empty shell allowed",
    );
    check(
      [...r.querySelectorAll("mark")].every((m) => m.textContent === ""),
      "no old nonempty highlight",
    );
  }
  return r;
}
function exact(data, slot = "A") {
  current("success", slot);
  const c = code(slot),
    text = data.content.result.text;
  equal(c.textContent, text, "unmodified UTF16 source");
  const marks = [...c.querySelectorAll("mark")],
    { start, end } = data.location.range;
  if (start.offset !== end.offset) {
    equal(marks.length, 1, "one nonempty exact mark");
    equal(
      marks[0].textContent,
      text.slice(start.offset, end.offset),
      "mark is exact half-open slice",
    );
  } else {
    check(
      marks.every((m) => m.textContent === ""),
      "empty mark/other textless anchor allowed, no adjacent character highlighted",
    );
    check(
      outsideCodeText(slot).includes("空范围"),
      "empty range position message",
    );
    for (const n of [start.line, start.column])
      check(
        new RegExp("(^|[^0-9])" + n + "([^0-9]|$)").test(outsideCodeText(slot)),
        "empty position visible outside code",
      );
  }
  if (start.offset !== end.offset) {
    const desc = description(slot);
    for (const n of [start.line, start.column, end.line, end.column])
      check(
        new RegExp("(^|[^0-9])" + n + "([^0-9]|$)").test(desc),
        "original L6 line/column in description",
      );
  }
  check(!c.isContentEditable, "readonly source");
  equal(
    region(slot).querySelectorAll('textarea,input,[contenteditable="true"]')
      .length,
    0,
    "no editor",
  );
  check(
    !c.closest('[role="status"],[aria-live="polite"],[aria-live="assertive"]'),
    "source text not live",
  );
}
function changed(data, slot = "A") {
  current("success", slot);
  equal(
    code(slot).textContent,
    data.content.result.text,
    "changed keeps current text",
  );
  equal(
    code(slot).querySelectorAll("mark").length,
    0,
    "changed has no exact mark",
  );
  check(
    region(slot).textContent.includes("源码已变化，位置可能不准"),
    "changed warning",
  );
  check(
    description(slot).includes("源码已变化，位置可能不准"),
    "warning association",
  );
  check(
    !region(slot).textContent.includes("空范围"),
    "changed is not empty exact",
  );
}
function pointRect(c, offset) {
  const w = window.document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
  let n,
    last,
    at = 0;
  while ((n = w.nextNode())) {
    last = n;
    if (offset <= at + n.data.length) {
      const r = window.document.createRange();
      r.setStart(n, offset - at);
      r.collapse(true);
      const box =
        [...r.getClientRects()].find((b) => b.height > 0) ??
        r.getBoundingClientRect();
      return box;
    }
    at += n.data.length;
  }
  if (!last && offset === 0) return null;
  throw Error("B DOM offset outside preserved text");
}
function visible(data, slot = "A") {
  const s = scroller(slot),
    r = pointRect(code(slot), data.location.range.start.offset);
  check(s.clientWidth > 0 && s.clientHeight > 0, "measurable source viewport");
  if (!r) {
    equal(data.content.result.text, "", "only empty source lacks caret rect");
    return;
  }
  const box = s.getBoundingClientRect(),
    left = box.left + s.clientLeft,
    top = box.top + s.clientTop;
  check(r.height > 0, "B DOM range measurable");
  check(
    r.top >= top - 2 && r.top < top + s.clientHeight + 2,
    "start line visible vertically",
  );
  check(
    r.left >= left - 2 && r.left <= left + s.clientWidth + 2,
    "start boundary visible horizontally",
  );
}
function scrollPair(slot = "A") {
  const s = scroller(slot);
  return [s.scrollTop, s.scrollLeft];
}
const parent = window.document.getElementById("outer");
function surroundings() {
  return {
    page: [window.scrollX, window.scrollY],
    parent: [parent.scrollLeft, parent.scrollTop],
    active: window.document.activeElement,
  };
}
function stable(old) {
  equal(window.scrollX, old.page[0], "no page X scroll");
  equal(window.scrollY, old.page[1], "no page Y scroll");
  equal(parent.scrollLeft, old.parent[0], "no parent X scroll");
  equal(parent.scrollTop, old.parent[1], "no parent Y scroll");
  equal(window.document.activeElement, old.active, "no focus steal");
}
function userScroll() {
  const s = scroller();
  s.scrollTop = 13;
  s.scrollLeft = 17;
  check(
    s.scrollTop > 0 && s.scrollLeft > 0,
    "fixture has both scroll dimensions",
  );
  return scrollPair();
}
function rangeFor(kind) {
  if (kind === "astral") return makeDocument("prefix 😀中 suffix", 7, 10);
  if (kind === "crlf") return makeDocument("a\r\nb\r\nc", 3, 6);
  return makeDocument("one\ntwo\nthree\nfour", 4, 13);
}
function emptyFor(kind) {
  if (kind === "file") return makeDocument("", 0, 0);
  if (kind === "middle") return makeDocument("ab cd", 2, 2);
  const t = kind === "trailing-eof" ? "ab\n" : "ab";
  return makeDocument(t, t.length, t.length);
}
async function ownedModel() {
  const wire = {
    sent: [],
    messages: new Set(),
    closes: new Set(),
    closed: false,
    onMessage(f) {
      this.messages.add(f);
      return () => this.messages.delete(f);
    },
    onClose(f) {
      this.closes.add(f);
      return () => this.closes.delete(f);
    },
    emit(frame) {
      for (const f of this.messages) f(structuredClone(frame));
    },
    send(frame) {
      this.sent.push(frame);
      if (frame.method === "cancel") return;
      queueMicrotask(() => {
        const data = makeDocument("module B;\nendmodule", 7, 8);
        const result =
          frame.method === "obj.source"
            ? data.source.result
            : frame.method === "source.read"
              ? data.content.result
              : undefined;
        check(result, "expected source query only");
        this.emit({ id: frame.id, ok: true, result, completeness: complete });
      });
    },
    close() {
      this.closed = true;
    },
  };
  const client = new HierClient(wire, { cacheEntries: 0 });
  const c = { wire, client, model: undefined };
  contexts.push(c);
  wire.emit({
    event: "hello",
    protocol: 2,
    snapshot: {
      protocol: 2,
      schemaVersion: 7,
      snapshotId: "B-SV-snapshot",
      inputHash: hashA,
      inputHashComplete: true,
      frontend: { name: "slang", version: "B source-view fixture" },
      bodySharing: "fast",
      tops: [],
      definitionCount: 0,
      bodyCount: 0,
      indexState: "ready",
      openedAt: "2000-01-01T00:00:00.000Z",
      topCandidates: [],
    },
    capabilities: ["cancel", "progress"],
  });
  await client.ready;
  const model = new SourceDocumentModel(client);
  c.model = model;
  await model.load("B-source-view-ref", "definition");
  return c;
}
async function runCase(id) {
  const item = cases.find((c) => c.id === id);
  check(item, "known explicit case");
  const { kind, input } = item;
  let extra = {};
  window.document
    .getElementById("outside-focus")
    .focus({ preventScroll: true });
  window.scrollTo(0, 130);
  parent.scrollTop = 37;
  const base = surroundings();
  if (kind === "state") {
    const s = makeState(input.status);
    render(s);
    current(input.status);
    if (input.status === "success") exact(s.data);
  } else if (kind === "transition") {
    const d = makeDocument("B OLD BODY", 2, 6);
    render(success(d));
    const next = makeState(input.status);
    render(next);
    current(input.status);
    check(
      !region().textContent.includes("B OLD BODY"),
      "no stale success content",
    );
    if (next.status === "success") exact(next.data);
  } else if (kind === "transition-error") {
    render(
      makeState(
        "failed",
        undefined,
        Object.freeze({
          origin: "core",
          code: "not_found",
          message: "B OLD DIAGNOSTIC",
          data: Object.freeze({}),
        }),
      ),
    );
    const next = makeState(input.status);
    render(next);
    current(input.status);
    check(
      !region().textContent.includes("B OLD DIAGNOSTIC"),
      "old diagnostic removed",
    );
    if (next.status === "success") exact(next.data);
  } else if (kind === "text") {
    const d = makeDocument(input.text);
    render(success(d));
    exact(d);
    equal(window.injected, undefined, "source not HTML execution");
    equal(
      code().querySelectorAll("script,img,iframe").length,
      0,
      "not parsed HTML",
    );
  } else if (kind === "range") {
    const d = rangeFor(input.name);
    render(success(d));
    exact(d);
  } else if (kind === "empty") {
    const d = emptyFor(input.name);
    render(success(d));
    exact(d);
    equal(
      code().textContent.length,
      d.content.result.text.length,
      "no whitespace/zero-width padding",
    );
  } else if (kind === "changed") {
    const t =
      input.name === "empty"
        ? ""
        : input.name === "short"
          ? "new"
          : "unrelated\ncurrent";
    const d = makeDocument(t, 0, 0, true);
    render(success(d));
    changed(d);
  } else if (kind === "diagnostic") {
    const hits = [];
    const error = {
      origin: "core",
      code: "not_found",
      message:
        input.status === "failure-html"
          ? "<img src=x> B diagnostic &"
          : "B current diagnostic",
    };
    for (const key of ["data", "dataIssue", "cause", "extension", "toJSON"])
      Object.defineProperty(error, key, {
        enumerable: true,
        get() {
          hits.push(key);
          throw Error("B forbidden diagnostic read " + key);
        },
      });
    Object.freeze(error);
    const diagnostic = new Proxy(error, {
      ownKeys() {
        hits.push("ownKeys");
        throw Error("B no diagnostic traversal");
      },
    });
    const status = input.status === "cancelled" ? "cancelled" : "failed";
    render(makeState(status, undefined, diagnostic));
    current(status);
    for (const text of [error.origin, error.code, error.message])
      check(region().textContent.includes(text), "only public diagnostic text");
    equal(hits.length, 0, "no diagnostic probing");
    equal(
      region().querySelectorAll("img,script").length,
      0,
      "diagnostic escaped",
    );
  } else if (kind === "invalid") {
    const value =
      input.field === "height" && input.value === "boxed"
        ? new Number(280)
        : badValue(input.value);
    render(makeState(), { [input.field]: value });
    check(caught.length > 0, "boundary caught invalid props");
    check(
      caught.every((e) => e instanceof TypeError),
      "synchronous TypeError, not SourceDocumentFailure",
    );
  } else if (kind === "props") {
    const opts =
      input.name === "raw-label"
        ? { ariaLabel: "  B 原值\t尾  " }
        : input.name === "empty-class"
          ? { className: "" }
          : { height: 0.5 };
    render(makeState(), opts);
    equal(
      name(region()),
      opts.ariaLabel ?? "B source A",
      "raw accessible label",
    );
    check(caught.length === 0, "valid props");
    const h = componentHeight();
    check(
      Math.abs(h - (opts.height ?? 280)) <= 1,
      "whole component CSS height",
    );
  } else if (kind === "scroll") {
    const name = input.name;
    let d = makeDocument(longText, point, point + 1),
      strict = name === "strict";
    if (name === "initial") {
      const at = longText.indexOf("080 ") + 4;
      d = makeDocument(longText, at, at + 1);
    }
    if (name === "cross-screen")
      d = makeDocument(
        longText,
        longText.indexOf("030 ") + 1,
        longText.indexOf("140 ") + 3,
      );
    if (name === "empty-eof")
      d = makeDocument(longText, longText.length, longText.length);
    if (name === "hidden" || name === "css-only-before-commit")
      host("A").style.display = "none";
    let zeroStyle;
    if (name === "zero-viewport") {
      zeroStyle = window.document.createElement("style");
      zeroStyle.textContent =
        '#A [tabindex="0"]{max-height:0!important;min-height:0!important;padding-block:0!important;border-block:0!important}';
      window.document.head.append(zeroStyle);
    }
    if (name === "two-instances") {
      const b = makeDocument(longText, 0, 1);
      render(success(b), {}, "B");
      scroller("B").scrollTop = 9;
      scroller("B").scrollLeft = 11;
      const other = scrollPair("B");
      render(success(d));
      visible(d);
      equal(
        scrollPair("B").join(","),
        other.join(","),
        "other instance untouched",
      );
    } else {
      render(success(d), {}, "A", strict);
      if (
        ["hidden", "css-only-before-commit", "zero-viewport"].includes(name)
      ) {
        if (zeroStyle) {
          equal(scroller().clientHeight, 0, "fixture forces zero viewport");
          zeroStyle.remove();
        }
        host("A").style.display = "";
        render(success(d), { height: 281 }, "A", strict);
        visible(d);
      } else {
        visible(d);
        if (name === "new-data") {
          scroller().scrollTop = 0;
          scroller().scrollLeft = 0;
          d = makeDocument(longText, point, point + 1);
          render(success(d));
          visible(d);
        } else if (name.startsWith("same-") || name === "strict") {
          const old = userScroll(),
            opts =
              name === "same-label"
                ? { ariaLabel: "B changed label" }
                : name === "same-class"
                  ? { className: "B new-class" }
                  : name === "same-height"
                    ? { height: 250 }
                    : {};
          render(success(d), opts, "A", strict);
          equal(
            scrollPair().join(","),
            old.join(","),
            "completed same-data position remains user-owned",
          );
        } else if (name.startsWith("return-")) {
          render(makeState(name.slice(7)));
          render(success(d));
          visible(d);
        } else if (name === "remount") {
          scroller().scrollTop = 0;
          unmount();
          render(success(d));
          visible(d);
        } else if (name === "changed-top") {
          const next = makeDocument(longText, 0, 0, true);
          render(success(next));
          changed(next);
          equal(scrollPair().join(","), "0,0", "changed top-left");
        }
      }
    }
  } else if (kind === "access") {
    const d = makeDocument(longText, point, point + 1);
    if (input.name === "selection") {
      const text = window.document.getElementById("selection-probe").firstChild,
        r = window.document.createRange();
      r.setStart(text, 1);
      r.setEnd(text, 6);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      render(success(d));
      equal(s.anchorNode, text, "unrelated selection anchor");
      equal(s.toString(), " sele", "unrelated selection preserved");
    } else if (input.name === "unique-description") {
      render(success(d));
      render(success(d), {}, "B");
      description();
      description("B");
      const aIds = new Set(descriptionIds("A"));
      check(
        descriptionIds("B").every((id) => !aIds.has(id)),
        "description association IDs are instance-local",
      );
      const all = [...window.document.querySelectorAll("[id]")].map(
        (e) => e.id,
      );
      equal(
        new Set(all).size,
        all.length,
        "no DOM ID collision across equal documents",
      );
    } else {
      render(success(d));
      exact(d);
      if (input.name === "clipboard") {
        const event = new Event("copy", { bubbles: true, cancelable: true });
        code().dispatchEvent(event);
        equal(
          event.defaultPrevented,
          false,
          "native clipboard not intercepted",
        );
      } else if (input.name === "tab" || input.name === "keyboard") {
        extra = {
          keyboard: input.name,
          slot: "A",
          before: scrollPair(),
          text: d.content.result.text,
        };
      }
    }
  } else if (kind === "lifecycle") {
    if (input.name === "sdk-owned") {
      const c = await ownedModel(),
        before = c.wire.sent.length,
        messages = c.wire.messages.size;
      render(c.model.state);
      exact(c.model.state.data);
      render(c.model.state);
      unmount();
      equal(
        c.wire.sent.length,
        before,
        "render/rerender/unmount creates no query/cancel",
      );
      equal(
        c.wire.messages.size,
        messages,
        "view adds/removes no SDK subscription",
      );
      equal(c.model.disposed, false, "borrowed model not disposed");
      equal(c.wire.closed, false, "borrowed transport not closed");
      await c.model.reload();
      check(
        c.model.state.status === "success",
        "host still can use live model",
      );
    } else {
      // React roots are created before interception; only component commit/unmount measured.
      const root = createRoot(host("A"));
      roots.set("A", root);
      const counts = { timer: 0, resize: 0, globalKey: 0 },
        saved = {
          timeout: window.setTimeout,
          interval: window.setInterval,
          resize: window.ResizeObserver,
          windowAdd: window.addEventListener,
          documentAdd: window.document.addEventListener,
        };
      window.setTimeout = function (...args) {
        counts.timer++;
        return saved.timeout.apply(this, args);
      };
      window.setInterval = function (...args) {
        counts.timer++;
        return saved.interval.apply(this, args);
      };
      window.ResizeObserver = class {
        constructor() {
          counts.resize++;
          throw Error("B no external layout observer");
        }
      };
      window.addEventListener = function (type, ...args) {
        if (type === "keydown") counts.globalKey++;
        return saved.windowAdd.call(this, type, ...args);
      };
      window.document.addEventListener = function (type, ...args) {
        if (type === "keydown") counts.globalKey++;
        return saved.documentAdd.call(this, type, ...args);
      };
      try {
        render(success(makeDocument("B native", 1, 2)));
        unmount();
        equal(counts.timer, 0, "no timers");
        equal(counts.resize, 0, "no ResizeObserver");
        equal(counts.globalKey, 0, "no global keyboard owner");
      } finally {
        window.setTimeout = saved.timeout;
        window.setInterval = saved.interval;
        window.ResizeObserver = saved.resize;
        window.addEventListener = saved.windowAdd;
        window.document.addEventListener = saved.documentAdd;
      }
    }
  } else if (kind === "base-layout") {
    const d = makeDocument(longText, point, point + 1);
    render(success(d));
    exact(d);
    visible(d);
    const s = scroller(),
      style = getComputedStyle(code());
    check(
      style.whiteSpace === "pre" ||
        (style.whiteSpaceCollapse === "preserve" &&
          style.textWrapMode === "nowrap"),
      "base whitespace/no-wrap without CSS",
    );
    check(
      s.scrollHeight > s.clientHeight && s.scrollWidth > s.clientWidth,
      "both native scroll dimensions without CSS",
    );
    check(
      Math.abs(componentHeight() - 280) <= 1,
      "base total height without CSS",
    );
  } else throw Error("unhandled B case " + kind);
  if (kind !== "invalid") {
    equal(caught.length, 0, "no unexpected boundary failure");
    equal(windowErrors.length, 0, "no window errors");
  }
  equal(unhandled.length, 0, "no unhandled promise rejection");
  stable(base);
  return { pass: true, id, kind, ...extra };
}
async function cleanup() {
  const errors = [];
  for (const slot of [...roots.keys()])
    try {
      unmount(slot);
    } catch (e) {
      errors.push(String(e));
    }
  for (const c of contexts.splice(0)) {
    try {
      c.model?.dispose();
    } catch (e) {
      errors.push(String(e));
    }
    try {
      c.client.dispose();
    } catch (e) {
      errors.push(String(e));
    }
  }
  return { unhandled: unhandled.length, remainingRoots: roots.size, errors };
}
async function selfCheck() {
  const stats = { mounts: 0, cleanups: 0 };
  const text = "\uFEFF\tA😀\r\nB\rC\n";
  function Probe() {
    useEffect(() => {
      stats.mounts++;
      return () => stats.cleanups++;
    }, []);
    return React.createElement(
      "pre",
      null,
      React.createElement(
        "code",
        null,
        text.slice(0, 3),
        React.createElement("mark", null, text.slice(3, 5)),
        text.slice(5),
      ),
    );
  }
  const root = createRoot(window.document.getElementById("probe"));
  flushSync(() =>
    root.render(
      React.createElement(StrictMode, null, React.createElement(Probe)),
    ),
  );
  const c = window.document.querySelector("#probe pre > code");
  equal(c.textContent, text, "B React DOM preserves CRLF/BOM/UTF16");
  equal(c.querySelector("mark").textContent, "😀", "B test slicing uses UTF16");
  check(pointRect(c, 3).height > 0, "B Range caret measurable");
  equal(stats.mounts, 2, "actual dev StrictMode effect replay");
  flushSync(() => root.unmount());
  equal(stats.cleanups, 2, "probe resources released");
  return {
    fixtureOnly: true,
    productMounted: false,
    react: React.version,
    checks: 5,
    ...stats,
    sourceViewCapable: typeof SourceView === "function",
  };
}
function keyboardCheck(kind, before) {
  const s = scroller();
  equal(
    window.document.activeElement,
    s,
    "normal tab reaches focusable source body",
  );
  if (kind === "keyboard") {
    check(s.scrollTop > before[0], "native PageDown scrolls source");
    check(s.scrollLeft > before[1], "native ArrowRight scrolls source");
  }
  equal(unhandled.length, 0, "no keyboard unhandled work");
  equal(windowErrors.length, 0, "no keyboard error");
  equal(caught.length, 0, "no keyboard boundary failure");
  return { pass: true, kind };
}
function prepareKeyboard() {
  const s = scroller();
  equal(window.document.activeElement, s, "tab reaches body before scrolling");
  s.scrollTop = 0;
  s.scrollLeft = 0;
  return scrollPair();
}
function descriptionIds(slot) {
  const r = region(slot);
  return [
    ...new Set(
      [r, ...r.querySelectorAll("[aria-describedby]")].flatMap((n) =>
        (n.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean),
      ),
    ),
  ];
}
window.B = {
  capable: typeof SourceView === "function",
  runCase,
  cleanup,
  selfCheck,
  body: () => scroller(),
  keyboardCheck,
  prepareKeyboard,
  descriptionIds,
  errors: () => ({
    caught: caught.length,
    window: windowErrors.length,
    unhandled: unhandled.length,
  }),
};
