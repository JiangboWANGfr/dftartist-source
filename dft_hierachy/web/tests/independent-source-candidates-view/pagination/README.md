# B33 C-95 pagination subset

Independent inputs from fixed 4d80e42 DESIGN §6.18.2 and §6.11.2. No A witness/test is an oracle.
Old 8529290 56 DOM/30 type inputs are unchanged; this adds 8 DOM cases, not full UI acceptance.

Use explicit HIER_B_PRODUCT_ROOT=<fixed checkout> and HIER_B_BROWSER_TOOLS=<that checkout>/web:

```sh
node web/tests/independent-source-candidates-view/pagination/run.mjs --list
node --test web/tests/independent-source-candidates-view/pagination/facility.test.mjs
node web/tests/independent-source-candidates-view/pagination/run.mjs --controls
node web/tests/independent-source-candidates-view/pagination/run.mjs
```

Controls use real public SDK/Navigation/Selection and a legal controlled Transport. They do not mount a replacement candidate UI.
The missing production export is a nonzero capability gate: planned8/executed0/passed0/blocked8/skip0.
Each enabled UI activation must call the original public command exactly once; blocked buttons must not call even a successful no-op.
Original page, next, completeness/reasons and semantic selection remain authoritative.

public-calls.mjs is the limited C32-accepted transparent call/return layer: receiver, original arguments, raw return/action/Promise and raw throw.
It never probes then, installs catch, changes return identity or proves Promise consumption. B32-Q1 remains open.
Native-await remains valid; no model/engine cross-realm substitution. Restoration failures are reported and later releases still attempted.
The browser's watchdog is only a test-facility bound, not a product timeout/performance proof.
No Core/Electron IPC, package/tarball/peer or complete M5 claim follows from these tests.
