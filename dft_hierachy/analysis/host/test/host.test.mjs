import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm, access, realpath } from 'node:fs/promises';
import { getEventListeners } from 'node:events';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NativeAnalysisHost, NativeAnalysisError } from '../index.mjs';

let root, binaryDirectory, cwd;
const fixture = new URL('./process-fixture.mjs', import.meta.url).href;
before(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'native-host-test-')));
  binaryDirectory = join(root, '工具 bin');
  cwd = join(root, '工作 cwd');
  await mkdir(binaryDirectory); await mkdir(cwd);
  for (const tool of ['dft-seqcheck', 'dft-objects', 'dft-memory', 'dft-wrapper'])
    await writeFile(join(binaryDirectory, tool), `#!${process.execPath}\nimport { main } from ${JSON.stringify(fixture)}; main();\n`, { mode: 0o755 });
});
after(async () => { await rm(root, { recursive: true, force: true }); });
const options = (extra = {}) => ({ binaryDirectory, cwd, timeoutMs: 5000, killGraceMs: 20, ...extra });
const request = (args, extra = {}) => ({ tool: 'dft-wrapper', args, ...extra });
function errorCode(code, extra = () => {}) {
  return (error) => {
    assert.ok(error instanceof NativeAnalysisError);
    assert.equal(error.code, code); extra(error); return true;
  };
}
function reaped(pid) {
  assert.ok(Number.isInteger(pid));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
}
function readiness() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  let text = '';
  return { promise, onStderr: (chunk) => {
    text += Buffer.from(chunk).toString();
    const match = text.match(/READY (\d+)\n/);
    if (match) resolve(Number(match[1]));
  } };
}

test('absolute executable/cwd, shell-free argv snapshot, independent outputs', async (t) => {
  const host = new NativeAnalysisHost(options());
  t.after(() => host.dispose());
  const args = ['echo', 'a b', '中文😀', '"\\', '$(touch injected)', '; echo nope', '--output'];
  const run = host.run(request(args));
  args.push('changed');
  assert.equal(host.activeCount, 1);
  const result = await run;
  assert.deepEqual(result.payload, { args: args.slice(1, -1), cwd });
  assert.equal(result.kind, 'report'); assert.equal(result.exitCode, 0);
  assert.equal(result.signal, null); assert.equal(host.activeCount, 0); reaped(result.pid);
  await assert.rejects(access(join(cwd, 'injected')));
  const other = await host.run(request(['echo'], { cwd: root }));
  assert.equal(other.payload.cwd, root);
  assert.notEqual(result.stdout, other.stdout);
  await host.dispose();
});

test('all seven original reporting/error exits and Wrapper text', async (t) => {
  const host = new NativeAnalysisHost(options()); t.after(() => host.dispose());
  for (const exitCode of [0, 1, 4, 2, 3, 5, 130]) {
    const result = await host.run(request(['exit', String(exitCode)], exitCode >= 2 && exitCode !== 4 ? { format: 'text' } : {}));
    assert.equal(result.exitCode, exitCode);
    assert.equal(result.kind, [0, 1, 4].includes(exitCode) ? 'report' : 'backend_error');
    assert.equal(result.format, 'json'); assert.equal(result.payload.complete, false);
    assert.equal(Buffer.from(result.stderr).toString(), 'diagnostic 中文\n'); reaped(result.pid);
  }
  const text = await host.run(request(['text'], { format: 'text' }));
  assert.equal(text.payload, '链 conflict\n'); assert.equal(text.format, 'text');
});

test('strict UTF8, JSON object boundary and original bytes on rejection', async (t) => {
  const host = new NativeAnalysisHost(options()); t.after(() => host.dispose());
  for (const bytes of [Buffer.from('null'), Buffer.from('[]'), Buffer.from('1'), Buffer.from('oops'), Buffer.from('{}x'),
    Buffer.from([0xff]), Buffer.from([0xc0, 0x80]), Buffer.from([0xed, 0xa0, 0x80]), Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])]) {
    await assert.rejects(host.run(request(['bytes', bytes.toString('hex')])), errorCode('output_invalid', (e) => {
      assert.deepEqual(Buffer.from(e.details.stdout), bytes); assert.equal(e.details.exitCode, 0); reaped(e.details.pid);
    }));
  }
  await assert.rejects(host.run(request(['bytes', 'ff'], { format: 'text' })), errorCode('output_invalid'));
  assert.equal((await host.run(request(['bytes', Buffer.from('{"name":"😀"}').toString('hex')]))).payload.name, '😀');
});

