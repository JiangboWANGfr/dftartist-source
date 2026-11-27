# Source candidates contract evidence

DESIGN §6.11 is the normative proposal. These files prepare C review and B's
independent freeze; they do not implement or independently accept the new model.
The declaration is isolated from production exports and package build inputs.

From the repository root, after installing the existing web dependencies:

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/tsconfig.source-candidates.json
node web/contracts/source-candidates/verify-types.mjs
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/source-candidates/sdk-core-witness.test.mjs
```

The compiler verifier checks the strict positive consumer, then removes each of
20 expected-error directives separately in memory and requires a diagnostic on
that specific following line. It also rejects Node/React/Electron type leakage.
It executes no model or host coordination runtime.

The five witnesses use the existing public SDK, Node transport and real Core.
They copy A's existing Source fixture into temporary directories, verify all five
definition/occurrence/statement hits across LF and CRLF pagination (1/2/2), whole
line versus byte-column queries, empty hits, cursor query binding, unchanged
snapshot positions after disk edits and cross-session stale cursors. Cleanup
waits for every owned Core process to exit. No B fixture/oracle is modified.
Changing the page limit is a Core capability check; the proposed model fixes its
own page size for its lifetime.

This does not exercise SourceCandidatesModel, partial responses, input getters,
observer/task ordering, automatic index-ready refresh, editor UTF-16 conversion,
Selection coordination or Electron/UI. Those require the corresponding frozen
tests and implementation. In particular, the fixture proves that `definition`
range kind can belong to both a definition and instances; it does not establish
a general reference discriminator.

Actual cycle9 commands, red development output, final results, source hashes and
artifact provenance are archived in
[A's evidence](../../../docs/m5_source_candidates_contract_a_verification.json).
The Core artifact was reused from this checkout; no fresh native build or new
full-suite result is claimed by this contract unit.
