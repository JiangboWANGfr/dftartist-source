import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  checkedSpawn,
  main,
  withLegacySchema,
} from "../scripts/run-source-ref-kind-tests.mjs";

test("B receives a normalized checkout root and its own tools", () => {
  const actual = JSON.parse(
    checkedSpawn(process.execPath, [
      "-e",
      "console.log(JSON.stringify({root:process.env.HIER_B_PRODUCT_ROOT,tools:process.env.HIER_B_BROWSER_TOOLS}))",
    ]),
  );
  const expected = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  assert.equal(actual.root, expected);
  assert.equal(actual.tools, join(expected, "web"));
  assert.ok(
    join(expected, "core/build/hier").startsWith(actual.root + "/core/"),
  );
});

test("standard entry rejects invalid arguments and absent native consumers", () => {
  assert.throws(() => main([]));
  assert.throws(() => main(["model", "ignored"]));
  assert.throws(() => main(["native"]));
  assert.throws(() => main(["native", "/does-not-exist-ref-kind"]));
});
test("subprocess failure, signal and launch errors cannot pass", () => {
  assert.throws(() =>
    checkedSpawn(process.execPath, ["-e", "process.exit(9)"]),
  );
  assert.throws(() =>
    checkedSpawn(process.execPath, [
      "-e",
      "process.kill(process.pid, 'SIGTERM')",
    ]),
  );
  assert.throws(() => checkedSpawn("/does-not-exist-ref-kind", []));
});
test("actual old protocol fixture is checked and removed after failure", () => {
  let temp;
  assert.throws(
    () =>
      withLegacySchema((dir) => {
        temp = dir;
        const schema = JSON.parse(
          readFileSync(join(dir, "protocol/schema/hier.schema.json"), "utf8"),
        );
        assert.equal(schema.$defs.SourceHit.properties.refKind, undefined);
        assert.equal(schema.$defs.SourceRefKind, undefined);
        assert.ok(
          existsSync(
            join(
              dir,
              "web/packages/protocol-types/dist/validators.generated.js",
            ),
          ),
        );
        throw Error("fixture cleanup witness");
      }),
    /fixture cleanup witness/,
  );
  assert.equal(existsSync(temp), false);
});
