import React, { Suspense, useLayoutEffect, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient } from "@hier/client";
import { SourceNavigationModel, SelectionModel } from "@hier/viewmodel";
import { ready, modelControl } from "./public-model.mjs";
import { beforeCommit, afterCommit, unchanged } from "./assertions.mjs";
import { gate } from "./gate.mjs";
import { check, equal } from "../pagination/public-model.mjs";
import { observeGlobal } from "../feedback-lifecycle/global-events.mjs";
import { observeDom } from "../../independent-source-position-interaction/browser-observation.mjs";
const View = Reflect.get(Views, "SourceCandidatesView"),
  classes = { HierClient, SourceNavigationModel, SelectionModel };
const globals = observeGlobal(),
  roots = new Set(),
  contexts = [],
  gates = [],
  waits = [];
const host = () => document.getElementById("root"),
  rows = () => [...host().querySelectorAll("li button")];
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
function newGate() {
  const g = gate();
  gates.push(g);
  return g;
}
async function make() {
  const c = await ready(classes);
  contexts.push(c);
  return c;
}
function AfterCandidate({ c }) {
  c.trace.push("after-candidate-render");
  useLayoutEffect(() => {
    c.trace.push("primary-layout");
    c.commitSnapshots.push({ state: c.n.state, commands: [...c.tap.records] });
  }, [c]);
  return React.createElement("span", {
    "data-b44-primary": "true",
    hidden: true,
  });
}
function Block({ c, g }) {
  c.trace.push("gate-read");
  g.read();
  return null;
}
function render(r, c, g, component = View) {
  flushSync(() =>
    r.render(
      React.createElement(
        Suspense,
        {
          fallback: React.createElement(
            "p",
            { "data-b44-fallback": "true" },
            "B44 suspended primary",
          ),
        },
        React.createElement(component, {
          navigation: c.n,
          selection: c.s,
          ariaLabel: "B44 uncommitted render",
          height: 300,
          onCommandError: (f) => c.feedback.push(f),
        }),
        // AFTER the actual candidate element in the SAME primary subtree. This
        // witness must render before the trailing gate throws; outer wrappers alone
        // or a gate before the candidate would not establish an attempted UI render.
        React.createElement(AfterCandidate, { c }),
        React.createElement(Block, { c, g }),
      ),
    ),
  );
  // This check is AFTER the complete flushSync call returns but BEFORE this
  // host stack yields, including any synchronously flushed passive effects.
  equal(c.tap.records.length, 0, "full flushSync call returns before signing");
}
function suspended(c, g) {
  check(
    host().querySelector("[data-b44-fallback]") !== null,
    "actual fallback committed",
  );
  equal(
    host().querySelector("[data-b44-primary]"),
    null,
    "primary marker not committed",
  );
  check(
    c.trace.indexOf("after-candidate-render") >= 0,
    "candidate traversal reached following sibling",
  );
  check(
    c.trace.indexOf("gate-read") > c.trace.indexOf("after-candidate-render"),
    "trailing gate follows actual candidate traversal",
  );
  check(g.reads > 0 && !g.open, "host gate is actually pending");
  beforeCommit(c);
}
function globalQuiet() {
  equal(globals.errors.length, 0, "no unexpected native error");
  equal(globals.rejections.length, 0, "no unexpected native rejection");
}
async function runCase(id) {
  check(["U01", "U02", "U03"].includes(id), "frozen ID");
  const c = await make(),
    next = id === "U02" ? await make() : null;
  // Both models and every host load/locate are ready BEFORE any UI render.
  const r = newRoot(),
    g = newGate();
  render(r, c, g);
  suspended(c, g);
  await checkpoint();
  suspended(c, g);
  if (id === "U01") {
    flushSync(() => r.unmount());
    roots.delete(r);
    g.release();
    await checkpoint();
    await checkpoint();
    beforeCommit(c);
  } else {
    const active = next ?? c;
    if (next) {
      const open = newGate();
      open.release();
      render(r, next, open);
    } else {
      g.release(); // open=true BEFORE settling; do not yield to an automatic retry.
      render(r, c, g); // explicit same-stack retry with the SAME original models/state.
    }
    await dom(
      () =>
        host().querySelector("[data-b44-primary]") !== null &&
        rows().length === 2 &&
        rows().every(
          (b) =>
            !b.disabled &&
            b.getAttribute("aria-disabled") !== "true" &&
            !b.closest("[inert]"),
        ),
    );
    await checkpoint();
    afterCommit(active);
    // Releasing an abandoned old gate cannot resurrect old-model binding work.
    if (next) {
      g.release();
      await checkpoint();
      beforeCommit(c);
      afterCommit(next);
    }
    unchanged(active);
  }
  globalQuiet();
  return {
    id,
    pass: true,
    candidateUI: true,
    uncommittedAttemptWitnessed: true,
    primaryCommits:
      c.commitSnapshots.length + (next?.commitSnapshots.length ?? 0),
    oldCommands: c.tap.records.length,
    newCommands: next?.tap.records.length ?? null,
  };
}
async function controls() {
  const out = [await modelControl(classes)];
  // This is a plain React render/commit-order experiment, not a fake candidate
  // view: no Navigation methods or candidate tuple logic are implemented here.
  function Plain() {
    return React.createElement("span", null, "B44 ordinary primary");
  }
  for (const id of ["abandon", "replace", "resume"]) {
    const r = newRoot(),
      g = newGate(),
      a = {
        trace: [],
        commitSnapshots: [],
        tap: { records: [] },
        n: { state: {} },
      },
      b = {
        trace: [],
        commitSnapshots: [],
        tap: { records: [] },
        n: { state: {} },
      };
    render(r, a, g, Plain);
    check(
      a.trace.includes("after-candidate-render"),
      "plain primary actually rendered",
    );
    equal(
      a.commitSnapshots.length,
      0,
      "ordinary suspended primary has no layout commit",
    );
    check(
      host().querySelector("[data-b44-fallback]"),
      "ordinary actual fallback",
    );
    await checkpoint();
    equal(a.commitSnapshots.length, 0, "no late premature layout");
    if (id === "abandon") {
      flushSync(() => r.unmount());
      roots.delete(r);
      g.release();
    } else if (id === "replace") {
      const open = newGate();
      open.release();
      render(r, b, open, Plain);
      g.release();
    } else {
      g.release();
      render(r, a, g, Plain);
    }
    if (id !== "abandon")
      await dom(() => host().querySelector("[data-b44-primary]") !== null);
    await checkpoint();
    equal(
      a.commitSnapshots.length,
      id === "resume" ? 1 : 0,
      "old primary commit count",
    );
    equal(
      b.commitSnapshots.length,
      id === "replace" ? 1 : 0,
      "new primary commit count",
    );
    if (roots.has(r)) {
      flushSync(() => r.unmount());
      roots.delete(r);
    }
    out.push({
      id: "B44-ordinary-React-Suspense-" + id,
      pass: true,
      candidateUI: false,
    });
  }
  {
    const r = newRoot(),
      g = newGate(),
      c = {
        trace: [],
        commitSnapshots: [],
        tap: { records: [] },
        n: { state: {} },
      };
    function PassiveProbe() {
      useEffect(() => {
        c.tap.records.push({ name: "deliberate ordinary passive operation" });
      }, []);
      return React.createElement("span", null, "ordinary passive negative");
    }
    g.release();
    let caught;
    try {
      render(r, c, g, PassiveProbe);
    } catch (e) {
      caught = e;
    }
    equal(
      c.tap.records.length,
      1,
      "ordinary passive effect actually flushed before return",
    );
    check(
      caught instanceof Error && caught.message.includes("full flushSync call"),
      "whole-stack observer rejects passive effect, not merely layout witness",
    );
    flushSync(() => r.unmount());
    roots.delete(r);
    out.push({
      id: "B44-ordinary-React-passive-command-negative",
      pass: true,
      candidateUI: false,
      witnessed: 1,
    });
  }
  globalQuiet();
  return out;
}
async function cleanup() {
  const errors = [];
  for (const r of roots)
    try {
      flushSync(() => r.unmount());
    } catch (e) {
      errors.push(String(e));
    }
  roots.clear();
  for (const g of gates.splice(0)) g.release();
  for (const w of waits.splice(0))
    try {
      w.cancel();
    } catch (e) {
      errors.push(String(e));
    }
  for (const c of contexts.splice(0)) {
    for (const tap of [c.tap, c.subscribeTap, c.selectionTap])
      try {
        tap.dispose();
      } catch (e) {
        errors.push(String(e));
      }
    try {
      errors.push(...(await c.close()).map((e) => String(e.label)));
    } catch (e) {
      errors.push(String(e));
    }
  }
  await checkpoint();
  await checkpoint();
  const out = {
    errors,
    globalErrors: globals.errors.map((e) => String(e.value)),
    unhandled: globals.rejections.map((e) => String(e.value)),
  };
  globals.dispose();
  return out;
}
window.B44 = {
  capable: typeof View === "function",
  runCase,
  controls,
  cleanup,
};
