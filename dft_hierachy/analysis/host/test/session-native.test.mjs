import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { NativeAnalysisSession, NativeAnalysisSessionError } from '../index.mjs';
import { AnalysisReportReader } from '../reports.mjs';

const binaryDirectory = process.env.NATIVE_ANALYSIS_BIN;
const data = process.env.NATIVE_ANALYSIS_DATA;
const evidence = process.env.NATIVE_ANALYSIS_SESSION_EVIDENCE;
let cwd, session, reader, lastValidated;
let reportReads = 0,
  sourceReads = 0;
const calls = [];
before(async () => {
  assert.ok(binaryDirectory && data, 'Provide real native binaries and original installed data');
  cwd = evidence
    ? resolve(evidence, 'inputs')
    : mkdtempSync(join(tmpdir(), 'analysis-session-native-'));
  mkdirSync(join(cwd, 'includes'), { recursive: true });
  mkdirSync(join(cwd, 'lists'), { recursive: true });
  writeFileSync(join(cwd, 'includes/range.svh'), '`define SESSION_RANGE (`SESSION_WIDTH-1):0\n');
  writeFileSync(
    join(cwd, 'design 中文.sv'),
    '`include "range.svh"\n' +
      `
module example_ram(input CLK, input [2:0] A, input [7:0] D, output [7:0] Q);
assign Q = D;
endmodule
module session_chip(input logic clk, r, d, input [2:0] a, input [7:0] din,
output logic [\`SESSION_RANGE] qa, qb, output [7:0] memq);
always_ff @(posedge clk or negedge r) if(!r) qa <= 0; else qa <= {\`SESSION_WIDTH{d}};
always_ff @(posedge clk or posedge r) if(r) qb <= 0; else qb <= {\`SESSION_WIDTH{d}};
example_ram m0(clk, a, din, memq);
endmodule\n`
  );
  // Native filelists require quoting a path with spaces. f resolves from cwd, F from its own file.
  writeFileSync(join(cwd, 'cwd.f'), '"design 中文.sv"\n');
  writeFileSync(join(cwd, 'lists/relative.f'), '"../design 中文.sv"\n');
  const chain = {
    formatVersion: 1,
    kind: 'wrapper-config',
    mode: 'chains',
    boundary: { scope: 'session_chip', ports: ['qa', 'qb'] },
    chaining: { chains: [{ name: 'scan', capacity: 16 }], defaultChain: 'scan' }
  };
  writeFileSync(join(cwd, 'chains.json'), JSON.stringify(chain));
  writeFileSync(
    join(cwd, 'excluded.json'),
    JSON.stringify({
      ...chain,
      planning: { rules: [{ port: 'qb', direction: 'output', action: 'exclude' }] }
    })
  );
  const timing = JSON.parse(readFileSync(join(data, 'examples/memory-test.json')));
  timing.rules[0].path = ['session_chip'];
  writeFileSync(join(cwd, 'memory-test.json'), JSON.stringify(timing));
  session = new NativeAnalysisSession({ binaryDirectory, timeoutMs: 30000 });
  reader = await AnalysisReportReader.open({ schemaDirectory: join(data, 'schemas') });
});
after(async () => {
  await session?.dispose();
  if (!evidence && cwd) rmSync(cwd, { recursive: true, force: true });
  if (evidence)
    writeFileSync(
      join(evidence, 'reader-checks.json'),
      JSON.stringify({ reportReads, sourceReads })
    );
});

