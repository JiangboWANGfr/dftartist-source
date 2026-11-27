// Actual public model constructed in original ownership scope. No page adapter.
import {
  context as originalContext,
  observeMethod,
  check,
  eq,
  json,
} from "../independent-properties-panel/public-model.mjs";
import { query, complete } from "./input.mjs";
export { observeMethod, check, eq, json, query, complete };
export async function context(deps, options = {}) {
  const c = await originalContext(
    { ...deps, InstancePropertiesModel: deps.PathResolutionModel },
    options,
  );
  try {
    check(
      c.m instanceof deps.PathResolutionModel,
      "actual public PathResolutionModel",
    );
    c.stats.resolution = c.stats.properties;
    delete c.stats.properties;
    const emit = (f) => {
      for (const fn of [...c.messages])
        if (c.messages.has(fn)) fn(structuredClone(f));
    };
    c.ok = (q, result, completeness = complete) => {
      check(q, "live path query");
      emit({
        id: q.id,
        ok: true,
        result,
        completeness,
        B_extension: "B68-REPLY-EXTRA",
      });
    };
    c.begin = async (q = query()) => {
      const before = new Set(c.sent),
        p = c.hold(c.m.load(q));
      let request = await c.next("path.resolve");
      while (before.has(request)) request = await c.next("path.resolve");
      return { p, q: request, query: c.m.state.query };
    };
    c.finish = async (t, value, comp = complete) => {
      c.ok(t.q, value, comp);
      await t.p;
      return c.m.state;
    };
    c.load = async (q = query(), value, comp = complete) =>
      c.finish(await c.begin(q), value, comp);
    return c;
  } catch (error) {
    const clean = await c.close();
    if (clean.length)
      throw new AggregateError(
        [error, ...clean.map((e) => e.error)],
        "B68 setup cleanup",
        { cause: error },
      );
    throw error;
  }
}
