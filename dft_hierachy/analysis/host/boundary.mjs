import { isAbsolute } from 'node:path';

const tools = new Set(['dft-seqcheck', 'dft-objects', 'dft-memory', 'dft-wrapper']);
export const signalAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;
export const signalReason = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'reason').get;
export const emptyDetails = () => ({ stdout: new Uint8Array(), stderr: new Uint8Array() });

export class NativeAnalysisError extends Error {
  constructor(code, message, details = emptyDetails(), cause = undefined) {
    super(message, { cause });
    this.name = 'NativeAnalysisError';
    this.code = code;
    this.details = Object.freeze(details);
  }
}

export function invalid(message) {
  throw new NativeAnalysisError('invalid_request', message);
}

export function scalarString(value, name, nonempty = false) {
  if (typeof value !== 'string' || (nonempty && !value) || value.includes('\0'))
    invalid(`${name} must be a ${nonempty ? 'nonempty ' : ''}string without NUL`);
  for (const char of value) {
    const point = char.codePointAt(0);
    if (point >= 0xd800 && point <= 0xdfff) invalid(`${name} contains an unpaired surrogate`);
  }
  return value;
}

export function directory(value, name) {
  scalarString(value, name, true);
  if (!isAbsolute(value)) invalid(`${name} must be absolute`);
  return value;
}

function integer(value, fallback, maximum, name, minimum = 1) {
  const result = value === undefined ? fallback : value;
  if (!Number.isInteger(result) || result < minimum || result > maximum)
    invalid(`${name} must be an integer from ${minimum} to ${maximum}`);
  return result;
}

export function record(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid(`${name} must be an object`);
}

export function requestSnapshot(request, defaultCwd) {
  record(request, 'request');
  const { tool, args, cwd = defaultCwd, format = 'json', signal, onStderr } = request;
  if (!tools.has(tool)) invalid('tool must be one of the four native analysis tools');
  if (!Array.isArray(args)) invalid('args must be a string array');
  const argv = Array.from(args, (arg) => scalarString(arg, 'argument'));
  if (argv[0] === '--output')
    invalid('The host requires stdout; the --output prefix is unsupported');
  directory(cwd, 'cwd');
  if (format !== 'json' && !(format === 'text' && tool === 'dft-wrapper'))
    invalid('format must be json, or text for dft-wrapper');
  if (signal !== undefined && !(signal instanceof AbortSignal))
    invalid('signal must be an AbortSignal');
  if (signal !== undefined) signalAborted.call(signal); // Validate the native brand before owning a job.
  if (onStderr !== undefined && typeof onStderr !== 'function')
    invalid('onStderr must be a function');
  return { tool, args: argv, cwd, format, signal, onStderr };
}

export function hostOptions(options) {
  record(options, 'options');
  const {
    binaryDirectory,
    cwd = process.cwd(),
    timeoutMs,
    killGraceMs,
    maxStdoutBytes,
    maxStderrBytes
  } = options;
  return {
    binaryDirectory: directory(binaryDirectory, 'binaryDirectory'),
    cwd: directory(cwd, 'cwd'),
    timeoutMs: integer(timeoutMs, 30000, 2147483647, 'timeoutMs'),
    killGraceMs: integer(killGraceMs, 250, 30000, 'killGraceMs', 0),
    maxStdoutBytes: integer(maxStdoutBytes, 16777216, 67108864, 'maxStdoutBytes'),
    maxStderrBytes: integer(maxStderrBytes, 1048576, 67108864, 'maxStderrBytes')
  };
}
