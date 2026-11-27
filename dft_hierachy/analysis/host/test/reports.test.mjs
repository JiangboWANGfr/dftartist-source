import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  copyFile,
  realpath,
  rm,
  rename,
  symlink,
  open
} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { NativeAnalysisSession, NativeAnalysisSessionError } from '../index.mjs';
import { AnalysisReportReader, AnalysisReportError } from '../reports.mjs';

const analysisRoot = fileURLToPath(new URL('../../', import.meta.url));
const protocolSource = fileURLToPath(
  new URL('../../../protocol/schema/hier.schema.json', import.meta.url)
);
const sequentialId = 'urn:dft-studio:analysis:sequential:1';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sourceText =
  '\ufeff// 🧪 source\r\nmodule example;\r\n  // café 中文\r\n  assign y = "😀";\r\nendmodule\r\n';
const selected = 'assign y = "😀";';
let root,
  binaryDirectory,
  schemas,
  reader,
  session,
  original,
  sourcePath,
  fixturePath,
  serial = 0;

async function copySchemas(from, to) {
  await mkdir(to, { recursive: true });
  for (const item of await readdir(from, { withFileTypes: true })) {
    if (item.name === 'packaging') continue;
    if (item.isDirectory()) await copySchemas(join(from, item.name), join(to, item.name));
    else if (item.name.endsWith('.schema.json'))
      await copyFile(join(from, item.name), join(to, item.name));
  }
}
before(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'analysis-reports-')));
  binaryDirectory = join(root, 'bin');
  schemas = join(root, 'schemas');
  await mkdir(binaryDirectory);
  if (process.env.NATIVE_ANALYSIS_TEST_SCHEMAS) {
    await copySchemas(process.env.NATIVE_ANALYSIS_TEST_SCHEMAS, schemas);
  } else {
    for (const family of ['sequential', 'objects', 'memory', 'wrapper'])
      await copySchemas(join(analysisRoot, family), join(schemas, family));
    await mkdir(join(schemas, 'protocol'));
    await copyFile(protocolSource, join(schemas, 'protocol/hier.schema.json'));
  }
  for (const tool of ['dft-seqcheck', 'dft-wrapper', 'dft-objects', 'dft-memory'])
    await writeFile(
      join(binaryDirectory, tool),
      `#!${process.execPath}\nimport { main } from ${JSON.stringify(new URL('./reports-fixture.mjs', import.meta.url).href)};main();\n`,
      { mode: 0o755 }
    );
  original = JSON.parse(
    await readFile(new URL('./fixtures/sequential-report.json', import.meta.url), 'utf8')
  );
  reader = await AnalysisReportReader.open({ schemaDirectory: schemas });
  session = new NativeAnalysisSession({ binaryDirectory, maxStdoutBytes: 32 * 1024 ** 2 });
  sourcePath = join(root, 'source 中文.sv');
  fixturePath = join(root, 'report.json');
  await reset();
});
after(async () => {
  await session?.dispose();
  if (root) await rm(root, { recursive: true, force: true });
});

function errorCode(code) {
  return (e) => {
    assert.ok(e instanceof AnalysisReportError);
    assert.equal(e.code, code);
    return true;
  };
}
function spanFor(text = sourceText) {
  const bytes = Buffer.from(text),
    start = bytes.indexOf(selected);
  return {
    file: 'f:0',
    path: sourcePath,
    contentHash: sha(bytes),
    start: { offset: start, line: 4, column: 3 },
    end: {
      offset: start + Buffer.byteLength(selected),
      line: 4,
      column: 3 + Buffer.byteLength(selected)
    }
  };
}
async function reset(value = original, span = spanFor()) {
  await writeFile(sourcePath, sourceText);
  const payload = structuredClone(value);
  if (payload.registers) for (const row of payload.registers) row.source = structuredClone(span);
  await writeFile(fixturePath, JSON.stringify(payload));
  await session.setDesign({
    designId: 'reader-test',
    cwd: root,
    top: 'sequential_example',
    files: [sourcePath]
  });
  return payload;
}
async function receipt(extra = {}) {
  return session.run({ tool: 'dft-seqcheck', args: ['--report-fixture', fixturePath], ...extra });
}
async function report() {
  return reader.read(session, await receipt(), sequentialId);
}

