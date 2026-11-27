# Historical source navigation proposal and capability evidence

[DESIGN §6.13](../../../docs/DESIGN.md) is the normative contract, accepted by C16
with B16's input freeze. The production `SourceNavigationModel` is now implemented;
see the [runtime plan](../../../docs/plans/M5-source-navigation-runtime.md) and
`npm --prefix web run test:independent:m5:source-navigation` for current validation.
The isolated proposal and capability evidence below belong to the historical
`a02a20c` baseline; they do not replace independent runtime acceptance.

The proposed coordinator owns its two private source models and borrows the SDK.
Its state references the original document and candidate states. A candidate
binding carries the exact displayed document and original-text UTF-16 offset;
the existing `queryAt` performs coordinate conversion. New document publication
invalidates the binding even if its text, hash and query values are unchanged.

An index-ready event can arrive before a partial reply. The proposal records the
event against the current intent and waits for that command to settle before a
bounded reload. Cancellation, replacement and disposal invalidate queued work.
Each automatic reload has a frozen refresh handle with an observable completion
promise. This bridge does not promise identity with the private model's promise.
It also reports listener failures when the candidate state itself succeeded.

The C-86 revision in DESIGN §6.13.3 defines when an event is covered: an automatic
reload captures the latest recorded event before calling its private candidate
reload, before pending publication, and does not recapture it at SDK send time.
Ordinary loadMore and same-binding locate retain the current event baseline,
including retries after failure. Explicit reload, new binding and resume after
cancellation use the documented intent reset rules. The two previously ambiguous
sequences were specified at b55f27d; C16 and B16 subsequently closed C-86 and
B-NAV-Q1/Q2 independently and supplied the runtime implementation prerequisites.

The compile-only consumer observes that completion immediately and checks its
identity again before late feedback. It does not implement scheduling, a source
view or a substitute coordinator. Selection address discrimination is a separate
contract: existing opaque SourceHit references cannot be classified using kind,
prefixes, a missing inst field or a failed object query.

## Type checks

From the repository root, using the existing web toolchain:

```sh
node web/node_modules/typescript/bin/tsc -p web/contracts/tsconfig.source-navigation.json
node web/contracts/source-navigation/verify-types.mjs
```

The verifier compiles the strict positive consumer, then removes each of 28
expected-error directives separately in memory. Each case must produce a
semantic diagnostic on the guarded line and no unrelated diagnostic. It checks
for Node, React and Electron type leakage. The consumer is not executed; these
checks cannot prove document identity, event ordering, freezing or task cleanup.

## Historical existing capabilities (a02a20c only)

Run this witness only on its fixed historical checkout. Its explicit missing
coordinator assertion is preserved and is expected to reject today's runtime.

```sh
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/source-navigation/capabilities.test.mjs
```

Three A witnesses use only existing production interfaces:

1. A controlled Transport feeds the real SDK a ready event before a partial
   candidate reply. The raw model retains that partial until an explicit reload;
   a later index subscriber receives no replay. No automatic coordinator is
   simulated, and this case is not a Core or Electron test.
2. A real candidate model can publish success while its command rejects an
   AggregateError containing the original listener throw. Reading only state.error
   would miss this command failure.
3. The real SDK/Node/Core chain reads the existing A source fixture. Reloading a
   document produces a new wrapper while an independent candidate model retains
   its old state. queryAt rejects the old document, model disposal emits no
   notification, and disposing models leaves the borrowed SDK usable. Every owned
   process is awaited on teardown; input files are only read.

The witness explicitly requires the new coordinator to be absent. It belongs to
this proposal's fixed production baseline and is not a future runtime acceptance
test. Core and fixture hashes are printed; no M7 timing claim is made.

## Reference use

HAL `acc899e297ed3866ad7da432ab0403c3d8d62d1c` (local MIT license) separates shared
selection and detail-panel presentation in `selection_relay.cpp:95–118` and
`selection_details_widget.cpp:289–362`. We borrow responsibility boundaries, not
Qt implementation, global state or its synchronous layout path.

The old `dft_planner/dft-suite/src/hierarchy/HdlSourceTab.tsx:31–39` clears content
and ignores late reads after effect cleanup. Its `store.ts:698–743` navigation
does not guard request generations. The new contract keeps the Core FileRef and
publication identity instead of copying that path-read/store flow. The old
project is private and has no local git version/license declaration; it remains
read-only reference. Full paths, hashes and limits are recorded in the plan and
the A evidence archive.
