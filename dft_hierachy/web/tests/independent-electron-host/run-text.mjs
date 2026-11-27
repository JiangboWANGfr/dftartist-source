import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { cases } from "./text-cases.mjs";
import { releaseAll } from "./scope.mjs";
const product = process.env.HIER_B_PRODUCT_ROOT;
assert(product, "explicit fixed product");
const r = {
  kind: "B71-private-text-not-Electron",
  planned: cases.length,
  executed: 0,
  passed: 0,
  failed: 0,
  blocked: cases.length,
  skipped: 0,
  results: [],
  cleanupErrors: [],
  exitCode: 1,
};
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      cases.map(({ run, ...c }) => c),
      null,
      2,
    ),
  );
else {
  try {
    const file = path.join(product, "web/packages/client/dist/node/process-transport.js");
    assert(fs.existsSync(file), "private text entry unavailable");
    const { createProcessTextTransport: factory } = await import(pathToFileURL(file));
    assert.equal(typeof factory, "function");
    for (const c of cases) {
      let timer, error;
      try {
        await Promise.race([
          c.run({ factory }),
          new Promise(
            (_, reject) =>
              (timer = setTimeout(() => reject(Error("B watchdog, not SLA: " + c.id)), 15000)),
          ),
        ]);
      } catch (e) {
        error = { name: e?.name, message: e?.message, stack: e?.stack };
      } finally {
        clearTimeout(timer);
        await releaseAll();
      }
      r.executed++;
      r.blocked--;
      if (error) r.failed++;
      else r.passed++;
      r.results.push({ id: c.id, pass: !error, ...(error ? { error } : {}) });
    }
    r.exitCode = r.failed ? 1 : 0;
  } catch (e) {
    r.setupError = String(e);
  }
  console.log(JSON.stringify(r, null, 2));
  process.exitCode = r.exitCode;
}