test('original complete registry is offline and read-only', () => {
  assert.equal(reader.schemaIds.length, 65);
  assert.ok(reader.schemaIds.includes(sequentialId));
  assert.ok(Object.isFrozen(reader.schemaIds));
  assert.throws(() => new AnalysisReportReader(), errorCode('invalid_request'));
});

test('reader validates owned raw bytes, not a mutable parsed payload alias', async () => {
  await reset();
  const call = await receipt();
  call.result.payload.algorithm = 'changed by consumer';
  const value = reader.read(session, call, sequentialId);
  assert.equal(value.payload.algorithm, original.algorithm);
  assert.equal(value.sha256, sha(call.result.stdout));
  assert.equal(value.locations[0].pointer, '/registers/0/source');
  assert.equal(value.locations.length, 2);
  assert.ok(Object.isFrozen(value.payload.registers[0].source.start));
  assert.throws(() => {
    value.payload.algorithm = 'mutated';
  });
  call.result.stdout.fill(32);
  assert.equal(value.payload.algorithm, original.algorithm);
  assert.equal(reader.isCurrent(value), true);
  assert.throws(() => reader.read(session, call, sequentialId), errorCode('report_invalid'));
});

test('saved reports have a distinct immutable historical brand and share original source verification', async () => {
  await reset();
  const live = await receipt();
  const input = {
    tool: live.result.tool,
    kind: live.result.kind,
    exitCode: live.result.exitCode,
    stdout: Buffer.from(live.result.stdout)
  };
  const saved = reader.readSaved(input, sequentialId);
  input.stdout.fill(32);
  assert.equal(saved.historical, true);
  assert.equal(saved.freshness, 'unknown');
  assert.equal(Object.hasOwn(saved, 'binding'), false);
  assert.equal(reader.isCurrent(saved), false);
  assert.throws(() => reader.assertCurrent(saved), errorCode('stale_result'));
  await assert.rejects(reader.readSource(saved, 0), errorCode('stale_result'));
  await assert.rejects(
    reader.readSavedSource(reader.read(session, live, sequentialId), 0),
    errorCode('stale_result')
  );
  await session.setDesign(null);
  const excerpt = await reader.readSavedSource(saved, 0, { contextLines: 1 });
  assert.equal(excerpt.text.slice(excerpt.selection.start, excerpt.selection.end), selected);
  assert.ok(Object.isFrozen(saved.payload.registers[0].source));
  await writeFile(sourcePath, 'changed');
  await assert.rejects(reader.readSavedSource(saved, 0), errorCode('source_changed'));
  const other = await AnalysisReportReader.open({ schemaDirectory: schemas });
  await assert.rejects(other.readSavedSource(saved, 0), errorCode('stale_result'));
  await assert.rejects(reader.readSavedSource({ ...saved }, 0), errorCode('stale_result'));
  await assert.rejects(
    reader.readSavedSource(saved, 0, { signal: AbortSignal.abort() }),
    errorCode('cancelled')
  );
});

test('saved output still requires original Schema, JSON bytes and exit/tool/version boundaries', async () => {
  await reset();
  const call = await receipt();
  const input = { tool: 'dft-seqcheck', kind: 'report', exitCode: 0, stdout: call.result.stdout };
  assert.throws(
    () => reader.readSaved({ ...input, stdout: '{}' }, sequentialId),
    errorCode('invalid_request')
  );
  assert.throws(
    () => reader.readSaved({ ...input, tool: '../tool' }, sequentialId),
    errorCode('invalid_request')
  );
  assert.throws(
    () =>
      reader.readSaved(
        {
          ...input,
          stdout: Buffer.from('{"formatVersion":1,"algorithm":"rtl-structural-control-v1"}')
        },
        sequentialId
      ),
    errorCode('not_report')
  );
  assert.throws(
    () => reader.readSaved({ ...input, exitCode: 2 }, sequentialId),
    errorCode('not_report')
  );
  assert.throws(
    () => reader.readSaved(input, 'urn:dft-studio:analysis:object-catalog:1'),
    errorCode('wrong_tool')
  );
  assert.throws(
    () => reader.readSaved({ ...input, stdout: Buffer.from([255]) }, sequentialId),
    errorCode('report_invalid')
  );
  const controller = new AbortController();
  controller.abort();
  const saved = reader.readSaved(input, sequentialId);
  await assert.rejects(
    reader.readSavedSource(saved, 0, { signal: controller.signal }),
    errorCode('cancelled')
  );
  await assert.rejects(reader.readSavedSource(saved, -1), errorCode('invalid_request'));
});

