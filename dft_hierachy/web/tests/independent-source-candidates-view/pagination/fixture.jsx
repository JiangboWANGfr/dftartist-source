// Independent real-model fixtures, original public calls. No candidate UI substitute.
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient } from "@hier/client";
import { SourceNavigationModel, SelectionModel } from "@hier/viewmodel";
import { context, check, equal, partial, cursor } from "./public-model.mjs";
import { observePublicCalls } from "./public-calls.mjs";
import { cases } from "./cases.mjs";
import { observeDom } from "../../independent-source-position-interaction/browser-observation.mjs";
const View = Reflect.get(Views, "SourceCandidatesView"),
  contexts = [],
  unhandled = [];
let C, root;
window.addEventListener("unhandledrejection", (e) => {
  unhandled.push(e.reason);
  e.preventDefault();
});
const host = () => document.getElementById("root");
const buttons = () =>
  [...host().querySelectorAll("button")].filter((b) => !b.closest("li"));
const button = (label) => {
  const a = buttons().filter((b) => b.textContent.includes(label));
  check(a.length <= 1, "one operation button");
  return a[0] ?? null;
};
const blocked = (b) =>
  !b ||
  b.disabled ||
  b.matches(":disabled") ||
  b.closest("[inert]") !== null ||
  b.getAttribute("aria-disabled") === "true" ||
  b.hidden ||
  b.getClientRects().length === 0 ||
  getComputedStyle(b).display === "none" ||
  getComputedStyle(b).visibility === "hidden";
