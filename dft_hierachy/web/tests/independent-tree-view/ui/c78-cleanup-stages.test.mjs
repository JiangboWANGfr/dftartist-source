import assert from "node:assert/strict";
import test from "node:test";
import {
  describeFailure,
  releaseCoreSessions,
  releaseStages,
} from "./resource-cleanup.mjs";

const stages = [
  "page.shutdown",
  "page.close",
  "browser.close",
  "bridge.close",
  "server.close",
  "core.exit",
];
test("C78 no acquired resources", async () => {
  assert.deepEqual(await releaseStages([]), { attempted: [], errors: [] });
});
test("C78 all normal release stages retain order", async () => {
  const called = [];
  const result = await releaseStages(
    stages.map((name) => [name, () => called.push(name)]),
  );
  assert.deepEqual(called, stages);
  assert.deepEqual(result, { attempted: stages, errors: [] });
});
for (const failed of stages) {
  test(`C78 ${failed} rejection never skips later release`, async () => {
    const error = Object.freeze({ failed });
    const called = [];
    const result = await releaseStages(
      stages.map((name) => [
        name,
        () => {
          called.push(name);
          if (name === failed) return Promise.reject(error);
        },
      ]),
    );
    assert.deepEqual(called, stages);
    assert.deepEqual(result.attempted, stages);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].stage, failed);
    assert.ok(Object.is(result.errors[0].error, error));
  });
}
test("C78 multiple falsy rejections all retained without serialization", async () => {
  const values = [undefined, null, 0, false, ""];
  const result = await releaseStages(
    values.map((value, i) => [
      String(i),
      () => {
        throw value;
      },
    ]),
  );
  assert.equal(result.errors.length, values.length);
  result.errors.forEach((entry, i) => {
    assert.equal(entry.stage, String(i));
    assert.ok(Object.is(entry.error, values[i]));
  });
});
test("C78 sequential stage waits for actual release before next stage", async () => {
  let enter, release;
  const entered = new Promise((resolve) => (enter = resolve));
  const gate = new Promise((resolve) => (release = resolve));
  const called = [];
  const work = releaseStages([
    [
      "first",
      async () => {
        called.push("first");
        enter();
        await gate;
      },
    ],
    ["second", () => called.push("second")],
  ]);
  await entered;
  assert.deepEqual(called, ["first"]);
  release();
  assert.equal((await work).errors.length, 0);
  assert.deepEqual(called, ["first", "second"]);
});
test("C78 diagnostic reporting cannot rethrow undefined or poisonous values", () => {
  assert.deepEqual(describeFailure(undefined), {
    type: "undefined",
    message: "non-Error rejection",
  });
  const poison = new Proxy(
    {},
    {
      get() {
        throw undefined;
      },
    },
  );
  assert.deepEqual(describeFailure(poison), {
    type: "object",
    message: "non-Error rejection",
  });
});

function session(id, called, failures = new Set()) {
  const enter = (stage) => {
    called.push(`${id}.${stage}`);
    if (failures.has(stage)) throw Object.freeze({ id, stage });
  };
  return {
    id,
    frames: ["queued"],
    pending: {},
    transport: {
      close: () => enter("close"),
      exited: failures.has("exited")
        ? Promise.reject(Object.freeze({ id, stage: "exited" }))
        : Promise.resolve({ code: 0, signal: null }),
    },
    offMessage: () => enter("offMessage"),
    offClose: () => enter("offClose"),
  };
}
const flush =
  (called, failures = new Set()) =>
  (s) => {
    called.push(`${s.id}.poll`);
    s.pending = null;
    if (failures.has(s.id)) throw undefined;
  };
test("C78 every Core close requested before waiting on any exit", async () => {
  const called = [];
  let resolveExit, markExitWait;
  const exitWait = new Promise((resolve) => (markExitWait = resolve));
  const gate = new Promise((resolve) => (resolveExit = resolve));
  const a = session("a", called),
    b = session("b", called);
  Object.defineProperty(a.transport, "exited", {
    get() {
      markExitWait();
      return gate;
    },
  });
  const closing = releaseCoreSessions([a, b], flush(called));
  await exitWait;
  assert.deepEqual(called.slice(0, 2), ["a.close", "b.close"]);
  resolveExit({ code: 0, signal: null });
  assert.equal((await closing).errors.length, 0);
  for (const s of [a, b]) {
    assert.deepEqual(s.frames, []);
    assert.equal(s.pending, null);
    assert.equal(s.messageListenerReleased, true);
    assert.equal(s.closeListenerReleased, true);
    assert.equal(s.closed, true);
  }
});
test("C78 already requested Core is not closed twice, but listeners/poll released", async () => {
  const called = [];
  const a = session("a", called);
  a.closeRequested = true;
  assert.equal(
    (await releaseCoreSessions([a], flush(called))).errors.length,
    0,
  );
  assert.deepEqual(called, ["a.offMessage", "a.offClose", "a.poll"]);
  assert.deepEqual(a.frames, []);
});
test("C78 rejected Core exit does not skip its or another Core's listeners/poll", async () => {
  const called = [];
  const a = session("a", called, new Set(["exited"]));
  const b = session("b", called);
  const result = await releaseCoreSessions([a, b], flush(called));
  assert.deepEqual(
    result.errors.map((e) => e.stage),
    ["a.exited"],
  );
  for (const id of ["a", "b"])
    for (const stage of ["close", "offMessage", "offClose", "poll"])
      assert.ok(called.includes(`${id}.${stage}`));
  assert.ok(a.messageListenerReleased && b.closeListenerReleased);
});
test("C78 close/unsubscribe/poll exceptions retained and no later stage skipped", async () => {
  const called = [];
  // Controlled settled exit: not a claim that an arbitrary uncloseable process can be reaped.
  const a = session("a", called, new Set(["close", "offMessage", "offClose"]));
  const b = session("b", called);
  const result = await releaseCoreSessions(
    [a, b],
    flush(called, new Set(["a"])),
  );
  assert.deepEqual(
    result.errors.map((e) => e.stage),
    ["a.close", "a.offMessage", "a.offClose", "a.poll"],
  );
  assert.equal(result.errors.at(-1).error, undefined);
  assert.deepEqual(a.frames, []);
  assert.deepEqual(b.frames, []);
  assert.ok(b.messageListenerReleased && b.closeListenerReleased);
});
test("C78 empty Core ownership set is safely repeatable", async () => {
  const noop = () => assert.fail("no poll for no sessions");
  assert.deepEqual(await releaseCoreSessions([], noop), {
    attempted: [],
    errors: [],
  });
  assert.deepEqual(await releaseCoreSessions([], noop), {
    attempted: [],
    errors: [],
  });
});
