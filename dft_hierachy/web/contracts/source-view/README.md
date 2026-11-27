# Controlled read-only SourceView proposal

[DESIGN §6.14](../../../docs/DESIGN.md) is the normative contract.
This is a compile-only consumer of the existing public `SourceDocumentState`.
`SourceView` is now a production export. C19/C20 accepted the contract including
Q1/Q2, and B20 closed both questions with 19 additional frozen DOM cases.
See the [runtime plan](../../../docs/plans/M5-source-view-runtime.md) for actual
implementation and verification; independent runtime acceptance remains pending.
This folder supplies no runtime or DOM oracle.

The host owns its SDK, models and subscriptions, and passes
`navigation.state.document` (or a standalone document model's state) by reference.
The view displays original text and the existing exact UTF-16 range, or the changed
warning. It never reads files, issues commands, guesses offsets or chooses a
Selection address. Local scrolling follows a newly displayed document; ordinary
rerenders preserve the user's scroll. Error display consumes only typed strings,
not arbitrary diagnostic data. See §6.14 for empty ranges, lifecycle and accessibility.

The Q1 clarification explicitly rejects JavaScript `className: undefined` with a
TypeError; omission and an empty primitive string remain valid. This runtime rule
is not inferred from TypeScript's exact-optional-property rejection.
Q2 applies to nonempty exact ranges, empty ranges/EOF and changed warnings alike:
the focusable source scroll container itself must directly reference the visible
description outside `code` through `aria-describedby`. Empty/short text uses that
same container even without overflow. An association on an ancestor alone is
insufficient; a `pre` is valid if it is itself that container. Tags and ID spelling
are not prescribed.

## Type verification

From the repository root with the existing web and tree experiment dependencies:

```sh
node web/node_modules/typescript/bin/tsc -p web/contracts/tsconfig.source-view.json
node web/contracts/source-view/verify-types.mjs
```

The verifier compiles the strict consumer, then removes each of 20 expected-error
directives separately in memory. Each must produce a semantic error on its guarded
line, with no unrelated errors. It confirms production document declarations and
React types are consumed, with no Node or Electron types. This deliberately uses
the existing experiment's `@types/react` 18.3.26, without installing a dependency
or adding a production peer. Finite/positive height, nonblank labels, actual DOM,
text fidelity, scrolling and accessibility are runtime obligations, not type claims.

The production component uses React peer `>=18.3.1 <19`,
host ReactDOM 18, acceptance at 18.3.1. The package subpath
`@hier/views/source-view.css` now ships static CSS. Runtime acceptance must consume
the actual packed package and CSS from outside the monorepo. Existing exported
version constants and four-package boundaries remain intact.

## References and limits

The read-only old `dft_planner/dft-suite/src/hierarchy/HdlSourceTab.tsx` supplies
an example of a shared definition/instantiation panel. Its component-owned read,
module-global scroll memory, newline splitting and HDL lexer are not adopted.
Kactus2 `342bc30c2947afe0e2a479f75fed9449102f71a4`,
`editors/CSourceEditor/CSourceWidget.cpp`, separates source display/document
responsibilities. Its Qt editing/saving and text-mode IO are not adopted. This
inspection extends the existing D research; it is not a competitor GUI run or a
new editor framework evaluation. Reference file hashes and actual commands are
recorded in A's verification archive and execution plan.
