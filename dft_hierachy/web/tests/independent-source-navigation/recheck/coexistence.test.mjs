// B17: public model coexistence; no private phase hooks or A implementation oracle.
import test from "node:test";
import assert from "node:assert/strict";
import {
  boot,
  H,
  C,
  using,
  call,
  ok,
  bad,
  navError,
  document,
  candidateStart,
  hit,
  sdkAlive,
} from "../harness.mjs";
const specs = [];
for (const owner of ["navigation", "external"])
  for (const action of ["cancel", "dispose"])
    specs.push({
      id: "SN-X-shared-" + owner + "-" + action,
      input: { sameSDK: true, sameQuery: true, owner, action },
      expected:
        "one shared SDK request; cancelling/disposing only owner settles its waiter; other model keeps original reply and SDK alive",
      basis: "DESIGN §6.13.1/.4, §6.11.2 and §5.6 shared consumers",
      run: () =>
        using(
          async (c) => {
            const d = await document(c),
              t = await candidateStart(c, d),
              navCall = c.calls.findLast((x) => x.method === "resolveSource");
            const external = new H.vm.SourceCandidatesModel(c.client, {
              pageSize: 2,
            });
            c.models.push(external);
            const x = H.observe(
              external.load({
                snapshotId: c.client.snapshot.snapshotId,
                file: "B-source-file/尾",
                line: 1,
                col: 1,
              }),
            );
            c.commands.push(x);
            const extCall = c.calls.findLast(
              (v) => v.method === "resolveSource",
            );
            assert.equal(
              c.wire.queries.filter((q) => q.method === "source.resolve")
                .length,
              1,
            );
            if (owner === "navigation") {
              if (action === "dispose") c.m.dispose();
              else await ok(call(c, "cancelCandidates"));
              const e = await bad(
                t.o,
                action === "dispose" ? "disposed" : "cancelled",
              );
              if (action === "dispose") navError(e, "disposed");
              assert.equal(x.done, false);
              assert.equal(c.wire.cancels.length, 0);
              c.wire.ok(t.q, C.page([hit()]));
              await ok(x);
              assert.equal(external.state.status, "success");
              assert.equal(external.state.pages[0], extCall.reply);
            } else {
              if (action === "dispose") external.dispose();
              else {
                const q = H.observe(external.cancel());
                c.commands.push(q);
                await ok(q);
              }
              await bad(x, action === "dispose" ? "disposed" : "cancelled");
              assert.equal(t.o.done, false);
              assert.equal(c.wire.cancels.length, 0);
              c.wire.ok(t.q, C.page([hit()]));
              await ok(t.o);
              assert.equal(c.m.state.candidates.state.status, "success");
              assert.equal(c.m.state.candidates.state.pages[0], navCall.reply);
              assert.equal(c.m.state.candidates.document, d);
            }
            await sdkAlive(c);
          },
          { options: { pageSize: 2 } },
        ),
    });
for (const owner of ["navigation", "external"])
  for (const other of ["document", "candidates"])
    specs.push({
      id: "SN-X-diagnostic-local-" + owner + "-" + other,
      input: {
        diagnosticOwner: owner,
        externalModel: other,
        nested: "other model clear (no-op)",
      },
      expected:
        "diagnostic guard belongs to owning model only; external/Navigation command resolves while owner preserves original rejection",
      basis:
        "DESIGN §6.13.4 old defaults; §6.10.4/6.11.3 and §6.6.6 other models independent",
      run: () =>
        using(async (c) => {
          const external =
            other === "document"
              ? new H.vm.SourceDocumentModel(c.client)
              : new H.vm.SourceCandidatesModel(c.client);
          c.models.push(external);
          const e = new H.sdk.HierError(
            "not_found",
            "core",
            "B original shared-scope error",
            {},
          );
          let inner,
            reads = 0;
          Object.defineProperty(e, "data", {
            configurable: true,
            get() {
              reads++;
              if (owner === "navigation") {
                let q;
                assert.doesNotThrow(() => {
                  q = external.clear();
                });
                inner = H.observe(q);
                c.commands.push(inner);
              } else inner = call(c, "clear");
              return { B: "local guard" };
            },
          });
          const method =
            owner === "navigation" || other === "document"
              ? "source"
              : "resolveSource";
          c.client[method] = () => Promise.reject(e); // Explicit public SDK fault decoration, not legal wire data.
          let outer;
          if (owner === "navigation")
            outer = call(c, "load", "B-nav-target", "definition");
          else {
            const q =
              other === "document"
                ? external.load("B-external", "definition")
                : external.load({
                    snapshotId: c.client.snapshot.snapshotId,
                    file: "B-source-file/尾",
                    line: 1,
                    col: 1,
                  });
            outer = H.observe(q);
            c.commands.push(outer);
          }
          assert.equal(await bad(outer, "not_found"), e);
          assert.equal(reads, 1);
          assert.ok(inner);
          await ok(inner);
          assert.equal(c.wire.queries.length, 0);
        }),
    });
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      {
        kind: "real-public-Navigation-and-independent-models",
        count: specs.length,
        cases: specs.map(({ run, ...c }) => c),
      },
      null,
      2,
    ),
  );
else {
  await boot();
  for (const s of specs)
    test(s.id, async () => {
      let timer;
      try {
        await Promise.race([
          s.run(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(Error("B coexistence watchdog, not SLA: " + s.id)),
              15000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
        await H.releaseAll();
        await H.tick();
      }
    });
}
