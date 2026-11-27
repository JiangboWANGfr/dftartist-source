import type {
  AnalysisTool,
  AnalysisDesignBinding,
  AnalysisReceipt,
  JsonObject,
  NativeAnalysisSession
} from './index.js';

export interface AnalysisSourceSpan {
  readonly file: string;
  readonly path: string;
  readonly start: Readonly<{ offset: number; line: number; column: number }>;
  readonly end: Readonly<{ offset: number; line: number; column: number }>;
  readonly contentHash: string;
}
export type ReadonlyJson<T> = T extends readonly (infer U)[]
  ? readonly ReadonlyJson<U>[]
  : T extends object
    ? { readonly [K in keyof T]: ReadonlyJson<T[K]> }
    : T;
export interface ValidatedAnalysisReport {
  readonly binding: AnalysisDesignBinding;
  readonly request: AnalysisReceipt['request'];
  readonly kind: 'report' | 'backend_error';
  readonly exitCode: 0 | 1 | 4 | 2 | 3 | 5 | 130;
  readonly schemaId: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly payload: ReadonlyJson<JsonObject>;
  readonly locations: readonly Readonly<{ pointer: string; span: AnalysisSourceSpan }>[];
}
export interface SavedAnalysisReport extends Omit<ValidatedAnalysisReport, 'binding' | 'request'> {
  readonly historical: true;
  readonly freshness: 'unknown';
  readonly tool: AnalysisTool;
}
export interface SavedAnalysisOutput {
  readonly tool: AnalysisTool;
  readonly kind: 'report' | 'backend_error';
  readonly exitCode: 0 | 1 | 4 | 2 | 3 | 5 | 130;
  readonly stdout: Uint8Array;
}
export interface AnalysisSourceExcerpt {
  readonly span: AnalysisSourceSpan;
  readonly contentHash: string;
  readonly firstLine: number;
  readonly lastLine: number;
  readonly text: string;
  /** End-exclusive UTF16 offsets in text; not native UTF8 byte offsets. */
  readonly selection: Readonly<{ start: number; end: number; unit: 'utf16' }>;
}
export type AnalysisReportErrorCode =
  | 'invalid_request'
  | 'schema_invalid'
  | 'unknown_schema'
  | 'wrong_tool'
  | 'json_required'
  | 'not_report'
  | 'report_invalid'
  | 'report_limit'
  | 'source_unavailable'
  | 'source_changed'
  | 'source_invalid'
  | 'source_limit'
  | 'cancelled'
  | 'stale_result';
export class AnalysisReportError extends Error {
  constructor(code: AnalysisReportErrorCode, message: string, details?: object, cause?: unknown);
  readonly code: AnalysisReportErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
}
export class AnalysisReportReader {
  private constructor();
  static open(options: { schemaDirectory: string }): Promise<AnalysisReportReader>;
  readonly schemaIds: readonly string[];
  read(
    session: NativeAnalysisSession,
    receipt: AnalysisReceipt,
    schemaId: string
  ): ValidatedAnalysisReport;
  readSaved(input: SavedAnalysisOutput, schemaId: string): SavedAnalysisReport;
  readSavedSource(
    report: SavedAnalysisReport,
    locationIndex: number,
    options?: Parameters<AnalysisReportReader['readSource']>[2]
  ): Promise<AnalysisSourceExcerpt>;
  isCurrent(report: unknown): report is ValidatedAnalysisReport;
  assertCurrent(report: ValidatedAnalysisReport): ValidatedAnalysisReport;
  readSource(
    report: ValidatedAnalysisReport,
    locationIndex: number,
    options?: {
      contextLines?: number;
      maxFileBytes?: number;
      maxExcerptBytes?: number;
      signal?: AbortSignal;
    }
  ): Promise<AnalysisSourceExcerpt>;
}
