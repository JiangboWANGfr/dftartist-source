export type AnalysisTool = 'dft-seqcheck' | 'dft-objects' | 'dft-memory' | 'dft-wrapper';
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}
export interface NativeAnalysisOptions {
  binaryDirectory: string;
  cwd?: string;
  timeoutMs?: number;
  killGraceMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
}
interface RequestBase {
  args: readonly string[];
  cwd?: string;
  signal?: AbortSignal;
  /** Synchronous, with a copy of each stderr chunk. Throwing or returning a Promise fails the call. */
  onStderr?: (bytes: Uint8Array) => void;
}
export type AnalysisRequest = RequestBase &
  ({ tool: AnalysisTool; format?: 'json' } | { tool: 'dft-wrapper'; format: 'text' });
export interface ProcessDetails {
  tool?: AnalysisTool;
  pid?: number;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  stdout: Uint8Array;
  stderr: Uint8Array;
}
interface ResultBase extends ProcessDetails {
  tool: AnalysisTool;
  pid: number;
  signal: null;
}
/** Report status does not assert a domain verdict or evidence completeness. */
export type AnalysisResult = ResultBase &
  (
    | { kind: 'report'; exitCode: 0 | 1 | 4; format: 'json'; payload: JsonObject }
    | { kind: 'report'; tool: 'dft-wrapper'; exitCode: 0 | 1 | 4; format: 'text'; payload: string }
    | { kind: 'backend_error'; exitCode: 2 | 3 | 5 | 130; format: 'json'; payload: JsonObject }
  );
export type NativeAnalysisErrorCode =
  | 'invalid_request'
  | 'disposed'
  | 'cancelled'
  | 'timeout'
  | 'spawn_failed'
  | 'process_failed'
  | 'output_limit'
  | 'output_invalid'
  | 'output_io'
  | 'callback_failed';
export class NativeAnalysisError extends Error {
  constructor(
    code: NativeAnalysisErrorCode,
    message: string,
    details?: ProcessDetails,
    cause?: unknown
  );
  readonly code: NativeAnalysisErrorCode;
  readonly details: Readonly<ProcessDetails>;
}
export class NativeAnalysisHost {
  constructor(options: NativeAnalysisOptions);
  readonly disposed: boolean;
  readonly activeCount: number;
  run(request: AnalysisRequest): Promise<AnalysisResult>;
  /** Idempotent; resolves after all owned direct children and their pipes close. */
  dispose(): Promise<void>;
}

export interface AnalysisDesignInput {
  designId: string;
  cwd: string;
  top: string;
  files?: readonly string[];
  filelists?: readonly { path: string; mode: 'f' | 'F' }[];
  includeDirs?: readonly string[];
  defines?: readonly string[];
}
export interface AnalysisDesignBinding {
  readonly sessionId: string;
  readonly generation: string;
  readonly design: Readonly<{
    designId: string;
    cwd: string;
    top: string;
    files: readonly string[];
    filelists: readonly Readonly<{ path: string; mode: 'f' | 'F' }>[];
    includeDirs: readonly string[];
    defines: readonly string[];
  }>;
  readonly args: readonly string[];
}
type WithoutCwd<T> = T extends unknown ? Omit<T, 'cwd'> : never;
export type SessionAnalysisRequest = WithoutCwd<AnalysisRequest>;
export interface AnalysisReceipt {
  readonly binding: AnalysisDesignBinding;
  /** Exact complete argv, including the common design prefix. */
  readonly request: Readonly<{
    tool: AnalysisTool;
    args: readonly string[];
    cwd: string;
    format: 'json' | 'text';
  }>;
  readonly result: Readonly<AnalysisResult>;
}
export type NativeAnalysisSessionErrorCode =
  | 'invalid_request'
  | 'no_design'
  | 'replacing'
  | 'disposed'
  | 'stale_result';
export class NativeAnalysisSessionError extends Error {
  constructor(
    code: NativeAnalysisSessionErrorCode,
    message: string,
    binding?: AnalysisDesignBinding,
    result?: AnalysisResult,
    cause?: unknown
  );
  readonly code: NativeAnalysisSessionErrorCode;
  readonly binding: AnalysisDesignBinding | undefined;
  readonly result: AnalysisResult | undefined;
}
export class NativeAnalysisSession {
  constructor(options: NativeAnalysisOptions);
  readonly state: 'empty' | 'ready' | 'replacing' | 'disposed';
  readonly binding: AnalysisDesignBinding | null;
  readonly activeCount: number;
  setDesign(input: AnalysisDesignInput): Promise<AnalysisDesignBinding>;
  setDesign(input: null): Promise<null>;
  setDesign(input: AnalysisDesignInput | null): Promise<AnalysisDesignBinding | null>;
  run(request: SessionAnalysisRequest): Promise<AnalysisReceipt>;
  isCurrent(receipt: unknown): receipt is AnalysisReceipt;
  assertCurrent(receipt: AnalysisReceipt): AnalysisReceipt;
  dispose(): Promise<void>;
}
