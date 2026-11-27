// A wiring controls only: receipt children do not simulate product behavior.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  realpathSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const wrapper = "web/scripts/run-source-document-tests.mjs";
const base = "web/tests/independent-source-confirmation/";
const inputs = {
  model: [
    [base + "verify-types.mjs"],
    [base + "run.mjs"],
    [base + "recheck/run.mjs"],
  ],
  controls: [
    [base + "facility.test.mjs"],
    ["web/tests/source-confirmation-reentrancy.test.mjs"],
    [base + "recheck/facility.test.mjs"],
  ],
  core: [
    [base + "recheck/run.mjs", "--core"],
    ["web/tests/source-confirmation-core.test.mjs"],
  ],
};

for (const mode of Object.keys(inputs)) {
  const cases = [
    ["ok", -1],
    ...inputs[mode].flatMap((_, i) => [
      ["missing", i],
      ["directory", i],
      ["exit", i],
    ]),
  ];
  for (const [fault, index] of cases)
    test(`confirmation entry ${mode}/${fault}/${index}`, () => {
      const dir = realpathSync(
        mkdtempSync(join(tmpdir(), "hier-a-confirmation gate 中文-")),
      );
      try {
        mkdirSync(dirname(join(dir, wrapper)), { recursive: true });
        copyFileSync(join(root, wrapper), join(dir, wrapper));
        inputs[mode].forEach(([file], i) => {
          if (fault === "missing" && i === index) return;
          const target = join(dir, file);
          mkdirSync(dirname(target), { recursive: true });
          if (fault === "directory" && i === index) {
            mkdirSync(target);
            return;
          }
          writeFileSync(
            target,
            `console.log('A-CONFIRMATION-RECEIPT '+JSON.stringify({i:${i},args:process.argv.slice(2),cwd:process.cwd(),root:process.env.HIER_B_PRODUCT_ROOT,bin:process.env.HIER_BIN}));\n` +
              (fault === "exit" && i === index ? "process.exit(19);\n" : ""),
          );
        });
        const env = {
          ...process.env,
          HIER_B_PRODUCT_ROOT: "/wrong/checkout",
          HIER_BIN: "receipt-only-hier",
        };
        // Reproduce an ordinary npm child, without the parent's Node test context.
        delete env.NODE_TEST_CONTEXT;
        const r = spawnSync(
          process.execPath,
          [join(dir, wrapper), mode, "confirmation"],
          {
            cwd: tmpdir(),
            encoding: "utf8",
            env,
          },
        );
        assert.ifError(r.error);
        assert.equal(r.signal, null);
        const receipts = [
          ...r.stdout.matchAll(/A-CONFIRMATION-RECEIPT (\{[^\n]+\})/g),
        ].map((m) => JSON.parse(m[1]));
        if (fault === "ok") {
          assert.equal(r.status, 0, r.stderr);
          assert.deepEqual(
            receipts.map((x) => x.i).sort(),
            inputs[mode].map((_, i) => i),
          );
        } else {
          assert.notEqual(r.status, 0, r.stdout);
          if (mode === "controls" && ["missing", "directory"].includes(fault))
            assert.equal(receipts.length, 0);
          if (mode !== "controls")
            assert.ok(receipts.every((x) => x.i <= index));
        }
        for (const receipt of receipts) {
          assert.equal(receipt.cwd, dir);
          assert.equal(realpathSync(receipt.root), dir);
          assert.equal(receipt.bin, "receipt-only-hier");
          assert.deepEqual(receipt.args, inputs[mode][receipt.i].slice(1));
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
}