test('invalid configuration rejects without starting processes', () => {
  for (const value of [undefined, null, [], {}, { binaryDirectory: '.' }, options({ cwd: 'relative' }),
    options({ timeoutMs: 0 }), options({ timeoutMs: 2147483648 }), options({ killGraceMs: -1 }),
    options({ killGraceMs: 30001 }), options({ maxStdoutBytes: 0 }), options({ maxStderrBytes: Infinity }),
    options({ maxStdoutBytes: 67108865 }), options({ binaryDirectory: `${root}/\ud800` })])
    assert.throws(() => new NativeAnalysisHost(value), errorCode('invalid_request'));
});

test('invalid requests reject promises and leave ownership empty', async (t) => {
  const host = new NativeAnalysisHost(options()); t.after(() => host.dispose());
  const bad = [undefined, null, [], {}, request('not array'), request([1]), request(['\0']), request(['\udc00']),
    request(['--output', '/tmp/no', '--', 'echo']), request(['echo'], { tool: '../dft-wrapper' }),
    request([], { cwd: '.' }), request([], { format: 'xml' }), request([], { tool: 'dft-memory', format: 'text' }),
    request([], { signal: {} }), request([], { signal: Object.create(AbortSignal.prototype) }),
    request([], { onStderr: 1 }), request(new Array(1))];
  for (const value of bad) {
    let result;
    assert.doesNotThrow(() => { result = host.run(value); });
    await assert.rejects(result, errorCode('invalid_request')); assert.equal(host.activeCount, 0);
  }
  const cause = new Error('getter failure');
  await assert.rejects(host.run({ get tool() { throw cause; } }), errorCode('invalid_request', (e) => assert.equal(e.cause, cause)));
});

test('spawn failure and unexpected exit/signal preserve process diagnostics', async (t) => {
  const absent = new NativeAnalysisHost(options({ binaryDirectory: join(root, 'absent') })); t.after(() => absent.dispose());
  await assert.rejects(absent.run(request([])), errorCode('spawn_failed', (e) => assert.equal(e.cause.code, 'ENOENT')));
  assert.equal(absent.activeCount, 0);
  const host = new NativeAnalysisHost(options()); t.after(() => host.dispose());
  await assert.rejects(host.run(request(['exit', '17'])), errorCode('process_failed', (e) => {
    assert.equal(e.details.exitCode, 17); assert.equal(e.details.signal, null); reaped(e.details.pid);
  }));
  await assert.rejects(host.run(request(['signal'])), errorCode('process_failed', (e) => {
    assert.equal(e.details.exitCode, null); assert.equal(e.details.signal, 'SIGTERM'); reaped(e.details.pid);
  }));
});

test('pre-cancel never launches and removes no unrelated abort listener', async (t) => {
  const host = new NativeAnalysisHost(options());
  t.after(() => host.dispose());
  const controller = new AbortController(),
    marker = join(root, 'should-not-exist');
  const unrelated = () => {};
  controller.signal.addEventListener('abort', unrelated);
  controller.abort('cancel reason');
  await assert.rejects(
    host.run(request(['ready', marker], { signal: controller.signal })),
    errorCode('cancelled', (e) => {
      assert.equal(e.cause, 'cancel reason');
      assert.equal(e.details.pid, undefined);
    })
  );
  assert.deepEqual(getEventListeners(controller.signal, 'abort'), [unrelated]);
  assert.equal(host.activeCount, 0);
  await assert.rejects(access(marker));
});

test('abort registration failure settles ownership, including delegate-then-throw', async (t) => {
  for (const delegated of [false, true]) {
    const host = new NativeAnalysisHost(options());
    t.after(() => host.dispose());
    const controller = new AbortController(),
      signal = controller.signal;
    const add = signal.addEventListener,
      unrelated = () => {},
      cause = new Error('registration');
    add.call(signal, 'abort', unrelated);
    signal.addEventListener = function (...args) {
      if (delegated) add.apply(this, args);
      throw cause;
    };
    for (let i = 0; i < 2; ++i) {
      await assert.rejects(
        host.run(request(['echo'], { signal })),
        errorCode('invalid_request', (e) => {
          assert.equal(e.cause, cause);
          assert.equal(e.details.pid, undefined);
        })
      );
      assert.equal(host.activeCount, 0);
      assert.deepEqual(getEventListeners(signal, 'abort'), [unrelated]);
    }
    assert.deepEqual((await host.run(request(['echo']))).payload.args, []);
    await host.dispose();
  }
});

