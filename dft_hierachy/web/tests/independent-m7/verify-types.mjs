// New optional Node API: handwritten old/new consumers and three negative controls.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const product = fs.realpathSync(process.env.HIER_B_PRODUCT_ROOT);
const dir = fs.mkdtempSync(
  path.join(process.env.HIER_B_TYPE_TEMP ?? os.tmpdir(), "hier-b-m7-types-"),
);
const source = fs.readFileSync(
  fileURLToPath(new URL("./types.ts", import.meta.url)),
  "utf8",
);
fs.writeFileSync(path.join(dir, "package.json"), '{"type":"module"}\n');
fs.writeFileSync(
  path.join(dir, "tsconfig.json"),
  JSON.stringify(
    {
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        types: ["node"],
        typeRoots: [path.join(product, "web/node_modules/@types")],
        paths: {
          "@hier/client": [
            path.join(product, "web/packages/client/dist/index.d.ts"),
          ],
          "@hier/client/node": [
            path.join(product, "web/packages/client/dist/node/index.d.ts"),
          ],
        },
      },
      files: ["consumer.ts"],
    },
    null,
    2,
  ),
);
const runs = [];
function run(text) {
  fs.writeFileSync(path.join(dir, "consumer.ts"), text);
  const argv = [
    path.join(product, "web/node_modules/typescript/bin/tsc"),
    "-p",
    path.join(dir, "tsconfig.json"),
    "--pretty",
    "false",
  ];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8" });
  const result = { argv, exit: r.status, stdout: r.stdout, stderr: r.stderr };
  runs.push(result);
  return result;
}
const positive = run(source),
  negatives = [];
let count = 0;
const marked = source.split("\n");
for (let i = 0; i < marked.length; i++)
  if (marked[i].includes("@ts-expect-error")) {
    const copy = [...marked];
    copy[i] = "// deliberately expose this negative input";
    const r = run(copy.join("\n"));
    negatives.push(
      r.exit !== 0 && /error TS/.test(r.stdout) && !/TS2578/.test(r.stdout),
    );
    count++;
  }
const exitCode =
  positive.exit === 0 && negatives.length === 3 && negatives.every(Boolean)
    ? 0
    : 1;
console.log(
  JSON.stringify(
    {
      product,
      dir,
      exitCode,
      positive: positive.exit === 0 ? [] : [positive],
      executedNegative: count,
      negatives,
      runs,
    },
    null,
    2,
  ),
);
process.exitCode = exitCode;
