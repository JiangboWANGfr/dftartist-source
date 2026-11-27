import { NativeAnalysisSession } from '@dft-studio/native-analysis';
import {
  AnalysisReportReader,
  AnalysisReportError,
  type ValidatedAnalysisReport,
  type AnalysisSourceExcerpt
} from '@dft-studio/native-analysis/reports';

const session = new NativeAnalysisSession({ binaryDirectory: '/installed/bin' });
const reader = await AnalysisReportReader.open({
  schemaDirectory: '/installed/share/dft-analysis/schemas'
});
await session.setDesign({ designId: 'project', cwd: '/project', top: 'chip', files: ['chip.sv'] });
const call = await session.run({ tool: 'dft-seqcheck', args: ['--scope', 'chip'] });
const report: ValidatedAnalysisReport = reader.read(
  session,
  call,
  'urn:dft-studio:analysis:sequential:1'
);
const excerpt: AnalysisSourceExcerpt = await reader.readSource(report, 0, {
  contextLines: 2,
  signal: new AbortController().signal
});
const saved = reader.readSaved(
  { tool: 'dft-seqcheck', kind: 'report', exitCode: 0, stdout: call.result.stdout },
  report.schemaId
);
await reader.readSavedSource(saved, 0, { contextLines: 2 });
const historical: true = saved.historical;
// @ts-expect-error A saved report has no live binding.
saved.binding;
// @ts-expect-error Historical reading cannot accept a live receipt report.
reader.readSavedSource(report, 0);
// @ts-expect-error Live source reading cannot accept historical reports.
reader.readSource(saved, 0);
reader.readSaved(
  // @ts-expect-error Saved stdout must be bytes, not a string.
  { tool: 'dft-seqcheck', kind: 'report', exitCode: 0, stdout: '{}' },
  report.schemaId
);
void historical;
const unit: 'utf16' = excerpt.selection.unit;
const text: string = excerpt.text;
const unknownValue: unknown = report;
if (reader.isCurrent(unknownValue)) {
  const checked: ValidatedAnalysisReport = unknownValue;
  void checked;
}
try {
  reader.assertCurrent(report);
} catch (e) {
  if (e instanceof AnalysisReportError) console.log(e.code, e.details);
}
// @ts-expect-error Payload is an owned readonly snapshot.
report.payload.algorithm = 'mutated';
// @ts-expect-error Original locations are readonly.
report.locations[0]!.span.start.offset = 0;
// @ts-expect-error Editor selections use UTF16, not byte offsets.
const wrongUnit: 'bytes' = excerpt.selection.unit;
// @ts-expect-error Registry construction must complete before use.
new AnalysisReportReader();
void [unit, text, wrongUnit];
await session.dispose();
