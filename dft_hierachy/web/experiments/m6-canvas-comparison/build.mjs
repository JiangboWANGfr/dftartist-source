import { build } from "esbuild";
import { copyFile, readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
await mkdir("dist", { recursive: true });
const result = await build({
  entryPoints: ["react.jsx", "sprotty.mjs"],
  bundle: true,
  outdir: "dist",
  format: "esm",
  sourcemap: true,
  metafile: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const html = await readFile("index.html", "utf8");
for (const name of ["react", "sprotty"])
  await writeFile(`dist/${name}.html`, html.replace("ENTRY", name));
await copyFile("style.css", "dist/style.css");
await copyFile("../../packages/viewmodel/dist/elk-worker.min.js", "dist/worker.js");
await copyFile("../../packages/viewmodel/dist/ELK-LICENSE.md", "dist/ELK-LICENSE.md");
await writeFile("dist/stall-worker.js", "self.onmessage = () => {};\n");
await writeFile(
  "dist/crash-worker.js",
  "throw new Error('deliberate experiment Worker failure');\n",
);
const manifests = {};
for (const name of [
  "sprotty",
  "sprotty-protocol",
  "inversify",
  "reflect-metadata",
  "snabbdom",
  "react",
  "react-dom",
  "esbuild",
  "playwright",
]) {
  const p = JSON.parse(await readFile(`node_modules/${name}/package.json`, "utf8"));
  manifests[name] = { version: p.version, license: p.license, gitHead: p.gitHead };
}
const hashes = {};
for (const file of [
  "fixture.mjs",
  "package-lock.json",
  "dist/react.js",
  "dist/sprotty.js",
  "dist/worker.js",
  "dist/ELK-LICENSE.md",
]) {
  const data = await readFile(file);
  hashes[file] = { bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") };
}
await writeFile(
  "dist/build.json",
  JSON.stringify({ manifests, hashes, metafile: result.metafile }, null, 2) + "\n",
);
console.log(JSON.stringify({ warnings: result.warnings, manifests, hashes }, null, 2));
