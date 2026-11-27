// Independent B host. Product View is imported, never implemented here.
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient, HierError } from "@hier/client";
import { InstancePropertiesModel, SelectionModel } from "@hier/viewmodel";
import {
  context,
  check,
  eq,
  json,
  target,
  instance,
  ports,
  params,
} from "./public-model.mjs";
import { other } from "./input.mjs";
import { invalid } from "./cases.mjs";
import { CoreWire } from "./core-wire.mjs";
const View = Reflect.get(Views, "PropertiesPanel"),
  D = document,
  deps = { HierClient, InstancePropertiesModel, SelectionModel };
const contexts = [],
  roots = new Map(),
  caught = [],
  globalErrors = [],
  unhandled = [];
let C,
  verifyNative,
  betweenNative,
  allowBoundary = false;
window.addEventListener("error", (e) => globalErrors.push(e.error));
window.addEventListener("unhandledrejection", (e) => {
  unhandled.push(e.reason);
  e.preventDefault();
});
const turn = () =>
  new Promise((resolve) => {
    const m = new MessageChannel();
    m.port1.onmessage = () => {
      m.port1.close();
      m.port2.close();
      resolve();
    };
    m.port2.postMessage(0);
  });
async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  flushSync(() => {});
  await turn();
  flushSync(() => {});
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
    return this.state.failed ? (
      <b data-boundary="true">B boundary</b>
    ) : (
      this.props.children
    );
  }
}
async function fresh(options) {
  const c = await context(deps, options);
  contexts.push(c);
  c.failures = [];
  c.callback = (e) =>
    c.failures.push({ failure: e, inEvent: c.inEvent === true });
  return c;
}
function mount(extra = {}, strict = false, slot = "A", c = C) {
  const props = {
    properties: c.m,
    selection: c.s,
    ariaLabel: "B 属性 " + slot,
    height: 160,
    onCommandError: c.callback,
    ...extra,
  };
  c.props = props;
  let child = (
    <Boundary>
      <View {...props} />
    </Boundary>
  );
  if (strict) child = <StrictMode>{child}</StrictMode>;
  if (!roots.has(slot)) roots.set(slot, createRoot(D.getElementById(slot)));
  flushSync(() => roots.get(slot).render(child));
  return props;
}
function unmount(slot = "A") {
  const r = roots.get(slot);
  if (r) {
    flushSync(() => r.unmount());
    roots.delete(slot);
  }
}
const region = (slot = "A") =>
  D.getElementById(slot).querySelector(
    '[role="region"],section[aria-label],section[aria-labelledby]',
  );
