import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient } from "@hier/client";
import { SourceNavigationModel, SelectionModel } from "@hier/viewmodel";
import { ready, selected } from "./public-model.mjs";
import { bindings, activation, keyboardBoundary } from "./assertions.mjs";
import { pointerInit } from "./input.mjs";
import { cases } from "./cases.mjs";
import { observePublicCalls } from "../pagination/public-calls.mjs";
import { check, equal } from "../pagination/public-model.mjs";
import { observeDom } from "../../independent-source-position-interaction/browser-observation.mjs";
const View = Reflect.get(Views, "SourceCandidatesView"),
  classes = { HierClient, SourceNavigationModel, SelectionModel },
  names = [
    "createCandidateAction",
    "confirmCandidate",
    "loadMore",
    "reloadCandidates",
    "cancelCandidates",
  ],
  contexts = [],
  unhandled = [];
let C, root;
window.addEventListener("unhandledrejection", (e) => {
  unhandled.push(e.reason);
  e.preventDefault();
});
const host = () => document.getElementById("root"),
  rows = () => [...host().querySelectorAll("li button")],
  point = (b) => {
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  },
  enabled = (b) =>
    !b.disabled &&
    !b.matches(":disabled") &&
    b.getAttribute("aria-disabled") !== "true" &&
    !b.closest("[inert]");
