// Agent B oracle: approved DESIGN 6.7 at b753daa; no implementation/prototype assumptions.
import assert from "node:assert/strict";
import { clickExpansionTarget } from "./expansion-target.mjs";
// Parameters below are independent input partitions, not a claim of production execution.
export const cases = [];
const add = (id, covers, input, expected, run) =>
  cases.push({
    id,
    covers,
    input,
    expected,
    basis: "DESIGN 6.7.1-4; 6.5; 6.6",
    run,
  });

add(
  "UI-KEY-home-end-prefix",
  ["K02"],
  "40 loaded siblings out of 5001, hidden pages and virtual DOM",
  "End reaches current real status, Home reaches root, no speculative paging",
  async (page) => {
    await setup(page, { dataset: "paged", pageSize: 40 }, true, {
      height: 280,
      rowHeight: 28,
      overscan: 2,
    });
    const root = (await state(page)).rows[0];
    await command(page, "setExpanded", root.id, true);
    await settle(page);
    await enter(page);
    const before = await state(page);
    assert.equal(before.rows.at(-1).kind, "status");
    await key(page, "End");
    let d = await dom(page);
    assert.ok(d.tree.active.text.includes("加载更多"));
    await key(page, "Home");
    d = await dom(page);
    assert.ok(d.tree.active.text.includes("paged"));
    const after = await state(page);
    unchanged(before, after);
    assert.equal(after.queries.length, before.queries.length);
  },
);
add(
  "UI-AX-error",
  ["A06", "A11"],
  "real select observer error, local accessible error",
  "error text exposed in Chromium AX tree; no unrequired live-region role frozen",
  async (page, context) => {
    await page.evaluate(() => window.UI.setup());
    await page.evaluate(() => window.UI.seed());
    await page.evaluate(() => {
      window.UI.configure({ callbackMode: "none", fault: "select" });
      window.UI.mount();
    });
    await settle(page);
    await click(page, instance("B-mixed-root"));
    const cdp = await context.newCDPSession(page);
    try {
      const { nodes } = await cdp.send("Accessibility.getFullAXTree");
      const exposed = nodes.filter((n) => !n.ignored);
      const message = exposed.find((n) => n.name?.value?.includes("操作失败"));
      assert.ok(message);
      // Discoverability is normative; alert/status/aria-live are not mandated wrappers.
    } finally {
      await cdp.detach();
    }
  },
);

const state = (page) => page.evaluate(() => window.UI.state());
const settle = (page) => page.evaluate(() => window.UI.settle());
const dom = (page, number = 1) =>
  page.evaluate((n) => window.UI.dom(n), number);

add(
  "UI-PAGE-independent-consumer",
  ["I11"],
  "same SDK children consumer held before tree opens; UI cancels its page",
  "other SDK waiter survives; no SDK close or wire cancellation; cancelled tree unchanged on late success",
  async (page) => {
    await setup(page, { hold: ["inst.children"] }, true);
    await page.evaluate(() => window.UI.independentChildren("B-mixed-root"));
    await enter(page);
    await key(page, "ArrowRight");
    const before = await state(page);
    assert.equal(before.rows.find(status).page, "pending");
    assert.equal(
      before.queries.filter((x) => x.method === "inst.children").length,
      1,
    );
    await click(page, status);
    const cancelled = await state(page);
    assert.equal(cancelled.rows.find(status).page, "cancelled");
    assert.equal(cancelled.closed, false);
    assert.equal(cancelled.wireCancels, 0);
    await page.evaluate(() => window.UI.release("inst.children"));
    const result = await page.evaluate(() => window.UI.independentResult());
    assert.equal(result.items[0].ref, "B-child-a");
    await settle(page);
    assert.equal((await state(page)).rows.find(status).page, "cancelled");
    unchanged(before, await state(page));
  },
);

async function setup(page, options = {}, seed = false, props = {}) {
  await page.evaluate((o) => window.UI.setup(o), options);
  if (seed)
    await page.evaluate((full) => window.UI.seed(full), seed === "full");
  await page.evaluate((p) => window.UI.mount(p), props);
  await settle(page);
}
async function tree(page, number = 1) {
  const d = await dom(page, number);
  assert.ok(d.tree, "real tree DOM must be present");
  const t = page.locator("#ui-view-" + number).getByRole("tree");
  assert.equal(await t.count(), 1);
  return t;
}
async function row(page, predicate, number = 1) {
  const s = await state(page),
    d = await dom(page, number);
  const index = s.rows.findIndex(predicate);
  assert.ok(index >= 0, "expected published row");
  const rows = (await tree(page, number)).getByRole("treeitem");
  const count = await rows.count();
  assert.equal(
    count,
    s.rows.length,
    "small fixture: all published rows fit viewport",
  );
  assert.equal(d.rows.length, count);
  return { locator: rows.nth(index), data: s.rows[index], dom: d.rows[index] };
}
const instance = (ref) => (r) =>
  r.kind === "instance" && (!ref || r.ref === ref);
