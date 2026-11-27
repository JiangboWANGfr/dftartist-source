# B SourceDocumentModel independent freeze

Oracle: approved DESIGN §6.10, inherited §6.9.3/4 and §6.6.6, Core §5.5.6,
public protocol2/schema7 and isolated declaration. No A implementation, diff,
Source witness, fixture or selftest used. Shared summaries were read: not strictly blind.

Public production entry is the existing L6 package `@hier/viewmodel` (DESIGN §6.3
and its public index), with `@hier/client` and `@hier/client/node`. There is no
private-file or proposal fallback in runtime or production typing.

## Acceptance and coverage

`run.mjs --list`, `run.mjs --core --list`, `verify-types.mjs --list` enumerate
every ID, input, expected result and normative basis before any model execution.

| Input group                     | Planned | Observable correctness                                                                                                                                                           |
| ------------------------------- | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinates                     |      73 | Hand-calculated UTF-8/UTF-16 ranges, tab/BMP/emoji/combining/BOM, CRLF/CR/LF, empty/EOF, reject scalar/CRLF interior and inconsistent positions                                  |
| Versions                        |       8 | Reversed span even when changed; hash/boolean contradictions; changed-to-empty/out-of-range old span; never rehash text                                                          |
| Input                           |      32 | Primitive ref/kind, no probes/coercion/prefix parsing; public nonempty text including whitespace/NUL; invalid call preserves old task/data                                       |
| Ownership                       |      13 | Snapshot/readiness, constructor no queries/subscriptions, borrowed SDK and other consumers, fixed/new snapshot, closed SDK old snapshot                                          |
| Queries                         |      12 | FileRef not path, source then read, original SDK Reply/completeness/extensions, atomic state, original errors/illegal partial                                                    |
| Tasks                           |      27 | Join/no-op/retry/reload/kind changes; cancel/clear/replacement, queued stale continuation at each stage                                                                          |
| Dispose                         |      11 | Priority, no cause when none, all notification phases, own cancel/clear command                                                                                                  |
| Notifications                   |      30 | No replay, independent tokens, order, off/new registration, reentrancy, aggregation/cause, returned Promise not awaited, no unhandled command rejection                          |
| Diagnostics                     |      96 | Exact inspect/enumerate/read paths, falsy/opaque throws, getters/Proxy, cycles/functions/holes, once capture, read-stage reentry/dispose                                         |
| Explicit public fault injection |       4 | Decorate real public SDK method Promise to throw non-HierError; model inconsistent_reply/cause, not ordinary SDK/Core behavior                                                   |
| Real model→SDK→Node→Core        |      14 | Independent included Unicode/BOM/CRLF SV, definition/instantiation/statement/multiple instances, edit/empty/restore/delete/invalid UTF-8/new snapshot and actual process cleanup |
| Type negatives                  |      34 | Public positive consumer first; readonly/discriminated unions, original Reply/ResultOf, exactOptionalPropertyTypes, invalid calls/fields                                         |

Controlled runtime total **306**, real chain **14** (separate); types are not runtime counts.
The two-stage fixture observes public calls and their real SDK Promises. It does not
require wire request count to equal SDK call count or fixture input identity to equal
SDK Reply identity. No fake model/SDK or private product hooks.

`positions.mjs` contains literal hand calculations; `facility.test.mjs` independently
checks literal byte/UTF-16 prefixes, Schema-positive positions (including semantic
negative inputs), real SDK response/error identity and all inventories. These six
facility tests are not Source model acceptance. `source-fixture.mjs` is independent
B HDL text; exact Core ranges come from unique fixture literals, never actual output.

## Run

Use Node24, B's fixed independent product checkout, own installed dependencies and
fresh TypeScript build. Run from this B test tree:

```sh
HIER_B_PRODUCT_ROOT=/absolute/B/product node web/tests/independent-source-document/run.mjs --list
HIER_B_PRODUCT_ROOT=/absolute/B/product node --test web/tests/independent-source-document/facility.test.mjs
HIER_B_PRODUCT_ROOT=/absolute/B/product node web/tests/independent-source-document/verify-types.mjs --proposal
HIER_B_PRODUCT_ROOT=/absolute/B/product node web/tests/independent-source-document/run.mjs
HIER_B_PRODUCT_ROOT=/absolute/B/product HIER_BIN=/absolute/B/product/core/build-b-review/hier node web/tests/independent-source-document/run.mjs --core
HIER_B_PRODUCT_ROOT=/absolute/B/product node web/tests/independent-source-document/verify-types.mjs
```

`--proposal` explicitly redirects only the consumer to approved isolated declarations;
the declaration's own TreeDiagnosticIssue still resolves the real public package.
It never reports production type success. Missing runtime export gives nonzero,
planned306/14, executed0, skipped0. Missing public positive types means negative
executed0, not 34 passing negatives. Core is not spawned until model and own fixed-tree
binary capability checks pass. B watchdog is a deadlock guard, not product SLA.

## Unspecified or outside black-box acceptance

- **BD-SOURCE-01 (narrow timing):** inherited cancel/clear text does not uniquely order
  old load settlement relative to the command's own notification. If that notification
  disposes, its own command must reject disposed. The old load is exactly once cancelled
  or disposed; disposed preserves the cancelled cause. Two inputs freeze only these
  guarantees, not one assumed scheduling choice. A/C can clarify this narrow boundary
  without blocking the other Source inputs or replacing the oracle with implementation.
- One sequential scan/no per-byte index needs implementation review, not black-box time
  thresholds. No performance/large-file budget, real browser/SourceView, reverse
  source.resolve/candidate/Selection coordination, Electron main/preload/IPC/UI/AX,
  L06/L09–11, Linux or remote CI acceptance is claimed.
- Core UTF-8 cannot produce lone JS surrogates; the public JSON Text type can represent
  them. No guessed lone-surrogate normalization policy is frozen here.
- Current product has no project/session persistence. Creation/save/recovery/old-format
  migration from the generic task checklist are not silently added to this new project.

Existing Tree/Selection/Properties/renderer sources, inventories and historical red
archives are retained. Any later shared lifecycle/diagnostic extraction must run their
original regression gates; passing this new consumer alone does not prove no regression.
