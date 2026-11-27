// B oracle: DESIGN 6.7 at b753daa. No prototype implementation assumptions.
import assert from "node:assert/strict";
const cases = [];
const add = (id, input, expected, run) =>
  cases.push({ id, input, expected, basis: "DESIGN 6.7.1/6.7.3/6.7.4", run });
async function state(page) {
  return page.evaluate(() => window.B.state());
}
async function ready(page) {
  await page.evaluate(() => window.B.settle());
}
async function tree(page) {
  const locator = page.getByRole("tree", { name: "B hierarchy", exact: true });
  assert.equal(await locator.count(), 1);
  return locator;
}
async function row(page, predicate) {
  // All fixtures have at most five rows in a 280px viewport: all must be mounted.
  const s = await state(page),
    index = s.rows.findIndex(predicate);
  assert.ok(index >= 0, "expected a published row");
  const host = page.locator("#view-root");
  await host.evaluate((element) => element.outerHTML); // fresh, scoped DOM ground truth
  const rows = (await tree(page)).getByRole("treeitem");
  assert.equal(
    await rows.count(),
    s.rows.length,
    "small fixture must not omit visible rows",
  );
  return { locator: rows.nth(index), data: s.rows[index] };
}
async function activate(page, predicate, gesture = "click") {
  const r = await row(page, predicate);
  const before = (await state(page)).allCalls;
  if (gesture === "click") await r.locator.click();
  else {
    const t = await tree(page);
    await t.focus();
    await t.press(gesture);
  }
  assert.equal(
    (await state(page)).allCalls,
    before + 1,
    "one activation forwards exactly one model command",
  );
  return r.data.id;
}
async function until(page, value) {
  await page.waitForFunction((value) => window.B.state().root === value, value);
  await ready(page);
}
function callback(s, command, id) {
  const list = s.callbacks.filter((x) => x.command === command);
  assert.equal(list.length, 1, "one feedback for the failed command");
  const got = list[0];
  assert.equal(got.rowId, id);
  assert.notEqual(got.rowId, null);
  assert.equal(got.sameOriginal, true);
  assert.equal(
    got.checkpoint,
    true,
    "after public method microtask checkpoint",
  );
  assert.equal(got.returned, true);
  return got;
}
async function setup(page, options = {}, mount = {}) {
  await page.evaluate((options) => window.B.setup(options), options);
  await page.evaluate((options) => window.B.mount(options), mount);
  await ready(page);
}
for (const [suffix, gesture] of [
  ["click", "click"],
  ["enter", "Enter"],
  ["space", "Space"],
]) {
  add(
    "C76-01-" + suffix,
    "unloaded roots idle; " + gesture,
    "one loadRoots, pending then empty success; no rowless button",
    async (page) => {
      await setup(page, { empty: true, hold: ["inst.roots"] });
      let s = await state(page);
      assert.equal(s.queries.length, 0);
      assert.equal(s.rows.length, 1);
      assert.equal(s.rows[0].kind, "status");
      assert.equal(s.rows[0].page, "idle");
      const r = await row(page, (x) => x.kind === "status");
      assert.ok((await r.locator.innerText()).includes("加载层次"));
      await activate(page, (x) => x.kind === "status", gesture);
      s = await state(page);
      assert.equal(s.root, "pending");
      assert.equal(s.queries.length, 1);
      assert.equal(s.calls.filter((x) => x.name === "loadRoots").length, 1);
      await page.evaluate(() => window.B.reply("inst.roots"));
      await until(page, "success");
      s = await state(page);
      assert.deepEqual(s.rows, []);
      assert.ok(
        (await page.locator("#view-root").innerText()).includes("无顶层实例"),
      );
      assert.equal(s.queries.length, 1);
    },
  );
}
add(
  "C76-02",
  "StrictMode mount/cleanup replay with initial idle",
  "real initial row retained; zero navigation queries",
  async (page) => {
    await setup(page, {}, { strict: true });
    const s = await state(page);
    assert.equal(s.queries.length, 0);
    assert.equal(s.calls.length, 0);
    assert.equal(s.rows.length, 1);
    assert.equal(s.rows[0].page, "idle");
    assert.ok(
      (
        await (await row(page, (x) => x.kind === "status")).locator.innerText()
      ).includes("加载层次"),
    );
  },
);
for (const cancelled of [false, true]) {
  add(
    "C76-03-" + (cancelled ? "cancel" : "failure"),
    cancelled ? "pending roots cancel then retry" : "roots failure then retry",
    "one load per activation, stable diagnostic, same real status identity",
    async (page) => {
      await setup(page, { hold: ["inst.roots"] });
      const initial = await activate(page, (x) => x.kind === "status");
      await until(page, "pending");
      if (cancelled) await activate(page, (x) => x.kind === "status");
      else await page.evaluate(() => window.B.reply("inst.roots", true));
      await until(page, cancelled ? "cancelled" : "failed");
      let s = await state(page);
      assert.equal(s.rows[0].id, initial);
      if (!cancelled) {
        callback(s, "loadRoots", initial);
        const text = await page.locator("#view-root").innerText();
        assert.ok(text.includes("not_found"));
        assert.ok(text.includes("B Core retry"));
      }
      await activate(page, (x) => x.kind === "status");
      await until(page, "pending");
      s = await state(page);
      assert.equal(s.queries.length, 2);
      await page.evaluate(() => window.B.reply("inst.roots"));
      await until(page, "success");
    },
  );
}
add(
  "C76-04",
  "root success removes triggering status, observer makes Promise reject",
  "callback keeps disappeared roots status id and original AggregateError",
  async (page) => {
    await setup(page);
    await page.evaluate(() => window.B.configure({ fault: "root-success" }));
    const id = await activate(page, (x) => x.kind === "status");
    await until(page, "success");
    const s = await state(page);
    const c = callback(s, "loadRoots", id);
    assert.equal(c.markerIdentity, true);
    assert.ok(!s.rows.some((x) => x.id === id));
  },
);
add(
  "C76-05",
  "terminal children page removes status, observer makes loadMore reject",
  "callback status id differs from actual owner argument and survives removal",
  async (page) => {
    await page.evaluate(() => window.B.setup());
    await page.evaluate(() => window.B.seed(true));
    await page.evaluate(() => window.B.mount());
    await ready(page);
    await page.evaluate(() =>
      window.B.configure({ fault: "children-success" }),
    );
    const before = (await state(page)).rows.find((x) => x.kind === "status");
    assert.notEqual(before.id, before.owner);
    await activate(page, (x) => x.id === before.id);
    await ready(page);
    const s = await state(page);
    callback(s, "loadMore", before.id);
    assert.ok(!s.rows.some((x) => x.id === before.id));
    assert.equal(
      s.calls.findLast((x) => x.name === "loadMore").args[0],
      before.owner,
    );
  },
);
for (const scope of [false, true]) {
  add(
    "C76-06-" + (scope ? "scope" : "instance"),
    "failing " + (scope ? "scope close" : "instance open") + " command",
    "setExpanded feedback uses triggering instance/scope id, no selection",
    async (page) => {
      await page.evaluate(() => window.B.setup());
      await page.evaluate((expand) => window.B.seed(expand), scope);
      await page.evaluate(() => window.B.mount());
      await ready(page);
      await page.evaluate(() => window.B.configure({ fault: "tree-any" }));
      const target = (await state(page)).rows.find(
        (x) => x.kind === (scope ? "scope" : "instance"),
      );
      if (scope) await activate(page, (x) => x.id === target.id);
      else {
        const t = await tree(page);
        await t.focus();
        await t.press("ArrowRight");
      }
      await ready(page);
      const s = await state(page);
      callback(s, "setExpanded", target.id);
      assert.equal(s.selection.items.length, 0);
    },
  );
}
for (const childPage of [false, true]) {
  add(
    "C76-07-" + (childPage ? "instance" : "root"),
    "pending status cancel, notification rejects cancel",
    "callback uses status id, not owner/null",
    async (page) => {
      await page.evaluate(
        (childPage) =>
          window.B.setup({
            hold: [childPage ? "inst.children" : "inst.roots"],
          }),
        childPage,
      );
      if (childPage) await page.evaluate(() => window.B.seed());
      await page.evaluate(() => window.B.mount());
      await ready(page);
      if (childPage) {
        const t = await tree(page);
        await t.focus();
        await t.press("ArrowRight");
      } else await activate(page, (x) => x.kind === "status");
      await ready(page);
      const before = (await state(page)).rows.find((x) => x.kind === "status");
      assert.equal(before.page, "pending");
      assert.notEqual(before.id, before.owner);
      await page.evaluate(() => window.B.configure({ fault: "tree-any" }));
      await activate(page, (x) => x.id === before.id);
      await ready(page);
      const s = await state(page);
      callback(s, "cancel", before.id);
      assert.equal(
        s.calls.findLast((x) => x.name === "cancel").args[0],
        before.owner,
      );
    },
  );
}
add(
  "C76-08",
  "ordinary synchronous select returns void",
  "selection commits once, no error callback",
  async (page) => {
    await page.evaluate(() => window.B.setup());
    await page.evaluate(() => window.B.seed());
    await page.evaluate(() => window.B.mount());
    await ready(page);
    await activate(page, (x) => x.kind === "instance");
    await ready(page);
    const s = await state(page);
    assert.equal(s.selection.origin, "tree");
    assert.equal(s.selection.items[0].ref, "B-ui-root");
    assert.equal(s.callbacks.length, 0);
    assert.equal(s.calls.filter((x) => x.name === "select").length, 1);
  },
);
add(
  "C76-09",
  "select observer synchronously throws",
  "one microtask feedback with original AggregateError; selection remains",
  async (page) => {
    await page.evaluate(() => window.B.setup());
    await page.evaluate(() => window.B.seed());
    await page.evaluate(() => window.B.mount());
    await ready(page);
    await page.evaluate(() => window.B.configure({ fault: "select" }));
    const id = await activate(page, (x) => x.kind === "instance");
    await ready(page);
    await page.evaluate(() => window.B.mount());
    await ready(page);
    const s = await state(page),
      c = callback(s, "select", id);
    assert.equal(c.markerIdentity, true);
    assert.equal(c.sync, true);
    assert.equal(s.selection.items[0].ref, "B-ui-root");
    assert.equal(s.calls.filter((x) => x.name === "select").length, 1);
  },
);
add(
  "C76-09-undefined",
  "select observer throws undefined",
  "AggregateError keeps an actual undefined entry; microtask feedback retains original",
  async (page) => {
    await page.evaluate(() => window.B.setup());
    await page.evaluate(() => window.B.seed());
    await page.evaluate(() => window.B.mount());
    await ready(page);
    await page.evaluate(() =>
      window.B.configure({ fault: "select", marker: undefined }),
    );
    const id = await activate(page, (x) => x.kind === "instance");
    await ready(page);
    const s = await state(page),
      c = callback(s, "select", id);
    assert.equal(c.markerIdentity, true);
    assert.equal(c.sync, true);
    assert.equal(s.selection.items[0].ref, "B-ui-root");
  },
);
add(
  "C76-10",
  "select observer throws with no error callback",
  "visible fixed operation failure, selection remains",
  async (page) => {
    await page.evaluate(() => window.B.setup());
    await page.evaluate(() => window.B.seed());
    await page.evaluate(() => window.B.mount({ callbackMode: "none" }));
    await ready(page);
    await page.evaluate(() => window.B.configure({ fault: "select" }));
    await activate(page, (x) => x.kind === "instance");
    await ready(page);
    const s = await state(page);
    assert.equal(s.selection.items[0].ref, "B-ui-root");
    assert.equal(s.callbacks.length, 0);
    assert.ok(
      (await page.locator("#view-root").innerText()).includes("操作失败"),
    );
  },
);
for (const sync of [true, false]) {
  add(
    "C76-11-" + (sync ? "sync" : "async"),
    "command fails, callback throws undefined",
    "next render boundary gets AggregateError([original, undefined])",
    async (page) => {
      await page.evaluate(() => window.B.setup());
      if (sync) await page.evaluate(() => window.B.seed());
      await page.evaluate(() =>
        window.B.mount({ callbackMode: "throw", callbackMarker: undefined }),
      );
      await ready(page);
      await page.evaluate(
        (sync) =>
          window.B.configure({ fault: sync ? "select" : "root-success" }),
        sync,
      );
      await activate(page, (x) => x.kind === (sync ? "instance" : "status"));
      await page.waitForFunction(() => window.B.state().boundary.length > 0);
      const s = await state(page);
      assert.equal(s.boundary.length, 1);
      assert.deepEqual(s.boundary[0], {
        aggregate: true,
        firstIsOriginal: true,
        secondIsCallback: true,
        errorsLength: 2,
      });
      assert.equal(s.callbacks.length, 1);
    },
  );
}
for (const action of ["unmount", "replace", "remount"]) {
  const replace = action === "replace";
  add(
    "C76-12-" + action,
    "sync select error; host " + action + " before queued feedback",
    "old microtask consumed, no old/new callback/error; committed old selection preserved",
    async (page) => {
      await page.evaluate(() => window.B.setup());
      await page.evaluate(() => window.B.seed());
      await page.evaluate(() => window.B.mount());
      await ready(page);
      if (replace) await page.evaluate(() => window.B.prepareReplacement());
      await page.evaluate(
        (action) =>
          window.B.configure({
            fault: "select",
            stale: action,
          }),
        action,
      );
      await activate(page, (x) => x.kind === "instance");
      await ready(page);
      const s = await state(page);
      assert.equal(s.allCallbacks, 0);
      assert.equal(s.boundary.length, 0);
      const old = await page.evaluate(() => window.B.previous());
      assert.equal(old.disposed, false);
      assert.equal(old.closed, false);
      assert.equal(old.selectedRef, "B-ui-root");
      if (replace) assert.equal(s.root, "idle");
    },
  );
}
for (const action of ["unmount", "replace", "remount"]) {
  const replace = action === "replace";
  add(
    "C76-13-" + action,
    "held root request; host " + action + "; late rejection",
    "Promise rejection consumed, no late UI feedback; borrowed model still settles",
    async (page) => {
      await setup(page, { hold: ["inst.roots"] });
      await activate(page, (x) => x.kind === "status");
      await until(page, "pending");
      if (replace) {
        await page.evaluate(() => window.B.prepareReplacement());
        await page.evaluate(() => window.B.replace());
      } else {
        await page.evaluate(() => window.B.unmount());
        if (action === "remount") await page.evaluate(() => window.B.mount());
      }
      await page.evaluate(() => window.B.reply("inst.roots", true, 0));
      await ready(page);
      const s = await state(page),
        old = await page.evaluate(() => window.B.previous());
      assert.equal(s.allCallbacks, 0);
      assert.equal(s.boundary.length, 0);
      assert.equal(old.root, "failed");
      assert.equal(old.disposed, false);
      assert.equal(old.closed, false);
      if (replace) assert.equal(s.root, "idle");
    },
  );
}
assert.equal(cases.length, 24);
export { cases };
