import { test } from "node:test"; import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

// Point at the sibling dft-core build dir. resolveBin() reads this env at call time.
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
process.env.DFT_CORE_BIN_DIR = path.resolve(__dirname, "..", "..", "..", "dft-core", "build");

import { resolveBin } from "../../electron/bin.cjs";
import { hdlDump } from "../../electron/cli.cjs";

const FILELIST = path.resolve(__dirname, "..", "fixtures", "soc.f");
const have = existsSync(resolveBin("hdl"));

test("hdl dump returns a hierarchy with rootInstanceIds", { skip: !have }, async () => {
  const h = await hdlDump(FILELIST);
  assert.ok(Array.isArray(h.rootInstanceIds) && h.rootInstanceIds.length > 0,
    "rootInstanceIds must be a non-empty array");
  assert.ok(h.instances && typeof h.instances === "object",
    "instances must be an object");
});
