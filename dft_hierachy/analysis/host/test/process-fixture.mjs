import { writeFileSync } from 'node:fs';

// A real child for deterministic process-boundary tests, never a DFT analysis substitute.
export function main() {
  const [mode, ...args] = process.argv.slice(2);
  switch (mode) {
    case 'echo':
      process.stdout.write(JSON.stringify({ args, cwd: process.cwd() }));
      break;
    case 'exit':
      process.stdout.write('{"original":true,"complete":false}');
      process.stderr.write('diagnostic 中文\n');
      process.exitCode = Number(args[0]);
      break;
    case 'bytes':
      process.stdout.write(Buffer.from(args[0], 'hex'));
      break;
    case 'text':
      process.stdout.write('链 conflict\n');
      break;
    case 'overflow':
      process[args[0]].write(Buffer.alloc(4096, 120));
      break;
    case 'log':
      process.stderr.write('retained log');
      process.stdout.write('{}');
      break;
    case 'signal':
      process.kill(process.pid, 'SIGTERM');
      break;
    case 'ready':
      // Handlers exist before READY; cancellation tests never race a startup sleep.
      process.on('SIGTERM', () => {});
      process.on('SIGUSR2', () => {
        process.stdout.write('{"released":true}', () => process.exit(0));
      });
      if (args[0]) writeFileSync(args[0], String(process.pid));
      process.stderr.write(`READY ${process.pid}\n`);
      setInterval(() => {}, 1000);
      break;
    default: throw new Error('Unknown test fixture mode');
  }
}
