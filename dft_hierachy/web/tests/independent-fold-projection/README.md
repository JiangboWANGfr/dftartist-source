# B93 folded projection freeze

Normative oracle: DESIGN §6.32 (C92 accepted), original B87 handwritten fixtures and public types.
24 model/integration cases, each input/expected/basis in cases.mjs; types.ts has independent
strict positive/negative witnesses. Runtime never falls back to proposal or substitutes a model.

From repository root (Node24), with a privately built fixed product P:

```sh
HIER_B_PRODUCT_ROOT="$P" node --test web/tests/independent-fold-projection/runtime.test.mjs
HIER_B_PRODUCT_ROOT="$P" node web/tests/independent-fold-projection/types.mjs
HIER_B_PRODUCT_ROOT="$P" node web/tests/independent-fold-projection/types.mjs --proposal
HIER_B_PRODUCT_ROOT="$P" node --test web/tests/independent-fold-projection/control.test.mjs
```

--proposal compiles the reviewed declaration only, is explicit, and cannot turn missing runtime green.
A missing production symbol fails each capability check before semantic execution (not skip/xfail).
control.test.mjs exercises the same legal inputs on real original graph/selection/projection/annotations.
Original schematic model/types regressions are run unchanged; they do not prove new fold behavior.
No new UI/Worker/ELK/heap/clock/observer facility. Real fold layout, view generation fencing,
native ELK and A17 remain later production acceptance, not satisfied by SDK or these pure L6 tests.
See docs/plans/B-M6-fold-projection-validation.md for fixed commits, commands, failures and limitations.