const status = (r) => r.kind === "status";
const scope = (r) => r.kind === "scope";
async function click(page, predicate, modifiers) {
  const r = await row(page, predicate);
  await r.locator.click(modifiers ? { modifiers } : {});
  await settle(page);
  return r.data;
}
async function enter(page) {
  const before = page.locator("#ui-before");
  assert.equal(await before.count(), 1);
  await before.focus();
  await before.press("Tab");
  await settle(page);
  assert.equal((await dom(page)).tree.focus, true);
}
async function key(page, value) {
  const t = await tree(page);
  await t.press(value);
  await settle(page);
}
async function active(page) {
  const d = await dom(page),
    s = await state(page);
  assert.equal(
    d.tree.activeOwn,
    true,
    "active descendant must exist within its own tree",
  );
  const i = d.rows.findIndex((r) => r.id === d.tree.activeId);
  assert.ok(i >= 0);
  assert.equal(
    d.rows.length,
    s.rows.length,
    "small fixture used for RowId mapping",
  );
  return s.rows[i];
}
async function go(page, id) {
  await enter(page);
  await key(page, "Home");
  const s = await state(page),
    index = s.rows.findIndex((r) => r.id === id);
  assert.ok(index >= 0);
  for (let i = 0; i < index; i++) await key(page, "ArrowDown");
  assert.equal((await active(page)).id, id);
}
async function command(page, name, ...args) {
  return page.evaluate(({ name, args }) => window.UI.command(name, ...args), {
    name,
    args,
  });
}
async function projection(page) {
  const s = await state(page),
    d = await dom(page);
  assert.equal(d.rows.length, s.rows.length);
  for (let i = 0; i < s.rows.length; i++) {
    const r = s.rows[i],
      e = d.rows[i];
    assert.equal(e.level, String(r.depth + 1));
    if (r.kind === "instance") {
      assert.ok(e.text.includes(r.name));
      assert.equal(e.expanded, r.expandable ? String(r.expanded) : null);
    } else {
      if (r.kind === "scope") {
        assert.ok(e.text.includes(r.label));
        assert.equal(e.expanded, String(r.expanded));
      }
      assert.equal(e.selected, null);
    }
  }
  return { s, d };
}
function selected(d) {
  return d.rows.filter((r) => r.selected === "true");
}
function unchanged(before, after) {
  assert.deepEqual(after.selection, before.selection);
  assert.equal(after.back, before.back);
  assert.equal(after.forward, before.forward);
}
function windowCheck(s, d, height, rowHeight, overscan) {
  const upper = Math.min(
    s.rows.length,
    Math.ceil(height / rowHeight) + 2 * overscan + 2,
  );
  assert.ok(
    d.rows.length > 0 && d.rows.length <= upper,
    "virtual DOM upper bound including active row",
  );
  assert.ok(Math.abs(d.scroll.height - height) <= 1, "configured viewport");
  const intersect = d.rows.filter(
    (r) => r.bottom > d.tree.top && r.top < d.tree.top + height,
  );
  assert.ok(intersect.length > 0, "viewport cannot be blank");
  assert.ok(Math.min(...intersect.map((x) => x.top)) <= d.tree.top + 1);
  assert.ok(
    Math.max(...intersect.map((x) => x.bottom)) >=
      Math.min(d.tree.top + height, d.tree.top + d.scroll.total) - 1,
  );
  for (const r of d.rows) assert.ok(Math.abs(r.height - rowHeight) <= 1);
}
for (const [prop, keys, coverage] of [
  [
    "height",
    [
      "zero",
      "negative",
      "nan",
      "infinity",
      "minusInfinity",
      "text",
      "nil",
      "object",
      "yes",
      "bigint",
      "array",
    ],
    "U03",
  ],
  [
    "rowHeight",
    [
      "zero",
      "negative",
      "nan",
      "infinity",
      "minusInfinity",
      "text",
      "nil",
      "object",
      "yes",
      "bigint",
      "array",
    ],
    "U04",
  ],
  [
    "overscan",
    [
      "negative",
      "fraction",
      "nan",
      "infinity",
      "minusInfinity",
      "text",
      "nil",
      "object",
      "yes",
      "bigint",
      "array",
    ],
    "U05",
  ],
  ["ariaLabel", ["empty", "blank", "number", "nil", "object"], "U06"],
  ["className", ["number", "nil", "object"], "U14"],
  ["onCommandError", ["number", "nil", "object"], "U14"],
])
  for (const value of keys)
    add(
      "UI-PROP-" + prop + "-" + value,
      [coverage],
      prop + "=" + value + " at JavaScript boundary",
      "render TypeError, no subscription/command/coercion",
      async (page) => {
        await page.evaluate(() => window.UI.setup());
        await page.evaluate(
          ({ prop, value }) => window.UI.runtimeProp(prop, value),
          { prop, value },
        );
        await page.evaluate(() => window.UI.mount());
        await settle(page);
        const s = await state(page);
        assert.ok(s.boundaryTypes.length > 0);
        assert.ok(s.boundaryTypes.every(Boolean));
        assert.equal(s.calls.length, 0);
        assert.equal(s.queries.length, 0);
        assert.equal(s.subscriptions.tree.adds, 0);
        assert.equal(s.subscriptions.selection.adds, 0);
      },
    );
for (const kind of ["tree", "selection", "unbound", "mismatch"])
  add(
    "UI-BIND-" + kind,
    [
      kind === "tree"
        ? "U08"
        : kind === "selection"
          ? "U09"
          : kind === "unbound"
            ? "U10"
            : "U11",
    ],
    "invalid model binding: " + kind,
    "render TypeError, no subscriptions or commands",
    async (page) => {
      await page.evaluate(() => window.UI.setup());
      await page.evaluate((k) => window.UI.invalidModel(k), kind);
      await page.evaluate(() => window.UI.mount());
      await settle(page);
      const s = await state(page);
      assert.ok(s.boundaryTypes.length > 0 && s.boundaryTypes.every(Boolean));
      assert.equal(s.calls.length, 0);
      for (const stat of Object.values(s.subscriptions))
        assert.equal(stat.adds, 0);
    },
  );
add(
  "UI-PROP-multiple",
  ["U12"],
  "height=0 and blank label",
  "TypeError without validation-order/message oracle",
  async (page) => {
    await page.evaluate(() => window.UI.setup());
    await page.evaluate(() => {
      window.UI.runtimeProp("height", "zero");
      window.UI.runtimeProp("ariaLabel", "blank");
    });
    await page.evaluate(() => window.UI.mount());
    await settle(page);
    const s = await state(page);
    assert.ok(s.boundaryTypes.every(Boolean));
    assert.ok(s.boundaryTypes.length);
    assert.equal(s.calls.length, 0);
    assert.equal(s.subscriptions.tree.adds, 0);
    assert.equal(s.subscriptions.selection.adds, 0);
  },
);
for (const opts of [
  { height: 0.5, rowHeight: 0.5, overscan: 0, className: "" },
  { height: 0.5, rowHeight: 0.5, overscan: -0 },
])
  add(
    "UI-PROP-fraction-" + cases.length,
    ["U02"],
    "positive fractional dimensions; overscan zero/-zero",
    "accepted without rounding validation; host owns models",
    async (page) => {
      await setup(page, {}, false, opts);
      const s = await state(page);
      assert.deepEqual(s.boundaryTypes, []);
      assert.equal(s.calls.length, 0);
      assert.equal(s.disposed, false);
      assert.equal(s.closed, false);
    },
  );
