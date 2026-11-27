import { build } from "esbuild";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const dir = fileURLToPath(new URL(".", import.meta.url));
await mkdir(dir + "dist", { recursive: true });
const common = {
  absWorkingDir: dir,
  bundle: true,
  logLevel: "warning",
  sourcemap: true,
  metafile: true,
};
const main = await build({
  ...common,
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.mjs",
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["electron"],
});
const preload = await build({
  ...common,
  entryPoints: ["src/preload.ts"],
  outfile: "dist/preload.cjs",
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron"],
});
const renderer = await build({
  ...common,
  entryPoints: ["src/renderer.tsx"],
  outfile: "dist/renderer.js",
  platform: "browser",
  jsx: "automatic",
  format: "iife",
  target: "chrome148",
  define: { "process.env.NODE_ENV": '"production"' },
});
for (const [name, result] of Object.entries({ main, preload, renderer })) {
  assert.equal(result.warnings.length, 0, name + " build warnings");
  if (name !== "main")
    for (const output of Object.values(result.metafile.outputs))
      for (const dependency of output.imports)
        assert(
          name === "preload" && dependency.path === "electron",
          "Unexpected external " + dependency.path,
        );
  await writeFile(
    dir + "dist/" + name + ".meta.json",
    JSON.stringify(result.metafile, null, 2) + "\n",
  );
}
const inputs = Object.keys(renderer.metafile.inputs);
assert(
  !inputs.some((path) =>
    /node_modules\/electron\/|\/client\/dist\/node\/|\/electron\/(?:main|preload)\.js$/.test(path),
  ),
  "Renderer Node/Electron dependency",
);
assert.equal(
  inputs.filter((path) => /node_modules\/react\/index\.js$/.test(path)).length,
  1,
  "One React instance",
);
await copyFile(dir + "index.html", dir + "dist/index.html");
// Resolve published package assets, including in a consumer with no workspace links.
for (const name of ["elk-worker.min.js", "ELK-LICENSE.md"])
  await copyFile(
    fileURLToPath(import.meta.resolve("@hier/viewmodel/dist/" + name)),
    dir + "dist/" + name,
  );
console.log(
  "Demo main/preload/renderer built; isolated renderer, one React instance, zero warnings.",
);
