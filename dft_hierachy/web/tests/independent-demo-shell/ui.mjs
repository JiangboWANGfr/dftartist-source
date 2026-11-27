// Serialized into the actual demo renderer. DOM bindings only, no SDK/model replacements.
export async function uiCommand(action, arg) {
  const D = document,
    fail = (m) => {
      throw Error("B73 UI binding/assertion: " + m);
    },
    check = (v, m) => {
      if (!v) fail(m);
    };
  const visible = (e) => e && e.getClientRects().length > 0 && !e.closest("[hidden],[inert]");
  const name = (e) =>
    e.getAttribute("aria-label") ??
    D.getElementById(e.getAttribute("aria-labelledby"))?.textContent ??
    e.textContent ??
    "";
  const patterns = {
    tree: /层级|hierarchy/i,
    properties: /实例属性|属性|properties/i,
    connections: /对象连接|连接|connections/i,
    source: /设计源码|源码文档|source(?!.*candidate)/i,
    candidates: /源码候选|source.*candidate/i,
    search: /搜索结果|search.*result/i,
    instances: /定义实例|definition.*instance/i,
    path: /路径候选|路径结果|path.*result/i,
  };
  const elements = () =>
    [
      ...D.querySelectorAll(
        '[role="region"],section[aria-label],section[aria-labelledby],[role="tree"]',
      ),
    ].filter(visible);
  function region(kind) {
    const re = patterns[kind];
    let xs = elements().filter((e) => re.test(name(e)));
    if (kind === "source") xs = xs.filter((e) => !patterns.candidates.test(name(e)));
    if (kind === "tree") {
      const tree = D.querySelector('[role="tree"]');
      if (visible(tree)) return tree;
    }
    return xs.find((e) => !xs.some((other) => other !== e && e.contains(other))) ?? null;
  }
  function activeRegion(kind) {
    let e = region(kind);
    if (e) return e;
    const tab = [...D.querySelectorAll('[role="tab"],button')].find(
      (e) => visible(e) && patterns[kind]?.test(name(e)),
    );
    if (tab) tab.click();
    return region(kind);
  }
  const text = (kind) => activeRegion(kind)?.textContent ?? "";
  async function wait(fn) {
    if (fn()) return;
    await new Promise((resolve) => {
      const o = new MutationObserver(() => {
        if (fn()) {
          o.disconnect();
          resolve();
        }
      });
      o.observe(D.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
      if (fn()) {
        o.disconnect();
        resolve();
      }
    });
  }
  function input(kind) {
    const re = kind === "top" ? /顶层|top/i : kind === "search" ? /搜索|search/i : /路径|path/i;
    return [...D.querySelectorAll("input,textarea")].find(
      (e) =>
        visible(e) &&
        re.test(
          e.getAttribute("aria-label") ??
            D.querySelector('label[for="' + e.id + '"]')?.textContent ??
            e.placeholder ??
            e.name,
        ),
    );
  }
  function set(e, value) {
    check(e, "input exists");
    const proto =
      e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(e, value);
    e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function button(root, label) {
    const re = label instanceof RegExp ? label : new RegExp(label, "i");
    const a = [...root.querySelectorAll('button,[role="button"]')].filter(
      (e) => visible(e) && re.test(name(e)),
    );
    return a.find((e) => !e.disabled && e.getAttribute("aria-disabled") !== "true") ?? a[0];
  }
  async function point(e) {
    check(visible(e), "target visible");
    check(!e.disabled && e.getAttribute("aria-disabled") !== "true", "target enabled");
    e.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    await new Promise(requestAnimationFrame);
    const r = e.getBoundingClientRect();
    const p = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    check(e.contains(D.elementFromPoint(p.x, p.y)), "native point hits its intended target");
    return p;
  }
  function row(kind, value) {
    const root = activeRegion(kind);
    if (!root) return null;
    const selector = kind === "tree" ? '[role="treeitem"]' : 'li,tr,[role="listitem"]';
    const xs = [...root.querySelectorAll(selector)].filter(
      (e) =>
        visible(e) && name(e).includes(value) && (kind === "tree" || e.querySelector("button")),
    );
    return xs.find((e) => !xs.some((x) => x !== e && e.contains(x))) ?? null;
  }
  const noProps = () => !/(B_demo_top|B_demo_leaf|\bu0\b|\bu1\b)/.test(text("properties"));
  if (action === "point") {
    const e =
      arg.region === "page"
        ? button(D, arg.text)
        : arg.region === "tree"
          ? row("tree", arg.text)
          : button(activeRegion(arg.region) ?? D, arg.text);
    return point(e);
  }
  if (action === "choicePoint") {
    const choice = () => {
      const root = activeRegion(arg.region);
      if (!root) return null;
      if (arg.region === "path") {
        // The frozen path input has one match; refs are opaque, not display names.
        const xs = [...root.querySelectorAll("tbody tr button")].filter(visible);
        return xs.length === 1 ? xs[0] : null;
      }
      if (arg.region === "candidates") {
        if (arg.addressKind === "definition") {
          const xs = [...root.querySelectorAll("ul > li > button")].filter(
            (e) =>
              visible(e) && [...e.querySelectorAll("span")].some((s) => s.textContent === "定义"),
          );
          return xs.length === 1 ? xs[0] : null;
        }
        const span = arg.span;
        check(span, "original source text range for candidate binding");
        const label = span.line + ":" + span.column + "–" + span.line + ":" + span.endColumn;
        const xs = [...root.querySelectorAll("ul > li > button")].filter(
          (e) => visible(e) && e.textContent.includes(label),
        );
        // Original fixture: two occurrences of this exact sum declaration.
        return xs.length === 2 ? xs[arg.occurrenceIndex] : null;
      }
      const r = row(arg.region, arg.text);
      return r ? button(r, arg.action ?? /确认|选择|select|confirm/i) : null;
    };
    await wait(() => {
      const e = choice();
      return e && !e.disabled && e.getAttribute("aria-disabled") !== "true";
    });
    return point(choice());
  }
  if (action === "input") {
    set(input(arg.kind), arg.value);
    return;
  }
  if (action === "inputEquals") {
    check(input(arg.kind)?.value === arg.value, "original query text retained");
    return;
  }
  if (action === "submitPoint") {
    const i = input(arg);
    check(i, "form input");
    return point(
      button(i.closest("form") ?? i.parentElement, /提交|查找|搜索|定位|search|resolve|submit/i),
    );
  }
  if (action === "configureOpen") {
    const s = [...D.querySelectorAll("select")].find(
      (s) =>
        [...s.options].some((o) => o.value === "source") &&
        [...s.options].some((o) => o.value === "filelist"),
    );
    if (s) {
      s.value = arg.kind;
      s.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      const radio = D.querySelector('input[type="radio"][value="' + arg.kind + '"]');
      check(radio, "source/filelist choice");
      radio.click();
    }
    set(input("top"), arg.top);
    return;
  }
  if (action === "ready") {
    await wait(() => !!row("tree", arg ?? "B_demo_top"));
    return;
  }
  if (action === "initialDesign") {
    await wait(() => !!row("tree", arg));
    check(D.querySelectorAll('[role="treeitem"]').length === 1, "only root initially loaded");
    check(!D.querySelector('[role="treeitem"][aria-selected="true"]'), "no implicit selection");
    check(!text("properties").includes(arg), "no implicit properties");
    check(!activeRegion("source")?.querySelector("pre > code"), "no implicit source");
    return;
  }
  if (action === "sourceHighlightPattern") {
    await wait(() =>
      [...(activeRegion("source")?.querySelectorAll("mark") ?? [])].some((e) =>
        new RegExp(arg).test(e.textContent),
      ),
    );
    return;
  }
  if (action === "initial") {
    await wait(() => !!row("tree", "B_demo_top"));
    check(
      !D.querySelector('[role="treeitem"][aria-selected="true"]'),
      "no automatic first selection",
    );
    check(noProps(), "no implicit properties");
    check(!activeRegion("source")?.querySelector("pre > code"), "no implicit source");
    return;
  }
  if (action === "treeContains") {
    await wait(() => arg.every((s) => row("tree", s)));
    return;
  }
  if (action === "property") {
    await wait(() => text("properties").includes(arg));
    return;
  }
  if (action === "notProperty") {
    check(!text("properties").includes(arg), "old target absent");
    return;
  }
  if (action === "noProperties") {
    check(noProps(), "definition/path list must not pick occurrence");
    return;
  }
  if (action === "source") {
    await wait(() =>
      activeRegion("source")?.querySelector("pre > code")?.textContent.includes(arg),
    );
    return;
  }
  if (action === "sourceFailure") {
    await wait(() => text("source").includes(arg));
    return;
  }
  if (action === "sourceKind") {
    const s = [...D.querySelectorAll("select")].find(
      (s) =>
        [...s.options].some((o) => o.value === "definition") &&
        [...s.options].some((o) => o.value === "instantiation") &&
        [...s.options].some((o) => o.value === "statement"),
    );
    check(s, "explicit SourceKind choice");
    s.value = arg;
    s.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (action === "instances") {
    await wait(() => arg.every((s) => text("instances").includes(s)));
    return;
  }
  if (action === "explicitKindAction") {
    const s = [...D.querySelectorAll("select")].find(
      (s) =>
        [...s.options].some((o) => o.value === "definition") &&
        [...s.options].some((o) => o.value === arg),
    );
    check(s, "visible source kind control");
    const load = button(D, /加载当前|载入当前|显示当前|load current/i);
    if (load && !load.disabled) return point(load);
    check(
      s.value !== arg,
      "no reachable explicit current-definition action: selected=" +
        s.value +
        ", options=" +
        [...s.options].map((o) => o.value).join(",") +
        "; dispatching change for an already-selected sole option would fake a user action",
    );
    s.value = arg;
    s.dispatchEvent(new Event("change", { bubbles: true }));
    return null;
  }
  if (action === "sourceHighlight") {
    await wait(() =>
      [...(activeRegion("source")?.querySelectorAll("mark") ?? [])].some((e) =>
        e.textContent.includes(arg),
      ),
    );
    return;
  }
  if (action === "pathContains") {
    await wait(() => text("path").includes(arg));
    return;
  }
  if (action === "connections") {
    await wait(() => text("connections").includes(arg));
    check(/local/.test(text("connections")), "local reach displayed");
    return;
  }
  if (action === "candidates") {
    await wait(() => {
      const r = activeRegion("candidates");
      return r && r.querySelectorAll("li button,tr button").length >= arg;
    });
    return;
  }
  if (action === "sourceState") {
    const r = activeRegion("source");
    check(r?.querySelector("pre > code"), "loaded original document");
    return {
      code: r.querySelector("pre > code").textContent,
      marks: [...r.querySelectorAll("mark")].map((m) => m.textContent),
      scroll: r.querySelector("pre")?.scrollTop ?? 0,
      candidates: [...activeRegion("candidates").querySelectorAll("ul > li")].map(
        (e) => e.textContent,
      ),
    };
  }
  if (action === "singleTargetState")
    return { properties: text("properties"), source: await uiStateSource() };
  async function uiStateSource() {
    const r = activeRegion("source");
    return {
      code: r?.querySelector("pre > code")?.textContent ?? null,
      marks: [...(r?.querySelectorAll("mark") ?? [])].map((m) => m.textContent),
    };
  }
  if (action === "openCloseDisabled") {
    for (const re of [/打开|open/i, /关闭设计|close design/i]) {
      const b = button(D, re);
      check(
        b && (b.disabled || b.getAttribute("aria-disabled") === "true"),
        "controls disabled while picker pending",
      );
    }
    return;
  }
  if (action === "cancelled") {
    await wait(() => /已取消|取消选择|cancelled|canceled/i.test(D.body.textContent));
    return;
  }
  if (action === "closed") {
    await wait(
      () => !D.querySelector('[role="treeitem"]') && /设计已关闭/.test(D.body.textContent),
    );
    check(noProps(), "closed properties cleared");
    check(!activeRegion("source")?.querySelector("pre > code"), "closed source cleared");
    return;
  }
  if (action === "failure") {
    await wait(() =>
      /B_demo_broken|syntax|expected|编译失败|打开失败|error|错误/i.test(D.body.textContent),
    );
    return;
  }
  if (action === "hasClose") {
    const b = button(D, /关闭设计|close design/i);
    return !!b && !b.disabled && b.getAttribute("aria-disabled") !== "true";
  }
  if (action === "selectSameTurn") {
    for (const label of arg) {
      const r = row("tree", label);
      check(r, "selection row");
      r.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    }
    return;
  }
  if (action === "focusInput") {
    const e = input(arg);
    check(e, "focus input");
    e.focus();
    return;
  }
  if (action === "focusRemains") {
    check(D.activeElement === input(arg), "external selection must not steal focus");
    return;
  }
  if (action === "sourcePoint") {
    const code = activeRegion("source")?.querySelector("pre > code");
    check(code, "actual SourceView code");
    const walker = D.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const i = n.data.indexOf(arg);
      if (i < 0) continue;
      const range = D.createRange();
      range.setStart(n, i);
      range.setEnd(n, i + arg.length);
      const r = range.getBoundingClientRect();
      if (r.width && r.height)
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }
    fail("source position text not found");
  }
  if (action === "sourceSpan") {
    const code = activeRegion("source")?.querySelector("pre > code")?.textContent;
    check(typeof code === "string", "actual source text");
    const at = code.indexOf(arg);
    check(at >= 0, "source target text");
    const prefix = code.slice(0, at).split("\n");
    return {
      line: prefix.length,
      column: prefix.at(-1).length + 1,
      endColumn: prefix.at(-1).length + 1 + arg.length,
    };
  }
  if (action === "externalPathReady") {
    await wait(() => activeRegion("path")?.querySelectorAll("tbody tr button").length === 1);
    return;
  }
  if (action === "activateExternalPath") {
    const xs = activeRegion("path")?.querySelectorAll("tbody tr button");
    check(xs?.length === 1, "one explicitly queried path target");
    // Real PathResolutionView action (origin=external), not a tree click or model hook.
    // DOM/AT click does not itself move DOM focus.
    xs[0].click();
    return;
  }
  if (action === "layout") {
    for (const k of [
      "tree",
      "source",
      "candidates",
      "properties",
      "connections",
      "search",
      "instances",
      "path",
    ]) {
      const r = activeRegion(k);
      check(visible(r), "named panel " + k);
      check(r.getBoundingClientRect().height > 0, "positive height " + k);
    }
    const csp = D.querySelector('meta[http-equiv="Content-Security-Policy" i]')?.content;
    check(csp, "local CSP");
    const scripts = csp.match(/script-src\s+([^;]+)/)?.[1] ?? "";
    check(scripts && !/https?:|\*/.test(scripts), "no remote/wildcard script policy");
    return;
  }
  fail("unknown frozen action " + action);
}
