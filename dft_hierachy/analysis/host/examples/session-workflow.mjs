import { resolve } from 'node:path';
import { NativeAnalysisSession } from '../index.mjs';

// node session-workflow.mjs /absolute/analysis-cli/bin /absolute/analysis-cli/share/dft-analysis
const [binaryDirectory, dataDirectory] = process.argv.slice(2);
if (!binaryDirectory || !dataDirectory) {
  process.stderr.write('Usage: node session-workflow.mjs ABSOLUTE_BIN ABSOLUTE_DATA\n');
  process.exitCode = 2;
} else {
  const session = new NativeAnalysisSession({ binaryDirectory });
  try {
    const cwd = resolve(dataDirectory, 'examples');
    await session.setDesign({
      designId: 'example-project',
      cwd,
      top: 'sequential_example',
      files: ['sequential.sv']
    });
    const first = await session.run({
      tool: 'dft-seqcheck',
      args: ['--scope', 'sequential_example', '--recursive', '--require-complete']
    });
    const objects = await session.run({
      tool: 'dft-objects',
      args: ['--scope', 'sequential_example', '--kind', 'port', '--recursive', '--require-complete']
    });
    session.assertCurrent(first);
    session.assertCurrent(objects);
    await session.setDesign({
      designId: 'example-project',
      cwd,
      top: 'wrapper_example',
      files: ['example.sv']
    });
    const wrapper = await session.run({
      tool: 'dft-wrapper',
      args: ['--config', resolve(cwd, 'chains.json'), '--explain-chains', '--require-complete']
    });
    const rechecked = await session.run({
      tool: 'dft-wrapper',
      args: ['--config', resolve(cwd, 'excluded.json'), '--explain-chains', '--require-complete']
    });
    await session.setDesign({
      designId: 'example-project',
      cwd,
      top: 'memory_example',
      files: ['memory.sv']
    });
    const memory = await session.run({
      tool: 'dft-memory',
      args: [
        '--scope',
        'memory_example',
        '--recursive',
        '--memory-library',
        resolve(cwd, 'memory-library.json'),
        '--plan-tests',
        '--schedule-tests',
        '--time-tests',
        '--test-config',
        resolve(cwd, 'memory-test.json'),
        '--require-complete'
      ]
    });
    process.stdout.write(
      JSON.stringify(
        {
          oldReceiptCurrent: session.isCurrent(first),
          currentReceiptCurrent: session.isCurrent(memory),
          reports: [first, objects, wrapper, rechecked, memory].map((receipt) => ({
            tool: receipt.request.tool,
            generation: receipt.binding.generation,
            current: session.isCurrent(receipt),
            kind: receipt.result.kind,
            exitCode: receipt.result.exitCode,
            payload: receipt.result.payload
          }))
        },
        null,
        2
      ) + '\n'
    );
  } finally {
    await session.dispose();
  }
}
