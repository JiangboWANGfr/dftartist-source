// Independent real Core chain. HDL and ref metadata come only from earlier B fixtures.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  fixture,
  point,
} from "../../independent-source-ref-kind/core-fixture.mjs";
import { publicEntry } from "../../independent-electron-renderer/public-entry.mjs";
import { N, vm, local } from "../harness.mjs";
import { scoped } from "./resource-scope.mjs";
const value = (r) => {
  assert.deepEqual(r.completeness, { status: "complete", reasons: [] });
  return r.result;
};
const sha = (b) => createHash("sha256").update(b).digest("hex");
async function bounded(p, label) {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("B facility watchdog NOT SLA: " + label)),
          20000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function completeHead(nav) {
  const good = () =>
    nav.state.candidates?.state.status === "success" &&
    nav.state.candidates.state.pages.every(
      (p) => p.completeness.status === "complete",
    );
  if (!good())
    await bounded(
      new Promise((resolve, reject) => {
        let off;
        const check = () => {
          if (good()) {
            off?.();
            resolve();
          } else if (
            ["failed", "cancelled"].includes(nav.state.candidates?.state.status)
          ) {
            off?.();
            reject(Error("B unexpected terminal candidate state"));
          }
        };
        off = nav.subscribe(check);
        check();
      }),
      "complete head",
    );
}
export const coreCases = [];
for (const perInstance of [false, true])
  for (const macro of [false, true])
    for (const pageSize of [1, 200])
      coreCases.push({
        id:
          "B31-CORE-" +
          (perInstance ? "per" : "shared") +
          "-" +
          (macro ? "macro" : "plain") +
          "-" +
          pageSize,
        group: "actual-SDK-Node-Core-Nav-Selection-NOT-IPC-UI",
        input: {
          perInstance,
          macro,
          pageSize,
          fixture: "original B ref-kind two-occurrence HDL",
        },
        expected:
          "five independently known addresses; exact ref/def selection, zero confirmation queries/publish, append retains actions, new chain/document expires, history and borrowed resources preserved",
        basis:
          "DESIGN §6.17/§6.16/§5.5.6, original B HDL and public metadata; no A core test",
        run: async () => {
          const P = process.env.HIER_B_PRODUCT_ROOT,
            bin = process.env.HIER_BIN;
          assert.ok(P && bin && path.isAbsolute(P) && path.isAbsolute(bin));
          assert.ok(
            (await fs.realpath(bin)).startsWith(
              (await fs.realpath(P + "/core")) + path.sep,
            ),
            "own fixed product binary",
          );
          const { createProcessTransport } = await import(
            publicEntry(P, "@hier/client/node")
          );
          const temp = await fs.mkdtemp(
              path.join(os.tmpdir(), "hier-b31-confirm-core-"),
            ),
            f = fixture(macro),
            frames = [],
            refreshes = [];
          let wire, client, nav, sel;
          const details = {
            confirms: 0,
            metadataAddresses: [],
            pageCounts: [],
            cleanup: [],
          };
          return await scoped(
            async () => {
              await fs.writeFile(temp + "/b_rk_leaf.svh", f.leaf);
              await fs.writeFile(temp + "/b_rk_top.sv", f.top);
              wire = createProcessTransport({
                command: bin,
                args: [
                  "serve",
                  ...(perInstance ? ["--per-instance-bodies"] : []),
                  temp + "/b_rk_top.sv",
                ],
              });
              wire.exited.catch(() => {});
              const transport = {
                send(frame) {
                  frames.push(structuredClone(frame));
                  return wire.send(frame);
                },
                onMessage: (fn) => wire.onMessage(fn),
                onClose: (fn) => wire.onClose(fn),
                close: () => wire.close(),
              };
              client = new N.H.sdk.HierClient(transport, { cacheEntries: 0 });
              client.ready.catch(() => {});
              const snapshot = await bounded(client.ready, "hello");
              assert.equal(snapshot.protocol, 2);
              assert.equal(snapshot.schemaVersion, 7);
              const roots = value(await client.roots());
              assert.equal(roots.length, 1);
              assert.equal(roots[0].name, "b_rk_top");
              const children = value(
                await client.children(roots[0].ref, { limit: 200 }),
              ).items;
              assert.deepEqual(
                children.map((c) => c.name),
                ["west", "east"],
              );
              assert.equal(children[0].def, children[1].def);
              const registry = new Map([
                [children[0].def, "definition"],
                ...children.map((i) => [i.ref, "object"]),
              ]);
              const start = point(f.leaf, f.assign);
              for (const child of children) {
                const ps = value(await client.procs(child.ref, { limit: 200 }));
                assert.equal(ps.next, undefined);
                const targets = [];
                for (const p of ps.items) {
                  const span = value(await client.source(p.ref, "statement"));
                  if (span.start.offset === start.offset) targets.push(p.ref);
                }
                assert.equal(
                  targets.length,
                  1,
                  "assignment address is public process metadata plus original source span, never inferred from candidates",
                );
                registry.set(targets[0], "object");
              }
              assert.equal(registry.size, 5);
              details.metadataAddresses = [...registry].map(
                ([ref, refKind]) => ({
                  ref,
                  refKind,
                }),
              );
              nav = new (vm().SourceNavigationModel)(client, { pageSize });
              sel = new (vm().SelectionModel)({
                snapshotId: snapshot.snapshotId,
              });
              let publishes = 0;
              nav.subscribe(() => {
                publishes++;
                if (nav.state.refresh) {
                  const p = nav.state.refresh.completion;
                  p.catch(() => {});
                  refreshes.push(p);
                }
              });
              const checkConfirm = (action, expected) => {
                const n = frames.length,
                  old = nav.state,
                  p = publishes;
                assert.equal(nav.confirmCandidate(action, sel), undefined);
                details.confirms++;
                assert.equal(frames.length, n);
                assert.equal(nav.state, old);
                assert.equal(publishes, p);
                assert.deepEqual(sel.current, {
                  items: [expected],
                  origin: "source",
                  snapshotId: snapshot.snapshotId,
                });
              };
              const expectedItem = (h) => {
                assert.ok(
                  registry.has(h.ref),
                  "only independently known original address",
                );
                const tag = registry.get(h.ref);
                assert.equal(h.refKind, tag);
                return tag === "definition" ? { def: h.ref } : { ref: h.ref };
              };
              await nav.load(children[0].ref, "definition");
              let document = nav.state.document.data;
              assert.equal(document.location.status, "exact");
              assert.equal(document.content.result.text, f.leaf);
              assert.equal(
                document.source.result.contentHash,
                sha(Buffer.from(f.leaf)),
              );
              const offset = f.leaf.indexOf(f.assign);
              assert.ok(offset >= 0);
              await nav.locate(document, offset);
              await completeHead(nav);
              let first = nav.state.candidates.state.pages[0],
                a = nav.createCandidateAction(first, 0);
              checkConfirm(a, expectedItem(first.result.items[0]));
              const cursors = new Set();
              for (
                let i = 0;
                nav.state.candidates.state.pages.at(-1).result.next !==
                undefined;
                i++
              ) {
                assert.ok(i < 16);
                const cursor =
                  nav.state.candidates.state.pages.at(-1).result.next;
                assert.ok(!cursors.has(cursor));
                cursors.add(cursor);
                await nav.loadMore();
                await completeHead(nav);
                assert.equal(nav.state.candidates.state.pages[0], first);
                checkConfirm(a, expectedItem(first.result.items[0]));
              }
              const pages = nav.state.candidates.state.pages;
              assert.equal(pages.at(-1).result.next, undefined);
              const hits = pages.flatMap((p) => p.result.items);
              assert.equal(hits.length, 5);
              assert.equal(new Set(hits.map((h) => h.ref)).size, 5);
              assert.deepEqual(
                new Set(hits.map((h) => h.ref)),
                new Set(registry.keys()),
              );
              details.pageCounts = pages.map((p) => p.result.items.length);
              for (const page of pages) {
                assert.ok(page.result.items.length <= pageSize);
                N.H.deep(page);
                for (let index = 0; index < page.result.items.length; index++)
                  checkConfirm(
                    nav.createCandidateAction(page, index),
                    expectedItem(page.result.items[index]),
                  );
              }
              const last = sel.current;
              sel.back();
              assert.notDeepEqual(sel.current.items, last.items);
              sel.forward();
              assert.deepEqual(sel.current, last);
              const before = sel.current;
              await nav.reloadCandidates();
              await completeHead(nav);
              local(() => nav.confirmCandidate(a, sel), "stale_action");
              assert.equal(sel.current, before);
              const second = nav.state.candidates.state.pages[0];
              assert.notEqual(second, first, "source.resolve not cached");
              a = nav.createCandidateAction(second, 0);
              checkConfirm(a, expectedItem(second.result.items[0]));
              const oldDocument = document;
              await nav.reloadDocument();
              document = nav.state.document.data;
              assert.notEqual(document, oldDocument);
              local(() => nav.confirmCandidate(a, sel), "stale_action");
              await assert.rejects(
                nav.locate(oldDocument, offset),
                (e) => e.code === "stale_document",
              );
              await nav.locate(document, offset);
              await completeHead(nav);
              first = nav.state.candidates.state.pages[0];
              checkConfirm(
                nav.createCandidateAction(first, 0),
                expectedItem(first.result.items[0]),
              );
              nav.dispose();
              assert.equal(sel.disposed, false);
              assert.ok(await client.info());
              await Promise.allSettled(refreshes);
              return details;
            },
            [
              ["nav", () => nav?.dispose()],
              ["selection", () => sel?.dispose()],
              ["client", () => client?.dispose()],
              ["wire", () => wire?.close()],
              [
                "exit",
                async () => {
                  if (wire)
                    assert.deepEqual(await bounded(wire.exited, "Core exit"), {
                      code: 0,
                      signal: null,
                    });
                },
              ],
              [
                "owned generated fixture",
                async () => {
                  assert.ok(
                    path.basename(temp).startsWith("hier-b31-confirm-core-"),
                  );
                  await fs.rm(temp, { recursive: true, force: true });
                },
              ],
            ],
            details.cleanup,
          );
        },
      });
