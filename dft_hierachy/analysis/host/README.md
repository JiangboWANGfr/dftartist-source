# Native analysis host for Node

`@dft-studio/native-analysis` runs the four existing native analysis tools from a Node application.
It owns each direct child until its pipes close, retaining the original report bytes and exit status.
The Host/Session root entry uses Node built-ins and requires Node 20.12 or newer. The optional `/reports` entry uses pinned Ajv dependencies to validate the original schemas. TypeScript consumers use their application's Node types.
Native executables are installed separately using the [AnalysisCLI component](../packaging/README.md); use binaries for your platform and architecture.

From this directory, create the local package with `npm pack`. Install that tarball in the consuming application:

```sh
npm install /absolute/path/dft-studio-native-analysis-0.4.0.tgz
```

```js
import { NativeAnalysisHost, NativeAnalysisError } from '@dft-studio/native-analysis';

const prefix = '/absolute/path/analysis-cli';
const host = new NativeAnalysisHost({ binaryDirectory: `${prefix}/bin` });
const controller = new AbortController();
try {
  const result = await host.run({
    tool: 'dft-wrapper',
    args: ['--top', 'wrapper_example', `${prefix}/share/dft-analysis/examples/example.sv`,
      '--config', `${prefix}/share/dft-analysis/examples/chains.json`, '--explain-chains', '--require-complete'],
    signal: controller.signal,
    onStderr: (bytes) => { process.stderr.write(bytes); },
  });
  console.log(result.kind, result.exitCode, result.payload);
} catch (error) {
  if (!(error instanceof NativeAnalysisError)) throw error;
  console.error(error.code, error.details.exitCode, error.details.signal);
} finally {
  await host.dispose();
}
```

`tool` is exactly `dft-seqcheck`, `dft-objects`, `dft-memory` or `dft-wrapper`; executables come from the absolute `binaryDirectory` (with `.exe` on Windows).
`args` are copied and passed unchanged without a shell. `cwd` defaults to the directory captured at host construction and can be overridden per call with another absolute directory.
Strings must contain Unicode scalar values without NUL. The first `--output` argument is rejected: this API captures stdout; later literal `--output` values remain valid native arguments.
The application chooses and trusts the installed binaries. The host does not download, probe, rebuild or authenticate them.

`format` defaults to `json`; `text` is allowed for Wrapper only and requires the corresponding native `--explain-chains --format text` arguments.
The host never inserts or rewrites native analysis arguments. Successful reporting exits 0, 1 and 4 produce `kind: 'report'`, retaining the exact exit code.
Exit 1 can mean a failed check and exit 4 means partial evidence. Exit 0 can still contain a complete conflict.
Backend exits 2, 3, 5 and 130 produce `kind: 'backend_error'` with the original JSON error even when text was requested.
`payload` is the decoded object/text; `stdout` and `stderr` are owned `Uint8Array` bytes. JSON must be strict UTF-8 and a JSON object; text must be strict UTF-8. A BOM is not stripped before JSON parsing.
Use the original installed report Schema for domain validation; object parsing alone is not Schema validation.

Process failures reject with `NativeAnalysisError`. Its `code` is `invalid_request`, `disposed`, `cancelled`, `timeout`, `spawn_failed`, `process_failed`, `output_limit`, `output_invalid`, `output_io` or `callback_failed`.
`details` retains the available tool, pid, exit code, signal and bounded raw streams; `cause` retains an underlying exception or cancellation reason.
Invalid constructor options throw synchronously; `run` always returns a Promise, including for invalid requests.

The default timeout is 30000 ms, termination grace is 250 ms, stdout limit is 16 MiB and stderr limit is 1 MiB.
Configure `timeoutMs` (integer 1–2147483647), `killGraceMs` (0–30000), `maxStdoutBytes` and `maxStderrBytes` (each 1–64 MiB) on the host.
Byte limits retain only the stream prefix, terminate the child and continue draining pipes. No partial stdout report is published.
`onStderr` receives a separate byte copy for synchronous logging while the call is active; it must return without awaiting work.
Throwing or returning a Promise fails the call; an async rejection is observed. Chunks need not end at a UTF-8 character boundary; use a streaming decoder if presenting text.

Abort, timeout, output limit, I/O and callback errors use the first observed termination cause. The host sends SIGTERM then SIGKILL if the child has not closed by the grace deadline.
A pre-aborted signal starts no process. `dispose()` is idempotent, rejects new runs immediately, cancels all owned calls and resolves after their close/cleanup.
`activeCount` tracks calls still owned; cancellation of one call does not cancel another. After completion, the host removes its abort listeners and timers; later aborts have no effect.
Signal registration exceptions reject with `invalid_request` and release ownership. Registration that synchronously cancels or disposes the host starts no child; listeners acquired during that reentry are also removed. Cleanup exceptions preserve an earlier termination cause.

This is a process boundary, not the Core NDJSON transport or a Studio task/session store. An application still attaches its own design/session generation and discards stale responses.
The host manages direct children, with no arbitrary descendant-process guarantee, OS sandbox or hard total time/heap guarantee. A blocked event loop or logging callback delays timers.
Current verification covers macOS arm64. Windows and other platforms require their own native packages and process lifecycle validation.