async function dom(predicate) {
  const w = observeDom(host(), predicate);
  C.waits.push(w);
  await w.promise;
}
function render(className) {
  flushSync(() =>
    root.render(
      React.createElement(View, {
        navigation: C.n,
        selection: C.s,
        ariaLabel: "B35 original bindings",
        height: 260,
        onCommandError: C.onError,
        ...(className ? { className } : {}),
      }),
    ),
  );
}
function pointer(target, type) {
  target.dispatchEvent(new PointerEvent(type, pointerInit(type)));
}
async function prepare(id) {
  const item = cases.find((c) => c.id === id);
  check(item, "frozen case");
  C = await ready(classes);
  contexts.push(C);
  C.item = item;
  C.waits = [];
  C.failures = [];
  C.keys = [];
  C.keyProbe = (e) => C.keys.push(e);
  document.addEventListener("keydown", C.keyProbe, true);
  C.onError = (f) => C.failures.push(f);
  C.tap = observePublicCalls(C.n, names);
  root = createRoot(host());
  render();
  equal(
    C.tap.records.length,
    0,
    "binding must wait until after synchronous commit stack",
  );
  equal(C.sent.length, C.sentBefore, "mount zero query");
  if (item.input.event.startsWith("synthetic-")) {
    equal(rows().length, 2, "unprepared rows already displayed");
    check(
      rows().every((b) => b.getAttribute("aria-disabled") === "true"),
      "unprepared rows visibly unavailable",
    );
    pointer(rows()[0], "pointerdown");
    if (item.input.event === "synthetic-cancel-then-AT")
      pointer(rows()[0], "pointercancel");
  }
  await dom(() => rows().length === 2 && rows().every(enabled));
  C.issued = bindings(C.tap.records, C.n, C.page);
  const target = rows()[item.input.target];
  if (item.input.event === "rerender-focus") {
    target.focus();
    render("B35 same-state rerender");
    check(rows()[0] === document.activeElement, "stable row focus retained");
  }
  if (
    item.input.event.startsWith("trusted-") &&
    item.input.event !== "trusted-click"
  )
    target.focus();
  return { event: item.input.event, point: point(target) };
}
async function verify() {
  const c = C.item,
    b = rows()[c.input.target];
  if (
    c.input.event === "assistive-click" ||
    c.input.event === "synthetic-cancel-then-AT"
  )
    b.click();
  if (c.input.event === "synthetic-unavailable-down") {
    pointer(b, "pointerup");
    pointer(b, "click");
  }
  await Promise.resolve();
  activation(
    C.tap.records,
    C.n,
    C.s,
    C.page,
    c.input.target,
    c.expected.confirm,
    C.issued,
  );
  selected(C, c.input.target, c.expected.confirm);
  equal(C.failures.length, 0, "no spurious command failure");
  if (c.input.event === "rerender-focus")
    check(
      rows()[1] === document.activeElement,
      "ArrowDown remains local focus change",
    );
  return {
    pass: true,
    bindings: 2,
    confirmations: c.expected.confirm,
    queries: C.sent.length - C.sentBefore,
  };
}
function verifyKeydown() {
  keyboardBoundary(
    C.tap.records,
    C.n,
    C.s,
    C.page,
    C.item.input.target,
    C.issued,
    C.keys.at(-1),
  );
  selected(C, C.item.input.target, 1);
  return {
    pass: true,
    at: "after keydown dispatch; before keyup",
    confirmations: 1,
  };
}
async function modelControls() {
  const out = [];
  for (const mode of [
    "raw-page-index-action",
    "clone-rejected",
    "repeated-call-vs-selection",
  ]) {
    const c = await ready(classes);
    contexts.push(c);
    c.waits = [];
    c.tap = observePublicCalls(c.n, names);
    const one = c.n.createCandidateAction(c.page, 1),
      zero = c.n.createCandidateAction(c.page, 0),
      issued = [zero, one];
    bindings(c.tap.records, c.n, c.page);
    if (mode === "raw-page-index-action") {
      c.n.confirmCandidate(issued[1], c.s);
      activation(c.tap.records, c.n, c.s, c.page, 1, 1, issued);
      selected(c, 1, 1);
    }
    if (mode === "clone-rejected") {
      let thrown;
      try {
        c.n.confirmCandidate({ ...issued[0] }, c.s);
      } catch (e) {
        thrown = e;
      }
      check(
        thrown && thrown.code === "invalid_action",
        "cloned action rejected by actual L6",
      );
      const record = c.tap.records.at(-1);
      equal(record.status, "thrown", "raw rejection recorded");
      equal(record.error, thrown, "original throw identity");
      selected(c, 0, 0);
    }
    if (mode === "repeated-call-vs-selection") {
      c.n.confirmCandidate(issued[0], c.s);
      c.n.confirmCandidate(issued[0], c.s);
      equal(
        c.tap.records.filter((r) => r.name === "confirmCandidate").length,
        2,
        "actual public count is two even with same target",
      );
      let refused = false;
      try {
        activation(c.tap.records, c.n, c.s, c.page, 0, 1, issued);
      } catch {
        refused = true;
      }
      check(refused, "exact-one assertion rejects two actual calls");
      selected(c, 0, 1);
    }
    out.push({ id: "B35-model-" + mode, pass: true, candidateUI: false });
  }
  return out;
}
let nativeEvents = [];
function nativePrepare() {
  const b = document.createElement("button");
  b.textContent = "B35 plain native premise";
  for (const type of [
    "pointerdown",
    "pointerup",
    "pointercancel",
    "click",
    "keydown",
    "keyup",
  ])
    b.addEventListener(type, (e) =>
      nativeEvents.push({
        type,
        trusted: e.isTrusted,
        detail: e.detail ?? null,
        key: e.key ?? null,
        pointerId: e.pointerId ?? null,
        pointerType: e.pointerType ?? null,
      }),
    );
  host().append(b);
  return point(b);
}
function nativeBegin() {
  nativeEvents = [];
  host().querySelector("button").focus();
}
function nativeVerify(mode) {
  const events = nativeEvents.slice();
  equal(
    events.filter((e) => e.type === "click").length,
    1,
    "one native browser activation premise",
  );
  if (mode === "trusted-click") {
    for (const type of ["pointerdown", "pointerup", "click"])
      check(
        events.some((e) => e.type === type && e.trusted),
        "trusted native " + type,
      );
  }
  if (mode === "trusted-enter" || mode === "trusted-space")
    check(
      events.some((e) => e.type === "keydown" && e.trusted),
      "trusted keyboard premise",
    );
  return { id: "B35-native-" + mode, pass: true, events, candidateUI: false };
}
function syntheticNative() {
  nativeEvents = [];
  const b = host().querySelector("button");
  pointer(b, "pointerdown");
  pointer(b, "pointercancel");
  b.click();
  equal(
    nativeEvents.filter((e) => e.type === "pointerdown").length,
    1,
    "synthetic down delivered",
  );
  equal(
    nativeEvents.filter((e) => e.type === "pointercancel").length,
    1,
    "synthetic cancel delivered",
  );
  equal(
    nativeEvents.filter((e) => e.type === "click").length,
    1,
    "AT click delivered",
  );
  check(
    nativeEvents.every((e) => !e.trusted),
    "edge input is explicitly synthetic",
  );
  return {
    id: "B35-native-synthetic-cancel-AT",
    pass: true,
    events: nativeEvents.slice(),
    candidateUI: false,
  };
}
function matchingNative() {
  nativeEvents = [];
  const b = host().querySelector("button");
  for (const type of ["pointerdown", "pointerup", "click"]) pointer(b, type);
  equal(nativeEvents.length, 3, "three paired synthetic events");
  for (const e of nativeEvents) {
    equal(e.pointerId, 35, "same original pointer ID");
    equal(e.pointerType, "mouse", "same pointer type");
    equal(e.trusted, false, "synthetic edge not trusted");
  }
  equal(nativeEvents.at(-1).detail, 1, "paired click detail");
  return {
    id: "B35-native-matching-pointer-ID",
    pass: true,
    events: nativeEvents.slice(),
    candidateUI: false,
  };
}
async function cleanup() {
  const errors = [];
  if (root)
    try {
      flushSync(() => root.unmount());
    } catch (e) {
      errors.push("unmount:" + String(e));
    } finally {
      root = null;
    }
  for (const c of contexts.splice(0).reverse()) {
    if (c.keyProbe) document.removeEventListener("keydown", c.keyProbe, true);
    for (const w of c.waits ?? [])
      try {
        w.cancel();
      } catch (e) {
        errors.push("wait:" + String(e));
      }
    try {
      c.tap?.dispose();
    } catch (e) {
      errors.push("observer:" + String(e));
    }
    try {
      for (const e of await c.close()) errors.push(e.label);
    } catch (e) {
      errors.push("context:" + String(e));
    }
  }
  return { errors, unhandled: unhandled.map(String) };
}
window.B35 = {
  capable: View !== undefined && View !== null,
  prepare,
  verify,
  verifyKeydown,
  modelControls,
  nativePrepare,
  nativeBegin,
  nativeVerify,
  syntheticNative,
  matchingNative,
  cleanup,
};
