// Independent B, DESIGN §6.17.2 Q1 text. Never reads A Q1 tests.
import assert from "node:assert/strict";
import { N, using, hit, issue, local, poison, confirm } from "../harness.mjs";
export const q1Cases = [];
for (const source of ["source", "readSource", "resolveSource"])
  for (const method of ["createCandidateAction", "confirmCandidate"]) {
    const code =
      source === "readSource"
        ? method === "createCandidateAction"
          ? "not_ready"
          : "invalid_action"
        : "reentrant_change";
    q1Cases.push({
      id: "B31-Q1-" + source + "-" + method,
      group: "synchronous-start-vs-async-continuation",
      input: {
        source,
        method,
        sourceReply: "after original command returned",
        arguments: "hostile objects; no owned action",
      },
      expected: {
        code,
        throws: "synchronous SourceConfirmationError",
        probes: 0,
        outerCommand: "real SDK task succeeds",
        extraRequests: 0,
      },
      basis:
        "fixed DESIGN §6.17.2 B30-Q1 clarification and §6.13.2, NOT A tests",
      run: () =>
        using(async (c) => {
          const d =
            source === "resolveSource" ? await N.document(c) : undefined;
          const own = Object.getOwnPropertyDescriptor(c.client, source),
            original = c.client[source],
            h = poison();
          let calls = 0,
            returned = false;
          Object.defineProperty(c.client, source, {
            configurable: true,
            writable: true,
            value: function (...args) {
              calls++;
              assert.equal(
                returned,
                source === "readSource",
                "explicit stack boundary, not pending status",
              );
              const old = N.snapshot(c),
                selected = c.s.current;
              local(() => c.m[method](h.value, h.value), code);
              N.unchanged(c, old);
              assert.equal(c.s.current, selected);
              assert.equal(h.counts.probes, 0);
              return Reflect.apply(original, this, args);
            },
          });
          try {
            if (source === "resolveSource") {
              const pending = N.candidateStart(c, d);
              returned = true;
              await N.candidateFinish(c, await pending, { items: [hit()] });
            } else {
              const pending = N.documentStart(c);
              returned = true;
              await N.documentFinish(c, await pending);
            }
            assert.equal(calls, 1);
            assert.equal(h.counts.probes, 0);
          } finally {
            if (own) Object.defineProperty(c.client, source, own);
            else delete c.client[source];
          }
          assert.equal(c.client[source], original);
          if (source !== "resolveSource")
            await N.candidateFinish(c, await N.candidateStart(c), {
              items: [hit()],
            });
          assert.deepEqual(c.s.current.items, []);
          assert.equal(confirm(c, issue(c)), 1);
        }),
    });
  }
