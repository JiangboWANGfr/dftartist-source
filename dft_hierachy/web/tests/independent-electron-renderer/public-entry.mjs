import path from "node:path";
import { execFileSync } from "node:child_process";
export function publicEntry(product, specifier) {
  return execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `console.log(import.meta.resolve(${JSON.stringify(specifier)}))`,
    ],
    {
      cwd: path.join(product, "web"),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}
