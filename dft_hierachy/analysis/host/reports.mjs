import { constants } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { NativeAnalysisSession, NativeAnalysisSessionError } from './session.mjs';
import { scalarString, signalAborted, signalReason } from './boundary.mjs';

const protocolId = 'urn:dft-studio:hier:protocol:2:schema:7';
const families = {
  sequential: 'dft-seqcheck',
  objects: 'dft-objects',
  memory: 'dft-memory',
  wrapper: 'dft-wrapper'
};
const decoder = () => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const reportExits = new Set([0, 1, 4]);
const errorExits = new Set([2, 3, 5, 130]);

export class AnalysisReportError extends Error {
  constructor(code, message, details = {}, cause = undefined) {
    super(message, { cause });
    this.name = 'AnalysisReportError';
    this.code = code;
    this.details = Object.freeze(details);
  }
}

function fail(code, message, details = {}, cause = undefined) {
  throw new AnalysisReportError(code, message, details, cause);
}

function number(value, fallback, minimum, maximum, name) {
  const result = value === undefined ? fallback : value;
  if (!Number.isInteger(result) || result < minimum || result > maximum)
    fail('invalid_request', `${name} must be an integer from ${minimum} to ${maximum}`);
  return result;
}

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid_request', `${name} must be an object`);
}

function absolutePath(value) {
  try {
    scalarString(value, 'path', true);
  } catch (cause) {
    fail('invalid_request', 'Expected an absolute scalar path without NUL', {}, cause);
  }
  if (!isAbsolute(value)) fail('invalid_request', 'Expected an absolute path');
  return value;
}

