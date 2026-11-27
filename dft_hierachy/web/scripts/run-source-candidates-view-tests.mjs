// Execute the existing B freeze unchanged against the built public packages.
import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  statSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// The frozen type consumer compares virtual paths by identity. Normalize the
// directory URL's trailing slash before supplying the public product root.
const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const base = "web/tests/independent-source-candidates-view/";
const groups = [
  "",
  "pagination/",
  "actions/",
  "multipage/",
  "pointer-rebind/",
  "deferred-bindings/",
  "focus-scroll/",
  "sync-feedback/",
  "feedback-lifecycle/",
  "uncommitted-render/",
  "pointer-session/",
];
const facilities = [
  "facility.test.mjs",
  "pagination/facility.test.mjs",
  "actions/facility.test.mjs",
  "multipage/facility.test.mjs",
  "pointer-rebind/contract-facility.test.mjs",
  "pointer-rebind/facility.test.mjs",
  "deferred-bindings/facility.test.mjs",
  "focus-scroll/facility.test.mjs",
  "sync-feedback/facility.test.mjs",
  "feedback-lifecycle/facility.test.mjs",
  "uncommitted-render/facility.test.mjs",
  "pointer-session/cleanup-control.test.mjs",
  "pointer-session/facility.test.mjs",
  "packaged/facility.test.mjs",
  "context-ownership/async-close.test.mjs",
  "context-ownership/normal-command.test.mjs",
  "context-ownership/partial-construction.test.mjs",
  "context-ownership/reentrant-close.test.mjs",
  "sync-feedback/revision-c98/channels.test.mjs",
].map((file) => base + file);
const modes = {
  model: [
    [base + "verify-types.mjs"],
    ...groups.map((group) => [base + group + "run.mjs"]),
    [base + "pointer-session/run.mjs", "--c100"],
  ],
  package: [[base + "packaged/run.mjs"]],
  controls: [
    ["--test", ...facilities],
    ...groups.map((group) => [base + group + "run.mjs", "--controls"]),
  ],
};
const mode = process.argv[2];
if (process.argv.length !== 3 || !Object.hasOwn(modes, mode))
  throw new Error(
    "Expected exactly one SourceCandidatesView mode: model/package/controls",
  );
const env = {
  ...process.env,
  HIER_B_PRODUCT_ROOT: root,
  HIER_B_BROWSER_TOOLS: resolve(root, "web"),
};
if (mode === "package") {
  const requested =
    process.env.HIER_B_NPM_BIN ?? process.env.npm_execpath ?? "npm";
  const candidates =
    isAbsolute(requested) || requested.includes("/")
      ? [resolve(requested)]
      : (process.env.PATH ?? "")
          .split(delimiter)
          .map((dir) => resolve(dir, requested));
  env.HIER_B_NPM_BIN = candidates.find((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (!env.HIER_B_NPM_BIN)
    throw new Error(
      "Cannot resolve executable npm for SourceCandidatesView package checks",
    );
}
for (const args of modes[mode])
  for (const file of args[0] === "--test" ? args.slice(1) : [args[0]]) {
    accessSync(resolve(root, file), constants.R_OK);
    if (!statSync(resolve(root, file)).isFile())
      throw new Error(`Required input is not a file: ${file}`);
  }
function execute(args, cwd = root) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal)
    throw new Error(
      `SourceCandidatesView ${mode} terminated by ${result.signal}`,
    );
  return result.status ?? 1;
}

// This existing CLI test verifies B36's archived inputs, not current product
// semantics. Later accepted B entry repairs changed two of its pinned files.
// Replay its exact archived input bytes in an owned directory, leaving both
// the current frozen test and the historical oracle/negative controls intact.
function historicalEvidenceCli() {
  const archivePath = "docs/m5_b_multipage_action_identity.json";
  const archiveBytes = readFileSync(resolve(root, archivePath));
  const archive = JSON.parse(archiveBytes);
  const directory = mkdtempSync(resolve(tmpdir(), "hier-candidate-history-"));
  function write(relative, bytes) {
    const target = resolve(directory, relative);
    assert(
      target.startsWith(directory + sep),
      "archive input must remain in its owned directory",
    );
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes, { flag: "wx" });
  }
  try {
    const materials = new Map(
      archive.materials.map((item) => [item.name, item]),
    );
    for (const input of archive.inputs) {
      const material = materials.get("input:" + input.path);
      assert(material, `Missing historical input: ${input.path}`);
      const bytes = gunzipSync(Buffer.from(material.gzipBase64, "base64"));
      assert.equal(bytes.length, input.bytes);
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        input.sha256,
      );
      write(input.path, bytes);
    }
    write(archivePath, archiveBytes);
    const test = base + "multipage/evidence-cli.test.mjs";
    for (const file of [test, base + "multipage/verify-evidence.mjs"])
      write(file, readFileSync(resolve(root, file)));
    console.log(
      JSON.stringify({
        kind: "SourceCandidatesView historical B36 CLI input replay",
        currentProductExecuted: 0,
        archiveSha256: createHash("sha256").update(archiveBytes).digest("hex"),
        inputs: archive.inputs,
        unchangedCli: test,
      }),
    );
    return execute(["--test", resolve(directory, test)], directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (mode === "controls") {
  const status = historicalEvidenceCli();
  if (status !== 0) process.exit(status);
}
for (const args of modes[mode]) {
  const status = execute(args);
  if (status !== 0) process.exit(status);
}
