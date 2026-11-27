// B68 host: real public models and SDK only, never a replacement UI/state.
import React, { StrictMode, Suspense, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient, HierError } from "@hier/client";
import * as VM from "@hier/viewmodel";
const PathResolutionModel = Reflect.get(VM, "PathResolutionModel"),
  { SelectionModel } = VM;
import { context, check, eq } from "./public-model.mjs";
import { query, refs, complete, partial } from "./input.mjs";
import { invalid } from "./cases.mjs";
import { CoreWire } from "../independent-properties-panel/core-wire.mjs";
const View = Reflect.get(Views, "PathResolutionView"),
  D = document,
  deps = { HierClient, PathResolutionModel, SelectionModel },
  contexts = [],
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
  new Promise((r) => {
    const m = new MessageChannel();
    m.port1.onmessage = () => {
      m.port1.close();
      m.port2.close();
      r();
    };
    m.port2.postMessage(0);
  });
async function settle() {
  for (let n = 0; n < 8; n++) await Promise.resolve();
  flushSync(() => {});
  await turn();
  flushSync(() => {});
}
class Boundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e) {
    caught.push(e);
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
  c.callback = (f) =>
    c.failures.push({ failure: f, inEvent: c.inEvent === true });
  return c;
}
function mount(extra = {}, strict = false, slot = "A", c = C) {
  const props = {
    resolution: c.m,
    selection: c.s,
    ariaLabel: "B 路径定位 " + slot,
    height: 180,
    onCommandError: c.callback,
    ...extra,
  };
  c.props = props;
  let child = (
    <Boundary>
      <Suspense fallback={<b>B pending</b>}>
        <View {...props} />
      </Suspense>
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
const has = (v, slot = "A") =>
  check(text(slot).includes(String(v)), "visible original field " + String(v));
const lacks = (v) => check(!text().includes(v), "absent " + v);
function json(a, b, label) {
  if (Object.is(a, b)) return;
  check(
    a !== null && b !== null && typeof a === "object" && typeof b === "object",
    label,
  );
  const aa = Reflect.ownKeys(a),
    bb = Reflect.ownKeys(b);
  eq(aa.length, bb.length, label + " fields");
  for (const k of bb) {
    check(aa.includes(k), label + " " + String(k));
    json(a[k], b[k], label + "." + String(k));
  }
}
function buttons(slot = "A") {
  return [...region(slot).querySelectorAll("button")];
}
function button(label, slot = "A") {
  const a = buttons(slot).filter(
    (b) =>
      b.textContent.includes(label) ||
      b.getAttribute("aria-label")?.includes(label),
  );
  eq(a.length, 1, "one native " + label);
  return a[0];
}
function rowButtons(slot = "A") {
  return buttons(slot).filter((b) =>
    ["选择对象"].some(
      (t) =>
        b.textContent.includes(t) || b.getAttribute("aria-label")?.includes(t),
    ),
  );
}
const row = (b) => b.closest("li,tr,[role=listitem]") ?? b.parentElement;
function reset(c = C) {
  c.calls.length = 0;
  c.failures.length = 0;
}
function call(name, c = C) {
  const a = c.calls.filter((x) => x.name === name);
  eq(a.length, 1, "one original " + name);
  return a[0];
}
function click(b, c = C) {
  c.inEvent = true;
  try {
    b.click();
  } finally {
    c.inEvent = false;
  }
}
function selected(item, c = C) {
  json(c.s.current.items, [item], "one exact selected item");
  eq(c.s.current.origin, "external", "existing external origin");
  json(
    call("select", c).args,
    [{ snapshotId: c.m.snapshotId, origin: "external", items: [item] }],
    "exact Selection request",
  );
}
function snapshot(c = C) {
  return {
    selection: c.s.current,
    state: c.m.state,
    queries: c.queries().length,
    back: c.s.canGoBack,
    forward: c.s.canGoForward,
  };
}
function unchanged(o, c = C) {
  eq(c.s.current, o.selection, "selection unchanged");
  eq(c.m.state, o.state, "state unchanged");
  eq(c.queries().length, o.queries, "no query");
  eq(c.s.canGoBack, o.back, "back history");
  eq(c.s.canGoForward, o.forward, "forward history");
  eq(c.calls.length, 0, "no implicit public command");
}
async function ready(value = refs(), comp = complete, q = query()) {
  await C.load(q, value, comp);
  mount();
  await settle();
  reset();
}
async function rejectCall(c) {
  const e = await c.returned.then(
    () => {
      throw Error("expected original rejection");
    },
    (e) => e,
  );
  await settle();
  return e;
}
function failure(error, name = "reload", q = C.actionQuery, p, index, c = C) {
  eq(c.failures.length, 1, "one feedback");
  const r = c.failures[0],
    f = r.failure;
  eq(r.inEvent, false, "feedback after event stack");
  eq(f.command, name, "command source");
  eq(f.query, q, "original query identity");
  eq(f.error, error, "original error identity");
  check(Object.isFrozen(f), "frozen envelope");
  if (name === "select") {
    eq(f.reply, p, "original reply identity");
    eq(f.itemIndex, index, "original array index");
  } else {
    eq(Object.hasOwn(f, "reply"), false, "no page on query failure");
    eq(Object.hasOwn(f, "itemIndex"), false, "no index on query failure");
  }
}
function override(object, name, fn, c = C) {
  const d = Object.getOwnPropertyDescriptor(object, name);
  Object.defineProperty(object, name, {
    configurable: true,
    value: function (...args) {
      const x = { name, args };
      c.calls.push(x);
      try {
        return (x.returned = Reflect.apply(fn, this, args));
      } catch (e) {
        x.error = e;
        throw e;
      }
    },
  });
  c.restores.push(() =>
    d
      ? Object.defineProperty(object, name, d)
      : Reflect.deleteProperty(object, name),
  );
}
async function startReload() {
  C.actionQuery = C.m.state.query;
  click(button("重新定位"));
  const x = call("reload"),
    q = await C.next("path.resolve");
  return { x, q };
}
async function failReload() {
  const t = await startReload();
  C.fail(t.q);
  const error = await rejectCall(t.x);
  return { ...t, error };
}
async function real() {
  const response = await fetch("/core/open", { method: "POST" });
  check(response.ok, "original B Core bridge open");
  C = await fresh({ wire: new CoreWire((await response.json()).id) });
  const roots = (await C.client.roots()).result,
    top = roots.find((r) => r.name === "b_tree_top");
  check(top, "literal B top");
  const children = (await C.client.children(top.ref, { limit: 200 })).result
      .items,
    plain = children.find((r) => r.name === "plain");
  check(plain, "literal B plain");
  C.s.select({
    snapshotId: C.m.snapshotId,
    origin: "external",
    items: [{ def: plain.def }],
  });
  C.coreSelection = C.s.current;
  await C.hold(
    C.m.load({ snapshotId: C.m.snapshotId, text: "b_tree_top/plain" }),
  );
  eq(C.m.state.status, "success", "real path model success");
  json(C.m.state.reply.result, [plain.ref], "original known plain ref");
  eq(
    C.s.current,
    C.coreSelection,
    "query doesn't automatically choose even one result",
  );
  return plain.ref;
}
async function generic(id) {
  if (id.startsWith("PRV-INVALID-")) {
    allowBoundary = true;
    const [, key, value] = invalid.find((x) => "PRV-INVALID-" + x[0] === id);
    let v = value;
    if (key === "resolution" || key === "selection") {
      const m = key === "resolution" ? C.m : C.s;
      if (value === "fake")
        v =
          key === "resolution"
            ? { state: m.state, snapshotId: m.snapshotId, disposed: false }
            : {
                current: m.current,
                snapshotId: C.m.snapshotId,
                disposed: false,
              };
      else if (value === "proxy") v = new Proxy(m, {});
      else if (value === "disposed") {
        m.dispose();
        v = m;
      } else
        v = (
          await fresh(
            value === "unbound"
              ? { unbound: true }
              : { snapshotId: "B68-other" },
          )
        ).s;
    }
    reset();
    mount({ [key]: v });
    await settle();
    check(caught.at(-1) instanceof TypeError, "original host TypeError");
    eq(C.calls.length, 0, "before command");
    eq(C.stats.resolution.adds, 0, "before own resolution subscription");
    eq(C.stats.selection.adds, 0, "before own Selection subscription");
    return;
  }
  if (id === "PRV-OPTIONAL-undefined") {
    mount({ className: undefined, onCommandError: undefined });
    await settle();
    check(region(), "optional omission");
    eq(C.calls.length, 0, "no command");
    return;
  }
  if (id.startsWith("PRV-STATE-")) {
    const status = id.slice(10);
    if (status !== "idle") {
      if (status === "success") await C.load(query(), refs());
      else {
        const t = await C.begin();
        if (status === "failed") C.fail(t.q, "bad_request");
        else if (status === "cancelled") await C.m.cancel();
        if (status !== "pending") await t.p.catch(() => {});
      }
    }
    mount();
    await settle();
    reset();
    eq(C.m.state.status, status, "real state");
    has("路径定位");
    const statusNode = region().querySelector('[role="status"]');
    check(statusNode, "independent status");
    eq(statusNode.getAttribute("aria-live"), "polite", "polite status");
    check(
      !region().querySelector("form,input,textarea"),
      "host alone owns input form",
    );
    const labels = {
      idle: "尚未定位路径",
      pending: "正在定位路径",
      failed: "路径定位失败",
      cancelled: "路径定位已取消",
    };
    if (labels[status]) has(labels[status]);
    if (status === "idle") eq(buttons().length, 0, "idle no actions");
    else {
      has(query().text);
      if (status === "pending") {
        eq(region().getAttribute("aria-busy"), "true", "busy");
        button("取消定位");
        eq(buttons().filter((b) => !b.disabled).length, 1, "only cancel");
        eq(rowButtons().length, 0, "no old results");
      } else if (status !== "success") {
        has(C.m.state.error.origin);
        has(C.m.state.error.code);
        has(C.m.state.error.message);
        button("重新定位");
        eq(buttons().filter((b) => !b.disabled).length, 1, "only reload");
        eq(rowButtons().length, 0, "failed/cancelled no reply");
      }
    }
    return;
  }
  if (id.startsWith("PRV-QUERY-")) {
    const mode = id.slice(10),
      q = {
        ...query(),
        text:
          mode === "empty"
            ? ""
            : mode === "whitespace"
              ? " \t\n "
              : mode === "opaque"
                ? " \\\\raw/path.part<&>  "
                : query().text,
      };
    C.s.select({
      snapshotId: C.m.snapshotId,
      origin: "external",
      items: [{ def: "B68-shared-definition" }],
    });
    const original = C.s.current;
    await ready(mode === "single" ? [refs()[0]] : [], complete, q);
    has("查询路径");
    if (q.text === "") has("空文本");
    else has(q.text);
    if (mode === "external") {
      const source = C.m.state;
      C.s.select({
        snapshotId: C.m.snapshotId,
        origin: "external",
        items: [{ ref: "B68-external" }],
      });
      await settle();
      reset();
      const before = snapshot();
      mount();
      await settle();
      unchanged(before);
      eq(C.m.state, source, "external selection doesn't change query");
      has(q.text);
    } else if (mode === "single") {
      eq(rowButtons().length, 1, "one result");
      eq(C.s.current, original, "single doesn't auto select");
      click(rowButtons()[0]);
      selected({ ref: refs()[0] });
    }
    return;
  }
  if (id === "PRV-FIELD-refs" || id === "PRV-FIELD-safe") {
    const rows = refs();
    if (id.endsWith("safe"))
      rows[0] =
        '<img src=x onerror="window.B68Injected=1">尾&' + "长".repeat(30);
    await ready(rows);
    check(region().querySelector("table"), "native result table");
    has("引用");
    has("选择");
    const bs = rowButtons();
    eq(bs.length, rows.length, "duplicate refs not merged");
    for (let n = 0; n < rows.length; n++)
      check(row(bs[n]).textContent.includes(rows[n]), "original ref order");
    lacks("B68-REPLY-EXTRA");
    eq(region().querySelectorAll("img,script,iframe").length, 0, "text only");
    eq(window.B68Injected, undefined, "no injection");
    return;
  }
  if (id === "PRV-FIELD-reasons") {
    await ready([], partial);
    has("结果不完整");
    for (const r of partial.reasons) {
      has(r.code);
      if (r.at) has(r.at);
      if (r.detail) has(r.detail);
    }
    check(
      text().split("indexing").length >= 4,
      "duplicate ordered reasons retained",
    );
    lacks("未找到匹配路径");
    return;
  }
  if (id.startsWith("PRV-COMPLETE-")) {
    const mode = id.slice(13),
      p = mode.startsWith("partial");
    await ready(
      mode === "partial-nonempty" ? refs() : [],
      p ? partial : complete,
    );
    check(
      new RegExp(
        "已返回\\s*" +
          (mode === "partial-nonempty" ? refs().length : 0) +
          "\\s*项",
      ).test(text()),
      "returned count not total",
    );
    if (mode === "complete-empty") has("未找到匹配路径");
    else {
      lacks("未找到匹配路径");
      has("结果不完整");
      if (mode === "partial-empty") has("当前结果未返回对象（结果不完整）");
    }
    check(
      buttons().every((b) => !b.textContent.includes("加载更多")),
      "no fake paging",
    );
    eq(C.calls.length, 0, "no automatic query");
    return;
  }
  if (id.startsWith("PRV-ACTION-")) {
    const mode = id.slice(11);
    if (mode === "cancel") {
      await C.begin();
      mount();
      await settle();
      reset();
      click(button("取消定位"));
      json(call("cancel").args, [], "one cancel no args");
      await call("cancel").returned;
      eq(C.m.state.status, "cancelled", "cancel state");
      return;
    }
    await ready(refs(), mode === "partial-select" ? partial : complete);
    if (mode === "select" || mode === "partial-select") {
      const ref = C.m.state.reply.result[0],
        n = C.queries().length;
      click(rowButtons()[0]);
      selected({ ref });
      eq(C.queries().length, n, "no hidden metadata/reveal query");
      if (mode === "partial-select") has("结果不完整");
      return;
    }
    if (mode === "retry") {
      for (const status of ["failed", "cancelled"]) {
        const p = C.hold(C.m.reload()),
          q = await C.next("path.resolve");
        if (status === "failed") C.fail(q, "bad_request");
        else await C.m.cancel();
        await p.catch(() => {});
        await settle();
        reset();
        click(button("重新定位"));
        const x = call("reload"),
          r = await C.next("path.resolve");
        C.ok(r, refs());
        await x.returned;
        await settle();
        reset();
      }
      return;
    }
    click(button("重新定位"));
    const x = call("reload");
    json(x.args, [], "reload no synthetic arguments");
    const q = await C.next("path.resolve");
    json(q.params, { text: query().text }, "single original text not cursor");
    C.ok(q, refs());
    await x.returned;
    return;
  }
  if (id.startsWith("PRV-NATIVE-")) {
    const kind = id.slice(11);
    await ready();
    const b = rowButtons()[1],
      h = C.m.state.reply.result[1],
      before = snapshot();
    b.focus();
    b.scrollIntoView({ block: "center" });
    const box = b.getBoundingClientRect();
    verifyNative = async () => {
      await settle();
      if (kind.includes("right")) unchanged(before);
      else selected({ ref: h });
      return { pass: true };
    };
    return {
      native: { kind, x: box.x + box.width / 2, y: box.y + box.height / 2 },
    };
  }
  if (id.startsWith("PRV-SELECTION-")) {
    const mode = id.slice(14);
    await ready();
    const hs = C.m.state.reply.result;
    const items =
      mode === "namespace"
        ? [{ def: hs[0] }, { def: hs[1] }]
        : mode === "bits"
          ? [{ ref: hs[1], bits: { lsb: 0, width: 1 }, side: "inside" }]
          : [{ ref: hs[2] }, { def: hs[0] }];
    C.s.select({ snapshotId: C.m.snapshotId, origin: "external", items });
    await settle();
    reset();
    const before = snapshot();
    mount();
    await settle();
    const marks = rowButtons().map((b) =>
      row(b).textContent.includes("对象在选择中"),
    );
    json(
      marks,
      mode === "namespace"
        ? [false, false, false, false, false]
        : mode === "bits"
          ? [false, true, false, false, false]
          : [false, false, true, true, false],
      "original object namespace/duplicate passive marks",
    );
    unchanged(before);
    return;
  }
  if (id.startsWith("PRV-LIFE-") && id !== "PRV-LIFE-disposed") {
    const mode = id.slice(9);
    mount({}, mode === "strict");
    await settle();
    eq(C.queries().length, 0, "no mount query");
    eq(C.calls.length, 0, "no mount command");
    eq(C.stats.resolution.active, 1, "one resolution subscription");
    eq(C.stats.selection.active, 1, "one selection subscription");
    if (mode === "shared") {
      mount({}, false, "B");
      await settle();
      eq(C.stats.resolution.active, 2, "two separate mounts");
      unmount();
      await settle();
      eq(C.stats.resolution.active, 1, "other mount retained");
    } else if (mode === "replace-resolution" || mode === "replace-selection") {
      const n = await fresh();
      mount(
        mode === "replace-resolution"
          ? { resolution: n.m }
          : { selection: n.s },
      );
      await settle();
      eq(
        C.stats[mode === "replace-resolution" ? "resolution" : "selection"]
          .active,
        0,
        "old unsubscribed",
      );
      eq(
        n.stats[mode === "replace-resolution" ? "resolution" : "selection"]
          .active,
        1,
        "new subscribed",
      );
    } else if (mode === "unmount") {
      unmount();
      await settle();
      eq(C.stats.resolution.active, 0, "own unsubscription");
      eq(C.m.disposed, false, "borrowed live");
      await C.load(query(), refs());
    }
    return;
  }
  if (id === "PRV-LIFE-disposed") {
    await ready();
    const b = rowButtons()[0];
    C.m.dispose();
    reset();
    click(b);
    await settle();
    eq(C.calls.length, 0, "released model old action no-op");
    eq(C.s.disposed, false, "Selection still borrowed");
    return;
  }
  if (id === "PRV-REPLY-identity") {
    await ready();
    const reply = C.m.state.reply,
      q = C.m.state.query,
      raw = { B68: "reply" };
    override(C.s, "select", () => {
      throw raw;
    });
    click(rowButtons()[3]);
    await settle();
    failure(raw, "select", q, reply, 3);
    eq(rowButtons().length, 5, "duplicate rows kept");
    return;
  }
  if (id === "PRV-FIELD-diagnostic") {
    await ready();
    const t = await C.begin({ ...query(), text: "B68-diagnostic" }),
      e = new HierError(
        "transport_closed",
        "transport",
        "B68 original diagnostic",
        {},
      );
    let reads = 0;
    Object.defineProperty(e, "data", {
      get() {
        reads++;
        throw undefined;
      },
    });
    C.wire.close(e);
    await t.p.catch(() => {});
    await settle();
    has("transport");
    has("transport_closed");
    has(e.message);
    check(/诊断|dataIssue|不完整/.test(text()), "dataIssue visible");
    eq(reads, 1, "L7 never re-reads unknown data");
    return;
  }
  if (id.startsWith("PRV-RACE-") || id.startsWith("PRV-ERROR-"))
    return raceOrError(id);
  if (id.startsWith("PRV-AX-")) return accessibility(id.slice(7));
  if (id === "PRV-CORE-path-selection") {
    const ref = await real();
    mount();
    await settle();
    reset();
    has("b_tree_top/plain");
    eq(C.s.current, C.coreSelection, "UI not automatically selects");
    const n = C.queries().length;
    click(rowButtons()[0]);
    selected({ ref });
    eq(C.queries().length, n, "no UI follow-up query");
    return;
  }
  throw Error("unregistered B case " + id);
}
async function raceOrError(id) {
  const race = id.startsWith("PRV-RACE-"),
    mode = id.slice(race ? 9 : 10);
  await ready();
  if (race && mode === "published-state") {
    const b = rowButtons()[0];
    C.hold(C.m.clear());
    reset();
    click(b);
    eq(C.calls.length, 0, "uncommitted old state no-op");
    return;
  }
  if (race && mode.startsWith("pointer-")) {
    const old = C,
      b = rowButtons()[0];
    b.scrollIntoView({ block: "center" });
    const box = b.getBoundingClientRect();
    betweenNative = async () => {
      if (mode === "pointer-reply") {
        const p = C.hold(C.m.reload()),
          q = await C.next("path.resolve");
        C.ok(q, refs());
        await p;
      } else if (mode === "pointer-query") {
        await C.m.clear();
        await C.load({ ...query(), text: "B68-other" }, [refs()[1]]);
      } else {
        C = await fresh();
        await C.load(query(), [refs()[1]]);
        mount();
      }
      await settle();
      for (const c of contexts) reset(c);
    };
    verifyNative = async () => {
      await settle();
      eq(old.calls.length, 0, "old gesture no call");
      eq(C.calls.length, 0, "new view no retargeted action");
      return { pass: true };
    };
    return {
      native: {
        kind: "pointer-target",
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      },
    };
  }
  if (!race && ["select-sync", "undefined", "local"].includes(mode)) {
    const raw =
        mode === "undefined" ? undefined : Object.freeze({ B68: "raw" }),
      q = C.m.state.query,
      p = C.m.state.reply;
    if (mode === "local") {
      mount({ onCommandError: undefined });
      await settle();
    }
    override(C.s, "select", () => {
      throw raw;
    });
    click(rowButtons()[0]);
    eq(C.failures.length, 0, "sync feedback deferred");
    await settle();
    if (mode === "local") has("操作失败");
    else failure(raw, "select", q, p, 0);
    return;
  }
  if (!race && (mode === "callback" || mode === "callback-invalidates")) {
    const raw = undefined;
    mount({
      onCommandError() {
        if (mode === "callback-invalidates") C.hold(C.m.clear());
        throw raw;
      },
    });
    await settle();
    allowBoundary = mode === "callback";
    const { error } = await failReload();
    if (mode === "callback") {
      const e = caught.at(-1);
      check(e instanceof AggregateError, "boundary AggregateError");
      eq(e.errors[0], error, "raw query error");
      eq(e.errors[1], raw, "raw callback throw");
    } else eq(caught.length, 0, "invalidation beats aggregate render");
    return;
  }
  const c = C,
    { x, q } = await startReload();
  if (race && (mode === "query-identity" || mode === "away-back")) {
    C.hold(C.m.clear());
    if (mode === "away-back") {
      C.hold(C.m.load({ ...query(), text: "B68-away" }));
      C.hold(C.m.clear());
    }
    await C.load(query(), refs());
    await settle();
    C.fail(q);
    await rejectCall(x);
    eq(c.failures.length, 0, "query object switch never revived");
    return;
  }
  if (race && mode === "latest-action") {
    click(button("取消定位"));
    await call("cancel").returned;
    await rejectCall(x);
    eq(c.failures.length, 0, "latest successful action suppresses old");
    return;
  }
  if (race && mode === "callback-capture") {
    const later = [];
    mount({ onCommandError: (f) => later.push(f) });
    C.fail(q);
    const e = await rejectCall(x);
    failure(e, "reload", c.actionQuery, undefined, undefined, c);
    eq(later.length, 0, "old callback captured");
    return;
  }
  if (race && mode === "uncommitted") {
    let resolve;
    const started = new Promise((r) => (resolve = r)),
      pending = new Promise(() => {}),
      later = [];
    function Stop() {
      resolve();
      throw pending;
    }
    startTransition(() =>
      roots.get("A").render(
        <Boundary>
          <Suspense fallback={<b>B pending</b>}>
            <View {...C.props} onCommandError={(f) => later.push(f)} />
            <Stop />
          </Suspense>
        </Boundary>,
      ),
    );
    await started;
    check(region(), "old committed region retained");
    C.fail(q);
    const e = await rejectCall(x);
    failure(e, "reload", c.actionQuery, undefined, undefined, c);
    eq(later.length, 0, "uncommitted callback not captured");
    return;
  }
  if (!race && mode === "unmount") unmount();
  else if (!race && mode === "replace") {
    const n = await fresh();
    mount({ selection: n.s });
  } else if (!race && mode === "reload-async") {
    C.fail(q);
    const e = await rejectCall(x);
    failure(e);
    has(c.m.state.error.origin);
    has(c.m.state.error.code);
    has(c.m.state.error.message);
    return;
  } else throw Error("unknown race/error " + id);
  C.fail(q);
  await rejectCall(x);
  eq(c.failures.length, 0, "late invalidated feedback suppressed");
}
async function accessibility(mode) {
  if (mode === "removed") {
    await C.begin();
    mount();
    await settle();
    const b = button("取消定位");
    b.focus();
    const q = C.sent.find((q) => q.method === "path.resolve");
    C.ok(q, refs());
    await settle();
    eq(D.activeElement, region(), "removed control falls back region");
    return;
  }
  await ready();
  if (mode === "outside") {
    D.getElementById("before").focus();
    C.s.select({
      snapshotId: C.m.snapshotId,
      origin: "external",
      items: [{ ref: refs()[1] }],
    });
    await settle();
    eq(D.activeElement, D.getElementById("before"), "no external focus theft");
    const b = button("重新定位");
    b.focus();
    C.s.select({
      snapshotId: C.m.snapshotId,
      origin: "external",
      items: [{ ref: refs()[2] }],
    });
    await settle();
    eq(D.activeElement, b, "existing button focus");
    return;
  }
  if (mode === "tab") {
    D.getElementById("before").focus();
    verifyNative = async (stage) => {
      if (stage === "exit")
        eq(D.activeElement, D.getElementById("after"), "Tab leaves");
      else
        check(region().contains(D.activeElement), "Tab enters native controls");
      return { pass: true };
    };
    return {
      native: {
        kind: "Tab",
        tabCount: buttons().filter((b) => !b.disabled).length,
      },
    };
  }
  if (mode === "multiple") {
    mount({}, false, "B");
    await settle();
    const ids = [...D.querySelectorAll("#A [id],#B [id]")].map((x) => x.id);
    eq(new Set(ids).size, ids.length, "isolated IDs");
    click(rowButtons("B")[1]);
    selected({ ref: refs()[1] });
    return;
  }
  if (mode === "scroll") {
    const long = refs();
    long[0] += "长".repeat(300);
    await C.load({ ...query(), text: "长".repeat(200) }, long);
    await settle();
    D.getElementById("A").style.width = "190px";
    eq(
      Math.round(region().getBoundingClientRect().height),
      180,
      "whole CSS height",
    );
    has(long[0]);
    check(
      [region(), ...region().querySelectorAll("*")].some(
        (x) =>
          x.scrollWidth > x.clientWidth &&
          ["auto", "scroll"].includes(getComputedStyle(x).overflowX),
      ),
      "local horizontal scroll",
    );
  }
}
window.BPanel = {
  capable: typeof View === "function",
  modelCapable: typeof PathResolutionModel === "function",
  async run(id) {
    C = await fresh();
    reset();
    const result = await generic(id);
    await settle();
    return result ?? { pass: true };
  },
  verify: async (stage) => verifyNative(stage),
  between: async () => betweenNative(),
  async control(realCore = false) {
    if (realCore) {
      const ref = await real();
      C.s.select({
        snapshotId: C.m.snapshotId,
        origin: "external",
        items: [{ ref }],
      });
      eq(C.s.current.items[0].ref, ref, "real public Selection");
      return { pass: true };
    }
    C = await fresh();
    await C.load(query(), refs(), partial);
    eq(C.m.state.status, "success", "real partial model");
    json(C.m.state.reply.result, refs(), "original array, not fake page");
    C.s.select({
      snapshotId: C.m.snapshotId,
      origin: "external",
      items: [{ def: refs()[0] }],
    });
    eq(C.s.current.items[0].def, refs()[0], "definition namespace separate");
    return { pass: true };
  },

  async cleanup() {
    const errors = [];
    for (const slot of [...roots.keys()])
      try {
        unmount(slot);
      } catch (e) {
        errors.push(String(e));
      }
    for (const c of contexts) {
      for (const [name, s] of Object.entries(c.stats))
        if (s.active) errors.push(name + " retained");
      try {
        for (const e of await c.close()) errors.push(e.name);
      } catch (e) {
        errors.push(String(e));
      }
    }
    await settle();
    if (!allowBoundary && globalErrors.length)
      errors.push("unexpected global errors " + globalErrors.length);
    if (unhandled.length) errors.push("unhandled " + unhandled.length);
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