Run `npm test` for real-child process behavior fixtures. For real domain integration, set `NATIVE_ANALYSIS_BIN` to the installed bin directory and `NATIVE_ANALYSIS_DATA` to its `share/dft-analysis`, then run `npm run test:native`.
The latter suite fails if no native package is supplied; it never substitutes fixtures for the four domain tools.

## Bind analysis to a design lifetime

`NativeAnalysisSession` is an optional in-memory lifecycle boundary above the same process owner.
It shares one copied design input across calls and invalidates results on every reload, including when the selected inputs appear unchanged.
It does not add a second task/history store. An application's existing task service can pass its task's AbortSignal to `run`.

```js
import { NativeAnalysisSession } from '@dft-studio/native-analysis';

const session = new NativeAnalysisSession({ binaryDirectory: '/absolute/analysis-cli/bin' });
try {
  await session.setDesign({ designId: 'project.main', cwd: '/absolute/project', top: 'chip',
    filelists: [{ path: 'rtl/files.f', mode: 'F' }], includeDirs: ['include'], defines: ['WIDTH=8'] });
  const receipt = await session.run({ tool: 'dft-seqcheck', args: ['--scope', 'chip', '--recursive'] });
  session.assertCurrent(receipt); // Check again when an async consumer actually displays/uses it.
  console.log(receipt.result.exitCode, receipt.result.payload);
  await session.setDesign(null); // Cancel/drain outstanding calls and clear the selected design.
  console.log(session.isCurrent(receipt)); // false
} finally {
  await session.dispose();
}
```

The design input requires `designId`, absolute `cwd`, one `top`, and at least one item in `files` or `filelists`.
`files`, `includeDirs`, `defines` and `filelists` preserve array order; a filelist has `path` and explicit mode `f` or `F`.
Relative file/list/include paths resolve lexically against `cwd`. Filelist contents retain the native `-f` working-directory / `-F` containing-file semantics.
The shared `--top`/files/`-f`/`-F`/`-I`/`-D` prefix is followed by the original per-call `args`; there is no per-call cwd override.
The complete final argv/cwd are recorded in `receipt.request`. The caller's analysis arguments are trusted and can include additional native inputs.
This API does not freeze disk files or assert equivalence with a browsing Core: the native report's original input digest/snapshot remain authoritative.

`setDesign(input)` returns a frozen binding containing an instance `sessionId`, fresh `generation`, copied `design` and shared `args`.
The session moves from `empty` to `replacing` to `ready`; `binding` is null while replacing or empty.
Replacement invalidates the old binding immediately, cancels its calls, and waits for their processes/pipes to close before accepting new work.
Concurrent replacement or running during replacement rejects with `NativeAnalysisSessionError/replacing`; callers explicitly await the transition.
Invalid design input leaves the old ready session intact. `setDesign(null)` clears it; `dispose` immediately invalidates it and waits for all work, including replacement.
`activeCount` includes old calls still draining during replacement. No native process starts merely because a design was selected.

`run` returns `{ binding, request, result }`. Metadata is frozen; raw bytes and business payload remain owned mutable data as in the original Host API.
Before publishing, `run` checks the binding again. A call from a replaced/cleared/disposed design rejects with `stale_result`, retaining the old binding and the available original result or native error as `cause`.
Errors in the current generation retain the original `NativeAnalysisError` behavior; backend exits 2/3/5/130 are still original error results.
The generation token represents application intent, not a native `snapshotId` or persistent task ID.

`isCurrent(receipt)` requires both the instance's WeakSet brand and current generation. Copied/forged receipts or receipts from another session fail the check.
`assertCurrent(receipt)` returns it or throws `NativeAnalysisSessionError/stale_result`. Check at the point of later consumption too: the library cannot stop an application from directly reading an old object.
The session does not retain a history of completed receipts. Session error codes are `invalid_request`, `no_design`, `replacing`, `disposed` and `stale_result`.
Constructor option errors retain the original Host error. Design changes and run errors use rejected Promises; `assertCurrent` throws synchronously.

The shipped `examples/session-workflow.mjs` is runnable against an actual installed AnalysisCLI package:

```sh
node node_modules/@dft-studio/native-analysis/examples/session-workflow.mjs /absolute/analysis-cli/bin /absolute/analysis-cli/share/dft-analysis
```

It runs all four native tools, changes the selected design, shows current/stale result labels, and rechecks Wrapper constraints.
Studio RunService/project reconnection remains an application integration task; this package does not claim Studio UI or persistent task integration is complete.

## Validate reports and read matching source