test('registration reentry cannot spawn after stop and releases late listeners', async () => {
  const spawn = childProcess.spawn,
    closes = [];
  childProcess.spawn = (...args) => {
    const child = spawn(...args);
    closes.push(new Promise((resolve) => child.once('close', resolve)));
    return child;
  };
  syncBuiltinESMExports();
  try {
    for (const mode of ['dispose-before', 'dispose-after', 'dispose-throw', 'abort']) {
      const host = new NativeAnalysisHost(options()),
        controller = new AbortController();
      const signal = controller.signal,
        add = signal.addEventListener;
      let disposal;
      signal.addEventListener = function (...args) {
        if (mode !== 'dispose-before') add.apply(this, args);
        if (mode === 'abort') controller.abort('registration abort');
        else disposal = host.dispose();
        if (mode === 'dispose-before') add.apply(this, args);
        if (mode === 'dispose-throw') throw new Error('later registration error');
      };
      try {
        await assert.rejects(host.run(request(['echo'], { signal })), errorCode('cancelled'));
        await disposal;
        assert.equal(closes.length, 0);
        assert.equal(host.activeCount, 0);
        assert.equal(getEventListeners(signal, 'abort').length, 0);
      } finally {
        await host.dispose();
      }
    }
  } finally {
    childProcess.spawn = spawn;
    syncBuiltinESMExports();
    await Promise.all(closes);
  }
});

test('listener removal wrappers cannot strand a closed child or override first cancellation', async (t) => {
  for (const cancelled of [false, true]) {
    const host = new NativeAnalysisHost(options());
    t.after(() => host.dispose());
    const controller = new AbortController(),
      signal = controller.signal,
      cause = new Error('removal');
    const unrelated = () => {};
    signal.addEventListener('abort', unrelated);
    signal.removeEventListener = () => {
      throw cause;
    };
    const result = host.run(
      request(cancelled ? ['ready'] : ['echo'], {
        signal,
        ...(cancelled ? { onStderr: () => controller.abort('first reason') } : {})
      })
    );
    await assert.rejects(
      result,
      errorCode(cancelled ? 'cancelled' : 'invalid_request', (e) => {
        assert.equal(e.cause, cancelled ? 'first reason' : cause);
        reaped(e.details.pid);
      })
    );
    assert.equal(host.activeCount, 0);
    assert.deepEqual(getEventListeners(signal, 'abort'), [unrelated]);
    await host.dispose();
  }
});

