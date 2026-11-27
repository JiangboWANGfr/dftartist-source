import cp from "node:child_process";
import { realpathSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";

// External negative control: one regular sample, one pending-close sample, then browser Core.
const target = realpathSync(process.env.HIER_BIN);
const signal = process.env.HIER_A_BROWSER_EXIT_SIGNAL;
if (signal !== "SIGTERM" && signal !== "SIGKILL") throw new Error("Explicit test signal required");
const spawn = cp.spawn;
let starts = 0;
cp.spawn = function (command, ...args) {
  const child = spawn.call(this, command, ...args);
  if (command === target && ++starts === 3) {
    const end = child.stdin.end.bind(child.stdin);
    child.stdin.end = function (...values) {
      process.stderr.write(`A negative control: browser Core ${signal}\n`);
      child.kill(signal);
      return end(...values);
    };
  }
  return child;
};
syncBuiltinESMExports();
