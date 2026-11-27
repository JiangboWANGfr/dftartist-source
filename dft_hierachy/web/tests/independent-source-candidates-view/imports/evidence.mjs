// Pure recorded-evidence API. No automatic entry, argv parsing, or product execution.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const decode = (m) => {
  const b = gunzipSync(Buffer.from(m.gzipBase64, "base64"));
  assert.equal(b.length, m.bytes);
  assert.equal(sha(b), m.sha256);
  return b;
};
const failures = {
  "native20-public-CLI-preflight": 9,
  "native22-public-CLI-preflight": 9,
  "native-runtime-and-legal-option-premises": 1,
  "native20-invalid-ep-diagnostic": 9,
  "unrepaired-native20-matrix": 1,
  "unrepaired-native22-matrix": 1,
  "fixed-old-native20-negative-replay": 1,
  "fixed-old-native22-negative-replay": 1,
  "current-multipage-reject-old-inputs": 1,
};
export function verifyEvidence(a, { root } = {}) {
  assert.equal(a.kind, "B38-C97-native-print-options");
  assert.deepEqual(a.fixed, {
    product: "9e99a041c05fbdd574e146c8c35aaa003914f2b1",
    initialB: "8ed98381d0a47ea3e860d1c570fdf1851d713c26",
    freeze: "2e50c7867306966d739b503bb59ea00dcb9ef4bf",
    repair: "1724c0d95c367e27534e2096ab9fcd4a3c5d0cc3",
  });
  assert.deepEqual(a.scope, {
    uniqueNewCases: 76,
    legacyImports: 32,
    legacyReleaseCLI: 16,
    legacyMultipageCLI: 8,
    legacyMultipageScope:
      "byte-exact historical 12 inputs/archive/test with repaired multipage entry",
    nativeVersions: ["v20.12.2", "v22.0.0", "v24.21.0"],
    nativeNode20Or22Executed: true,
    metadataOnly: true,
    currentProductExecuted: 0,
    C97ClosedByB: false,
    Q1Closed: false,
    fullM5Passed: false,
    newDOMExecuted: 0,
    deviceE2E: false,
  });
  assert(a.captures.length >= 49);
  assert.equal(new Set(a.captures.map((r) => r.name)).size, a.captures.length);
  assert.deepEqual(
    a.captures
      .filter((r) => r.exit !== 0)
      .map((r) => r.name)
      .sort(),
    Object.keys(failures).sort(),
  );
  for (const r of a.captures) {
    assert.equal(r.exit, failures[r.name] ?? 0);
    assert.equal(r.signal, null);
    assert.equal(r.error, null);
    assert.equal(r.captureComplete, true);
    assert(Array.isArray(r.command) && r.command.length);
    assert.equal(typeof r.cwd, "string");
    assert(Number.isFinite(r.seconds) && r.seconds >= 0);
    decode(r.stdout);
    decode(r.stderr);
  }
  const record = (n) => {
      const r = a.captures.find((r) => r.name === n);
      assert(r, "missing capture " + n);
      return r;
    },
    text = (n) => decode(record(n).stdout).toString(),
    json = (n) => JSON.parse(text(n));
  const tap = (n, tests, pass, fail) => {
    const t = text(n);
    for (const [k, v] of Object.entries({
      tests,
      pass,
      fail,
      cancelled: 0,
      skipped: 0,
      todo: 0,
    }))
      assert.match(t, new RegExp("^# " + k + " " + v + "$", "m"));
    assert.match(t, new RegExp("^1\\.\\." + tests + "$", "m"));
  };
  for (const v of ["20", "22", "24"]) {
    tap(
      "unrepaired-native" + v + "-matrix",
      76,
      v === "24" ? 76 : 64,
      v === "24" ? 0 : 12,
    );
    tap("repaired-native" + v + "-matrix", 76, 76, 0);
    tap("legacy-imports32-native" + v, 32, 32, 0);
    tap("legacy-CLI16-native" + v, 16, 16, 0);
    tap("legacy-M8-pinned-snapshot-native" + v, 8, 8, 0);
  }
  for (const v of ["20", "22"])
    tap("fixed-old-native" + v + "-negative-replay", 76, 64, 12);
  for (const n of [
    "unrepaired-native20-matrix",
    "unrepaired-native22-matrix",
    "fixed-old-native20-negative-replay",
    "fixed-old-native22-negative-replay",
  ]) {
    const names = [...text(n).matchAll(/^not ok \d+ - (.+)$/gm)].map(
      (m) => m[1],
    );
    assert.equal(names.length, 12);
    assert(
      names.every((n) =>
        /^B38 import (release|actions|multipage) (real|alias) pe consumerArchive=(true|false)$/.test(
          n,
        ),
      ),
    );
    assert.equal(new Set(names).size, 12);
  }
  for (const n of [
    "current-multipage-metadata",
    "fixed-old-multipage-inputs",
    "current-release-five-inputs",
  ]) {
    const r = json(n);
    assert.equal(r.verified, true);
    assert.equal(r.metadataOnly, true);
    assert.equal(r.currentProductExecuted, 0);
  }
  assert.equal(json("current-release-five-inputs").inputs, 5);
  assert.equal(record("current-multipage-reject-old-inputs").stdout.bytes, 0);
  assert.match(
    decode(record("current-multipage-reject-old-inputs").stderr).toString(),
    /20835 !== 20834/,
  );
  const runtime = json("frozen-runtime-and-source-pins"),
    protection = json("post-repair-strict-protection");
  assert.equal(runtime.frozenInputsUnchanged, true);
  assert.equal(runtime.exactThreeAddedGuardBytes, true);
  assert.equal(protection.protected, true);
  assert.equal(protection.strictOldOrdinary, 3448);
  assert.equal(protection.declarations, 49);
  assert.equal(protection.binaries.length, 3);
  assert.deepEqual(a.inputs, runtime.inputPins);
  assert.equal(a.inputs.length, 8);
  const materials = new Map();
  for (const m of a.materials) {
    assert(!materials.has(m.name));
    materials.set(m.name, decode(m));
  }
  const material = (n) => {
    const b = materials.get(n);
    assert(b, "missing material " + n);
    return b;
  };
  for (const p of a.inputs) {
    const b = material("current:" + p.file);
    assert.equal(b.length, p.bytes);
    assert.equal(sha(b), p.sha256);
    if (root) {
      const current = fs.readFileSync(path.join(root, p.file));
      assert.equal(current.length, p.bytes);
      assert.equal(sha(current), p.sha256);
    }
  }
  const auth = JSON.parse(material("authorized-main-entry-changes.json"));
  assert.deepEqual(auth.changes, protection.authorized);
  assert.equal(auth.changes.length, 3);
  for (const c of auth.changes) {
    const old = material("original:" + c.old.file),
      now = material("current:" + c.current.file);
    assert.equal(old.length, c.old.bytes);
    assert.equal(sha(old), c.old.sha256);
    assert.equal(now.length, c.current.bytes);
    assert.equal(sha(now), c.current.sha256);
    assert.equal(now.length, old.length + 1);
    assert.equal(old.toString().split("^-[ep]$").length, 2);
    assert.deepEqual(
      now,
      Buffer.from(old.toString().replace("^-[ep]$", "^-[ep]+$")),
    );
  }
  assert.equal(
    sha(material("DESIGN.md")),
    "20233a66e6f3462bbc38c51a194e0dc3a07b91292947e47978e4d818f32d789a",
  );
  const premises = text("validated-native-runtime-and-CLI-premises")
      .trim()
      .split("\n")
      .map((s) => JSON.parse(s)),
    native = premises.filter((r) => r.metadata);
  assert.deepEqual(
    native.map((r) => r.metadata.version),
    a.scope.nativeVersions,
  );
  assert.deepEqual(
    native.map((r) => r.metadata.mainType),
    ["undefined", "undefined", "boolean"],
  );
  assert(
    native.every(
      (r) => r.metadata.platform === "darwin" && r.metadata.arch === "arm64",
    ),
  );
  assert.deepEqual(
    native.map((r) => ({ bytes: r.binaryBytes, sha256: r.binarySha256 })),
    runtime.binaries.map(({ bytes, sha256 }) => ({ bytes, sha256 })),
  );
  assert.deepEqual(
    native.map((r) => r.binarySha256),
    [
      "ccdd66080156689799b6418cacc46799eb9961f45087fa79f5c64033a0c1aa07",
      "9507031f6769f2381eae353b3614bafa871c957dc6f2ae86a3af948acdf9b178",
      "e4b5a3af0e05c75de2eae013904145f40fe7fc2a6e6f17510128bf45cca4e79b",
    ],
  );
  assert.equal(a.downloads.length, 2);
  for (const d of a.downloads) {
    assert.match(
      d.url,
      /^https:\/\/nodejs\.org\/download\/release\/v(?:20\.12\.2|22\.0\.0)\/node-v(?:20\.12\.2|22\.0\.0)-darwin-arm64\.tar\.gz$/,
    );
    assert.match(
      material(d.checksums).toString(),
      new RegExp(
        "^" + d.sha256 + "  " + d.file.replaceAll(".", "\\.") + "$",
        "m",
      ),
    );
  }
  assert.deepEqual(
    a.downloads.map((d) => d.sha256),
    [
      "98eb624b52efec2530079e1d11296ec0ac20771b94b087d21649250339cf5332",
      "ea96d349cfaa67aa87ceeaa3e5b52c9167f7ac302fd8d1ff162d0785e9dc0785",
    ],
  );
  const auditRaw = material("source-audit.json");
  assert.equal(
    sha(auditRaw),
    "40e68081cf5121bf327252d8de34cd89ac9c62a5ccf8585736b6f7ebde292416",
  );
  const audit = JSON.parse(auditRaw);
  assert.equal(audit.exitCode, 0);
  assert.equal(audit.commands.length, 45);
  assert.equal(audit.imports.length, 4);
  assert(audit.imports.every((i) => i.rawEqual));
  assert.equal(audit.finalFiles.length, 15);
  for (const c of audit.commands) {
    assert.equal(c.status, 0);
    assert.equal(c.signal, null);
    for (const k of ["stdout", "stderr"]) {
      const b = c[k],
        m = a.materials.find((m) => m.name === "audit-stream:" + b.gzip);
      assert(m, "missing raw audit stream");
      assert.equal(m.bytes, b.bytes);
      assert.equal(m.sha256, b.sha256);
      const gz = Buffer.from(m.gzipBase64, "base64");
      assert.equal(gz.length, b.gzipBytes);
      assert.equal(sha(gz), b.gzipSha256);
    }
  }
  const snapshot = json("prepare-legacy-M8-pinned-input-snapshot");
  assert.equal(snapshot.pins.length, 15);
  assert.equal(snapshot.currentEntry.sha256, auth.changes[2].current.sha256);
  assert.equal(a.references.length, 4);
  assert.deepEqual(a.references, runtime.archives);
  for (const p of a.references)
    if (root) {
      const b = fs.readFileSync(path.join(root, p.file));
      assert.equal(b.length, p.bytes);
      assert.equal(sha(b), p.sha256);
    }
  for (const p of snapshot.pins) {
    if (p.file === "docs/m5_b_multipage_action_identity.json") {
      const r = a.references.find((r) => r.file === p.file);
      assert.equal(p.bytes, r.bytes);
      assert.equal(p.sha256, r.sha256);
    } else {
      const b = material("legacy-M8:" + p.file);
      assert.equal(b.length, p.bytes);
      assert.equal(sha(b), p.sha256);
    }
  }
  for (const n of [
    "initial.json",
    "protect.mjs",
    "protect-authorized.mjs",
    "capture.mjs",
    "runtime-preflight.mjs",
    "runtime-preflight-valid.mjs",
    "runtime-audit.mjs",
    "verify-runtime-downloads.mjs",
    "prepare-metadata-snapshot.mjs",
    "seal.mjs",
    "evidence.mjs",
    "source-audit.mjs",
  ])
    material(n);
  return {
    verified: true,
    metadataOnly: true,
    currentProductExecuted: 0,
    captures: a.captures.length,
    materials: a.materials.length,
    inputs: a.inputs.length,
    sourceAuditCommands: 45,
    sourceAuditStreams: 90,
    ...a.scope,
  };
}
export function checkEvidenceControls(a) {
  verifyEvidence(a);
  const changeText = (b, name, f) => {
    const r = b.captures.find((r) => r.name === name),
      raw = Buffer.from(f(decode(r.stdout).toString()));
    r.stdout = {
      bytes: raw.length,
      sha256: sha(raw),
      gzipBase64: gzipSync(raw).toString("base64"),
    };
  };
  const cases = [
    (b) => {
      b.scope.C97ClosedByB = true;
    },
    (b) => {
      b.materials[0].gzipBase64 = "corrupt";
    },
    (b) => {
      b.captures = b.captures.filter(
        (r) => r.name !== "unrepaired-native20-matrix",
      );
    },
    (b) =>
      changeText(b, "repaired-native22-matrix", (s) =>
        s.replace("# pass 76", "# pass 75"),
      ),
    (b) => {
      b.materials = b.materials.filter(
        (m) => m.name !== "audit-stream:0-stdout.gz",
      );
    },
    (b) => {
      b.scope.nativeNode20Or22Executed = false;
    },
    (b) => {
      b.inputs[0].sha256 = "0".repeat(64);
    },
  ];
  for (const change of cases) {
    const b = structuredClone(a);
    change(b);
    assert.throws(() => verifyEvidence(b));
  }
  return {
    metadataOnly: true,
    currentProductExecuted: 0,
    positive: 1,
    negative: cases.length,
  };
}
