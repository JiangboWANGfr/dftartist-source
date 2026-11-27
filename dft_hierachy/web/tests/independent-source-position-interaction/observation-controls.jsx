// Generic native/React controls ONLY. No @hier imports or SourceView substitute.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { installEventStackProbe, observeDom } from "./browser-observation.mjs";
const probe = installEventStackProbe(window);
const arena = document.getElementById("arena");
const rows = [],
  traces = [],
  commits = [],
  pending = [],
  channels = new Set();
let legacy = false,
  action,
  root,
  setShown;
const check = (value, message) => {
  if (!value) throw Error(message);
};
const valid = (event) =>
  event.type === "dblclick" ||
  (event.type === "keydown" && event.key === "Enter" && event.altKey);
for (const type of ["dblclick", "keydown"])
  arena.addEventListener(
    type,
    (event) => {
      if (!valid(event)) return;
      legacy = true;
      traces.push({
        action: action?.id,
        at: "capture",
        type,
        trusted: event.isTrusted,
      });
      queueMicrotask(() => {
        legacy = false;
        traces.push({ action: action?.id, at: "capture-microtask", type });
      });
    },
    true,
  );
function handler(input) {
  const event = input.nativeEvent ?? input;
  if (!valid(event)) return;
  const current = action;
  check(current, "prepared action");
  const sample = (delay) => {
    rows.push({
      id: current.id,
      host: current.host,
      event: event.type,
      source: current.source,
      delay,
      legacy,
      active: probe.active,
      sameEvent: probe.event === event,
      observed: probe.active && probe.event === event,
      depth: probe.depth,
      phase: event.eventPhase,
      trusted: event.isTrusted,
    });
    document.getElementById("progress").textContent = String(rows.length);
  };
  sample("sync");
  queueMicrotask(() => sample("queueMicrotask"));
  Promise.resolve().then(() => sample("Promise.then"));
  const channel = new MessageChannel();
  channels.add(channel);
  channel.port1.onmessage = () => {
    channel.port1.close();
    channel.port2.close();
    channels.delete(channel);
    sample("MessageChannel");
  };
  channel.port2.postMessage(0);
}
const native = document.getElementById("native");
native.addEventListener("dblclick", handler);
native.addEventListener("keydown", handler);
const idl = document.getElementById("idl");
idl.ondblclick = handler;
idl.onkeydown = handler;
check(
  idl.ondblclick === handler && idl.onkeydown === handler,
  "IDL getter identity",
);
function App() {
  const [shown, change] = useState(false);
  setShown = change;
  return (
    <>
      <button id="react" onDoubleClick={handler} onKeyDown={handler}>
        React host
      </button>
      <div id="commit-root">
        <button id="toggle" onClick={() => change((v) => !v)}>
          Toggle message
        </button>
        {shown && <output id="commit-message">Committed message</output>}
      </div>
    </>
  );
}
root = createRoot(document.getElementById("react-root"));
flushSync(() => root.render(<App />));
function prepare(host, event, source = "trusted") {
  action = { id: source + ":" + host + ":" + event, host, event, source };
  legacy = false;
  check(document.getElementById(host), "known host");
  return { id: action.id, before: rows.length };
}
function synthetic(host, event) {
  const target = document.getElementById(host);
  const value =
    event === "dblclick"
      ? new MouseEvent(event, { bubbles: true, cancelable: true })
      : new KeyboardEvent(event, {
          key: "Enter",
          altKey: true,
          bubbles: true,
          cancelable: true,
        });
  target.dispatchEvent(value);
}
function commit(expected) {
  const host = document.getElementById("commit-root");
  const present = () => Boolean(document.getElementById("commit-message"));
  check(present() !== expected, "commit starts in the opposite DOM state");
  const wait = observeDom(host, () => present() === expected);
  pending.push(wait);
  const row = {
    expected,
    before: present(),
    immediate: null,
    after: null,
    done: false,
  };
  commits.push(row);
  document
    .getElementById("toggle")
    .dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  row.immediate = present();
  wait.promise.then(
    () => {
      row.after = present();
      row.done = true;
    },
    (error) => {
      row.error = String(error);
      row.done = true;
    },
  );
}
async function transparency() {
  const tests = [];
  const target = document.createElement("button");
  arena.append(target);
  const fire = () =>
    target.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
    );
  let calls = 0,
    receiver;
  function fn() {
    calls++;
    receiver = this;
  }
  const reads = { capture: 0, once: 0, passive: 0, signal: 0 };
  const options = Object.fromEntries(
    Object.keys(reads).map((key) => [key, undefined]),
  );
  for (const key of Object.keys(reads))
    Object.defineProperty(options, key, {
      get() {
        reads[key]++;
        return key === "signal" ? undefined : false;
      },
    });
  target.addEventListener("dblclick", fn, options);
  target.addEventListener("dblclick", fn);
  fire();
  check(calls === 1 && receiver === target, "duplicate/this");
  check(
    Object.values(reads).every((n) => n === 1),
    "caller option getters read once",
  );
  target.removeEventListener("dblclick", fn);
  fire();
  check(calls === 1, "remove original");
  tests.push("function-this/remove/duplicate/options-getters");
  const listener = {
    value: 0,
    handleEvent() {
      this.value++;
    },
  };
  target.addEventListener("dblclick", listener, { once: true });
  fire();
  fire();
  check(listener.value === 1, "object handleEvent and once");
  tests.push("object-handleEvent/once");
  const controller = new AbortController();
  target.addEventListener("dblclick", fn, { signal: controller.signal });
  controller.abort();
  fire();
  check(calls === 1, "aborted listener removed");
  tests.push("AbortSignal");
  target.addEventListener("dblclick", (event) => event.preventDefault(), {
    once: true,
    passive: true,
  });
  check(fire() === true, "passive prevents no default");
  tests.push("passive");
  function property() {
    receiver = this;
    return false;
  }
  target.ondblclick = property;
  check(target.ondblclick === property, "IDL getter preserves original");
  check(fire() === false && receiver === target, "IDL this/return false");
  target.ondblclick = null;
  check(target.ondblclick === null, "IDL null removal");
  tests.push("IDL-getter/this/return-false/null");
  // observeDom immediate, cancellation and thrown predicate all release observers.
  const immediate = observeDom(target, () => true);
  await immediate.promise;
  const cancelled = observeDom(target, () => false);
  const reason = { B: "cancelled" };
  const rejected = cancelled.promise.then(
    () => false,
    (e) => e === reason,
  );
  cancelled.cancel(reason);
  check(await rejected, "DOM cancel raw reason");
  const thrown = { B: "predicate throw" };
  const invalid = observeDom(target, () => {
    throw thrown;
  });
  check(
    await invalid.promise.then(
      () => false,
      (e) => e === thrown,
    ),
    "DOM predicate failure",
  );
  const undefinedThrow = observeDom(target, () => {
    throw undefined;
  });
  check(
    await undefinedThrow.promise.then(
      () => false,
      (e) => e === undefined,
    ),
    "DOM undefined predicate failure",
  );
  tests.push("DOM-immediate/cancel/throw");
  target.remove();
  return tests;
}
async function finish() {
  const tests = await transparency();
  flushSync(() => root.unmount());
  for (const wait of pending) wait.cancel();
  for (const channel of channels) {
    channel.port1.close();
    channel.port2.close();
  }
  const target = document.createElement("button");
  let calls = 0;
  const listener = () => calls++;
  target.addEventListener("dblclick", listener);
  target.onkeydown = listener;
  probe.dispose();
  check(
    !probe.active && probe.event === null && probe.listeners === 0,
    "probe disposed",
  );
  target.removeEventListener("dblclick", listener);
  target.dispatchEvent(new MouseEvent("dblclick"));
  check(calls === 0, "remove original works after dispose migration");
  check(target.onkeydown === listener, "IDL getter works after dispose");
  target.dispatchEvent(new KeyboardEvent("keydown"));
  check(calls === 1, "IDL original still runs after dispose");
  target.onkeydown = null;
  probe.dispose();
  tests.push("dispose/migration/idempotence");
  return {
    rows,
    traces,
    commits,
    transparency: tests,
    sourceViewMounted: false,
    cleanup: {
      channels: channels.size,
      probeActive: probe.active,
      probeListeners: probe.listeners,
    },
  };
}
window.BObservation = {
  prepare,
  synthetic,
  commit,
  finish,
  snapshot: () => ({ rows, commits }),
  sourceViewMounted: false,
};
