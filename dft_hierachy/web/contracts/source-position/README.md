# Source position contract evidence

Historical proposal evidence at `42a9256`. The production implementation and
current verification commands are recorded in the
[runtime plan](../../../docs/plans/M5-source-position-runtime.md). In particular,
the capability witness below intentionally asserts that `queryAt` is absent and
belongs to that historical checkout; it is not a current runtime test.

[DESIGN §6.12](../../../docs/DESIGN.md) is the normative proposal. These files
prepare C review and B's independent freeze. The declaration extends the current
production `SourceDocumentModel` in isolation, preserving its constructor and
members and adding only synchronous `queryAt(document, utf16Offset)`. It is not
part of the production package exports or build inputs.

The result reuses `SourceCandidatesQuery` and requires a readonly `col`. The new
`SourcePositionError` has its own four-code union; the existing
`SourceDocumentErrorCode` union is unchanged. The error constructor accepts only
the code and message, without a cause/options parameter or inspection contract.

## Intended runtime boundary

The method first rejects disposed models, then requires a success state whose
`data` is strictly identical to the supplied document. It does not read fields
from a stale document argument: clones, proxies and another model's documents
cannot substitute for the current published wrapper. It next rejects changed
documents, then validates an original primitive safe integer offset from zero
through the unmodified text's UTF-16 length, excluding surrogate-pair and CRLF
interiors. These checks and their order require runtime verification.

The intended mapping accepts positions outside the highlighted source span and
allows EOF. It preserves BOM, combining characters and tabs without normalization
or display-width conversion. It returns a frozen snapshot/file/line/column query
without querying, notifying, selecting or subscribing. It can be read during a
success notification; a later published data wrapper replaces document identity.

The consumer captures the document supplied to the display, maps a click and
immediately consumes `candidates.load(query)`'s original promise. Deferred clicks
invoke `queryAt` again when their callback runs; they do not reuse a query mapped
before queuing. A returned query is a snapshot value, not a revocable proof of
current display identity. Candidate response/document coordination, automatic
index-ready refresh, Selection and SourceView lifecycle remain separate work.

## Type checks

From the repository root, with the existing web dependencies installed:

```sh
PATH=/Users/jiangbowang/.npm-global/bin:$PATH node web/node_modules/typescript/bin/tsc -p web/contracts/tsconfig.source-position.json
PATH=/Users/jiangbowang/.npm-global/bin:$PATH node web/contracts/source-position/verify-types.mjs
```

The verifier compiles the strict consumer with no diagnostics, then removes each
of 20 expected-error directives separately in memory. It requires a diagnostic
on that specific following line and rejects unrelated diagnostics. The checks
cover inherited construction and async commands, document/offset parameters,
synchronous return with a required column, readonly query/error fields and the
unchanged old error union. It also checks for Node/React/Electron type leakage.

The consumer is never executed. TypeScript cannot establish document identity,
runtime freezing, Unicode/CRLF boundaries, error priority or absence of SDK side
effects. A structurally compatible cloned document still typechecks and must be
rejected at runtime. These results are declaration checks, not runtime or
independent B/C acceptance, Electron IPC tests or UI integration tests.

## Existing model/Core witness

```sh
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/source-position/model-core-witness.test.mjs
```

This executes only the existing public SourceDocument/Candidates models against
the actual Core. Three cases cover LF and BOM/CRLF, a same-target no-op versus new
reload publication, another model's distinct wrapper, forward UTF-16 display
coordinates and an explicitly authored UTF-8 query with all five occurrences,
plus changed text and restoration. All filesystem writes use temporary copies
of the existing A fixture; every owned Core process is awaited on teardown.

The witness asserts that production still has no `queryAt`. It does not implement
an inverse mapper or verify the new method's error/identity checks. It records the
Core and fixture hashes, and its three cases are separate from B's product count.