```js
import { NativeAnalysisSession } from '@dft-studio/native-analysis';
import { AnalysisReportReader } from '@dft-studio/native-analysis/reports';

const prefix = '/absolute/analysis-cli';
const session = new NativeAnalysisSession({ binaryDirectory: `${prefix}/bin` });
try {
  const reader = await AnalysisReportReader.open({ schemaDirectory: `${prefix}/share/dft-analysis/schemas` });
  await session.setDesign({ designId: 'project', cwd: '/absolute/project', top: 'chip', files: ['chip.sv'] });
  const receipt = await session.run({ tool: 'dft-seqcheck', args: ['--scope', 'chip', '--recursive'] });
  const report = reader.read(session, receipt, 'urn:dft-studio:analysis:sequential:1');
  if (report.locations.length) {
    const excerpt = await reader.readSource(report, 0, { contextLines: 2 });
    console.log(excerpt.text, excerpt.selection); // UTF16 indices in this exact excerpt.
  }
} finally {
  await session.dispose();
}
```

Use the schema ID for the actual native mode you requested. The reader loads the installed schema closure without network access, preserves original URIs, and rejects unknown IDs or another tool's schema.
It compiles the original draft2020-12 using Ajv8.17.1/ajv-formats3.0.1 with no coercion, defaults or key removal. The selected schema directory and native executables are supplied by the trusted application; schemas are not provenance signatures.
The package bundles the six direct/transitive validator dependencies selected by `npm-shrinkwrap.json`, so a local tarball can install offline without a populated npm cache. Their licenses are in `THIRD_PARTY_NOTICES.txt` and the bundled packages.

`read` copies the receipt's current stdout bytes, parses strict UTF8 JSON, validates against the original schema and freezes an owned payload snapshot. Mutation of the original parsed payload does not alter it.
The report records byte length/SHA256, original binding/argv, kind and exit code. It preserves partial/check-failure/error semantics; it does not recompute domain quality or treat exit0 as a passing check.
Version JSON is not an analysis report. Wrapper text remains available through the original Host API; use JSON for machine validation and source locations.
`locations` are JSON pointers and original objects that pass the original protocol SourceSpan schema. Error envelopes have no source locations.
`reader.isCurrent/assertCurrent` also require the reader's own report brand and delegate to the originating session. Recheck at later consumption, as for receipts.

`readSource(report, locationIndex, options)` only reads a location from a current validated report.
It opens one regular file, reads bounded bytes, and derives both SHA256 and UTF8 text from those same bytes. Changed content returns `source_changed`; missing/non-file content returns `source_unavailable`; invalid text/ranges return `source_invalid`.
It follows normal file aliases used in compilation. POSIX nonblocking open prevents a replaced FIFO from blocking; this is not a path sandbox.
Original offsets are UTF8 bytes. Returned `selection.start/end` are end-exclusive UTF16 offsets in `text`, suitable for JavaScript editors; original span/line/column metadata are retained.
LF and CRLF/BOM are preserved. A start at the first byte after LF belongs to the next line; EOF starts belong to the final line, including an empty final line after LF. Exclusive ends may equal the preceding line's end. A matching digest proves the bytes read match the recorded snapshot content; it does not freeze later disk changes or imply an atomic filesystem version.

## Read a saved report without reviving a design session

`reader.readSaved({ tool, kind, exitCode, stdout }, schemaId)` copies the JSON bytes and applies the same original schemas and limits. Its immutable result is explicitly `historical: true, freshness: 'unknown'`, with no session binding or request. The application must verify its saved artifact identity; this method does not authenticate its source.

`reader.readSavedSource(saved, index, options)` uses the same bounded, hash-checked UTF8/source-range implementation as live source reading. Only this reader's saved brand is accepted. `isCurrent` remains false for saved reports; live `readSource/assertCurrent` do not accept them. Editing disk requires a new analysis when the original hash no longer matches. This does not restore a Core session or make native references current.
Pre-aborted signals skip reads; checks during I/O and before publication reject cancellation or a replaced design, and owned file handles close before completion.

Source defaults are `contextLines: 2` (0–100), `maxFileBytes: 8388608` (1–64MiB), `maxExcerptBytes: 65536` (1–1MiB).
Report limits are 16MiB, depth128, 1000000 visited nodes and 10000 source locations. The schema tree permits 256 regular schemas, 2MiB each/16MiB total/depth8, without internal symlinks or missing references.
Limits fail explicitly, without publishing a truncated report or pretending a partial excerpt is complete. These bounds do not provide a hard total time/heap guarantee.

Reader errors are `AnalysisReportError` with `code`, `details` and `cause`: `invalid_request`, `schema_invalid`, `unknown_schema`, `wrong_tool`, `json_required`, `not_report`, `report_invalid`, `report_limit`, `source_unavailable`, `source_changed`, `source_invalid`, `source_limit`, `cancelled`, `stale_result`.
The original session's stale-result errors are preserved. Source reads are asynchronous; `read/assertCurrent` validate synchronously.

The additional shipped example copies inputs to a private temporary directory, validates a real Wrapper conflict, reads its matching source, edits the temporary constraints, invalidates the old generation and rechecks:

```sh
node node_modules/@dft-studio/native-analysis/examples/report-source-workflow.mjs /absolute/analysis-cli/bin /absolute/analysis-cli/share/dft-analysis
```

This is a Node report consumer. Studio task persistence, reconnection and UI wiring remain separate application work.
