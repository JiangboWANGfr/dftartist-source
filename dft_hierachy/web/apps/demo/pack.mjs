import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL(".", import.meta.url));
const web = await realpath(path.resolve(app, "../.."));
const root = await realpath(path.dirname(web));
const args = process.argv.slice(2);
assert(
  args.length === 2 && args[0] === "--output",
  "Usage: npm --prefix web run pack:demo -- --output /absolute/new-directory",
);
assert(path.isAbsolute(args[1]), "Output must be an absolute path");
const output = path.join(await realpath(path.dirname(args[1])), path.basename(args[1]));
const outside = path.relative(root, output);
assert(
  outside === ".." || outside.startsWith(".." + path.sep) || path.isAbsolute(outside),
  "Output must be outside the repository",
);
// Exclusive creation: never overwrite a prior delivery or remove failed evidence.
await mkdir(output);
const npm = process.env.npm_execpath;
assert(npm, "Run through npm run pack:demo so the selected npm CLI is explicit");
function run(argv, cwd = output) {
  const result = spawnSync(process.execPath, argv, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    throw new Error(`Command failed (${result.status ?? result.signal}): ${argv.join(" ")}`);
  }
  return result.stdout;
}
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const save = (file, data) => writeFile(file, JSON.stringify(data, null, 2) + "\n");
const hash = async (file) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
const lock = await json(path.join(web, "package-lock.json"));
const dependencies = {};
const tarballs = [];
const packageLocks = Object.fromEntries(
  Object.entries(lock.packages).filter(
    ([location, metadata]) => location.startsWith("node_modules/") && !metadata.link,
  ),
);
// Compile in this delivery's exclusive staging directory. Shared dist and incremental
// state can contain outputs from removed sources; neither is a packaging input.
const staging = path.join(output, ".package-build");
await mkdir(staging);
await cp(path.join(web, "tsconfig.base.json"), path.join(staging, "tsconfig.base.json"));
const names = ["protocol-types", "client", "viewmodel", "views"];
for (const name of names) {
  const source = path.join(web, "packages", name);
  await cp(source, path.join(staging, "packages", name), {
    recursive: true,
    filter: (file) =>
      path.dirname(file) !== source ||
      (!["dist", "node_modules"].includes(path.basename(file)) && !file.endsWith(".tsbuildinfo")),
  });
}
// Only compiler dependencies are borrowed. @hier resolves exclusively to this
// snapshot, so package references cannot fall back to the workspace's old outputs.
const modules = path.join(staging, "node_modules");
await mkdir(path.join(modules, "@hier"), { recursive: true });
for (const entry of await readdir(path.join(web, "node_modules"), { withFileTypes: true })) {
  if (entry.name === "@hier") continue;
  await symlink(
    path.join(web, "node_modules", entry.name),
    path.join(modules, entry.name),
    entry.isDirectory() ? "dir" : "file",
  );
}
for (const name of names)
  await symlink(path.join(staging, "packages", name), path.join(modules, "@hier", name), "dir");
