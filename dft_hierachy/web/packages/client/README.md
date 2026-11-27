# @hier/client

M4 browser-safe typed client for protocol 2 / schema 7. Core now implements
`serve`; an M3/schema 6 process is explicitly rejected. Implementation and
independent acceptance status are tracked in [the M4 plan](../../../docs/plans/M4.md).

```ts
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";

// Node/Electron main process only. command and args are passed without a shell.
const transport = createProcessTransport({ command: "/path/to/hier", args: ["serve", "design.sv"] });
const client = new HierClient(transport);
try {
  const snapshot = await client.ready;
  const roots = await client.roots();
  console.log(snapshot.snapshotId, roots.result, roots.completeness);
} finally {
  client.dispose();
  await transport.exited;
}
```

The root entry exports `HierClient`, `HierError`, `isHierError`, `Transport`, `Reply`, `PageReq`
and the original `CLIENT_PROTOCOL_VERSION`. It has no Node/Electron dependency.
The Node entry owns exactly one child. A browser or IPC host supplies its own
`Transport` following DESIGN 5.6.5: asynchronous messages, unique receiver,
independent unsubscribe, sticky asynchronous close, and first-binding buffering.

All 27 query methods validate parameters and responses using generated schema
code. Query results and the initial snapshot are deeply frozen. Concurrent equal
queries share a request; each caller's AbortSignal remains independent. Only
complete ports/params/bindings replies enter the bounded LRU. `dispose` rejects
pending work, releases listeners/cache and closes the transport. `HierError`
preserves code/origin/message/data; a query error does not fail the connection.
`isHierError(value)` recognizes errors constructed by this client module (including
subclasses) without reading properties or prototypes of arbitrary thrown values.
It returns false for wrapped proxies and forged prototypes; separate module copies
do not share this identity registry. Existing constructors and `instanceof` are
unchanged. C-ORCH-6 approved this additive boundary, and B-ORCH-6 independently
verified it with the Source runtime.

The process transport retains at most 256 initial frames / 4 MiB JSON bytes until
the first actual message delivery, and the last 64 KiB of stderr. An empty initial
delivery microtask does not release the limit. Raw UTF-8, duplicate keys and
unterminated EOF are checked before client validation. Original numeric integrality
is preserved for generated response validation, including the pending method's
result; legal integer spellings such as `1.0` and `1e0` remain accepted.
Explicit `close` uses `shutdownGraceMillis`
(default 2000, 0 for immediate termination); natural EOF/fault cleanup uses the
default grace to collect the actual OS exit status before forced cleanup. The
`exited` promise settles after owned process/stdio cleanup, independently of
external subscriptions. Core bounds its own output records separately; large
legal replies are not restricted to the initial client buffering limit.
All wire strings, including keys and unknown extension values, must contain
Unicode scalar values. Valid surrogate pairs and escaped NUL are preserved,
without normalization. Invalid outbound parameters fail locally with `bad_request`
and send nothing; malformed raw incoming strings close the Node transport with
`invalid_frame`. Invalid strings from a custom Transport cause `protocol_error`.
The frozen cases and acceptance status are tracked in
[the schema notes](../../../protocol/schema/README.md).

## Electron renderer entry

`@hier/client/electron/renderer` provides `connectElectronTransport` and the
`ElectronBridge`, `ElectronEvent`, `ElectronFailure`, and `ElectronConnectResult`
types. It imports neither Node nor Electron. A trusted host supplies the named
bridge capabilities; the renderer claims a configured session and then creates
one SDK. It cannot choose a command, read a file, or start a process.

```ts
import { HierClient } from "@hier/client";
import {
  connectElectronTransport,
  type ElectronBridge,
} from "@hier/client/electron/renderer";

export async function readRoots(bridge: ElectronBridge) {
  const client = new HierClient(await connectElectronTransport(bridge));
  try {
    await client.ready;
    return await client.roots();
  } finally {
    client.dispose();
  }
}
```

The first message subscription schedules `start`; incoming JSON text keeps its
original numeric evidence through SDK validation. The shared inbox applies the
same 256-frame / 4 MiB initial limit. Closing is immediate locally, cancels queued
delivery, and releases the claimed bridge registration. Session IDs are opaque
IPC routing data and do not replace the Core snapshot.

## Electron main and preload

The optional Electron peer is pinned to **42.3.3**, the tested host baseline.
Install the workspace dependencies, then run `npm --prefix web run install:electron`
to provision the binary explicitly. A browser-only consumer need not install Electron.
The host owns Electron updates and application packaging.

In the trusted main process, load the approved document first, then call
`createElectronSession({ webContents, documentUrl, process })` from
`@hier/client/electron/main`. `process` is the existing `ProcessTransportOptions`;
command/args/cwd/env never come from renderer IPC. Keep the returned session and
await `session.exited` after `session.close()` before opening a replacement.
The host must also handle `window-all-closed` / `before-quit` so application exit
waits for all owned sessions; destroying a window does not itself await child cleanup.
A navigation (including same-document), renderer loss or window destruction
closes the session independently of renderer cooperation.

The preload calls `exposeElectronBridge("hierBridge")` from
`@hier/client/electron/preload` once. Bundle the preload to a **single CJS file**
with Electron external (for example esbuild `--bundle --platform=node --format=cjs
--external:electron`). Use `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`. Only the six named bridge members are exposed.
The renderer passes that bridge to the existing renderer factory above.
Main forwards validated original JSON text and owns one process; it creates no SDK.

For an ESM application entry, schedule startup with
`app.whenReady().then(async () => { /* create/load window, then session */ })`.
Do not top-level await `app.whenReady()` during Electron's main-module loading.
See the [host production plan](../../../docs/plans/M5-electron-host-production.md)
for exact test results, known fixture startup limitations and B/C acceptance status.

From the repository root:

```sh
npm --prefix web run check
npm --prefix web run test:client
HIER_SCHEMA_PYTHON=/path/to/python-with-jsonschema npm --prefix web run test:schema
HIER_BIN=/path/to/own/hier npm --prefix web run test:core
HIER_BIN=/path/to/own/hier npm --prefix web run test:independent:m4
npm --prefix web run test:independent:m5:electron-renderer
npm --prefix web run test:independent:m5:electron-host
HIER_BIN=/path/to/own/hier npm --prefix web run test:independent:m5:electron-host:core
HIER_BIN=/path/to/own/hier npm --prefix web run test:independent:m5:electron-host:e2e
HIER_BIN=/path/to/own/hier npm --prefix web run test:independent
```

The full independent entry includes the implemented M5 selection, tree,
properties, renderer, Source and Electron host units. Host dependency-input tests
and actual Electron E2E are reported separately. The M4 subset includes the real Core E2E; the Core integration command
additionally exercises all 27 methods through the SDK.

B maintained S01/S02 for the reviewed `isHierError` addition, preserving the
original pre-refactor inputs and failures. The M4 gate now includes 26 identity
runtime cases; S02 checks the old/new public type consumers and 7 type negatives.
The Source gate also includes 4 precise disposal-order cases. See the
[gate closeout plan](../../../docs/plans/M5-source-gate-closeout.md) for actual results.
