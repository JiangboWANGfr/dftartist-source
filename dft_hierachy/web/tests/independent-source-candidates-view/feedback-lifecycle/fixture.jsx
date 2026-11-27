import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient } from "@hier/client";
import { SourceNavigationModel, SelectionModel } from "@hier/viewmodel";
import { ready, committed, modelControl } from "./public-model.mjs";
import {
  check,
  equal,
  failure,
  confirmations,
  latestFeedback,
  noGlobal,
} from "./assertions.mjs";
import { observeGlobal } from "./global-events.mjs";
import { bindings } from "../actions/assertions.mjs";
import { observePublicCalls } from "../pagination/public-calls.mjs";
import { observeDom } from "../../independent-source-position-interaction/browser-observation.mjs";
const View = Reflect.get(Views, "SourceCandidatesView"),
  classes = { HierClient, SourceNavigationModel, SelectionModel },
  contexts = [],
  roots = new Set(),
  waits = [],
  caught = [],
  global = observeGlobal();
const host = () => document.getElementById("root"),
  rows = () => [...host().querySelectorAll("li button")],
  enabled = (b) =>
    !b.disabled &&
    b.getAttribute("aria-disabled") !== "true" &&
    !b.closest("[inert]");
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
class Boundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    caught.push(error);
  }
  render() {
    return this.state.failed
      ? React.createElement(
          "p",
          { "data-b43-boundary": "true" },
          "B43 host boundary",
        )
      : this.props.children;
  }
}
function newRoot() {
  const r = createRoot(host());
  roots.add(r);
  return r;
}
function unmount(r) {
  flushSync(() => r.unmount());
  roots.delete(r);
}
async function make() {
  const c = await ready(classes);
  c.label = "B43 candidates " + contexts.length;
  contexts.push(c);
  c.calls = [];
  c.callbackDone = new Promise((resolve) => {
    c.finishCallbackWait = resolve;
  });
  c.callbackThrow = Symbol("B43 raw callback throw");
  c.callback = (value) => {
    c.calls.push(value);
    c.finishCallbackWait();
  };
  c.tap = observePublicCalls(c.n, names);
  c.selectionTap = observePublicCalls(c.s, ["dispose"]);
  return c;
}
function render(c) {
  flushSync(() =>
    c.root.render(
      React.createElement(
        Boundary,
        null,
        React.createElement(View, {
          navigation: c.n,
          selection: c.s,
          ariaLabel: c.label,
          height: 300,
          onCommandError: c.callback,
        }),
      ),
    ),
  );
}
async function bound(c) {
  await dom(
    () =>
      rows().length === 2 &&
      rows().every(enabled) &&
      c.tap.records.filter((r) => r.name === "createCandidateAction").length ===
        2,
  );
  c.issued = bindings(c.tap.records, c.n, c.page);
}
function originalErrors(c, indices) {
  return confirmations(c.tap.records, c.n, c.s, c.page, indices, c.issued);
}
function live(c, indices, errors) {
  committed(c, indices, errors);
  equal(c.selectionTap.records.length, 0, "borrowed Selection not disposed");
  equal(c.n.state.candidates.state.pages[0], c.page, "original page retained");
}
function fresh(c) {
  equal(c.s.current, c.before, "new session selection unchanged");
  equal(c.s.canGoBack, false, "new session no history");
  equal(c.notifications.length, 0, "new session no selection notifications");
  equal(c.calls.length, 0, "new session no old feedback");
  equal(c.sent.length, c.sentBefore, "new session no query/cancel");
  equal(c.n.disposed, false, "new navigation live");
  equal(c.s.disposed, false, "new Selection live");
  equal(c.selectionTap.records.length, 0, "new Selection not disposed");
  bindings(c.tap.records, c.n, c.page);
  equal(c.tap.records.length, 2, "new session bindings only");
}
async function runCase(id) {
  check(["T01", "T02", "T03"].includes(id), "frozen ID");
  const c = await make(),
    other = id === "T02" ? await make() : null;
  c.root = newRoot();
  if (other) other.root = c.root;
  if (id === "T01")
    c.callback = (value) => {
      c.calls.push(value);
      try {
        try {
          unmount(c.root);
        } catch (error) {
          c.transitionFailed = true;
          throw error;
        }
        c.transitionComplete = true;
        throw c.callbackThrow;
      } finally {
        c.finishCallbackWait();
      }
    };
  if (id === "T02")
    c.callback = (value) => {
      c.calls.push(value);
      try {
        try {
          render(other);
        } catch (error) {
          c.transitionFailed = true;
          throw error;
        }
        c.transitionComplete = true;
        throw c.callbackThrow;
      } finally {
        c.finishCallbackWait();
      }
    };
  render(c);
  await bound(c);
  equal(c.calls.length, 0, "no initial feedback");
  noGlobal(global);
  rows()[0].click();
  if (id === "T03") rows()[1].click();
  equal(c.calls.length, 0, "callback not synchronous with click stack");
  const indices = id === "T03" ? [0, 1] : [0],
    errors = originalErrors(c, indices);
  await c.callbackDone;
  if (id !== "T03") {
    check(!c.transitionFailed, "B43 host transition failed before intended X");
    equal(
      c.transitionComplete,
      true,
      "actual transition completed before original X throw",
    );
  }
  if (id === "T01") {
    equal(c.calls.length, 1, "one callback after unmount");
    equal(host().textContent, "", "actual root unmounted");
  }
  if (id === "T02") {
    await bound(other);
    equal(c.calls.length, 1, "old callback invoked once before replacement");
  }
  if (id === "T03")
    await dom(
      () =>
        c.calls.length === 1 &&
        host().textContent.includes("候选操作未正常完成"),
    );
  await checkpoint();
  await checkpoint();
  latestFeedback(c.calls, c.issued[indices.at(-1)], errors.at(-1));
  originalErrors(c, indices);
  live(c, indices, errors);
  if (other) fresh(other);
  equal(
    caught.length,
    0,
    "no callback throw delivered to invalid/new boundary",
  );
  noGlobal(global);
  return {
    id,
    pass: true,
    candidateUI: true,
    syntheticAT: true,
    trustedDevice: false,
    confirmations: indices.length,
    callbackCalls: c.calls.length,
    globalErrors: global.errors.length,
    unhandled: global.rejections.length,
  };
}
async function controls() {
  const out = [await modelControl(classes)];
  for (const mode of ["unmount", "replace"]) {
    const r = newRoot(),
      marker = Symbol("B43 own control throw"),
      events = [];
    let original;
    function Probe({ label, callback }) {
      return React.createElement(
        "button",
        {
          onClick() {
            queueMicrotask(() => {
              try {
                callback();
              } catch (error) {
                original = error;
                events.push("caught");
              } finally {
                events.push("done");
              }
            });
          },
        },
        label,
      );
    }
    const callback = () => {
      events.push("callback");
      if (mode === "unmount") unmount(r);
      else
        flushSync(() =>
          r.render(
            React.createElement(Probe, {
              label: "B43 new ordinary root",
              callback: () => events.push("unexpected new callback"),
            }),
          ),
        );
      events.push("transition");
      throw marker;
    };
    flushSync(() =>
      r.render(
        React.createElement(Probe, {
          label: "B43 ordinary old root",
          callback,
        }),
      ),
    );
    host().querySelector("button").click();
    equal(events.length, 0, "own control callback is queued");
    await checkpoint();
    equal(
      original,
      marker,
      "original callback throw returned to original caller",
    );
    equal(
      events.join(","),
      "callback,transition,caught,done",
      "synchronous transition completes before original throw is caught",
    );
    if (mode === "unmount")
      equal(host().textContent, "", "real root unmounted");
    else {
      check(
        host().textContent.includes("B43 new ordinary root"),
        "real root replaced",
      );
      unmount(r);
    }
    noGlobal(global);
    out.push({
      id: "B43-actual-React-callback-" + mode,
      pass: true,
      candidateUI: false,
    });
  }
  {
    const marker = Error("B43 deliberate native error control"),
      p = global.next("error", (r) => r.value === marker);
    queueMicrotask(() => {
      throw marker;
    });
    const event = await p;
    equal(event?.value, marker, "actual native ErrorEvent original value");
    global.consumeControl(event);
    noGlobal(global);
    out.push({
      id: "B43-native-global-error-negative-control",
      pass: true,
      candidateUI: false,
      witnessedErrors: 1,
    });
  }
  {
    const marker = Error("B43 deliberate unhandled rejection control"),
      promise = Promise.reject(marker),
      p = global.next(
        "rejection",
        (r) => r.promise === promise && r.value === marker,
      );
    const event = await p;
    equal(event?.value, marker, "actual native rejection original value");
    equal(event?.promise, promise, "actual rejected original Promise identity");
    global.consumeControl(event);
    noGlobal(global);
    out.push({
      id: "B43-native-unhandled-rejection-negative-control",
      pass: true,
      candidateUI: false,
      witnessedRejections: 1,
    });
  }
  return out;
}
async function cleanup() {
  const errors = [];
  for (const r of roots)
    try {
      flushSync(() => r.unmount());
    } catch {
      errors.push("React root unmount");
    }
  roots.clear();
  for (const w of waits.splice(0))
    try {
      w.cancel();
    } catch {
      errors.push("DOM wait cancel");
    }
  for (const c of contexts.splice(0)) {
    c.finishCallbackWait();
    for (const tap of [c.tap, c.selectionTap])
      try {
        tap?.dispose();
      } catch {
        errors.push("observer restore");
      }
    try {
      errors.push(...(await c.close()).map((e) => String(e.label)));
    } catch {
      errors.push("owned model cleanup");
    }
  }
  await checkpoint();
  await checkpoint();
  const result = {
    errors: [...errors, ...global.errors.map(() => "unexpected window.error")],
    unhandled: global.rejections.map(() => "unexpected unhandledrejection"),
  };
  global.dispose();
  return result;
}
window.B43 = {
  capable: typeof View === "function",
  runCase,
  controls,
  cleanup,
};
