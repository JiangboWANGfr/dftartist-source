import { spawn } from 'node:child_process';
import { addAbortListener } from 'node:events';
import { join } from 'node:path';
import {
  NativeAnalysisError,
  emptyDetails,
  hostOptions,
  requestSnapshot,
  signalAborted,
  signalReason
} from './boundary.mjs';

const reportExits = new Set([0, 1, 4]);
const errorExits = new Set([2, 3, 5, 130]);
const removeEventListener = EventTarget.prototype.removeEventListener;

/** Owns only one-shot analysis processes; it does not implement the Core NDJSON protocol. */
export class NativeAnalysisHost {
  #options;
  #jobs = new Set();
  #disposed = false;
  #disposal;

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

  get disposed() {
    return this.#disposed;
  }
  get activeCount() {
    return this.#jobs.size;
  }

  run(request) {
    try {
      if (this.#disposed)
        throw new NativeAnalysisError('disposed', 'The analysis host is disposed');
      const snapshot = requestSnapshot(request, this.#options.cwd);
      // Reading caller-owned request properties can reenter dispose().
      if (this.#disposed)
        throw new NativeAnalysisError('disposed', 'The analysis host is disposed');
      const job = new AnalysisProcess(this.#options, snapshot);
      this.#jobs.add(job);
      job.result.then(
        () => this.#jobs.delete(job),
        () => this.#jobs.delete(job)
      );
      job.launch();
      return job.result;
    } catch (cause) {
      return Promise.reject(
        cause instanceof NativeAnalysisError
          ? cause
          : new NativeAnalysisError(
              'invalid_request',
              'Cannot read analysis request',
              emptyDetails(),
              cause
            )
      );
    }
  }

  dispose() {
    if (this.#disposal) return this.#disposal;
    this.#disposed = true;
    const jobs = [...this.#jobs];
    // Set the promise before invoking any abort/child callbacks.
    this.#disposal = Promise.all(jobs.map((job) => job.closed)).then(() => undefined);
    for (const job of jobs) job.stop('cancelled', 'The analysis host was disposed');
    return this.#disposal;
  }
}

class AnalysisProcess {
  #options;
  #request;
  #child;
  #finished = false;
  #failure;
  #timeout;
  #killTimer;
  #abortRegistration;
  #chunks = { stdout: [], stderr: [] };
  #sizes = { stdout: 0, stderr: 0 };
  #resolve;
  #reject;
  #closed;
  #abort = () =>
    this.stop('cancelled', 'Analysis was cancelled', signalReason.call(this.#request.signal));
  #stdout = (chunk) => this.#capture('stdout', chunk);
  #stderr = (chunk) => {
    this.#capture('stderr', chunk);
    if (!this.#finished && !this.#failure && this.#request.onStderr) {
      try {
        const returned = this.#request.onStderr(new Uint8Array(chunk));
        if (returned !== null && returned !== undefined && typeof returned.then === 'function') {
          // Logging is synchronous. Observe an async rejection even though this API rejects its use.
          void Promise.resolve(returned).catch(() => {});
          throw new TypeError('onStderr must be synchronous');
        }
      } catch (cause) {
        this.stop('callback_failed', 'onStderr threw', cause);
      }
    }
  };
  #stdoutError = (cause) => this.stop('output_io', 'Cannot read analysis stdout', cause);
  #stderrError = (cause) => this.stop('output_io', 'Cannot read analysis stderr', cause);
  #processError = (cause) =>
    this.stop('spawn_failed', 'Cannot start or signal the analysis process', cause);
  #close = (code, signal) => this.#finish(code, signal);

  constructor(options, request) {
    this.#options = options;
    this.#request = request;
    this.result = new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
    this.closed = new Promise((resolve) => {
      this.#closed = resolve;
    });
  }

  launch() {
    const { signal, tool, args, cwd } = this.#request;
    if (signal && signalAborted.call(signal)) {
      this.stop('cancelled', 'Analysis was cancelled before launch', signalReason.call(signal));
      return;
    }
    try {
      if (signal) this.#abortRegistration = addAbortListener(signal, this.#abort);
    } catch (cause) {
      this.stop('invalid_request', 'Cannot register the analysis cancellation listener', cause);
    }
    // Registration calls public signal methods, which can throw or synchronously stop this job.
    // A returned registration may therefore arrive after finish() has already run.
    if (this.#finished) {
      this.#releaseAbort();
      return;
    }
    if (signal && signalAborted.call(signal)) {
      this.#abort();
      return;
    }
    try {
      this.#child = spawn(
        join(this.#options.binaryDirectory, tool + (process.platform === 'win32' ? '.exe' : '')),
        args,
        { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (cause) {
      this.stop('spawn_failed', 'Cannot start the analysis process', cause);
      return;
    }
    this.#child.once('error', this.#processError);
    this.#child.once('close', this.#close);
    this.#child.stdout.on('data', this.#stdout);
    this.#child.stderr.on('data', this.#stderr);
    this.#child.stdout.on('error', this.#stdoutError);
    this.#child.stderr.on('error', this.#stderrError);
    this.#timeout = setTimeout(
      () => this.stop('timeout', 'Analysis exceeded timeoutMs'),
      this.#options.timeoutMs
    );
  }

  #capture(stream, chunk) {
    if (this.#finished) return;
    const limit = stream === 'stdout' ? this.#options.maxStdoutBytes : this.#options.maxStderrBytes;
    const keep = Math.min(chunk.length, limit - this.#sizes[stream]);
    if (keep > 0) {
      this.#chunks[stream].push(Buffer.from(chunk.subarray(0, keep)));
      this.#sizes[stream] += keep;
    }
    if (keep < chunk.length)
      this.stop('output_limit', `Analysis ${stream} exceeded its byte limit`);
  }

  stop(code, message, cause = undefined) {
    if (this.#finished || this.#failure) return;
    this.#failure = { code, message, cause };
    if (!this.#child) {
      this.#finish(null, null);
      return;
    }
    // Keep draining both pipes and retain ownership until close, including escalation.
    this.#child.kill('SIGTERM');
    this.#killTimer = setTimeout(() => this.#child.kill('SIGKILL'), this.#options.killGraceMs);
  }

  #releaseAbort() {
    const registration = this.#abortRegistration;
    this.#abortRegistration = undefined;
    try {
      registration?.[Symbol.dispose]();
    } catch (cause) {
      this.#failure ??= {
        code: 'invalid_request',
        message: 'Cannot release the analysis cancellation listener',
        cause
      };
    } finally {
      // Also remove after a wrapper delegates then throws before returning a registration.
      // Use the native method so a caller's removeEventListener cannot prevent cleanup.
      if (this.#request.signal)
        removeEventListener.call(this.#request.signal, 'abort', this.#abort);
    }
  }

  #finish(exitCode, signal) {
    if (this.#finished) return;
    this.#finished = true;
    clearTimeout(this.#timeout);
    clearTimeout(this.#killTimer);
    this.#releaseAbort();
    const child = this.#child;
    if (child) {
      child.removeListener('error', this.#processError);
      child.removeListener('close', this.#close);
      child.stdout.removeListener('data', this.#stdout);
      child.stderr.removeListener('data', this.#stderr);
      child.stdout.removeListener('error', this.#stdoutError);
      child.stderr.removeListener('error', this.#stderrError);
    }
    const details = {
      tool: this.#request.tool,
      ...(child?.pid === undefined ? {} : { pid: child.pid }),
      exitCode,
      signal,
      stdout: Buffer.concat(this.#chunks.stdout),
      stderr: Buffer.concat(this.#chunks.stderr)
    };
    this.#chunks = { stdout: [], stderr: [] };
    try {
      if (this.#failure) {
        const { code, message, cause } = this.#failure;
        throw new NativeAnalysisError(code, message, details, cause);
      }
      if (signal !== null || (!reportExits.has(exitCode) && !errorExits.has(exitCode)))
        throw new NativeAnalysisError(
          'process_failed',
          'Unexpected analysis process exit',
          details
        );
      const kind = reportExits.has(exitCode) ? 'report' : 'backend_error';
      const format = kind === 'backend_error' ? 'json' : this.#request.format;
      let payload;
      try {
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          details.stdout
        );
        payload = format === 'json' ? JSON.parse(text) : text;
        if (
          format === 'json' &&
          (payload === null || typeof payload !== 'object' || Array.isArray(payload))
        )
          throw new TypeError('Expected a JSON object');
      } catch (cause) {
        throw new NativeAnalysisError(
          'output_invalid',
          `Invalid ${format} analysis output`,
          details,
          cause
        );
      }
      this.#resolve({ ...details, kind, format, payload });
    } catch (cause) {
      this.#reject(cause);
    } finally {
      this.#closed();
    }
  }
}
