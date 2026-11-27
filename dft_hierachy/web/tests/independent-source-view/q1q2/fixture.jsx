import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { state, success, badValue } from "../source-data.mjs";
import { cases, documents, expected } from "./cases.mjs";
import { association } from "./association.mjs";
const SourceView = Reflect.get(Views, "SourceView"),
  roots = new Map(),
  caught = [],
  errors = [],
  unhandled = [];
const check = (v, s) => {
  if (!v) throw Error(s);
};
window.addEventListener("error", (e) => errors.push(e.error));
window.addEventListener("unhandledrejection", (e) => unhandled.push(e.reason));
class Boundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(e) {
    caught.push(e);
  }
  render() {
    return this.state.error
      ? React.createElement("p", null, "B host boundary")
      : this.props.children;
  }
}
function Invoke({ value }) {
  return SourceView(value);
}
const host = (slot) => document.getElementById(slot);
function render(s, opts = {}, slot = "A", strict = false) {
  let root = roots.get(slot);
  if (!root) {
    root = createRoot(host(slot));
    roots.set(slot, root);
  }
  const value = { state: s, ariaLabel: "B Q1Q2 " + slot, height: 280, ...opts };
  const tree = React.createElement(
    Boundary,
    null,
    React.createElement(Invoke, { value }),
  );
  flushSync(() =>
    root.render(strict ? React.createElement(StrictMode, null, tree) : tree),
  );
  return value;
}
function inspect(data, slot = "A") {
  const h = host(slot),
    codes = h.querySelectorAll("pre > code");
  check(codes.length === 1, "one actual production pre > code");
  const code = codes[0];
  check(code.textContent === data.content.result.text, "raw source unchanged");
  const relation = association(h, code, expected(data));
  if (slot === "A" && data === documents["nonempty-overflow"]) {
    const b = relation.body,
      old = [b.scrollTop, b.scrollLeft];
    check(
      b.scrollHeight > b.clientHeight && b.scrollWidth > b.clientWidth,
      "actual source body overflows both axes",
    );
    b.scrollTop = 1;
    b.scrollLeft = 1;
    check(
      b.scrollTop > 0 && b.scrollLeft > 0,
      "same associated source body actually scrolls both axes",
    );
    [b.scrollTop, b.scrollLeft] = old;
  }
  return relation;
}
async function runCase(id) {
  const c = cases.find((c) => c.id === id);
  check(c, "known B20 case");
  const focus = document.getElementById("outside");
  focus.focus({ preventScroll: true });
  const results = [];
  if (c.kind === "className") {
    const key = c.input.value,
      opts =
        key === "omitted"
          ? {}
          : { className: key === "empty" ? "" : badValue(key) };
    check(
      Object.hasOwn(opts, "className") === (key !== "omitted"),
      "undefined is an explicit own property, omission not materialized",
    );
    const value = render(state(), opts);
    check(
      Object.hasOwn(value, "className") === (key !== "omitted"),
      "host preserves omission/explicit undefined distinction",
    );
    if (["omitted", "empty"].includes(key))
      check(caught.length === 0, "legal omission/empty accepted");
    else
      check(
        caught.length > 0 && caught.every((e) => e instanceof TypeError),
        "invalid supplied primitive boundary throws synchronous TypeError",
      );
  } else if (c.kind === "association") {
    const d = documents[c.input.name];
    render(success(d));
    results.push(inspect(d));
  } else if (c.kind === "replace") {
    for (const name of [
      "nonempty-short",
      "empty-file",
      "empty-trailing-eof",
      "changed-empty",
      "nonempty-overflow",
    ]) {
      const d = documents[name];
      render(success(d));
      results.push(inspect(d));
    }
  } else if (c.kind === "multi") {
    render(success(documents["empty-file"]));
    render(success(documents["changed-short"]), {}, "B");
    const a = inspect(documents["empty-file"]),
      b = inspect(documents["changed-short"], "B");
    check(
      b.ids.every((id) => !a.ids.includes(id)),
      "instance description IDs disjoint",
    );
    results.push(a, b);
  } else if (c.kind === "strict") {
    const d = documents["empty-eof"];
    render(success(d), {}, "A", true);
    results.push(inspect(d));
  } else throw Error("unhandled B20 case");
  const invalid =
    c.kind === "className" && !["omitted", "empty"].includes(c.input.value);
  if (!invalid) {
    check(caught.length === 0, "no boundary failure");
    check(errors.length === 0, "no window error");
  }
  check(unhandled.length === 0, "no unhandled rejection");
  check(document.activeElement === focus, "no focus stealing");
  return {
    id,
    pass: true,
    relations: results.map((r) => ({
      tag: r.body.tagName,
      ids: r.ids,
      text: r.text,
    })),
  };
}
function controlFixture(pre = false) {
  const h = document.createElement("div");
  h.dataset.bFacility = "NOT SourceView";
  const body = document.createElement(pre ? "pre" : "div");
  body.tabIndex = 0;
  Object.assign(body.style, {
    overflowX: "auto",
    overflowY: "auto",
    width: "80px",
    height: "30px",
  });
  const code = document.createElement("code");
  code.textContent = "B native DOM control";
  if (pre) body.append(code);
  else {
    const p = document.createElement("pre");
    p.append(code);
    body.append(p);
  }
  const desc = document.createElement("span");
  desc.id = "B-control-description";
  desc.textContent = "空范围 3 7";
  h.append(body, desc);
  document.body.append(h);
  body.setAttribute("aria-describedby", desc.id);
  return { h, body, code, desc };
}
function controls() {
  const checks = [
    ["div-body", true, (f) => {}],
    ["pre-is-body", true, (f) => {}, true],
    [
      "display-contents-description",
      true,
      (f) => {
        f.desc.style.display = "contents";
      },
    ],
    [
      "id-list-order",
      true,
      (f) => {
        const extra = document.createElement("span");
        extra.id = "B-extra";
        extra.textContent = "extra";
        f.h.append(extra);
        f.body.setAttribute("aria-describedby", extra.id + " " + f.desc.id);
      },
    ],
    [
      "ancestor-only",
      false,
      (f) => {
        f.body.removeAttribute("aria-describedby");
        f.h.setAttribute("aria-describedby", f.desc.id);
      },
    ],
    [
      "qualifying-ancestor-cannot-substitute",
      false,
      (f) => {
        f.body.removeAttribute("aria-describedby");
        f.h.tabIndex = 0;
        f.h.style.overflow = "auto";
        f.h.setAttribute("aria-describedby", f.desc.id);
      },
    ],
    [
      "unfocusable-pre-only",
      false,
      (f) => {
        f.body.removeAttribute("aria-describedby");
        f.code.parentElement.setAttribute("aria-describedby", f.desc.id);
      },
    ],
    [
      "no-scroll-role",
      false,
      (f) => {
        f.body.style.overflow = "visible";
      },
    ],
    [
      "not-tab-zero",
      false,
      (f) => {
        f.body.tabIndex = -1;
      },
    ],
    [
      "unresolved-id",
      false,
      (f) => {
        f.body.setAttribute("aria-describedby", "B-missing");
      },
    ],
    [
      "hidden-description",
      false,
      (f) => {
        f.desc.style.display = "none";
      },
    ],
    [
      "outside-instance",
      false,
      (f) => {
        document.body.append(f.desc);
      },
    ],
    [
      "inside-code",
      false,
      (f) => {
        f.code.append(f.desc);
      },
    ],
    [
      "duplicate-id",
      false,
      (f) => {
        const d = f.desc.cloneNode(true);
        f.h.append(d);
      },
    ],
  ];
  const results = [];
  for (const [name, accepted, mutate, pre] of checks) {
    const f = controlFixture(pre);
    let failure = null;
    try {
      mutate(f);
      try {
        association(f.h, f.code, { numbers: [3, 7], empty: true });
      } catch (e) {
        failure = String(e);
      }
      check(
        (failure === null) === accepted,
        "B oracle control " +
          name +
          " expected acceptance " +
          accepted +
          " actual " +
          failure,
      );
      results.push({
        name,
        expectedAccepted: accepted,
        accepted: failure === null,
        rejection: failure,
      });
    } finally {
      f.desc.remove();
      f.h.remove();
    }
  }
  return {
    fixtureOnly: true,
    productMounted: false,
    checks: results.length,
    results,
  };
}
function cleanup() {
  const errors = [];
  for (const [slot, root] of roots) {
    try {
      flushSync(() => root.unmount());
      roots.delete(slot);
    } catch (e) {
      errors.push(String(e));
    }
  }
  return { remainingRoots: roots.size, unhandled: unhandled.length, errors };
}
window.B20 = {
  capable: typeof SourceView === "function",
  runCase,
  controls,
  cleanup,
};
