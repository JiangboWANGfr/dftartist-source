import { createRequire } from "node:module";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Ship the pinned upstream classic Worker verbatim. Hosts publish it at an explicit URL.
const require = createRequire(import.meta.url);
const upstream = path.dirname(require.resolve("elkjs/package.json"));
const manifest = JSON.parse(await readFile(path.join(upstream, "package.json"), "utf8"));
if (manifest.version !== "0.12.0") throw new Error("Layout assets require elkjs 0.12.0");
const args = process.argv.slice(2);
if (args.length !== 0 && !(args.length === 2 && args[0] === "--output" && path.isAbsolute(args[1])))
  throw new Error("Usage: build-layout-assets.mjs [--output /absolute/dist]");
const destination =
  args[1] ?? fileURLToPath(new URL("../packages/viewmodel/dist/", import.meta.url));
await mkdir(destination, { recursive: true });
await copyFile(
  path.join(upstream, "lib/elk-worker.min.js"),
  path.join(destination, "elk-worker.min.js"),
);
await copyFile(path.join(upstream, "LICENSE.md"), path.join(destination, "ELK-LICENSE.md"));
