// No Node/Electron product imports may be hidden by running renderer tests in Node.
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { publicEntry } from "./public-entry.mjs";
const report = {
  kind: "renderer-browser-bundle-and-no-Node-realm-NOT-Electron",
  executed: 0,
  stage: "public-export-capability",
};
try {
  assert.ok(process.env.HIER_B_PRODUCT_ROOT);
  const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT),
    entry = fileURLToPath(
      publicEntry(product, "@hier/client/electron/renderer"),
    );
  const require = createRequire(path.join(product, "web/package.json")),
    { build } = require("esbuild");
  report.stage = "browser-bundle";
  const output = await build({
    stdin: {
      contents: 'export {connectElectronTransport} from "B-renderer";',
      resolveDir: product,
    },
    alias: { "B-renderer": entry },
    bundle: true,
    write: false,
    platform: "browser",
    target: "es2022",
    format: "iife",
    globalName: "BRenderer",
    metafile: true,
    logLevel: "silent",
  });
  assert.deepEqual(output.warnings, []);
  const realm = vm.createContext({
    queueMicrotask,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    URL,
    setTimeout,
    clearTimeout,
  });
  assert.equal(
    vm.runInContext(
      "typeof process+','+typeof Buffer+','+typeof require+','+typeof module",
      realm,
    ),
    "undefined,undefined,undefined,undefined",
  );
  vm.runInContext(
    Buffer.from(output.outputFiles[0].contents).toString("utf8"),
    realm,
    { timeout: 10000 },
  );
  assert.equal(typeof realm.BRenderer.connectElectronTransport, "function");
  report.executed = 1;
  report.bundleBytes = output.outputFiles[0].contents.length;
  report.modules = Object.keys(output.metafile.inputs);
  report.exitCode = 0;
} catch (error) {
  report.exitCode = 1;
  report.error = String(error?.message ?? error);
}
process.exitCode = report.exitCode;
console.log(JSON.stringify(report, null, 2));
