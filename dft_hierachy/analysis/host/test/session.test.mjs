import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, realpath, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  NativeAnalysisHost,
  NativeAnalysisError,
  NativeAnalysisSession,
  NativeAnalysisSessionError
} from '../index.mjs';

let root, binaryDirectory;
before(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'analysis-session-test-')));
  binaryDirectory = join(root, '工具 bin');
  await mkdir(binaryDirectory);
  const fixture = new URL('./session-fixture.mjs', import.meta.url).href;
  for (const tool of ['dft-seqcheck', 'dft-objects', 'dft-memory', 'dft-wrapper'])
    await writeFile(
      join(binaryDirectory, tool),
      `#!${process.execPath}\nimport { main } from ${JSON.stringify(fixture)};main();\n`,
      { mode: 0o755 }
    );
});
after(() => rm(root, { recursive: true, force: true }));
const options = (extra = {}) => ({
  binaryDirectory,
  cwd: root,
  timeoutMs: 5000,
  killGraceMs: 20,
  ...extra
});
const design = (extra = {}) => ({
  designId: 'project.one',
  cwd: root,
  top: 'chip',
  files: ['rtl.sv'],
  ...extra
});
const request = (mode = 'echo', extra = {}) => ({
  tool: 'dft-objects',
  args: ['--session-test-mode', mode],
  ...extra
});
function errorCode(Type, code, check = () => {}) {
  return (error) => {
    assert.ok(error instanceof Type);
    assert.equal(error.code, code);
    check(error);
    return true;
  };
}
const sessionError = (code, check) => errorCode(NativeAnalysisSessionError, code, check);
const nativeError = (code, check) => errorCode(NativeAnalysisError, code, check);
function reaped(pid) {
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
}
function readiness() {
  let resolveReady,
    text = '';
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  return {
    ready,
    onStderr: (chunk) => {
      text += Buffer.from(chunk).toString();
      const match = text.match(/READY (\d+)\n/);
      if (match) resolveReady(Number(match[1]));
    }
  };
}

test('empty session and constructor errors do not start native work', async () => {
  for (const value of [
    undefined,
    null,
    {},
    options({ timeoutMs: 0 }),
    {
      get binaryDirectory() {
        throw new Error('getter');
      }
    }
  ])
    assert.throws(() => new NativeAnalysisSession(value), nativeError('invalid_request'));
  const s = new NativeAnalysisSession(options());
  assert.equal(s.state, 'empty');
  assert.equal(s.binding, null);
  assert.equal(s.activeCount, 0);
  await assert.rejects(s.run(request()), sessionError('no_design'));
  assert.equal(await s.setDesign(null), null);
  await s.dispose();
});

test('design/argv snapshots own and freeze shared f/F/includes/defines; calls cannot override cwd', async (t) => {
  const s = new NativeAnalysisSession(options());
  t.after(() => s.dispose());
  const input = design({
    files: ['rtl 中文.sv'],
    filelists: [
      { path: 'cwd.f', mode: 'f' },
      { path: 'relative/list.f', mode: 'F' }
    ],
    includeDirs: ['inc', '空 格'],
    defines: ['WIDTH=8', 'LABEL=😀']
  });
  const setting = s.setDesign(input);
  input.files.push('late.sv');
  input.filelists[0].path = 'changed.f';
  input.defines[0] = 'changed';
  const binding = await setting;
  const expected = [
    '--top',
    'chip',
    resolve(root, 'rtl 中文.sv'),
    '-f',
    resolve(root, 'cwd.f'),
    '-F',
    resolve(root, 'relative/list.f'),
    '-I',
    resolve(root, 'inc'),
    '-I',
    resolve(root, '空 格'),
    '-D',
    'WIDTH=8',
    '-D',
    'LABEL=😀'
  ];
  assert.deepEqual(binding.args, expected);
  assert.equal(s.binding, binding);
  assert.equal(s.state, 'ready');
  assert.ok(Object.isFrozen(binding.design.filelists[0]));
  assert.throws(() => binding.design.files.push('bad'));
  const args = ['--text', '--output', '--session-test-mode', 'echo'];
  const running = s.run(request('echo', { args }));
  args.push('late');
  const receipt = await running;
  assert.deepEqual(receipt.result.payload.args, [...expected, ...args.slice(0, -1)]);
  assert.equal(receipt.result.payload.cwd, root);
  assert.equal(s.isCurrent(receipt), true);
  assert.equal(s.assertCurrent(receipt), receipt);
  assert.ok(Object.isFrozen(receipt.request.args));
  assert.ok(Object.isFrozen(receipt.result));
  assert.throws(() => {
    receipt.binding = null;
  });
  reaped(receipt.result.pid);
  await assert.rejects(s.run(request('echo', { cwd: root })), sessionError('invalid_request'));
  assert.equal(s.activeCount, 0);
});