test('schema/tool/JSON/envelope violations fail without coercion or defaults', async () => {
  await reset();
  const call = await receipt();
  assert.throws(() => reader.read(session, call, 'urn:unknown'), errorCode('unknown_schema'));
  assert.throws(
    () => reader.read(session, call, 'urn:dft-studio:analysis:object-catalog:1'),
    errorCode('wrong_tool')
  );
  await writeFile(fixturePath, 'readable text');
  const text = await receipt({ tool: 'dft-wrapper', format: 'text' });
  assert.throws(
    () => reader.read(session, text, 'urn:dft-studio:analysis:wrapper-chain-explanation:1'),
    errorCode('json_required')
  );
});

test('schema rejects invalid business shapes and version output stays distinct', async () => {
  const missing = structuredClone(original);
  delete missing.registers;
  await reset(missing);
  const bad = await receipt();
  assert.throws(() => reader.read(session, bad, sequentialId), errorCode('report_invalid'));
  const stringNumber = structuredClone(original);
  stringNumber.visitedInstances = '2';
  await reset(stringNumber);
  const typed = await receipt();
  assert.throws(() => reader.read(session, typed, sequentialId), errorCode('report_invalid'));
  await writeFile(fixturePath, '{"tool":"dft-seqcheck","version":"fixture"}');
  const version = await receipt();
  assert.throws(() => reader.read(session, version, sequentialId), errorCode('not_report'));
  await writeFile(fixturePath, JSON.stringify({ formatVersion: 1, algorithm: original.algorithm }));
  const nativeVersion = await receipt();
  assert.throws(() => reader.read(session, nativeVersion, sequentialId), errorCode('not_report'));
});

test('partial/check-failure exits and backend errors retain exact status', async () => {
  for (const code of [0, 1, 4]) {
    await reset();
    const call = await receipt({
      args: ['--report-fixture', fixturePath, '--fixture-exit', String(code)]
    });
    assert.equal(reader.read(session, call, sequentialId).exitCode, code);
  }
  for (const code of [2, 3, 5, 130]) {
    await writeFile(
      fixturePath,
      '{"error":{"code":"invalid_arguments","message":"controlled error"}}'
    );
    const call = await receipt({
      args: ['--report-fixture', fixturePath, '--fixture-exit', String(code)]
    });
    const value = reader.read(session, call, sequentialId);
    assert.equal(value.kind, 'backend_error');
    assert.equal(value.exitCode, code);
    assert.deepEqual(value.locations, []);
  }
});

test('UTF8/CRLF/BOM excerpt uses original byte offsets and UTF16 selection', async () => {
  await reset();
  const value = await report();
  const excerpt = await reader.readSource(value, 0, { contextLines: 1 });
  assert.equal(excerpt.firstLine, 3);
  assert.equal(excerpt.lastLine, 5);
  assert.equal(excerpt.text, '  // café 中文\r\n  assign y = "😀";\r\nendmodule\r\n');
  assert.equal(excerpt.text.slice(excerpt.selection.start, excerpt.selection.end), selected);
  assert.equal(excerpt.selection.unit, 'utf16');
  assert.equal(excerpt.contentHash, sha(Buffer.from(sourceText)));
  assert.equal((await reader.readSource(value, 0, { contextLines: 3 })).text, sourceText);
  assert.ok(Object.isFrozen(excerpt.selection));
});