const point = (b) => {
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return r.width && r.height
    ? { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    : null;
};
const more = () => button("加载更多"),
  reload = () => button("重新查询");
const calls = (name) => C.tap.records.filter((r) => r.name === name);
async function dom(predicate) {
  const w = observeDom(host(), predicate);
  C.waits.push(w);
  await w.promise;
}
function mount() {
  root = createRoot(host());
  flushSync(() =>
    root.render(
      React.createElement(View, {
        navigation: C.n,
        selection: C.s,
        ariaLabel: "B33 pagination",
        height: 240,
        onCommandError: (f) => C.failures.push(f),
      }),
    ),
  );
}
async function setup(c) {
  C = await context({ HierClient, SourceNavigationModel, SelectionModel });
  contexts.push(C);
  C.case = c;
  C.failures = [];
  C.waits = [];
  C.page = await C.head(c.input.status, c.input.next);
  C.headSent = C.sent.length;
  C.tap = observePublicCalls(C.n, [
    "loadMore",
    "reloadCandidates",
    "cancelCandidates",
  ]);
  return C;
}
function rawPreserved() {
  const old = C.page;
  equal(
    old.completeness.status,
    C.case.input.status,
    "original page completeness",
  );
  equal(
    Object.hasOwn(old.result, "next"),
    C.case.input.next,
    "original next presence",
  );
  if (C.case.input.next)
    equal(old.result.next, cursor, "original cursor retained");
  if (old.completeness.status === "partial") {
    equal(
      old.completeness.reasons[0].code,
      "unsupported",
      "original reason code",
    );
    equal(old.completeness.reasons[0].at, "B33/raw-at", "original at");
    equal(
      old.completeness.reasons[0].detail,
      partial.reasons[0].detail,
      "original detail",
    );
  }
}
function partialText() {
  const text = host().textContent;
  check(text.includes("结果不完整"), "partial never masquerades complete");
  for (const v of ["unsupported", "B33/raw-at", partial.reasons[0].detail])
    check(text.includes(v), "original reason text");
}
function oneCommand(name) {
  const r = calls(name);
  equal(r.length, 1, "one actual public " + name);
  equal(r[0].receiver, C.n, "real receiver");
  equal(r[0].args.length, 0, "no cursor or custom params from view");
  equal(r[0].status, "returned", "original return recorded without consuming");
  for (const other of ["loadMore", "reloadCandidates", "cancelCandidates"])
    if (other !== name)
      equal(calls(other).length, 0, "no extra command " + other);
}
async function prepare(id) {
  const c = cases.find((c) => c.id === id);
  check(c, "frozen ID");
  await setup(c);
  mount();
  if (c.input.action === "blocked") {
    await dom(
      () =>
        host().querySelector(
          '[role="region"],section[aria-label],section[aria-labelledby]',
        ) !== null,
    );
    check(blocked(more()), "no actionable loadMore for partial/no-next");
    if (c.input.status === "partial") partialText();
    rawPreserved();
    return { click: point(more()), blocked: true };
  }
  const b = c.input.action === "reload" ? reload : more;
  await dom(() => !blocked(b()));
  return { click: point(b()) };
}
async function verify() {
  const c = C.case;
  if (c.input.action === "blocked") {
    for (const name of ["loadMore", "reloadCandidates", "cancelCandidates"])
      equal(calls(name).length, 0, "inactive button zero public commands");
    equal(C.n.state.candidates.state.pages[0], C.page, "no page replacement");
    equal(C.sent.length, C.headSent, "inactive UI sends no SDK request");
    equal(C.s.current.items.length, 0, "inactive button not selection");
    rawPreserved();
    return { pass: true };
  }
  const reloadCase = c.input.action === "reload";
  oneCommand(reloadCase ? "reloadCandidates" : "loadMore");
  const q = await C.next("source.resolve");
  check(q, "one real query");
  equal(
    C.sent.length,
    C.headSent + 1,
    "one wire query without extra UI SDK calls",
  );
  equal(
    q.params.cursor,
    reloadCase ? "" : cursor,
    "L6 supplies original/initial cursor",
  );
  C.reply(
    q,
    c.input.action.startsWith("tail") ? "partial" : "complete",
    c.input.action === "tail-next",
  );
  // Do not observe the view-returned Promise on the component's behalf.
  await dom(
    () =>
      C.n.state.candidates.state.status === "success" &&
      (reloadCase
        ? C.n.state.candidates.state.pages[0] !== C.page && !blocked(reload())
        : host().querySelectorAll("li button").length === 2),
  );
  if (reloadCase) {
    equal(C.n.state.candidates.state.pages.length, 1, "reload fresh head");
    rawPreserved();
    check(
      !host().textContent.includes("结果不完整"),
      "fresh complete head clears prior partial warning",
    );
  } else {
    equal(
      C.n.state.candidates.state.pages[0],
      C.page,
      "append keeps original head",
    );
    equal(C.n.state.candidates.state.pages.length, 2, "one appended page");
    if (c.input.action.startsWith("tail")) {
      await dom(() => blocked(more()));
      partialText();
      const tail = C.n.state.candidates.state.pages[1];
      equal(tail.completeness.status, "partial", "partial tail stays partial");
      equal(
        Object.hasOwn(tail.result, "next"),
        c.input.action === "tail-next",
        "partial tail original next presence",
      );
      if (c.input.action === "tail-next")
        equal(
          tail.result.next,
          cursor + " tail",
          "partial tail original cursor",
        );
      C.tail = tail;
      C.tailState = C.n.state;
      return { secondClick: point(more()), tail: true };
    }
  }
  equal(C.s.current.items.length, 0, "pagination not selection");
  equal(C.failures.length, 0, "successful operation no command failure");
  return { pass: true };
}
function finishTail() {
  oneCommand("loadMore");
  equal(
    C.n.state.candidates.state.pages.length,
    2,
    "blocked partial tail no append",
  );
  equal(C.n.state, C.tailState, "inactive tail keeps original state");
  equal(C.n.state.candidates.state.pages[1], C.tail, "tail original identity");
  equal(C.sent.length, C.headSent + 1, "no request from disabled tail button");
  equal(C.s.current.items.length, 0, "no selection");
  return { pass: true };
}
async function modelControls() {
  const results = [];
  for (const c of cases) {
    await setup(c);
    const before = C.n.state,
      count = C.queries().length;
    if (c.input.action === "blocked") {
      const p = C.n.loadMore();
      p.catch(() => {});
      C.owned.push(p);
      await p;
      equal(C.n.state, before, "public no-op keeps state");
      equal(C.queries().length, count, "public no-op no request");
    } else {
      const name =
          c.input.action === "reload" ? "reloadCandidates" : "loadMore",
        p = C.n[name]();
      p.catch(() => {});
      C.owned.push(p);
      const q = await C.next("source.resolve");
      equal(
        q.params.cursor,
        name === "loadMore" ? cursor : "",
        "public cursor premise",
      );
      C.reply(
        q,
        c.input.action.startsWith("tail") ? "partial" : "complete",
        c.input.action === "tail-next",
      );
      await p;
      if (c.input.action.startsWith("tail")) {
        const s = C.n.state,
          n = C.queries().length;
        const again = C.n.loadMore();
        again.catch(() => {});
        C.owned.push(again);
        await again;
        equal(C.n.state, s, "partial tail public no-op");
        equal(C.queries().length, n, "no partial tail request");
      }
    }
    rawPreserved();
    results.push({
      id: c.id,
      pass: true,
      queries: C.queries().length,
      partial: C.n.state.candidates.state.pages.some(
        (p) => p.completeness.status === "partial",
      ),
    });
  }
  return results;
}
let native = 0,
  blockedNative = 0;
async function nativePrepare() {
  const b = document.createElement("button");
  b.textContent = "B33 native event";
  b.addEventListener("click", () => native++);
  host().append(b);
  const fieldset = document.createElement("fieldset"),
    disabled = document.createElement("button");
  fieldset.disabled = true;
  disabled.textContent = "B inherited disabled";
  disabled.addEventListener("click", () => blockedNative++);
  fieldset.append(disabled);
  host().append(fieldset);
  const container = document.createElement("div"),
    inert = document.createElement("button");
  container.inert = true;
  inert.textContent = "B inert control";
  inert.addEventListener("click", () => blockedNative++);
  container.append(inert);
  host().append(container);
  check(blocked(disabled), "inherited native disabled semantics accepted");
  check(blocked(inert), "inert ancestor semantics accepted");
  return { click: point(b), disabled: point(disabled), inert: point(inert) };
}
function nativeVerify() {
  equal(native, 1, "trusted native click once");
  equal(blockedNative, 0, "native fieldset/inert controls cannot activate");
  return { pass: true };
}
async function cleanup() {
  const errors = [];
  if (root)
    try {
      flushSync(() => root.unmount());
    } catch (error) {
      errors.push(String(error));
    } finally {
      root = null;
    }
  for (const c of contexts.splice(0).reverse()) {
    for (const w of c.waits)
      try {
        w.cancel();
      } catch (error) {
        errors.push("DOM wait release: " + String(error));
      }
    try {
      c.tap?.dispose();
    } catch (error) {
      errors.push(String(error));
    }
    try {
      for (const failure of await c.close()) errors.push(failure.label);
    } catch (error) {
      errors.push("model context release: " + String(error));
    }
  }
  return { errors, unhandled: unhandled.map((e) => String(e)) };
}
window.B33 = {
  capable: View !== undefined && View !== null,
  prepare,
  verify,
  finishTail,
  modelControls,
  nativePrepare,
  nativeVerify,
  cleanup,
};
