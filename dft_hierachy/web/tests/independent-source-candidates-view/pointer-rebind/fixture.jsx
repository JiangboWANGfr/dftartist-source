import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient } from "@hier/client";
import { SourceNavigationModel, SelectionModel } from "@hier/viewmodel";
import {
  ready,
  advance,
  selected,
  modelPremise,
  names,
} from "./public-model.mjs";
import { confirmation, feedback, rebound } from "./assertions.mjs";
import { pointerInit } from "./input.mjs";
import { cases } from "./cases.mjs";
import { bindings } from "../actions/assertions.mjs";
import { observePublicCalls } from "../pagination/public-calls.mjs";
import { check, equal } from "../pagination/public-model.mjs";
import { observeDom } from "../../independent-source-position-interaction/browser-observation.mjs";
const View = Reflect.get(Views, "SourceCandidatesView"),
  classes = { HierClient, SourceNavigationModel, SelectionModel },
  contexts = [],
  unhandled = [];
let C, root;
window.addEventListener("unhandledrejection", (e) => {
  unhandled.push(e.reason);
  e.preventDefault();
});
const host = () => document.getElementById("root"),
  rows = () => [...host().querySelectorAll("li button")],
  enabled = (b) =>
    !b.disabled &&
    !b.matches(":disabled") &&
    b.getAttribute("aria-disabled") !== "true" &&
    !b.closest("[inert]");
const eventTypes = ["pointerdown", "pointerup", "pointercancel", "click"];
const pointer = (target, type, pointerType) =>
  target.dispatchEvent(new PointerEvent(type, pointerInit(type, pointerType)));
