# B C-76 focused freeze

Specification: DESIGN 6.7 at b753daa6222ba942d900d38368dde67730dbde26,
SHA256 163ae6caf3eb6698c2d72e5af9eb9cc492a4f957bac9d58a2b8d10c78dfbb3ad.
C has approved this contract revision and closed C-76. B Q01/Q02/Q03 are resolved.
This package freezes **only 24 focused cases**, not the complete 95-entry UI matrix.

From the repository root, with Node 24:

```sh
export HIER_B_PRODUCT_ROOT=/absolute/path/to/your/fixed/product
npm --prefix web/tests/independent-tree-view/c76/browser ci --offline --no-audit --no-fund --ignore-scripts --workspaces=false
export HIER_B_REACT_TYPES="$PWD/web/tests/independent-tree-view/c76/browser/node_modules/@types/react/index.d.ts"
node web/tests/independent-tree-view/c76/verify-revised-types.mjs
node web/tests/independent-tree-view/c76/browser/run.mjs --list
node web/tests/independent-tree-view/c76/browser/run.mjs --self-check
node web/tests/independent-tree-view/c76/browser/run.mjs
```

A matching Playwright Chromium must already be installed for these browser runs.
Do not change the pinned package/lock to fit another browser. Self-check and default
test use new browser instances and a loopback-only, ephemeral B-owned HTTP server;
both release pages, models, clients, browser and server in cleanup.

The revised type adapter copies the original B consumer and verifier unchanged to
an owned temporary compile workspace, replacing only proposal.d.ts with this
revision's exact public declaration. It retains the workspace for evidence and
compares source/copy SHA before and after. This is a type/build binding adaptation,
not an oracle rewrite or a substitute implementation.

The browser host uses real SDK, TreeModel and SelectionModel. The controlled
Transport responds with handwritten lawful protocol fixtures. Public method spies
delegate calls, return the original command Promise/void, and rethrow exact original
values. They observe identities and a microtask checkpoint, not private model state.
The separate React fixture-control button is **not HierarchyTree** and is never
substituted for the missing component.

`--self-check` validates actual development React StrictMode replay, native click,
SDK pagination, source-row disappearance, original observer errors, and cleanup.
It does not mount the production tree or count any of the 24 cases as passed.
Default mode always targets the real @hier/views export; missing HierarchyTree
fails capability with zero semantic cases executed. No skip/xfail/fake component
makes that gate green. The initial 21-case authoring inventory is retained in
evidence; three additional undefined/remount branches produce the final 24 cases.

All case inputs, expected outcomes and normative basis are emitted by --list.
No prototype source, A self-test, C probe, private RowId/DOM naming scheme or CSS
class is used as an oracle. DOM selection uses the published row order and public
roles in small fixtures that fit the viewport. Page/frame waits are watchdogs,
not performance SLAs; there is no fixed sleep race.

See [updated matrix](../../../../docs/M5_B_TREE_VIEW_ACCEPTANCE_C76.md) and
[focused report](../../../../docs/M5_B_TREE_VIEW_C76.md).
Full UI props, general keyboard/focus/virtualization/ARIA/AX, assistive technology,
Core UI bridge and Electron integration are not signed off by this focused freeze.
