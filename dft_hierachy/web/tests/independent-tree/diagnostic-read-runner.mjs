// Agent B, DESIGN 6.6.6. Plain child process: no global rejection listeners.
import assert from "node:assert/strict";
import { HierError } from "@hier/client";
import { model, load, row, invoke, frozen, watch, vm } from "./harness.mjs";
const cfg = JSON.parse(process.argv[2]);
const cleanup = [],
  t = { after: (f) => cleanup.push(f) };
const c = await model(t, { childCount: 1 });
let notifications = 0,
  readCalls = 0,
  tailCalls = 0,
  thrownInspections = 0,
  paramReads = 0;
const returned = { value: 1 },
  listenerMarker = { B: "observer" },
  events = [],
  nested = [];
const beforeState = () =>
  cfg.method === "roots"
    ? c.tree.rootState
    : cfg.method === "children"
      ? row(c.tree, "B-root").children
      : c.tree.revealState;
let oldVisible, other;
if (cfg.method === "children") await load(c);
const originalCount = c.wire.queries.length;
c.tree.subscribe(() => {
  notifications++;
  events.push(beforeState().status);
  if (cfg.scenario === "observer" && beforeState().status === "failed")
    throw listenerMarker;
});
let p, q, otherP;
if (cfg.method === "roots") {
  p = invoke(c.tree, "loadRoots");
  if (cfg.scenario === "waiters") otherP = invoke(c.tree, "loadRoots");
  q = await c.wire.next("inst.roots");
} else if (cfg.method === "children") {
  const id = row(c.tree, "B-root").id;
  p = invoke(c.tree, "setExpanded", id, true);
  if (cfg.scenario === "waiters")
    otherP = invoke(c.tree, "setExpanded", id, true);
  q = await c.wire.next("inst.children");
} else {
  p = invoke(c.tree, "reveal", "B-target");
  q = await c.wire.next("obj.get");
}
oldVisible = beforeState();
assert.equal(oldVisible.status, "pending");
let data = { leading: "B prefix" },
  issue,
  post = () => {};
const thrown =
  cfg.throwValue === "undefined"
    ? undefined
    : cfg.throwValue === "null"
      ? null
      : cfg.throwValue === "zero"
        ? 0
        : cfg.throwValue === "false"
          ? false
          : cfg.throwValue === "empty"
            ? ""
            : cfg.throwValue === "poison"
              ? new Proxy(
                  {},
                  {
                    get() {
                      thrownInspections++;
                      throw Error("B forbidden thrown-value Get");
                    },
                    ownKeys() {
                      thrownInspections++;
                      throw Error("B forbidden thrown-value ownKeys");
                    },
                    getOwnPropertyDescriptor() {
                      thrownInspections++;
                      throw Error("B forbidden thrown-value descriptor");
                    },
                  },
                )
              : new Error("B diagnostic getter marker");
const hook = () => {
  readCalls++;
  assert.equal(beforeState().status, "pending");
};
const tail = (o) =>
  Object.defineProperty(o, "later", {
    enumerable: true,
    get() {
      tailCalls++;
      return "B later";
    },
  });
