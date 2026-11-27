// Proves the layer rules actually reject violations: plants one forbidden import per
// rule, runs the checker, and requires it to fail with that rule's name.
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";

const cases = [
  ["protocol-types", "@hier/client", "protocol-types-must-not-import-client"],
  ["client", "@hier/viewmodel", "client-must-not-import-viewmodel"],
  ["client", "@hier/views", "client-must-not-import-views"],
  ["viewmodel", "@hier/views", "viewmodel-must-not-import-views"],
  ["views", "@hier/client", "views-must-not-import-client"],
  ["client", "node:fs", "browser-must-not-import-node"],
  ["client", "@hier/client/node", "browser-must-not-import-node-entry"],
  ["client", "electron", "browser-must-not-import-electron"],
  ["client", "@hier/client/electron/main", "browser-must-not-import-electron-host"],
];

let failed = 0;
for (const [from, target, rule] of cases) {
  const probe = `packages/${from}/src/__layering_probe__.ts`;
  writeFileSync(probe, `import * as x from "${target}";\nexport const probe = x;\n`);
  let output = "";
  let rejected = false;
  try {
    output = execFileSync("npx", ["depcruise", "packages", "--config", ".dependency-cruiser.cjs"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    rejected = true;
    output = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  } finally {
    rmSync(probe);
  }
  const ok = rejected && output.includes(rule);
  console.log(`${ok ? "ok  " : "FAIL"} ${from} -> ${target} (${rule})`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
