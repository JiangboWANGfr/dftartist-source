import { readFileSync } from 'node:fs';

// Controlled real process for report-reader boundaries, not a DFT implementation.
export function main() {
  const args = process.argv.slice(2);
  const path = args[args.indexOf('--report-fixture') + 1];
  process.stdout.write(readFileSync(path));
  const at = args.indexOf('--fixture-exit');
  if (at >= 0) process.exitCode = Number(args[at + 1]);
}
