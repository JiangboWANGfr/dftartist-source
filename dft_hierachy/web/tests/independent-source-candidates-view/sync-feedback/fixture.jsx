import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient } from "@hier/client";
import { SourceNavigationModel, SelectionModel } from "@hier/viewmodel";
import { ready, committed, modelControl } from "./public-model.mjs";
import { check, equal, failure, aggregate, suppressed } from "./assertions.mjs";
import { bindings } from "../actions/assertions.mjs";
import { observePublicCalls } from "../pagination/public-calls.mjs";
import { observeDom } from "../../independent-source-position-interaction/browser-observation.mjs";
import { observe } from "./revision-c98/global-channels.mjs";
const View = Reflect.get(Views, "SourceCandidatesView"),
  classes = { HierClient, SourceNavigationModel, SelectionModel };
const contexts = [],
  waits = [],
  roots = new Set();
const globals = observe();
const host = () => document.getElementById("root"),
  rows = () => [...host().querySelectorAll("li button")];
const names = [
  "createCandidateAction",
  "confirmCandidate",
  "loadMore",
  "reloadCandidates",
  "cancelCandidates",
  "dispose",
];
const checkpoint = () =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
async function dom(predicate) {
  const w = observeDom(host(), predicate);
  waits.push(w);
  await w.promise;
}
class Boundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    globals.captureBoundary(error);
    this.props.caught.push(error);
  }
  render() {
    return this.state.failed
      ? React.createElement(
          "p",
          { "data-b42-boundary": "true" },
          "B42 actual host boundary",
        )
      : this.props.children;
  }
}
function newRoot() {
  const r = createRoot(host());
  roots.add(r);
  return r;
}
async function make() {
  const c = await ready(classes);
  contexts.push(c);
  c.oldCalls = [];
  c.newCalls = [];
  c.caught = [];
  c.callbackThrow = Symbol("B42 raw callback throw");
  c.oldCallback = (value) => {
    c.oldCalls.push(value);
    throw c.callbackThrow;
  };
  c.newCallback = (value) => {
    c.newCalls.push(value);
  };
  c.tap = observePublicCalls(c.n, names);
  c.selectionTap = observePublicCalls(c.s, ["dispose"]);
  return c;
}
function render(c, callback) {
  flushSync(() =>
    c.root.render(
      React.createElement(
        Boundary,
        { caught: c.caught },
        React.createElement(View, {
          navigation: c.n,
          selection: c.s,
          ariaLabel: "B42 synchronous feedback",
          height: 300,
          onCommandError: callback,
        }),
      ),
    ),
  );
}
function originalConfirmation(c) {
  const records = c.tap.records.filter((r) => r.name === "confirmCandidate");
  equal(records.length, 1, "exact one original confirmation");
  const r = records[0];
  equal(r.receiver, c.n, "original navigation receiver");
  equal(r.args.length, 2, "original confirmation arity");
  equal(r.args[0], c.issued[0], "original prebound action");
  equal(r.args[1], c.s, "original Selection argument");
  equal(r.status, "thrown", "original synchronous throw");
  bindings(c.tap.records, c.n, c.page);
  equal(c.tap.records.length, 3, "two bindings plus one confirm only");
  return r.error;
}
function live(c, error) {
  committed(c, error);
  equal(c.selectionTap.records.length, 0, "UI does not dispose Selection");
  equal(c.sent.length, c.sentBefore, "no extra query/cancel/wire operation");
  equal(
    c.n.state.candidates.state.pages[0],
    c.page,
    "original candidate page retained",
  );
}
async function runCase(id) {
  check(id === "S01" || id === "S02", "frozen ID");
  const c = await make();
  c.root = newRoot();
  render(c, c.oldCallback);
  await dom(
    () =>
      rows().length === 2 &&
      rows().every(
        (b) =>
          !b.disabled &&
          b.getAttribute("aria-disabled") !== "true" &&
          !b.closest("[inert]"),
      ),
  );
  c.issued = bindings(c.tap.records, c.n, c.page);
  rows()[0].focus({ preventScroll: true });
  equal(document.activeElement, rows()[0], "original logical row focused");
  // Both actions below happen inside one evaluate/call stack. No Promise/await
  // is interposed between the actual DOM click and callback replacement.
  rows()[0].click();
  const error = originalConfirmation(c);
  equal(c.oldCalls.length, 0, "feedback is not synchronous");
  if (id === "S02") render(c, c.newCallback);
  if (id === "S01") {
    await dom(
      () =>
        c.caught.length > 0 &&
        host().querySelector("[data-b42-boundary]") !== null,
    );
    await checkpoint();
    equal(c.oldCalls.length, 1, "one captured callback");
    equal(c.newCalls.length, 0, "no unrelated callback");
    failure(c.oldCalls[0], c.issued[0], error);
    equal(c.caught.length, 1, "one boundary capture");
    aggregate(c.caught[0], error, c.callbackThrow);
    // Permission is the actual caught and validated original wrapper identity,
    // never a message/type match. No original event is removed or suppressed.
    globals.allowBoundary(c.caught[0]);
  } else {
    await checkpoint();
    suppressed(c.oldCalls, c.newCalls);
    equal(c.caught.length, 0, "no render throw into new feedback session");
    equal(
      rows().indexOf(document.activeElement),
      0,
      "callback change preserves current logical focus",
    );
  }
  originalConfirmation(c);
  live(c, error);
  globals.assertQuiet();
  return {
    id,
    pass: true,
    candidateUI: true,
    syntheticAT: true,
    trustedDevice: false,
    confirmations: 1,
    callbackCalls: c.oldCalls.length,
    boundaryCaptures: c.caught.length,
  };
}
async function controls() {
  const out = [];
  for (const n of [1, 2]) out.push(await modelControl(classes, n));
  {
    const caught = [],
      e = {},
      x = Symbol("ordinary callback throw"),
      error = new AggregateError([e, x]),
      r = newRoot();
    function Thrower() {
      throw error;
    }
    flushSync(() =>
      r.render(
        React.createElement(
          Boundary,
          { caught },
          React.createElement("span", null, "B42 ordinary boundary premise"),
        ),
      ),
    );
    queueMicrotask(() =>
      flushSync(() =>
        r.render(
          React.createElement(
            Boundary,
            { caught },
            React.createElement(Thrower),
          ),
        ),
      ),
    );
    await dom(
      () =>
        caught.length > 0 &&
        host().querySelector("[data-b42-boundary]") !== null,
    );
    equal(caught.length, 1, "ordinary actual React boundary caught once");
    aggregate(caught[0], e, x);
    globals.allowBoundary(caught[0]);
    out.push({
      id: "B42-actual-React-boundary-order",
      pass: true,
      candidateUI: false,
    });
    flushSync(() => r.unmount());
    roots.delete(r);
  }
  {
    const r = newRoot(),
      events = [];
    let current;
    function Probe({ token }) {
      current = token;
      return React.createElement(
        "button",
        {
          onClick() {
            const original = token;
            events.push("click:" + original);
            queueMicrotask(() =>
              events.push(
                "micro:" +
                  original +
                  ":" +
                  (current === original ? "active" : "suppressed"),
              ),
            );
          },
        },
        "B42 ordinary DOM callback epoch",
      );
    }
    flushSync(() => r.render(React.createElement(Probe, { token: "old" })));
    host().querySelector("button").click();
    flushSync(() => r.render(React.createElement(Probe, { token: "new" })));
    equal(
      events.join(","),
      "click:old",
      "no microtask between DOM click and replacement",
    );
    await checkpoint();
    equal(
      events.join(","),
      "click:old,micro:old:suppressed",
      "ordinary same-stack epoch control",
    );
    out.push({
      id: "B42-actual-React-same-stack-replacement",
      pass: true,
      candidateUI: false,
    });
    flushSync(() => r.unmount());
    roots.delete(r);
  }
  return out;
}
async function cleanup() {
  const errors = [];
  for (const r of roots)
    try {
      flushSync(() => r.unmount());
    } catch (error) {
      errors.push(String(error));
    }
  roots.clear();
  for (const w of waits.splice(0))
    try {
      w.cancel();
    } catch (error) {
      errors.push(String(error));
    }
  for (const c of contexts.splice(0)) {
    for (const tap of [c.tap, c.selectionTap])
      try {
        tap?.dispose();
      } catch (error) {
        errors.push(String(error));
      }
    errors.push(...(await c.close()).map((e) => String(e.label)));
  }
  await checkpoint();
  await checkpoint();
  const channels = globals.result();
  globals.dispose();
  return { errors, ...channels };
}
window.B42 = {
  capable: typeof View === "function",
  runCase,
  controls,
  cleanup,
};
