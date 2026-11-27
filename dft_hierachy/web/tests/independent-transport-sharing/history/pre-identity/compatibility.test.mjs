// B independent invariance tests. Only old public/approved private paths, no A new modules/tests.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
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
  "B sharing S01 public runtime exports stay exactly pre-refactor",
  guard,
  async () => {
    const main = await import(pathToFileURL(path.join(client, "index.js"))),
      node = await import(pathToFileURL(path.join(client, "node/index.js")));
    assert.deepEqual(Object.keys(main).sort(), [
      "CLIENT_PROTOCOL_VERSION",
      "HierClient",
      "HierError",
    ]);
    assert.deepEqual(Object.keys(node).sort(), ["createProcessTransport"]);
  },
);
test(
  "B sharing S02 public declaration artifacts stay pre-refactor bytes",
  guard,
  async () => {
    for (const [file, bytes, digest] of [
      [
        "index.d.ts",
        381,
        "9f8632ae495185f3e97cb047fc1433cc4dda3e0d3fe6a3fe971429cb56f87e29",
      ],
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
