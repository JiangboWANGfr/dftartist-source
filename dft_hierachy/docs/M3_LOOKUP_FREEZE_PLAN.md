# Agent B — lookup increment freeze

Normative source: DESIGN SHA-256 487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0, §§5.5.1, 5.5.5, 5.5.7 and public Design/Lookup/Result headers. Mandatory REVIEW_LOG contains A's handoff; this is independent testing, not a strictly blind review. No implementation, diff, A test code or execution plan used to choose expected results.

Freeze before running ec23459. Previous fixed product 2a58463 is the red baseline: lookup methods absent; diagnostic negatives previously 1 pass / 2 fail. Keep original 76 CLI methods, original 15 API cases and D-01 future cases unchanged. A dedicated lookup-only API target avoids compiling unrelated unimplemented trace/source types, without marking those old cases accepted.

## Inputs, expected results and basis

- Existing lookup.sv: 136 hits (definition4/instance13/port37/signal49/process22/register11), leaf occurrence11, unused0. Same Design concatenate pages at limits1/7/11, no missing/repeated refs, deterministic kind/reference order; cold/hot, shared/per-instance, cache0/64MiB equivalence. Count is derived from fixture, not full-query output; full-query comparison is only the pagination metamorphic check.
- Scope alpha.u_extra: definition1/instance1/port3/signal4/process2/register1 = 12. Empty kinds returns none, omitted all; kind order/duplicates normalize identically. Cursor binds raw text, kind set, scope, method and snapshot, not page size. Changed params bad_request; different snapshot stale_cursor; malformed cursor bad_request.
- New lookup_edges.sv: tops2, leaf12, blackbox3, primitive3 =20 instances; six definitions incl unused. instancesOf must return each occurrence once, including roots and absent/buf, unused complete empty. Four grid and four escaped-name multidimensional elements have indices (0,1)×(-2,-1), plus a distinct escaped literal grid[1][-1]. Resolve every child pathText back to its ref, and independently resolve typed names against M1 slot order; escaped literal and actual array remain distinct. Valid nonexistent indices empty complete; malformed array/escape bad_request; no arbitrary suffix fallback.
- Old children and new search --limit: positive1 returns one; zero, negative, nonnumeric, trailing junk, fraction and huge overflow bad_request. Sign/leading-zero spellings beyond the documented grammar are not guessed as errors.
- Cancellation: valid pre-cancelled search/instancesOf/resolvePath returns Cancelled without result. Retry a cancelled page using the original cursor equals uncancelled page and preserves next; then paginate all pages. Run cold/hot and zero cache. This demonstrates pre-cancel recovery, NOT deterministic execution-in-progress cancellation, cost bounds, half-index publication or resource peak. Such adapters require C review and remain pending.
- Ownership: copy ObjectHit/InstInfo pages, close Design and read copied values; sanitizer exercises lifetime, not a proof of all task/file resource release.

## Limits / ambiguity

No private hooks, timing races, sleeps, skip or xfail. No invariant for undocumented precedence between simultaneous invalid arguments and cancellation. No machine JSON Schema/TS authority delivered yet (M4); schemaVersion3/protocol2 observations are not cross-language validation. IPC/UI, persistent project files, true timeout/concurrency, index cost/eviction and deterministic in-flight cancellation remain unexecuted future milestones. Search full completeness for absent-cell pins is not inferred from valid instance/definition lookup.

Commands/evidence and independent commit hashes will be recorded in the verification report and main REVIEW_LOG after the run; retain all first failures and any necessary build-only adapters.

## B premise correction / second freeze

Initial freeze a36cf38 ran 42 CLI methods successfully on ec23459. Lookup API initially 4 pass / 1 fail, 9713 successful /16 failed assertions: search(text="edge_a") correctly matches every descendant's pathText as well as root, so it is not an exact definition filter. This is a B test error, not a product defect. Correct the comparison to search all instance hits then select their **public def field** equal to the chosen DefRef; manual counts12/3/3/1/1/0 and all pagination/cursor assertions remain unchanged. The normative basis is the existing §5.5.5 name/pathText matching rule, not implementation inspection. Preserve first result in machine evidence, commit correction before re-running the final oracle. On 2a58463 the corrected API still cannot compile (lookup types/methods absent); CLI fixture was parsed successfully before missing commands. No original tests/fixtures altered.
