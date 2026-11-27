import assert from "node:assert/strict";
import test from "node:test";
import { setup } from "../graph-selection/fixture.mjs";
import { MessageGate } from "../independent-layout/worker.mjs";

const M = await import(
  process.env.HIER_A_VIEWMODEL_ENTRY ?? "../../packages/viewmodel/dist/index.js"
);
const local = (code) => (error) =>
  error instanceof M.LayoutError && error.code === code;

async function using(configure, run, folded = false) {
  const c = await setup(M, 3);
  c.workers = [];
  c.layout = new M.LayoutService(
    c.graph,
    {
      timeoutMs: 5000,
      workerFactory() {
        const worker = new MessageGate();
        c.workers.push(worker);
        configure?.(worker, c, c.workers.length);
        return worker;
      },
    },
    ...(folded ? ["folded"] : []),
  );
  c.input = () =>
    folded
      ? M.createFoldedGraphProjection(c.graph, { groups: [], collapsed: [] })
      : {
          sessionId: c.graph.id,
          graphRevision: c.graph.state.revision,
          direction: "RIGHT",
          nodes: c.graph.state.nodes.map((n) => ({
            id: n.id,
            width: 60,
            height: 32,
            ports: [],
          })),
          edges: c.graph.state.edges.map((e) => ({ id: e.id })),
        };
  c.start = () => {
    const pending = c.layout.layout(c.input());
    pending.catch(() => {});
    return pending;
  };
  try {
    await run(c);
  } finally {
    c.layout.dispose();
    c.close();
    // Failed old-version probes must not contaminate the next case.
    // Assertions below observe actual product cleanup before this fixture teardown.
    for (const worker of c.workers)
      for (const [type, handlers] of worker.registrations)
        for (const handler of handlers)
          MessageGate.prototype.removeEventListener.call(worker, type, handler);
  }
}
function released(worker) {
  assert.equal(worker.terminated, 1, "owned Worker terminated exactly once");
  assert.equal(
    worker.handlerCount,
    0,
    "no listener installed after the owner closed",
  );
}
function contains(error, target, seen = new Set()) {
  if (error === target) return true;
  if (!error || typeof error !== "object" || seen.has(error)) return false;
  seen.add(error);
  return (
    contains(error.cause, target, seen) ||
    (error instanceof AggregateError &&
      error.errors.some((e) => contains(e, target, seen)))
  );
}

test("A Worker startup: disposal at every listener registration boundary leaves no retained handlers", async () => {
  for (const folded of [false, true])
    for (const graph of [false, true])
      for (const kind of ["message", "error", "messageerror"])
        for (const phase of ["before", "after"]) {
          await using(
            (worker, c) => {
              const add = worker.addEventListener;
              let fired = false;
              worker.addEventListener = function (type, handler, ...options) {
                if (type !== kind || fired)
                  return add.call(this, type, handler, ...options);
                fired = true;
                const dispose = () =>
                  graph ? c.graph.dispose() : c.layout.dispose();
                if (phase === "before") dispose();
                add.call(this, type, handler, ...options);
                if (phase === "after") dispose();
              };
            },
            async (c) => {
              await assert.rejects(c.start(), local("disposed"));
              const worker = c.workers[0];
              released(worker);
              assert.equal(worker.messages.length, 0);
              assert.equal(c.layout.state.status, "disposed");
              assert.equal(c.layout.state.result, null);
              c.layout.dispose();
              released(worker);
            },
            folded,
          );
        }
});

test("A Worker startup: a registration method getter cannot dispatch work after releasing its owner", async () => {
  for (const kind of ["message", "error", "messageerror"]) {
    let invokedAfterRelease = 0;
    await using(
      (worker, c) => {
        const add = worker.addEventListener;
        let reads = 0;
        Object.defineProperty(worker, "addEventListener", {
          get() {
            const type = ["message", "error", "messageerror"][reads++];
            if (type === kind) c.layout.dispose();
            return function (...args) {
              if (c.layout.disposed) invokedAfterRelease++;
              return add.apply(this, args);
            };
          },
        });
      },
      async (c) => {
        await assert.rejects(c.start(), local("disposed"));
        assert.equal(invokedAfterRelease, 0);
        released(c.workers[0]);
        assert.equal(c.workers[0].messages.length, 0);
      },
    );
  }
});