test('invalid input preserves the ready generation and valid completed receipts', async (t) => {
  const s = new NativeAnalysisSession(options());
  t.after(() => s.dispose());
  const binding = await s.setDesign(design()),
    receipt = await s.run(request());
  for (const input of [
    undefined,
    [],
    {},
    design({ designId: '' }),
    design({ cwd: '.' }),
    design({ top: '\ud800' }),
    design({ files: [] }),
    design({ files: [''] }),
    design({ files: new Array(1) }),
    design({ files: 'bad' }),
    design({ filelists: [{ path: 'a', mode: 'x' }] }),
    design({ filelists: [{}] }),
    design({ defines: ['bad\0macro'] })
  ]) {
    await assert.rejects(s.setDesign(input), sessionError('invalid_request'));
    assert.equal(s.binding, binding);
    assert.equal(s.isCurrent(receipt), true);
  }
});

test('brands reject forged, copied, primitive and other-session receipts', async (t) => {
  const a = new NativeAnalysisSession(options()),
    b = new NativeAnalysisSession(options());
  t.after(() => Promise.all([a.dispose(), b.dispose()]));
  await Promise.all([a.setDesign(design()), b.setDesign(design())]);
  const receipt = await a.run(request());
  assert.equal(a.isCurrent(receipt), true);
  assert.notEqual(a.binding.sessionId, b.binding.sessionId);
  for (const candidate of [null, undefined, 1, {}, { ...receipt }]) {
    assert.equal(a.isCurrent(candidate), false);
    assert.throws(() => a.assertCurrent(candidate), sessionError('stale_result'));
  }
  assert.equal(b.isCurrent(receipt), false);
  assert.throws(() => b.assertCurrent(receipt), sessionError('stale_result'));
});

test('equal-input reload changes generation; clear and dispose invalidate stored results', async () => {
  const s = new NativeAnalysisSession(options());
  const old = await s.setDesign(design()),
    receipt = await s.run(request());
  const next = await s.setDesign(design());
  assert.equal(old.sessionId, next.sessionId);
  assert.notEqual(old.generation, next.generation);
  assert.equal(s.isCurrent(receipt), false);
  assert.throws(() => s.assertCurrent(receipt), sessionError('stale_result'));
  const current = await s.run(request());
  await s.setDesign(null);
  assert.equal(s.state, 'empty');
  assert.equal(s.binding, null);
  assert.equal(s.isCurrent(current), false);
  await assert.rejects(s.run(request()), sessionError('no_design'));
  await s.setDesign(design());
  const last = await s.run(request());
  const close = s.dispose();
  assert.equal(close, s.dispose());
  assert.equal(s.state, 'disposed');
  assert.equal(s.isCurrent(last), false);
  await close;
  await assert.rejects(s.setDesign(design()), sessionError('disposed'));
  await assert.rejects(s.run(request()), sessionError('disposed'));
});

test('replace drains all old children before activating the new design', async (t) => {
  const s = new NativeAnalysisSession(options());
  t.after(() => s.dispose());
  const old = await s.setDesign(design());
  const ready = [readiness(), readiness()];
  const results = ready.map((r) => s.run(request('ready', { onStderr: r.onStderr })));
  const rejected = results.map((p) =>
    assert.rejects(
      p,
      sessionError('stale_result', (e) => {
        assert.equal(e.binding, old);
        assert.equal(e.cause.code, 'cancelled');
        reaped(e.cause.details.pid);
      })
    )
  );
  const pids = await Promise.all(ready.map((r) => r.ready));
  assert.equal(s.activeCount, 2);
  const replacing = s.setDesign(design({ designId: 'next', top: 'new_chip' }));
  assert.equal(s.state, 'replacing');
  assert.equal(s.binding, null);
  assert.equal(s.activeCount, 2);
  await assert.rejects(s.run(request()), sessionError('replacing'));
  await assert.rejects(s.setDesign(design()), sessionError('replacing'));
  const next = await replacing;
  pids.forEach(reaped);
  await Promise.all(rejected);
  assert.equal(s.activeCount, 0);
  assert.equal(next.design.designId, 'next');
  assert.equal(s.state, 'ready');
  assert.equal((await s.run(request())).binding, next);
});

test('current-task abort is independent; remaining work is cancelled by design replacement', async (t) => {
  const s = new NativeAnalysisSession(options());
  t.after(() => s.dispose());
  await s.setDesign(design());
  const a = readiness(),
    b = readiness(),
    controller = new AbortController();
  const first = s.run(request('ready', { signal: controller.signal, onStderr: a.onStderr }));
  const checked = assert.rejects(
    first,
    nativeError('cancelled', (e) => reaped(e.details.pid))
  );
  const second = s.run(request('ready', { onStderr: b.onStderr }));
  const cancelled = assert.rejects(
    second,
    sessionError('stale_result', (e) => reaped(e.cause.details.pid))
  );
  const pids = await Promise.all([a.ready, b.ready]);
  controller.abort();
  await checked;
  assert.equal(s.activeCount, 1);
  assert.equal(s.state, 'ready');
  await s.setDesign(design());
  await cancelled;
  pids.forEach(reaped);
});

