import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient } from "@hier/client";
import { SourceNavigationModel, SelectionModel } from "@hier/viewmodel";
import { ready, modelControl } from "./public-model.mjs";
import {
  check,
  equal,
  premise,
  sameScroll,
  retained,
  logicalFocus,
} from "./assertions.mjs";
import { observePublicCalls } from "../pagination/public-calls.mjs";
import { observeDom } from "../../independent-source-position-interaction/browser-observation.mjs";
const View = Reflect.get(Views, "SourceCandidatesView"),
  classes = { HierClient, SourceNavigationModel, SelectionModel };
const contexts = [],
  roots = [],
  waiters = [],
  unhandled = [],
  keys = [];
const names = [
  "createCandidateAction",
  "confirmCandidate",
  "loadMore",
  "reloadCandidates",
  "cancelCandidates",
  "dispose",
];
const $ = (id) => document.getElementById(id);
const rows = (id = 0) => [...$("candidate" + id).querySelectorAll("li button")];
const enabled = (b) =>
  !b.disabled &&
  b.getAttribute("aria-disabled") !== "true" &&
  !b.closest("[inert]");
window.addEventListener("unhandledrejection", (e) => {
  unhandled.push(String(e.reason));
  e.preventDefault();
});
window.addEventListener("keydown", (e) =>
  keys.push({ key: e.key, trusted: e.isTrusted }),
);
const settle = () =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
async function dom(id, predicate) {
  const w = observeDom($("candidate" + id), predicate);
  waiters.push(w);
  await w.promise;
  await settle();
}
async function make() {
  const c = await ready(classes);
  contexts.push(c);
  c.failures = [];
  c.onError = (e) => c.failures.push(e);
  c.tap = observePublicCalls(c.n, names);
  c.selectionTap = observePublicCalls(c.s, ["dispose"]);
  return c;
}
function render(c, id = 0) {
  if (!roots[id]) roots[id] = createRoot($("candidate" + id));
  flushSync(() =>
    roots[id].render(
      React.createElement(View, {
        navigation: c.n,
        selection: c.s,
        ariaLabel: "B41 candidates " + id,
        height: 180,
        onCommandError: c.onError,
      }),
    ),
  );
}
function source(c) {
  const r = createRoot($("source"));
  roots[2] = r;
  flushSync(() =>
    r.render(
      React.createElement(Views.SourceView, {
        state: c.n.state.document,
        ariaLabel: "B41 source",
        height: 120,
      }),
    ),
  );
}
function port(id = 0) {
  const row = rows(id)[0],
    host = $("candidate" + id);
  premise(row, "actual candidate row exists");
  let p = row.parentElement;
  const found = [],
    rs = rows(id);
  while (p && p !== host) {
    const style = getComputedStyle(p);
    if (
      p.clientHeight > 0 &&
      p.scrollHeight > p.clientHeight + 1 &&
      /(auto|scroll|hidden)/.test(style.overflowY) &&
      rs.every((r) => p.contains(r))
    ) {
      found.push(p);
    }
    p = p.parentElement;
  }
  premise(
    found.length === 1,
    "unique overflow port containing every candidate row",
  );
  return found[0];
}
function measured(p) {
  return {
    top: p.scrollTop,
    left: p.scrollLeft,
    width: p.clientWidth,
    height: p.clientHeight,
    maxTop: p.scrollHeight - p.clientHeight,
    maxLeft: p.scrollWidth - p.clientWidth,
  };
}
function sourcePorts() {
  return [...$("source").querySelectorAll("*")].filter(
    (p) =>
      p.clientHeight > 0 &&
      (p.scrollHeight > p.clientHeight + 1 ||
        p.scrollWidth > p.clientWidth + 1) &&
      /(auto|scroll|hidden)/.test(getComputedStyle(p).overflow),
  );
}
function scopes(extra = []) {
  return [
    { name: "window", top: scrollY, left: scrollX },
    ...[$("outer"), $("sourceHost"), ...sourcePorts(), ...extra].map(
      (p, i) => ({ name: "scope" + i, top: p.scrollTop, left: p.scrollLeft }),
    ),
  ];
}
function setupScroll() {
  $("outer").scrollTop = 80;
  $("outer").scrollLeft = 30;
  $("sourceHost").scrollTop = 15;
  $("sourceHost").scrollLeft = 12;
  window.scrollTo(20, 60);
  const ports = sourcePorts();
  premise(ports.length > 0, "actual SourceView has overflow");
  for (const p of ports) {
    p.scrollTop = Math.min(23, p.scrollHeight - p.clientHeight);
    p.scrollLeft = Math.min(11, p.scrollWidth - p.clientWidth);
  }
  premise(
    scrollY > 0 &&
      scrollX > 0 &&
      $("outer").scrollTop > 0 &&
      $("outer").scrollLeft > 0,
    "nonzero page/parent margins",
  );
  premise(
    ports.some((p) => p.scrollTop > 0 || p.scrollLeft > 0),
    "nonzero actual SourceView scroll",
  );
}
function focus(index, id = 0) {
  rows(id)[index].focus({ preventScroll: true });
  equal(document.activeElement, rows(id)[index], "host focus setup");
}
function focused(id = 0) {
  return rows(id).indexOf(document.activeElement);
}
function roving(id = 0) {
  const rs = rows(id),
    stops = rs.filter((b) => b.tabIndex === 0);
  equal(stops.length, 1, "exactly one candidate Tab stop");
  check(
    rs.every((b) => b.tabIndex === 0 || b.tabIndex === -1),
    "roving native tabIndex",
  );
  return rs.indexOf(stops[0]);
}
async function visibleStable(id, index) {
  let frame,
    done = false,
    rejecter,
    last,
    count = 0;
  const promise = new Promise((resolve, reject) => {
    rejecter = reject;
    const checkFrame = () => {
      try {
        const p = port(id),
          r = p.getBoundingClientRect(),
          t = rows(id)[index].getBoundingClientRect();
        const visible =
          t.top >= r.top + p.clientTop - 0.5 &&
          t.bottom <= r.top + p.clientTop + p.clientHeight + 0.5;
        const next = measured(p);
        count =
          visible &&
          last &&
          Math.abs(next.top - last.top) <= 0.5 &&
          Math.abs(next.left - last.left) <= 0.5
            ? count + 1
            : 0;
        last = next;
        if (count >= 3) {
          done = true;
          resolve();
          return;
        }
        frame = requestAnimationFrame(checkFrame);
      } catch (error) {
        done = true;
        reject(error);
      }
    };
    frame = requestAnimationFrame(checkFrame);
  });
  waiters.push({
    cancel() {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      rejecter(Error("B41 geometry wait cancelled"));
    },
  });
  await promise;
}
function tuple(c, index) {
  if (index < 0) return null;
  let n = index;
  for (const [p, page] of c.n.state.candidates.state.pages.entries()) {
    if (n < page.result.items.length) return "page" + p + "/index" + n;
    n -= page.result.items.length;
  }
  return null;
}
function containerFocus(id = 0) {
  const active = document.activeElement;
  check(
    $("candidate" + id).contains(active) &&
      !rows(id).includes(active) &&
      !active.matches("button,input,select,textarea,a[href]") &&
      [...$("candidate" + id).querySelectorAll("ul,ol")].some(
        (list) => active === list || active.contains(list),
      ),
    "current list container, not body/external/new row",
  );
}
function live(c, queries = 0) {
  equal(c.s.current, c.before, "selection identity");
  equal(c.s.canGoBack, false, "no history");
  equal(c.n.disposed, false, "borrowed model live");
  equal(c.selectionTap.records.length, 0, "no Selection dispose");
  equal(c.failures.length, 0, "no command failures");
  for (const r of c.tap.records)
    check(
      r.name === "createCandidateAction" || c.hostRecords.includes(r),
      "no component model command " + r.name,
    );
  equal(c.sent.length - c.sentBefore, queries, "host-only query count");
}
function signing(c) {
  return c.tap.records.filter((r) => r.name === "createCandidateAction").length;
}
function association() {
  const hosts = [$("candidate0"), $("candidate1")],
    all = [...document.querySelectorAll("[id]")],
    idMap = new Map();
  for (const e of all) {
    const a = idMap.get(e.id) || [];
    a.push(e);
    idMap.set(e.id, a);
  }
  let references = 0,
    explanations = 0;
  for (const host of hosts) {
    for (const e of host.querySelectorAll("[id]"))
      equal(idMap.get(e.id).length, 1, "unique actual instance ID");
    for (const e of host.querySelectorAll("*"))
      for (const name of [
        "aria-labelledby",
        "aria-describedby",
        "aria-controls",
        "aria-details",
        "aria-errormessage",
        "aria-activedescendant",
        "aria-owns",
      ]) {
        const v = e.getAttribute(name);
        if (!v) continue;
        for (const id of v.trim().split(/\s+/)) {
          const targets = idMap.get(id) || [];
          equal(targets.length, 1, "actual IDREF resolves uniquely");
          check(host.contains(targets[0]), "IDREF local to own instance");
          references++;
        }
      }
    const b = host.querySelectorAll("li button")[39];
    equal(b.getAttribute("aria-disabled"), "true", "legacy row aria-disabled");
    check(
      !b.matches(":disabled") && !b.closest("[inert]"),
      "legacy still natively focusable",
    );
    const texts = [
      b.textContent,
      b.getAttribute("aria-description"),
      ...(b.getAttribute("aria-describedby") || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => (idMap.get(id) || [])[0]?.textContent),
    ];
    check(
      texts.some((t) => t && t.includes("地址类型不可用")),
      "nonempty legacy reason inline or actually associated",
    );
    explanations++;
  }
  return { references, explanations, computedAX: false };
}
let state;
async function prepare(id) {
  check(View, "public candidate capability");
  const c = await make(),
    other = ["F04", "F06"].includes(id) ? await make() : null;
  source(c);
  render(c);
  if (id === "F06") render(other, 1);
  await dom(0, () => rows().length === 40 && enabled(rows()[0]));
  if (id === "F06")
    await dom(1, () => rows(1).length === 40 && enabled(rows(1)[0]));
  state = { id, c, other, signs: signing(c) };
  setupScroll();
  await settle();
  live(c);
  if (other) live(other);
  if (id === "F01") $("before").focus({ preventScroll: true });
  if (id === "F02") {
    focus(18);
    const p = port();
    p.scrollTop = Math.min(
      p.scrollHeight - p.clientHeight,
      rows()[18].offsetTop - p.offsetTop,
    );
    await settle();
    premise(p.scrollTop > 0, "nonzero list offset");
    state.before = measured(p);
    state.logical = tuple(c, 18);
  }
  if (id === "F03") focus(18);
  if (id === "F04") {
    focus(18);
    $("before").focus({ preventScroll: true });
  }
  if (id === "F05") {
    focus(0);
    const p = port();
    p.scrollTop = 0;
    await settle();
    const target = rows()[34].getBoundingClientRect(),
      r = p.getBoundingClientRect(),
      top = r.top + p.clientTop,
      bottom = top + p.clientHeight;
    premise(
      target.top >= bottom && target.height <= p.clientHeight,
      "distant target genuinely clipped and fits",
    );
    premise(top >= 0 && bottom <= innerHeight, "port within page viewport");
    state.beforeScopes = scopes();
    state.target = 34;
  }
  if (id === "F06") {
    focus(0, 1);
    port(1).scrollTop = 0;
  }
  return { id, rows: rows().length };
}
async function stage(name) {
  const { id, c, other } = state;
  if (name === "status")
    return {
      focused: focused(),
      focusedOther: focused(1),
      external: document.activeElement === $("before"),
      legacy:
        focused() === 39 &&
        rows()[39].getAttribute("aria-disabled") === "true" &&
        !rows()[39].matches(":disabled") &&
        !rows()[39].closest("[inert]"),
    };
  if (name === "F02-transition") {
    await c.append();
    await dom(0, () => rows().length === 42 && enabled(rows()[0]));
    logicalFocus(tuple(c, focused()), state.logical);
    retained(state.before, measured(port()));
    const before = measured(port());
    const signs = signing(c);
    render(c);
    await settle();
    logicalFocus(tuple(c, focused()), state.logical);
    retained(before, measured(port()));
    equal(
      signing(c),
      signs,
      "ordinary rerender does not re-sign unchanged state",
    );
    live(c, 1);
    return { pass: true };
  }
  if (name === "F03-transition") {
    await c.reload(async () => {
      await dom(0, () => rows().length === 0);
      containerFocus();
    });
    await dom(0, () => rows().length === 1 && enabled(rows()[0]));
    containerFocus();
    live(c, 1);
    return { pass: true };
  }
  if (name === "F04-transition") {
    await c.append();
    await dom(0, () => rows().length === 42 && enabled(rows()[0]));
    equal(document.activeElement, $("before"), "external focus after append");
    render(other);
    await dom(0, () => rows().length === 40 && enabled(rows()[0]));
    equal(
      document.activeElement,
      $("before"),
      "external focus after model pair switch",
    );
    live(c, 1);
    live(other);
    return { pass: true };
  }
  if (name === "F06-remember") {
    equal(focused(1), 10, "second instance keyboard memory");
    await visibleStable(1, 10);
    state.otherScroll = measured(port(1));
    premise(
      state.otherScroll.top > 0,
      "second instance has nonzero scroll to preserve",
    );
    state.otherTab = roving(1);
    equal(state.otherTab, 10, "second current roving row");
    focus(0);
    port().scrollTop = 0;
    await settle();
    return { pass: true };
  }
  if (name === "finish") {
    await settle();
    if (id === "F01") equal(roving(), 39, "one remembered list Tab stop");
    if (id === "F01") equal(focused(), 39, "Tab reentry remembers legacy row");
    if (id === "F03") equal(focused(), 0, "ArrowDown only now enters new row");
    if (id === "F04") equal(focused(), 0, "new pair starts first roving row");
    if (id === "F05" || id === "F06") {
      await visibleStable(0, 34);
      equal(focused(), 34, "trusted keyboard target");
      const p = port(),
        r = p.getBoundingClientRect(),
        t = rows()[34].getBoundingClientRect();
      check(
        t.top >= r.top + p.clientTop - 0.5 &&
          t.bottom <= r.top + p.clientTop + p.clientHeight + 0.5,
        "target visible within list port",
      );
      check(p.scrollTop > 0, "actual list scroll occurred");
    }
    if (id === "F05") {
      sameScroll(state.beforeScopes, scopes());
      equal(signing(c), state.signs, "focus movement no repeated signing");
    }
    if (id === "F06") {
      retained(state.otherScroll, measured(port(1)));
      equal(roving(1), state.otherTab, "other roving memory unchanged");
      state.association = association();
      live(other);
    }
    live(c, ["F02", "F03", "F04"].includes(id) ? 1 : 0);
    check(
      keys
        .filter((k) => ["Tab", "ArrowDown", "End"].includes(k.key))
        .every((k) => k.trusted),
      "all tested keyboard events trusted",
    );
    return {
      pass: true,
      candidateUI: true,
      keys: keys.length,
      association: state.association ?? null,
    };
  }
  throw Error("unknown stage " + name);
}
async function controls() {
  const out = [];
  for (const mode of ["append", "empty"])
    out.push(await modelControl(classes, mode));
  const c = await ready(classes);
  contexts.push(c);
  source(c);
  setupScroll();
  await settle();
  const before = scopes();
  premise(
    before.some((x) => x.top > 0) && before.some((x) => x.left > 0),
    "real measured two-axis margins",
  );
  out.push({
    id: "B41-actual-SourceView-geometry",
    pass: true,
    candidateUI: false,
    scopes: before,
  });
  const plain = $("plain");
  plain.innerHTML =
    '<div style="height:1600px;width:500px">ordinary measurement control</div>';
  premise(
    plain.scrollHeight > plain.clientHeight,
    "ordinary fixture actual overflow",
  );
  plain.scrollTop = 70;
  await settle();
  equal(plain.scrollTop, 70, "ordinary port moved");
  sameScroll(before, scopes());
  out.push({
    id: "B41-plain-local-scroll-measurement",
    pass: true,
    candidateUI: false,
  });
  const parent = $("outer"),
    old = parent.scrollTop;
  parent.scrollTop = old + 5;
  let rejected = false;
  try {
    sameScroll(before, scopes());
  } catch {
    rejected = true;
  } finally {
    parent.scrollTop = old;
  }
  check(rejected, "measurement catches parent movement");
  sameScroll(before, scopes());
  out.push({
    id: "B41-measurement-negative-control",
    pass: true,
    candidateUI: false,
  });
  return out;
}
async function cleanup() {
  const errors = [];
  for (const w of waiters.splice(0))
    try {
      w.cancel();
    } catch (e) {
      errors.push(String(e));
    }
  for (const r of roots.splice(0))
    if (r)
      try {
        flushSync(() => r.unmount());
      } catch (e) {
        errors.push(String(e));
      }
  for (const c of contexts.splice(0)) {
    for (const tap of [c.tap, c.selectionTap])
      try {
        tap?.dispose();
      } catch (e) {
        errors.push(String(e));
      }
    errors.push(...(await c.close()).map((e) => String(e.label)));
  }
  await settle();
  return { errors, unhandled: [...unhandled] };
}
window.B41 = {
  capable: typeof View === "function",
  prepare,
  stage,
  controls,
  cleanup,
};
