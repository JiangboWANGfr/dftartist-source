import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { NativeAnalysisHost } from './process.mjs';
import {
  NativeAnalysisError,
  directory,
  emptyDetails,
  hostOptions,
  record,
  requestSnapshot,
  scalarString
} from './boundary.mjs';

export class NativeAnalysisSessionError extends Error {
  constructor(code, message, binding = undefined, result = undefined, cause = undefined) {
    super(message, { cause });
    this.name = 'NativeAnalysisSessionError';
    this.code = code;
    this.binding = binding;
    this.result = result;
  }
}

function strings(value, name) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return Object.freeze(Array.from(value, (item) => scalarString(item, name, true)));
}

function designSnapshot(input) {
  record(input, 'design input');
  const { designId, cwd, top, files, filelists, includeDirs, defines } = input;
  scalarString(designId, 'designId', true);
  directory(cwd, 'cwd');
  scalarString(top, 'top', true);
  const lists = filelists === undefined ? [] : filelists;
  if (!Array.isArray(lists)) throw new TypeError('filelists must be an array');
  const design = Object.freeze({
    designId,
    cwd,
    top,
    files: strings(files, 'files'),
    filelists: Object.freeze(
      Array.from(lists, (item) => {
        record(item, 'filelist');
        const { path, mode } = item;
        scalarString(path, 'filelist path', true);
        if (mode !== 'f' && mode !== 'F') throw new TypeError('filelist mode must be f or F');
        return Object.freeze({ path, mode });
      })
    ),
    includeDirs: strings(includeDirs, 'includeDirs'),
    defines: strings(defines, 'defines')
  });
  if (!design.files.length && !design.filelists.length)
    throw new TypeError('Provide files or filelists');
  const args = Object.freeze([
    '--top',
    top,
    ...design.files.map((path) => resolve(cwd, path)),
    ...design.filelists.flatMap(({ path, mode }) => [`-${mode}`, resolve(cwd, path)]),
    ...design.includeDirs.flatMap((path) => ['-I', resolve(cwd, path)]),
    ...design.defines.flatMap((value) => ['-D', value])
  ]);
  return { design, args };
}

/** An in-memory design lifetime fence, not a persistent task/history service. */
export class NativeAnalysisSession {
  #options;
  #sessionId = randomUUID();
  #state = 'empty';
  #binding = null;
  #host;
  #transition;
  #disposal;
  #receipts = new WeakSet();

  constructor(options) {
    try {
      this.#options = hostOptions(options);
    } catch (cause) {
      if (cause instanceof NativeAnalysisError) throw cause;
      throw new NativeAnalysisError(
        'invalid_request',
        'Cannot read host options',
        emptyDetails(),
        cause
      );
    }
  }

  get state() {
    return this.#state;
  }
  get binding() {
    return this.#binding;
  }
  get activeCount() {
    return this.#host?.activeCount ?? 0;
  }

  #available() {
    if (this.#state === 'disposed')
      throw new NativeAnalysisSessionError('disposed', 'The analysis session is disposed');
    if (this.#state === 'replacing')
      throw new NativeAnalysisSessionError(
        'replacing',
        'Wait for design replacement to close the old processes'
      );
  }

  setDesign(input) {
    try {
      this.#available();
      let snapshot;
      try {
        snapshot = input === null ? null : designSnapshot(input);
      } catch (cause) {
        throw new NativeAnalysisSessionError(
          'invalid_request',
          'Invalid design input',
          undefined,
          undefined,
          cause
        );
      }
      this.#available(); // Input getters can reenter replacement or disposal.
      const binding =
        snapshot === null
          ? null
          : Object.freeze({
              sessionId: this.#sessionId,
              generation: randomUUID(),
              design: snapshot.design,
              args: snapshot.args
            });
      this.#binding = null; // Invalidate before any asynchronous cleanup, including equal-input reloads.
      this.#state = 'replacing';
      const old = this.#host;
      const transition = (async () => {
        await old?.dispose();
        if (this.#state === 'disposed')
          throw new NativeAnalysisSessionError(
            'disposed',
            'The analysis session was disposed during replacement'
          );
        this.#host =
          binding === null
            ? undefined
            : new NativeAnalysisHost({ ...this.#options, cwd: binding.design.cwd });
        this.#binding = binding;
        this.#state = binding === null ? 'empty' : 'ready';
        return binding;
      })();
      this.#transition = transition;
      const detach = () => {
        if (this.#transition === transition) this.#transition = undefined;
      };
      transition.then(detach, detach);
      return transition;
    } catch (cause) {
      return Promise.reject(cause);
    }
  }

  async run(request) {
    this.#available();
    const binding = this.#binding,
      host = this.#host;
    if (binding === null || !host)
      throw new NativeAnalysisSessionError('no_design', 'Set a design before running analysis');
    let result;
    try {
      record(request, 'request');
      const { tool, args: analysisArgs, format, signal, onStderr, cwd } = request;
      if (cwd !== undefined)
        throw new NativeAnalysisSessionError(
          'invalid_request',
          'Session calls cannot override design cwd',
          binding
        );
      const snapshot = requestSnapshot(
        { tool, args: analysisArgs, format, signal, onStderr },
        binding.design.cwd
      );
      if (this.#binding !== binding)
        throw new NativeAnalysisSessionError(
          'stale_result',
          'Design changed while reading analysis parameters',
          binding
        );
      const args = Object.freeze([...binding.args, ...snapshot.args]);
      const parameters = Object.freeze({
        tool: snapshot.tool,
        args,
        cwd: binding.design.cwd,
        format: snapshot.format
      });
      result = await host.run({ ...snapshot, args });
      if (this.#binding !== binding)
        throw new NativeAnalysisSessionError(
          'stale_result',
          'Analysis belongs to a replaced design',
          binding,
          result
        );
      const receipt = Object.freeze({
        binding,
        request: parameters,
        result: Object.freeze(result)
      });
      this.#receipts.add(receipt);
      return receipt;
    } catch (cause) {
      if (
        this.#binding !== binding &&
        !(cause instanceof NativeAnalysisSessionError && cause.code === 'stale_result')
      )
        throw new NativeAnalysisSessionError(
          'stale_result',
          'Analysis belongs to a replaced design',
          binding,
          result,
          cause
        );
      throw cause;
    }
  }

  isCurrent(receipt) {
    return (
      this.#state === 'ready' && this.#receipts.has(receipt) && receipt.binding === this.#binding
    );
  }

  assertCurrent(receipt) {
    if (!this.isCurrent(receipt))
      throw new NativeAnalysisSessionError(
        'stale_result',
        'Receipt is foreign or its design has changed',
        this.#receipts.has(receipt) ? receipt.binding : undefined,
        this.#receipts.has(receipt) ? receipt.result : undefined
      );
    return receipt;
  }

  dispose() {
    if (this.#disposal) return this.#disposal;
    this.#state = 'disposed';
    this.#binding = null;
    this.#disposal = Promise.all([this.#host?.dispose(), this.#transition?.catch(() => {})]).then(
      () => {
        this.#host = undefined;
      }
    );
    return this.#disposal;
  }
}