test("A Worker startup: registration failure keeps its cause, cleans partial installation, and permits retry", async () => {
  for (const kind of ["message", "error", "messageerror"]) {
    const marker = Object.freeze({ kind });
    await using(
      (worker, _c, attempt) => {
        if (attempt !== 1) return;
        const add = worker.addEventListener;
        worker.addEventListener = function (type, ...args) {
          add.call(this, type, ...args);
          if (type === kind) throw marker;
        };
      },
      async (c) => {
        await assert.rejects(
          c.start(),
          (e) => local("worker_failure")(e) && e.cause === marker,
        );
        released(c.workers[0]);
        assert.equal(c.layout.state.status, "failed");
        const retry = c.layout.retry();
        c.workers[1].succeed();
        await retry;
        assert.equal(c.layout.state.status, "success");
        released(c.workers[1]);
      },
    );
  }
});

test("A Worker startup: disposal preserves both registration and late-removal exceptions", async () => {
  const registration = Object.freeze({ marker: "registration" });
  const removal = Object.freeze({ marker: "late-removal" });
  await using(
    (worker, c) => {
      const add = worker.addEventListener,
        remove = worker.removeEventListener;
      let installed = false;
      worker.addEventListener = function (type, ...args) {
        if (type === "message") {
          c.layout.dispose();
          add.call(this, type, ...args);
          installed = true;
          throw registration;
        }
        add.call(this, type, ...args);
      };
      worker.removeEventListener = function (...args) {
        remove.apply(this, args);
        if (installed) throw removal;
      };
    },
    async (c) => {
      await assert.rejects(
        c.start(),
        (error) =>
          local("disposed")(error) &&
          contains(error, registration) &&
          contains(error, removal),
      );
      released(c.workers[0]);
      assert.equal(c.layout.state.status, "disposed");
    },
  );
});

test("A Worker startup: reading a send method cannot post a retired register or layout request", async () => {
  for (const folded of [false, true])
    for (const turn of [1, 2]) {
      await using(
        (worker, c) => {
          const post = worker.postMessage;
          let reads = 0;
          Object.defineProperty(worker, "postMessage", {
            get() {
              if (++reads === turn) c.layout.dispose();
              return post;
            },
          });
        },
        async (c) => {
          await assert.rejects(c.start(), local("disposed"));
          const worker = c.workers[0];
          assert.deepEqual(
            worker.messages.map((m) => m.cmd),
            turn === 1 ? [] : ["register"],
          );
          released(worker);
        },
        folded,
      );
    }
});

test("A Worker startup: send getter exceptions retain disposal precedence and original cause", async () => {
  for (const turn of [1, 2]) {
    const marker = Object.freeze({ send: turn });
    await using(
      (worker, c) => {
        const post = worker.postMessage;
        let reads = 0;
        Object.defineProperty(worker, "postMessage", {
          get() {
            if (++reads === turn) {
              c.graph.dispose();
              throw marker;
            }
            return post;
          },
        });
      },
      async (c) => {
        await assert.rejects(
          c.start(),
          (e) => local("disposed")(e) && e.cause === marker,
        );
        released(c.workers[0]);
        assert.equal(c.layout.state.status, "disposed");
      },
    );
  }
});

