// Adapter only: the accepted original B scope owns real ObjectConnectionsModel.
import {
  context as oldContext,
  observeMethod,
  check,
  eq,
  json,
} from "../independent-properties-panel/public-model.mjs";
import { target, info, endpoints, complete } from "./input.mjs";
export { observeMethod, check, eq, json, target, info, endpoints, complete };
export async function context(deps, options = {}) {
  // The legacy scope's constructor argument name is not a model replacement.
  const c = await oldContext(
    { ...deps, InstancePropertiesModel: deps.ObjectConnectionsModel },
    options,
  );
  try {
    check(
      c.m instanceof deps.ObjectConnectionsModel,
      "actual public connection model",
    );
    const emit = (frame) => {
      for (const f of [...c.messages])
        if (c.messages.has(f)) f(structuredClone(frame));
    };
    c.ok = (q, result, completeness = complete) => {
      check(q, "live response request");
      emit({ id: q.id, ok: true, result, completeness });
    };
    c.begin = async (t = target()) => {
      // Cancelled older loads can leave sent-but-unclaimed requests in the
      // shared scope. Answer only a request issued by this load, not that backlog.
      const previous = new Set(c.sent);
      const p = c.hold(c.m.load(t));
      let q = await c.next("obj.get");
      while (previous.has(q)) q = await c.next("obj.get");
      return { p, q, target: c.m.state.target };
    };
    c.finish = async (
      task,
      {
        drivers = endpoints(),
        loads = [],
        dc = complete,
        lc = complete,
        reverse = false,
        object = info(task.target.slice.ref),
      } = {},
    ) => {
      c.ok(task.q, object);
      const d = await c.next("conn.drivers"),
        l = await c.next("conn.loads");
      for (const [q, result, comp] of reverse
        ? [
            [l, loads, lc],
            [d, drivers, dc],
          ]
        : [
            [d, drivers, dc],
            [l, loads, lc],
          ])
        c.ok(q, result, comp);
      await task.p;
      return c.m.state;
    };
    c.load = async (t = target(), values) => c.finish(await c.begin(t), values);
    return c;
  } catch (error) {
    await c.close();
    throw error;
  }
}
