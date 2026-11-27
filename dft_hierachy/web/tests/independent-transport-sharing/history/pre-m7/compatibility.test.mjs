// B: reviewed additive identity epoch, C-ORCH-6 contract decision 2026-10-16.
// Pre-identity source is preserved byte-for-byte in history/pre-identity/.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { publicEntry } from "../independent-electron-renderer/public-entry.mjs";
import { assertPublicExports } from "./identity-epoch.mjs";
const product = path.resolve(
  process.env.HIER_B_PRODUCT_ROOT ?? path.join(import.meta.dirname, "../../.."),
);
const client = path.join(product, "web/packages/client/dist");
const require = createRequire(path.join(product, "web/package.json"));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const guard = { timeout: 20000 }; // Hang watchdog, not a performance SLA.
let bundle;
async function realm() {
  bundle ??= (async () => {
    const { build } = require("esbuild"),
      source = await fs.readFile(
        new URL("./realm-controls.mjs", import.meta.url),
        "utf8",
      );
    const result = await build({
      stdin: {
        contents: source,
        resolveDir: import.meta.dirname,
        sourcefile: "B-realm-controls.mjs",
      },
      bundle: true,
      write: false,
      platform: "browser",
      target: "es2022",
      format: "iife",
      globalName: "BTransportRealm",
      alias: {
        "@hier/client": path.join(client, "index.js"),
        "B-original-inbox": path.join(client, "node/frame-inbox.js"),
      },
      metafile: true,
      logLevel: "silent",
    });
    assert.deepEqual(result.warnings, []);
    const bytes = result.outputFiles[0].contents;
    console.log(
      JSON.stringify({
        bundleBytes: bytes.length,
        bundleSha: sha(bytes),
        modules: Object.keys(result.metafile.inputs).length,
        kind: "isolated JS realm, not real browser or Electron",
      }),
    );
    return Buffer.from(bytes).toString("utf8");
  })();
  const context = vm.createContext({
    queueMicrotask,
    TextEncoder,
    AbortController,
    AbortSignal,
  });
  assert.equal(
    vm.runInContext("typeof globalThis.require", context),
    "undefined",
  );
  vm.runInContext(await bundle, context, { timeout: 10000 });
  return context.BTransportRealm;
}
const clean = (value) => JSON.parse(JSON.stringify(value));
test(
  "B sharing S01 reviewed identity epoch adds only isHierError to old public exports",
  guard,
  async () => {
    const main = await import(publicEntry(product, "@hier/client")),
      node = await import(publicEntry(product, "@hier/client/node"));
    assertPublicExports(main, node);
  },
);
test(
  "B sharing S02 old and identity type consumers pass while node declaration bytes stay fixed",
  guard,
  async () => {
    // Public semantic consumers replace ONLY the main pure-refactor byte pin.
    // No new product artifact hash is adopted as a compatibility oracle.
    const consumer = JSON.parse(
      execFileSync(
        process.execPath,
        [
          fileURLToPath(
            new URL(
              "../independent-client-identity/verify-types.mjs",
              import.meta.url,
            ),
          ),
        ],
        {
          cwd: product,
          env: { ...process.env, HIER_B_PRODUCT_ROOT: product },
          encoding: "utf8",
        },
      ),
    );
    assert.equal(consumer.exitCode, 0);
    assert.deepEqual(consumer.positive, []);
    assert.equal(consumer.executedNegative, 7);
    for (const [file, bytes, digest] of [
      [
        "node/index.d.ts",
        587,
        "810c9425e1cfdfb11fd31174d3f7feb647238aba61ec534318bd1746b8a163ae",
      ],
    ]) {
      const b = await fs.readFile(path.join(client, file));
      assert.equal(b.length, bytes);
      assert.equal(sha(b), digest);
    }
  },
);
test(
  "B sharing S03 old private inbox bundle executes without Node globals",
  guard,
  async () => {
    const r = await realm();
    assert.deepEqual(clean(r.globals()), {
      Buffer: "undefined",
      process: "undefined",
      require: "undefined",
      module: "undefined",
      nativePromises: "function",
      microtasks: "function",
    });
  },
);
test(
  "B sharing S04 old inbox binding is async FIFO with one receiver",
  guard,
  async () => {
    const r = await realm();
    assert.deepEqual(clean(await r.fifo()), {
      synchronous: 0,
      inStack: 0,
      seen: [0, 1, 2, 3],
      duplicate: { code: "bad_request", origin: "client", isHierError: true },
    });
  },
);
test(
  "B sharing S05 close before queued first delivery discards content",
  guard,
  async () => {
    const r = await realm();
    assert.deepEqual(clean(await r.closeBeforeDelivery()), {
      seen: 0,
      overflows: 0,
      latePush: false,
    });
  },
);
test(
  "B sharing S06 unsubscribe cancels queue but not unique ownership",
  guard,
  async () => {
    const r = await realm();
    assert.deepEqual(clean(await r.offBeforeDelivery()), {
      seen: 0,
      duplicate: "bad_request",
      bound: true,
    });
  },
);
for (const extra of [0, 1])
  test("B sharing S07 realm frame cap 256+" + extra, guard, async () => {
    const r = await realm(),
      got = clean(await r.frameCap(extra));
    assert.deepEqual(
      got.accepted,
      Array.from({ length: 256 + extra }, (_, i) => i < 256),
    );
    assert.deepEqual(
      got.seen,
      extra ? [] : Array.from({ length: 256 }, (_, i) => i),
    );
    assert.equal(got.overflows, extra);
  });
test(
  "B sharing S08 real first delivery releases prebind byte cap",
  guard,
  async () => {
    const r = await realm();
    assert.deepEqual(clean(await r.afterActualDelivery()), {
      accepted: true,
      delivered: 2,
      bytes: 4 * 1024 * 1024 + 1,
      overflows: 0,
    });
  },
);
test(
  "B sharing S09 buffered hello to real browser-bundled SDK, roots and dispose",
  guard,
  async () => {
    const r = await realm();
    assert.deepEqual(clean(await r.sdkRoundTrip()), {
      snapshotId: "B-shared-realm",
      rootCount: 0,
      complete: "complete",
      methods: ["inst.roots"],
      closed: true,
      remainingCloseSubscriptions: 0,
      disposed: { code: "disposed", origin: "client" },
    });
  },
);