for (const omitted of ["none", "rowHeight", "overscan", "both"])
  add(
    "UI-PROP-default-" + omitted,
    ["U01", "U07"],
    "5001 roots, defaults with explicit undefined " + omitted,
    "28px rows, per-side2 bound, no model mutation",
    async (page) => {
      await page.evaluate(() => window.UI.setup({ dataset: "wide" }));
      await page.evaluate(() => window.UI.seed());
      if (omitted === "rowHeight" || omitted === "both")
        await page.evaluate(() => window.UI.runtimeProp("rowHeight", "undef"));
      if (omitted === "overscan" || omitted === "both")
        await page.evaluate(() => window.UI.runtimeProp("overscan", "undef"));
      await page.evaluate(() => window.UI.mount({ height: 280 }));
      await settle(page);
      const s = await state(page),
        d = await dom(page);
      windowCheck(s, d, 280, 28, 2);
      assert.equal(s.queries.length, 1);
    },
  );
add(
  "UI-PROP-borrowed",
  ["U13", "I01"],
  "frozen props, normal rerender, host then loads roots",
  "no mutation/query on render, borrowed models still usable",
  async (page) => {
    await setup(page);
    const before = await state(page);
    await page.evaluate(() => window.UI.mount());
    await settle(page);
    assert.equal((await state(page)).queries.length, 0);
    await command(page, "loadRoots");
    await settle(page);
    const s = await state(page);
    assert.equal(s.root, "success");
    assert.equal(s.disposed, false);
    assert.equal(s.closed, false);
    assert.equal(s.treeFrozen, false);
    assert.equal(s.selectionFrozen, false);
    unchanged(before, s);
  },
);
for (const gesture of ["click", "Enter", "Space"])
  add(
    "UI-SELECT-" + gesture,
    ["I06", "I07", "I08", "S15"],
    "same-named instances; " + gesture + " twice on one real row",
    "one item/origin tree/snapshot; duplicate history no-op",
    async (page) => {
      await setup(page, {}, "full");
      const target = (await state(page)).rows.find(instance("B-child-b"));
      if (gesture !== "click") await go(page, target.id);
      const before = (await state(page)).calls.length;
      if (gesture === "click") await click(page, (r) => r.id === target.id);
      else await key(page, gesture);
      const first = await state(page);
      assert.deepEqual(first.selection, {
        snapshotId: first.snapshotId,
        origin: "tree",
        items: [{ ref: target.ref }],
      });
      if (gesture === "click") await click(page, (r) => r.id === target.id);
      else await key(page, gesture);
      const second = await state(page);
      assert.equal(
        second.calls.slice(before).filter((x) => x.name === "select").length,
        2,
      );
      await command(page, "back");
      assert.equal((await state(page)).selection.items.length, 0);
      assert.equal((await state(page)).back, false);
      await command(page, "forward");
      assert.deepEqual((await state(page)).selection, first.selection);
    },
  );
for (const modifier of ["Control", "Shift"])
  add(
    "UI-SELECT-" + modifier,
    ["S15"],
    modifier + " click with two external items",
    "ordinary single replacement, no range/multiselect editing",
    async (page) => {
      await setup(page, {}, "full");
      await page.evaluate(() =>
        window.UI.external([{ ref: "B-child-a" }, { ref: "B-child-e" }]),
      );
      await click(page, instance("B-child-b"), [modifier]);
      const s = await state(page);
      assert.deepEqual(s.selection.items, [{ ref: "B-child-b" }]);
      assert.equal(s.selection.origin, "tree");
    },
  );
add(
  "UI-EXPAND-control",
  ["I09"],
  "instance explicit expansion control click",
  "one setExpanded only, selection/history unchanged",
  async (page) => {
    await setup(page, {}, true);
    const before = await state(page),
      r = await row(page, instance("B-mixed-root"));
    await clickExpansionTarget({ page, row: r.locator, rowId: r.data.id });
    await settle(page);
    const s = await state(page);
    unchanged(before, s);
    assert.deepEqual(
      s.calls.slice(before.calls.length).map((x) => x.name),
      ["setExpanded"],
    );
    assert.equal(s.rows.find((x) => x.id === r.data.id).expanded, true);
  },
);
for (const gesture of ["click", "Enter", "Space"])
  add(
    "UI-SCOPE-" + gesture,
    ["I10", "K12"],
    "scope activation " + gesture + " with external selection",
    "local open/close only; no query/selection",
    async (page) => {
      await setup(page, {}, "full");
      await page.evaluate(() => window.UI.external([{ ref: "B-child-b" }]));
      const r = (await state(page)).rows.find(scope);
      const before = await state(page);
      if (gesture === "click") await click(page, (x) => x.id === r.id);
      else {
        await go(page, r.id);
        await key(page, gesture);
      }
      const s = await state(page);
      unchanged(before, s);
      assert.equal(s.queries.length, before.queries.length);
      assert.deepEqual(
        s.calls.slice(before.calls.length).map((x) => x.name),
        ["setExpanded"],
      );
      assert.equal(s.rows.find((x) => x.id === r.id).expanded, false);
    },
  );
