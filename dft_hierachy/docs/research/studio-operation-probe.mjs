// Research probe against an unmodified, pinned ECOS RuntimeOperationTracker.
// This does not start Electron, ECC, or any EDA tool and is not a product test.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) {
  throw new Error('Usage: node studio-operation-probe.mjs <runtimeOperationTracker.ts> <result.json>');
}
const bytes = await readFile(sourcePath);
const sourceHash = createHash('sha256').update(bytes).digest('hex');
const { RuntimeOperationTracker } = await import(pathToFileURL(sourcePath).href);
const observations = [];
function event(id, sequence, state) {
  return {
    eventId: `${id}:${sequence}`, operationId: id, workspaceId: 'research-workspace',
    sequence, timestamp: sequence, type: 'operation.changed', origin: 'gui',
    kind: 'step', payload: { state, step: 'research-step', workspaceRevision: 7 },
  };
}

const ordered = new RuntimeOperationTracker();
ordered.track(event('ordered', 2, 'running'));
ordered.track(event('ordered', 1, 'queued'));
assert.equal(ordered.activeOperations()[0].state, 'running');
observations.push({ name: 'older-event-does-not-regress-state', input: ['running@2', 'queued@1'], observed: 'running' });

const waiter = ordered.waitFor('ordered');
ordered.track(event('ordered', 3, 'succeeded'));
const firstTerminal = await waiter;
ordered.track(event('ordered', 4, 'failed'));
const lateWaiter = await ordered.waitFor('ordered');
assert.equal(firstTerminal.state, 'succeeded');
assert.equal(lateWaiter.state, 'succeeded');
assert.equal(ordered.recentOutcomes().length, 1);
assert.equal(ordered.hasActiveOperations(), false);
observations.push({ name: 'terminal-replay-and-late-waiter', input: ['succeeded@3', 'failed@4', 'wait-after-terminal'], observed: { outcome: 'succeeded', count: 1, active: false } });

const interrupted = new RuntimeOperationTracker();
interrupted.track(event('interrupted', 1, 'running'));
const interruptedWaiter = interrupted.waitFor('interrupted');
interrupted.interruptActiveOperations('controlled sidecar-exit observation');
assert.equal((await interruptedWaiter).state, 'interrupted');
assert.equal(interrupted.hasActiveOperations(), false);
observations.push({ name: 'explicit-exit-handler-settles-waiter', input: 'interruptActiveOperations called by probe', observed: { outcome: 'interrupted', active: false } });

const bounded = new RuntimeOperationTracker();
for (let i = 0; i < 513; i++) bounded.track(event(`bounded-${i}`, 1, 'succeeded'));
assert.equal(bounded.recentOutcomes(1000).length, 512);
assert.equal(bounded.hasTerminalOperation('bounded-0'), false);
assert.equal(bounded.hasTerminalOperation('bounded-512'), true);
observations.push({ name: 'bounded-terminal-memory', input: '513 different completed operations', observed: { retained: 512, firstEvicted: true, lastRetained: true } });

assert.equal(createHash('sha256').update(await readFile(sourcePath)).digest('hex'), sourceHash);
const result = {
  node: process.version, sourcePath, sourceSha256: sourceHash, sourceUnmodified: true,
  observations, assertionsPassed: true,
  limits: ['direct tracker calls only', 'no Electron or real process exit', 'no ECC RPC/GUI/EDA execution', 'not DFT Studio acceptance'],
};
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ node: process.version, sourceSha256: sourceHash, observations: observations.length, assertionsPassed: true })}\n`);