const text = (slot = "A") => region(slot)?.textContent ?? "";
function has(value, slot = "A") {
  check(
    text(slot).includes(String(value)),
    "visible original text: " + String(value),
  );
}
function button(label, slot = "A") {
  const list = [...region(slot).querySelectorAll("button")].filter(
    (b) =>
      b.textContent.includes(label) ||
      b.getAttribute("aria-label")?.includes(label),
  );
  eq(list.length, 1, "one native button " + label);
  return list[0];
}
function portButton(index = 0) {
  const ts = [...region().querySelectorAll("table")],
    t = ts.find((t) => t.textContent.includes(ports()[0].name));
  check(t, "port table");
  const rs = [...t.querySelectorAll("tbody tr")];
  eq(rs.length, ports().length, "all duplicate-name port rows");
  const bs = [...rs[index].querySelectorAll("button")];
  eq(bs.length, 1, "one port selection button in source row");
  return bs[0];
}
function command(name) {
  const list = C.calls.filter((x) => x.name === name);
  eq(list.length, 1, "one call " + name);
  if (name === "reload" || name === "cancel")
    json(list[0].args, [], "operation has no synthetic arguments");
  return list[0];
}
function reset() {
  C.calls.length = 0;
  C.failures.length = 0;
}
function click(b) {
  C.inEvent = true;
  try {
    b.click();
  } finally {
    C.inEvent = false;
  }
}
function selected(ref) {
  json(C.s.current.items, [{ ref }], "original bare ref, no bits/side");
  eq(C.s.current.origin, "props", "props origin");
  eq(C.s.current.snapshotId, C.m.snapshotId, "same snapshot");
  const call = command("select");
  json(
    call.args,
    [{ snapshotId: C.m.snapshotId, origin: "props", items: [{ ref }] }],
    "original one selection request",
  );
}
function cleanPassive(before) {
  eq(C.calls.length, 0, "no implicit public command");
  eq(C.queries().length, before, "no implicit query");
}
async function ready(values) {
  await C.load(target, values);
  mount();
  await settle();
  reset();
}
async function failLoad() {
  const t = await C.begin();
  C.fail(t.q);
  await t.p.catch(() => {});
  await settle();
}
async function pending() {
  const t = await C.begin();
  mount();
  await settle();
  reset();
  return t;
}
function oldState() {
  return {
    current: C.s.current,
    state: C.m.state,
    queries: C.queries().length,
    back: C.s.canGoBack,
    forward: C.s.canGoForward,
  };
}
function unchanged(o) {
  eq(C.s.current, o.current, "selection identity preserved");
  eq(C.m.state, o.state, "property state identity preserved");
  eq(C.queries().length, o.queries, "queries preserved");
  eq(C.s.canGoBack, o.back, "back preserved");
  eq(C.s.canGoForward, o.forward, "forward preserved");
  eq(C.calls.length, 0, "zero command");
}
async function rejection(call) {
  check(call.returned instanceof Promise, "original promise returned");
  const e = await call.returned.then(
    () => {
      throw Error("expected rejection");
    },
    (e) => e,
  );
  await settle();
  return e;
}
async function failedReload() {
  click(button("刷新"));
  const call = command("reload"),
    q = await C.next("inst.get");
  C.fail(q);
  const e = await rejection(call);
  return { call, e };
}
function callbackFailure(e, name = "reload", ref) {
  eq(C.failures.length, 1, "one callback");
  const f = C.failures[0];
  eq(f.inEvent, false, "callback outside synchronous event stack");
  eq(f.failure.command, name, "source command");
  eq(f.failure.target, target, "action-start target");
  eq(f.failure.error, e, "original rejection identity");
  if (name === "select") eq(f.failure.ref, ref, "original selected ref");
  else eq(Object.hasOwn(f.failure, "ref"), false, "no synthetic ref");
}
async function successReload(call, ref = target) {
  const q = await C.next("inst.get");
  await C.finish({ q, p: call.returned, ref });
  await settle();
}
async function generic(id) {
  if (id === "P-CORE-vertical") {
    const opened = await fetch("/core/open", { method: "POST" });
    check(opened.ok, "own Core bridge open");
    const { id: coreId } = await opened.json();
    C = await fresh({ wire: new CoreWire(coreId) });
    let indexed;
    const indexReady = new Promise((resolve) => {
      indexed = resolve;
    });
    const off = C.client.onIndexReady(indexed);
    C.restores.push(off);
    let reply = await C.client.resolvePath("b_tree_top/plain");
    if (reply.completeness.status === "partial") {
      await indexReady;
      reply = await C.client.resolvePath("b_tree_top/plain");
    }
    eq(reply.completeness.status, "complete", "real complete target");
    eq(reply.result.length, 1, "one fixture instance");
    const ref = reply.result[0];
    await C.hold(C.m.load(ref));
    const data = C.m.state.data;
    eq(data.instance.result.name, "plain", "independent SV instance");
    json(
      data.ports.result.map((p) => [p.name, p.width]),
      [
        ["d", 1],
        ["y", 1],
      ],
      "independent SV port facts",
    );
    mount();
    await settle();
    reset();
    has("plain");
    for (const p of data.ports.result) has(p.name);
    const rows = [...region().querySelectorAll("tbody tr")],
      row = rows.find((r) =>
        [...r.querySelectorAll("td")].some((td) => td.textContent === "d"),
      );
    check(row, "real Core port row");
    const bs = row.querySelectorAll("button");
    eq(bs.length, 1, "one source port button");
    const b = bs[0],
      r = b.getBoundingClientRect();
    verifyNative = async () => {
      await settle();
      selected(data.ports.result[0].ref);
      command("select");
      return { pass: true };
    };
    return {
      native: { kind: "click", x: r.x + r.width / 2, y: r.y + r.height / 2 },
    };
  }
  if (id.startsWith("P-INVALID-")) {
    allowBoundary = true;
    const entry = invalid.find((x) => "P-INVALID-" + x[0] === id),
      [, key, value] = entry;
    let v = value;
    if (key === "properties") {
      if (value === "fake")
        v = { state: C.m.state, snapshotId: C.m.snapshotId, disposed: false };
      else {
        C.m.dispose();
        v = C.m;
      }
    }
    if (key === "selection") {
      if (value === "fake")
        v = {
          current: C.s.current,
          snapshotId: C.m.snapshotId,
          disposed: false,
        };
      else if (value === "disposed") {
        C.s.dispose();
        v = C.s;
      } else {
        const c = await fresh(
          value === "unbound" ? { unbound: true } : { snapshotId: "B54/other" },
        );
        v = c.s;
      }
    }
    C.calls.length = 0;
    mount({ [key]: v });
    await settle();
    check(
      caught.length > 0 && caught.at(-1) instanceof TypeError,
      "host boundary original TypeError",
    );
    eq(C.calls.length, 0, "reject before command");
    eq(C.stats.properties.adds, 0, "reject before properties subscription");
    eq(C.stats.selection.adds, 0, "reject before selection subscription");
    return;
  }
  if (id === "P-OPTIONAL-undefined") {
    mount({ className: undefined, onCommandError: undefined });
    await settle();
    check(region(), "optional undefined legal");
    cleanPassive(0);
    return;
  }
  if (id.startsWith("P-STATE-")) {
    const s = id.slice("P-STATE-".length);
    if (s === "success") await C.load();
    else if (s === "pending") await C.begin();
    else if (s === "failed") await failLoad();
    else if (s === "cancelled") {
      await C.begin();
      await C.m.cancel();
    }
    mount();
    await settle();
    reset();
    eq(C.m.state.status, s, "real state");
    const labels = {
      idle: "尚未指定实例",
      pending: "加载中",
      failed: "加载失败",
      cancelled: "已取消",
    };
    if (s !== "success") has(labels[s]);
    else {
      has(instance().name);
      button("刷新");
      button("选择实例");
    }
    if (s === "idle")
      eq(
        region().querySelectorAll("button").length,
        0,
        "idle no query buttons",
      );
    if (s === "pending") {
      eq(region().querySelectorAll("button").length, 1, "pending only cancel");
      button("取消");
      check(
        region().getAttribute("aria-busy") === "true" ||
          region().querySelector('[aria-busy="true"]'),
        "busy region",
      );
      check(!text().includes(instance().name), "no old success");
    }
    if (["failed", "cancelled"].includes(s)) {
      has(C.m.state.error.code);
      has(C.m.state.error.message);
      button("重试");
    }
    return;
  }
  if (id === "P-FIELD-safe-empty") {
    await ready({ portValues: [], paramValues: [] });
    has("无端口");
    has("无参数");
    await C.m.clear();
    await C.load();
    await settle();
    has(params()[3].name);
    has(params()[3].value);
    eq(region().querySelectorAll("img,script").length, 0, "no innerHTML");
    eq(window.B54_XSS, undefined, "text is not executable");
    return;
  }
  if (id === "P-FIELD-diagnostic") {
    const t = await C.begin();
    let reads = 0;
    const data = {};
    Object.defineProperty(data, "bad", {
      enumerable: true,
      get() {
        reads++;
        throw undefined;
      },
    });
    C.wire.close(
      new HierError(
        "transport_closed",
        "transport",
        "B54 transport raw diagnostic",
        data,
      ),
    );
    await t.p.catch(() => {});
    check(C.m.state.error.dataIssue, "real diagnostic issue");
    const before = reads;
    mount();
    await settle();
    has(C.m.state.error.code);
    has(C.m.state.error.message);
    check(/不完整|incomplete/.test(text()), "diagnostic issue displayed");
    eq(reads, before, "L7 no second raw-data read");
    return;
  }
  if (id.startsWith("P-FIELD-")) {
    await ready();
    const s = id.slice("P-FIELD-".length);
    if (s === "instance") {
      for (const v of [
        instance().name,
        instance().pathText,
        instance().defName,
        instance().childCount,
      ])
        has(v);
      check(/module|模块/.test(text()), "instance kind");
      check(/false|否/.test(text()), "false not absent");
    }
    if (s === "ports") {
      const b = portButton(0);
      check(b, "source port button");
      const table = b.closest("table"),
        rows = [...table.querySelectorAll("tbody tr")];
      for (let i = 0; i < ports().length; i++)
        check(
          rows[i].textContent.includes(ports()[i].name),
          "original port order",
        );
      for (const v of ["logic [7:0]", "B54_bus", "slave", "未知", "未提供"])
        has(v);
      check(/false|否/.test(rows[0].textContent), "signed false present");
      check(rows[1].textContent.includes("0"), "zero width retained");
      for (const v of ["0", "7", "5", "2"])
        check(rows[0].textContent.includes(v), "original dimension bound " + v);
      check(
        /packed|打包|压缩/.test(rows[0].textContent) &&
          /unpacked|非打包|非压缩/.test(rows[0].textContent),
        "dimension packing labels",
      );
    }
    if (s === "params") {
      const tables = [...region().querySelectorAll("table")],
        t = tables.find((t) => t.textContent.includes(params()[0].value));
      check(t, "parameter table");
      const rs = [...t.querySelectorAll("tbody tr")];
      eq(rs.length, params().length, "all duplicate params");
      for (let i = 0; i < params().length; i++) {
        check(
          rs[i].textContent.includes(params()[i].value),
          "verbatim value/order",
        );
        eq(
          rs[i].querySelectorAll("button").length,
          0,
          "parameters not selectable",
        );
      }
      click(rs[0]);
      await settle();
      eq(C.calls.length, 0, "plain parameter text zero command");
    }
    return;
  }
  if (id.startsWith("P-ACTION-")) {
    const action = id.slice("P-ACTION-".length);
    if (action === "cancel") {
      const t = await pending();
      click(button("取消"));
      command("cancel");
      eq(C.calls.length, 1, "only cancel");
      await command("cancel").returned;
      await t.p.catch(() => {});
      eq(C.m.state.status, "cancelled", "actual cancelled");
      return;
    }
    if (action.startsWith("retry")) {
      if (action === "retry-failed") await failLoad();
      else {
        await C.begin();
        await C.m.cancel();
      }
      mount();
      await settle();
      reset();
      click(button("重试"));
      const c = command("reload");
      eq(C.calls.length, 1, "only reload");
      await successReload(c);
      return;
    }
    await ready();
    if (action === "reload") {
      click(button("刷新"));
      const c = command("reload");
      eq(C.calls.length, 1, "only reload");
      await successReload(c);
    } else {
      const ref = action === "select-port" ? ports()[1].ref : target;
      click(action === "select-port" ? portButton(1) : button("选择实例"));
      command("select");
      eq(C.calls.length, 1, "only select");
      selected(ref);
      eq(C.queries().length, 3, "selection not queries");
    }
    return;
  }
  if (id.startsWith("P-NATIVE-")) {
    await ready();
    const kind = id.slice("P-NATIVE-".length),
      before = oldState(),
      b = button("选择实例");
    b.focus();
    verifyNative = async () => {
      await settle();
      if (kind.includes("right")) unchanged(before);
      else {
        command("select");
        eq(C.calls.length, 1, "one native activation");
        selected(target);
      }
      return { pass: true };
    };
    const r = b.getBoundingClientRect();
    return { native: { kind, x: r.x + r.width / 2, y: r.y + r.height / 2 } };
  }
  if (id === "P-SELECTION-mark") {
    await C.load();
    const value = {
      snapshotId: C.m.snapshotId,
      origin: "external",
      items: [
        { ref: ports()[0].ref, bits: { lsb: 0, width: 0 }, side: "inside" },
        { ref: target },
        { def: instance().def },
      ],
    };
    C.s.select(value);
    const current = C.s.current,
      b = C.s.canGoBack;
    reset();
    mount();
    await settle();
    has("已选中");
    eq(C.s.current, current, "same original multi/bits/side");
    eq(C.s.canGoBack, b, "no selection history mutation");
    cleanPassive(3);
    return;
  }
  if (id === "P-SELECTION-port") {
    await ready();
    C.s.select({
      snapshotId: C.m.snapshotId,
      origin: "external",
      items: [
        { ref: ports()[1].ref, bits: { lsb: 0, width: 0 }, side: "outside" },
      ],
    });
    await settle();
    reset();
    click(portButton(1));
    selected(ports()[1].ref);
    command("select");
    return;
  }
  if (id === "P-SELECTION-passive") {
    mount();
    for (const items of [
      [{ def: instance().def }],
      [{ ref: ports()[0].ref }],
      [{ ref: target }, { ref: other }],
    ]) {
      C.s.select({ snapshotId: C.m.snapshotId, origin: "external", items });
      await settle();
    }
    eq(C.m.state.status, "idle", "no automatic target");
    eq(C.queries().length, 0, "no query");
    eq(
      C.calls.filter((x) => x.name !== "select").length,
      0,
      "no load or clear",
    );
    return;
  }
  if (id.startsWith("P-LIFE-")) {
    const kind = id.slice("P-LIFE-".length);
    const before = C.queries().length;
    mount({}, kind === "strict");
    await settle();
    eq(C.stats.properties.active, 1, "one properties sub");
    eq(C.stats.selection.active, 1, "one selection sub");
    cleanPassive(before);
    if (kind === "shared") {
      mount({}, false, "B");
      await settle();
      eq(C.stats.properties.active, 2, "two own subs");
      unmount("A");
      eq(C.stats.properties.active, 1, "other panel sub alive");
    }
    if (kind === "unmount" || kind === "strict" || kind === "mount") {
      unmount();
      eq(C.stats.properties.active, 0, "own properties off");
      eq(C.stats.selection.active, 0, "own selection off");
    }
    if (kind.startsWith("replace")) {
      const next = await fresh();
      if (kind === "replace-properties") {
        mount({ properties: next.m });
        eq(C.stats.properties.active, 0, "old properties released");
        eq(C.stats.selection.active, 1, "selection remains one");
        eq(next.stats.properties.active, 1, "new properties one");
      } else {
        mount({ selection: next.s });
        eq(C.stats.selection.active, 0, "old selection released");
        eq(next.stats.selection.active, 1, "new selection one");
      }
    }
    eq(C.m.disposed, false, "borrowed properties live");
    eq(C.s.disposed, false, "borrowed selection live");
    check(C.messages.size > 0, "SDK transport remains");
    return;
  }
  if (id === "P-RACE-published-state") {
    await ready();
    const b = button("刷新"),
      p = C.hold(C.m.load(other));
    C.calls.length = 0;
    check(b.isConnected, "B input precondition: old DOM remains before commit");
    click(b);
    eq(C.calls.length, 0, "old state zero command before commit");
    const q = await C.next("inst.get");
    await C.finish({ q, p, ref: other });
    return;
  }
  if (id === "P-RACE-pointer-target") {
    await ready();
    const b = button("选择实例"),
      r = b.getBoundingClientRect();
    betweenNative = async () => {
      await C.load(other);
      await settle();
      C.calls.length = 0;
      C.pointerCurrent = C.s.current;
    };
    verifyNative = async () => {
      await settle();
      eq(C.calls.length, 0, "cross-target gesture zero command");
      eq(C.s.current, C.pointerCurrent, "no new target selection");
      return { pass: true };
    };
    return {
      native: {
        kind: "pointer-target",
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
      },
    };
  }
  if (id === "P-RACE-away-back") {
    await ready();
    click(button("刷新"));
    const old = command("reload");
    await C.next("inst.get");
    const b = await C.begin(other);
    await C.finish(b);
    await C.load(target);
    await rejection(old);
    eq(C.failures.length, 0, "A→B→A does not revive old feedback");
    check(!text().includes("操作失败"), "no stale local feedback");
    return;
  }
  if (id === "P-RACE-same-target") {
    await ready();
    const { e } = await failedReload();
    callbackFailure(e);
    has(C.m.state.error.code);
    has(C.m.state.error.message);
    return;
  }
  if (id === "P-RACE-callback-capture") {
    await ready();
    click(button("刷新"));
    const c = command("reload"),
      newFailures = [];
    mount({ onCommandError: (e) => newFailures.push(e) });
    const q = await C.next("inst.get");
    C.fail(q);
    const e = await rejection(c);
    callbackFailure(e);
    eq(newFailures.length, 0, "not new callback");
    return;
  }
  if (id === "P-RACE-latest-action") {
    await ready();
    click(button("刷新"));
    const first = command("reload");
    await settle();
    click(button("取消"));
    await command("cancel").returned;
    await rejection(first);
    await settle();
    eq(C.failures.length, 0, "superseded reload feedback not latest");
    return;
  }
  if (id === "P-ERROR-select") {
    await ready();
    const off = C.s.subscribe(() => {
      throw undefined;
    });
    click(button("选择实例"));
    await settle();
    off();
    const e = command("select").error;
    check(e instanceof AggregateError, "original Selection aggregate");
    eq(e.errors[0], undefined, "raw listener value");
    callbackFailure(e, "select", target);
    selected(target);
    return;
  }
  if (id === "P-ERROR-cancel") {
    const t = await pending(),
      off = C.m.subscribe(() => {
        if (C.m.state.status === "cancelled") throw "B54 cancel listener";
      });
    click(button("取消"));
    const e = await rejection(command("cancel"));
    off();
    await t.p.catch(() => {});
    callbackFailure(e, "cancel");
    return;
  }
  if (id === "P-ERROR-reload") {
    await ready();
    const { e } = await failedReload();
    callbackFailure(e);
    has(C.m.state.error.code);
    has(C.m.state.error.message);
    return;
  }
  if (id === "P-ERROR-no-callback") {
    await C.load();
    mount({ onCommandError: undefined });
    await settle();
    reset();
    await failedReload();
    has("操作失败");
    return;
  }
  if (id === "P-ERROR-callback") {
    await C.load();
    const second = Object.freeze({ B54: "callback raw" });
    mount({
      onCommandError() {
        throw second;
      },
    });
    await settle();
    reset();
    allowBoundary = true;
    const { e } = await failedReload();
    const aggregate = caught.at(-1);
    check(aggregate instanceof AggregateError, "host aggregate");
    eq(aggregate.errors[0], e, "original first");
    eq(aggregate.errors[1], second, "callback original second");
    return;
  }
  if (id === "P-ERROR-unmount" || id === "P-ERROR-replace") {
    await ready();
    click(button("刷新"));
    const c = command("reload");
    if (id.endsWith("unmount")) unmount();
    else {
      const n = await fresh();
      mount({ selection: n.s });
    }
    const q = await C.next("inst.get");
    C.fail(q);
    await rejection(c);
    eq(C.failures.length, 0, "invalidated action no local callback");
    return;
  }
  if (id === "P-AX-outside") {
    await ready();
    D.getElementById("before").focus();
    C.s.select({
      snapshotId: C.m.snapshotId,
      origin: "external",
      items: [{ ref: target }],
    });
    await settle();
    eq(D.activeElement, D.getElementById("before"), "outside focus preserved");
    check(
      region().getAttribute("aria-label") ||
        region().getAttribute("aria-labelledby"),
      "named region",
    );
    check(
      region().querySelectorAll("table").length === 2,
      "two semantic tables",
    );
    check(region().querySelectorAll("th").length > 0, "native headers");
    return;
  }
  if (id === "P-AX-removed") {
    const t = await pending();
    button("取消").focus();
    await C.finish(t);
    await settle();
    eq(D.activeElement, region(), "removed focus falls to own region");
    return;
  }
  if (id === "P-AX-tab") {
    await ready();
    D.getElementById("before").focus();
    verifyNative = async (stage) => {
      if (stage === "exit")
        eq(
          D.activeElement,
          D.getElementById("after"),
          "native Tab can leave panel",
        );
      else
        check(
          region().contains(D.activeElement),
          "native first button reached",
        );
      return { pass: true };
    };
    return {
      native: {
        kind: "Tab",
        tabCount: region().querySelectorAll("button").length,
      },
    };
  }
  if (id === "P-AX-multiple") {
    await ready();
    mount({}, false, "B");
    await settle();
    const ids = [...D.querySelectorAll("#A [id],#B [id]")].map((x) => x.id);
    eq(new Set(ids).size, ids.length, "ids isolated");
    const b = button("选择实例", "B");
    click(b);
    command("select");
    selected(target);
    return;
  }
  if (id === "P-AX-scroll") {
    const values = params();
    values[0].value += "中文".repeat(200);
    await C.load(target, { paramValues: values });
    mount();
    D.getElementById("A").style.width = "190px";
    await settle();
    const r = region(),
      box = r.getBoundingClientRect();
    check(Math.abs(box.height - 160) < 1, "entire height prop");
    has(values[0].value);
    const all = [r, ...r.querySelectorAll("*")];
    check(
      all.some(
        (x) =>
          x.scrollWidth > x.clientWidth &&
          ["auto", "scroll"].includes(getComputedStyle(x).overflowX),
      ),
      "local horizontal scrolling",
    );
    return;
  }
  throw Error("unregistered B semantic input " + id);
}
window.BPanel = {
  capable: typeof View === "function",
  async run(id) {
    C = await fresh();
    reset();
    const value = await generic(id);
    await settle();
    return value ?? { done: true };
  },
  async verify(stage) {
    return verifyNative(stage);
  },
  async between() {
    return betweenNative();
  },
  async control() {
    C = await fresh();
    eq(C.queries().length, 0, "constructor zero query");
    const t = await C.begin();
    eq(C.m.state.status, "pending", "real pending");
    await C.finish(t, { reverse: true });
    eq(C.m.state.status, "success", "real complete success");
    json(C.m.state.data.ports.result, ports(), "original legal ports");
    json(C.m.state.data.params.result, params(), "original parameter texts");
    C.s.select({
      snapshotId: C.m.snapshotId,
      origin: "props",
      items: [{ ref: ports()[1].ref }],
    });
    selected(ports()[1].ref);
    await C.m.clear();
    eq(C.m.state.status, "idle", "clear");
    await failLoad();
    eq(C.m.state.status, "failed", "real Core error");
    await C.m.clear();
    const q = await C.begin();
    await C.m.cancel();
    await q.p.catch(() => {});
    eq(C.m.state.status, "cancelled", "real cancellation");
    return { pass: true };
  },
  async cleanup() {
    const errors = [];
    for (const s of [...roots.keys()])
      try {
        unmount(s);
      } catch (e) {
        errors.push(String(e));
      }
    for (const c of contexts)
      for (const [name, s] of Object.entries(c.stats))
        if (s.active)
          errors.push(name + " panel subscription retained: " + s.active);
    for (const c of contexts) {
      try {
        const es = await c.close();
        for (const e of es) errors.push(e.name);
      } catch (e) {
        errors.push(String(e));
      }
    }
    await settle();
    if (!allowBoundary && globalErrors.length)
      errors.push("unexpected global window errors: " + globalErrors.length);
    if (unhandled.length)
      errors.push("unexpected unhandled rejections: " + unhandled.length);
    return {
      errors,
      globalErrors: globalErrors.length,
      unhandled: unhandled.length,
      expectedBoundary: allowBoundary,
      boundaries: caught.length,
      models: contexts.length,
      allWireListenersReleased: contexts.every(
        (c) => !c.messages.size && !c.closes.size,
      ),
    };
  },
};