for (const outcome of [
  "success",
  "failed",
  "cancelled",
  "partial",
  "duplicate",
])
  add(
    "UI-PAGE-" + outcome,
    ["I11", "I12", "I13", "I14", "I18", "A04", "A06"],
    "committed first page; held second page becomes " + outcome,
    "prefix retained, opaque cursor reused for retry; bad replies never become success",
    async (page) => {
      await setup(page, {}, true);
      const root = (await state(page)).rows.find(instance("B-mixed-root"));
      await command(page, "setExpanded", root.id, true);
      await settle(page);
      await page.evaluate(() => window.UI.hold("inst.children"));
      const prefix = (await state(page)).rows
        .filter(instance())
        .map((x) => x.ref);
      const p = (await state(page)).rows.find(status);
      await click(page, (r) => r.id === p.id);
      assert.equal((await state(page)).rows.find(status).page, "pending");
      if (outcome === "cancelled") await click(page, status);
      else {
        if (outcome === "partial" || outcome === "duplicate")
          await page.evaluate((m) => window.UI.malformed(m), outcome);
        await page.evaluate(
          (fail) => window.UI.release("inst.children", fail),
          outcome === "failed",
        );
      }
      await settle(page);
      let s = await state(page);
      for (const ref of prefix) assert.ok(s.rows.some((x) => x.ref === ref));
      const request = s.queries
        .filter((x) => x.method === "inst.children")
        .at(-1);
      assert.equal(request.params.cursor, "B-page/opaque.2");
      const r = s.rows.find((x) => x.id === root.id);
      assert.equal(
        r.children.status,
        outcome === "success"
          ? "success"
          : outcome === "cancelled"
            ? "cancelled"
            : "failed",
      );
      if (outcome === "failed" || outcome === "cancelled") {
        const text = (await row(page, status)).dom.text;
        assert.ok(
          text.includes(
            outcome === "failed" ? "加载失败，重试" : "已取消，重试",
          ),
        );
        if (outcome === "failed") {
          assert.ok(text.includes("not_found"));
          assert.ok(text.includes("B Core retry"));
        }
        await click(page, status);
        const now = await state(page);
        assert.equal(now.queries.at(-1).params.cursor, request.params.cursor);
        await page.evaluate(() => window.UI.release("inst.children"));
        await settle(page);
        assert.equal(
          (await state(page)).rows.find((x) => x.id === root.id).children
            .status,
          "success",
        );
      }
      if (outcome === "partial") {
        assert.equal(s.closed, true);
        assert.equal(r.children.error.code, "protocol_error");
      }
      if (outcome === "duplicate")
        assert.equal(r.children.error.code, "inconsistent_reply");
    },
  );
add(
  "UI-ROWS-projection",
  ["I15", "I16", "I17", "I19"],
  "mixed same/escaped/array/HTML/Unicode paths, cross-page scope and mode toggles",
  "exact published order/depth/labels; stable IDs, no HTML execution or implicit queries",
  async (page) => {
    await setup(page, {}, "full");
    await projection(page);
    const before = await state(page);
    const ids = Object.fromEntries(
      before.rows.map((r) => [
        r.ref ?? r.scopePath?.join("\u0000") ?? r.id,
        r.id,
      ]),
    );
    assert.ok(before.rows.some(scope));
    assert.equal(await page.evaluate(() => window.B_xss ?? 0), 0);
    await command(page, "setShowGenerateScopes", false);
    await settle(page);
    await projection(page);
    assert.equal((await state(page)).rows.some(scope), false);
    await command(page, "setShowGenerateScopes", true);
    await settle(page);
    const { s } = await projection(page);
    assert.equal(s.queries.length, before.queries.length);
    unchanged(before, s);
    for (const r of s.rows)
      assert.equal(r.id, ids[r.ref ?? r.scopePath?.join("\u0000") ?? r.id]);
  },
);
add(
  "UI-SELECT-external",
  ["S01", "S03", "S04", "A03"],
  "two visible refs, one unloaded ref, then definition; outside focus",
  "all direct instance highlights; preserve payload/history, no auto query/reveal/focus steal",
  async (page) => {
    await setup(page, {}, "full");
    await page.locator("#ui-after").focus();
    await page.evaluate(() =>
      window.UI.external([
        { ref: "B-child-a" },
        { ref: "B-child-e" },
        { ref: "B-unloaded" },
      ]),
    );
    await settle(page);
    const s = await state(page),
      d = await dom(page);
    assert.equal(selected(d).length, 2);
    assert.equal(d.focused, "ui-after");
    const count = s.queries.length,
      call = s.calls.length;
    await page.evaluate(() => window.UI.external([{ def: "B-ui-def" }]));
    await settle(page);
    const now = await state(page);
    assert.deepEqual(now.selection.items, [{ def: "B-ui-def" }]);
    assert.equal(now.queries.length, count);
    assert.equal(
      now.calls.slice(call).some((x) => x.name === "reveal"),
      false,
    );
    assert.equal(selected(await dom(page)).length, 0);
    assert.equal((await dom(page)).focused, "ui-after");
  },
);
for (const kind of ["port", "signal"])
  add(
    "UI-REVEAL-owner-" + kind,
    ["S02", "E01"],
    "external " + kind + " with bits/side, target in later child page",
    "owner highlighted; original payload/history retained",
    async (page) => {
      await setup(page, {}, true);
      const item = {
        ref: kind === "port" ? "B-port-target" : "B-signal-target",
        bits: { lsb: 2, width: 3 },
        ...(kind === "port" ? { side: "outside" } : {}),
      };
      await page.evaluate((item) => window.UI.external([item]), item);
      const before = await state(page);
      await command(page, "reveal", item.ref);
      await settle(page);
      const s = await state(page),
        d = await dom(page);
      unchanged(before, s);
      assert.equal(s.reveal.status, "success");
      assert.equal(s.reveal.ref, item.ref);
      assert.equal(
        s.rows.find((x) => x.id === s.reveal.rowId).ref,
        "B-child-e",
      );
      const i = s.rows.findIndex((x) => x.id === s.reveal.rowId);
      assert.equal(d.rows[i].selected, "true");
      assert.equal(s.calls.filter((x) => x.name === "reveal").length, 1);
    },
  );
