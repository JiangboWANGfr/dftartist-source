import assert from "node:assert/strict";
import { publicEntry } from "../independent-electron-renderer/public-entry.mjs";
import { mainCases, preloadCases } from "./host-cases.mjs";
import { releaseMainScopes } from "./electron-input.mjs";
const product = process.env.HIER_B_PRODUCT_ROOT;
assert(product, "explicit fixed product");
const cases = process.argv.includes("--preload") ? preloadCases : mainCases;
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      cases.map(({ run, ...c }) => c),
      null,
      2,
    ),
  );
else {
  const r = {
    kind: "B71-real-product-host-unit-with-Electron-dependency-inputs-not-real-Electron",
    planned: cases.length,
    executed: 0,
    passed: 0,
    failed: 0,
    blocked: cases.length,
    skipped: 0,
    results: [],
    exitCode: 1,
  };
  try {
    publicEntry(
      product,
      "@hier/client/electron/" + (process.argv.includes("--preload") ? "preload" : "main"),
    );
    for (const c of cases) {
      let timer, error;
      try {
        await Promise.race([
          c.run(product),
          new Promise(
            (_, reject) =>
              (timer = setTimeout(() => reject(Error("B watchdog, not SLA: " + c.id)), 15000)),
          ),
        ]);
      } catch (e) {
        error = { name: e?.name, message: e?.message, stack: e?.stack };
      } finally {
        clearTimeout(timer);
        await releaseMainScopes();
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
