// A facility reproducer: no SourceView import or substitute.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

const host = document.getElementById("host");
const receipts = [];
let inCaptureStack = false;
function capture(event) {
  if (event.type === "keydown" && event.key !== "Enter") return;
  inCaptureStack = true;
  receipts.push({ step: "capture", type: event.type });
  queueMicrotask(() => {
    inCaptureStack = false;
    receipts.push({ step: "capture-microtask", type: event.type });
  });
}
function command(event, kind) {
  receipts.push({
    step: kind,
    type: event.type,
    inCaptureStack,
    eventPhase: event.eventPhase,
    isTrusted: event.isTrusted,
  });
}
const root = createRoot(host);
function Control() {
  const [hint, setHint] = useState(false);
  return (
    <>
      <button
        id="react"
        onDoubleClick={(e) => command(e.nativeEvent, "react-command")}
        onKeyDown={(e) => {
          if (e.key === "Enter") command(e.nativeEvent, "react-command");
        }}
      >
        React input
      </button>
      <button id="toggle" onClick={() => setHint((v) => !v)}>
        Toggle hint
      </button>
      <output id="hint">{hint ? "visible" : ""}</output>
    </>
  );
}
flushSync(() => root.render(<Control />));
for (const type of ["keydown", "dblclick"])
  host.addEventListener(type, capture, true);
const native = document.getElementById("native");
for (const type of ["keydown", "dblclick"]) {
  native.addEventListener(type, capture, true);
  native.addEventListener(type, (e) => {
    if (e.type !== "keydown" || e.key === "Enter") command(e, "native-command");
  });
}
window.controls = {
  receipts,
  toggle() {
    document
      .getElementById("toggle")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return document.getElementById("hint").textContent;
  },
  committed: () => document.getElementById("hint").textContent,
  dispose: () => flushSync(() => root.unmount()),
};
