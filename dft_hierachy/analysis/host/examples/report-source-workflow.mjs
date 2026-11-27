import { mkdtemp, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { NativeAnalysisSession } from '../index.mjs';
import { AnalysisReportReader } from '../reports.mjs';

const [binaryDirectory, dataDirectory] = process.argv.slice(2);
if (!binaryDirectory || !dataDirectory) {
  process.stderr.write('Usage: node report-source-workflow.mjs ABSOLUTE_BIN ABSOLUTE_DATA\n');
  process.exitCode = 2;
} else {
  const session = new NativeAnalysisSession({ binaryDirectory });
  const work = await mkdtemp(join(tmpdir(), 'analysis-source-workflow-'));
  try {
    const reader = await AnalysisReportReader.open({
      schemaDirectory: resolve(dataDirectory, 'schemas')
    });
    await copyFile(resolve(dataDirectory, 'examples/example.sv'), join(work, 'example.sv'));
    await copyFile(resolve(dataDirectory, 'examples/chains.json'), join(work, 'chains.json'));
    const design = {
      designId: 'wrapper-example',
      cwd: work,
      top: 'wrapper_example',
      files: ['example.sv']
    };
    const request = {
      tool: 'dft-wrapper',
      args: ['--config', join(work, 'chains.json'), '--explain-chains', '--require-complete']
    };
    const schemaId = 'urn:dft-studio:analysis:wrapper-chain-explanation:1';
    await session.setDesign(design);
    const before = reader.read(session, await session.run(request), schemaId);
    const index = before.locations.findIndex((location) =>
      location.pointer.startsWith('/explanation/locations/')
    );
    const source = await reader.readSource(before, index >= 0 ? index : 0);
    const config = JSON.parse(await readFile(join(work, 'chains.json'), 'utf8'));
    config.planning = { rules: [{ port: 'b', direction: 'output', action: 'exclude' }] };
    await writeFile(join(work, 'chains.json'), JSON.stringify(config, null, 2));
    await session.setDesign(design); // The application explicitly invalidates previous input assumptions.
    const after = reader.read(session, await session.run(request), schemaId);
    process.stdout.write(
      JSON.stringify(
        {
          schemaId,
          source,
          oldReportCurrent: reader.isCurrent(before),
          currentReportCurrent: reader.isCurrent(after),
          before: { exitCode: before.exitCode, counts: before.payload.explanation.counts },
          after: { exitCode: after.exitCode, counts: after.payload.explanation.counts }
        },
        null,
        2
      ) + '\n'
    );
  } finally {
    await session.dispose();
    await rm(work, { recursive: true, force: true });
  }
}
