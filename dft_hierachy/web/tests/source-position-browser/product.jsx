// A supplemental regressions. B's frozen fixture/expectations remain unchanged.
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { SourceView } from "@hier/views";
import { installEventStackProbe } from "../independent-source-position-interaction/browser-observation.mjs";
import {
  document as dto,
  success,
  longText,
  point,
} from "../independent-source-view/source-data.mjs";

const host = document.getElementById("host");
const nativeAdd = EventTarget.prototype.addEventListener;
const nativeRemove = EventTarget.prototype.removeEventListener;
// Observe the listener invocation itself, before React registers its listeners.
// eventPhase can stay nonzero during a delayed microtask; it is diagnostic only.
const eventStack = installEventStackProbe(window);
let originalEvent = null;
const captureInput = (event) => {
  originalEvent = event;
};
for (const type of ["dblclick", "keydown"])
  host.addEventListener(type, captureInput, true);
const root = createRoot(host);
const source = dto(longText, point, point + 1);
const calls = [],
  failures = [];
let fail = false;
let callbackThrows = false;
const boundaryErrors = [];
class Boundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    boundaryErrors.push(error);
  }
  render() {
    return this.state.failed ? (
      <div>A error boundary</div>
    ) : (
      this.props.children
    );
  }
}
window.addEventListener("error", (event) => {
  if (event.error instanceof AggregateError) event.preventDefault();
});
const config = {
  locate(document, offset) {
    const event = eventStack.event;
    calls.push({
      sameDocument: document === source,
      offset,
      inListenerStack: eventStack.active,
      sameEvent: event !== null && event === originalEvent,
      isTrusted: event?.isTrusted ?? false,
      eventPhase: event?.eventPhase ?? 0,
      type: event?.type ?? null,
    });
    return fail ? Promise.reject("A command error") : Promise.resolve();
  },
  onError: (f) => {
    failures.push(f);
    if (callbackThrows) {
      queueMicrotask(() => window.product.missingMouse());
      throw "A callback error";
    }
  },
};
const render = () =>
  flushSync(() =>
    root.render(
      <Boundary>
        <SourceView
          state={success(source)}
          ariaLabel="A source position"
          height={260}
          positionQuery={config}
        />
      </Boundary>,
    ),
  );
render();
const code = () => host.querySelector("code"),
  body = () => host.querySelector("pre");
function endpoint(offset) {
  const walk = document.createTreeWalker(code(), NodeFilter.SHOW_TEXT);
  for (let node; (node = walk.nextNode());) {
    if (offset <= node.data.length) return [node, offset];
    offset -= node.data.length;
  }
  throw Error("A endpoint out of range");
}
function key() {
  body().focus();
  const selection = document.getSelection();
  selection.setBaseAndExtent(...endpoint(point + 1), ...endpoint(point));
}
function geometry() {
  const b = body(),
    r = b.getBoundingClientRect();
  return {
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    top: b.scrollTop,
    left: b.scrollLeft,
  };
}
function offset(node, local) {
  const walk = document.createTreeWalker(code(), NodeFilter.SHOW_TEXT);
  let total = 0;
  for (let n; (n = walk.nextNode());) {
    if (n === node) return total + local;
    total += n.data.length;
  }
  throw Error("A trusted caret expected Text endpoint");
}
window.product = {
  calls,
  key,
  fail: (value) => {
    fail = value;
  },
  geometry,
  text: () => code().textContent,
  hints: () =>
    [...host.querySelectorAll("[role=status]")]
      .map((n) => n.textContent)
      .join(""),
  reverseOffset: point,
  pointer(scale) {
    host.style.transformOrigin = "top left";
    host.style.transform = `scale(${scale})`;
    const range = document.createRange();
    range.setStart(...endpoint(point));
    range.setEnd(...endpoint(point + 1));
    const r = range.getBoundingClientRect(),
      x = r.left + 1,
      y = r.top + r.height / 2;
    const caret = document.caretPositionFromPoint(x, y);
    return {
      x,
      y,
      offset: offset(caret.offsetNode, caret.offset),
      geometry: geometry(),
    };
  },
  resetScale() {
    host.style.transform = "";
  },
  missingMouse() {
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "caretRangeFromPoint", {
      configurable: true,
      value: undefined,
    });
    code().dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, button: 0 }),
    );
  },
  clearByKey() {
    key();
    body().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  },
  mutateAndQuery() {
    const n = document.createTextNode("foreign");
    code().append(n);
    const s = document.getSelection();
    s.setBaseAndExtent(n, 0, n, 0);
    body().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    n.remove();
  },
  rejectAndShowMouse() {
    fail = true;
    window.product.clearByKey();
    window.product.missingMouse();
  },
  callbackErrorWithMouse() {
    callbackThrows = true;
    fail = true;
    window.product.clearByKey();
  },
  boundaryErrors: () => boundaryErrors.map((e) => e.errors),
  dispose() {
    try {
      flushSync(() => root.unmount());
    } finally {
      for (const type of ["dblclick", "keydown"])
        host.removeEventListener(type, captureInput, true);
      originalEvent = null;
      eventStack.dispose();
    }
    return {
      active: eventStack.active,
      depth: eventStack.depth,
      listeners: eventStack.listeners,
      restored:
        EventTarget.prototype.addEventListener === nativeAdd &&
        EventTarget.prototype.removeEventListener === nativeRemove,
    };
  },
};
