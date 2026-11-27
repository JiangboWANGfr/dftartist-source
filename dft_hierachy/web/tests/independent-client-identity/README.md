# B public identity input freeze

Oracle: public DESIGN §5.6.5 cc4c0b0c86729718933c206ae0758e4917bbe50f6267aad50ee32e4d673c86a7
and declaration `isHierError(value: unknown): value is HierError`. This contract is
marked pending C in that snapshot; freezing/executing inputs is not C approval.
No A implementation, diff or selftest used. No private identity registry is inspected.

26 runtime inputs plus7 type negatives enumerate input/expected/basis with `--list`.
Actual same-module instances/subclasses (including frozen and hostile-field-accessor
instances) must recognize without fields/cause/prototype probes; unrelated primitive/
ordinary values must not become HierError DTOs. Real SDK Core/transport errors retain
old identity and constructor/instanceof behavior. Subclass static `is` is untouched.

Four opaque/wrapped/revoked/forged-prototype inputs assert boolean/no throw/no probe,
not a particular recognition result: the draft's "not guaranteed" wording is not
silently changed to required false or cross-copy identity. No cross-copy recognition
or foreign-constructor branding promise is invented. Return values are not DTO validation.

Use Node24 and explicit B fixed product root (no internal-file/proposal fallback):

```sh
HIER_B_PRODUCT_ROOT=/absolute/B/product node web/tests/independent-client-identity/run.mjs --list
HIER_B_PRODUCT_ROOT=/absolute/B/product node web/tests/independent-client-identity/run.mjs
HIER_B_PRODUCT_ROOT=/absolute/B/product node web/tests/independent-client-identity/verify-types.mjs
```

Missing export is a nonzero capability red, planned26/executed0/skip0, not26 semantic
failures. Public type positive must succeed before negatives. Existing Source306/14/34,
original S01/S02 and all historical archives are unchanged by this new input directory.
S01/S02 stage maintenance remains conditional on the actual C decision.

2026-10-16 C-ORCH-6 incremental decision now approves that exact API contract.
The original26/7 expectations remain unchanged. B separately maintains active
S01/S02 for this reviewed epoch and archives both original input files verbatim;
approval is cited from REVIEW_LOG, not inferred from the implementation passing.
