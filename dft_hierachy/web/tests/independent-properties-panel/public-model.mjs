// Real public models only. Scope owns resources as each constructor succeeds.
import {
  target,
  instance,
  ports,
  params,
  snapshot,
  complete,
} from "./input.mjs";
export { target, instance, ports, params, snapshot, complete };
export const check = (v, m) => {
  if (!v) throw Error(m);
};
export const eq = (a, b, m) => check(Object.is(a, b), m);
export const json = (a, b, m) => eq(JSON.stringify(a), JSON.stringify(b), m);
export function observeMethod(object, name, log) {
  const descriptor = Object.getOwnPropertyDescriptor(object, name),
    original = object[name];
  Object.defineProperty(object, name, {
    configurable: true,
    value: function (...args) {
      const call = { name, args };
      log.push(call);
      try {
        call.returned = Reflect.apply(original, this, args);
        return call.returned;
      } catch (error) {
        call.error = error;
        throw error;
      }
    },
  });
  return () =>
    descriptor
      ? Object.defineProperty(object, name, descriptor)
      : Reflect.deleteProperty(object, name);
}
export async function context(
  { HierClient, InstancePropertiesModel, SelectionModel },
  options = {},
) {
  const messages = options.wire?.messages ?? new Set(),
    closes = options.wire?.closes ?? new Set(),
    sent = options.wire?.sent ?? [],
    waits = [],
    claimed = new Set(),
    owned = [],
    restores = [];
  let client,
    m,
    s,
    closed = false,
    closing;
  const emit = (v) => {
    if (!closed)
      for (const f of [...messages]) if (messages.has(f)) f(structuredClone(v));
  };
  const wire = options.wire ?? {
    onMessage(f) {
      messages.add(f);
      return () => messages.delete(f);
    },
    onClose(f) {
      closes.add(f);
      return () => closes.delete(f);
    },
    send(v) {
      check(!closed, "wire live");
      const q = structuredClone(v);
      sent.push(q);
      const i = waits.findIndex(
        (w) => w.method === q.method && !claimed.has(q),
      );
      if (i >= 0) {
        claimed.add(q);
        waits.splice(i, 1)[0].resolve(q);
      }
    },
    close(cause = Error("B54 controlled EOF")) {
      if (closed) return;
      closed = true;
      for (const w of waits.splice(0)) w.resolve(null);
      for (const f of [...closes]) if (closes.has(f)) f(cause);
    },
  };
  const close = () => {
    if (closing) return closing;
    let resolve, reject;
    closing = new Promise((a, b) => {
      resolve = a;
      reject = b;
    });
    (async () => {
      const errors = [];
      for (const [name, fn] of [
        ["properties", () => m?.dispose()],
        ["selection", () => s?.dispose()],
        [
          "restore",
          () => {
            for (const r of restores.reverse()) r();
          },
        ],
        ["client", () => client?.dispose()],
        ["wire", () => wire.close()],
      ])
        try {
          fn();
        } catch (error) {
          errors.push({ name, error });
        }
      await Promise.allSettled(owned);
      if (options.wire) {
        await wire.closeDone;
        await wire.pollDone;
      }
      if (messages.size || closes.size)
        errors.push({
          name: "wire listeners",
          error: Error("retained listeners"),
        });
      return errors;
    })().then(resolve, reject);
    return closing;
  };
  try {
    client = new HierClient(wire, { cacheEntries: 0 });
    client.ready.catch(() => {});
    if (!options.wire)
      emit({
        event: "hello",
        protocol: 2,
        snapshot: snapshot(),
        capabilities: ["cancel", "progress"],
      });
    await client.ready;
    m = new InstancePropertiesModel(client);
    s = new SelectionModel(
      options.unbound ? {} : { snapshotId: options.snapshotId ?? m.snapshotId },
    );
    const c = {
      client,
      m,
      s,
      wire,
      sent,
      owned,
      restores,
      calls: [],
      messages,
      closes,
      close,
      hold(p) {
        p.catch(() => {});
        owned.push(p);
        return p;
      },
      ok(q, result) {
        check(q, "expected live request");
        emit({ id: q.id, ok: true, result, completeness: complete });
      },
      fail(q, code = "not_found", message = "B54 Core 原错误<&>") {
        check(q, "failure request");
        emit({
          id: q.id,
          ok: false,
          error: { code, message, data: { B54: "diagnostic" } },
        });
      },
      next(method) {
        const q = sent.find((q) => q.method === method && !claimed.has(q));
        if (q) {
          claimed.add(q);
          return Promise.resolve(q);
        }
        return new Promise((resolve) => waits.push({ method, resolve }));
      },
      queries() {
        return sent.filter((q) => q.method !== "cancel");
      },
      async begin(ref = target) {
        const p = c.hold(m.load(ref));
        const q = await c.next("inst.get");
        return { p, q, ref };
      },
      async finish(
        task,
        { portValues = ports(), paramValues = params(), reverse = false } = {},
      ) {
        c.ok(task.q, instance(task.ref));
        const a = await c.next("inst.ports"),
          b = await c.next("inst.params");
        if (reverse) {
          c.ok(b, paramValues);
          c.ok(a, portValues);
        } else {
          c.ok(a, portValues);
          c.ok(b, paramValues);
        }
        await task.p;
        return m.state;
      },
      async load(ref = target, values) {
        return c.finish(await c.begin(ref), values);
      },
    };
    for (const [obj, names] of [
      [m, ["load", "reload", "cancel", "clear", "dispose"]],
      [s, ["select", "back", "forward", "dispose"]],
    ])
      for (const name of names)
        restores.push(observeMethod(obj, name, c.calls));
    c.stats = {
      properties: { active: 0, adds: 0, removes: 0 },
      selection: { active: 0, adds: 0, removes: 0 },
    };
    for (const [obj, key] of [
      [m, "properties"],
      [s, "selection"],
    ]) {
      const d = Object.getOwnPropertyDescriptor(obj, "subscribe"),
        original = obj.subscribe,
        stat = c.stats[key];
      Object.defineProperty(obj, "subscribe", {
        configurable: true,
        value: function (...args) {
          const off = Reflect.apply(original, this, args);
          stat.adds++;
          stat.active++;
          let active = true;
          return () => {
            const value = off();
            if (active) {
              active = false;
              stat.active--;
              stat.removes++;
            }
            return value;
          };
        },
      });
      restores.push(() =>
        d
          ? Object.defineProperty(obj, "subscribe", d)
          : Reflect.deleteProperty(obj, "subscribe"),
      );
    }
    return c;
  } catch (error) {
    const errors = await close();
    if (errors.length)
      throw new AggregateError(
        [error, ...errors.map((x) => x.error)],
        "B54 setup cleanup",
        { cause: error },
      );
    throw error;
  }
}
