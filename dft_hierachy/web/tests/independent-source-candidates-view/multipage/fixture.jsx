import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient } from "@hier/client";
import { SourceNavigationModel, SelectionModel } from "@hier/viewmodel";
import { ready, selected } from "./public-model.mjs";
import { bindings, activation, keyboardBoundary } from "./assertions.mjs";
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
        ariaLabel: "B36 duplicate original occurrences",
        height: 620,
        onCommandError: C.onError,
        ...(className ? { className } : {}),
      }),
    ),
  );
}
async function prepare(id) {
  const c = cases.find((c) => c.id === id);
  check(c, "frozen ID");
  C = await ready(classes);
  contexts.push(C);
  C.item = c;
  C.waits = [];
  C.failures = [];
  C.onError = (f) => C.failures.push(f);
  C.keys = [];
  C.keyProbe = (e) => C.keys.push(e);
  document.addEventListener("keydown", C.keyProbe, true);
  C.tap = observePublicCalls(C.n, names);
  root = createRoot(host());
  render();
  equal(C.tap.records.length, 0, "no signing in synchronous commit stack");
  equal(C.sent.length, C.sentBefore, "mount zero extra request");
  await dom(() => rows().length === 4 && rows().every(enabled));
  C.issued = bindings(C.tap.records, C.n, C.pages);
  if (c.input.event === "rerender-cross-page-focus") {
    rows()[1].focus();
    render("B36 same-state rerender");
    check(
      rows()[1] === document.activeElement,
      "same original occurrence retains focus",
    );
  }
  if (c.input.event === "trusted-enter" || c.input.event === "trusted-space")
    rows()[c.input.row].focus();
  return { event: c.input.event, point: point(rows()[c.input.row]) };
}
function verifyKeydown() {
  keyboardBoundary(
    C.tap.records,
    C.n,
    C.s,
    C.pages,
    C.item.input.row,
    C.issued,
    C.keys.at(-1),
  );
  selected(C, 1);
  return { pass: true, at: "keydown completed, before keyup" };
}
async function verify() {
  const c = C.item;
  if (c.input.event === "assistive-click") rows()[c.input.row].click();
  await Promise.resolve();
  equal(rows().length, 4, "all value-equal occurrences stay displayed");
  activation(
    C.tap.records,
    C.n,
    C.s,
    C.pages,
    c.input.row,
    c.expected.confirm,
    C.issued,
  );
  selected(C, c.expected.confirm);
  equal(C.failures.length, 0, "no spurious feedback");
  if (c.input.event === "rerender-cross-page-focus")
    check(
      rows()[2] === document.activeElement,
      "ArrowDown crosses displayed page boundary, not Selection",
    );
  return {
    pass: true,
    rows: 4,
    bindings: 4,
    confirmations: c.expected.confirm,
    extraQueries: C.sent.length - C.sentBefore,
  };
}
async function modelControls() {
  const results = [];
  for (let row = 0; row < 4; row++) {
    const c = await ready(classes);
    contexts.push(c);
    c.waits = [];
    c.tap = observePublicCalls(c.n, names);
    const issued = Array(4);
    for (const k of [3, 1, 0, 2])
      issued[k] = c.n.createCandidateAction(c.pages[Math.floor(k / 2)], k % 2);
    bindings(c.tap.records, c.n, c.pages);
    c.n.confirmCandidate(issued[row], c.s);
    activation(c.tap.records, c.n, c.s, c.pages, row, 1, issued);
    selected(c, 1);
    results.push({
      id: "B36-real-original-row-" + row,
      pass: true,
      candidateUI: false,
      pages: 2,
      rows: 4,
      wireQueries: c.queries().length,
    });
  }
  return results;
}
let nativeEvents = [];
function nativePrepare() {
  const b = document.createElement("button");
  b.textContent = "B36 plain native input premise";
  for (const type of ["pointerdown", "pointerup", "click", "keydown", "keyup"])
    b.addEventListener(type, (e) =>
      nativeEvents.push({
        type,
        trusted: e.isTrusted,
        key: e.key ?? null,
        detail: e.detail ?? null,
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
    "one ordinary native activation",
  );
  if (mode === "trusted-click")
    for (const type of ["pointerdown", "pointerup", "click"])
      check(
        events.some((e) => e.type === type && e.trusted),
        "trusted " + type,
      );
  if (mode === "trusted-enter" || mode === "trusted-space")
    check(
      events.some((e) => e.type === "keydown" && e.trusted),
      "trusted keyboard",
    );
  if (mode === "assistive-click") {
    check(
      !events.some((e) => e.type === "pointerdown"),
      "independent AT-shaped click without down",
    );
    equal(events[0].detail, 0, "independent programmatic click detail");
  }
  return { id: "B36-native-" + mode, pass: true, candidateUI: false, events };
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
window.B36 = {
  capable: View !== undefined && View !== null,
  prepare,
  verify,
  verifyKeydown,
  modelControls,
  nativePrepare,
  nativeBegin,
  nativeVerify,
  cleanup,
};
