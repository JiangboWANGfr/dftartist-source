import { test } from "node:test"; import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os"; import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { ctrlgenGen } = require("../../electron/cli.cjs");

test("ctrlgenGen spawns bin, passes spec file, parses ===FILE:=== markers", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ctrlgen-stub-"));
  writeFileSync(path.join(dir, "ctrlgen"),
    `#!/bin/sh\n[ "$1" = "gen" ] || exit 2\n` +
    `printf '===FILE:m_ds1.v===\\nmodule m_ds1;\\nendmodule\\n===FILE:m_ds1.tcl===\\ncreate_instance  u_m_ds1 -of_module m_ds1\\n'\n`);
  chmodSync(path.join(dir, "ctrlgen"), 0o755);
  process.env.DFT_CORE_BIN_DIR = dir;
  const { files } = await ctrlgenGen({ schemaVersion: 2, moduleBase: "m", dsIndex: 1, pins: [] });
  assert.equal(files.length, 2);
  assert.equal(files[0].name, "m_ds1.v");
  assert.ok(files[1].text.includes("create_instance"));
});

test("ctrlgenGen surfaces non-zero exit as rejection", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ctrlgen-stub-"));
  writeFileSync(path.join(dir, "ctrlgen"), `#!/bin/sh\necho "ctrlgen: boom" >&2\nexit 2\n`);
  chmodSync(path.join(dir, "ctrlgen"), 0o755);
  process.env.DFT_CORE_BIN_DIR = dir;
  await assert.rejects(() => ctrlgenGen({ schemaVersion: 2, moduleBase: "m", pins: [] }),
                       /boom/);
});
