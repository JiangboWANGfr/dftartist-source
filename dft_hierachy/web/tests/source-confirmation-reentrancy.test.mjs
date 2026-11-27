// A regression for the clarified Q1 text. B's six unresolved inputs stay untouched.
import assert from "node:assert/strict";
import test from "node:test";
import {
  N,
  boot,
  using,
  poison,
  local,
} from "./independent-source-confirmation/harness.mjs";

await boot();
for (const source of ["source", "readSource", "resolveSource"]) {
  for (const method of ["createCandidateAction", "confirmCandidate"]) {
    test(`Q1 ${source}/${method}: synchronous start versus asynchronous continuation`, async () => {
      await using(async (c) => {
        const document =
          source === "resolveSource" ? await N.document(c) : undefined;
        const foreign = poison();
        const original = new N.H.sdk.HierError(
          "not_found",
          "core",
          "A Q1 boundary",
          {},
        );
        let calls = 0;
        c.client[source] = () => {
          calls++;
          const expected =
            source !== "readSource"
              ? "reentrant_change"
              : method === "createCandidateAction"
                ? "not_ready"
                : "invalid_action";
          local(() => c.m[method](foreign.value, foreign.value), expected);
          return Promise.reject(original);
        };
        const operation =
          source === "resolveSource"
            ? N.call(c, "locate", document, 0)
            : N.call(c, "load", "A-q1-target", "definition");
        if (source === "readSource") {
          const request = await c.wire.next("obj.source");
          c.wire.ok(request, N.H.span(N.H.point(0), N.H.point(0)));
        }
        assert.equal(await N.bad(operation), original);
        assert.equal(calls, 1);
        assert.equal(foreign.counts.probes, 0);
      });
    });
  }
}
