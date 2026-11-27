# B independent InstancePropertiesModel freeze

Oracle: C-approved DESIGN §6.9 and inherited §6.6.6, SHA749ff298… .
No A implementation, strict consumer or SDK/Core witness is used as oracle. The single reviewed
public declaration at68955ff is read as a Git blob only by the independent type compiler.
All runtime tests import actual production exports, use real HierClient and B's original public
Transport. No fake model, private scheduler, transport rewriting or new production hook.

Use Node24 and B's own fixed product/binary. No dependency installation or product files are written.

```sh
export HIER_B_PRODUCT_ROOT=/absolute/B/fixed/source
export HIER_BIN="$HIER_B_PRODUCT_ROOT/core/build/hier"
node web/tests/independent-properties/run.mjs --list
node web/tests/independent-properties/core-runtime.mjs --list
node web/tests/independent-properties/verify-inputs.mjs
node --unhandled-rejections=strict --test --test-reporter=tap web/tests/independent-properties/fixture-check.test.mjs web/tests/independent-properties/core-controls.test.mjs
node web/tests/independent-properties/verify-types.mjs proposal
node web/tests/independent-properties/verify-types.mjs production
node web/tests/independent-properties/run.mjs
node web/tests/independent-properties/core-runtime.mjs
```

`--list` enumerates each input, expected behavior, group and DESIGN basis without running semantics.
The default runtime gate must fail if Model/Error exports are missing, with planned count, zero
executed semantics and zero skips. It must not report every downstream assertion as executed/failed.
Types and Core-model capability failures are separate from lawful fixture/real SDK/Core controls.
Successful controls never count as successful InstancePropertiesModel implementation.

Public SDK method observations delegate original methods and retain original Promise/reply/error
identities. Query ordering, same-task signals and cached reload distinguish SDK calls from wire writes.
The constructor-error probe delegates the real public snapshot getter in the same invocation;
it does not assume two separate not-ready reads must throw the same Error object.
Getters/functions/cycles arrive in a real HierError through Transport.onClose, as in B's approved
original diagnostic controls; no client query method is replaced with a rejecting fake.
Unknown thrown values are compared using Object.is; not serialized or used in failure text.

No-op/error/cancel/dispose promises are observed locally for assertions; four plain child controls
separately discard original model promises with no global rejection listener to test L6 background
handling. This is NOT the still-unverified future L7 view-owned Promise consumption.
All held SDK/model work is disposed and owned test promises are settled in finally. Timeouts are
deadlock watchdogs, never product SLAs, cancellation timing substitutes or M7 budgets.

Core fixture independently fixes W=2/6, localparam/type parameter and an empty instance. It checks
widths and flags independently; model preservation is compared with the real SDK's original Reply
facts. Exact parameter-display spelling is deliberately not invented: Core returns text, not JS numbers.
Snapshot IDs differ on reopen; bare ObjectRef strings do not encode provenance and are not treated as
cross-snapshot proof. Unknown width=0/interface/multi preservation is separately covered with lawful
Schema inputs, not claimed as an unknown-blackbox real-Core run.

C-81/L02 files and all previous B inputs are untouched. No persistence/migration, Electron IPC,
React/PropertiesPanel, shared selection coordinator or UI release is implied. Product standard
entry points are not edited; A receives the independent freeze and can wire it without changing oracle.

The initial c3103c6 freeze had 252 runtime inputs and left disposed `subscribe` priority open.
C approved the narrow DESIGN §6.9.4 supplement on 2026-10-16. B independently adds 29 IP-S inputs:
12 active invalid listeners, 14 disposed valid/invalid listeners, disposal during notification/diagnostic
read, and old-unsubscribe/borrowed-SDK lifetime. The default runner now executes all 281 inputs;
the original 252 ID/input/expected/basis entries remain unchanged. Five Core model inputs and 22
type negatives are unchanged. IP-C01's constructor subscription baseline is separately corrected
at235d19d from a no-model counterexample on B's original SDK, not from A implementation output.
