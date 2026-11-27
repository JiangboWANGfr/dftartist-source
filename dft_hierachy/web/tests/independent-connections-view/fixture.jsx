// Independent B host using only real public L6 models and the product View.
import React, { StrictMode, Suspense, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Views from "@hier/views";
import { HierClient, HierError } from "@hier/client";
import { ObjectConnectionsModel, SelectionModel } from "@hier/viewmodel";
import {
  context,
  check,
  eq,
  target,
  info,
  endpoints,
  complete,
} from "./public-model.mjs";
import { ref, other, partial } from "./input.mjs";
import { invalid } from "./cases.mjs";
import { CoreWire } from "../independent-properties-panel/core-wire.mjs";
const View = Reflect.get(Views, "ObjectConnectionsView"),
  D = document,
  deps = { HierClient, ObjectConnectionsModel, SelectionModel };
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
    connections: c.m,
    selection: c.s,
    ariaLabel: "B 连接 " + slot,
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
function has(v, slot = "A") {
  check(text(slot).includes(String(v)), "visible original field " + String(v));
}
// Record values/field presence, not insertion order or enumerability, are public.
function json(actual, expected, label) {
  if (Object.is(actual, expected)) return;
  check(
    expected !== null &&
      typeof expected === "object" &&
      actual !== null &&
      typeof actual === "object",
    label,
  );
  const a = Reflect.ownKeys(actual),
    b = Reflect.ownKeys(expected);
  eq(a.length, b.length, label + " own fields");
  for (const key of b) {
    check(a.includes(key), label + " field " + String(key));
    json(actual[key], expected[key], label + "." + String(key));
  }
}
function button(label, slot = "A") {
  const bs = [...region(slot).querySelectorAll("button")].filter(
    (b) =>
      b.textContent.includes(label) ||
      b.getAttribute("aria-label")?.includes(label),
  );
  eq(bs.length, 1, "one native " + label);
  return bs[0];
}
function endpointButtons() {
  return [...region().querySelectorAll("button")].filter(
    (b) =>
      b.textContent.includes("选择整个端点对象") ||
      b.getAttribute("aria-label")?.includes("选择整个端点对象"),
  );
}
function rowList(root = region()) {
  return [...root.querySelectorAll("tbody tr")].filter((r) =>
    endpoints().some((e) =>
      [...r.querySelectorAll("td")].some(
        (td) => td.textContent.trim() === e.kind,
      ),
    ),
  );
}
function group(label) {
  const matches = (x) =>
    ["驱动", "负载"].some((s) =>
      (x.getAttribute("aria-label") || x.textContent.trim()).startsWith(s),
    );
  const hs = [...region().querySelectorAll("*")].filter(
      (x) => matches(x) && ![...x.children].some(matches),
    ),
    h = hs.find((x) =>
      (x.getAttribute("aria-label") || x.textContent.trim()).startsWith(label),
    );
  check(h, "labelled original group " + label);
  if (
    h.hasAttribute("aria-label") &&
    !h.matches("h1,h2,h3,h4,h5,h6,[role=heading]")
  )
    return h.cloneNode(true);
  const following = hs
    .slice(hs.indexOf(h) + 1)
    .find((x) =>
      ["驱动", "负载"].some((s) =>
        (x.getAttribute("aria-label") || x.textContent.trim()).startsWith(s),
      ),
    );
  const range = D.createRange();
  range.setStartAfter(h);
  if (following) range.setEndBefore(following);
  else range.setEnd(region(), region().childNodes.length);
  return range.cloneContents();
}
function coordinate(row, label, lsb, width) {
  const table = row.closest("table"),
    hs = [...table.querySelectorAll("thead th")],
    index = hs.findIndex((h) => h.textContent.includes(label));
  check(index >= 0, "separate labelled column " + label);
  const value = row.querySelectorAll("td")[index]?.textContent ?? "";
  check(
    new RegExp('lsb[\\s:"=：]*' + lsb + "(?![0-9])").test(value),
    "original " + label + " lsb",
  );
  check(
    new RegExp('width[\\s:"=：]*' + width + "(?![0-9])").test(value),
    "original " + label + " width",
  );
}
function command(name, c = C) {
  const calls = c.calls.filter((x) => x.name === name);
  eq(calls.length, 1, "one original " + name);
  if (name === "reload" || name === "cancel")
    json(calls[0].args, [], "no synthetic query arguments");
  return calls[0];
}
function reset(c = C) {
  c.calls.length = 0;
  c.failures.length = 0;
}
function click(b) {
  C.inEvent = true;
  try {
    b.click();
  } finally {
    C.inEvent = false;
  }
}
function selection(item) {
  json(C.s.current.items, [item], "exact one original item");
  eq(C.s.current.origin, "props", "props origin");
  eq(C.s.current.snapshotId, C.m.snapshotId, "model snapshot");
  const call = command("select");
  json(
    call.args,
    [{ snapshotId: C.m.snapshotId, origin: "props", items: [item] }],
    "one original Selection request",
  );
}
function passive(before) {
  eq(C.calls.length, 0, "zero implicit command");
  eq(C.queries().length, before, "zero implicit query");
}
async function ready(t = target(), values) {
  await C.load(t, values);
  mount();
  await settle();
  reset();
}
async function failedState() {
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
const oldState = () => ({
  selection: C.s.current,
  state: C.m.state,
  queries: C.queries().length,
  back: C.s.canGoBack,
  forward: C.s.canGoForward,
});
function unchanged(o) {
  eq(C.s.current, o.selection, "selection unchanged");
  eq(C.m.state, o.state, "state unchanged");
  eq(C.queries().length, o.queries, "query count unchanged");
  eq(C.s.canGoBack, o.back, "back history");
  eq(C.s.canGoForward, o.forward, "forward history");
  eq(C.calls.length, 0, "zero command");
}
async function rejection(call) {
  check(call.returned instanceof Promise, "actual command Promise");
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
    q = await C.next("obj.get");
  C.fail(q);
  return { call, error: await rejection(call) };
}
function failure(e, name = "reload", item, c = C, t = c.actionTarget) {
  eq(c.failures.length, 1, "one callback");
  const r = c.failures[0],
    f = r.failure;
  eq(r.inEvent, false, "feedback outside event stack");
  eq(f.command, name, "source command");
  eq(f.target, t, "original target identity");
  eq(f.error, e, "original error identity");
  check(Object.isFrozen(f), "frozen failure envelope");
  if (item) {
    json(f.item, item, "exact captured selected item");
    check(Object.isFrozen(f.item), "owned frozen item");
    if (f.item.bits)
      check(Object.isFrozen(f.item.bits), "owned frozen requested bits");
  } else eq(Object.hasOwn(f, "item"), false, "no select item on query command");
}
async function real() {
  const opened = await fetch("/core/open", { method: "POST" });
  check(opened.ok, "B own Core open");
  const { id } = await opened.json();
  C = await fresh({ wire: new CoreWire(id) });
  let indexed = false,
    resolve;
  const index = new Promise((r) => {
      resolve = r;
    }),
    off = C.client.onIndexReady(() => {
      indexed = true;
      resolve();
    });
  C.restores.push(off);
  const indexedQuery = async (fn) => {
    let r = await fn();
    if (r.completeness.status === "partial") {
      check(
        r.completeness.reasons.every((x) => x.code === "indexing"),
        "only indexing during fixture lookup",
      );
      if (!indexed) await index;
      r = await fn();
    }
    eq(r.completeness.status, "complete", "real lookup complete");
    return r.result;
  };
  const refs = await indexedQuery(() =>
    C.client.resolvePath("b_tree_top/plain"),
  );
  eq(refs.length, 1, "one actual module occurrence");
  const ports = (await C.client.ports(refs[0])).result,
    p = ports.find((x) => x.name === "y");
  check(p, "independent SV y port");
  eq(p.width, 1, "literal SV width");
  const t = {
    slice: { ref: p.ref, bits: { lsb: 0, width: 1 } },
    reach: "hier",
    side: "inside",
  };
  await C.hold(C.m.load(t));
  eq(C.m.state.status, "success", "real model success");
  eq(C.m.state.data.object.result.ref, p.ref, "real queried port");
  const e = C.m.state.data.drivers.result.find((x) => x.kind === "process");
  check(e, "assign y=d actual process endpoint");
  eq(e.queried.lsb, 0, "actual queried lsb");
  eq(e.queried.width, 1, "actual queried width");
  return { target: t, port: p, endpoint: e };
}
async function generic(id) {
  if (id === "OCV-CORE-vertical") {
    const facts = await real();
    mount();
    await settle();
    reset();
    has(facts.port.ref);
    has(facts.endpoint.ref);
    click(button("选择查询目标"));
    selection(
      facts.target.slice.bits
        ? { ref: facts.port.ref, bits: { lsb: 0, width: 1 }, side: "inside" }
        : { ref: facts.port.ref, side: "inside" },
    );
    reset();
    const bs = endpointButtons(),
      b = bs.find((x) =>
        x.closest("tr")?.textContent.includes(facts.endpoint.ref),
      );
    check(b, "source endpoint button");
    b.scrollIntoView({ block: "center", inline: "nearest" });
    const box = b.getBoundingClientRect();
    verifyNative = async () => {
      await settle();
      selection({ ref: facts.endpoint.ref });
      return { pass: true };
    };
    return {
      native: {
        kind: "click",
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      },
    };
  }
  if (id.startsWith("OCV-INVALID-")) {
    allowBoundary = true;
    const [, key, value] = invalid.find((x) => "OCV-INVALID-" + x[0] === id);
    let v = value;
    if (key === "connections") {
      if (value === "fake")
        v = { state: C.m.state, snapshotId: C.m.snapshotId, disposed: false };
      else {
        C.m.dispose();
        v = C.m;
      }
    } else if (key === "selection") {
      if (value === "fake")
        v = {
          current: C.s.current,
          snapshotId: C.m.snapshotId,
          disposed: false,
        };
      else if (value === "disposed") {
        C.s.dispose();
        v = C.s;
      } else
        v = (
          await fresh(
            value === "unbound"
              ? { unbound: true }
              : { snapshotId: "B58/other" },
          )
        ).s;
    }
    reset();
    mount({ [key]: v });
    await settle();
    check(caught.at(-1) instanceof TypeError, "host original render TypeError");
    eq(C.calls.length, 0, "invalid before command");
    eq(C.stats.properties.adds, 0, "invalid before connection subscribe");
    eq(C.stats.selection.adds, 0, "invalid before selection subscribe");
    return;
  }
  if (id === "OCV-OPTIONAL-undefined") {
    mount({ className: undefined, onCommandError: undefined });
    await settle();
    check(region(), "optional undefined legal");
    passive(0);
    return;
  }
  if (id.startsWith("OCV-STATE-")) {
    const status = id.slice(10);
    if (status === "success") await C.load();
    else if (status === "pending") {
      await C.load();
      await C.begin(target({ slice: { ref: other } }));
    } else if (status === "failed") await failedState();
    else if (status === "cancelled") {
      await C.begin();
      await C.m.cancel();
    }
    mount();
    await settle();
    eq(C.m.state.status, status, "real state");
    const labels = {
      idle: "尚未指定连接目标",
      pending: "加载中",
      failed: "加载失败",
      cancelled: "已取消",
    };
    if (labels[status]) has(labels[status]);
    if (status !== "idle") has(status === "pending" ? other : ref);
    if (status === "pending")
      check(!text().includes(info().name), "old success data hidden");
    if (["failed", "cancelled"].includes(status)) {
      has(C.m.state.error.code);
      has(C.m.state.error.message);
      button("重试");
    }
    if (status === "idle")
      eq(region().querySelectorAll("button").length, 0, "idle no actions");
    if (status === "pending") {
      button("取消");
      eq(region().getAttribute("aria-busy"), "true", "busy pending");
      eq(region().querySelectorAll("button").length, 1, "only cancel");
    }
    if (status === "success") {
      button("刷新");
      button("选择查询目标");
    }
    return;
  }
  if (id.startsWith("OCV-COMPLETE-")) {
    const mode = id.slice("OCV-COMPLETE-".length),
      options = {};
    if (mode.endsWith("empty")) {
      options.drivers = [];
      options.loads = [];
    }
    if (mode === "partial-empty" || mode === "partial-both") {
      options.dc = partial;
      options.lc = partial;
    } else if (mode === "mixed" || mode === "reason-order")
      options.dc = partial;
    await ready(target(), options);
    const d = group("驱动").textContent,
      l = group("负载").textContent;
    if (mode === "complete-empty") {
      check(d.includes("无驱动"), "complete empty driver");
      check(l.includes("无负载"), "complete empty load");
    }
    if (mode === "partial-empty") {
      for (const t of [d, l]) {
        check(t.includes("尚无已返回端点"), "empty partial wording");
        check(t.includes("不完整"), "empty partial not complete");
      }
      check(!d.includes("无驱动"), "not negative guarantee");
      check(!l.includes("无负载"), "not negative guarantee");
    }
    if (mode === "mixed") {
      check(d.includes("partial") || d.includes("不完整"), "driver incomplete");
      check(
        l.includes("complete") || l.includes("完整"),
        "load independent complete",
      );
    }
    if (mode === "partial-both")
      check(
        d.includes("不完整") && l.includes("不完整"),
        "two incomplete groups",
      );
    if (mode === "reason-order") {
      const first = d.indexOf("unsupported"),
        middle = d.indexOf("interface_port"),
        last = d.lastIndexOf("unsupported");
      check(
        first >= 0 && first < middle && middle < last,
        "ordered duplicate reasons retained",
      );
      check(d.includes(partial.reasons[0].at), "original reason at");
    }
    const n = C.queries().length;
    await settle();
    passive(n);
    return;
  }
  if (id.startsWith("OCV-FIELD-")) {
    const mode = id.slice("OCV-FIELD-".length);
    if (mode === "diagnostic") {
      let reads = 0;
      const e = new HierError(
        "transport_closed",
        "transport",
        "B58 diagnostic<&>",
        {},
      );
      Object.defineProperty(e, "data", {
        get() {
          reads++;
          throw undefined;
        },
      });
      const task = await C.begin();
      for (const f of [...C.closes]) if (C.closes.has(f)) f(e);
      await task.p.catch(() => {});
      eq(C.m.state.status, "failed", "real L6 diagnostic");
      mount();
      await settle();
      has("transport_closed");
      has("B58 diagnostic<&>");
      check(
        /诊断|数据/.test(text()) && /不完整|读取失败/.test(text()),
        "read issue notice",
      );
      eq(reads, 1, "view does not re-read raw diagnostic");
      return;
    }
    await ready(
      target(),
      mode === "endpoints" ? { loads: endpoints() } : undefined,
    );
    if (mode === "target") {
      has("整个对象");
      has("未指定");
      const t = target({
        slice: { ref, bits: { lsb: 0, width: 128 } },
        reach: "local",
        side: "inside",
      });
      await C.load(t);
      await settle();
      reset();
      has("local");
      has("inside");
      has("lsb");
      has("width");
      has("128");
    } else if (mode === "object") {
      for (const k of ["name", "pathText", "kind", "inst"]) has(info()[k]);
    } else if (mode === "endpoints") {
      for (const label of ["驱动", "负载"]) {
        const rows = rowList(group(label)),
          values = endpoints();
        eq(
          rows.length,
          values.length,
          label + " all original rows incl duplicate ref",
        );
        for (let i = 0; i < values.length; i++)
          check(
            rows[i].textContent.includes(values[i].kind),
            label + " original endpoint order " + i,
          );
        eq(
          rows.filter((r) => r.textContent.includes("B58:process")).length,
          2,
          label + " duplicate process rows retained",
        );
      }
    } else if (mode === "coordinates") {
      const rows = rowList();
      coordinate(rows[0], "查询对象位段", 0, 3);
      coordinate(rows[0], "端点位段", 6, 3);
      coordinate(rows[5], "端点位段", 0, 0);
      check(
        rows[0].textContent.includes("B58:作用信号-not-process"),
        "separate at ref",
      );
      check(
        rows[0].textContent.includes("作用位置") ||
          [...region().querySelectorAll("th")].some((t) =>
            t.textContent.includes("作用位置"),
          ),
        "at separately labelled, column or inline group",
      );
    } else if (mode === "via-source") {
      const p = endpoints()[0];
      for (const v of [
        p.via[0].from.ref,
        p.via[0].via,
        p.via[0].next[0].slice.ref,
        p.via[0].next[1].slice.ref,
        "data",
        "control",
        "exact",
        "conservative",
        p.source.file,
        p.source.path,
        p.source.contentHash,
      ])
        has(v);
      const originalRow = rowList()[0].textContent;
      check(
        originalRow.indexOf(p.via[0].next[0].slice.ref) <
          originalRow.indexOf(p.via[0].next[1].slice.ref),
        "ordered original continuations",
      );
      for (const label of [/offset|偏移/, /line|行/, /column|列/])
        check(label.test(originalRow), "labelled original source coordinate");
    } else if (mode === "text-safe") {
      has(info().name);
      has(endpoints()[7].value);
      eq(
        region().querySelectorAll("img,script").length,
        0,
        "text nodes not HTML",
      );
      eq(window.B58Injected, undefined, "no injected script");
      check(
        !text().includes("DO-NOT-DISPLAY-B58-EXTENSION"),
        "unknown extensions not shown",
      );
    } else if (mode === "missing-empty") {
      has("未提供");
      has("无边界步骤");
      eq(
        endpointButtons().length,
        endpoints().filter((e) => e.ref).length,
        "no fabricated endpoint identity",
      );
    } else throw Error("unknown field input");
    return;
  }
  if (id.startsWith("OCV-ACTION-")) {
    const mode = id.slice("OCV-ACTION-".length);
    if (mode === "retry-failed") await failedState();
    else if (mode === "retry-cancelled") {
      await C.begin();
      await C.m.cancel();
    } else if (mode === "cancel") {
      await pending();
    } else if (mode === "target-sliced")
      await C.load(
        target({
          slice: { ref, bits: { lsb: 0, width: 128 } },
          side: "inside",
        }),
      );
    else await C.load();
    mount();
    await settle();
    reset();
    if (["reload", "retry-failed", "retry-cancelled"].includes(mode)) {
      click(button(mode === "reload" ? "刷新" : "重试"));
      command("reload");
      eq(C.calls.length, 1, "only reload");
      const call = command("reload"),
        q = await C.next("obj.get");
      await C.finish({ p: call.returned, q, target: C.m.state.target });
    } else if (mode === "cancel") {
      click(button("取消"));
      await command("cancel").returned;
      eq(C.m.state.status, "cancelled", "cancel real task");
    } else if (mode === "target-bare" || mode === "target-sliced") {
      click(button("选择查询目标"));
      selection(
        mode === "target-bare"
          ? { ref }
          : { ref, bits: { lsb: 0, width: 128 }, side: "inside" },
      );
    } else if (mode === "endpoint") {
      click(endpointButtons()[0]);
      selection({ ref: "B58:process" });
    } else if (mode === "no-ref") {
      eq(endpointButtons().length, 7, "only original ref rows have actions");
      const n = C.queries().length;
      click(rowList().at(-1));
      await settle();
      passive(n);
    }
    return;
  }
  if (id.startsWith("OCV-NATIVE-")) {
    await ready();
    const kind = id.slice("OCV-NATIVE-".length),
      before = oldState(),
      b = button("选择查询目标");
    b.focus();
    verifyNative = async () => {
      await settle();
      if (kind.includes("right")) unchanged(before);
      else {
        selection({ ref });
        eq(C.calls.length, 1, "one exact native action");
      }
      return { pass: true };
    };
    const r = b.getBoundingClientRect();
    return { native: { kind, x: r.x + r.width / 2, y: r.y + r.height / 2 } };
  }
  if (id.startsWith("OCV-SELECTION-")) {
    const mode = id.slice("OCV-SELECTION-".length),
      t =
        mode === "exact-target"
          ? target({
              slice: { ref, bits: { lsb: 0, width: 128 } },
              side: "inside",
            })
          : target();
    if (mode !== "passive") await C.load(t);
    mount();
    await settle();
    const external = (items) =>
      C.s.select({ snapshotId: C.m.snapshotId, origin: "external", items });
    if (mode === "exact-target") {
      for (const items of [
        [{ ref }],
        [{ ref, bits: { lsb: 0, width: 128 } }],
        [{ ref, bits: { lsb: 0, width: 127 }, side: "inside" }],
      ]) {
        external(items);
        await settle();
        check(!text().includes("已选中"), "not value-exact target");
      }
      external([{ ref, bits: { lsb: 0, width: 128 }, side: "inside" }]);
      await settle();
      has("已选中");
    } else if (mode === "endpoint-ref") {
      external([
        { ref: "B58:process", bits: { lsb: 0, width: 1 }, side: "inside" },
      ]);
      await settle();
      has("对象在选择中");
    } else {
      external([{ def: "B58:def" }, { ref: other }]);
      await settle();
      eq(C.m.state.status, "idle", "no implicit target");
    }
    const current = C.s.current,
      back = C.s.canGoBack,
      n = C.queries().length;
    reset();
    await settle();
    eq(C.s.current, current, "selection identity unchanged");
    eq(C.s.canGoBack, back, "history unchanged");
    passive(n);
    return;
  }
  if (id.startsWith("OCV-LIFE-")) {
    const mode = id.slice("OCV-LIFE-".length);
    mount({}, mode === "strict");
    await settle();
    eq(C.stats.properties.active, 1, "one connection subscription");
    eq(C.stats.selection.active, 1, "one selection subscription");
    passive(0);
    if (mode === "shared") {
      mount({}, false, "B");
      await settle();
      eq(C.stats.properties.active, 2, "one per mount");
      unmount("A");
      eq(C.stats.properties.active, 1, "other mount retained");
    } else if (mode === "unmount") {
      const task = await C.begin();
      reset();
      unmount();
      await settle();
      eq(C.stats.properties.active, 0, "own unsubscribe");
      passive(1);
      await C.finish(task);
      eq(C.m.disposed, false, "borrowed task/model alive");
    } else if (mode.startsWith("replace-")) {
      const n = await fresh();
      mount(
        mode.endsWith("connections")
          ? { connections: n.m }
          : { selection: n.s },
      );
      await settle();
      eq(
        mode.endsWith("connections")
          ? C.stats.properties.active
          : C.stats.selection.active,
        0,
        "old replaced subscription removed",
      );
      eq(C.m.disposed, false, "old borrowed model live");
    }
    return;
  }
  if (id === "OCV-RACE-published-state") {
    await ready();
    const b = button("选择查询目标");
    C.m.clear();
    reset();
    click(b);
    await settle();
    passive(3);
    return;
  }
  if (id === "OCV-RACE-pointer-target") {
    await ready();
    const b = button("选择查询目标"),
      r = b.getBoundingClientRect();
    betweenNative = async () => {
      await C.load(target({ slice: { ref: other } }));
      await settle();
      reset();
    };
    verifyNative = async () => {
      await settle();
      eq(C.calls.length, 0, "old pointer does not transfer");
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
  if (id.startsWith("OCV-RACE-") || id.startsWith("OCV-ERROR-")) {
    const race = id.startsWith("OCV-RACE-"),
      mode = id.slice(race ? "OCV-RACE-".length : "OCV-ERROR-".length);
    if (!race && mode === "cancel") {
      const task = await pending();
      C.actionTarget = C.m.state.target;
      const off = C.m.subscribe(() => {
        if (C.m.state.status === "cancelled") throw "B58 cancel observer";
      });
      click(button("取消"));
      const e = await rejection(command("cancel"));
      off();
      await task.p.catch(() => {});
      failure(e, "cancel");
      return;
    }
    await ready();
    C.actionTarget = C.m.state.target;
    if (!race && mode === "select") {
      const t = C.m.state.target;
      const off = C.s.subscribe(() => {
        throw undefined;
      });
      click(endpointButtons()[0]);
      await settle();
      off();
      const e = command("select").error;
      check(e instanceof AggregateError, "original Selection aggregate");
      eq(e.errors[0], undefined, "original throw");
      failure(e, "select", { ref: "B58:process" }, C, t);
      selection({ ref: "B58:process" });
      return;
    }
    if (!race && mode === "no-callback") {
      mount({ onCommandError: undefined });
      await settle();
      reset();
      await failedReload();
      has("操作失败");
      return;
    }
    if (!race && (mode === "callback" || mode === "callback-invalidates")) {
      const raw = Object.freeze({ B58: "callback second" });
      mount({
        onCommandError() {
          if (mode === "callback-invalidates") C.m.clear();
          throw raw;
        },
      });
      await settle();
      reset();
      allowBoundary = mode === "callback";
      const { error } = await failedReload();
      if (mode === "callback") {
        const e = caught.at(-1);
        check(e instanceof AggregateError, "host aggregate");
        eq(e.errors[0], error, "original query error");
        eq(e.errors[1], raw, "original callback throw");
      } else eq(caught.length, 0, "invalidation beats callback error render");
      return;
    }
    if (race && mode === "same-target") {
      const { error } = await failedReload();
      failure(error);
      return;
    }
    click(button("刷新"));
    const c = C,
      call = command("reload"),
      q = await C.next("obj.get");
    if (race && (mode === "target-identity" || mode === "away-back")) {
      C.hold(C.m.clear());
      if (mode === "away-back") {
        C.hold(C.m.load(target({ slice: { ref: other } })));
        C.hold(C.m.clear());
      }
      await C.load(target());
      await settle();
      c.fail(q);
      await rejection(call);
      eq(c.failures.length, 0, "old target identity never revived");
      return;
    }
    if (race && mode === "latest-action") {
      click(button("取消"));
      await command("cancel").returned;
      await rejection(call);
      eq(c.failures.length, 0, "newer successful cancel beats reload failure");
      return;
    }
    if (race && mode === "callback-capture") {
      const later = [];
      mount({ onCommandError: (e) => later.push(e) });
      c.fail(q);
      const e = await rejection(call);
      failure(e, "reload", undefined, c);
      eq(later.length, 0, "not latest callback prop");
      return;
    }
    if (race && mode === "uncommitted") {
      let attempted = 0;
      const pending = new Promise(() => {});
      let signalStarted;
      const started = new Promise((resolve) => {
        signalStarted = resolve;
      });
      function Stop() {
        attempted++;
        signalStarted();
        throw pending;
      }
      const later = [];
      startTransition(() =>
        roots.get("A").render(
          <Boundary>
            <Suspense fallback={<b>B pending</b>}>
              <View {...C.props} onCommandError={(e) => later.push(e)} />
              <Stop />
            </Suspense>
          </Boundary>,
        ),
      );
      await started;
      check(attempted > 0, "ordinary suspended render attempted");
      check(
        region() && !D.getElementById("A").textContent.includes("B pending"),
        "uncommitted branch did not replace the old region",
      );
      eq(C.stats.properties.active, 1, "one still-committed view session");
      c.fail(q);
      const e = await rejection(call);
      failure(e, "reload", undefined, c);
      eq(later.length, 0, "uncommitted callback ignored");
      return;
    }
    if (!race && mode === "unmount") unmount();
    else if (!race && mode === "replace") {
      const n = await fresh();
      mount({ selection: n.s });
    } else if (!race && mode === "reload") {
      c.fail(q);
      const e = await rejection(call);
      failure(e, "reload", undefined, c);
      has(c.m.state.error.code);
      has(c.m.state.error.message);
      return;
    } else throw Error("unknown race/error input " + id);
    c.fail(q);
    await rejection(call);
    eq(c.failures.length, 0, "invalidated session consumes late failure");
    return;
  }
  if (id === "OCV-AX-outside") {
    await ready();
    D.getElementById("before").focus();
    C.s.select({
      snapshotId: C.m.snapshotId,
      origin: "external",
      items: [{ ref }],
    });
    await settle();
    eq(D.activeElement, D.getElementById("before"), "no outside focus theft");
    check(
      region().getAttribute("aria-label") === "B 连接 A" ||
        region().getAttribute("aria-labelledby"),
      "named region",
    );
    check(region().querySelector("table th"), "native headers");
    reset();
    const b = button("刷新");
    b.focus();
    C.s.select({
      snapshotId: C.m.snapshotId,
      origin: "external",
      items: [{ ref: other }],
    });
    await settle();
    eq(D.activeElement, b, "still-present button focus");
    return;
  }
  if (id === "OCV-AX-removed") {
    const task = await pending(),
      b = button("取消");
    b.focus();
    await C.finish(task);
    await settle();
    eq(D.activeElement, region(), "removed cancel falls back to own region");
    return;
  }
  if (id === "OCV-AX-tab") {
    await ready();
    D.getElementById("before").focus();
    verifyNative = async (stage) => {
      if (stage === "exit")
        eq(D.activeElement, D.getElementById("after"), "Tab leaves region");
      else check(region().contains(D.activeElement), "native first focus");
      return { pass: true };
    };
    return {
      native: {
        kind: "Tab",
        tabCount: region().querySelectorAll("button").length,
      },
    };
  }
  if (id === "OCV-AX-multiple") {
    await ready();
    mount({}, false, "B");
    await settle();
    const ids = [...D.querySelectorAll("#A [id],#B [id]")].map((x) => x.id);
    eq(new Set(ids).size, ids.length, "isolated IDs");
    click(button("选择查询目标", "B"));
    selection({ ref });
    return;
  }
  if (id === "OCV-AX-scroll") {
    const value = info();
    value.name += "中文".repeat(300);
    await C.load(target(), { object: value });
    mount();
    D.getElementById("A").style.width = "190px";
    await settle();
    eq(
      Math.round(region().getBoundingClientRect().height),
      180,
      "whole region height",
    );
    has(value.name);
    check(
      [region(), ...region().querySelectorAll("*")].some(
        (x) =>
          x.scrollWidth > x.clientWidth &&
          ["auto", "scroll"].includes(getComputedStyle(x).overflowX),
      ),
      "local horizontal scroll",
    );
    return;
  }
  throw Error("unregistered B input " + id);
}
window.BPanel = {
  capable: typeof View === "function",
  async run(id) {
    C = await fresh();
    reset();
    const r = await generic(id);
    await settle();
    return r ?? { pass: true };
  },
  verify: async (stage) => verifyNative(stage),
  between: async () => betweenNative(),
  async control(realCore = false) {
    if (realCore) {
      const facts = await real();
      eq(facts.endpoint.kind, "process", "actual process");
      C.s.select({
        snapshotId: C.m.snapshotId,
        origin: "props",
        items: [{ ref: facts.endpoint.ref }],
      });
      return { pass: true };
    }
    C = await fresh();
    eq(C.queries().length, 0, "constructor zero query");
    await C.load(target(), { dc: partial, reverse: true });
    eq(C.m.state.status, "success", "real partial success");
    json(C.m.state.data.drivers.completeness, partial, "original completeness");
    json(
      C.m.state.data.drivers.result,
      endpoints(),
      "all legal original endpoints",
    );
    await C.m.clear();
    const t = await C.begin();
    await C.m.cancel();
    await t.p.catch(() => {});
    eq(C.m.state.status, "cancelled", "real cancellation");
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
        if (s.active) errors.push(name + " owned subscription retained");
      try {
        for (const e of await c.close()) errors.push(e.name);
      } catch (e) {
        errors.push(String(e));
      }
    }
    await settle();
    if (!allowBoundary && globalErrors.length)
      errors.push("unexpected global window errors: " + globalErrors.length);
    if (unhandled.length)
      errors.push("unhandled rejections: " + unhandled.length);
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
