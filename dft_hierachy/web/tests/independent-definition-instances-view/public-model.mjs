// Thin adaptation of accepted original B ownership scope; real public DefinitionInstancesModel only.
import {
  context as oldContext,
  observeMethod,
  check,
  eq,
  json,
} from "../independent-properties-panel/public-model.mjs";
import { query, complete } from "./input.mjs";
export { observeMethod, check, eq, json, query, complete };
export async function context(deps, options = {}) {
  const c = await oldContext(
    { ...deps, InstancePropertiesModel: deps.DefinitionInstancesModel },
    options,
  );
  try {
    check(
      c.m instanceof deps.DefinitionInstancesModel,
      "actual public DefinitionInstancesModel",
    );
    c.stats.instances = c.stats.properties;
    delete c.stats.properties;
    c.restores.push(observeMethod(c.m, "loadMore", c.calls));
    const emit = (frame) => {
      for (const f of [...c.messages])
        if (c.messages.has(f)) f(structuredClone(frame));
    };
    c.ok = (q, value, completeness = complete) => {
      check(q, "live definition instance request");
      emit({ id: q.id, ok: true, result: value, completeness });
    };
    c.begin = async (q = query()) => {
      const previous = new Set(c.sent),
        p = c.hold(c.m.load(q));
      let request = await c.next("def.instances");
      while (previous.has(request)) request = await c.next("def.instances");
      return { p, q: request, query: c.m.state.query };
    };
    c.finish = async (t, value, completeness = complete) => {
      c.ok(t.q, value, completeness);
      await t.p;
      return c.m.state;
    };
    c.load = async (q = query(), value, completeness = complete) =>
      c.finish(await c.begin(q), value, completeness);
    return c;
  } catch (error) {
    const clean = await c.close();
    if (clean.length)
      throw new AggregateError(
        [error, ...clean.map((c) => c.error)],
        "B66 setup cleanup",
        { cause: error },
      );
    throw error;
  }
}