add(
  "UI-REVEAL-coordinator",
  ["S05"],
  "two views, host one post-notification reveal coordinator",
  "only host reveals once; no command in model notification stack",
  async (page) => {
    await setup(page, {}, true);
    await page.evaluate(() => window.UI.mount({}, 2));
    await page.evaluate(() => window.UI.coordinator());
    await page.evaluate(() => window.UI.external([{ ref: "B-port-target" }]));
    await settle(page);
    await page.waitForFunction(
      () => window.UI.state().reveal.status === "success",
    );
    const s = await state(page);
    assert.equal(s.calls.filter((x) => x.name === "reveal").length, 1);
    assert.equal(s.reentrantCommands, 0);
    assert.equal(s.reveal.ref, "B-port-target");
  },
);
for (const multi of [false, true])
  add(
    "UI-FOCUS-enter-" + multi,
    ["S09", "S10", "S11"],
    "preselected visible " +
      (multi ? "multiple instances" : "one instance") +
      ", first entry and re-entry",
    "first focus selected; later local focus restored, selection unchanged",
    async (page) => {
      await page.evaluate(() => window.UI.setup());
      await page.evaluate(() => window.UI.seed(true));
      const refs = multi ? ["B-child-a", "B-child-e"] : ["B-child-e"];
      await page.evaluate(
        (refs) => window.UI.external(refs.map((ref) => ({ ref }))),
        refs,
      );
      await page.evaluate(() => window.UI.mount());
      await settle(page);
      const before = await state(page);
      await enter(page);
      assert.ok(refs.includes((await active(page)).ref));
      await key(page, "Home");
      const local = (await active(page)).id;
      await key(page, "Tab");
      await page.evaluate(() => window.UI.external([{ ref: "B-child-b" }]));
      await page.locator("#ui-after").press("Shift+Tab");
      await settle(page);
      assert.equal((await active(page)).id, local);
      assert.equal(
        (await state(page)).calls.filter((x) => x.name === "select").length,
        before.calls.filter((x) => x.name === "select").length + 1,
      );
    },
  );
add(
  "UI-FOCUS-fallback",
  ["S12", "S13", "S14"],
  "descendant focused, ancestor collapse; scope focused then mode switch; empty reload",
  "nearest old parent-chain visible ancestor, then container; never selection edits",
  async (page) => {
    await setup(page, {}, "full");
    const s = await state(page),
      parent = s.rows.find(instance("B-mixed-root")),
      child = s.rows.find(instance("B-child-a"));
    await go(page, child.id);
    const before = await state(page);
    await command(page, "setExpanded", parent.id, false);
    await settle(page);
    assert.equal((await active(page)).id, parent.id);
    await command(page, "setExpanded", parent.id, true);
    await settle(page);
    const g = (await state(page)).rows.find(scope);
    await go(page, g.id);
    await command(page, "setShowGenerateScopes", false);
    await settle(page);
    assert.equal((await active(page)).id, parent.id);
    await page.evaluate(() => window.UI.emptyReload());
    await settle(page);
    const after = await state(page),
      d = await dom(page);
    assert.equal(after.rows.length, 0);
    assert.equal(d.tree.focus, true);
    assert.ok(!d.tree.activeId);
    unchanged(before, after);
  },
);
add(
  "UI-KEY-linear",
  ["K01", "K05", "K07"],
  "mixed instance/scope/status rows, arrows at endpoints and leaf",
  "walk all current rows only; no queries/selection/commands",
  async (page) => {
    await setup(page, {}, true);
    const root = (await state(page)).rows.find(instance());
    await command(page, "setExpanded", root.id, true);
    await settle(page);
    await enter(page);
    const before = await state(page);
    await key(page, "Home");
    for (let i = 0; i < before.rows.length; i++) {
      assert.equal((await active(page)).id, before.rows[i].id);
      await key(page, "ArrowDown");
    }
    assert.equal((await active(page)).id, before.rows.at(-1).id);
    for (let i = before.rows.length - 1; i >= 0; i--) {
      assert.equal((await active(page)).id, before.rows[i].id);
      await key(page, "ArrowUp");
    }
    const closedRoot = before.rows.find(
      (r) => r.kind === "instance" && r.parentId === null && !r.expanded,
    );
    await go(page, closedRoot.id);
    await key(page, "ArrowLeft");
    assert.equal((await active(page)).id, closedRoot.id);
    const leaf = before.rows.find(
      (r) => r.kind === "instance" && !r.expandable,
    );
    await go(page, leaf.id);
    await key(page, "ArrowRight");
    assert.equal((await active(page)).id, leaf.id);
    const after = await state(page);
    unchanged(before, after);
    assert.equal(after.queries.length, before.queries.length);
    assert.equal(after.calls.length, before.calls.length);
  },
);
add(
  "UI-KEY-horizontal",
  ["K03", "K04", "K06", "K07"],
  "Right/Left closed/open instance and scope, including pending first child status",
  "expand once; enter first visible child; close or move parent; no selection",
  async (page) => {
    await setup(page, { hold: ["inst.children"] }, true);
    await enter(page);
    const initial = await state(page),
      r = initial.rows[0];
    await key(page, "ArrowRight");
    assert.equal(
      (await state(page)).rows.find((x) => x.id === r.id).expanded,
      true,
    );
    await key(page, "ArrowRight");
    assert.equal((await active(page)).kind, "status");
    await key(page, "ArrowLeft");
    assert.equal((await active(page)).id, r.id);
    await page.evaluate(() => window.UI.release("inst.children"));
    await settle(page);
    await key(page, "ArrowRight");
    const g = await active(page);
    assert.equal(g.kind, "scope");
    await key(page, "ArrowLeft");
    assert.equal(
      (await state(page)).rows.find((x) => x.id === g.id).expanded,
      false,
    );
    await key(page, "ArrowRight");
    assert.equal(
      (await state(page)).rows.find((x) => x.id === g.id).expanded,
      true,
    );
    await key(page, "ArrowRight");
    const leaf = await active(page);
    assert.equal(leaf.parentId, g.id);
    await key(page, "ArrowLeft");
    assert.equal((await active(page)).id, g.id);
    unchanged(initial, await state(page));
  },
);
for (const keyName of ["Enter", "Space"])
  for (const action of ["more", "failed", "cancelled", "pending"])
    add(
      "UI-KEY-page-" + keyName + "-" + action,
      ["K08", "K09", "K10", "K12"],
      "instance page " + action + "; " + keyName,
      "one mapped command; owner/status distinct; no selection",
      async (page) => {
        await setup(page, {}, true);
        const root = (await state(page)).rows.find(instance());
        await command(page, "setExpanded", root.id, true);
        await settle(page);
        if (action !== "more") {
          await page.evaluate(() => window.UI.hold("inst.children"));
          await click(page, status);
          if (action === "failed")
            await page.evaluate(() => window.UI.release("inst.children", true));
          if (action === "cancelled") await click(page, status);
          await settle(page);
        }
        const before = await state(page),
          r = before.rows.find(status);
        await go(page, r.id);
        const start = (await state(page)).calls.length;
        await key(page, keyName);
        const s = await state(page);
        const calls = s.calls.slice(start);
        assert.equal(calls.length, 1);
        assert.equal(
          calls[0].name,
          action === "pending" ? "cancel" : "loadMore",
        );
        assert.equal(calls[0].args[0], r.owner);
        unchanged(before, s);
        assert.notEqual(r.id, r.owner);
      },
    );
