# B34 observer restoration subset

Tests are independently derived from B33's existing descriptor/ownership restoration and cleanup failure reporting requirements.
The A issue is a trigger, not an oracle; no A probe is imported. All targets are local fault fixtures, not production-resource claims.

```sh
node --test --test-reporter=tap web/tests/independent-source-candidates-view/pagination/release/release.test.mjs
HIER_B_OBSERVER_ENTRY=<absolute old public-calls.mjs> node --test --test-reporter=tap web/tests/independent-source-candidates-view/pagination/release/release.test.mjs
```

cases.mjs defines input/expected/basis for 11 cases. The first 8 were frozen at ad3e749;
3 setup rollback cases were then appended before any helper repair, without changing the first 8 expectations.
Setup must retain the original arbitrary throw (including null), report all restoration errors, and continue restoring other methods.
Default entry is the sibling B helper;
explicit old entry replays the same frozen cases against unchanged baseline bytes.
No Promise then/catch or new candidate UI behavior is added.
Original B33 inputs and historical verification pins are unchanged; historical --inputs must be run in its old-byte tree.
Q1 remains open; only the issue's proposer can formally close A33-B-OBSERVER-01.