/** Each invocation owns a handle until close and never reads a non-regular file. */
async function fileBytes(path, limit, check = () => {}, noFollow = false) {
  check();
  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (noFollow ? (constants.O_NOFOLLOW ?? 0) : 0)
  );
  try {
    check();
    const info = await handle.stat();
    check();
    if (!info.isFile()) fail('source_unavailable', 'Expected a regular file', { path });
    if (info.size > limit) fail('source_limit', 'File exceeds its byte limit', { path, limit });
    const chunks = [];
    let size = 0;
    for (;;) {
      const buffer = Buffer.allocUnsafe(Math.min(65536, limit + 1 - size));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      check();
      if (!bytesRead) return Buffer.concat(chunks, size);
      size += bytesRead;
      if (size > limit) fail('source_limit', 'File grew beyond its byte limit', { path, limit });
      chunks.push(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
}

function parse(bytes) {
  const value = JSON.parse(decoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Expected a JSON object');
  return value;
}

function freezeReport(payload, sourceCheck, withLocations) {
  const pending = [[payload, '', 0]],
    locations = [];
  let nodes = 0;
  while (pending.length) {
    const [value, pointer, depth] = pending.pop();
    if (++nodes > 1000000 || depth > 128)
      fail('report_limit', 'Report exceeds the node/depth limit');
    if (!value || typeof value !== 'object') continue;
    Object.freeze(value);
    if (
      withLocations &&
      value.file &&
      value.path &&
      value.start &&
      value.end &&
      value.contentHash &&
      sourceCheck(value)
    ) {
      if (locations.length === 10000) fail('report_limit', 'Report exceeds 10000 source locations');
      locations.push(Object.freeze({ pointer, span: value }));
    }
    const entries = Object.entries(value);
    for (let i = entries.length - 1; i >= 0; --i) {
      const [key, child] = entries[i];
      pending.push([
        child,
        pointer + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1'),
        depth + 1
      ]);
    }
  }
  return Object.freeze(locations);
}

export class AnalysisReportReader {
  #validators;
  #sourceCheck;
  #reports = new WeakMap();
  #savedReports = new WeakSet();
  #ids;

  // Instances are created by open(), so partially loaded registries cannot escape.
  constructor(token, validators, sourceCheck) {
    if (token !== constructionToken) fail('invalid_request', 'Use AnalysisReportReader.open()');
    this.#validators = validators;
    this.#sourceCheck = sourceCheck;
    this.#ids = Object.freeze([...validators.keys()].sort());
  }

  static async open(options) {
    try {
      let root;
      try {
        object(options, 'options');
        root = absolutePath(options.schemaDirectory);
      } catch (cause) {
        if (cause instanceof AnalysisReportError) throw cause;
        fail('invalid_request', 'Cannot read schema options', {}, cause);
      }
      if (!(await stat(root)).isDirectory())
        fail('schema_invalid', 'schemaDirectory must be a directory');
      const records = [],
        ids = new Set(),
        pending = [[root, 0]];
      let total = 0;
      while (pending.length) {
        const [directory, depth] = pending.pop();
        if (depth > 8) fail('schema_invalid', 'Schema directory exceeds depth 8');
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        for (const entry of entries) {
          const path = join(directory, entry.name);
          if (entry.isSymbolicLink())
            fail('schema_invalid', 'Schema tree contains a symbolic link', { path });
          if (entry.isDirectory()) {
            pending.push([path, depth + 1]);
            continue;
          }
          if (!entry.name.endsWith('.schema.json')) continue;
          if (!entry.isFile() || records.length === 256)
            fail('schema_invalid', 'Invalid schema file or file count', { path });
          const bytes = await fileBytes(path, 2 * 1024 ** 2, undefined, true);
          total += bytes.length;
          if (total > 16 * 1024 ** 2) fail('schema_invalid', 'Schema tree exceeds 16 MiB');
          const schema = parse(bytes);
          if (typeof schema.$id !== 'string' || !schema.$id || ids.has(schema.$id))
            fail('schema_invalid', 'Schema IDs must be nonempty and unique', { path });
          ids.add(schema.$id);
          records.push({ schema, tool: families[relative(root, path).split(sep)[0]] });
        }
      }
      const ajv = new Ajv2020({
        strict: false,
        allErrors: false,
        coerceTypes: false,
        useDefaults: false,
        removeAdditional: false,
        ownProperties: true
      });
      addFormats(ajv);
      for (const { schema } of records) ajv.addSchema(schema);
      const sourceCheck = ajv.getSchema(protocolId + '#/$defs/SourceSpan');
      if (!sourceCheck)
        fail('schema_invalid', 'The original protocol SourceSpan schema is required');
      const validators = new Map();
      for (const { schema, tool } of records) {
        const validate = ajv.getSchema(schema.$id); // Compile the complete reference closure now, offline.
        if (!validate) fail('schema_invalid', 'Schema failed to compile', { schemaId: schema.$id });
        if (tool) validators.set(schema.$id, { tool, validate });
      }
      if (!validators.size) fail('schema_invalid', 'No analysis schemas found');
      return new AnalysisReportReader(constructionToken, validators, sourceCheck);
    } catch (cause) {
      if (cause instanceof AnalysisReportError && cause.code === 'invalid_request') throw cause;
      if (cause instanceof AnalysisReportError && cause.code === 'schema_invalid') throw cause;
      fail('schema_invalid', 'Cannot load the offline schema registry', {}, cause);
    }
  }

  get schemaIds() {
    return this.#ids;
  }

  read(session, receipt, schemaId) {
    if (!(session instanceof NativeAnalysisSession))
      fail('invalid_request', 'Expected a NativeAnalysisSession');
    try {
      session.assertCurrent(receipt);
    } catch (cause) {
      if (cause instanceof NativeAnalysisSessionError) throw cause;
      fail('invalid_request', 'Invalid analysis session', {}, cause);
    }
    const body = this.#validatedOutput(receipt.result, schemaId);
    session.assertCurrent(receipt);
    const report = Object.freeze({ binding: receipt.binding, request: receipt.request, ...body });
    this.#reports.set(report, { session, receipt });
    return report;
  }

  readSaved(input, schemaId) {
    let original;
    try {
      object(input, 'saved output');
      const { tool, kind, exitCode, stdout } = input;
      if (!Object.values(families).includes(tool) || !(stdout instanceof Uint8Array))
        fail('invalid_request', 'Saved output requires a known tool and Uint8Array stdout');
      original = { tool, kind, exitCode, stdout, format: 'json' };
    } catch (cause) {
      if (cause instanceof AnalysisReportError) throw cause;
      fail('invalid_request', 'Cannot read saved output', {}, cause);
    }
    const body = this.#validatedOutput(original, schemaId);
    const report = Object.freeze({
      historical: true,
      freshness: 'unknown',
      tool: original.tool,
      ...body
    });
    this.#savedReports.add(report);
    return report;
  }

  #validatedOutput(original, schemaId) {
    const registered = this.#validators.get(schemaId);
    if (!registered)
      fail('unknown_schema', 'Schema ID is not in the analysis registry', { schemaId });
    if (registered.tool !== original.tool)
      fail('wrong_tool', 'Schema belongs to another analysis tool', {
        schemaId,
        tool: original.tool
      });
    if (original.format !== 'json')
      fail(
        'json_required',
        'Use the native JSON report for schema validation and source locations'
      );
    if (original.stdout.byteLength > 16 * 1024 ** 2) fail('report_limit', 'Report exceeds 16 MiB');
    const bytes = Buffer.from(original.stdout);
    let payload;
    try {
      payload = parse(bytes);
    } catch (cause) {
      fail('report_invalid', 'Report bytes are not a strict UTF8 JSON object', {}, cause);
    }
    if (
      original.kind === 'report'
        ? !reportExits.has(original.exitCode) ||
          typeof payload.algorithm !== 'string' ||
          // The shared CLI version envelope has only formatVersion and algorithm.
          (Object.keys(payload).length === 2 && Object.hasOwn(payload, 'formatVersion'))
        : original.kind !== 'backend_error' || !errorExits.has(original.exitCode) || !payload.error
    )
      fail('not_report', 'Native output is not the declared report or backend error');
    const locations = freezeReport(payload, this.#sourceCheck, original.kind === 'report');
    if (!registered.validate(payload))
      fail('report_invalid', 'Native output does not satisfy the original report schema', {
        schemaId,
        violations: JSON.parse(JSON.stringify(registered.validate.errors))
      });
    return {
      kind: original.kind,
      exitCode: original.exitCode,
      schemaId,
      bytes: bytes.length,
      sha256: hash(bytes),
      payload,
      locations
    };
  }

  isCurrent(report) {
    const context = this.#reports.get(report);
    return context !== undefined && context.session.isCurrent(context.receipt);
  }

  assertCurrent(report) {
    const context = this.#reports.get(report);
    if (!context) fail('stale_result', 'Report is foreign or unvalidated');
    context.session.assertCurrent(context.receipt);
    return report;
  }

  readSource(report, locationIndex, options = {}) {
    return this.#readSource(report, locationIndex, options, () => this.assertCurrent(report));
  }

  readSavedSource(report, locationIndex, options = {}) {
    return this.#readSource(report, locationIndex, options, () => {
      if (!this.#savedReports.has(report))
        fail('stale_result', 'Saved report is foreign or unvalidated');
    });
  }

  async #readSource(report, locationIndex, options, assertReport) {
    assertReport();
    let snapshot;
    try {
      object(options, 'options');
      const { contextLines, maxFileBytes, maxExcerptBytes, signal } = options;
      snapshot = { contextLines, maxFileBytes, maxExcerptBytes, signal };
    } catch (cause) {
      if (cause instanceof AnalysisReportError) throw cause;
      fail('invalid_request', 'Cannot read source options', {}, cause);
    }
    const { contextLines, maxFileBytes, maxExcerptBytes, signal } = snapshot;
    const context = number(contextLines, 2, 0, 100, 'contextLines');
    const fileLimit = number(maxFileBytes, 8388608, 1, 67108864, 'maxFileBytes');
    const excerptLimit = number(maxExcerptBytes, 65536, 1, 1048576, 'maxExcerptBytes');
    if (
      !Number.isInteger(locationIndex) ||
      locationIndex < 0 ||
      locationIndex >= report.locations.length
    )
      fail('invalid_request', 'locationIndex is outside this report');
    if (signal !== undefined) {
      if (!(signal instanceof AbortSignal))
        fail('invalid_request', 'signal must be an AbortSignal');
      try {
        signalAborted.call(signal);
      } catch (cause) {
        fail('invalid_request', 'Invalid AbortSignal', {}, cause);
      }
    }
    const check = () => {
      assertReport();
      if (signal && signalAborted.call(signal))
        fail('cancelled', 'Source read was cancelled', {}, signalReason.call(signal));
    };
    check();
    const { span } = report.locations[locationIndex];
    try {
      let path;
      try {
        path = absolutePath(span.path);
      } catch (cause) {
        fail(
          'source_invalid',
          'SourceSpan path must be absolute scalar text without NUL',
          {},
          cause
        );
      }
      const bytes = await fileBytes(path, fileLimit, check);
      const contentHash = hash(bytes);
      if (contentHash !== span.contentHash)
        fail('source_changed', 'Source bytes differ from the compiled snapshot', {
          path,
          expected: span.contentHash,
          actual: contentHash
        });
      try {
        decoder().decode(bytes);
      } catch (cause) {
        fail('source_invalid', 'Source is not strict UTF8', { path }, cause);
      }
      const start = span.start.offset,
        end = span.end.offset;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start > end ||
        end > bytes.length ||
        span.start.line > span.end.line
      )
        fail('source_invalid', 'SourceSpan has invalid byte or line bounds', { path });
      const firstLine = Math.max(1, span.start.line - context),
        lastWanted = span.end.line + context;
      let position = 0,
        line = 1,
        excerptStart,
        excerptEnd,
        lastLine,
        startFits = false,
        endFits = false;
      for (;;) {
        const newline = bytes.indexOf(10, position),
          lineEnd = newline < 0 ? bytes.length : newline + 1;
        if (line === span.start.line)
          startFits = start >= position && (newline < 0 ? start <= lineEnd : start < lineEnd);
        if (line === span.end.line) endFits = end >= position && end <= lineEnd;
        if (line === firstLine) excerptStart = position;
        if (line >= firstLine && line <= lastWanted) {
          excerptEnd = lineEnd;
          lastLine = line;
        }
        if (line === lastWanted || newline < 0) break;
        position = lineEnd;
        ++line;
      }
      if (
        !startFits ||
        !endFits ||
        excerptStart === undefined ||
        lastLine < span.end.line ||
        start < excerptStart ||
        end > excerptEnd
      )
        fail('source_invalid', 'SourceSpan does not fit its declared lines', { path });
      if (excerptEnd - excerptStart > excerptLimit)
        fail('source_limit', 'Source excerpt exceeds its byte limit', {
          path,
          limit: excerptLimit
        });
      let text, selection;
      try {
        text = decoder().decode(bytes.subarray(excerptStart, excerptEnd));
        selection = Object.freeze({
          start: decoder().decode(bytes.subarray(excerptStart, start)).length,
          end: decoder().decode(bytes.subarray(excerptStart, end)).length,
          unit: 'utf16'
        });
      } catch (cause) {
        fail('source_invalid', 'SourceSpan splits a UTF8 character', { path }, cause);
      }
      check();
      return Object.freeze({ span, contentHash, firstLine, lastLine, text, selection });
    } catch (cause) {
      check();
      if (cause instanceof AnalysisReportError || cause instanceof NativeAnalysisSessionError)
        throw cause;
      fail(
        'source_unavailable',
        'Cannot read the original source location',
        { path: span.path },
        cause
      );
    }
  }
}

const constructionToken = Symbol('analysis-report-reader');
