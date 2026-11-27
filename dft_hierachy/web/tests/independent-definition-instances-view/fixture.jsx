// B66 host: real public models and SDK only, never a replacement UI/state.
import React, { StrictMode, Suspense, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient, HierError } from "@hier/client";
import { DefinitionInstancesModel, SelectionModel } from "@hier/viewmodel";
import { context, check, eq } from "./public-model.mjs";
import { query, hits, page, complete, partial } from "./input.mjs";
import { invalid } from "./cases.mjs";
import { CoreWire } from "../independent-properties-panel/core-wire.mjs";
const View = Reflect.get(Views, "DefinitionInstancesView"),
  D = document,
  deps = { HierClient, DefinitionInstancesModel, SelectionModel },
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
    instances: c.m,
    selection: c.s,
    ariaLabel: "B 定义实例 " + slot,
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
    ["选择实例"].some(
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
    q = await C.next("def.instances");
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
  click(button("重新查询"));
  const x = call("reload"),
    q = await C.next("def.instances");
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
  const refs = (await C.client.resolvePath("b_tree_top/plain")).result;
  eq(refs.length, 1, "one original literal plain");
  const roots = (await C.client.roots()).result,
    top = roots.find((r) => r.name === "b_tree_top");
  check(top, "original top");
  const children = (await C.client.children(top.ref, { limit: 200 })).result
      .items,
    plain = children.find((r) => r.name === "plain");
  check(
    plain && plain.ref === refs[0],
    "independent occurrence/definition metadata",
  );
  C.coreDefinition = plain.def;
  C.s.select({
    snapshotId: C.m.snapshotId,
    origin: "external",
    items: [{ def: plain.def }],
  });
  C.coreDefinitionSelection = C.s.current;
  await C.hold(C.m.load({ snapshotId: C.m.snapshotId, def: plain.def }));
  eq(C.m.state.status, "success", "real instances model success");
  eq(
    C.s.current,
    C.coreDefinitionSelection,
    "query never auto-selects occurrence",
  );
  C.coreRefIndex = C.m.state.pages[0].result.items.findIndex(
    (x) => x.ref === plain.ref,
  );
  check(
    C.coreRefIndex >= 0,
    "literal plain occurrence present among shared definition instances",
  );
  return plain.ref;
}
async function generic(id) {
  if (id.startsWith("DIV-INVALID-")) {
    allowBoundary = true;
    const [, key, value] = invalid.find((x) => "DIV-INVALID-" + x[0] === id);
    let v = value;
    if (key === "instances" || key === "selection") {
      const m = key === "instances" ? C.m : C.s;
      if (value === "fake")
        v =
          key === "instances"
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
              : { snapshotId: "B66-other" },
          )
        ).s;
    }
    reset();
    mount({ [key]: v });
    await settle();
    check(caught.at(-1) instanceof TypeError, "original host TypeError");
    eq(C.calls.length, 0, "before command");
    eq(C.stats.instances.adds, 0, "before own instances subscription");
    eq(C.stats.selection.adds, 0, "before own Selection subscription");
    return;
  }
  if (id === "DIV-OPTIONAL-undefined") {
    mount({ className: undefined, onCommandError: undefined });
    await settle();
    check(region(), "optional omission");
    eq(C.calls.length, 0, "no command");
    return;
  }
  if (id.startsWith("DIV-STATE-")) {
    const status = id.slice(10);
    if (status !== "idle") {
      await C.load(query(), page(hits(), "B66-state-next"));
      if (status !== "success") {
        const p = C.hold(C.m.loadMore()),
          q = await C.next("def.instances");
        if (status === "failed") C.fail(q);
        else if (status === "cancelled") await C.m.cancel();
        if (status !== "pending") await p.catch(() => {});
      }
    }
    mount();
    await settle();
    reset();
    eq(C.m.state.status, status, "real state");
    has("定义实例");
    check(region().querySelector('[role="status"]'), "independent task status");
    const labels = {
      idle: "尚未查询定义实例",
      pending: "正在查询定义实例",
      failed: "定义实例查询失败",
      cancelled: "定义实例查询已取消",
    };
    if (labels[status]) has(labels[status]);
    if (status === "idle") eq(buttons().length, 0, "idle no action");
    else {
      has(query().def);
      for (const h of hits()) has(h.name);
      if (status === "pending") {
        eq(region().getAttribute("aria-busy"), "true", "busy");
        button("取消查询");
        eq(
          buttons().filter((b) => !b.disabled).length,
          1,
          "only cancel enabled",
        );
      } else if (status !== "success") {
        has(C.m.state.error.origin);
        has(C.m.state.error.code);
        has(C.m.state.error.message);
        button("重新查询");
        eq(
          buttons().filter((b) => !b.disabled).length,
          1,
          "only reload enabled",
        );
      }
    }
    return;
  }
  if (id.startsWith("DIV-QUERY-")) {
    const mode = id.slice(10),
      q =
        mode === "opaque"
          ? { ...query(), def: "I:looks-like-object<&>  原定义 " }
          : query();
    let before;
    if (mode === "single") {
      C.s.select({
        snapshotId: C.m.snapshotId,
        origin: "external",
        items: [{ def: q.def }],
      });
      before = C.s.current;
    }
    await ready(
      page(mode === "single" ? [hits()[0]] : mode === "opaque" ? [] : hits()),
      complete,
      q,
    );
    has(q.def);
    if (mode === "external") {
      const source = C.m.state;
      C.s.select({
        snapshotId: C.m.snapshotId,
        origin: "external",
        items: [{ def: "B66-other-definition" }],
      });
      await settle();
      reset();
      const previous = snapshot();
      mount();
      await settle();
      unchanged(previous);
      eq(C.m.state, source, "external selection leaves page source");
      has(q.def);
    } else if (mode === "single") {
      eq(rowButtons().length, 1, "one known occurrence");
      eq(C.s.current, before, "no automatic single-instance confirmation");
      check(
        !row(rowButtons()[0]).textContent.includes("实例在选择中"),
        "definition selection is not occurrence mark",
      );
      click(rowButtons()[0]);
      selected({ ref: hits()[0].ref });
    }
    return;
  }
  if (id === "DIV-FIELD-hits" || id === "DIV-FIELD-safe") {
    const hs = hits();
    if (id.endsWith("safe")) {
      hs[0].name = '<img src=x onerror="window.B66Injected=1">尾&';
      hs[0].pathText = "B66 path " + "长".repeat(30);
    }
    const rows = [...hs, hs[2]];
    await ready(page(rows));
    check(region().querySelector("table"), "native occurrence table");
    const bs = rowButtons();
    eq(bs.length, 6, "five kinds plus duplicate");
    for (let n = 0; n < rows.length; n++) {
      const h = rows[n],
        t = row(bs[n]).textContent;
      for (const k of [
        "kind",
        "name",
        "pathText",
        "ref",
        "def",
        "defName",
        "childCount",
      ])
        check(t.includes(String(h[k])), "original " + k);
      check(
        t.includes(h.hasParamOverrides ? "是" : "否"),
        "original override flag",
      );
      let previous = -1;
      for (const part of h.path) {
        const index = t.indexOf(part, previous + 1);
        check(index > previous, "original path segment order");
        previous = index;
      }
    }
    lacks("B66-EXTRA-DO-NOT-RENDER");
    lacks("B66-PAGE-EXTRA");
    eq(
      region().querySelectorAll("img,script,iframe").length,
      0,
      "text nodes only",
    );
    eq(window.B66Injected, undefined, "no injection");
    return;
  }
  if (id === "DIV-FIELD-reasons") {
    await ready(page([], "B66-partial"), partial);
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
    lacks("已取尽当前定义实例");
    return;
  }
  if (id.startsWith("DIV-COMPLETE-")) {
    const mode = id.slice(13);
    if (mode === "mixed-prefix") {
      await C.load(query(), page([], "B66-prefix"));
      await more(page([], "B66-partial"), partial);
      mount();
      await settle();
      reset();
    } else
      await ready(
        page(
          [],
          mode === "empty-next" || mode === "partial-next"
            ? "B66-next"
            : undefined,
        ),
        mode.startsWith("partial") ? partial : complete,
      );
    check(/已加载\s*0\s*项/.test(text()), "zero loaded, not total hits");
    if (mode === "complete-empty") {
      has("该定义没有实例");
      has("已取尽当前定义实例");
    } else {
      lacks("该定义没有实例");
      lacks("已取尽当前定义实例");
      if (mode === "empty-next") {
        has("当前已加载页未返回实例，仍可继续加载");
        button("加载更多");
      } else {
        has("当前结果未返回实例（结果不完整）");
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
  if (id.startsWith("DIV-ACTION-")) {
    const mode = id.slice(11);
    if (mode === "cancel") {
      await C.begin();
      mount();
      await settle();
      reset();
      click(button("取消查询"));
      json(call("cancel").args, [], "cancel original args");
      await call("cancel").returned;
      eq(C.m.state.status, "cancelled", "cancel state");
      return;
    }
    await ready(
      page(hits(), "B66-action-next"),
      mode === "partial-select" ? partial : complete,
    );
    if (mode === "select" || mode === "partial-select") {
      const h = C.m.state.pages[0].result.items[0],
        n = C.queries().length;
      click(rowButtons()[0]);
      selected({ ref: h.ref });
      eq(C.queries().length, n, "selection no SDK follow-up");
      if (mode === "partial-select") {
        has("结果不完整");
        check(
          buttons().every(
            (b) => !b.textContent.includes("加载更多") || b.disabled,
          ),
          "partial still cannot more",
        );
      }
      return;
    }
    if (mode === "retry") {
      for (const status of ["failed", "cancelled"]) {
        const p = C.hold(C.m.reload()),
          q = await C.next("def.instances");
        if (status === "failed") C.fail(q);
        else await C.m.cancel();
        await p.catch(() => {});
        await settle();
        reset();
        click(button("重新查询"));
        const x = call("reload"),
          req = await C.next("def.instances");
        C.ok(req, page());
        await x.returned;
        await settle();
        reset();
      }
      return;
    }
    click(button(mode === "more" ? "加载更多" : "重新查询"));
    const x = call(mode === "more" ? "loadMore" : "reload");
    json(x.args, [], "no synthetic params");
    const q = await C.next("def.instances");
    eq(
      q.params.cursor,
      mode === "more" ? "B66-action-next" : "",
      "L6 owns cursor",
    );
    C.ok(
      q,
      page([hits()[2]], mode === "more" ? "B66-next-failure" : undefined),
    );
    await x.returned;
    if (mode === "more") {
      await settle();
      reset();
      const original = C.m.state.query;
      click(button("加载更多"));
      const attempt = call("loadMore");
      C.fail(await C.next("def.instances"));
      failure(await rejectCall(attempt), "loadMore", original);
    }
    return;
  }
  if (id.startsWith("DIV-NATIVE-")) {
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
  if (id.startsWith("DIV-SELECTION-")) {
    const mode = id.slice(14);
    await ready(page(mode === "passive" ? [...hits(), hits()[2]] : hits()));
    const hs = C.m.state.pages[0].result.items;
    const items =
      mode === "namespace"
        ? [{ def: hs[0].def }, { def: hs[1].ref }]
        : mode === "bits"
          ? [
              { ref: hs[1].ref, bits: { lsb: 0, width: 1 }, side: "inside" },
              { def: hs[0].def },
            ]
          : [{ ref: hs[2].ref }, { def: hs[0].def }];
    C.s.select({ snapshotId: C.m.snapshotId, origin: "external", items });
    await settle();
    reset();
    const before = snapshot();
    mount();
    await settle();
    const marked = rowButtons().map((b) =>
      row(b).textContent.includes("实例在选择中"),
    );
    if (mode === "namespace")
      check(
        marked.every((x) => !x),
        "shared definition never marks instances",
      );
    else if (mode === "bits")
      json(
        marked,
        [false, true, false, false, false],
        "only exact object ref with external bits marks",
      );
    else
      json(
        marked,
        [false, false, true, false, false, true],
        "duplicate matching refs both marked without dedup",
      );
    unchanged(before);
    return;
  }
  if (id.startsWith("DIV-LIFE-") && id !== "DIV-LIFE-disposed") {
    const mode = id.slice(9);
    mount({}, mode === "strict");
    await settle();
    eq(C.queries().length, 0, "no mount query");
    eq(C.calls.length, 0, "no mount command");
    eq(C.stats.instances.active, 1, "one instances subscription");
    eq(C.stats.selection.active, 1, "one selection subscription");
    if (mode === "shared") {
      mount({}, false, "B");
      await settle();
      eq(C.stats.instances.active, 2, "two separate mounts");
      unmount();
      await settle();
      eq(C.stats.instances.active, 1, "other mount retained");
    } else if (mode === "replace-instances" || mode === "replace-selection") {
      const n = await fresh();
      mount(
        mode === "replace-instances" ? { instances: n.m } : { selection: n.s },
      );
      await settle();
      eq(
        C.stats[mode === "replace-instances" ? "instances" : "selection"]
          .active,
        0,
        "old unsubscribed",
      );
      eq(
        n.stats[mode === "replace-instances" ? "instances" : "selection"]
          .active,
        1,
        "new subscribed",
      );
    } else if (mode === "unmount") {
      unmount();
      await settle();
      eq(C.stats.instances.active, 0, "own unsubscription");
      eq(C.m.disposed, false, "borrowed live");
      await C.load(query(), page());
    }
    return;
  }
  if (id === "DIV-LIFE-disposed") {
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
  if (id === "DIV-PAGE-identity") {
    await ready(page([hits()[2]], "B66-p2"));
    await more(page([hits()[2], hits()[2]]));
    await settle();
    reset();
    const p = C.m.state.pages[1],
      q = C.m.state.query,
      raw = { B66: "page" };
    override(C.s, "select", () => {
      throw raw;
    });
    click(rowButtons()[2]);
    await settle();
    failure(raw, "select", q, p, 1);
    eq(rowButtons().length, 3, "no cross-page dedup");
    return;
  }
  if (id === "DIV-FIELD-diagnostic") {
    await ready();
    const t = await C.begin({ ...query(), def: "B66-diagnostic" }),
      e = new HierError(
        "transport_closed",
        "transport",
        "B66 original diagnostic",
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
  if (id.startsWith("DIV-RACE-") || id.startsWith("DIV-ERROR-"))
    return raceOrError(id);
  if (id.startsWith("DIV-AX-")) return accessibility(id.slice(7));
  if (id === "DIV-CORE-instances-selection") {
    const ref = await real();
    mount();
    await settle();
    reset();
    has(C.coreDefinition);
    eq(
      C.s.current,
      C.coreDefinitionSelection,
      "UI never auto-selects occurrence",
    );
    const n = C.queries().length;
    click(rowButtons()[C.coreRefIndex]);
    selected({ ref });
    eq(C.queries().length, n, "no implicit path/reveal/properties/SDK call");
    return;
  }
  throw Error("unregistered B case " + id);
}
async function raceOrError(id) {
  const race = id.startsWith("DIV-RACE-"),
    mode = id.slice(race ? 9 : 10);
  await ready(page(hits(), "B66-race-next"));
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
        await C.load({ ...query(), def: "B66-other" }, page([hits()[1]]));
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
        mode === "undefined" ? undefined : Object.freeze({ B66: "raw" }),
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
      C.hold(C.m.load({ ...query(), def: "B66-away" }));
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
    click(button("取消查询"));
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
    const b = button("取消查询");
    b.focus();
    const q = C.sent.find((q) => q.method === "def.instances");
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
    const b = button("重新查询");
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
    await C.load({ ...query(), def: "长".repeat(200) }, page(h));
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
    await C.load(query(), page(hits(), "B66-partial"), partial);
    eq(C.m.state.status, "success", "real partial success");
    json(C.m.state.pages[0].result.items, hits(), "lawful original hits");
    C.s.select({
      snapshotId: C.m.snapshotId,
      origin: "external",
      items: [{ def: query().def }],
    });
    eq(C.s.current.items[0].def, query().def, "definition not occurrence");
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
