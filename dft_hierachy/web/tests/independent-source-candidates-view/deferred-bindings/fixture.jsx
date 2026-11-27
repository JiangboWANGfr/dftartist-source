import React, { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient } from "@hier/client";
import { SourceNavigationModel, SelectionModel } from "@hier/viewmodel";
import {
  ready,
  names,
  observePublicCalls,
  reload,
  modelControl,
  equal,
  check,
} from "./public-model.mjs";
import { bindings, quiet, onlyHost } from "./assertions.mjs";
import { cases } from "./cases.mjs";
import { observeDom } from "../../independent-source-position-interaction/browser-observation.mjs";
const View = Reflect.get(Views, "SourceCandidatesView"),
  classes = { HierClient, SourceNavigationModel, SelectionModel },
  contexts = [],
  unhandled = [];
let root, current;
const host = () => document.getElementById("root"),
  rows = () => [...host().querySelectorAll("li button")],
  enabled = (b) =>
    !b.disabled &&
    b.getAttribute("aria-disabled") !== "true" &&
    !b.closest("[inert]");
window.addEventListener("unhandledrejection", (e) => {
  unhandled.push(e.reason);
  e.preventDefault();
});
async function checkpoint() {
  await new Promise((resolve) => {
    const c = new MessageChannel();
    c.port1.onmessage = () => {
      c.port1.close();
      c.port2.close();
      resolve();
    };
    c.port2.postMessage(null);
  });
}
async function dom(c, predicate) {
  const w = observeDom(host(), predicate);
  c.waits.push(w);
  await w.promise;
}
async function make() {
  const c = await ready(classes);
  contexts.push(c);
  c.waits = [];
  c.failures = [];
  c.onError = (f) => c.failures.push(f);
  c.tap = observePublicCalls(c.n, [...names, "dispose"]);
  c.selectionTap = observePublicCalls(c.s, ["dispose"]);
  c.hosts = [];
  return c;
}
function render(c, strict = false) {
  current = c;
  const element = React.createElement(View, {
    navigation: c.n,
    selection: c.s,
    ariaLabel: "B40 deferred original bindings",
    height: 420,
    onCommandError: c.onError,
  });
  flushSync(() =>
    root.render(
      strict ? React.createElement(React.StrictMode, null, element) : element,
    ),
  );
}
function live(c) {
  equal(c.n.disposed, false, "borrowed navigation remains live");
  quiet(c.selectionTap.records, "borrowed Selection disposal");
  equal(c.s.current, c.before, "selection identity unchanged");
  equal(c.s.canGoBack, false, "selection history unchanged");
  equal(c.failures.length, 0, "no failure feedback");
}
async function bound(c, page = c.page) {
  await dom(c, () => rows().length === 2 && rows().every(enabled));
  bindings(c.tap.records, c.n, page);
  onlyHost(c.tap.records, c.hosts);
  live(c);
}
async function runCase(id) {
  check(
    cases.some((c) => c.id === id),
    "frozen ID",
  );
  const c = await make(),
    preparedOther = id === "D04" ? await make() : null;
  root = createRoot(host());
  if (id === "D06") {
    c.notifications = [];
    c.release = c.n.subscribe(() => {
      const state = c.n.state,
        at = c.tap.records.length;
      render(c);
      quiet(
        c.tap.records.slice(at),
        "flushSync within actual navigation notification",
      );
      c.notifications.push(state);
    });
  }
  render(c, id === "D02");
  quiet(c.tap.records, "initial commit stack");
  if (id === "D03") {
    flushSync(() => root.unmount());
    root = null;
    await checkpoint();
    quiet(c.tap.records, "unmounted queued signing");
    equal(host().textContent, "", "unmounted actual DOM");
    live(c);
    equal(c.sent.length, c.sentBefore, "unmounted old model no query");
  } else if (id === "D04") {
    const other = preparedOther;
    render(other);
    quiet(c.tap.records, "old model commit window");
    quiet(other.tap.records, "new model commit window");
    await bound(other);
    await checkpoint();
    quiet(c.tap.records, "old model queued work");
    live(c);
    equal(c.sent.length, c.sentBefore, "old model no query");
    equal(other.sent.length, other.sentBefore, "new model no query");
  } else if (id === "D05") {
    const before = c.page;
    const result = await reload(c, async () => {
      render(c);
      quiet(
        c.tap.records.filter((r) => r.name === "createCandidateAction"),
        "pending invalidates old queued work",
      );
      await checkpoint();
      equal(rows().length, 0, "pending old rows removed before host reply");
      quiet(
        c.tap.records.filter((r) => r.name === "createCandidateAction"),
        "no old signing after checkpoint",
      );
    });
    c.hosts.push(result.host);
    check(result.page !== before, "new original page");
    await bound(c, result.page);
    equal(c.sent.length - c.sentBefore, 1, "only explicit host reload query");
  } else if (id === "D06") {
    await bound(c);
    const cut = c.tap.records.length,
      result = await reload(c);
    c.hosts.push(result.host);
    await dom(
      c,
      () =>
        rows().length === 2 &&
        rows().every(enabled) &&
        c.tap.records
          .slice(cut)
          .some((r) => r.name === "createCandidateAction"),
    );
    bindings(c.tap.records.slice(cut), c.n, result.page);
    onlyHost(c.tap.records, c.hosts);
    check(
      c.notifications.some((s) => s.candidates?.state.status === "success"),
      "actual success notification witnessed",
    );
    equal(c.sent.length - c.sentBefore, 1, "only host reload query");
    live(c);
  } else {
    await bound(c);
    equal(c.sent.length, c.sentBefore, "mount no query");
  }
  return {
    id,
    pass: true,
    candidateUI: true,
    notificationCommits: c.notifications?.length ?? 0,
    selectionUnchanged: true,
  };
}
async function controls() {
  const out = [];
  for (const mode of ["ready", "reload"])
    out.push(await modelControl(classes, mode));
  for (const mode of ["commit", "unmount", "replace"]) {
    const events = [];
    function Probe({ label }) {
      useLayoutEffect(() => {
        events.push("layout:" + label);
        queueMicrotask(() => events.push("micro:" + label));
        return () => events.push("release:" + label);
      }, [label]);
      return React.createElement(
        "button",
        null,
        "B40 plain React ordering " + label,
      );
    }
    const r = createRoot(host());
    try {
      flushSync(() => r.render(React.createElement(Probe, { label: "a" })));
      equal(
        events.join(","),
        "layout:a",
        "real layout before checkpoint, no microtask yet",
      );
      if (mode === "unmount") flushSync(() => r.unmount());
      if (mode === "replace")
        flushSync(() => r.render(React.createElement(Probe, { label: "b" })));
      check(
        !events.some((x) => x.startsWith("micro:")),
        "same stack before any microtask",
      );
      await checkpoint();
      check(
        events.includes("micro:a"),
        "arbitrary queued work survives unmount/replacement unless component invalidates it",
      );
      if (mode === "replace")
        check(events.includes("micro:b"), "second commit microtask visible");
      out.push({
        id: "B40-React-" + mode,
        pass: true,
        candidateUI: false,
        events: events.slice(),
      });
    } finally {
      if (mode !== "unmount") flushSync(() => r.unmount());
    }
  }
  return out;
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
    for (const w of c.waits)
      try {
        w.cancel();
      } catch (e) {
        errors.push("wait:" + String(e));
      }
    try {
      c.release?.();
    } catch (e) {
      errors.push("host-listener:" + String(e));
    }
    for (const tap of [c.selectionTap, c.tap])
      try {
        tap?.dispose();
      } catch (e) {
        errors.push("observer:" + String(e));
      }
    try {
      for (const e of await c.close()) errors.push(e.label);
    } catch (e) {
      errors.push("context:" + String(e));
    }
  }
  current = null;
  return { errors, unhandled: unhandled.map(String) };
}
window.B40 = {
  capable: View !== undefined && View !== null,
  runCase,
  controls,
  cleanup,
};