test('line starts are disjoint while exclusive ends, blank lines and EOF remain readable', async () => {
  for (const newline of ['\n', '\r\n']) {
    const text = `a${newline}${newline}α😀${newline}`,
      bytes = Buffer.from(text);
    const blankStart = 1 + Buffer.byteLength(newline),
      thirdStart = blankStart + Buffer.byteLength(newline);
    async function value(start, startLine, end, endLine) {
      const span = {
        file: 'f:0',
        path: sourcePath,
        contentHash: sha(bytes),
        start: { offset: start, line: startLine, column: 1 },
        end: { offset: end, line: endLine, column: 1 }
      };
      await reset(original, span);
      await writeFile(sourcePath, bytes);
      return report();
    }
    for (const [offset, wrongLine] of [
      [blankStart, 1],
      [thirdStart, 2],
      [bytes.length, 3]
    ]) {
      const r = await value(offset, wrongLine, offset, wrongLine + 1);
      await assert.rejects(
        reader.readSource(r, 0, { contextLines: 0 }),
        errorCode('source_invalid')
      );
    }
    for (const [start, line, end, endLine, selectedText] of [
      [0, 1, blankStart, 1, `a${newline}`],
      [blankStart, 2, thirdStart, 2, newline],
      [thirdStart, 3, bytes.length, 3, `α😀${newline}`],
      [thirdStart, 3, bytes.length, 4, `α😀${newline}`],
      [bytes.length, 4, bytes.length, 4, '']
    ]) {
      const excerpt = await reader.readSource(await value(start, line, end, endLine), 0, {
        contextLines: 0
      });
      assert.equal(excerpt.firstLine, line);
      assert.equal(excerpt.lastLine, endLine);
      assert.equal(
        excerpt.text.slice(excerpt.selection.start, excerpt.selection.end),
        selectedText
      );
    }
  }
  for (const text of ['', 'α😀']) {
    const bytes = Buffer.from(text),
      offset = bytes.length;
    await reset(original, {
      file: 'f:0',
      path: sourcePath,
      contentHash: sha(bytes),
      start: { offset, line: 1, column: 1 },
      end: { offset, line: 1, column: 1 }
    });
    await writeFile(sourcePath, bytes);
    const excerpt = await reader.readSource(await report(), 0, { contextLines: 0 });
    assert.equal(excerpt.text, text);
    assert.equal(excerpt.selection.start, text.length);
    assert.equal(excerpt.selection.end, text.length);
  }
});

test('changed, oversized and non-file sources are explicit failures', async () => {
  await reset();
  const value = await report();
  await writeFile(sourcePath, sourceText + 'changed');
  await assert.rejects(reader.readSource(value, 0), errorCode('source_changed'));
  await writeFile(sourcePath, sourceText);
  await assert.rejects(reader.readSource(value, 0, { maxFileBytes: 1 }), errorCode('source_limit'));
  await assert.rejects(
    reader.readSource(value, 0, { maxExcerptBytes: 1 }),
    errorCode('source_limit')
  );
  await rm(sourcePath);
  await assert.rejects(reader.readSource(value, 0), errorCode('source_unavailable'));
  await mkdir(sourcePath);
  await assert.rejects(reader.readSource(value, 0), errorCode('source_unavailable'));
  await rm(sourcePath, { recursive: true });
  const fifo = spawnSync('mkfifo', [sourcePath]);
  assert.equal(fifo.status, 0);
  await assert.rejects(reader.readSource(value, 0), errorCode('source_unavailable'));
  await rm(sourcePath);
});

test('only current branded reports and their location indices can read files', async () => {
  await reset();
  const value = await report();
  const other = await AnalysisReportReader.open({ schemaDirectory: schemas });
  for (const fake of [null, {}, { ...value }]) {
    assert.equal(reader.isCurrent(fake), false);
    assert.throws(() => reader.assertCurrent(fake), errorCode('stale_result'));
  }
  await assert.rejects(other.readSource(value, 0), errorCode('stale_result'));
  for (const index of [-1, 2, 0.5, '0'])
    await assert.rejects(reader.readSource(value, index), errorCode('invalid_request'));
  await session.setDesign(null);
  assert.equal(reader.isCurrent(value), false);
  await assert.rejects(
    reader.readSource(value, 0),
    (e) => e instanceof NativeAnalysisSessionError && e.code === 'stale_result'
  );
});

test('pre-cancel and invalid source options do not turn into disk errors', async () => {
  await reset();
  const value = await report();
  await rm(sourcePath);
  const controller = new AbortController();
  controller.abort('stop');
  await assert.rejects(reader.readSource(value, 0, { signal: controller.signal }), (e) => {
    assert.equal(e.code, 'cancelled');
    assert.equal(e.cause, 'stop');
    return true;
  });
  for (const options of [
    { contextLines: -1 },
    { maxFileBytes: 0 },
    { maxExcerptBytes: Infinity },
    { signal: {} }
  ])
    await assert.rejects(reader.readSource(value, 0, options), errorCode('invalid_request'));
  await assert.rejects(
    reader.readSource(value, 0, {
      get contextLines() {
        throw new Error('caller getter');
      }
    }),
    errorCode('invalid_request')
  );
});

