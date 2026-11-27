// A real child for ownership/argv tests; never a DFT backend substitute.
export function main() {
  const args = process.argv.slice(2);
  const mode = args[args.indexOf('--session-test-mode') + 1];
  const output = () => process.stdout.write(JSON.stringify({ args, cwd: process.cwd() }));
  if (mode === 'ready') {
    process.on('SIGTERM', () => {});
    process.on('SIGUSR2', () => {
      output();
      process.stdout.end(() => process.exit(0));
    });
    process.stderr.write(`READY ${process.pid}\n`);
    setInterval(() => {}, 1000);
  } else if (mode === 'bad-json') process.stdout.write('broken');
  else if (mode === 'text') process.stdout.write('original text 中文\n');
  else if (mode === 'exit2') {
    process.stdout.write('{"error":{"code":"test_argument_error"}}');
    process.exitCode = 2;
  } else output();
}