const design = (selection) => ({
  designId: 'shared-project',
  cwd,
  top: 'session_chip',
  includeDirs: ['includes'],
  defines: ['SESSION_WIDTH=3'],
  ...selection
});
const options = (configuration = 'chains.json') => [
  [
    'dft-seqcheck',
    ['--scope', 'session_chip', '--recursive', '--require-complete'],
    'urn:dft-studio:analysis:sequential:1'
  ],
  [
    'dft-objects',
    [
      '--scope',
      'session_chip',
      '--recursive',
      '--kind',
      'port',
      '--text',
      '.qa',
      '--require-complete'
    ],
    'urn:dft-studio:analysis:object-catalog:1'
  ],
  [
    'dft-memory',
    [
      '--scope',
      'session_chip',
      '--recursive',
      '--memory-library',
      join(data, 'examples/memory-library.json'),
      '--plan-tests',
      '--schedule-tests',
      '--time-tests',
      '--test-config',
      join(cwd, 'memory-test.json'),
      '--require-complete'
    ],
    'urn:dft-studio:analysis:memory-test-timing:1'
  ],
  [
    'dft-wrapper',
    ['--config', join(cwd, configuration), '--explain-chains', '--require-complete'],
    'urn:dft-studio:analysis:wrapper-chain-explanation:1'
  ]
];
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'snapshotId' && key !== 'openedAt')
        .map(([key, child]) => [key, normalize(child)])
    );
  return value;
}
function snapshots(value) {
  if (value && typeof value === 'object') {
    if (value.snapshotId && value.inputHash) return [value];
    return Object.values(value).flatMap(snapshots);
  }
  return [];
}
function save(label, argv, result, schema) {
  const n = calls.length;
  calls.push({ label, argv, cwd, exitCode: result.exitCode, ...(schema ? { schema } : {}) });
  if (evidence) {
    writeFileSync(join(evidence, `${n}.stdout`), result.stdout);
    writeFileSync(join(evidence, `${n}.stderr`), result.stderr);
    writeFileSync(join(evidence, 'commands.json'), JSON.stringify(calls, null, 2));
  }
}
async function compare(tool, args, schema, exitCode = 0, format = 'json') {
  const binding = session.binding;
  const receipt = await session.run({ tool, args, format });
  const argv = [join(binaryDirectory, tool), ...binding.args, ...args];
  save('session', argv, receipt.result, schema);
  const original = spawnSync(argv[0], argv.slice(1), {
    cwd,
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024
  });
  save('direct', argv, { ...original, exitCode: original.status }, schema);
  assert.equal(original.error, undefined);
  assert.equal(original.status, exitCode, original.stdout.toString());
  assert.equal(receipt.result.exitCode, exitCode);
  assert.equal(receipt.binding, binding);
  assert.deepEqual(receipt.request.args, argv.slice(1));
  assert.equal(session.isCurrent(receipt), true);
  assert.deepEqual(Buffer.from(receipt.result.stderr), original.stderr);
  if (format === 'json') {
    const validated = reader.read(session, receipt, schema);
    ++reportReads;
    assert.equal(validated.exitCode, exitCode);
    if (validated.locations.length) {
      const excerpt = await reader.readSource(validated, 0, { contextLines: 1 });
      const span = validated.locations[0].span;
      const bytes = readFileSync(span.path);
      assert.equal(
        excerpt.text.slice(excerpt.selection.start, excerpt.selection.end),
        bytes.subarray(span.start.offset, span.end.offset).toString('utf8')
      );
      assert.equal(excerpt.contentHash, span.contentHash);
      ++sourceReads;
    }
    lastValidated = validated;
  } else
    assert.throws(
      () => reader.read(session, receipt, 'urn:dft-studio:analysis:wrapper-chain-explanation:1'),
      { code: 'json_required' }
    );
  if (format === 'json')
    assert.deepEqual(normalize(receipt.result.payload), normalize(JSON.parse(original.stdout)));
  else
    assert.equal(
      receipt.result.payload.replace(/^Snapshot:.*$/gm, 'Snapshot: ID'),
      original.stdout.toString().replace(/^Snapshot:.*$/gm, 'Snapshot: ID')
    );
  return receipt;
}

test('all four real tools use common filelist/include/define inputs and reload invalidates results', async () => {
  let previous;
  for (const selection of [
    { filelists: [{ path: 'cwd.f', mode: 'f' }] },
    { filelists: [{ path: 'lists/relative.f', mode: 'F' }] },
    { files: ['design 中文.sv'] }
  ]) {
    const binding = await session.setDesign(design(selection));
    if (lastValidated) assert.equal(reader.isCurrent(lastValidated), false);
    if (previous) {
      assert.equal(session.isCurrent(previous), false);
      assert.throws(() => session.assertCurrent(previous), NativeAnalysisSessionError);
    }
    const receipts = [];
    for (const [tool, args, schema] of options()) receipts.push(await compare(tool, args, schema));
    assert.equal(
      receipts[0].result.payload.registers.length,
      2 * 3,
      'two declared 3-bit state outputs'
    );
    assert.equal(receipts[1].result.payload.objects.length, 1);
    assert.equal(receipts[1].result.payload.objects[0].port.width, 3);
    assert.equal(receipts[2].result.payload.timeline.timedInstances, 1);
    assert.equal(receipts[2].result.payload.timeline.durationPicoseconds, 16000);
    assert.equal(receipts[3].result.payload.explanation.counts.conflict, 1);
    const hashes = receipts.flatMap((r) => snapshots(r.result.payload).map((s) => s.inputHash));
    assert.ok(hashes.length >= 4);
    assert.equal(new Set(hashes).size, 1, 'one design digest across all four tools');
    assert.ok(receipts.every((r) => r.binding === binding));
    previous = receipts[0];
  }
  const [tool, args, schema] = options('excluded.json')[3];
  const fixed = await compare(tool, args, schema);
  assert.equal(fixed.result.payload.explanation.counts.compatible, 1);
  const original = options()[3];
  await compare(original[0], [...original[1], '--format', 'text'], undefined, 0, 'text');
  await compare(original[0], [...original[1], '--max-explain-work', '1'], original[2], 4);
  const old = fixed.binding;
  await session.setDesign(design({ files: ['design 中文.sv'], defines: ['SESSION_WIDTH=2'] }));
  assert.notEqual(session.binding.generation, old.generation);
  assert.equal(session.isCurrent(fixed), false);
  const changed = await compare(...options()[0]);
  assert.equal(
    changed.result.payload.registers.length,
    2 * 2,
    'reloaded define changes the actual state width'
  );
  assert.notEqual(
    snapshots(changed.result.payload)[0].inputHash,
    snapshots(previous.result.payload)[0].inputHash
  );
  await session.setDesign(null);
  assert.equal(session.isCurrent(changed), false);
  assert.equal(session.state, 'empty');
});

test('original four-tool parameter errors pass the selected original error schemas', async () => {
  await session.setDesign(design({ files: ['design 中文.sv'] }));
  for (const [tool, , schema] of options()) {
    const call = await compare(tool, ['--unknown-reader-boundary-test'], schema, 2);
    assert.equal(call.result.kind, 'backend_error');
  }
});
