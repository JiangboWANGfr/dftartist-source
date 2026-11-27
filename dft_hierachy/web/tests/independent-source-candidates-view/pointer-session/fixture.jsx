import React, { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient } from "@hier/client";
import { SourceNavigationModel, SelectionModel } from "@hier/viewmodel";
import { cases } from "./cases.mjs";
import { cases as c100Cases } from "./c100-cases.mjs";
import { group, preserved, modelPremise, names } from "./public-model.mjs";
import { noConfirm, currentConfirm, unchanged } from "./assertions.mjs";
import { bindings } from "../actions/assertions.mjs";
import { observePublicCalls } from "../pagination/public-calls.mjs";
import { check, equal } from "../pagination/public-model.mjs";
import { pointerInit } from "../pointer-rebind/input.mjs";
import { observeDom } from "../../independent-source-position-interaction/browser-observation.mjs";
import { observeGlobal } from "../feedback-lifecycle/global-events.mjs";
const View = Reflect.get(Views, "SourceCandidatesView"),
  classes = { HierClient, SourceNavigationModel, SelectionModel },
  globals = observeGlobal(),
  roots = new Set(),
  groups = [],
  taps = [],
  waits = [],
  eventReleases = [];
const host = () => document.getElementById("root"),
  rows = () => [...host().querySelectorAll("li button")],
  enabled = (b) =>
    !b.disabled &&
    b.getAttribute("aria-disabled") !== "true" &&
    !b.closest("[inert]");
const checkpoint = () =>
  new Promise((resolve) => {
    const c = new MessageChannel();
    c.port1.onmessage = () => {
      c.port1.close();
      c.port2.close();
      resolve();
    };
    c.port2.postMessage(null);
  });
