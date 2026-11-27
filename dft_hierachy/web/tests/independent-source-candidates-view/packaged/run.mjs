// Real tarballs + an owned outside consumer. No product aliases or source writes.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { cases, negativeCases } from "./cases.mjs";
if (process.argv.includes("--list")) {
  console.log(
    JSON.stringify(
      {
        planned: cases.length,
        cases,
        negativeTypes: negativeCases.map(({ source, ...c }) => c),
      },
      null,
      2,
    ),
  );
} else {
  const product = process.env.HIER_B_PRODUCT_ROOT,
    tools = process.env.HIER_B_BROWSER_TOOLS,
    npmInput = process.env.HIER_B_NPM_BIN;
  assert(
    product &&
      tools &&
      npmInput &&
      [product, tools, npmInput].every(path.isAbsolute),
    "explicit absolute product/tools/npm",
  );
  const P = fs.realpathSync(product),
    T = fs.realpathSync(tools),
    npm = fs.realpathSync(npmInput),
    parent = process.env.HIER_B_PACKAGE_EVIDENCE_ROOT ?? os.tmpdir();
  assert(path.isAbsolute(parent), "absolute owned output parent");
  const temp = fs.realpathSync(
      fs.mkdtempSync(path.join(parent, "B45 tarballs 空格 中文.")),
    ),
    consumer = path.join(temp, "outside consumer 空格 中文"),
    packs = [],
    commands = [];
  const sha = (b) => createHash("sha256").update(b).digest("hex"),
    block = (b) => ({
      bytes: b.length,
      sha256: sha(b),
      gzipBase64: gzipSync(b).toString("base64"),
    });
  const result = {
    kind: "B45-outside-tarball-freeze-baseline",
    product: P,
    tools: T,
    npm,
    temp,
    fixed: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: P,
      encoding: "utf8",
    }).trim(),
    commands,
    packs,
    setupError: null,
    cleanupErrors: [],
    backgroundTasks: 0,
    retainedEvidence: true,
    exitCode: 1,
  };
  const env = {
    ...process.env,
    NODE_PATH: "",
    npm_config_offline: "true",
    npm_config_ignore_scripts: "true",
    npm_config_cache: temp + "/empty-npm-cache",
    npm_config_userconfig: temp + "/empty-user.npmrc",
    npm_config_globalconfig: temp + "/empty-global.npmrc",
    npm_config_force: "false",
    npm_config_legacy_peer_deps: "false",
  };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_TEST_WORKER_ID;
  fs.writeFileSync(env.npm_config_userconfig, "");
  fs.writeFileSync(env.npm_config_globalconfig, "");
  function command(bin, args, cwd) {
    const start = new Date().toISOString(),
      at = performance.now(),
      r = spawnSync(bin, args, {
        cwd,
        env,
        timeout: 30000,
        killSignal: "SIGKILL",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    const c = {
      command: [bin, ...args],
      cwd,
      start,
      end: new Date().toISOString(),
      seconds: (performance.now() - at) / 1000,
      status: r.status,
      signal: r.signal,
      error: r.error ? String(r.error) : null,
      captureComplete: !r.error,
      env: {
        NODE_PATH: "",
        NODE_TEST_CONTEXT: null,
        offline: true,
        ignoreScripts: true,
        cache: env.npm_config_cache,
        userconfig: env.npm_config_userconfig,
        globalconfig: env.npm_config_globalconfig,
        force: false,
        legacyPeerDeps: false,
      },
      stdout: block(r.stdout ?? Buffer.alloc(0)),
      stderr: block(r.stderr ?? Buffer.alloc(0)),
    };
    commands.push(c);
    return {
      index: commands.length - 1,
      c,
      stdout: (r.stdout ?? Buffer.alloc(0)).toString(),
      stderr: (r.stderr ?? Buffer.alloc(0)).toString(),
    };
  }
  function required(r, label) {
    assert.equal(r.c.status, 0, label + " / full capture " + r.index);
    assert.equal(r.c.signal, null);
    assert.equal(r.c.error, null);
    return r;
  }
  function np(args, cwd) {
    return command(process.execPath, [npm, ...args], cwd);
  }
  function pack(folder) {
    const r = required(
        np(
          [
            "pack",
            "--offline",
            "--ignore-scripts",
            "--workspaces=false",
            "--json",
            "--pack-destination",
            temp,
          ],
          folder,
        ),
        "real local npm pack",
      ),
      meta = JSON.parse(r.stdout);
    assert.equal(meta.length, 1);
    assert.equal(path.basename(meta[0].filename), meta[0].filename);
    const tarball = path.join(temp, meta[0].filename),
      bytes = fs.readFileSync(tarball);
    packs.push({
      name: meta[0].name,
      version: meta[0].version,
      folder,
      tarball,
      command: r.index,
      integrity: meta[0].integrity,
      files: meta[0].files,
      ...block(bytes),
    });
    return tarball;
  }
  try {
    const tarballs = [];
    for (const name of ["protocol-types", "client", "viewmodel", "views"])
      tarballs.push(pack(P + "/web/packages/" + name));
    const closure = new Map();
    function collect(name, from = T) {
      const req = createRequire(from + "/package.json"),
        file = fs.realpathSync(req.resolve(name + "/package.json")),
        manifest = JSON.parse(fs.readFileSync(file)),
        folder = path.dirname(file),
        previous = closure.get(manifest.name);
      if (previous) {
        assert.equal(
          previous.version,
          manifest.version,
          "one exact local dependency version",
        );
        return;
      }
      closure.set(manifest.name, { folder, version: manifest.version });
      for (const dependency of Object.keys(manifest.dependencies ?? {}))
        collect(dependency, folder);
    }
    for (const n of ["react", "react-dom", "@types/react"]) collect(n);
    // A51 build input: the new tree's declared dependency, packed from product.
    collect("@tanstack/virtual-core", P + "/web");
    // Existing exact M6 runtime dependency; strict offline consumer assertions stay unchanged.
    collect("elkjs", P + "/web");
    for (const { folder } of closure.values()) tarballs.push(pack(folder));
    result.localDependencyClosure = [...closure].map(([name, { version }]) => ({
      name,
      version,
    }));
    fs.mkdirSync(consumer);
    fs.writeFileSync(
      consumer + "/package.json",
      JSON.stringify({
        name: "b45-real-outside-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
      }),
    );
    required(
      np(
        [
          "install",
          "--offline",
          "--ignore-scripts",
          "--strict-peer-deps",
          "--no-audit",
          "--no-fund",
          "--package-lock=false",
          "--workspaces=false",
          ...tarballs,
        ],
        consumer,
      ),
      "actual strict offline tarball install",
    );
    const tree = np(["ls", "react", "react-dom", "--json", "--all"], consumer);
    fs.writeFileSync(
      consumer + "/peer-tree.json",
      JSON.stringify({
        status: tree.c.status,
        stdout: tree.stdout,
        stderr: tree.stderr,
      }),
    );
    result.peerTreeCapture = tree.index;
    result.copiedInputs = [];
    for (const name of [
      "probes.mjs",
      "assertions.mjs",
      "cases.mjs",
      "positive.ts",
      "old-positive.ts",
    ]) {
      const original = fs.readFileSync(path.join(import.meta.dirname, name));
      fs.writeFileSync(consumer + "/" + name, original);
      assert.deepEqual(fs.readFileSync(consumer + "/" + name), original);
      result.copiedInputs.push({
        file: name,
        bytes: original.length,
        sha256: sha(original),
      });
    }
    const checked = command(
      process.execPath,
      [consumer + "/probes.mjs", T, npm],
      consumer,
    );
    result.probeCapture = checked.index;
    assert.equal(checked.c.error, null);
    assert.equal(checked.c.signal, null);
    result.report = JSON.parse(checked.stdout);
    assert.equal(
      checked.c.status,
      result.report.exitCode,
      "actual consumer exit propagation",
    );
    result.exitCode = checked.c.status;
  } catch (e) {
    result.setupError = String(e.stack ?? e);
  }
  // This owned temp is intentionally retained with actual tarballs/install/cache,
  // not a background resource. No server/watch/timer survives a command.
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.exitCode;
}