test("A Worker startup: synchronous error during registration stops startup and allows a fresh Worker", async () => {
  for (const kind of ["error", "messageerror"]) {
    const marker = Object.freeze({ error: kind });
    await using(
      (worker, _c, attempt) => {
        if (attempt !== 1) return;
        const add = worker.addEventListener;
        worker.addEventListener = function (type, ...args) {
          add.call(this, type, ...args);
          if (type === kind) this.emit(type, marker);
        };
      },
      async (c) => {
        await assert.rejects(
          c.start(),
          (e) => local("worker_failure")(e) && e.cause === marker,
        );
        released(c.workers[0]);
        assert.equal(c.workers[0].messages.length, 0);
        const retry = c.layout.retry();
        c.workers[1].succeed();
        await retry;
        released(c.workers[1]);
      },
    );
  }
});

test("A Worker startup: graph release closes both an existing attempt and an attempt still registering", async () => {
  await using(
    (worker, c) => {
      const add = worker.addEventListener;
      worker.addEventListener = function (type, ...args) {
        if (type === "error") c.graph.dispose();
        add.call(this, type, ...args);
      };
    },
    async (c) => {
      const peerWorker = new MessageGate();
      const peer = new M.LayoutService(c.graph, {
        workerFactory: () => peerWorker,
        timeoutMs: 5000,
      });
      const pending = peer.layout(c.input());
      pending.catch(() => {});
      await assert.rejects(c.start(), local("disposed"));
      await assert.rejects(pending, local("disposed"));
      released(c.workers[0]);
      released(peerWorker);
      peerWorker.succeed(undefined, true);
      assert.equal(peer.state.status, "disposed");
      assert.equal(peer.state.result, null);
      peer.dispose();
      released(peerWorker);
    },
  );
});

test("A Worker startup: a live send failure retains its cleanup cause and retries with a new owner", async () => {
  const send = Object.freeze({ marker: "send" }),
    cleanup = Object.freeze({ marker: "terminate" });
  await using(
    (worker, _c, attempt) => {
      if (attempt === 1) {
        worker.postError = send;
        worker.terminateError = cleanup;
      }
    },
    async (c) => {
      await assert.rejects(
        c.start(),
        (error) =>
          local("worker_failure")(error) &&
          contains(error, send) &&
          contains(error, cleanup),
      );
      released(c.workers[0]);
      const retry = c.layout.retry();
      c.workers[1].succeed();
      await retry;
      released(c.workers[1]);
      assert.equal(c.layout.state.status, "success");
    },
  );
});

test("A Worker startup: registration and send access retain arbitrary thrown values after graph release", async () => {
  for (const name of ["addEventListener", "postMessage"])
    for (const marker of [undefined, null, 0, false]) {
      await using(
        (worker, c) => {
          Object.defineProperty(worker, name, {
            get() {
              c.graph.dispose();
              throw marker;
            },
          });
        },
        async (c) => {
          await assert.rejects(
            c.start(),
            (error) =>
              local("disposed")(error) &&
              Object.hasOwn(error, "cause") &&
              error.cause === marker,
          );
          released(c.workers[0]);
          assert.equal(c.workers[0].messages.length, 0);
        },
      );
    }
});

test("A Worker startup: the first reported terminal failure wins over a later send exception", async () => {
  for (const command of ["register", "layout"]) {
    const first = Object.freeze({ marker: "first" });
    const cleanup = Object.freeze({ marker: "cleanup" });
    const late = Object.freeze({ marker: "late" });
    await using(
      (worker) => {
        const post = worker.postMessage;
        worker.terminateError = cleanup;
        worker.postMessage = function (message) {
          if (message.cmd !== command) return post.call(this, message);
          this.emit("message", { id: message.id, error: first });
          throw late;
        };
      },
      async (c) => {
        const code =
          command === "register" ? "worker_failure" : "layout_failure";
        await assert.rejects(
          c.start(),
          (error) =>
            local(code)(error) &&
            contains(error, first) &&
            contains(error, cleanup) &&
            !contains(error, late),
        );
        assert.equal(c.layout.state.error.code, code);
        released(c.workers[0]);
      },
    );
  }
});