test('read checkpoints catch cancellation and design replacement, closing the real handle', async (t) => {
  await reset();
  const probe = await open(sourcePath);
  const prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const read = prototype.read;
  let observed, trigger;
  prototype.read = async function (...args) {
    const result = await read.apply(this, args);
    observed = this;
    trigger?.();
    trigger = undefined;
    return result;
  };
  t.after(() => {
    prototype.read = read;
  });
  const value = await report(),
    controller = new AbortController();
  trigger = () => controller.abort('during real read');
  await assert.rejects(
    reader.readSource(value, 0, { signal: controller.signal }),
    errorCode('cancelled')
  );
  assert.equal(observed.fd, -1);
  let replacing;
  trigger = () => {
    replacing = session.setDesign(null);
  };
  await assert.rejects(reader.readSource(value, 0), (e) => e.code === 'stale_result');
  assert.equal(observed.fd, -1);
  await replacing;
});

test('invalid source ranges and UTF8 boundaries never become editor selections', async () => {
  const valid = spanFor();
  for (const span of [
    { ...valid, start: { ...valid.start, line: 3 }, end: { ...valid.end, line: 3 } },
    { ...valid, end: { ...valid.end, offset: Buffer.byteLength(sourceText) + 1 } },
    { ...valid, start: { ...valid.start, line: 99 }, end: { ...valid.end, line: 99 } },
    { ...valid, start: { ...valid.start, offset: Buffer.from(sourceText).indexOf('😀') + 1 } }
  ]) {
    await reset(original, span);
    const value = await report();
    await assert.rejects(reader.readSource(value, 0), errorCode('source_invalid'));
  }
});

test('bounded traversal rejects deep reports before Schema evaluation', async () => {
  const value = structuredClone(original);
  let at = value;
  for (let i = 0; i < 130; i++) {
    at.extra = {};
    at = at.extra;
  }
  await reset(value);
  const call = await receipt();
  assert.throws(() => reader.read(session, call, sequentialId), errorCode('report_limit'));
});

test('matching-hash invalid UTF8 and invalid source paths are not displayable', async () => {
  const bytes = Buffer.from([255, 10]);
  const span = {
    ...spanFor(),
    contentHash: sha(bytes),
    start: { offset: 0, line: 1, column: 1 },
    end: { offset: 1, line: 1, column: 2 }
  };
  await reset(original, span);
  await writeFile(sourcePath, bytes);
  await assert.rejects(reader.readSource(await report(), 0), errorCode('source_invalid'));
  await reset(original, { ...spanFor(), path: 'relative.sv' });
  await assert.rejects(reader.readSource(await report(), 0), errorCode('source_invalid'));
});

test('registry errors include missing refs, duplicates, malformed bytes and links', async () => {
  for (const input of [undefined, {}, { schemaDirectory: '.' }])
    await assert.rejects(AnalysisReportReader.open(input), errorCode('invalid_request'));
  for (const kind of ['empty', 'missing', 'duplicate', 'bytes', 'link']) {
    const target = join(root, 'bad-' + ++serial);
    await mkdir(target);
    if (kind === 'missing')
      await writeFile(
        join(target, 'a.schema.json'),
        JSON.stringify({
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: 'urn:missing',
          $ref: 'urn:never-download'
        })
      );
    if (kind === 'duplicate')
      for (const name of ['a', 'b'])
        await writeFile(join(target, name + '.schema.json'), '{"$id":"urn:duplicate"}');
    if (kind === 'bytes') await writeFile(join(target, 'a.schema.json'), Buffer.from([255]));
    if (kind === 'link')
      await symlink(join(schemas, 'protocol/hier.schema.json'), join(target, 'a.schema.json'));
    await assert.rejects(
      AnalysisReportReader.open({ schemaDirectory: target }),
      errorCode('schema_invalid')
    );
  }
});
