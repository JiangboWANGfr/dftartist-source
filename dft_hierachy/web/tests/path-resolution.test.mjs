import assert from "node:assert/strict";
import test from "node:test";
import { PathResolutionModel } from "@hier/viewmodel";
import { createSession } from "../contracts/search/core-session.mjs";

// A regressions: real SDK/Core, separate from B68's unchanged frozen oracle.
for (const text of [
  "",
  " \t\n",
  "root.part",
  "root/part",
  "root/\\escaped.name ",
  "d:looks-like-ref",
]) {
  test(`A path model forwards original text ${JSON.stringify(text)}`, async (t) => {
    const client = await createSession(t);
    const original = client.resolvePath;
    const calls = [];
    client.resolvePath = function (...args) {
      const promise = Reflect.apply(original, this, args);
      const call = { args };
      calls.push(call);
      promise.then(
        (reply) => {
          call.reply = reply;
        },
        (error) => {
          call.error = error;
        },
      );
      return promise;
    };
    const model = new PathResolutionModel(client);
    try {
      assert.equal(calls.length, 0);
      const result = await model
        .load({ snapshotId: model.snapshotId, text })
        .then(
          () => ({ ok: true }),
          (error) => ({ ok: false, error }),
        );
      assert.equal(calls.length, 1);
      assert.equal(calls[0].args.length, 2);
      assert.equal(calls[0].args[0], text);
      assert(calls[0].args[1] instanceof AbortSignal);
      assert.equal(model.state.query.text, text);
      // Core path grammar rejects an unescaped colon; L6 still forwards it.
      if (text === "" || text === " \t\n" || text === "d:looks-like-ref") {
        assert.equal(result.ok, false);
        assert.equal(result.error, calls[0].error);
        assert.equal(result.error.code, "bad_request");
        assert.equal(model.state.status, "failed");
      } else {
        assert.equal(result.ok, true);
        assert.equal(model.state.status, "success");
        assert.equal(model.state.reply, calls[0].reply);
        assert.deepEqual(model.state.reply.result, []);
      }
    } finally {
      model.dispose();
      client.resolvePath = original;
    }
  });
}

test("A path compatibility: retained SDK snapshot, disposed request error identity", async (t) => {
  const client = await createSession(t);
  const snapshot = client.snapshot;
  client.dispose();
  assert.equal(client.snapshot, snapshot);
  const originalError = await client.resolvePath("anything").then(
    () => assert.fail("disposed SDK accepted a request"),
    (error) => error,
  );
  // A68-PATH-CONSTRUCTOR-01: document the existing SDK boundary for B/C;
  // this observation does not close the conflicting B68 constructor expectation.
  const model = new PathResolutionModel(client);
  try {
    assert.equal(model.snapshotId, snapshot.snapshotId);
    await assert.rejects(
      model.load({ snapshotId: snapshot.snapshotId, text: "anything" }),
      (error) => error === originalError && error.code === "disposed",
    );
    assert.equal(model.state.status, "failed");
    assert.equal(model.state.error.code, "disposed");
    assert.equal(client.snapshot, snapshot);
  } finally {
    model.dispose();
  }
});