add(
  "UI-KEY-tab",
  ["K11", "A01"],
  "buttons before/after tree, forward and reverse Tab",
  "one tree tab stop, zero row/control tab stops, no trap",
  async (page) => {
    await setup(page, {}, "full");
    await enter(page);
    const d = await dom(page);
    assert.equal(d.focusableDescendants, 0);
    assert.equal(d.tree.tabindex, 0);
    await key(page, "Tab");
    assert.equal((await dom(page)).focused, "ui-after");
    await page.locator("#ui-after").press("Shift+Tab");
    assert.equal((await dom(page)).tree.focus, true);
    await key(page, "Shift+Tab");
    assert.equal((await dom(page)).focused, "ui-before");
  },
);
add(
  "UI-KEY-home-end",
  ["K02"],
  "5001 loaded roots, DOM window much smaller than model",
  "Home/End targets model endpoints without request or semantic selection",
  async (page) => {
    await setup(page, { dataset: "wide" }, true, {
      height: 280,
      rowHeight: 28,
      overscan: 2,
    });
    await enter(page);
    const before = await state(page);
    await key(page, "End");
    let d = await dom(page);
    assert.ok(d.tree.active.text.includes("root[5000]"));
    assert.equal(d.tree.activeOwn, true);
    await key(page, "Home");
    d = await dom(page);
    assert.ok(d.tree.active.text.includes("root[0000]"));
    const s = await state(page);
    unchanged(before, s);
    assert.equal(s.calls.length, before.calls.length);
  },
);
for (const raw of ["undefined", "null", "zero", "false", "empty", "poison"])
  add(
    "UI-ERROR-observer-" + raw,
    ["L02", "L03", "L07"],
    "real select observer throws " + raw + "; no onCommandError",
    "original AggregateError retained; fixed accessible operation failure, no poison reads",
    async (page) => {
      await setup(page, {}, true, { onCommandError: undefined });
      // Remove the handler via the documented host mode, not via product internals.
      await page.evaluate((v) => {
        window.UI.configure({ callbackMode: "none" });
        window.UI.mount();
        if (v === "poison") window.UI.faultPoison();
        else
          window.UI.configure({
            fault: "select",
            marker: {
              undefined: undefined,
              null: null,
              zero: 0,
              false: false,
              empty: "",
            }[v],
          });
      }, raw);
      await click(page, instance("B-mixed-root"));
      const s = await state(page),
        text = await page.locator("#ui-view-1").innerText();
      assert.ok(text.includes("操作失败"));
      assert.equal(s.selection.items[0].ref, "B-mixed-root");
      assert.equal(s.callbacks.length, 0);
      assert.equal(s.poisonReads, 0);
      // The command rejection is AggregateError, not the nested primitive: coverage is deliberately limited.
      // Actual accessibility-tree discoverability is checked separately by UI-AX-error.
    },
  );
add(
  "UI-ERROR-once-owned-async",
  ["L04", "L06"],
  "observer fails, handler returns its own caught rejected Promise; rerenders",
  "one callback, no awaited callback aggregation or repeated command",
  async (page) => {
    await page.evaluate(() => window.UI.setup());
    await page.evaluate(() => window.UI.seed());
    await page.evaluate(() => {
      window.UI.configure({ callbackMode: "async-owned", fault: "select" });
      window.UI.mount();
    });
    await settle(page);
    await click(page, instance("B-mixed-root"));
    await page.evaluate(() => {
      window.UI.mount();
      window.UI.mount();
    });
    await settle(page);
    const s = await state(page);
    assert.equal(s.callbacks.length, 1);
    assert.equal(s.callbackAsync, 1);
    assert.equal(s.boundary.length, 0);
    assert.equal(s.callbacks[0].sameOriginal, true);
    assert.equal(s.callbacks[0].checkpoint, true);
  },
);
for (const strict of [false, true])
  add(
    "UI-LIFE-subscriptions-" + strict,
    ["L12", "L13", "L14", "I01"],
    "two shared views, " +
      (strict ? "StrictMode" : "normal") +
      " replay/rerender/unmount during pending",
    "one live subscription per model/view; cleanup no cancel/dispose; other view completes",
    async (page) => {
      await page.evaluate(() => window.UI.setup({ hold: ["inst.roots"] }));
      await page.evaluate((strict) => {
        window.UI.configure({ strict });
        window.UI.mount();
        window.UI.mount({}, 2);
      }, strict);
      await settle(page);
      let s = await state(page);
      assert.equal(s.queries.length, 0);
      assert.equal(s.subscriptions.tree.active, 2);
      assert.equal(s.subscriptions.selection.active, 2);
      await click(page, status);
      assert.equal((await state(page)).root, "pending");
      const before = await state(page);
      await page.evaluate(() => window.UI.unmount(1));
      await settle(page);
      s = await state(page);
      assert.equal(s.subscriptions.tree.active, 1);
      assert.equal(s.subscriptions.selection.active, 1);
      assert.equal(s.calls.length, before.calls.length);
      assert.equal(s.disposed, false);
      assert.equal(s.closed, false);
      await page.evaluate(() => window.UI.release("inst.roots"));
      await settle(page);
      assert.equal((await state(page)).root, "success");
      assert.ok((await dom(page, 2)).rows.length > 0);
      await page.evaluate(() => window.UI.unmount(2));
      s = await state(page);
      assert.equal(s.subscriptions.tree.active, 0);
      assert.equal(s.subscriptions.selection.active, 0);
      for (const n of ["tree", "selection"])
        assert.equal(s.subscriptions[n].adds, s.subscriptions[n].removes);
    },
  );
