import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
process.env.HIER_B_PRODUCT_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const { using, start, projection, local } = await import("../independent-layout/harness.mjs");
import { geometry } from "../independent-layout/worker.mjs";

// A regressions for external reentry after Worker result receipt and during cleanup.
test("layout cleanup cannot republish a revision retired by terminate", async (t) => {
  await using(t, async (c) => {
    const s = c.service();
    const task = await start(c, s);
    let change;
    task.w.onTerminate = () => {
      change = c.source.clear();
    };
    task.w.succeed();
    await assert.rejects(task.p, local("stale_graph"));
    await change;
    assert.equal(s.state.status, "stale");
    assert.equal(s.state.graphRevision, c.graph.state.revision);
  });
});
test("cancelling cleanup preserves a newly published graph revision", async (t) => {
  await using(t, async (c) => {
    const s = c.service();
    const task = await start(c, s);
    let change;
    task.w.onTerminate = () => {
      change = c.source.clear();
    };
    await s.cancel();
    await assert.rejects(task.p, local("cancelled"));
    await change;
    assert.equal(s.state.status, "stale");
    assert.equal(s.state.request, null);
  });
});
test("factory and result access preserve thrown cause when disposal takes over", async (t) => {
  await using(t, async (c) => {
    const cause = Object.freeze({ reason: "factory" });
    const s = c.service({
      workerFactory() {
        c.graph.dispose();
        throw cause;
      },
    });
    await assert.rejects(s.layout(projection(c.graph)), (error) => {
      local("disposed")(error);
      assert.equal(error.cause, cause);
      return true;
    });
  });
  await using(t, async (c) => {
    const cause = Object.freeze({ reason: "result" });
    const s = c.service();
    const task = await start(c, s);
    const result = geometry(task.w.request.graph);
    Object.defineProperty(result, "width", {
      get() {
        c.graph.dispose();
        throw cause;
      },
    });
    task.w.succeed(result);
    await assert.rejects(task.p, (error) => {
      local("disposed")(error);
      assert.equal(error.cause, cause);
      return true;
    });
  });
});

test("constructor wraps revoked options access and preserves its cause", async (t) => {
  await using(t, async (c) => {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const { LayoutService } = await import("../../packages/viewmodel/dist/index.js");
    assert.throws(
      () => new LayoutService(c.graph, revoked.proxy),
      (error) => {
        local("invalid_argument")(error);
        assert(error.cause instanceof TypeError);
        return true;
      },
    );
    assert.equal(c.graph.disposed, false);
    assert.equal(c.workers.length, 0);
  });
});
