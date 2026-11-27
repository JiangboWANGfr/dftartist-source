# B tree view acceptance preparation

This is B-M5-TREE-VIEW-PREP-01, **not** the final React/browser freeze.
The authoritative specification remains DESIGN 6.7. proposal.d.ts is the exact
public 8da9bd8 declaration snapshot, not an implementation or a substitute
production package. No A prototype or A consumer is imported by these tests.

See the [acceptance matrix](../../../docs/M5_B_TREE_VIEW_ACCEPTANCE.md) and
[execution plan](../../../docs/plans/B-M5-tree-view.md).

Use Node 24 and an independently built fixed product:

```sh
export HIER_B_PRODUCT_ROOT=/absolute/path/to/your/fixed/product
export HIER_B_REACT_TYPES=/absolute/path/to/pinned/@types/react/index.d.ts

node web/tests/independent-tree-view/verify-tree-view-types.mjs proposal
node web/tests/independent-tree-view/verify-tree-view-types.mjs production
node web/tests/independent-tree-view/production-capability.mjs
node --unhandled-rejections=throw --test --test-reporter=tap web/tests/independent-tree-view/public-model-boundaries.test.mjs
```

Run from the test checkout's repository root. HIER_B_PRODUCT_ROOT defaults to
that checkout. HIER_B_REACT_TYPES may be omitted once real React declarations
are installed in that product's web workspace. The compiler is resolved from
the selected product, never from an unrelated global installation.

The type verifier checks all 46 markers after removing the directives in
memory and rejects missing/unrelated diagnostics. It uses strict mode,
exactOptionalPropertyTypes, noUncheckedIndexedAccess, skipLibCheck=false,
and noEmit. Only proposal mode substitutes the public declaration; production
mode always targets the real @hier/views/dist declaration. Numeric ranges,
blank labels, snapshot binding and disposal require runtime validation:
passing number/string types does not validate those values.

The fixed pre-UI baseline exports only VIEWS_PROTOCOL_VERSION. Thus production
capability and type checks intentionally exit nonzero: four missing API
exports cause cascading type diagnostics. These are not 46 executed failing
UI tests, and no fake UI or skip/xfail is installed to make them pass.
The four public-model tests are real SDK/L6 facts supporting Q01/Q03; they
do not exercise React, DOM, browser, Core, or Electron.

Original B fixtures and all previous frozen tests remain unchanged.
A future C-approved contract may require a separately recorded update; do
not silently overwrite this snapshot or call this preparation a UI sign-off.