for (const target of ["tree", "selection"])
  add(
    "UI-LIFE-disposed-render-" + target,
    ["L15"],
    "host disposes " + target + " after mount and forces render",
    "synchronous TypeError boundary, not automatic disposal detection",
    async (page) => {
      await setup(page, {}, true);
      await page.evaluate((kind) => window.UI.invalidModel(kind), target);
      await page.evaluate(() => window.UI.mount());
      await settle(page);
      const s = await state(page);
      assert.ok(s.boundaryTypes.length > 0 && s.boundaryTypes.every(Boolean));
    },
  );
add(
  "UI-LIFE-new-session",
  ["L10", "E03"],
  "old pending, model pair replaced, old reply arrives",
  "old subscriptions off; new idle projection, no late feedback/focus/scroll/ownership change",
  async (page) => {
    await setup(page, { hold: ["inst.roots"] });
    await click(page, status);
    await page.evaluate(() => window.UI.replace({ dataset: "empty" }));
    await settle(page);
    const before = await dom(page);
    await page.evaluate(() => window.UI.release("inst.roots", true, 0));
    await settle(page);
    const s = await state(page),
      d = await dom(page);
    assert.equal(s.root, "idle");
    assert.equal(s.allCallbacks, 0);
    assert.equal(s.all[0].disposed, false);
    assert.equal(s.all[0].subscriptions.tree.active, 0);
    assert.equal(s.all[0].subscriptions.selection.active, 0);
    assert.equal(s.all[1].subscriptions.tree.active, 1);
    assert.equal(d.scroll.top, before.scroll.top);
    assert.equal(d.focused, before.focused);
  },
);
add(
  "UI-ARIA-projection",
  ["A01", "A02", "A03", "A04", "A05"],
  "mixed rows first page, pending/failure, full terminal, second owner scope",
  "levels/expanded/instance selected; posinset current projection and incomplete owner setsize -1",
  async (page) => {
    await setup(page, {}, true);
    const root = (await state(page)).rows.find(instance());
    await command(page, "setExpanded", root.id, true);
    await settle(page);
    async function check() {
      const { s, d } = await projection(page);
      assert.equal(d.tree.label, "B hierarchy");
      assert.equal(d.tree.multi, "true");
      for (let i = 0; i < s.rows.length; i++) {
        const r = s.rows[i],
          siblings = s.rows.filter((x) => x.parentId === r.parentId);
        assert.equal(
          d.rows[i].pos,
          String(siblings.findIndex((x) => x.id === r.id) + 1),
        );
        let owner = null;
        if (r.parentId !== null) {
          let p = s.rows.find((x) => x.id === r.parentId);
          while (p?.kind === "scope")
            p = s.rows.find((x) => x.id === p.parentId);
          owner = p;
        }
        const pageState = owner?.children ?? { status: s.root };
        const incomplete =
          pageState.status !== "success" || Boolean(pageState.next);
        assert.equal(
          d.rows[i].size,
          incomplete ? "-1" : String(siblings.length),
        );
      }
    }
    await check();
    await page.evaluate(() => window.UI.hold("inst.children"));
    await click(page, status);
    await check();
    await page.evaluate(() => window.UI.release("inst.children", true));
    await settle(page);
    await check();
    await click(page, status);
    await page.evaluate(() => window.UI.release("inst.children"));
    await settle(page);
    await click(page, status);
    await page.evaluate(() => window.UI.release("inst.children"));
    await settle(page);
    await check();
  },
);
add(
  "UI-ARIA-two-ids",
  ["A07"],
  "two simultaneous views over same RowIds and models",
  "globally isolated DOM IDs; each active descendant belongs to own view",
  async (page) => {
    await setup(page, {}, "full");
    await page.evaluate(() => window.UI.mount({}, 2));
    await settle(page);
    await enter(page);
    const first = await dom(page);
    const t = await tree(page, 2);
    await t.focus();
    await t.press("Home");
    await settle(page);
    const second = await dom(page, 2);
    assert.equal(first.tree.activeOwn, true);
    assert.equal(second.tree.activeOwn, true);
    const ids = first.rows.map((x) => x.id).filter(Boolean);
    assert.equal(
      second.rows.some((x) => x.id && ids.includes(x.id)),
      false,
    );
    const duplicates = await page.locator("#ui-host").evaluate((e) => {
      const ids = [...e.querySelectorAll("[id]")].map((x) => x.id);
      return ids.length - new Set(ids).size;
    });
    assert.equal(duplicates, 0);
  },
);
for (const fixture of ["wide", "deep"])
  add(
    "UI-WINDOW-" + fixture,
    fixture === "wide" ? ["A08", "A10"] : ["A09", "A10"],
    fixture === "wide"
      ? "5001 roots, 280/28/overscan2, fractional middle/end scroll"
      : "121 loaded instances/depth120 plus real pending status, same viewport",
    "viewport coverage and derived DOM bound, active DOM retained; outside focus unchanged",
    async (page) => {
      await setup(page, { dataset: fixture }, true, {
        height: 280,
        rowHeight: 28,
        overscan: 2,
      });
      await enter(page);
      const before = await state(page);
      const first = (await dom(page)).tree.activeId;
      await key(page, "Tab");
      for (const top of [0, 1428.5, 1e9]) {
        await page.evaluate((y) => window.UI.scroll(y), top);
        await settle(page);
        const s = await state(page),
          d = await dom(page);
        windowCheck(s, d, 280, 28, 2);
        assert.equal(d.tree.activeId, first);
        assert.equal(d.tree.activeOwn, true);
        assert.equal(d.focused, "ui-after");
        unchanged(before, s);
        assert.equal(s.queries.length, before.queries.length);
      }
    },
  );
