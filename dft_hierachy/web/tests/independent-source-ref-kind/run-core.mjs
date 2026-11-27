import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { publicEntry } from "../independent-electron-renderer/public-entry.mjs";
import { fixture, point, cases } from "./core-fixture.mjs";
const P = process.env.HIER_B_PRODUCT_ROOT,
  bin = process.env.HIER_BIN;
assert.ok(P && bin && path.isAbsolute(P) && path.isAbsolute(bin));
assert.ok(bin.startsWith(P + "/core/"), "explicit owned fixed-product binary");
const { HierClient } = await import(publicEntry(P, "@hier/client")),
  { createProcessTransport } = await import(
    publicEntry(P, "@hier/client/node")
  );
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  bytes = await fs.readFile(bin);
const report = {
  kind: "B SourceRefKind actual SDK Node Core chain NOT UI",
  product: P,
  binary: {
    path: bin,
    bytes: bytes.length,
    sha256: sha(bytes),
    provenance:
      process.env.HIER_B_CORE_PROVENANCE ??
      "caller must document fresh build or reused pinned baseline",
  },
  planned: cases.length,
  executed: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  blocked: 0,
  results: [],
  cleanupErrors: [],
  exitCode: 1,
};
async function bound(p, label) {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("B Core facility watchdog, not SLA: " + label)),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const value = (r) => {
  assert.deepEqual(r.completeness, { status: "complete", reasons: [] });
  return r.result;
};
for (const row of cases) {
  const result = { ...row, pass: false, pages: [] },
    temp = await fs.mkdtemp(path.join(os.tmpdir(), "hier-b-ref-kind-core-"));
  let wire, client;
  try {
    await bound(
      (async () => {
        const f = fixture(row.input.macro);
        await fs.writeFile(temp + "/b_rk_leaf.svh", f.leaf);
        await fs.writeFile(temp + "/b_rk_top.sv", f.top);
        wire = createProcessTransport({
          command: bin,
          args: [
            "serve",
            ...(row.input.perInstance ? ["--per-instance-bodies"] : []),
            temp + "/b_rk_top.sv",
          ],
        });
        wire.exited.catch(() => {});
        client = new HierClient(wire, { cacheEntries: 0 });
        client.ready.catch(() => {});
        const snap = await bound(client.ready, "ready");
        assert.equal(snap.schemaVersion, 7);
        assert.equal(snap.protocol, 2);
        const roots = value(await client.roots());
        assert.equal(roots.length, 1);
        assert.equal(roots[0].name, "b_rk_top");
        const children = value(
          await client.children(roots[0].ref, { limit: 200 }),
        ).items;
        assert.deepEqual(
          children.map((x) => x.name),
          ["west", "east"],
        );
        const registry = new Map(),
          target = [];
        const add = (ref, tag, kind) => {
          const old = registry.get(ref);
          if (old) assert.equal(old.tag, tag);
          registry.set(ref, { tag, kind });
        };
        let cursor;
        do {
          const page = value(
            await client.definitions({
              limit: 200,
              ...(cursor ? { cursor } : {}),
            }),
          );
          for (const d of page.items) {
            add(d.ref, "definition", "definition");
            if (d.name === "b_rk_leaf" && row.input.kind === "definition")
              target.push(d.ref);
          }
          cursor = page.next;
        } while (cursor);
        const instances = [roots[0], ...children];
        for (const inst of instances) {
          add(inst.ref, "object", "instance");
          if (inst !== roots[0] && row.input.kind === "instance")
            target.push(inst.ref);
          const ports = value(await client.ports(inst.ref));
          for (const p of ports) {
            add(p.ref, "object", "port");
            if (
              inst !== roots[0] &&
              p.name === "d" &&
              row.input.kind === "port"
            )
              target.push(p.ref);
          }
          const signals = value(await client.signals(inst.ref, { limit: 200 }));
          assert.equal(signals.next, undefined);
          for (const s of signals.items) {
            add(s.ref, "object", "signal");
            if (
              inst !== roots[0] &&
              s.name === "stage" &&
              row.input.kind === "signal"
            )
              target.push(s.ref);
          }
          const processes = value(await client.procs(inst.ref, { limit: 200 }));
          assert.equal(processes.next, undefined);
          for (const p of processes.items) {
            add(p.ref, "object", "process");
            if (inst !== roots[0] && row.input.kind === "process") {
              const span = value(await client.source(p.ref, "statement")),
                start = point(f.leaf, f.assign);
              if (span.start.offset === start.offset) target.push(p.ref);
            }
          }
          const registers = value(
            await client.registers(inst.ref, { limit: 200 }),
          );
          assert.equal(registers.next, undefined);
          for (const r of registers.items) {
            add(r.ref, "object", "register");
            if (inst !== roots[0] && row.input.kind === "register")
              target.push(r.ref);
          }
        }
        assert.equal(
          target.length,
          row.input.kind === "definition" ? 1 : 2,
          "independent public fixture target handles",
        );
        const declaration = value(
          await client.source(children[0].ref, "definition"),
        );
        const marker =
          row.input.kind === "port"
            ? "input logic d"
            : row.input.kind === "signal"
              ? "wire stage"
              : row.input.kind === "process"
                ? f.assign
                : row.input.kind === "register"
                  ? "q <= stage"
                  : "module b_rk_leaf";
        const at = point(
            f.leaf,
            marker,
            row.input.kind === "port"
              ? "input logic ".length
              : row.input.kind === "signal"
                ? "wire ".length
                : 0,
          ),
          query = { file: declaration.file, line: at.line, col: at.col };
        let reference;
        const tagging = [];
        for (const limit of row.input.limits) {
          const all = [],
            cursors = new Set();
          let cursor;
          do {
            const r = await bound(
              client.resolveSource(query, {
                limit,
                ...(cursor ? { cursor } : {}),
              }),
              "page",
            );
            const p = value(r);
            assert.ok(p.items.length <= limit);
            result.pages.push({
              limit,
              count: p.items.length,
              hasNext: Object.hasOwn(p, "next"),
            });
            for (const h of p.items) {
              assert.equal(h.span.file, declaration.file);
              assert.equal(
                h.span.path,
                await fs.realpath(temp + "/b_rk_leaf.svh"),
              );
              assert.equal(h.span.contentHash, sha(Buffer.from(f.leaf)));
              assert.ok(
                registry.has(h.ref),
                "every returned address independently enumerated, never parsed",
              );
              assert.ok(
                !Object.hasOwn(h, "target") && !Object.hasOwn(h, "def"),
                "no duplicated address aliases",
              );
            }
            all.push(...p.items);
            cursor = p.next;
            if (cursor) {
              assert.ok(!cursors.has(cursor));
              cursors.add(cursor);
            }
          } while (cursor);
          for (const ref of target)
            assert.ok(
              all.some((h) => h.ref === ref),
              "all independently enumerated target occurrences present",
            );
          const projection = all.map(({ refKind, ...old }) => old);
          if (reference)
            assert.deepEqual(
              projection,
              reference,
              "original field projection/ordering/next union invariant across page sizes",
            );
          else reference = projection;
          result.targetCount = target.length;
          result.targetKinds = target.map((ref) => registry.get(ref).kind);
          tagging.push(...all);
        }
        result.legacyProjectionVerified = true;
        for (const h of tagging)
          assert.equal(
            h.refKind,
            registry.get(h.ref).tag,
            "new Core must emit authoritative refKind for every actual hit",
          );
      })(),
      row.id,
    );
    result.pass = true;
  } catch (error) {
    result.error = String(error.stack ?? error);
  } finally {
    const cleanup = async (step, action) => {
      try {
        await action();
      } catch (error) {
        report.cleanupErrors.push({ id: row.id, step, error: String(error) });
        result.pass = false;
      }
    };
    await cleanup("client.dispose", () => client?.dispose());
    await cleanup("wire.close", () => wire?.close());
    await cleanup("Core exit", async () => {
      if (wire)
        assert.deepEqual(await bound(wire.exited, "exit"), {
          code: 0,
          signal: null,
        });
    });
    await cleanup("owned fixture cleanup", async () => {
      assert.ok(path.basename(temp).startsWith("hier-b-ref-kind-core-"));
      await fs.rm(temp, { recursive: true, force: true });
    });
  }
  report.executed++;
  report[result.pass ? "passed" : "failed"]++;
  report.results.push(result);
}
report.exitCode = report.failed || report.cleanupErrors.length ? 1 : 0;
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.exitCode;
