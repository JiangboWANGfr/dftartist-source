# Historical pre-identity pure-refactor baseline

`pre-identity/compatibility.test.mjs` and `realm-controls.mjs` are byte-for-byte
copies of B 4dafc5555e9e6b73bb1b31b3ad23a0f7c6e01133, not reformatted.
They preserve original S01/S02 exact three-export/381-byte main declaration pins,
all other original controls, and the original frozen Git commits/evidence remain.
Original basis: B pure shared-transport refactor, not a permanent prohibition of
future reviewed compatible API additions. See M5_B_SHARED_TRANSPORT_REVERIFY.

The active file now targets C-ORCH-6's 2026-10-16 approved §5.6.5 addition:
main exports exactly old three plus isHierError, node still exactly one;
old consumers/constructor/subclass and new unknown type predicate compile,
seven explicit negatives are rejected; node/index.d.ts still587 bytes/same old hash.
No freshly observed main artifact hash is made into the new correctness oracle.
S03–S09 input code and expected values are unchanged. No test is skipped/deleted.

Historical run (Node24 and explicit OLD fixed product; not current acceptance):

```sh
HIER_B_PRODUCT_ROOT=/absolute/B/old-product node --test --test-reporter=tap web/tests/independent-transport-sharing/history/pre-identity/compatibility.test.mjs
```

The active suite is for the reviewed identity epoch; old archived sources should
not be imported as extra cases in the current default standard gate or counted
twice. Do not rewrite old archives or historical verifier pins for a new HEAD.
