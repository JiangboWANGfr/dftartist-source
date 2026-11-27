import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { publicEntry } from "../independent-electron-renderer/public-entry.mjs";
import { sdk, vm, product, deep } from "./harness.mjs";
import {
  leafText,
  topText,
  leafDeclaration,
  topDeclaration,
  instantiations,
  expectedRange,
} from "./source-fixture.mjs";
const complete = (reply) => {
  assert.deepEqual(reply.completeness, { status: "complete", reasons: [] });
  return reply.result;
};
const hash = (text) => createHash("sha256").update(text).digest("hex");
const activeCore = new Set();
export async function releaseCore() {
  const errors = [];
  for (const c of [...activeCore])
    try {
      await c.close();
    } catch (e) {
      errors.push(e);
    }
  if (errors.length) throw new AggregateError(errors, "B Core fixture cleanup");
}
async function session(directory) {
  assert.ok(
    process.env.HIER_BIN,
    "explicit B-owned fixed-product Core required AFTER Source capability succeeds",
  );
  const { createProcessTransport } = await import(
    publicEntry(product, "@hier/client/node")
  );
  const wire = createProcessTransport({
    command: process.env.HIER_BIN,
    args: ["serve", path.join(directory, "b_sd_top.sv")],
  });
  wire.exited.catch(() => {});
  const client = new sdk.HierClient(wire, { cacheEntries: 0 });
  client.ready.catch(() => {});
  const c = { wire, client, models: [], calls: [] };
  for (const method of ["source", "readSource"]) {
    const original = client[method];
    client[method] = function (...args) {
      const item = { method, args };
      c.calls.push(item);
      const p = Reflect.apply(original, this, args);
      p.then(
        (reply) => {
          item.reply = reply;
        },
        (error) => {
          item.error = error;
        },
      );
      return p;
    };
  }
  let closing;
  c.close = () =>
    (closing ??= (async () => {
      const errors = [];
      for (const m of c.models)
        try {
          m.dispose();
        } catch (e) {
          errors.push(e);
        }
      try {
        client.dispose();
      } catch (e) {
        errors.push(e);
      }
      try {
        wire.close();
      } catch (e) {
        errors.push(e);
      }
      try {
        assert.deepEqual(await wire.exited, { code: 0, signal: null });
      } catch (e) {
        errors.push(e);
      } finally {
        activeCore.delete(c);
      }
      if (errors.length)
        throw new AggregateError(errors, "B real session cleanup");
    })());
  activeCore.add(c);
  try {
    c.snapshot = await client.ready;
    c.root = complete(await client.roots()).find((x) => x.name === "b_sd_top");
    assert.ok(c.root);
    c.children = complete(
      await client.children(c.root.ref, { limit: 64 }),
    ).items;
    assert.deepEqual(c.children.map((x) => x.name).sort(), ["left", "right"]);
    c.newModel = () => {
      const m = new vm.SourceDocumentModel(client);
      c.models.push(m);
      return m;
    };
    c.m = c.newModel();
    return c;
  } catch (e) {
    await c.close();
    throw e;
  }
}
async function real(fn) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hier-b-source-fixture-"),
  );
  let c;
  try {
    await fs.writeFile(path.join(directory, "b_sd_leaf.svh"), leafText, "utf8");
    await fs.writeFile(path.join(directory, "b_sd_top.sv"), topText, "utf8");
    c = await session(directory);
    return await fn(c, directory);
  } finally {
    try {
      if (c) await c.close();
    } finally {
      assert.equal(
        path.basename(directory).startsWith("hier-b-source-fixture-"),
        true,
      );
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
}
function exact(c, text, literal, basename) {
  const s = c.m.state;
  assert.equal(s.status, "success");
  deep(s);
  const d = s.data;
  assert.equal(d.source, c.calls.findLast((x) => x.method === "source").reply);
  assert.equal(
    d.content,
    c.calls.findLast((x) => x.method === "readSource").reply,
  );
  assert.equal(path.basename(d.source.result.path), basename);
  assert.equal(d.content.result.text, text);
  assert.equal(d.source.result.contentHash, hash(text));
  assert.equal(d.content.result.contentHash, hash(text));
  assert.equal(d.content.result.matchesSnapshot, true);
  const expected = expectedRange(text, literal);
  assert.deepEqual(d.location, { status: "exact", range: expected });
  const source = d.source.result;
  assert.equal(
    source.start.offset,
    Buffer.byteLength(text.slice(0, expected.start.offset)),
  );
  assert.equal(
    source.end.offset,
    Buffer.byteLength(text.slice(0, expected.end.offset)),
  );
  assert.equal(
    text.slice(d.location.range.start.offset, d.location.range.end.offset),
    literal,
  );
  assert.equal(
    c.calls.findLast((x) => x.method === "readSource").args[0],
    source.file,
  );
  return d;
}
export const coreCases = [];
function add(id, input, expected, run) {
  coreCases.push({
    id,
    group: "real-SDK-Node-Core-model",
    input,
    expected,
    basis: "§6.10/§5.5.6/independent B source-fixture.mjs",
    run,
  });
}
for (const target of ["left", "right", "definition"])
  add(
    `SD-C-definition-${target}`,
    { target, kind: "definition", file: "include with BOM/UTF-8/CRLF" },
    "exact full included module; byte-span and UTF16 range/text/hash identity",
    () =>
      real(async (c) => {
        const child = c.children.find(
          (x) => x.name === (target === "definition" ? "left" : target),
        );
        await c.m.load(
          target === "definition" ? child.def : child.ref,
          "definition",
        );
        exact(c, leafText, leafDeclaration, "b_sd_leaf.svh");
      }),
  );
add(
  "SD-C-top-definition",
  "top instance definition",
  "exact top module in main file; include not mistaken for declaration",
  () =>
    real(async (c) => {
      await c.m.load(c.root.ref, "definition");
      exact(c, topText, topDeclaration, "b_sd_top.sv");
    }),
);
for (const name of ["left", "right"])
  add(
    `SD-C-instantiation-${name}`,
    { name, kind: "instantiation" },
    "declarator only, distinct physical positions for two occurrences of same definition",
    () =>
      real(async (c) => {
        await c.m.load(
          c.children.find((x) => x.name === name).ref,
          "instantiation",
        );
        exact(c, topText, instantiations[name], "b_sd_top.sv");
      }),
  );
add(
  "SD-C-statement",
  "assign process in included leaf",
  "statement range includes assign and semicolon; inherited CRLF/UTF8 projection",
  () =>
    real(async (c) => {
      const p = complete(
        await c.client.procs(c.children[0].ref, { limit: 64 }),
      ).items;
      assert.equal(p.length, 1);
      await c.m.load(p[0].ref, "statement");
      exact(c, leafText, "assign q = d;", "b_sd_leaf.svh");
    }),
);
add(
  "SD-C-not-applicable",
  "top instantiation and definition-ref statement",
  "Core not_found remains exact original error; no fallback/readSource",
  () =>
    real(async (c) => {
      for (const [ref, kind] of [
        [c.root.ref, "instantiation"],
        [c.children[0].def, "statement"],
      ]) {
        let error;
        try {
          await c.m.load(ref, kind);
        } catch (e) {
          error = e;
        }
        assert.ok(error instanceof sdk.HierError);
        assert.equal(error.code, "not_found");
        assert.equal(error.origin, "core");
        assert.equal(
          error,
          c.calls.findLast((x) => x.method === "source").error,
        );
        assert.equal(c.m.state.status, "failed");
      }
      assert.equal(c.calls.filter((x) => x.method === "readSource").length, 0);
    }),
);
for (const changed of ["", "// changed 😀\r\n"])
  add(
    `SD-C-edit-restore-${changed.length}`,
    {
      changed,
      sequence: "read→disk edit→load same(success no-op)→reload→restore→reload",
    },
    "no watcher/implicit load; changed current text/hash no range, old snapshot span retained even beyond EOF; restoring exact again",
    () =>
      real(async (c, directory) => {
        await c.m.load(c.children[0].ref, "definition");
        const old = exact(c, leafText, leafDeclaration, "b_sd_leaf.svh"),
          state = c.m.state,
          n = c.calls.length;
        await fs.writeFile(
          path.join(directory, "b_sd_leaf.svh"),
          changed,
          "utf8",
        );
        await c.m.load(c.children[0].ref, "definition");
        assert.equal(c.m.state, state);
        assert.equal(c.calls.length, n);
        await c.m.reload();
        const d = c.m.state.data;
        assert.equal(c.m.state.status, "success");
        assert.deepEqual(d.location, { status: "changed" });
        assert.equal(Object.hasOwn(d.location, "range"), false);
        assert.deepEqual(d.source, old.source);
        assert.equal(d.content.result.text, changed);
        assert.equal(d.content.result.contentHash, hash(changed));
        assert.equal(d.content.result.matchesSnapshot, false);
        assert.equal(old.content.result.text, leafText);
        await fs.writeFile(
          path.join(directory, "b_sd_leaf.svh"),
          leafText,
          "utf8",
        );
        await c.m.reload();
        exact(c, leafText, leafDeclaration, "b_sd_leaf.svh");
      }),
  );
for (const broken of ["deleted", "invalid-utf8"])
  add(
    `SD-C-file-${broken}`,
    broken,
    "readSource original not_found/unsupported, failed no partial data; old span remains available and held old document unchanged",
    () =>
      real(async (c, directory) => {
        await c.m.load(c.children[0].ref, "definition");
        const old = c.m.state.data,
          file = path.join(directory, "b_sd_leaf.svh");
        if (broken === "deleted") await fs.unlink(file);
        else await fs.writeFile(file, Buffer.from([0xc3, 0x28]));
        let error;
        try {
          await c.m.reload();
        } catch (e) {
          error = e;
        }
        assert.ok(error instanceof sdk.HierError);
        assert.equal(
          error,
          c.calls.findLast((x) => x.method === "readSource").error,
        );
        assert.equal(
          error.code,
          broken === "deleted" ? "not_found" : "unsupported",
        );
        assert.equal(c.m.state.status, "failed");
        assert.equal(Object.hasOwn(c.m.state, "data"), false);
        assert.deepEqual(
          await c.client.source(c.children[0].ref, "definition"),
          old.source,
        );
        assert.equal(old.content.result.text, leafText);
      }),
  );
add(
  "SD-C-new-snapshot",
  "edit then independent second real session while old session alive",
  "fixed model snapshot differs, old changed/new exact; no model rebind or spurious bare-ref origin proof",
  () =>
    real(async (c, directory) => {
      await c.m.load(c.children[0].ref, "definition");
      const old = c.m.state.data;
      const changed = leafText + "// B new snapshot\r\n";
      await fs.writeFile(
        path.join(directory, "b_sd_leaf.svh"),
        changed,
        "utf8",
      );
      const other = await session(directory);
      try {
        assert.notEqual(c.m.snapshotId, other.m.snapshotId);
        assert.equal(c.m.snapshotId, c.snapshot.snapshotId);
        await c.m.reload();
        assert.deepEqual(c.m.state.data.location, { status: "changed" });
        assert.deepEqual(c.m.state.data.source, old.source);
        await other.m.load(other.children[0].ref, "definition");
        exact(other, changed, leafDeclaration, "b_sd_leaf.svh");
      } finally {
        await other.close();
      }
    }),
);
add(
  "SD-C-dispose-borrowed-sdk",
  "successful model disposed then same SDK source/read",
  "borrowed SDK/Core remain usable; explicit session cleanup awaits actual process exit",
  () =>
    real(async (c) => {
      await c.m.load(c.children[0].ref, "definition");
      const file = c.m.state.data.source.result.file;
      c.m.dispose();
      assert.equal(complete(await c.client.readSource(file)).text, leafText);
      assert.ok(
        complete(await c.client.source(c.children[0].ref, "definition")).file,
      );
    }),
);
