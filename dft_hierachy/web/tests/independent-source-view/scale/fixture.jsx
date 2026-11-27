import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import {
  document as makeDocument,
  success,
  longText,
  point,
} from "../source-data.mjs";
import { association } from "../q1q2/association.mjs";
import { expected } from "../q1q2/cases.mjs";
import { cases } from "./cases.mjs";
const View = Reflect.get(Views, "SourceView"),
  check = (v, m) => {
    if (!v) throw Error(m);
  };
let root;
const errors = [];
window.addEventListener("error", (e) => errors.push(String(e.error)));
window.addEventListener("unhandledrejection", (e) =>
  errors.push(String(e.reason)),
);
function render(data) {
  root ??= createRoot(document.getElementById("slot"));
  flushSync(() =>
    root.render(
      React.createElement(View, {
        state: success(data),
        ariaLabel: "B scaled source",
        height: 280,
      }),
    ),
  );
}
function snapshot() {
  const p = document.getElementById("parent"),
    s = getSelection();
  return {
    page: [scrollX, scrollY],
    parent: [p.scrollLeft, p.scrollTop],
    active: document.activeElement,
    selection: [
      s.anchorNode,
      s.anchorOffset,
      s.focusNode,
      s.focusOffset,
      s.toString(),
    ],
  };
}
function stable(a) {
  const b = snapshot();
  check(
    JSON.stringify(b.page) === JSON.stringify(a.page),
    "page scroll unchanged",
  );
  check(
    JSON.stringify(b.parent) === JSON.stringify(a.parent),
    "parent scroll unchanged",
  );
  check(b.active === a.active, "focus unchanged");
  check(
    b.selection.every((x, i) => x === a.selection[i]),
    "Selection unchanged",
  );
  check(errors.length === 0, "no window/unhandled errors");
}
function bodyAndCode(data) {
  const host = document.getElementById("slot"),
    codes = host.querySelectorAll("pre > code");
  check(codes.length === 1, "one actual source code");
  const code = codes[0];
  check(code.textContent === longText, "raw text unchanged");
  const marks = code.querySelectorAll("mark");
  check(
    marks.length === 1 &&
      marks[0].textContent === longText.slice(point, point + 1),
    "exact mark unchanged",
  );
  return { ...association(host, code, expected(data)), code };
}
function caret(code, offset) {
  const w = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  let n,
    at = 0;
  while ((n = w.nextNode())) {
    if (offset <= at + n.data.length) {
      const r = document.createRange();
      r.setStart(n, offset - at);
      r.collapse(true);
      const box = [...r.getClientRects()].find((b) => b.height > 0);
      check(box, "independent browser caret measurable");
      return box;
    }
    at += n.data.length;
  }
  throw Error("raw DOM offset missing");
}
function metrics(data) {
  const { body, code } = bodyAndCode(data),
    b = body.getBoundingClientRect(),
    r = caret(code, point),
    sx = b.width / body.offsetWidth,
    sy = b.height / body.offsetHeight;
  check(
    body.clientWidth > 0 && body.clientHeight > 0 && sx > 0 && sy > 0,
    "measurable transformed viewport",
  );
  const viewport = {
    left: b.left + body.clientLeft * sx,
    top: b.top + body.clientTop * sy,
    right: b.left + (body.clientLeft + body.clientWidth) * sx,
    bottom: b.top + (body.clientTop + body.clientHeight) * sy,
  };
  return {
    viewport,
    caret: { left: r.left, top: r.top, height: r.height },
    scroll: [body.scrollTop, body.scrollLeft],
    visible:
      r.left >= viewport.left - 2 &&
      r.left <= viewport.right + 2 &&
      r.top >= viewport.top - 2 &&
      r.top < viewport.bottom + 2,
  };
}
function run(id) {
  const c = cases.find((c) => c.id === id);
  check(c, "known B scale case");
  const { scale, phase } = c.input;
  document.getElementById("slot").style.transform = "scale(" + scale + ")";
  const parent = document.getElementById("parent");
  parent.scrollTop = 27;
  scrollTo(0, 100);
  document.getElementById("outside").focus({ preventScroll: true });
  const n = document.getElementById("selection").firstChild,
    r = document.createRange();
  r.setStart(n, 0);
  r.setEnd(n, 3);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
  const before = snapshot();
  let data = makeDocument(longText, point, point + 1);
  render(data);
  if (phase !== "first") {
    const { body } = bodyAndCode(data);
    body.scrollTop = 17;
    body.scrollLeft = 23;
    const user = [body.scrollTop, body.scrollLeft];
    check(user[0] > 0 && user[1] > 0, "both-axis user scroll fixture");
    if (phase === "new-data") data = makeDocument(longText, point, point + 1);
    render(data);
    if (phase === "same-data") {
      check(
        body.scrollTop === user[0] && body.scrollLeft === user[1],
        "same data preserves local user scroll",
      );
      stable(before);
      return { id, pass: true, phase, scale, scroll: user };
    }
  }
  const actual = metrics(data);
  stable(before);
  check(
    actual.visible,
    "exact start outside actual scaled viewport: " + JSON.stringify(actual),
  );
  return { id, pass: true, phase, scale, ...actual };
}
function cleanup() {
  const failures = [];
  try {
    if (root) {
      flushSync(() => root.unmount());
      root = null;
    }
  } catch (e) {
    failures.push(String(e));
  }
  return { remainingRoots: root ? 1 : 0, errors: failures };
}
window.BScale = { capable: typeof View === "function", run, cleanup };
