# M5-A-03 source document contract

Contract: DESIGN §6.10. These files retain the original isolated declaration
and SDK capability witness. The production `SourceDocumentModel` now exports from
`@hier/viewmodel`; see the [runtime plan](../../../docs/plans/M5-source-document-runtime.md)
for implementation and the C-ORCH-6 / B-ORCH-6 acceptance of the data unit. It borrows one ready SDK
and loads an explicit object or definition plus SourceKind through `source` followed by `readSource`.

Core owns the snapshot byte span and current file contents/hash. The
model converts a matching span to UTF-16 presentation positions. Changed contents
remain a successful document without an exact range. Reverse candidates, shared
selection coordination and SourceView have subsequent contracts.

Run from the repository root with Node 24 and the existing web toolchain:

```sh
npm --prefix web run typecheck
node web/node_modules/typescript/bin/tsc -p web/contracts/tsconfig.source-document.json
node web/contracts/source-document/verify-types.mjs
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/source-document/sdk-core-witness.test.mjs
```

The type verifier requires a clean strict consumer with no platform types, then
removes each negative marker separately and requires a diagnostic at that line.
It does not run a replacement model. The SDK witness copies authored fixtures to
temporary directories, starts this checkout's actual Core, and closes every
owned session before removing those directories. File mutations affect only the
copies. Its reverse-query checks observe existing Core pagination, not a new
Source model or a selection policy.

The witness verifies LF/CRLF, Unicode byte positions, include/declaration/source
kinds, changed/restored/deleted/invalid UTF-8 files, cancellation before sending,
and distinct reopened snapshots. Pure conversion corner cases such as BOM,
combining marks, lone CR, malformed model replies, observer errors and task races
are now covered by the independently frozen B model inputs (306 controlled cases,
14 actual Core scenarios and 34 production type negatives).
Neither this declaration nor the existing SDK checks count as model acceptance.

The declaration/witness preparation added no production exports. The subsequent
runtime adds the reviewed Source exports and a client `isHierError` identity guard;
no Core headers, IPC, Schema, dependencies or project formats change. Existing B
inputs and historical failures remain unchanged.