process.stdout.write(
  run(
    [
      path.join(web, "node_modules/typescript/bin/tsc"),
      "-b",
      ...names.map((name) => "packages/" + name),
    ],
    staging,
  ),
);
process.stdout.write(
  run(
    [
      path.join(web, "scripts/build-layout-assets.mjs"),
      "--output",
      path.join(staging, "packages/viewmodel/dist"),
    ],
    staging,
  ),
);
await mkdir(path.join(output, "packages"));
for (const name of names) {
  // Incremental metadata belongs to this build, not to the published runtime.
  await rm(path.join(staging, "packages", name, "tsconfig.tsbuildinfo"));
  const packed = JSON.parse(
    run(
      [
        npm,
        "pack",
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        path.join(output, "packages"),
      ],
      path.join(staging, "packages", name),
    ),
  );
  assert.equal(packed.length, 1, "One tarball per package");
  const item = packed[0];
  assert.equal(item.name, "@hier/" + name);
  assert.equal(path.basename(item.filename), item.filename, "Local tarball filename");
  dependencies[item.name] = "file:packages/" + item.filename;
  const manifest = await json(path.join(staging, "packages", name, "package.json"));
  packageLocks["node_modules/" + item.name] = {
    version: item.version,
    resolved: dependencies[item.name],
    integrity: item.integrity,
    dependencies: manifest.dependencies,
    peerDependencies: manifest.peerDependencies,
    peerDependenciesMeta: manifest.peerDependenciesMeta,
  };
  tarballs.push({
    name: item.name,
    version: item.version,
    file: "packages/" + item.filename,
    sha256: await hash(path.join(output, "packages", item.filename)),
  });
}
// Retain staging on a build/pack failure; only our successful snapshot is removed.
await rm(staging, { recursive: true });
for (const name of [
  "react",
  "react-dom",
  "electron",
  "typescript",
  "esbuild",
  "@types/react",
  "@types/react-dom",
  "@types/node",
]) {
  const version = lock.packages["node_modules/" + name]?.version;
  assert(version, "Existing locked dependency: " + name);
  dependencies[name] = version;
}
const consumer = {
  name: "hierarchy-demo-consumer",
  version: "0.1.0",
  private: true,
  type: "module",
  scripts: {
    build: "tsc -b app/tsconfig.json app/tsconfig.renderer.json && node app/build.mjs",
    start: "electron app",
  },
  dependencies,
};
await save(path.join(output, "package.json"), consumer);
// Seed npm with the existing resolutions, replacing workspace links with tarballs.
// npm prunes unused entries; it remains the only dependency resolver.
await save(path.join(output, "package-lock.json"), {
  name: consumer.name,
  version: consumer.version,
  lockfileVersion: 3,
  requires: true,
  packages: {
    "": { name: consumer.name, version: consumer.version, dependencies },
    ...packageLocks,
  },
});
await mkdir(path.join(output, "app"));
for (const file of ["src", "build.mjs", "index.html", "package.json"])
  await cp(path.join(app, file), path.join(output, "app", file), { recursive: true });
await save(path.join(output, "tsconfig.base.json"), {
  ...(await json(path.join(web, "tsconfig.base.json"))),
  compilerOptions: {
    ...(await json(path.join(web, "tsconfig.base.json"))).compilerOptions,
    skipLibCheck: false,
  },
});
for (const file of ["tsconfig.json", "tsconfig.renderer.json"]) {
  const { references: _references, ...config } = await json(path.join(app, file));
  await save(path.join(output, "app", file), { ...config, extends: "../tsconfig.base.json" });
}
await writeFile(
  path.join(output, "README.md"),
  `# Hierarchy demo\n\n` +
    `Built from the four local versioned @hier tarballs. No workspace links are needed.\n\n` +
    `Run on the build machine with Node 24 and this directory as cwd:\n\n` +
    "```sh\nHIER_BIN=/absolute/path/to/hier npm start\n```\n\n" +
    `HIER_BIN must name your compatible Core executable (protocol 2 / schema 7).\n` +
    `Choose an HDL file or file list and an optional top in the native dialog.\n` +
    `Core and design inputs are not copied. This is a development demo directory,\n` +
    `not a signed installer or a cross-platform release. Rebuild with npm run build.\n`,
);
// The existing lock/cache supplies all dependencies; packaging never fetches registry data.
process.stdout.write(
  run([npm, "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"]),
);
const consumerLock = await json(path.join(output, "package-lock.json"));
for (const [location, metadata] of Object.entries(consumerLock.packages)) {
  if (!location || location.startsWith("node_modules/@hier/")) continue;
  assert.equal(
    metadata.version,
    lock.packages[location]?.version,
    "Dependency must retain its repository lock version: " + location,
  );
}
// Electron's official installer uses its existing local runtime cache when available.
process.stdout.write(run(["node_modules/electron/install.js"]));
process.stdout.write(run([npm, "run", "build"]));
const installed = {};
for (const { name } of tarballs) {
  const location = await realpath(path.join(output, "node_modules", name));
  assert(location.startsWith(output + path.sep), "No workspace link for " + name);
  installed[name] = path.relative(output, location);
}
await writeFile(path.join(output, "dependencies.json"), run([npm, "ls", "--all", "--json"]));
await save(path.join(output, "delivery.json"), {
  platform: process.platform,
  arch: process.arch,
  node: process.versions.node,
  core: "External HIER_BIN, protocol=2/schema=7",
  tarballs,
  installed,
  dependencies,
  artifacts: Object.fromEntries(
    await Promise.all(
      [
        "main.mjs",
        "preload.cjs",
        "renderer.js",
        "renderer.css",
        "index.html",
        "elk-worker.min.js",
        "ELK-LICENSE.md",
      ].map(async (name) => [name, await hash(path.join(output, "app/dist", name))]),
    ),
  ),
});
console.log("Standalone demo ready:", output);
