import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { _electron } from "playwright";

const web = fileURLToPath(new URL("../", import.meta.url));
const consumer = process.env.HIER_A_DEMO_DELIVERY;
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo");
const binary = createRequire(path.join(consumer ?? web, "package.json"))("electron");

test("demo resource configuration accepts explicit decimal budgets and rejects malformed input", async () => {
  const built = await build({
    entryPoints: [path.join(app, "src/resource-limits.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const { resourceLimitsFromEnvironment: read } = await import(
    "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64")
  );
  assert.deepEqual(read({}), {
    openTimeoutMillis: 30000,
    cancelTimeoutMillis: 2000,
    maxRssBytes: 4294967296,
  });
  assert.deepEqual(read({ HIER_CORE_CANCEL_TIMEOUT_MS: "500" }), {
    openTimeoutMillis: 30000,
    cancelTimeoutMillis: 500,
    maxRssBytes: 4294967296,
  });
  assert(Object.isFrozen(read({})));
  assert.deepEqual(read({ HIER_CORE_MAX_RSS_BYTES: "off" }), {
    openTimeoutMillis: 30000,
    cancelTimeoutMillis: 2000,
  });
  assert.deepEqual(
    read({
      HIER_CORE_OPEN_TIMEOUT_MS: "off",
      HIER_CORE_CANCEL_TIMEOUT_MS: "off",
      HIER_CORE_MAX_RSS_BYTES: "off",
    }),
    {},
  );
  assert.deepEqual(
    read({
      HIER_CORE_OPEN_TIMEOUT_MS: "30000",
      HIER_CORE_CANCEL_TIMEOUT_MS: "2000",
      HIER_CORE_MAX_RSS_BYTES: "4294967296",
    }),
    {
      openTimeoutMillis: 30000,
      cancelTimeoutMillis: 2000,
      maxRssBytes: 4294967296,
    },
  );
  for (const value of [
    "",
    "0",
    "-1",
    " 2",
    "2 ",
    "01",
    "1e3",
    "0x20",
    "1.5",
    "NaN",
    "9007199254740992",
  ])
    assert.throws(() => read({ HIER_CORE_MAX_RSS_BYTES: value }), /configuration/);
  assert.throws(() => read({ HIER_CORE_OPEN_TIMEOUT_MS: "2147483648" }), /out of range/);
});

test(
  "real Electron shows a Core RSS budget failure and permits another open attempt",
  { timeout: 20000 },
  async () => {
    assert(process.env.HIER_BIN, "explicit actual Core executable");
    const electron = await _electron.launch({
      executablePath: binary,
      args: [app],
      env: { ...process.env, HIER_CORE_MAX_RSS_BYTES: "1" },
    });
    try {
      const input = fileURLToPath(new URL("./demo-graph/design.sv", import.meta.url));
      await electron.evaluate(({ dialog }, filename) => {
        globalThis.resourceTestPicks = 0;
        dialog.showOpenDialog = async () => {
          globalThis.resourceTestPicks++;
          return { canceled: false, filePaths: [filename] };
        };
      }, input);
      const page = await electron.firstWindow();
      page.setDefaultTimeout(5000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (let attempt = 1; attempt <= 2; attempt++) {
        await page.getByRole("button", { name: "打开设计", exact: true }).click();
        await page.waitForSelector('.demo-status[data-phase="failed"]');
        assert.match(
          await page.locator(".demo-status").innerText(),
          /Core exceeded its memory budget/,
        );
        assert.equal(await electron.evaluate(() => globalThis.resourceTestPicks), attempt);
        assert.equal(
          await page.getByRole("button", { name: "打开设计", exact: true }).isEnabled(),
          true,
        );
      }
      assert.deepEqual(errors, []);
    } finally {
      await electron.close();
    }
  },
);