add(
  "UI-WINDOW-width",
  ["U02", "I19"],
  "wide literal label in resizable narrow host",
  "width follows host; content remains horizontally scrollable",
  async (page) => {
    await setup(page, {}, "full");
    await page.evaluate(() => window.UI.width(200));
    await settle(page);
    const narrow = await dom(page);
    const horizontal = await page
      .locator("#ui-view-1")
      .evaluate((host) =>
        [...host.querySelectorAll("*")].some(
          (e) =>
            e.scrollWidth > e.clientWidth &&
            ["auto", "scroll"].includes(getComputedStyle(e).overflowX),
        ),
      );
    assert.equal(horizontal, true);
    await page.evaluate(() => window.UI.width(460));
    await settle(page);
    const wide = await dom(page);
    assert.ok(Math.abs(wide.tree.width - narrow.tree.width - 260) <= 2);
  },
);
add(
  "UI-REVEAL-scroll",
  ["S06", "S07", "S08"],
  "5001 roots, selected port owner at end; success, rerender, cancelled/failed reveal",
  "nearest-edge scroll only for new success; selection/focus stable, no stale scrolling or retry",
  async (page) => {
    await setup(page, { dataset: "wide" }, true, {
      height: 280,
      rowHeight: 28,
      overscan: 2,
    });
    await enter(page);
    const activeId = (await dom(page)).tree.activeId;
    await key(page, "Tab");
    await page.evaluate(() =>
      window.UI.external([
        { ref: "B-port-target", bits: { lsb: 1, width: 2 }, side: "inside" },
      ]),
    );
    const before = await state(page);
    await command(page, "reveal", "B-port-target");
    await settle(page);
    let d = await dom(page);
    assert.ok(d.scroll.top > 0);
    assert.equal(d.tree.activeId, activeId);
    assert.equal(d.focused, "ui-after");
    const target = d.rows.find((r) => r.text.includes("root[5000]"));
    assert.ok(
      target &&
        target.top >= d.tree.top - 1 &&
        target.bottom <= d.tree.top + 280 + 1,
    );
    await page.evaluate(() => window.UI.scroll(0));
    await settle(page);
    await page.evaluate(() => window.UI.mount());
    await settle(page);
    assert.equal((await dom(page)).scroll.top, 0);
    await page.evaluate(() => {
      window.UI.hold("obj.get");
      window.UI.start("reveal", "B-missing");
    });
    await settle(page);
    await page.evaluate(() => window.UI.release("obj.get", true));
    await page.evaluate(() => window.UI.pending());
    await settle(page);
    d = await dom(page);
    assert.equal(d.scroll.top, 0);
    unchanged(before, await state(page));
    await page.evaluate(() => window.UI.start("reveal", "B-port-target"));
    await settle(page);
    await command(page, "cancel", null);
    await page.evaluate(() => window.UI.pending());
    await settle(page);
    assert.equal((await state(page)).reveal.status, "cancelled");
    assert.equal((await dom(page)).scroll.top, 0);
  },
);
add(
  "UI-REVEAL-mount-success",
  ["S07"],
  "model success reveal before mount; manual scroll then rerender",
  "initial target visible allowed once, later rerender does not pull scroll back",
  async (page) => {
    await page.evaluate(() => window.UI.setup({ dataset: "wide" }));
    await page.evaluate(() => window.UI.seed());
    await command(page, "reveal", "B-port-target");
    await page.evaluate(() => window.UI.mount({ height: 280 }));
    await settle(page);
    const initial = await dom(page);
    assert.ok(initial.scroll.top >= 0);
    await page.evaluate(() => window.UI.scroll(0));
    await settle(page);
    await page.evaluate(() => window.UI.mount());
    await settle(page);
    assert.equal((await dom(page)).scroll.top, 0);
  },
);
add(
  "UI-AX-tree",
  ["A06", "A11"],
  "actual Chromium AX tree: mixed roles/selected/expanded and active descendant",
  "AX hierarchy, active descendant relation and multiselection independently of DOM attributes",
  async (page, context) => {
    await setup(page, {}, "full");
    await page.evaluate(() =>
      window.UI.external([{ ref: "B-child-a" }, { ref: "B-child-e" }]),
    );
    await enter(page);
    await settle(page);
    const cdp = await context.newCDPSession(page);
    try {
      const { nodes } = await cdp.send("Accessibility.getFullAXTree");
      const trees = nodes.filter((n) => !n.ignored && n.role?.value === "tree");
      assert.equal(trees.length, 1);
      assert.equal(trees[0].name.value, "B hierarchy");
      const props = Object.fromEntries(
        (trees[0].properties ?? []).map((p) => [p.name, p.value]),
      );
      assert.equal(props.multiselectable.value, true);
      assert.ok(props.activedescendant?.relatedNodes?.length > 0);
      const items = nodes.filter(
        (n) => !n.ignored && n.role?.value === "treeitem",
      );
      assert.ok(items.length > 0);
      for (const n of items)
        assert.ok(
          (n.properties ?? []).some(
            (p) => p.name === "level" && p.value.value >= 1,
          ),
        );
      assert.equal(
        items.filter((n) =>
          (n.properties ?? []).some(
            (p) => p.name === "selected" && p.value.value === true,
          ),
        ).length,
        2,
      );
    } finally {
      await cdp.detach();
    }
  },
);

add(
  "UI-LIFE-reset-local-state",
  ["L10", "S14"],
  "old wide view with local error, last active row and nonzero scroll; replace model pair",
  "new session clears local error/focus/scroll, old subscriptions off, outside DOM focus retained",
  async (page) => {
    await page.evaluate(() => window.UI.setup({ dataset: "wide" }));
    await page.evaluate(() => window.UI.seed());
    await page.evaluate(() => {
      window.UI.configure({ callbackMode: "none" });
      window.UI.mount({ height: 280 });
    });
    await settle(page);
    await enter(page);
    await key(page, "End");
    await page.evaluate(() => window.UI.configure({ fault: "select" }));
    await key(page, "Enter");
    assert.ok(
      (await page.locator("#ui-view-1").innerText()).includes("操作失败"),
    );
    const old = await dom(page);
    assert.ok(old.scroll.top > 0);
    await key(page, "Tab");
    await page.evaluate(() => window.UI.replace({ dataset: "empty" }));
    await settle(page);
    const s = await state(page),
      d = await dom(page);
    assert.equal(s.root, "idle");
    assert.equal(d.scroll.top, 0);
    assert.equal(d.focused, "ui-after");
    assert.notEqual(d.tree.activeId, old.tree.activeId);
    assert.equal(s.all[0].subscriptions.tree.active, 0);
    assert.equal(s.all[0].subscriptions.selection.active, 0);
    assert.equal(s.all[0].disposed, false);
    assert.equal(
      (await page.locator("#ui-view-1").innerText()).includes("操作失败"),
      false,
    );
  },
);
