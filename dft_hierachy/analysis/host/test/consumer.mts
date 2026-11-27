import { NativeAnalysisHost, NativeAnalysisError, type AnalysisRequest, type AnalysisResult } from '@dft-studio/native-analysis';

const host = new NativeAnalysisHost({ binaryDirectory: '/installed/bin', killGraceMs: 0 });
const request: AnalysisRequest = { tool: 'dft-wrapper', args: Object.freeze(['--help']), format: 'text' };
const result: AnalysisResult = await host.run(request);
if (result.kind === 'backend_error') {
  const code: 2 | 3 | 5 | 130 = result.exitCode;
  const error: unknown = result.payload.error;
  void [code, error];
} else if (result.format === 'text') {
  const tool: 'dft-wrapper' = result.tool;
  const text: string = result.payload;
  void [tool, text];
} else {
  const code: 0 | 1 | 4 = result.exitCode;
  const complete: unknown = result.payload.complete;
  void [code, complete];
}
const bytes: Uint8Array = result.stdout;
void bytes;
try { await host.run({ tool: 'dft-memory', args: [] }); }
catch (error) { if (error instanceof NativeAnalysisError) console.log(error.code, error.details.exitCode); }
// @ts-expect-error Text belongs only to the Wrapper CLI.
void host.run({ tool: 'dft-memory', args: [], format: 'text' });
// @ts-expect-error Executable names are an explicit finite set.
void host.run({ tool: 'sh', args: [] });
// @ts-expect-error argv values are strings without coercion.
void host.run({ tool: 'dft-objects', args: [42] });
// @ts-expect-error Callers cannot write lifecycle state.
host.activeCount = 3;
await host.dispose();