async function dom(predicate) {
  const w = observeDom(host(), predicate);
  waits.push(w);
  await w.promise;
}
function newRoot() {
  const r = createRoot(host());
  roots.add(r);
  return r;
}
function pointer(b, type) {
  b.dispatchEvent(new PointerEvent(type, pointerInit(type, "mouse")));
}
function events() {
  const records = [],
    listener = (e) =>
      records.push({
        type: e.type,
        pointerId: e.pointerId ?? null,
        pointerType: e.pointerType ?? null,
        detail: e.detail,
        isPrimary: e.isPrimary ?? null,
        isTrusted: e.isTrusted,
      });
  for (const type of ["pointerdown", "pointerup", "click"])
    host().addEventListener(type, listener, true);
  eventReleases.push(() => {
    for (const type of ["pointerdown", "pointerup", "click"])
      host().removeEventListener(type, listener, true);
  });
  return records;
}
function allRecords(tapByNav) {
  return [...tapByNav.values()].flatMap((t) => t.records);
}
function noExtra(g, tapByNav) {
  equal(g.old.n.state, g.oldState, "old navigation state preserved");
  equal(
    g.current.n.state,
    g.currentState,
    "current navigation state preserved",
  );
  g.contexts.forEach((c, i) =>
    equal(c.sent.length, g.sent[i], "no wire request"),
  );
  for (const r of allRecords(tapByNav))
    check(
      r.name === "createCandidateAction" || r.name === "confirmCandidate",
      "no pagination/cancel/reload public operation",
    );
  check(
    !g.old.n.disposed &&
      !g.current.n.disposed &&
      !g.old.s.disposed &&
      !g.current.s.disposed,
    "borrowed models still live",
  );
}
async function runCase(id) {
  const c = [...cases, ...c100Cases].find((c) => c.id === id);
  check(c, "frozen ID");
  const g = await group(classes, c.mode);
  groups.push(g);
  const tapByNav = new Map();
  for (const n of new Set([g.old.n, g.current.n])) {
    const tap = observePublicCalls(n, names);
    tapByNav.set(n, tap);
    taps.push(tap);
  }
  const root = newRoot(),
    failures = [],
    onError = (f) => failures.push(f),
    input = events();
  function render(pair) {
    flushSync(() =>
      root.render(
        React.createElement(View, {
          navigation: pair.n,
          selection: pair.s,
          ariaLabel: "B47 pointer session",
          height: 320,
          onCommandError: onError,
        }),
      ),
    );
  }
  render(g.old);
  await dom(() => rows().length === 2 && rows().every(enabled));
  const oldActions = bindings(
    tapByNav.get(g.old.n).records,
    g.old.n,
    g.old.page,
  );
  preserved(g);
  equal(failures.length, 0, "initial binding no feedback");
  const cuts = new Map([...tapByNav].map(([n, t]) => [n, t.records.length]));
  pointer(rows()[0], "pointerdown");
  noConfirm(allRecords(tapByNav));
  equal(input.length, 1, "old row actual down");
  equal(input[0].pointerId, 37, "original pointer id");
  render(g.current);
  await dom(
    () =>
      rows().length === 2 &&
      rows().every(enabled) &&
      tapByNav
        .get(g.current.n)
        .records.slice(cuts.get(g.current.n))
        .filter((r) => r.name === "createCandidateAction").length >= 2,
  );
  const currentActions = bindings(
    tapByNav.get(g.current.n).records.slice(cuts.get(g.current.n)),
    g.current.n,
    g.current.page,
  );
  if (c.mode === "pair")
    equal(
      tapByNav.get(g.old.n).records.length,
      cuts.get(g.old.n),
      "old model no new calls after session switch",
    );
  else {
    equal(g.current.n, g.old.n, "only Selection changed");
    equal(g.current.page, g.old.page, "same original page");
    equal(g.currentState, g.oldState, "same original state");
  }
  preserved(g);
  equal(failures.length, 0, "switch no feedback");
  noConfirm(allRecords(tapByNav));
  const bindingCount = allRecords(tapByNav).filter(
    (r) => r.name === "createCandidateAction",
  ).length;
  if (c.outsideRelease) pointer(document.body, "pointerup");
  else {
    pointer(rows()[0], "pointerup");
    pointer(rows()[0], "click");
  }
  await checkpoint();
  await checkpoint();
  noConfirm(allRecords(tapByNav));
  preserved(g);
  equal(failures.length, 0, "paired obsolete gesture no failure feedback");
  equal(
    input.length,
    c.outsideRelease ? 1 : 3,
    "exact old gesture events delivered to list",
  );
  if (!c.outsideRelease) {
    for (const e of input) {
      equal(e.pointerId, 37, "paired pointer id");
      equal(e.pointerType, "mouse", "paired pointer type");
      equal(e.isPrimary, true, "primary pair");
    }
    equal(input[2].detail, 1, "paired click is not AT");
  }
  noExtra(g, tapByNav);
  const pairWitness = {
    confirmations: 0,
    feedback: 0,
    oldSelectionUnchanged: true,
    currentSelectionUnchanged: true,
  };
  rows()[0].click();
  await checkpoint();
  await checkpoint();
  if (c.outsideRelease) {
    const actual = allRecords(tapByNav).filter(
      (r) => r.name === "confirmCandidate",
    ).length;
    equal(
      actual,
      1,
      "C-100 first independent activation: confirmations=" +
        actual +
        "; enabled=" +
        rows().every(enabled) +
        "; feedback=" +
        failures.length +
        "; selectionUnchanged=" +
        (g.current.s.current === g.currentSelection.current),
    );
  }
  currentConfirm(
    allRecords(tapByNav),
    g.current.n,
    g.current.s,
    currentActions[0],
  );
  unchanged(g.old.s, g.oldSelection);
  equal(g.current.s.current.origin, "source", "AT selection origin");
  equal(g.current.s.current.items.length, 1, "AT one selection item");
  equal(
    g.current.s.current.items[0].ref,
    g.current.page.result.items[0].ref,
    "AT original target",
  );
  equal(failures.length, 0, "independent AT no feedback");
  equal(
    allRecords(tapByNav).filter((r) => r.name === "createCandidateAction")
      .length,
    bindingCount,
    "no event-time signing",
  );
  noExtra(g, tapByNav);
  equal(input.length, c.outsideRelease ? 2 : 4, "independent AT one event");
  equal(input[c.outsideRelease ? 1 : 3].type, "click", "AT click without down");
  equal(input[c.outsideRelease ? 1 : 3].detail, 0, "AT shape");
  return {
    pass: true,
    mode: c.mode,
    pairWitness,
    ATConfirmations: 1,
    originalSelectionOnlyState: c.mode === "selection",
    oldActionHeld: Boolean(oldActions[0]),
    syntheticGestureNotDeviceE2E: true,
    inputs: input,
  };
}
async function nativeControl() {
  let mounts = 0,
    unmounts = 0;
  const input = events(),
    root = newRoot();
  function Plain({ label }) {
    useLayoutEffect(() => {
      mounts++;
      return () => {
        unmounts++;
      };
    }, []);
    return React.createElement("button", null, label);
  }
  flushSync(() =>
    root.render(React.createElement(Plain, { label: "old plain control" })),
  );
  pointer(host().querySelector("button"), "pointerdown");
  flushSync(() =>
    root.render(React.createElement(Plain, { label: "new plain control" })),
  );
  equal(mounts, 1, "same public component position mounted once");
  equal(unmounts, 0, "host did not recreate control component");
  const b = host().querySelector("button");
  equal(b.textContent, "new plain control", "new prop committed");
  pointer(b, "pointerup");
  pointer(b, "click");
  b.click();
  equal(
    input.map((e) => e.type).join(","),
    "pointerdown,pointerup,click,click",
    "plain pairing then AT",
  );
  for (const e of input.slice(0, 3)) {
    equal(e.pointerId, 37, "same pointer");
    equal(e.pointerType, "mouse", "same pointer type");
  }
  equal(input[2].detail, 1, "paired detail");
  equal(input[3].detail, 0, "AT detail");
  return {
    id: "B47-ordinary-React-input",
    pass: true,
    candidateUI: false,
    mounts,
    unmounts,
    events: input,
  };
}
async function controls() {
  const results = [];
  for (const mode of ["pair", "selection"])
    results.push(await modelPremise(classes, mode));
  results.push(await nativeControl());
  return results;
}
async function cleanup() {
  const errors = [];
  for (const r of roots)
    try {
      flushSync(() => r.unmount());
    } catch (e) {
      errors.push("unmount:" + String(e));
    }
  roots.clear();
  for (const release of eventReleases.splice(0))
    try {
      release();
    } catch (e) {
      errors.push("event:" + String(e));
    }
  for (const w of waits.splice(0))
    try {
      w.cancel();
    } catch (e) {
      errors.push("wait:" + String(e));
    }
  for (const t of taps.splice(0))
    try {
      t.dispose();
    } catch (e) {
      errors.push("observer:" + String(e));
    }
  for (const g of groups.splice(0))
    try {
      errors.push(...(await g.dispose()));
    } catch (e) {
      errors.push("group:" + String(e));
    }
  await checkpoint();
  await checkpoint();
  const result = {
    errors,
    globalErrors: globals.errors.map((e) => String(e.value)),
    unhandled: globals.rejections.map((e) => String(e.value)),
  };
  globals.dispose();
  return result;
}
window.B47 = {
  capable: typeof View === "function",
  runCase,
  controls,
  cleanup,
};
