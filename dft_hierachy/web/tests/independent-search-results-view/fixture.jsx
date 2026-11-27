// B62 host: real public models and SDK only, never a replacement UI/state.
import React, { StrictMode, Suspense, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient, HierError } from "@hier/client";
import { SearchModel, SelectionModel } from "@hier/viewmodel";
import { context, check, eq } from "./public-model.mjs";
import { query, hits, page, complete, partial } from "./input.mjs";
import { invalid } from "./cases.mjs";
import { CoreWire } from "../independent-properties-panel/core-wire.mjs";
const View = Reflect.get(Views, "SearchResultsView"),
  D = document,
  deps = { HierClient, SearchModel, SelectionModel },
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
    search: c.m,
    selection: c.s,
    ariaLabel: "B 搜索 " + slot,
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
    ["选择定义", "选择对象"].some(
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
async function ready(value = page(), comp = complete, q = query()) {
  await C.load(q, value, comp);
  mount();
  await settle();
  reset();
}
async function more(value, comp = complete) {
  const p = C.hold(C.m.loadMore()),
    q = await C.next("search");
  C.ok(q, value, comp);
  await p;
  return C.m.state;
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
    eq(f.page, p, "original page identity");
    eq(f.itemIndex, index, "original page-local index");
  } else {
    eq(Object.hasOwn(f, "page"), false, "no page on query failure");
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
  click(button("重新搜索"));
  const x = call("reload"),
    q = await C.next("search");
  return { x, q };
}
async function failReload() {
  const t = await startReload();
  C.fail(t.q);
  const error = await rejectCall(t.x);
  return { ...t, error };
}
async function real() {
  const r = await fetch("/core/open", { method: "POST" });
  check(r.ok, "original B Core bridge open");
  C = await fresh({ wire: new CoreWire((await r.json()).id) });
  let ready = false,
    resolve;
  const p = new Promise((r) => (resolve = r)),
    off = C.client.onIndexReady(() => {
      ready = true;
      resolve();
    });
  C.restores.push(off);
  let probe = await C.client.search(
    { text: "plain", kinds: ["instance"] },
    { limit: 200 },
  );
  if (probe.completeness.status === "partial") {
    check(
      probe.completeness.reasons.every((r) => r.code === "indexing"),
      "plain B HDL indexing prerequisite",
    );
    if (!ready) await p;
    probe = await C.client.search(
      { text: "plain", kinds: ["instance"] },
      { limit: 200 },
    );
  }
  eq(probe.completeness.status, "complete", "setup index complete");
  const refs = (await C.client.resolvePath("b_tree_top/plain")).result;
  eq(refs.length, 1, "one literal original plain");
  eq(probe.result.items.length, 1, "one literal plain instance");
  const roots = (await C.client.roots()).result;
  const top = roots.find((r) => r.name === "b_tree_top");
  check(top, "original literal top");
  const children = (await C.client.children(top.ref, { limit: 200 })).result
    .items;
  const plain = children.find((r) => r.name === "plain");
  check(
    plain && plain.ref === refs[0],
    "independent instance/definition metadata",
  );
  C.coreDefinition = plain.def;
  await C.hold(
    C.m.load({
      snapshotId: C.m.snapshotId,
      text: "plain",
      kinds: ["instance"],
    }),
  );
  eq(C.m.state.status, "success", "real model success");
  eq(
    C.m.state.pages[0].result.items[0].ref,
    refs[0],
    "independent public path ref",
  );
  return refs[0];
}
async function generic(id) {
  if (id.startsWith("SRV-INVALID-")) {
    allowBoundary = true;
    const [, key, value] = invalid.find((x) => "SRV-INVALID-" + x[0] === id);
    let v = value;
    if (key === "search" || key === "selection") {
      const m = key === "search" ? C.m : C.s;
      if (value === "fake")
        v =
          key === "search"
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
              : { snapshotId: "B62-other" },
          )
        ).s;
    }
    reset();
    mount({ [key]: v });
    await settle();
    check(caught.at(-1) instanceof TypeError, "original host TypeError");
    eq(C.calls.length, 0, "before command");
    eq(C.stats.search.adds, 0, "before own Search subscription");
    eq(C.stats.selection.adds, 0, "before own Selection subscription");
    return;
  }
  if (id === "SRV-OPTIONAL-undefined") {
    mount({ className: undefined, onCommandError: undefined });
    await settle();
    check(region(), "optional omission");
    eq(C.calls.length, 0, "no command");
    return;
  }
  if (id.startsWith("SRV-STATE-")) {
    const status = id.slice(10);
    if (status !== "idle") {
      await C.load(query(), page(hits(), "B62-state-next"));
      if (status !== "success") {
        const p = C.hold(C.m.loadMore()),
          q = await C.next("search");
        if (status === "failed") C.fail(q);
        else if (status === "cancelled") await C.m.cancel();
        if (status !== "pending") await p.catch(() => {});
      }
    }
    mount();
    await settle();
    reset();
    eq(C.m.state.status, status, "real state");
    has("搜索结果");
    check(region().querySelector('[role="status"]'), "independent task status");
    const labels = {
      idle: "尚未执行搜索",
      pending: "正在搜索",
      failed: "搜索失败",
      cancelled: "搜索已取消",
    };
    if (labels[status]) has(labels[status]);
    if (status === "idle") eq(buttons().length, 0, "idle no action");
    else {
      has(query().text);
      for (const h of hits()) has(h.name);
      if (status === "pending") {
        eq(region().getAttribute("aria-busy"), "true", "busy");
        button("取消搜索");
        eq(
          buttons().filter((b) => !b.disabled).length,
          1,
          "only cancel enabled",
        );
      } else if (status !== "success") {
        has(C.m.state.error.origin);
        has(C.m.state.error.code);
        has(C.m.state.error.message);
        button("重新搜索");
        eq(
          buttons().filter((b) => !b.disabled).length,
          1,
          "only reload enabled",
        );
      }
    }
    return;
  }
  if (id.startsWith("SRV-QUERY-")) {
    const mode = id.slice(10);
    const q =
      mode === "empty-text"
        ? { ...query(), text: "" }
        : mode === "space-text"
          ? { ...query(), text: " \t  " }
          : {
              ...query(),
              kinds: ["signal", "port", "signal"],
              scope: "B62-opaque-scope<&>",
            };
    await ready(page(), complete, q);
    has(mode === "empty-text" ? "空文本" : q.text);
    if (mode === "filters") {
      has(q.scope);
      const summary = region().cloneNode(true);
      for (const b of [...summary.querySelectorAll("button")].filter((b) =>
        ["选择定义", "选择对象"].some(
          (t) =>
            b.textContent.includes(t) ||
            b.getAttribute("aria-label")?.includes(t),
        ),
      ))
        row(b).remove();
      json(
        summary.textContent.match(/\b(?:signal|port)\b/g),
        q.kinds,
        "original query kind order/duplicates, excluding result rows",
      );
    } else {
      has("全部种类");
      has("全部范围");
    }
    await C.load({ ...q, kinds: [] }, page([]));
    await settle();
    has("空种类集合");
    return;
  }
  if (id === "SRV-FIELD-hits" || id === "SRV-FIELD-safe") {
    const hs = hits();
    if (id.endsWith("safe")) {
      hs[0].name = '<img src=x onerror="window.B62Injected=1">尾&';
      hs[0].pathText = "B62 path " + "长".repeat(30);
    }
    await ready(page([...hs, hs[2]]));
    const bs = rowButtons();
    eq(bs.length, 7, "six kinds plus duplicate row");
    for (let n = 0; n < 7; n++) {
      const h = [...hs, hs[2]][n],
        t = row(bs[n]).textContent;
      for (const k of ["kind", "name", "pathText", "ref", "def"])
        check(t.includes(h[k]), "original " + k);
      check(t.includes(h.inst ?? "未提供"), "instance/missing original");
    }
    lacks("B62-EXTRA-DO-NOT-RENDER");
    lacks("B62-PAGE-EXTRA");
    eq(
      region().querySelectorAll("img,script,iframe").length,
      0,
      "text nodes only",
    );
    eq(window.B62Injected, undefined, "no injection");
    return;
  }
  if (id === "SRV-FIELD-reasons") {
    await ready(page([], "B62-partial"), partial);
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
    lacks("已取尽当前查询");
    return;
  }
  if (id.startsWith("SRV-COMPLETE-")) {
    const mode = id.slice(13);
    if (mode === "mixed-prefix") {
      await C.load(query(), page([], "B62-prefix"));
      await more(page([], "B62-partial"), partial);
      mount();
      await settle();
      reset();
    } else
      await ready(
        page(
          [],
          mode === "empty-next" || mode === "partial-next"
            ? "B62-next"
            : undefined,
        ),
        mode.startsWith("partial") ? partial : complete,
      );
    check(/已加载\s*0\s*项/.test(text()), "zero loaded, not total hits");
    if (mode === "complete-empty") {
      has("未找到匹配");
      has("已取尽当前查询");
    } else {
      lacks("未找到匹配");
      lacks("已取尽当前查询");
      if (mode === "empty-next") {
        has("当前已加载页未返回匹配，仍可继续加载");
        button("加载更多");
      } else {
        has("当前结果未返回匹配（结果不完整）");
        check(
          buttons().every(
            (b) =>
              ![b.textContent, b.getAttribute("aria-label") ?? ""].some(
                (label) => label.includes("加载更多"),
              ) || b.disabled,
          ),
          "partial no more",
        );
        has("结果不完整");
      }
    }
    eq(C.calls.length, 0, "no implicit retry");
    return;
  }
  if (id.startsWith("SRV-ACTION-")) {
    const mode = id.slice(11);
    if (mode === "cancel") {
      await C.begin();
      mount();
      await settle();
      reset();
      click(button("取消搜索"));
      json(call("cancel").args, [], "cancel original args");
      await call("cancel").returned;
      eq(C.m.state.status, "cancelled", "cancel state");
      return;
    }
    await ready(page(hits(), "B62-action-next"));
    if (mode === "definition" || mode === "object") {
      const i = mode === "definition" ? 0 : 1,
        h = C.m.state.pages[0].result.items[i],
        n = C.queries().length;
      click(rowButtons()[i]);
      selected(i === 0 ? { def: h.ref } : { ref: h.ref });
      eq(C.queries().length, n, "Selection no SDK follow-up");
      return;
    }
    if (mode === "retry") {
      for (const status of ["failed", "cancelled"]) {
        const p = C.hold(C.m.reload()),
          q = await C.next("search");
        if (status === "failed") C.fail(q);
        else await C.m.cancel();
        await p.catch(() => {});
        await settle();
        reset();
        click(button("重新搜索"));
        const x = call("reload"),
          req = await C.next("search");
        C.ok(req, page());
        await x.returned;
        await settle();
        reset();
      }
      return;
    }
    click(button(mode === "more" ? "加载更多" : "重新搜索"));
    const x = call(mode === "more" ? "loadMore" : "reload");
    json(x.args, [], "no synthetic params");
    const q = await C.next("search");
    eq(
      q.params.cursor,
      mode === "more" ? "B62-action-next" : "",
      "L6 owns cursor",
    );
    C.ok(
      q,
      page([hits()[2]], mode === "more" ? "B62-next-failure" : undefined),
    );
    await x.returned;
    if (mode === "more") {
      await settle();
      reset();
      const original = C.m.state.query;
      click(button("加载更多"));
      const attempt = call("loadMore");
      C.fail(await C.next("search"));
      failure(await rejectCall(attempt), "loadMore", original);
    }
    return;
  }
  if (id.startsWith("SRV-NATIVE-")) {
    const kind = id.slice(11);
    await ready();
    const b = rowButtons()[1],
      h = C.m.state.pages[0].result.items[1],
      before = snapshot();
    b.focus();
    b.scrollIntoView({ block: "center" });
    const box = b.getBoundingClientRect();
    verifyNative = async () => {
      await settle();
      if (kind.includes("right")) unchanged(before);
      else selected({ ref: h.ref });
      return { pass: true };
    };
    return {
      native: { kind, x: box.x + box.width / 2, y: box.y + box.height / 2 },
    };
  }
  if (id.startsWith("SRV-SELECTION-")) {
    const mode = id.slice(14);
    await ready();
    const hs = C.m.state.pages[0].result.items;
    const items =
      mode === "namespace"
        ? [{ ref: hs[0].ref }, { def: hs[1].ref }]
        : mode === "bits"
          ? [
              { ref: hs[1].ref, bits: { lsb: 0, width: 1 }, side: "inside" },
              { def: hs[0].ref },
            ]
          : [{ ref: hs[2].ref }, { def: hs[0].ref }];
    C.s.select({ snapshotId: C.m.snapshotId, origin: "external", items });
    await settle();
    reset();
    const before = snapshot();
    mount();
    await settle();
    if (mode === "namespace") {
      check(
        !row(rowButtons()[0]).textContent.includes("定义在选择中"),
        "def namespace not ref",
      );
      check(
        !row(rowButtons()[1]).textContent.includes("对象在选择中"),
        "object namespace not def",
      );
    } else {
      check(
        row(rowButtons()[0]).textContent.includes("定义在选择中"),
        "def mark",
      );
      check(
        row(rowButtons()[mode === "bits" ? 1 : 2]).textContent.includes(
          "对象在选择中",
        ),
        "object mark",
      );
    }
    unchanged(before);
    return;
  }
  if (id.startsWith("SRV-LIFE-") && id !== "SRV-LIFE-disposed") {
    const mode = id.slice(9);
    mount({}, mode === "strict");
    await settle();
    eq(C.queries().length, 0, "no mount query");
    eq(C.calls.length, 0, "no mount command");
    eq(C.stats.search.active, 1, "one search subscription");
    eq(C.stats.selection.active, 1, "one selection subscription");
    if (mode === "shared") {
      mount({}, false, "B");
      await settle();
      eq(C.stats.search.active, 2, "two separate mounts");
      unmount();
      await settle();
      eq(C.stats.search.active, 1, "other mount retained");
    } else if (mode === "replace-search" || mode === "replace-selection") {
      const n = await fresh();
      mount(mode === "replace-search" ? { search: n.m } : { selection: n.s });
      await settle();
      eq(
        C.stats[mode === "replace-search" ? "search" : "selection"].active,
        0,
        "old unsubscribed",
      );
      eq(
        n.stats[mode === "replace-search" ? "search" : "selection"].active,
        1,
        "new subscribed",
      );
    } else if (mode === "unmount") {
      unmount();
      await settle();
      eq(C.stats.search.active, 0, "own unsubscription");
      eq(C.m.disposed, false, "borrowed live");
      await C.load(query(), page());
    }
    return;
  }
  if (id === "SRV-LIFE-disposed") {
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
  if (id === "SRV-PAGE-identity") {
    await ready(page([hits()[2]], "B62-p2"));
    await more(page([hits()[2], hits()[2]]));
    await settle();
    reset();
    const p = C.m.state.pages[1],
      q = C.m.state.query,
      raw = { B62: "page" };
    override(C.s, "select", () => {
      throw raw;
    });
    click(rowButtons()[2]);
    await settle();
    failure(raw, "select", q, p, 1);
    eq(rowButtons().length, 3, "no cross-page dedup");
    return;
  }
  if (id === "SRV-FIELD-diagnostic") {
    await ready();
    const t = await C.begin({ ...query(), text: "diagnostic" }),
      e = new HierError(
        "transport_closed",
        "transport",
        "B62 original diagnostic",
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
  if (id.startsWith("SRV-RACE-") || id.startsWith("SRV-ERROR-"))
    return raceOrError(id);
  if (id.startsWith("SRV-AX-")) return accessibility(id.slice(7));
  if (id === "SRV-CORE-search-selection") {
    const ref = await real();
    mount();
    await settle();
    reset();
    has(ref);
    click(rowButtons()[0]);
    selected({ ref });
    await C.hold(
      C.m.load({
        snapshotId: C.m.snapshotId,
        text: "b_tree_leaf",
        kinds: ["definition"],
      }),
    );
    await settle();
    reset();
    const h = C.m.state.pages[0].result.items;
    eq(h.length, 1, "one literal leaf definition");
    eq(h[0].kind, "definition", "original authoritative kind");
    eq(
      h[0].ref,
      C.coreDefinition,
      "definition address from independent children metadata",
    );
    const n = C.queries().length;
    click(rowButtons()[0]);
    selected({ def: h[0].ref });
    eq(C.queries().length, n, "no implicit occurrence fetch");
    return;
  }
  throw Error("unregistered B case " + id);
}
async function raceOrError(id) {
  const race = id.startsWith("SRV-RACE-"),
    mode = id.slice(race ? 9 : 10);
  await ready(page(hits(), "B62-race-next"));
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
      if (mode === "pointer-append") await more(page([hits()[2]]));
      else if (mode === "pointer-query") {
        await C.m.clear();
        await C.load({ ...query(), text: "other" }, page([hits()[1]]));
      } else {
        C = await fresh();
        await C.load(query(), page([hits()[1]]));
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
        mode === "undefined" ? undefined : Object.freeze({ B62: "raw" }),
      q = C.m.state.query,
      p = C.m.state.pages[0];
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
      C.hold(C.m.load({ ...query(), text: "B62-away" }));
      C.hold(C.m.clear());
    }
    await C.load(query(), page());
    await settle();
    C.fail(q);
    await rejectCall(x);
    eq(c.failures.length, 0, "query object switch never revived");
    return;
  }
  if (race && mode === "latest-action") {
    click(button("取消搜索"));
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
    const b = button("取消搜索");
    b.focus();
    const q = C.sent.find((q) => q.method === "search");
    C.ok(q, page());
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
      items: [{ ref: hits()[1].ref }],
    });
    await settle();
    eq(D.activeElement, D.getElementById("before"), "no external focus theft");
    const b = button("重新搜索");
    b.focus();
    C.s.select({
      snapshotId: C.m.snapshotId,
      origin: "external",
      items: [{ ref: hits()[2].ref }],
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
    selected({ ref: hits()[1].ref });
    return;
  }
  if (mode === "scroll") {
    const h = hits();
    h[0].name += "长".repeat(300);
    await C.load({ ...query(), text: "长".repeat(200) }, page(h));
    await settle();
    D.getElementById("A").style.width = "190px";
    eq(
      Math.round(region().getBoundingClientRect().height),
      180,
      "whole CSS height",
    );
    has(h[0].name);
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
    await C.load(query(), page(hits(), "B62-partial"), partial);
    eq(C.m.state.status, "success", "real partial success");
    json(C.m.state.pages[0].result.items, hits(), "lawful original hits");
    C.s.select({
      snapshotId: C.m.snapshotId,
      origin: "external",
      items: [{ def: hits()[0].ref }],
    });
    eq(C.s.current.items[0].def, hits()[0].ref, "definition not occurrence");
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