async function dom(predicate) {
  const w = observeDom(host(), predicate);
  C.waits.push(w);
  await w.promise;
}
function render() {
  flushSync(() =>
    root.render(
      React.createElement(View, {
        navigation: C.n,
        selection: C.s,
        ariaLabel: "B37 original action across rebind",
        height: 420,
        onCommandError: C.onError,
      }),
    ),
  );
}
async function prepare(id) {
  C = await ready(classes);
  contexts.push(C);
  C.item = cases.find((c) => c.id === id);
  check(C.item, "frozen ID");
  C.waits = [];
  C.failures = [];
  C.onError = (f) => C.failures.push(f);
  C.tap = observePublicCalls(C.n, names);
  root = createRoot(host());
  render();
  equal(C.tap.records.length, 0, "no signing in commit stack");
  await dom(() => rows().length === 2 && rows().every(enabled));
  C.old = bindings(C.tap.records, C.n, C.page);
  equal(C.sent.length, C.sentBefore, "mount no query");
  C.cut = C.tap.records.length;
  C.inputs = [];
  C.probe = (e) =>
    C.inputs.push({
      type: e.type,
      pointerType: e.pointerType ?? null,
      pointerId: e.pointerId ?? null,
      primary: e.isPrimary ?? null,
      detail: e.detail,
      isTrusted: e.isTrusted,
    });
  for (const t of eventTypes) host().addEventListener(t, C.probe, true);
  if (C.item.input.activation !== "AT-only")
    pointer(rows()[0], "pointerdown", C.item.input.pointerType);
  equal(
    C.inputs.filter((e) => e.type === "pointerdown").length,
    C.item.input.activation === "AT-only" ? 0 : 1,
    "actual down delivered before host transition",
  );
  return { prepared: true };
}
async function transition() {
  await advance(C, C.item.input.transition, async () => {
    await dom(
      () =>
        rows().length === 0 && C.n.state.candidates.state.status === "pending",
    );
    C.removedObserved = true;
  });
  if (C.item.input.transition === "reload-removed")
    equal(
      C.removedObserved,
      true,
      "old rows were absent in actual DOM before host reply",
    );
  await dom(
    () =>
      rows().length === C.pages.length * 2 &&
      rows().every(enabled) &&
      C.tap.records
        .slice(C.cut)
        .filter((r) => r.name === "createCandidateAction").length >= 2,
  );
  C.current = rebound(
    C.tap.records.slice(C.cut),
    C.n,
    C.pages,
    C.old,
    C.item.input.transition,
  );
  C.after = C.n.state;
  C.afterSent = C.sent.length;
  C.bindingCount = C.tap.records.filter(
    (r) => r.name === "createCandidateAction",
  ).length;
  equal(C.failures.length, 0, "no host transition feedback from view");
  check(
    C.hostRecord &&
      C.hostRecord.name ===
        (C.item.input.transition === "append"
          ? "loadMore"
          : "reloadCandidates"),
    "exact explicit host operation",
  );
  return { rebound: true };
}
async function finish() {
  const i = C.item.input,
    b = rows()[0];
  if (i.activation === "cancel-then-AT")
    pointer(b, "pointercancel", i.pointerType);
  if (i.activation === "paired-click") {
    pointer(b, "pointerup", i.pointerType);
    pointer(b, "click", i.pointerType);
  } else b.click();
  await Promise.resolve();
  const action = C.item.expected.action === "current" ? C.current[0] : C.old[0],
    stale = C.item.expected.stale,
    error = confirmation(
      C.tap.records,
      C.n,
      C.s,
      action,
      stale,
      C.item.expected.confirm,
    );
  if (stale)
    await dom(
      () =>
        C.failures.length === 1 &&
        host().textContent.includes("候选操作未正常完成"),
    );
  feedback(C.failures, action, error, stale);
  selected(C, stale || C.item.expected.confirm === 0);
  equal(C.n.state, C.after, "confirmation no navigation publish");
  equal(C.sent.length, C.afterSent, "activation no query");
  equal(
    C.tap.records.filter((r) => r.name === "createCandidateAction").length,
    C.bindingCount,
    "no event-time reissue",
  );
  const other = C.tap.records.filter(
    (r) =>
      r.name !== "createCandidateAction" &&
      r.name !== "confirmCandidate" &&
      r !== C.hostRecord,
  );
  equal(other.length, 0, "no extra view operation");
  if (stale)
    check(
      !host().textContent.includes("未选择"),
      "neutral feedback does not claim selection rollback",
    );
  equal(
    C.inputs.filter((e) => e.type === "click").length,
    1,
    "one actual DOM click",
  );
  return {
    pass: true,
    confirmations: C.item.expected.confirm,
    oldRowRemovalObserved: C.removedObserved ?? false,
    stale,
    originalAction: C.item.expected.action,
    logicalRows: rows().length,
    syntheticDOMNotDeviceE2E: true,
    inputs: C.inputs,
  };
}
async function modelControls() {
  const out = [];
  for (const mode of [
    "same-old",
    "same-current",
    "append-old",
    "reload-removed",
  ])
    out.push(await modelPremise(classes, mode));
  return out;
}
let nativeEvents = [];
function nativePrepare() {
  const b = document.createElement("button");
  b.textContent = "B37 plain native input premise";
  for (const t of eventTypes)
    b.addEventListener(t, (e) =>
      nativeEvents.push({
        type: e.type,
        pointerId: e.pointerId ?? null,
        pointerType: e.pointerType ?? null,
        isPrimary: e.isPrimary ?? null,
        isTrusted: e.isTrusted,
        detail: e.detail,
      }),
    );
  host().append(b);
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
function nativeBegin() {
  nativeEvents = [];
}
function nativeSynthetic(mode) {
  const b = host().querySelector("button");
  if (mode === "AT") {
    b.click();
    return;
  }
  if (mode === "cancel-AT") {
    pointer(b, "pointerdown", "mouse");
    pointer(b, "pointercancel", "mouse");
    b.click();
    return;
  }
  for (const t of ["pointerdown", "pointerup", "click"]) pointer(b, t, mode);
}
function nativeVerify(mode) {
  const e = nativeEvents.slice();
  equal(
    e.filter((x) => x.type === "click").length,
    1,
    "one native/plain synthetic input activation",
  );
  if (mode === "mouse")
    for (const t of ["pointerdown", "pointerup", "click"])
      check(
        e.some((x) => x.type === t && x.isTrusted),
        "trusted mouse " + t,
      );
  else if (mode === "pen" || mode === "touch")
    for (const t of ["pointerdown", "pointerup", "click"])
      check(
        e.some(
          (x) =>
            x.type === t &&
            x.pointerType === mode &&
            x.pointerId === 37 &&
            x.isPrimary &&
            !x.isTrusted,
        ),
        "explicit synthetic pair fields " + t,
      );
  else if (mode === "cancel-AT")
    equal(
      e.map((x) => x.type).join(","),
      "pointerdown,pointercancel,click",
      "cancel then independent AT shape",
    );
  else equal(e.map((x) => x.type).join(","), "click", "AT shape without down");
  return {
    id: "B37-native-" + mode,
    pass: true,
    candidateUI: false,
    events: e,
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
    if (c.probe)
      for (const t of eventTypes) host().removeEventListener(t, c.probe, true);
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
window.B37 = {
  capable: View !== undefined && View !== null,
  prepare,
  transition,
  finish,
  modelControls,
  nativePrepare,
  nativeBegin,
  nativeSynthetic,
  nativeVerify,
  cleanup,
};