const stop = () => {
  c.tree.dispose();
  if (cfg.afterDisposeThrow) throw thrown;
  return "B ignored after dispose";
};
const fail = () => {
  hook();
  if (cfg.scenario === "dispose") return stop();
  throw thrown;
};
const mkIssue = (operation, path) => ({
  code: "data_read_failed",
  operation,
  path,
});
const original = new HierError(
  "transport_closed",
  "transport",
  "B original SDK error",
  data,
);
if (
  cfg.scenario === "failure" ||
  cfg.scenario === "observer" ||
  cfg.scenario === "waiters"
) {
  if (cfg.site === "data") {
    Object.defineProperty(original, "data", { configurable: true, get: fail });
    issue = mkIssue("read", []);
  } else if (cfg.site === "nested") {
    data.branch = {};
    Object.defineProperty(data.branch, cfg.key, {
      enumerable: true,
      get: fail,
    });
    tail(data.branch);
    issue = mkIssue("read", ["branch", cfg.key]);
  } else if (cfg.site === "arrayIndex") {
    const a = [];
    Object.defineProperty(a, "2", { enumerable: true, get: fail });
    data.items = a;
    issue = mkIssue("read", ["items", "2"]);
  } else if (cfg.site === "enumerateRoot" || cfg.site === "enumerateNested") {
    const v = new Proxy(
      { x: 1 },
      {
        ownKeys() {
          hook();
          throw thrown;
        },
      },
    );
    if (cfg.site === "enumerateRoot") {
      data = v;
      Object.defineProperty(original, "data", { value: v });
      issue = mkIssue("enumerate", []);
    } else {
      data.branch = v;
      issue = mkIssue("enumerate", ["branch"]);
    }
  } else if (cfg.site === "descriptor") {
    data.branch = new Proxy(
      { bad: 1 },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === "bad") {
            hook();
            throw thrown;
          }
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    issue = mkIssue("inspect", ["branch", "bad"]);
  } else if (cfg.site === "revoked") {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    data.branch = revoked.proxy;
    issue = mkIssue("inspect", ["branch"]);
  } else if (cfg.site === "length") {
    data.items = new Proxy([], {
      get(target, key, receiver) {
        if (key === "length") {
          hook();
          throw thrown;
        }
        return Reflect.get(target, key, receiver);
      },
    });
    issue = mkIssue("read", ["items", "length"]);
  } else {
    Object.defineProperty(data, "detail", { enumerable: true, get: fail });
    tail(data);
    issue = mkIssue("read", ["detail"]);
  }
} else if (cfg.scenario === "dispose") {
  if (cfg.site === "data") {
    Object.defineProperty(original, "data", {
      configurable: true,
      get: () => {
        hook();
        return stop();
      },
    });
  } else if (cfg.site === "enumerate") {
    data = new Proxy(
      { x: 1, later: 2 },
      {
        ownKeys() {
          hook();
          stop();
          return ["x", "later"];
        },
        get() {
          tailCalls++;
          return 1;
        },
      },
    );
    Object.defineProperty(original, "data", { value: data });
  } else if (cfg.site === "descriptor") {
    data = new Proxy(
      { detail: 1, later: 2 },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === "detail") {
            hook();
            stop();
          }
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
        get() {
          tailCalls++;
          return 1;
        },
      },
    );
    Object.defineProperty(original, "data", { value: data });
  } else if (cfg.site === "length") {
    data.items = new Proxy([], {
      get(target, key, receiver) {
        if (key === "length") {
          hook();
          return stop();
        }
        tailCalls++;
        return Reflect.get(target, key, receiver);
      },
    });
  } else {
    Object.defineProperty(data, "detail", {
      enumerable: true,
      get: () => {
        hook();
        return stop();
      },
    });
    tail(data);
  }
} else if (cfg.scenario === "reentrant") {
  const argument = new Proxy(
    {},
    {
      get() {
        paramReads++;
        throw Error("B parameter must not be read");
      },
    },
  );
  const commands = [
    ["loadRoots"],
    ["setExpanded", argument, argument],
    ["loadMore", argument],
    ["reload", argument],
    ["cancel", argument],
    ["setShowGenerateScopes", argument],
    ["reveal", argument],
  ];
  Object.defineProperty(data, "detail", {
    enumerable: true,
    get() {
      hook();
      for (const [name, ...args] of commands) {
        const action = invoke(c.tree, name, ...args);
        nested.push(
          action.then(
            () => ({ name, success: true }),
            (error) => ({ name, error }),
          ),
        );
      }
      if (cfg.throwAfterRead) throw thrown;
      return returned;
    },
  });
  if (cfg.throwAfterRead) {
    issue = mkIssue("read", ["detail"]);
    tail(data);
  }
  post = async () => {
    const results = await Promise.all(nested);
    assert.equal(results.length, 7);
    for (const result of results) {
      assert.equal(result.success, undefined, result.name);
      assert.ok(result.error instanceof vm.TreeError);
      assert.equal(result.error.code, "reentrant_change");
    }
    assert.equal(paramReads, 0);
    assert.equal(c.wire.queries.length, originalCount + 1);
    await c.tree.setShowGenerateScopes(false);
    assert.equal(c.tree.showGenerateScopes, false);
  };
} else if (cfg.scenario === "subscribe") {
  let removed = 0,
    added = 0;
  const off = c.tree.subscribe(() => {
    removed++;
  });
  const countBefore = removed;
  Object.defineProperty(data, "detail", {
    enumerable: true,
    get() {
      hook();
      off();
      c.tree.subscribe(() => {
        added++;
      });
      return returned;
    },
  });
  post = () => {
    assert.equal(removed, countBefore);
    assert.equal(added, 1);
  };
} else if (cfg.scenario === "otherModel") {
  other = new vm.TreeModel(c.client);
  cleanup.push(() => other.dispose());
  Object.defineProperty(data, "detail", {
    enumerable: true,
    get() {
      hook();
      const action = other.setShowGenerateScopes(false);
      nested.push(watch(action));
      return returned;
    },
  });
  post = async () => {
    await Promise.all(nested);
    assert.equal(other.showGenerateScopes, false);
  };
} else if (cfg.scenario === "normalGetter") {
  Object.defineProperty(data, "detail", {
    enumerable: true,
    get() {
      hook();
      return returned;
    },
  });
  post = (old) => {
    assert.equal(readCalls, 1);
    assert.notStrictEqual(old.error.data.detail, returned);
    returned.value = 99;
    assert.equal(old.error.data.detail.value, 1);
    assert.equal(Object.isFrozen(returned), false);
  };
} else if (cfg.scenario === "empty") {
  data = {};
  Object.defineProperty(original, "data", { value: data });
} else if (cfg.scenario === "sharedFailure") {
  const shared = {
    get detail() {
      return fail();
    },
  };
  data = { first: shared, second: shared };
  tail(data);
  Object.defineProperty(original, "data", { value: data });
  issue = mkIssue("read", ["first", "detail"]);
  post = () => assert.equal(readCalls, 1);
} else if (cfg.scenario === "shared") {
  let count = 0;
  const shared = {
    get value() {
      count++;
      return 1;
    },
  };
  data = { a: shared, b: shared };
  data.self = data;
  Object.defineProperty(original, "data", { value: data });
  post = (old) => {
    assert.equal(count, 1);
    assert.strictEqual(old.error.data.a, old.error.data.b);
    assert.strictEqual(old.error.data.self, old.error.data);
    assert.notStrictEqual(old.error.data, data);
  };
} else if (cfg.scenario === "sparse") {
  let lengthReads = 0,
    hiddenReads = 0,
    symbolReads = 0,
    coercions = 0;
  const a = [];
  a.length = 5;
  a[2] = returned;
  a.extra = "B array extra";
  data = {
    items: new Proxy(a, {
      get(target, key, receiver) {
        if (key === "length") lengthReads++;
        return Reflect.get(target, key, receiver);
      },
    }),
  };
  Object.defineProperty(data, "hidden", {
    enumerable: false,
    get() {
      hiddenReads++;
      throw Error("B hidden");
    },
  });
  Object.defineProperty(data, Symbol("B symbol"), {
    enumerable: true,
    get() {
      symbolReads++;
      throw Error("B symbol");
    },
  });
  const proto = {
    toJSON() {
      coercions++;
      throw Error("B toJSON");
    },
    valueOf() {
      coercions++;
      throw Error("B valueOf");
    },
    toString() {
      coercions++;
      throw Error("B toString");
    },
  };
  Object.setPrototypeOf(data, proto);
  Object.defineProperty(original, "data", { value: data });
  post = (old) => {
    assert.equal(lengthReads, 1);
    assert.equal(hiddenReads, 0);
    assert.equal(symbolReads, 0);
    assert.equal(coercions, 0);
    const a = old.error.data.items;
    assert.equal(a.length, 5);
    assert.equal(0 in a, false);
    assert.equal(1 in a, false);
    assert.equal(2 in a, true);
    assert.equal(3 in a, false);
    assert.equal(4 in a, false);
    assert.equal(a.extra, "B array extra");
    returned.value = 99;
    assert.equal(a[2].value, 1);
  };
} else if (cfg.scenario === "shadowIssue") {
  data = {
    dataIssue: { code: "B SDK-owned field", operation: "arbitrary" },
    value: 1,
  };
  Object.defineProperty(original, "data", { value: data });
  post = (old) =>
    assert.deepEqual(old.error.data.dataIssue, {
      code: "B SDK-owned field",
      operation: "arbitrary",
    });
}
const pResult = p.then(
  () => ({ success: true }),
  (error) => ({ error }),
);
const secondResult = otherP?.then(
  () => ({ success: true }),
  (error) => ({ error }),
);
const beforeFailureNotifications = notifications;
c.wire.closed = true;
for (const token of [...c.wire.closes])
  if (c.wire.closes.has(token)) token.handler(original);
