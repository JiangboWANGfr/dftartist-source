import {
  NativeAnalysisSession,
  NativeAnalysisSessionError,
  type AnalysisDesignInput,
  type AnalysisReceipt
} from '@dft-studio/native-analysis';

const session = new NativeAnalysisSession({ binaryDirectory: '/installed/bin' });
const design: AnalysisDesignInput = {
  designId: 'project',
  cwd: '/project',
  top: 'chip',
  filelists: Object.freeze([{ path: 'rtl.f', mode: 'F' as const }]),
  defines: Object.freeze(['WIDTH=8'])
};
const binding = await session.setDesign(design);
const id: string = binding.generation;
const receipt: AnalysisReceipt = await session.run({
  tool: 'dft-wrapper',
  args: ['--help'],
  format: 'text'
});
session.assertCurrent(receipt);
if (receipt.result.kind === 'backend_error') {
  const code: 2 | 3 | 5 | 130 = receipt.result.exitCode;
  void code;
} else if (receipt.result.format === 'text') {
  const text: string = receipt.result.payload;
  void text;
}
const unknownValue: unknown = receipt;
if (session.isCurrent(unknownValue)) {
  const result: AnalysisReceipt = unknownValue;
  void result;
}
try {
  session.assertCurrent(receipt);
} catch (error) {
  if (error instanceof NativeAnalysisSessionError)
    console.log(error.code, error.binding?.generation);
}
// @ts-expect-error Session calls cannot replace the bound working directory.
void session.run({ tool: 'dft-objects', args: [], cwd: '/other' });
// @ts-expect-error Text remains restricted to Wrapper.
void session.run({ tool: 'dft-memory', args: [], format: 'text' });
// @ts-expect-error Filelist mode is explicit f or F.
void session.setDesign({ ...design, filelists: [{ path: 'a.f', mode: 'auto' }] });
// @ts-expect-error Binding metadata is immutable.
binding.design.files.push('other.sv');
// @ts-expect-error Receipt metadata is immutable.
receipt.result.exitCode = 0;
void id;
const empty: null = await session.setDesign(null);
void empty;
await session.dispose();
