import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativeAnalysisHost } from '../index.mjs';

// Explicit opt-in: missing real binaries/data fail this suite; no skip or process substitutes.
const binaryDirectory = process.env.NATIVE_ANALYSIS_BIN;
const data = process.env.NATIVE_ANALYSIS_DATA;
const evidence = process.env.NATIVE_ANALYSIS_EVIDENCE;
let cwd, host;
const calls = [];
before(() => {
  assert.ok(binaryDirectory && data, 'Set NATIVE_ANALYSIS_BIN and NATIVE_ANALYSIS_DATA');
  cwd = mkdtempSync(join(tmpdir(), 'native-analysis-empty-cwd-'));
  if (evidence) mkdirSync(evidence, { recursive: true });
  host = new NativeAnalysisHost({ binaryDirectory, cwd, timeoutMs: 30000 });
});
after(async () => { await host?.dispose(); if (cwd) rmSync(cwd, { recursive: true, force: true }); });

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'snapshotId' && key !== 'openedAt').map(([key, child]) => [key, normalize(child)]));
  return value;
}
function save(label, tool, args, result, schema) {
  const n = calls.length;
  calls.push({ label, argv: [join(binaryDirectory, tool), ...args], cwd, exitCode: result.exitCode,
    ...(schema ? { schema } : {}) });
  if (evidence) {
    writeFileSync(join(evidence, `${n}.stdout`), result.stdout);
    writeFileSync(join(evidence, `${n}.stderr`), result.stderr);
    writeFileSync(join(evidence, 'commands.json'), JSON.stringify(calls, null, 2));
  }
}
async function compare(tool, args, code, schema, format = 'json') {
  const direct = spawnSync(join(binaryDirectory, tool), args, { cwd, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(direct.error, undefined); assert.equal(direct.signal, null);
  save('direct', tool, args, { ...direct, exitCode: direct.status }, schema);
  assert.equal(direct.status, code, direct.stdout.toString());
  const result = await host.run({ tool, args, format });
  save('host', tool, args, result, schema);
  assert.equal(result.exitCode, direct.status); assert.equal(result.kind, [0, 1, 4].includes(code) ? 'report' : 'backend_error');
  assert.equal(result.format, code === 2 || code === 3 ? 'json' : format);
  assert.deepEqual(Buffer.from(result.stderr), direct.stderr);
  if (result.format === 'json') {
    assert.deepEqual(result.payload, JSON.parse(Buffer.from(result.stdout).toString()));
    assert.deepEqual(normalize(result.payload), normalize(JSON.parse(direct.stdout.toString())));
  } else {
    const text = (s) => s.replace(/^Snapshot:.*$/gm, 'Snapshot: <identity>');
    assert.equal(text(result.payload), text(direct.stdout.toString()));
    assert.equal(result.payload, Buffer.from(result.stdout).toString());
  }
  assert.equal(host.activeCount, 0);
  return result;
}

test('real four-tool reports, partials, check failure, text and constraint recheck', async () => {
  const examples = join(data, 'examples');
  const seq = ['--top', 'sequential_example', '--scope', 'sequential_example', '--recursive', join(examples, 'sequential.sv'), '--require-complete'];
  const mem = ['--top', 'memory_example', '--scope', 'memory_example', '--recursive', join(examples, 'memory.sv'), '--memory-library', join(examples, 'memory-library.json'), '--plan-tests', '--schedule-tests', '--time-tests', '--test-config', join(examples, 'memory-test.json'), '--require-complete'];
  const wrapper = ['--top', 'wrapper_example', join(examples, 'example.sv'), '--explain-chains', '--require-complete'];
  const original = [
    ['dft-seqcheck', [...seq, '--fail-on-error'], 'sequential:1'],
    ['dft-objects', [...seq, '--kind', 'port', '--text', '.q'], 'object-catalog:1'],
    ['dft-memory', mem, 'memory-test-timing:1'],
    ['dft-wrapper', [...wrapper, '--config', join(examples, 'chains.json')], 'wrapper-chain-explanation:1'],
    ['dft-wrapper', [...wrapper, '--config', join(examples, 'excluded.json')], 'wrapper-chain-explanation:1'],
  ];
  const full = [];
  for (const [tool, args, suffix] of original) full.push(await compare(tool, args, 0, `urn:dft-studio:analysis:${suffix}`));
  assert.equal(full[0].payload.registers.length, 2); assert.deepEqual(full[0].payload.findings, []);
  assert.equal(full[1].payload.objects.length, 2);
  assert.equal(full[2].payload.timeline.durationPicoseconds, 16000);
  assert.equal(full[3].payload.explanation.counts.conflict, 1);
  assert.equal(full[4].payload.explanation.counts.compatible, 1);
  for (const [i, budget] of [[0, ['--max-facts', '1']], [1, ['--max-objects', '1']],
    [2, ['--max-objects', '1']], [3, ['--max-explain-work', '1']]]) {
    const [tool, args, suffix] = original[i];
    await compare(tool, [...args, ...budget], 4, `urn:dft-studio:analysis:${suffix}`);
  }
  const failed = join(cwd, 'constant-control.sv');
  writeFileSync(failed, `module cell_ff(input logic c, r, d, output logic q);
always_ff @(posedge c or negedge r) if (!r) q <= 0; else q <= d;
endmodule
module constant_control(input logic d, output logic q);
cell_ff u(1'b0, 1'b1, d, q);
endmodule\n`);
  await compare('dft-seqcheck', ['--top', 'constant_control', '--scope', 'constant_control', '--recursive', failed, '--fail-on-error'], 1, 'urn:dft-studio:analysis:sequential:1');
  await compare('dft-objects', [...seq, '--text', '--output'], 0, 'urn:dft-studio:analysis:object-catalog:1');
  for (const i of [3, 4]) await compare('dft-wrapper', [...original[i][1], '--format', 'text'], 0, undefined, 'text');
});

test('real parameter and compile errors retain original code and JSON, including text requests', async () => {
  const broken = join(cwd, 'broken.sv'); writeFileSync(broken, 'module broken(input logic x;\n');
  for (const tool of ['dft-seqcheck', 'dft-objects', 'dft-memory', 'dft-wrapper']) {
    const format = tool === 'dft-wrapper' ? 'text' : 'json';
    const argumentError = await compare(tool, ['--unknown-host-test-flag'], 2, undefined, format);
    assert.ok(argumentError.payload.error);
    await compare(tool, ['--top', 'broken', '--scope', 'broken', ...(tool === 'dft-memory' ? ['--definition', 'broken'] : []), broken], 3, undefined, format);
  }
});
