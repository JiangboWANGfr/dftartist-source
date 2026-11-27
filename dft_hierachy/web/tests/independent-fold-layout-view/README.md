# B97 §6.33 finite freeze

Normative source: DESIGN §6.33.1–.5, accepted by C97 at product/contract
`4ac3d21673573d0fbbfbbc9da86735226d1503aa` after C-107 closure.
No A consumer, implementation, diff or self-test supplies an oracle.

This is one finite increment, not a replacement freeze of §6.29–6.32.

| Existing agreed group                                                       | New frozen checks                         |
| --------------------------------------------------------------------------- | ----------------------------------------- |
| Display identity, geometry, native ELK restoration                          | FL02/03/09/11, FN01                       |
| Task/graph invalidation and owned resources                                 | FL04–08/10                                |
| Controlled fold, member/internal-edge details, exact selection/shared marks | FU01–04/08                                |
| Projection/task/old event and feedback fences                               | FU05–12                                   |
| Old types and old behavior                                                  | FL01/12, T01–24 plus untouched old suites |

`cases.mjs` supplies each runtime input, expected result and DESIGN basis.
The executable bodies supply the concrete DTO mutations, public calls and assertions.
`types.ts` has the legal consumer and 24 individually checked negative statements,
including the five C-107 direct/spread/variable/React entry counterexamples.
`types.mjs` removes suppression in memory and checks actual corresponding diagnostics;
missing production types block the 24 checks, never count them as passed/executed.

Reuse only: original B public SDK/GraphSession fixtures, pure-fold Schema7 input,
MessageGate, React/esbuild/Playwright, native ELK 0.12.0 Worker and public CSS.
No fake GraphSession, layout engine, projection or SchematicView. Controlled Worker
geometry is only a protocol fault/scheduling gate, not an ELK correctness oracle.
FN01 must use the shipped real Worker. It restores every original node/edge/member and
checks display endpoints plus raw immutable facts/owners, not former pixel positions.
FC01 is a legal-input control using original graph-mode native ELK and original DOM;
its pass is not a folded implementation pass.

## Run against one fixed product

First build that product's own declarations/assets using Node24 and its lockfile.
Do not borrow moving main-tree outputs. Set absolute paths, then run from this test tree:

```sh
export HIER_B_PRODUCT_ROOT=/absolute/fixed/product
N=/Users/jiangbowang/.npm-global/bin/node

"$N" --test web/tests/independent-fold-layout-view/runtime.test.mjs
"$N" web/tests/independent-fold-layout-view/types.mjs
"$N" web/tests/independent-fold-layout-view/types.mjs --proposal
"$N" web/tests/independent-fold-layout-view/run.mjs
"$N" web/tests/independent-fold-layout-view/run.mjs --native
"$N" web/tests/independent-fold-layout-view/run.mjs --controls
```

`--proposal` is compile-only preparation against the accepted isolated declaration,
not production acceptance. Optional `HIER_B_BROWSER_TOOLS` selects existing tooling,
not a replacement product. The browser runner uses an ephemeral local CSP server and
finally closes pages/browser/server, owned Workers, subscriptions and public models.

## Baseline and boundaries

At 4ac3d21 production has no folded mode. Initial results are recorded in the B plan:
FL12 original path passes; the other eleven Node cases fail their mode capability
assertion. Twelve DOM cases and FN01 likewise fail before folded semantic bodies.
Production types are blocked; proposal types and FC01 pass. No skip/xfail/fake pass.
Do not describe the later semantic assertions as executed until genuine production
exists and they actually run. Prior fixture setup faults are separately classified.

Keep all original pure-fold24/20/1, layout22/20/1, schematic12/20/16/1,
annotation22/20/10/1 inputs/oracles and historical failures. Standard-gate integration
belongs to A's production delivery; this freeze does not alter package/check.sh.
No Core/SDK/IPC/Schema/ABI/dependency/project-format change; persistence is out of scope.
This is not A17/full M6, combined demo/outside-view consumption, Electron IPC,
heap/benchmark/accessibility platform or remote CI completion.