try {
  const result = await pResult;
  assert.equal(result.success, undefined, "failed SDK query must not resolve");
  assert.equal(Object.isFrozen(original), false);
  assert.equal(
    Object.isFrozen(data),
    false,
    "do not freeze the caller's diagnostic",
  );
  if (cfg.scenario === "dispose") {
    assert.ok(result.error instanceof vm.TreeError);
    assert.equal(result.error.code, "disposed");
    assert.strictEqual(
      result.error.cause,
      original,
      "record the original query error before diagnostic reading",
    );
    assert.equal(c.tree.disposed, true);
    assert.deepEqual(c.tree.rows, []);
    assert.deepEqual(c.tree.rootState, { status: "idle", loadedCount: 0 });
    assert.deepEqual(c.tree.revealState, { status: "idle" });
    assert.equal(tailCalls, 0);
    assert.equal(
      notifications,
      beforeFailureNotifications,
      "capture/dispose must not publish another batch",
    );
    console.log(
      JSON.stringify({
        scenario: cfg.scenario,
        method: cfg.method,
        code: result.error.code,
        disposed: true,
        root: c.tree.rootState,
        reveal: c.tree.revealState,
        reads: readCalls,
        tailReads: tailCalls,
      }),
    );
  } else {
    if (cfg.scenario === "observer") {
      assert.ok(result.error instanceof AggregateError);
      assert.deepEqual(result.error.errors, [listenerMarker]);
      assert.strictEqual(result.error.cause, original);
    } else
      assert.strictEqual(
        result.error,
        original,
        "preserve the exact original HierError",
      );
    if (secondResult) {
      const second = await secondResult;
      assert.strictEqual(second.error, original);
      assert.equal(c.wire.queries.length, originalCount + 1);
    }
    const old = beforeState();
    assert.equal(old.status, "failed");
    assert.equal(old.error.code, original.code);
    assert.equal(old.error.origin, original.origin);
    assert.equal(old.error.message, original.message);
    if (issue) {
      assert.deepEqual(Reflect.ownKeys(old.error.data), []);
      assert.deepEqual(old.error.dataIssue, issue);
      frozen(old.error.dataIssue);
      assert.equal(tailCalls, 0);
      assert.equal(thrownInspections, 0);
    } else
      assert.equal(
        Object.hasOwn(old.error, "dataIssue"),
        false,
        "successfully captured diagnostic must omit dataIssue",
      );
    assert.equal(
      notifications,
      beforeFailureNotifications + 1,
      "one settled batch, no diagnostic-preparation notifications",
    );
    frozen(old);
    await post(old);
    const notificationCount = notifications;
    c.tree.dispose();
    assert.equal(notifications, notificationCount);
    frozen(old);
    console.log(
      JSON.stringify({
        scenario: cfg.scenario,
        method: cfg.method,
        code: original.code,
        issue: old.error.dataIssue,
        notifications: notificationCount,
        reads: readCalls,
        tailReads: tailCalls,
        thrownInspections,
      }),
    );
  }
} finally {
  for (const finish of cleanup) finish();
}
