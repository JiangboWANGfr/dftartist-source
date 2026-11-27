// One opt-in regression for real C-104. Production and shared outputs are read-only.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const source = process.env.HIER_B_PACK_PRODUCT,
  parent = process.env.HIER_B_PACK_TEMP_PARENT,
  npm = process.env.HIER_B_NPM_CLI;
const r = {
  id: "B77-C104-current-source-only",
  input: "four private package roots with current public-source markers and orphan/obsolete dist",
  expected:
    "tarballs contain current public JS/types, exclude orphan output/cache, and preserve all seeded source/output bytes/mtime",
  basis: "real C-104; M5-A-04 and public pack README",
  planned: 1,
  passed: 0,
  failed: 1,
  skipped: 0,
  commands: [],
  packages: [],
  failures: [],
};
const hash = (b) => createHash("sha256").update(b).digest("hex");
const info = (file) => {
  const b = fs.readFileSync(file),
    s = fs.statSync(file, { bigint: true });
  return { file, bytes: b.length, sha256: hash(b), mtimeNs: String(s.mtimeNs) };
};
function run(command, args, cwd) {
  const x = spawnSync(command, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120000,
  });
  r.commands.push({
    command: [command, ...args],
    cwd,
    status: x.status,
    signal: x.signal,
    error: x.error ? String(x.error) : null,
    stdout: x.stdout,
    stderr: x.stderr,
  });
  assert.equal(
    x.status,
    0,
    "fixture prerequisite command must succeed; otherwise not a C-104 semantic reproduction",
  );
  return x.stdout;
}
try {
  assert(
    source && parent && npm && [source, parent, npm].every(path.isAbsolute),
    "explicit fixed product, private fixture parent and npm CLI",
  );
  const fixture = fs.mkdtempSync(path.join(parent, "B77 source 中文 "));
  r.fixture = fixture;
  r.output = fixture + "-delivery";
  const archive = fixture + ".tar";
  run("git", ["archive", "--output", archive, "HEAD"], source);
  const archiveHash = createHash("sha256"),
    archiveFd = fs.openSync(archive, "r"),
    buffer = Buffer.alloc(1024 * 1024);
  try {
    let bytes;
    while ((bytes = fs.readSync(archiveFd, buffer, 0, buffer.length, null))) {
      archiveHash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(archiveFd);
  }
  r.source = {
    root: source,
    head: run("git", ["rev-parse", "HEAD"], source).trim(),
    archive,
    archiveBytes: fs.statSync(archive).size,
    archiveSha256: archiveHash.digest("hex"),
  };
  run("tar", ["-xf", archive, "-C", fixture], parent);
  const names = ["protocol-types", "client", "viewmodel", "views"],
    seeded = [];
  for (const [i, n] of names.entries()) {
    const root = fixture + "/web/packages/" + n,
      index = root + "/src/index.ts";
    assert(fs.existsSync(index), "known public source entry");
    const marker = "B77_CURRENT_PUBLIC_SOURCE_" + i;
    fs.appendFileSync(
      index,
      "\nexport const b77CurrentSource_" + i + " = " + JSON.stringify(marker) + " as const;\n",
    );
    fs.mkdirSync(root + "/dist", { recursive: true });
    for (const f of ["b77_removed.js", "b77_removed.d.ts", "index.js", "index.d.ts"]) {
      const file = root + "/dist/" + f;
      fs.writeFileSync(
        file,
        "export const b77Obsolete = " + JSON.stringify("B77_OLD_OUTPUT_" + i) + ";\n",
      );
      seeded.push(info(file));
    }
    seeded.push(info(index));
  }
  r.inputs = seeded;
  run(
    process.execPath,
    [npm, "ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"],
    fixture + "/web",
  );
  run(process.execPath, [npm, "run", "pack:demo", "--", "--output", r.output], fixture + "/web");
  r.packSucceeded = true;
  const delivery = JSON.parse(fs.readFileSync(r.output + "/delivery.json"));
  assert.equal(delivery.tarballs.length, 4);
  for (const [i, n] of names.entries()) {
    const item = delivery.tarballs.find((x) => x.name === "@hier/" + n);
    assert(item, "one actual public package");
    const tgz = path.join(r.output, item.file);
    const entries = run("tar", ["-tzf", tgz], parent).trim().split("\n");
    const manifest = JSON.parse(run("tar", ["-xOf", tgz, "package/package.json"], parent));
    const artifacts = {};
    for (const field of ["main", "types"]) {
      const file = "package/" + manifest[field].replace(/^\.\//, "");
      const text = run("tar", ["-xOf", tgz, file], parent);
      artifacts[field] = {
        file,
        sha256: hash(text),
        current: text.includes("B77_CURRENT_PUBLIC_SOURCE_" + i),
      };
      if (!artifacts[field].current) r.failures.push(n + ": missing current public " + field);
    }
    const obsolete = entries.filter((f) => /\/b77_removed\.(js|d\.ts)$/.test(f));
    const caches = entries.filter((f) => f.endsWith(".tsbuildinfo"));
    if (obsolete.length) r.failures.push(n + ": orphan output included");
    if (caches.length) r.failures.push(n + ": incremental cache included");
    r.packages.push({
      name: item.name,
      sha256: hash(fs.readFileSync(tgz)),
      entries,
      artifacts,
      obsolete,
      caches,
    });
  }
  r.changedInputs = seeded.filter(
    (before) => JSON.stringify(info(before.file)) !== JSON.stringify(before),
  );
  if (r.changedInputs.length) r.failures.push("seeded input source/output bytes or mtime changed");
  if (!r.failures.length) {
    r.passed = 1;
    r.failed = 0;
  }
} catch (e) {
  r.setupError = String(e?.stack ?? e);
}
console.log(JSON.stringify(r, null, 2));
process.exitCode = r.failed ? 1 : 0;