test('ready-driven abort escalates ignored TERM, reaps before rejecting, first reason wins', async (t) => {
  const host = new NativeAnalysisHost(options({ maxStderrBytes: 128 })); t.after(() => host.dispose());
  const controller = new AbortController(), ready = readiness();
  const cause = new Error('user cancelled');
  const result = host.run(request(['ready'], { signal: controller.signal, onStderr: (chunk) => {
    ready.onStderr(chunk); controller.abort(cause); throw new Error('later callback error');
  } }));
  // Observe rejection before awaiting a readiness promise to avoid unhandled failures.
  const checked = assert.rejects(result, errorCode('cancelled', (e) => {
    assert.equal(e.cause, cause); assert.equal(e.details.signal, 'SIGKILL'); reaped(e.details.pid);
  }));
  await ready.promise; await checked;
  assert.equal(host.activeCount, 0); assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('timeout reaps its child with bounded captured bytes', async (t) => {
  const host = new NativeAnalysisHost(options({ timeoutMs: 300 })); t.after(() => host.dispose());
  await assert.rejects(host.run(request(['ready'])), errorCode('timeout', (e) => {
    reaped(e.details.pid); assert.ok(e.details.stderr.byteLength <= 1048576);
  }));
  assert.equal(host.activeCount, 0);
});

test('an earlier abort listener cannot suppress owned cancellation', async (t) => {
  const host = new NativeAnalysisHost(options()); t.after(() => host.dispose());
  const controller = new AbortController(), ready = readiness();
  const blocker = (event) => event.stopImmediatePropagation();
  controller.signal.addEventListener('abort', blocker);
  const result = host.run(request(['ready'], { signal: controller.signal, onStderr: ready.onStderr }));
  const checked = assert.rejects(result, errorCode('cancelled', (e) => reaped(e.details.pid)));
  await ready.promise; controller.abort(); await checked;
  assert.deepEqual(getEventListeners(controller.signal, 'abort'), [blocker]);
  assert.equal(host.activeCount, 0);
});

test('both output limits retain exact prefix and terminate', async (t) => {
  for (const stream of ['stdout', 'stderr']) {
    const host = new NativeAnalysisHost(options({ maxStdoutBytes: 32, maxStderrBytes: 32 })); t.after(() => host.dispose());
    await assert.rejects(host.run(request(['overflow', stream])), errorCode('output_limit', (e) => {
      assert.deepEqual(Buffer.from(e.details[stream]), Buffer.alloc(32, 120)); reaped(e.details.pid);
    }));
    assert.equal(host.activeCount, 0);
  }
  const exact = new NativeAnalysisHost(options({ maxStdoutBytes: 2 })); t.after(() => exact.dispose());
  assert.deepEqual((await exact.run(request(['bytes', '7b7d']))).payload, {});
});

test('stderr callback receives a copy; callback failures retain cause and reap', async (t) => {
  const host = new NativeAnalysisHost(options()); t.after(() => host.dispose());
  const result = await host.run(request(['log'], { onStderr: (chunk) => chunk.fill(0) }));
  assert.equal(Buffer.from(result.stderr).toString(), 'retained log');
  const cause = new Error('consumer failed');
  await assert.rejects(host.run(request(['ready'], { onStderr: () => { throw cause; } })), errorCode('callback_failed', (e) => {
    assert.equal(e.cause, cause); reaped(e.details.pid);
  }));
  await assert.rejects(host.run(request(['ready'], { onStderr: async () => { throw cause; } })), errorCode('callback_failed', (e) => {
    assert.match(e.cause.message, /synchronous/); reaped(e.details.pid);
  }));
});

test('cancelling one concurrent job leaves the other runnable', async (t) => {
  const host = new NativeAnalysisHost(options()); t.after(() => host.dispose());
  const controller = new AbortController(), a = readiness(), b = readiness();
  const first = host.run(request(['ready'], { signal: controller.signal, onStderr: a.onStderr }));
  const rejected = assert.rejects(first, errorCode('cancelled', (e) => reaped(e.details.pid)));
  const second = host.run(request(['ready'], { onStderr: b.onStderr }));
  const [pidA, pidB] = await Promise.all([a.promise, b.promise]);
  assert.equal(host.activeCount, 2); controller.abort(); await rejected;
  reaped(pidA); assert.equal(host.activeCount, 1); process.kill(pidB, 'SIGUSR2');
  assert.equal((await second).payload.released, true); reaped(pidB); assert.equal(host.activeCount, 0);
});

test('dispose cancels all jobs, is idempotent, and prohibits later starts', async () => {
  const host = new NativeAnalysisHost(options()), ready = [readiness(), readiness()];
  const results = ready.map((r) => host.run(request(['ready'], { onStderr: r.onStderr })));
  const rejections = results.map((p) => assert.rejects(p, errorCode('cancelled', (e) => reaped(e.details.pid))));
  const pids = await Promise.all(ready.map((r) => r.promise));
  const disposal = host.dispose(); assert.equal(disposal, host.dispose()); assert.equal(host.disposed, true);
  await assert.rejects(host.run(request(['echo'])), errorCode('disposed'));
  await disposal; await Promise.all(rejections); assert.equal(host.activeCount, 0); pids.forEach(reaped);
});

test('callback and request getter can reenter disposal without orphaning work', async () => {
  const host = new NativeAnalysisHost(options());
  let disposal;
  await assert.rejects(host.run(request(['ready'], { onStderr: () => { disposal = host.dispose(); } })), errorCode('cancelled'));
  await disposal; assert.equal(host.activeCount, 0);
  const other = new NativeAnalysisHost(options());
  await assert.rejects(other.run({ get tool() { other.dispose(); return 'dft-wrapper'; }, args: ['echo'] }), errorCode('disposed'));
  assert.equal(other.activeCount, 0); await other.dispose();
});

test('normal completion removes owned abort listener and later abort is inert', async (t) => {
  const host = new NativeAnalysisHost(options()); t.after(() => host.dispose());
  const controller = new AbortController(), other = () => {};
  controller.signal.addEventListener('abort', other);
  const result = await host.run(request(['echo'], { signal: controller.signal }));
  assert.deepEqual(getEventListeners(controller.signal, 'abort'), [other]);
  controller.abort(); assert.equal(result.exitCode, 0); assert.equal(host.activeCount, 0);
});