test('close during replacement waits for close and never activates a new host', async () => {
  const s = new NativeAnalysisSession(options());
  await s.setDesign(design());
  const ready = readiness();
  const running = s.run(request('ready', { onStderr: ready.onStderr }));
  const checked = assert.rejects(running, sessionError('stale_result'));
  const pid = await ready.ready;
  const replacement = s.setDesign(design({ designId: 'pending' }));
  const rejected = assert.rejects(replacement, sessionError('disposed'));
  const closing = s.dispose();
  assert.equal(closing, s.dispose());
  assert.equal(s.binding, null);
  await closing;
  await rejected;
  await checked;
  reaped(pid);
  assert.equal(s.activeCount, 0);
  assert.equal(s.state, 'disposed');
});

test('a closed native success cannot cross an intervening design replacement', async (t) => {
  const s = new NativeAnalysisSession(options());
  t.after(() => s.dispose());
  const old = await s.setDesign(design());
  const original = NativeAnalysisHost.prototype.run;
  let observed;
  // Wrap the actual public Host result to place replacement precisely between native close and session publication.
  NativeAnalysisHost.prototype.run = function (input) {
    return original.call(this, input).then(async (result) => {
      observed = result;
      reaped(result.pid);
      await s.setDesign(design({ designId: 'after-close' }));
      return result;
    });
  };
  t.after(() => {
    NativeAnalysisHost.prototype.run = original;
  });
  await assert.rejects(
    s.run(request()),
    sessionError('stale_result', (e) => {
      assert.equal(e.binding, old);
      assert.equal(e.result, observed);
      assert.equal(e.result.exitCode, 0);
    })
  );
  assert.equal(s.binding.design.designId, 'after-close');
  assert.equal(s.activeCount, 0);
});

test('reentrant design/request getters and stderr disposal cannot orphan native work', async () => {
  const s = new NativeAnalysisSession(options());
  await s.setDesign(design());
  await assert.rejects(
    s.run({
      get tool() {
        s.dispose();
        return 'dft-objects';
      },
      args: []
    }),
    sessionError('stale_result')
  );
  await s.dispose();
  assert.equal(s.activeCount, 0);
  const a = new NativeAnalysisSession(options());
  await assert.rejects(
    a.setDesign({
      ...design(),
      get files() {
        a.dispose();
        return ['a.sv'];
      }
    }),
    sessionError('disposed')
  );
  await a.dispose();
  assert.equal(a.state, 'disposed');
  assert.equal(a.activeCount, 0);
  const b = new NativeAnalysisSession(options());
  await b.setDesign(design());
  await assert.rejects(
    b.run(
      request('ready', {
        onStderr: () => {
          void b.dispose();
        }
      })
    ),
    sessionError('stale_result', (e) => reaped(e.cause.details.pid))
  );
  await b.dispose();
  assert.equal(b.activeCount, 0);
});

test('current backend/UTF8/timeout/pre-cancel errors retain the original Host semantics', async (t) => {
  const s = new NativeAnalysisSession(options());
  t.after(() => s.dispose());
  const binding = await s.setDesign(design());
  const error = await s.run(request('exit2', { tool: 'dft-wrapper', format: 'text' }));
  assert.equal(error.result.kind, 'backend_error');
  assert.equal(error.result.format, 'json');
  assert.equal(error.result.exitCode, 2);
  assert.equal(s.isCurrent(error), true);
  await assert.rejects(s.run(request('bad-json')), nativeError('output_invalid'));
  const controller = new AbortController();
  controller.abort('already');
  await assert.rejects(
    s.run(request('ready', { signal: controller.signal })),
    nativeError('cancelled', (e) => assert.equal(e.details.pid, undefined))
  );
  assert.equal(s.binding, binding);
  assert.equal(s.activeCount, 0);
  const timed = new NativeAnalysisSession(options({ timeoutMs: 250 }));
  t.after(() => timed.dispose());
  await timed.setDesign(design());
  await assert.rejects(
    timed.run(request('ready')),
    nativeError('timeout', (e) => reaped(e.details.pid))
  );
  assert.equal(timed.state, 'ready');
  assert.equal(timed.activeCount, 0);
});

test('caller getters are read once, so cwd cannot change between validation and spawn', async (t) => {
  let optionReads = 0;
  const s = new NativeAnalysisSession({
    ...options(),
    get cwd() {
      optionReads++;
      return root;
    }
  });
  t.after(() => s.dispose());
  assert.equal(optionReads, 1);
  await s.setDesign(design());
  let cwdReads = 0,
    toolReads = 0;
  const receipt = await s.run({
    args: ['--session-test-mode', 'echo'],
    get tool() {
      toolReads++;
      return 'dft-objects';
    },
    get cwd() {
      cwdReads++;
      return cwdReads === 1 ? undefined : '/unintended';
    }
  });
  assert.equal(cwdReads, 1);
  assert.equal(toolReads, 1);
  assert.equal(receipt.request.cwd, root);
  assert.equal(receipt.result.payload.cwd, root);
});
