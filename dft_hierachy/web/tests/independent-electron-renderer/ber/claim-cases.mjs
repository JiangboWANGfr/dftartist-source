// Negative controls for DESIGN 6.8.3: do not fix foreign-id isolation by dropping own premature faults.
import assert from "node:assert/strict";
import { frame, closed, failure, hello, checkpoint } from "../fixture.mjs";
import { early, exactCause } from "./cases.mjs";
export const cases = [];
for (const shape of ["premature-frame", "wrong-version"])
  for (const first of ["none", "normal", "diagnostic"])
    cases.push({
      id: `BER-OWN-CLAIM-${shape}-${first}`,
      input: {
        ownId: true,
        event: shape,
        priorOwnClose: first,
        phase: "all events before legal connect result",
      },
      expected:
        "own premature/bad frame must close, not be ignored; earlier own normal/diagnostic first cause survives; factory fulfills closed, no SDK ready",
      basis:
        "DESIGN 6.8.3 own premature illegal frame rejected + BER-Q01 first cause; 6.8.4 bad shell",
      async run(c) {
        const b = c.bridge(),
          cause =
            first === "diagnostic" ? failure("document_navigated") : undefined,
          event = frame(hello);
        if (shape === "wrong-version") event.version = 7;
        early(b, first === "none" ? [event] : [closed(cause), event]);
        // If a broken product drops own fault and remains open, a real valid hello makes
        // ready succeed and the rejection assertion fail, rather than merely timing out.
        b.onStart = () => b.emit(frame(hello));
        const { transport: t } = await c.open(b),
          seen = [];
        t.onClose((error) => seen.push(error));
        let client;
        try {
          client = new c.sdk.HierClient(t);
          client.ready.catch(() => {});
          await assert.rejects(
            client.ready,
            c.errorIs("transport_closed", "transport"),
          );
          await checkpoint();
          assert.equal(seen.length, 1);
          if (first !== "none") exactCause(c, seen[0], cause);
          else
            c.errorIs(
              "transport_closed",
              "transport",
              shape === "wrong-version" ? "invalid_ipc_frame" : undefined,
            )(seen[0]);
          assert.equal(b.sent.length, 0);
        } finally {
          client?.dispose();
        }
      },
    });
assert.equal(cases.length, 6);
assert.equal(new Set(cases.map((x) => x.id)).size, 6);
