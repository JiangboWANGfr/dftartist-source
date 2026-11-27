// Oracle: DESIGN 6.8.3 / 5.6.5 closed send always transport_closed, ahead of not_ready.
import assert from "node:assert/strict";
import { closed, failure, checkpoint, snapshot } from "../fixture.mjs";
export const causes = [
  ["normal", undefined],
  ["transport", failure("renderer_gone")],
  ...[
    ["not_ready", "client"],
    ["protocol_error", "client"],
    ["not_found", "core"],
    ["bad_request", "core"],
  ].map(([code, origin]) => [
    code,
    {
      code,
      origin,
      message: "B closed diagnostic " + code,
      data: { b_context: { keep: [1, "界"] } },
    },
  ]),
];
function retain(c, error, dto) {
  if (dto === undefined) assert.equal(error, undefined);
  else {
    c.errorIs(dto.code, dto.origin)(error);
    assert.equal(error.message, dto.message);
    assert.deepEqual(error.data, dto.data);
  }
}
export const cases = [];
for (const [label, dto] of causes)
  for (const bound of [false, true])
    cases.push({
      id: `ER83-CLOSED-SEND-${label}-${bound ? "bound" : "unbound"}`,
      input: {
        closedError: dto ?? "normal undefined",
        receiverBound: bound,
        send: {
          id: 1,
          method: "inst.roots",
          snapshot: snapshot.snapshotId,
          params: {},
        },
      },
      expected:
        "send synchronously throws transport_closed/transport with zero Bridge send; original normal/DTO onClose cause unchanged",
      basis:
        "DESIGN 6.8.3 / 5.6.5 closed priority and 6.8.4 local HierError diagnostics; public ElectronFailure code/origin union",
      async run(c) {
        const { b, transport: t } = await c.open(),
          seen = [];
        if (bound) {
          t.onMessage(() => {});
          await checkpoint();
        }
        t.onClose((error) => seen.push(error));
        b.emit(closed(dto));
        await checkpoint();
        assert.equal(seen.length, 1);
        retain(c, seen[0], dto);
        let caught;
        try {
          t.send({
            id: 1,
            method: "inst.roots",
            snapshot: snapshot.snapshotId,
            params: {},
          });
        } catch (error) {
          caught = error;
        }
        assert.equal(
          b.sent.length,
          0,
          "closed is terminal, no outbound Bridge send",
        );
        c.errorIs("transport_closed", "transport")(caught);
        await checkpoint();
        assert.equal(seen.length, 1);
        retain(c, seen[0], dto);
      },
    });
assert.equal(cases.length, 12);
assert.equal(new Set(cases.map((x) => x.id)).size, 12);
